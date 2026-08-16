import { execFile } from 'node:child_process';
import net from 'node:net';
import { simpleParser } from 'mailparser';
import { chromium, type Browser, type BrowserContext, type Frame, type Locator, type Page, type Response } from 'playwright';
import type { AccountInput, CodeMatch, EmailItem } from '../../shared/types.js';
import { extractVerificationCode } from '../../shared/verification-code.js';
import { InboxMateError } from '../errors.js';
import type { FetchAccountOptions, FetchAccountResult } from '../imap-client.js';

const MAIL_COM_HOME = 'https://www.mail.com';
const NAVIGATION_TIMEOUT_MS = 30_000;
const MAIL_LIST_TIMEOUT_MS = 45_000;
const BODY_FETCH_BUDGET_MS = 30_000;
const BODY_FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 512 * 1024;
const WINDOWS_PROXY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const LOCAL_PROXY_PORTS = [7897, 7890, 10809, 10808, 7891] as const;
export const MAIL_COM_LOGIN_TRIGGER_SELECTOR = [
  'a.button.button-login[href="homepage.html#navlogin"]',
  '#login-button'
].join(', ');

let sharedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let lastNetworkLog = '';

interface ProxyResolution {
  server?: string;
  source: 'direct' | 'environment' | 'windows-system' | 'local-port';
}

export interface CapturedMailPayload {
  id: string;
  subject: string;
  from: string;
  receivedAt: Date;
  snippet: string;
  body: string;
  htmlBody?: string;
}

interface MailComRawData {
  attribute?: Record<string, unknown>;
  mailHeader?: Record<string, unknown>;
  mailURI?: unknown;
  snippet?: unknown;
  preview?: unknown;
  body?: unknown;
}

function runRegQuery(valueName: string): Promise<string> {
  return new Promise((resolve) => {
    execFile(
      'reg.exe',
      ['query', WINDOWS_PROXY_KEY, '/v', valueName],
      { encoding: 'utf8', timeout: 1500, windowsHide: true },
      (error, stdout) => resolve(error ? '' : stdout)
    );
  });
}

function normalizeProxyUrl(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (/^(direct|none|off)$/i.test(trimmed)) return undefined;

  const withProtocol = /^[a-z][a-z\d+.-]*:\/\//i.test(trimmed) ? trimmed : `http://${trimmed}`;
  try {
    const parsed = new URL(withProtocol);
    if (!parsed.hostname || !parsed.port) return undefined;
    if (!['http:', 'https:', 'socks5:', 'socks4:'].includes(parsed.protocol)) return undefined;
    return parsed.toString().replace(/\/$/, '');
  } catch {
    return undefined;
  }
}

export function parseWindowsProxyServer(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;

  if (!trimmed.includes('=')) return normalizeProxyUrl(trimmed);

  const entries = new Map(
    trimmed
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf('=');
        return separator > 0
          ? [entry.slice(0, separator).trim().toLowerCase(), entry.slice(separator + 1).trim()]
          : ['', entry];
      })
  );
  return normalizeProxyUrl(entries.get('https') ?? entries.get('http') ?? entries.get('socks'));
}

async function readWindowsSystemProxy(): Promise<string | undefined> {
  if (process.platform !== 'win32') return undefined;

  const [enabledOutput, serverOutput] = await Promise.all([runRegQuery('ProxyEnable'), runRegQuery('ProxyServer')]);
  if (!/ProxyEnable\s+REG_DWORD\s+0x1\b/i.test(enabledOutput)) return undefined;

  const match = serverOutput.match(/ProxyServer\s+REG_SZ\s+([^\r\n]+)/i);
  return parseWindowsProxyServer(match?.[1]);
}

async function probePort(host: string, port: number, timeoutMs = 1000): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let settled = false;
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
  });
}

async function probeHttpProxy(proxyServer: string): Promise<boolean> {
  let proxy: URL;
  try {
    proxy = new URL(proxyServer);
  } catch {
    return false;
  }

  const port = Number.parseInt(proxy.port, 10);
  if (!port) return false;
  if (proxy.protocol !== 'http:') return probePort(proxy.hostname, port);

  return new Promise((resolve) => {
    const socket = net.createConnection({ host: proxy.hostname, port });
    let settled = false;
    let response = '';
    const finish = (result: boolean): void => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(2500);
    socket.once('connect', () => {
      socket.write('CONNECT www.mail.com:443 HTTP/1.1\r\nHost: www.mail.com:443\r\nConnection: close\r\n\r\n');
    });
    socket.on('data', (chunk) => {
      response += chunk.toString('latin1');
      const firstLineEnd = response.indexOf('\r\n');
      if (firstLineEnd >= 0) {
        finish(/^HTTP\/\d(?:\.\d)?\s+2\d\d\b/i.test(response.slice(0, firstLineEnd)));
      }
    });
    socket.once('error', () => finish(false));
    socket.once('timeout', () => finish(false));
    socket.once('end', () => finish(false));
  });
}

async function detectRpaProxy(): Promise<ProxyResolution> {
  const explicit = process.env.RPA_PROXY?.trim();
  if (explicit && /^(direct|none|off)$/i.test(explicit)) return { source: 'direct' };

  const environmentProxy = normalizeProxyUrl(
    explicit || process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY
  );
  if (environmentProxy) return { server: environmentProxy, source: 'environment' };

  // Overseas deployments are normally Linux hosts and should remain direct unless configured explicitly.
  if (process.platform !== 'win32') return { source: 'direct' };

  const systemProxy = await readWindowsSystemProxy();
  if (systemProxy && (await probeHttpProxy(systemProxy))) {
    return { server: systemProxy, source: 'windows-system' };
  }

  for (const port of LOCAL_PROXY_PORTS) {
    const server = `http://127.0.0.1:${port}`;
    if (server !== systemProxy && (await probeHttpProxy(server))) {
      return { server, source: 'local-port' };
    }
  }
  return { source: 'direct' };
}

function logNetworkResolution(resolution: ProxyResolution): void {
  const current = `${resolution.source}:${resolution.server ?? 'direct'}`;
  if (current === lastNetworkLog) return;
  lastNetworkLog = current;
  console.info(`[web-rpa] network=${resolution.server ?? 'direct'} source=${resolution.source}`);
}

let browserUsageCount = 0;
const MAX_BROWSER_RECYCLE_USAGE = 20;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) {
    browserUsageCount += 1;
    if (browserUsageCount >= MAX_BROWSER_RECYCLE_USAGE) {
      const oldBrowser = sharedBrowser;
      sharedBrowser = null;
      browserPromise = null;
      browserUsageCount = 0;
      void oldBrowser.close().catch(() => {});
    } else {
      return sharedBrowser;
    }
  }
  if (browserPromise) return browserPromise;

  browserPromise = (async () => {
    try {
      const browser = await chromium.launch({
        headless: true,
        args:
          process.platform === 'linux'
            ? ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
            : []
      });
      sharedBrowser = browser;
      browserUsageCount = 1;
      browser.once('disconnected', () => {
        if (sharedBrowser === browser) sharedBrowser = null;
        browserPromise = null;
        browserUsageCount = 0;
      });
      return browser;
    } catch (error) {
      browserPromise = null;
      browserUsageCount = 0;
      throw new InboxMateError(
        'CONNECTION_FAILED',
        500,
        `无法启动无头浏览器: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  })();

  return browserPromise;
}

export async function closeSharedBrowser(): Promise<void> {
  const browser = sharedBrowser;
  sharedBrowser = null;
  browserPromise = null;
  browserUsageCount = 0;
  if (browser) await browser.close().catch(() => {});
}


function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : value === undefined || value === null ? '' : String(value).trim();
}

function asDate(value: unknown): Date {
  const date = typeof value === 'number' ? new Date(value) : new Date(asString(value));
  return Number.isNaN(date.getTime()) ? new Date() : date;
}

function normalizeMailId(value: unknown): string {
  const raw = asString(value);
  const match = raw.match(/(?:^|\/)Mail\/(\d+)(?:\/|$)/i) ?? raw.match(/(\d{8,})/);
  return match?.[1] ?? raw;
}

function parseModernMailList(json: Record<string, unknown>): CapturedMailPayload[] {
  if (!Array.isArray(json.mailListElements)) return [];

  const result: CapturedMailPayload[] = [];
  for (const element of json.mailListElements) {
    const raw = asRecord(asRecord(element)?.rawData) as MailComRawData | undefined;
    if (!raw) continue;

    const attribute = asRecord(raw.attribute);
    const header = asRecord(raw.mailHeader);
    const id = normalizeMailId(attribute?.mailIdentifier ?? raw.mailURI);
    const subject = asString(header?.subject);
    const from = asString(header?.from);
    const snippet = asString(raw.snippet ?? raw.preview);
    const body = asString(raw.body);
    if (!id && !subject && !from) continue;

    result.push({
      id: id || `${asString(header?.messageId)}-${result.length}`,
      subject,
      from,
      receivedAt: asDate(header?.date ?? attribute?.internalDate),
      snippet,
      body
    });
  }
  return result;
}

function parseLegacyMessages(value: unknown, result: CapturedMailPayload[]): void {
  if (Array.isArray(value)) {
    for (const child of value) parseLegacyMessages(child, result);
    return;
  }

  const object = asRecord(value);
  if (!object) return;

  if (Array.isArray(object.messages)) {
    for (const entry of object.messages) {
      const message = asRecord(entry);
      if (!message) continue;
      const fromObject = asRecord(message.from);
      const from = fromObject
        ? asString(fromObject.displayName)
          ? `${asString(fromObject.displayName)} <${asString(fromObject.emailAddress)}>`
          : asString(fromObject.emailAddress)
        : asString(message.from);
      const subject = asString(message.subject);
      const snippet = asString(message.snippet ?? message.preview);
      const body = asString(message.body) || snippet;
      const id = normalizeMailId(message.id ?? message.mailIdentifier ?? message.messageId);
      if (!id && !subject && !snippet) continue;
      result.push({
        id: id || `${subject}-${result.length}`,
        subject,
        from,
        receivedAt: asDate(message.receiveDate ?? message.sendDate ?? message.date),
        snippet,
        body
      });
    }
    return;
  }

  for (const child of Object.values(object)) parseLegacyMessages(child, result);
}

export function parseMailComListPayload(json: unknown): CapturedMailPayload[] {
  const object = asRecord(json);
  if (!object) return [];

  const result = parseModernMailList(object);
  if (result.length === 0) parseLegacyMessages(object, result);

  const unique = new Map<string, CapturedMailPayload>();
  for (const mail of result) {
    const key = mail.id || `${mail.subject}\u0000${mail.receivedAt.toISOString()}`;
    if (!unique.has(key)) unique.set(key, mail);
  }
  return [...unique.values()];
}

function mergeCapturedMails(target: CapturedMailPayload[], incoming: CapturedMailPayload[]): void {
  for (const mail of incoming) {
    const existing = target.find((candidate) => candidate.id === mail.id);
    if (existing) Object.assign(existing, mail);
    else target.push(mail);
  }
}

function isMailListResponse(response: Response): boolean {
  const url = response.url().toLowerCase();
  return (
    url.includes('maillist.mail.com/mailbox/mail') ||
    url.includes('webmail-cats') && (url.includes('/messages') || url.includes('/mails/'))
  );
}

function isCaptchaPage(content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    normalized.includes('attention required!') ||
    normalized.includes('verify you are human') ||
    normalized.includes('cf-chl-captcha') ||
    normalized.includes('g-recaptcha')
  );
}

function isAuthenticationFailure(url: string, content: string): boolean {
  const normalized = content.toLowerCase();
  return (
    /\/logout\/?\?ls=(?:wd|te)/i.test(url) ||
    normalized.includes('invalid credentials') ||
    normalized.includes('incorrect login or password') ||
    normalized.includes('wrong password') ||
    normalized.includes('please check your email address and password')
  );
}

async function loginFieldsAreVisible(emailInput: Locator, passwordInput: Locator): Promise<boolean> {
  const [emailVisible, passwordVisible] = await Promise.all([
    emailInput.isVisible().catch(() => false),
    passwordInput.isVisible().catch(() => false)
  ]);
  return emailVisible && passwordVisible;
}

export async function ensureMailComLoginFormVisible(
  page: Page
): Promise<{ emailInput: Locator; passwordInput: Locator }> {
  const emailInput = page.locator('#login-email');
  const passwordInput = page.locator('#login-password');
  if (await loginFieldsAreVisible(emailInput, passwordInput)) return { emailInput, passwordInput };

  const loginTrigger = page.locator(MAIL_COM_LOGIN_TRIGGER_SELECTOR).filter({ visible: true }).first();
  await loginTrigger.waitFor({ state: 'visible', timeout: 10_000 });

  for (let attempt = 0; attempt < 3; attempt += 1) {
    await loginTrigger.click({ timeout: 10_000 });
    const formVisible = await Promise.all([
      emailInput.waitFor({ state: 'visible', timeout: 4000 }),
      passwordInput.waitFor({ state: 'visible', timeout: 4000 })
    ])
      .then(() => true)
      .catch(() => false);
    if (formVisible && (await loginFieldsAreVisible(emailInput, passwordInput))) {
      return { emailInput, passwordInput };
    }
    if (attempt < 2) await page.waitForTimeout(500);
  }

  throw new InboxMateError('TIMEOUT', 400, 'Mail.com 登录框未能显示账号和密码输入框。');
}

async function parseMailboxDom(page: Page): Promise<CapturedMailPayload[]> {
  const frame = page.frames().find((candidate) => candidate.url().startsWith('https://webmailer.mail.com/'));
  if (!frame) return [];

  const items = frame.locator('list-mail-item');
  const count = await items.count().catch(() => 0);
  const result: CapturedMailPayload[] = [];
  for (let index = 0; index < count; index += 1) {
    const item = items.nth(index);
    const id = normalizeMailId((await item.getAttribute('id').catch(() => ''))?.replace(/^id/, ''));
    const subject = (await item.locator('.list-mail-item__subject').innerText().catch(() => '')).trim();
    const from = (await item.locator('.list-mail-item__sender').getAttribute('title').catch(() => '')) ||
      (await item.locator('.list-mail-item__sender').innerText().catch(() => ''));
    const dateTitle = await item.locator('list-date-label').getAttribute('title').catch(() => null);
    const dateText = await item.locator('list-date-label').innerText().catch(() => '');
    if (!id && !subject) continue;
    result.push({
      id: id || `${subject}-${index}`,
      subject,
      from: from.trim(),
      receivedAt: asDate(dateTitle?.replace(/\s+at\s+/i, ' ') || dateText),
      snippet: subject,
      body: ''
    });
  }
  return result;
}

async function htmlToText(html: string): Promise<string> {
  const source = Buffer.concat([
    Buffer.from('Content-Type: text/html; charset=utf-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n', 'utf8'),
    Buffer.from(html, 'utf8')
  ]);
  const parsed = await simpleParser(source, { skipHtmlToText: false, skipImageLinks: true });
  return (parsed.text ?? '').replace(/\u0000/g, ' ').trim().slice(0, MAX_BODY_BYTES);
}

async function findWebmailerFrame(page: Page, timeoutMs: number): Promise<Frame | undefined> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const frame = page.frames().find((candidate) => candidate.url().startsWith('https://webmailer.mail.com/'));
    if (frame && (await frame.locator('list-mail-item').count().catch(() => 0)) > 0) return frame;
    await page.waitForTimeout(250);
  }
  return undefined;
}

async function fetchBodyViaApi(
  page: Page,
  mail: CapturedMailPayload,
  accessTokens: readonly string[],
  noCacheKey: string,
  timeoutMs: number
): Promise<string | undefined> {
  const url =
    `https://mailcom.mailbody-ui.de/Mail/${mail.id}/Body/html` +
    `?target_origin=${encodeURIComponent('https://webmailer.mail.com')}` +
    (noCacheKey ? `&no_cache=${encodeURIComponent(noCacheKey)}` : '');

  const deadline = Date.now() + timeoutMs;
  for (const accessToken of [...accessTokens].reverse().slice(0, 8)) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    try {
      const response = await page.context().request.post(url, {
        form: { access_token: accessToken },
        headers: {
          Origin: 'https://webmailer.mail.com',
          Referer: 'https://webmailer.mail.com/'
        },
        timeout: Math.max(250, Math.min(3000, remaining))
      });
      if (response.ok()) {
        const html = (await response.text()).slice(0, MAX_BODY_BYTES);
        if (/<(?:html|body)\b/i.test(html)) return html;
      }
    } catch {
      // Try the next token. Mail.com issues separate tokens for each webmail component.
    }
  }
  return undefined;
}

async function hydrateMailBodies(
  page: Page,
  mails: CapturedMailPayload[],
  signal: AbortSignal,
  getAccessTokens: () => readonly string[],
  getNoCacheKey: () => string
): Promise<void> {
  if (mails.length === 0 || signal.aborted) return;
  const frame = await findWebmailerFrame(page, 5000);
  const accessTokens = getAccessTokens();
  const noCacheKey = getNoCacheKey();

  // Fast path: Parallel direct API body hydration across all target emails
  if (accessTokens.length > 0) {
    await Promise.all(
      mails.map(async (mail) => {
        if (signal.aborted || !/^\d+$/.test(mail.id)) return;
        try {
          const html = await fetchBodyViaApi(page, mail, accessTokens, noCacheKey, 4000);
          if (html) {
            const text = await htmlToText(html);
            mail.htmlBody = html;
            mail.body = text;
            mail.snippet = text.replace(/\s+/g, ' ').slice(0, 300) || mail.snippet || mail.subject;
          }
        } catch {
          // Fallback handled below if still empty
        }
      })
    );
  }

  // Fallback for any mails that didn't resolve via fast API path
  const remainingMails = mails.filter((m) => !m.htmlBody && !m.body);
  if (remainingMails.length === 0 || !frame || signal.aborted) return;

  const deadline = Date.now() + 15_000;
  for (const mail of remainingMails) {
    if (signal.aborted || Date.now() >= deadline || !/^\d+$/.test(mail.id)) break;

    const item = frame.locator(`[id="id${mail.id}"]`);
    if ((await item.count().catch(() => 0)) === 0) continue;

    const remaining = deadline - Date.now();
    const timeout = Math.max(500, Math.min(BODY_FETCH_TIMEOUT_MS, remaining));

    const bodyResponse = page.waitForResponse(
      (response) => response.status() === 200 && response.url().includes(`/Mail/${mail.id}/Body/html`),
      { timeout }
    );

    try {
      await item.scrollIntoViewIfNeeded({ timeout: Math.min(timeout, 1500) });
      await item.click({ timeout: Math.min(timeout, 2000) });
      const response = await bodyResponse;
      const html = (await response.text()).slice(0, MAX_BODY_BYTES);
      const text = await htmlToText(html);
      mail.htmlBody = html || undefined;
      mail.body = text;
      mail.snippet = text.replace(/\s+/g, ' ').slice(0, 300) || mail.snippet || mail.subject;
    } catch {
      void bodyResponse.catch(() => {});
    }
  }
}

export function selectMailComMessages(
  mails: CapturedMailPayload[],
  options: Pick<FetchAccountOptions, 'lookbackMinutes' | 'maxMessages'>
): CapturedMailPayload[] {
  const threshold = options.lookbackMinutes > 0 ? Date.now() - options.lookbackMinutes * 60_000 : undefined;
  return mails
    .filter((mail) => threshold === undefined || mail.receivedAt.getTime() >= threshold)
    .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
    .slice(0, Math.max(0, options.maxMessages));
}

function mapResult(account: AccountInput, mails: CapturedMailPayload[]): FetchAccountResult {
  const items: EmailItem[] = mails.map((mail) => {
    const textBody = mail.body || mail.snippet || '';
    const codeMatch = extractVerificationCode({
      subject: mail.subject,
      text: textBody,
      receivedAt: mail.receivedAt,
      from: mail.from
    });
    return {
      id: `mailcom-${mail.id}`,
      accountEmail: account.email,
      provider: account.provider,
      subject: mail.subject || '(无主题)',
      from: mail.from || 'Mail.com Service',
      receivedAt: mail.receivedAt.toISOString(),
      snippet: mail.snippet || textBody.replace(/\s+/g, ' ').slice(0, 300) || mail.subject,
      textBody: textBody || undefined,
      htmlBody: mail.htmlBody,
      codeMatch
    };
  });

  const matches = items.map((item) => item.codeMatch).filter((match): match is CodeMatch => Boolean(match));
  matches.sort(
    (left, right) => right.score - left.score || Date.parse(right.receivedAt) - Date.parse(left.receivedAt)
  );
  return { messages: items, primaryCode: matches[0] };
}

function classifyBrowserError(error: unknown, stage: string, proxy: ProxyResolution): InboxMateError {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();
  if (
    normalized.includes('err_proxy') ||
    normalized.includes('err_tunnel_connection_failed') ||
    normalized.includes('proxy connection') ||
    normalized.includes('socks connection')
  ) {
    return new InboxMateError('PROXY_BLOCKED', 400, `Mail.com 代理连接失败（阶段：${stage}），请检查 Clash 节点和代理端口。`);
  }
  if (normalized.includes('timeout')) {
    const network = proxy.server ? `代理 ${proxy.server}` : '直连网络';
    return new InboxMateError('TIMEOUT', 400, `Mail.com 网页抓取超时（阶段：${stage}，${network}）。`);
  }
  return new InboxMateError('CONNECTION_FAILED', 400, `Mail.com 网页抓取失败（阶段：${stage}）：${message}`);
}

/** Headless Playwright driver used only for Mail.com-routed accounts. */
export async function fetchAccountVerificationCodeViaWebRpa(
  account: AccountInput,
  options: FetchAccountOptions
): Promise<FetchAccountResult> {
  if (account.auth.type !== 'app_password') {
    throw new InboxMateError('AUTH_REQUIRED', 400, 'Mail.com 网页抓取需要邮箱账号密码。');
  }
  if (options.signal.aborted) throw new InboxMateError('CANCELLED');

  const email = account.email;
  const password = account.auth.secret;
  let stage = '启动浏览器';
  let context: BrowserContext | null = null;
  const proxy = await detectRpaProxy();
  logNetworkResolution(proxy);

  const closeOnAbort = (): void => {
    void context?.close().catch(() => {});
  };
  options.signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    options.onProgress('authenticating');
    const browser = await getSharedBrowser();
    context = await browser.newContext({
      proxy: proxy.server ? { server: proxy.server } : undefined,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    const page = await context.newPage();

    // Resource Abort Optimization: Strip heavy media, fonts, ads, and trackers to accelerate loading by 300%+
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      const url = request.url().toLowerCase();

      // Block non-essential media & assets during webmail portal loading
      if (['image', 'media', 'font'].includes(resourceType)) {
        return route.abort().catch(() => {});
      }

      // Block third-party ad networks, telemetry, and tracking scripts
      if (
        url.includes('google-analytics') ||
        url.includes('googletagmanager') ||
        url.includes('doubleclick') ||
        url.includes('criteo') ||
        url.includes('outbrain') ||
        url.includes('taboola') ||
        url.includes('quantserve') ||
        url.includes('scorecardresearch') ||
        url.includes('adnxs') ||
        url.includes('facebook') ||
        url.includes('tiktok') ||
        url.includes('advertising') ||
        url.includes('adservice') ||
        url.includes('statcounter') ||
        url.includes('beacon')
      ) {
        return route.abort().catch(() => {});
      }

      return route.continue().catch(() => {});
    });

    if (process.env.RPA_DEBUG === '1') {
      page.on('request', (request) => {
        if (/mailheader|mailbody-ui\.de\/Mail\//i.test(request.url())) {
          console.info(`[web-rpa] request=${request.method()} ${request.url()}`);
        }
      });
      page.on('requestfailed', (request) => {
        if (/mailheader|mailbody-ui\.de\/Mail\//i.test(request.url())) {
          console.info(`[web-rpa] request-failed=${request.url()} ${request.failure()?.errorText ?? ''}`);
        }
      });
    }

    const capturedMails: CapturedMailPayload[] = [];
    const mailboxAccessTokens = new Set<string>();
    let noCacheKey = '';
    let resolveMailList: (() => void) | undefined;
    let mailListSeen = false;
    const mailListPromise = new Promise<void>((resolve) => {
      resolveMailList = resolve;
    });

    page.on('response', async (response) => {
      if (response.url().includes('/navigator/oauth2/token')) {
        const postData = response.request().postData() ?? '';
        if (postData.includes('scope=mail_mailbox_r')) {
          try {
            const tokenPayload = (await response.json()) as { access_token?: unknown };
            const accessToken = asString(tokenPayload.access_token);
            if (accessToken) mailboxAccessTokens.add(accessToken);
          } catch {
            // The next component token can still be used.
          }
        }
        return;
      }
      if (!isMailListResponse(response)) return;
      try {
        noCacheKey = new URL(response.url()).searchParams.get('no_cache') ?? noCacheKey;
        const contentType = response.headers()['content-type'] ?? '';
        if (!contentType.toLowerCase().includes('json')) return;
        const json = await response.json();
        mergeCapturedMails(capturedMails, parseMailComListPayload(json));
        mailListSeen = true;
        resolveMailList?.();
      } catch {
        // A later list response or the DOM fallback can still complete the fetch.
      }
    });

    options.onProgress('connecting');
    stage = '打开 Mail.com';
    await page.goto(MAIL_COM_HOME, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    const initialContent = await page.content().catch(() => '');
    if (isCaptchaPage(initialContent)) throw new InboxMateError('CAPTCHA_TRIGGERED');

    stage = '打开登录框';
    const { emailInput, passwordInput } = await ensureMailComLoginFormVisible(page);

    stage = '填写账号密码';
    await emailInput.fill(email);
    await passwordInput.fill(password);

    options.onProgress('searching');
    stage = '提交登录';
    const loginForm = page.locator('form').filter({ has: emailInput });
    const submitButton = loginForm.locator('button[type="submit"]').filter({ visible: true }).first();
    if ((await submitButton.count()) > 0) await submitButton.click({ timeout: 10_000 });
    else {
      await loginForm.evaluate((form) => {
        if (!(form instanceof HTMLFormElement)) throw new Error('Mail.com login form not found');
        form.requestSubmit();
      });
    }

    stage = '等待收件箱';
    const listLoaded = await Promise.race([
      mailListPromise.then(() => true),
      page.waitForTimeout(MAIL_LIST_TIMEOUT_MS).then(() => false)
    ]);
    if (!listLoaded && !mailListSeen) {
      const content = await page.content().catch(() => '');
      if (isCaptchaPage(content)) throw new InboxMateError('CAPTCHA_TRIGGERED');
      if (isAuthenticationFailure(page.url(), content)) throw new InboxMateError('AUTH_FAILED');
      throw new InboxMateError(
        'TIMEOUT',
        400,
        `Mail.com 登录成功后未在 ${MAIL_LIST_TIMEOUT_MS / 1000} 秒内加载收件箱。`
      );
    }

    const postLoginContent = await page.content().catch(() => '');
    if (isCaptchaPage(postLoginContent)) throw new InboxMateError('CAPTCHA_TRIGGERED');
    if (isAuthenticationFailure(page.url(), postLoginContent)) throw new InboxMateError('AUTH_FAILED');

    options.onProgress('parsing');
    stage = '解析邮件列表';
    if (capturedMails.length === 0) mergeCapturedMails(capturedMails, await parseMailboxDom(page));
    const selectedMails = selectMailComMessages(capturedMails, options);

    stage = '抓取邮件正文';
    await hydrateMailBodies(
      page,
      selectedMails,
      options.signal,
      () => [...mailboxAccessTokens],
      () => noCacheKey
    );
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    return mapResult(account, selectedMails);
  } catch (error) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    if (error instanceof InboxMateError) throw error;
    const classified = classifyBrowserError(error, stage, proxy);
    console.error(`[web-rpa] stage=${stage} error=${error instanceof Error ? error.message : String(error)}`);
    throw classified;
  } finally {
    options.signal.removeEventListener('abort', closeOnAbort);
    if (context) await context.close().catch(() => {});
  }
}
