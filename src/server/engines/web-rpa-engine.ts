import { execFile } from 'node:child_process';
import net from 'node:net';
import { randomUUID } from 'node:crypto';
import { simpleParser } from 'mailparser';
import {
  chromium,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type BrowserContextOptions,
  type Frame,
  type Locator,
  type Page,
  type Response
} from 'playwright';
import type { AccountInput, CodeMatch, EmailItem } from '../../shared/types.js';
import { extractVerificationCode } from '../../shared/verification-code.js';
import { formatDuration } from '../../shared/format-utils.js';
import { InboxMateError } from '../errors.js';
import type { FetchAccountOptions, FetchAccountResult } from '../imap-client.js';
import { diagLogger } from '../services/diag-logger.js';
import { domainFromEmail, isOffiLiveDomain } from '../providers.js';

const MAIL_COM_HOME = 'https://www.mail.com';
const NAVIGATION_TIMEOUT_MS = 30_000;
const MAIL_LIST_TIMEOUT_MS = 45_000;
const BODY_FETCH_BUDGET_MS = 30_000;
const BODY_FETCH_TIMEOUT_MS = 12_000;
const MAX_BODY_BYTES = 512 * 1024;
export const OFFILIVE_LOGIN_URL = 'https://www.offidocs.com/SOGo/';
export const OFFILIVE_AJAX_URL = `${OFFILIVE_LOGIN_URL}?/Ajax/&q[]=/0/`;
export function buildOffiLiveAjaxUrl(authAccountHash = '0'): string {
  const safeHash = /^[_.a-z\d-]+$/i.test(authAccountHash) ? authAccountHash : '0';
  return `${OFFILIVE_LOGIN_URL}?/Ajax/&q[]=/${safeHash || '0'}/`;
}
export function buildOffiLiveMessageUrl(
  authAccountHash: string,
  folder: string,
  uid: string,
  projectHash: string
): string {
  const rawKey = Buffer.from([folder, uid, projectHash, '0'].join('\0'), 'utf8').toString('base64url');
  return `${buildOffiLiveAjaxUrl(authAccountHash)}Message/&q[]=/${rawKey}`;
}
export const OFFILIVE_EMAIL_SELECTOR = 'input#RainLoopEmail, input[name="RainLoopEmail"], input.inputEmail';
export const OFFILIVE_PASSWORD_SELECTOR =
  'input#RainLoopPassword, input[name="RainLoopPassword"], input.inputPassword';
const OFFILIVE_LOGIN_ATTEMPTS = 2;
const OFFILIVE_NAVIGATION_TIMEOUT_MS = 30_000;
const OFFILIVE_LOGIN_BUDGET_MS = 55_000;
const OFFILIVE_AJAX_BOOTSTRAP_ATTEMPTS = 2;
const OFFILIVE_AJAX_AUTH_CONFIRM_ATTEMPTS = 4;
const OFFILIVE_AJAX_BOOTSTRAP_TIMEOUT_MS = 35_000;
const OFFILIVE_AJAX_LOGIN_TIMEOUT_MS = 45_000;
const OFFILIVE_AJAX_LIST_TIMEOUT_MS = 45_000;
const OFFILIVE_AJAX_BODY_TIMEOUT_MS = 40_000;
const OFFILIVE_AJAX_BODY_BUDGET_MS = 80_000;
const OFFILIVE_AJAX_TOTAL_BUDGET_MS = 270_000;
const OFFILIVE_AJAX_REQUEST_ATTEMPTS = 2;
const OFFILIVE_AJAX_RETRY_DELAY_MS = 2_000;
const OFFILIVE_AJAX_MIN_REQUEST_TIMEOUT_MS = 500;
const WINDOWS_PROXY_KEY = 'HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings';
const LOCAL_PROXY_PORTS = [7897, 7890, 10809, 10808, 7891] as const;
export const MAIL_COM_LOGIN_TRIGGER_SELECTOR = [
  'a.button.button-login[href="homepage.html#navlogin"]',
  '#login-button'
].join(', ');
export const MAILCOM_MAX_ATTEMPTS = 3;
export const MAILCOM_TOTAL_BUDGET_MS = 65_000;
export const MAILCOM_RETRY_BASE_DELAY_MS = 1_500;
export const MAILCOM_RETRY_MAX_JITTER_MS = 1_000;
export const MAILCOM_MIN_REMAINING_BUDGET_MS = 8_000;

let sharedBrowser: Browser | null = null;
let browserPromise: Promise<Browser> | null = null;
let lastNetworkLog = '';

export interface ProxyResolution {
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

let activeRunningAccounts = 0;
let browserUsageCount = 0;
const MAX_BROWSER_RECYCLE_USAGE = 30;

async function getSharedBrowser(): Promise<Browser> {
  if (sharedBrowser?.isConnected()) return sharedBrowser;
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

const MAX_CONCURRENT_RPA = 3;
const rpaWaitQueue: Array<{ resolve: () => void; reject: (err: Error) => void }> = [];

async function acquireBrowser(): Promise<Browser> {
  if (activeRunningAccounts >= MAX_CONCURRENT_RPA) {
    diagLogger.info(
      'web_rpa',
      '并发排队',
      `当前并发数 (${activeRunningAccounts}/${MAX_CONCURRENT_RPA}) 已满，任务进入排队队列 (排队中: ${rpaWaitQueue.length + 1})`
    );
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        const idx = rpaWaitQueue.findIndex((item) => item.resolve === resolve);
        if (idx >= 0) rpaWaitQueue.splice(idx, 1);
        reject(new InboxMateError('TIMEOUT', 504, '服务器并发任务较多，排队等待超时，请稍后重试'));
      }, 35_000);

      rpaWaitQueue.push({
        resolve: () => {
          clearTimeout(timer);
          resolve();
        },
        reject: (err) => {
          clearTimeout(timer);
          reject(err);
        }
      });
    });
  }

  activeRunningAccounts += 1;
  browserUsageCount += 1;
  try {
    return await getSharedBrowser();
  } catch (error) {
    activeRunningAccounts = Math.max(0, activeRunningAccounts - 1);
    browserUsageCount = Math.max(0, browserUsageCount - 1);
    const nextTask = rpaWaitQueue.shift();
    nextTask?.resolve();
    throw error;
  }
}

async function releaseBrowser(): Promise<void> {
  activeRunningAccounts = Math.max(0, activeRunningAccounts - 1);

  if (rpaWaitQueue.length > 0 && activeRunningAccounts < MAX_CONCURRENT_RPA) {
    const nextTask = rpaWaitQueue.shift();
    if (nextTask) nextTask.resolve();
  }

  if (activeRunningAccounts === 0 && browserUsageCount >= MAX_BROWSER_RECYCLE_USAGE) {
    await closeSharedBrowser();
  }
}

export async function closeSharedBrowser(): Promise<void> {
  const browser = sharedBrowser;
  sharedBrowser = null;
  browserPromise = null;
  browserUsageCount = 0;
  if (browser) await browser.close().catch(() => {});
}

const serverStartTime = Date.now();

export async function getRpaStatus() {
  const proxy = await detectRpaProxy();
  const isConnected = Boolean(sharedBrowser?.isConnected());
  const mem = process.memoryUsage();

  return {
    status: isConnected ? (activeRunningAccounts > 0 ? 'busy' : 'idle') : 'ready',
    isConnected,
    activeConcurrentAccounts: activeRunningAccounts,
    browserUsageCount,
    maxRecycleUsage: MAX_BROWSER_RECYCLE_USAGE,
    proxyInfo: {
      server: proxy.server || null,
      source: proxy.source
    },
    uptimeSeconds: Math.floor((Date.now() - serverStartTime) / 1000),
    systemPlatform: process.platform,
    nodeVersion: process.version,
    memoryUsageMb: Math.round(mem.rss / (1024 * 1024)),
    heapUsedMb: Math.round(mem.heapUsed / (1024 * 1024))
  };
}

export async function restartSharedBrowser(): Promise<{ message: string; activeAccountsBefore: number }> {
  const before = activeRunningAccounts;
  diagLogger.warn('web_rpa', '手动重启', `管理员执行了手动重启 Chrome 无头浏览器 (重启前并发: ${before})`);
  await closeSharedBrowser();
  activeRunningAccounts = 0;
  browserUsageCount = 0;
  // Pre-warm fresh browser instance
  await acquireBrowser();
  await releaseBrowser();
  diagLogger.info('web_rpa', '重启完成', 'Chrome 无头浏览器已成功重新初始化并就绪');
  return {
    message: 'Chrome 无头浏览器已成功安全重启并就绪！',
    activeAccountsBefore: before
  };
}

export async function testRpaHealthCheck(): Promise<{
  ok: boolean;
  latencyMs: number;
  proxyUsed: string;
  pageTitle: string;
  statusCode: number;
  hasCaptcha: boolean;
}> {
  const startTime = Date.now();
  const proxy = await detectRpaProxy();
  diagLogger.info('web_rpa', '健康自检', `正在发起无头浏览器连通性自检 (代理: ${proxy.server ?? '直连'})`);

  const browser = await acquireBrowser();
  const context = await browser.newContext({
    proxy: proxy.server ? { server: proxy.server } : undefined,
    viewport: { width: 1280, height: 800 }
  });

  try {
    const page = await context.newPage();
    const response = await page.goto(MAIL_COM_HOME, { waitUntil: 'domcontentloaded', timeout: 20_000 });
    const content = await page.content().catch(() => '');
    const title = await page.title().catch(() => '');
    const latency = Date.now() - startTime;
    const hasCaptcha = isCaptchaPage(content);

    diagLogger.info('web_rpa', '自检完成', `Mail.com 连通性自检成功 (耗时: ${formatDuration(latency)}, 标题: "${title}", 验证码: ${hasCaptcha ? '有' : '无'})`);

    return {
      ok: true,
      latencyMs: latency,
      proxyUsed: proxy.server || '直连 Direct',
      pageTitle: title || 'Mail.com',
      statusCode: response?.status() || 200,
      hasCaptcha
    };
  } catch (err: any) {
    diagLogger.error('web_rpa', '自检失败', `Mail.com 连通性探测失败: ${err.message}`);
    throw new InboxMateError('CONNECTION_FAILED', 400, `自检失败: ${err.message}`);
  } finally {
    await context.close().catch(() => {});
    await releaseBrowser();
  }
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

export function isMailComBlockedContent(content: string, url = ''): boolean {
  const normalizedContent = content.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  return (
    normalizedContent.includes('"status-code":"403"') ||
    normalizedContent.includes('"status-code": "403"') ||
    normalizedContent.includes('"message":"blocked"') ||
    normalizedContent.includes('"message": "blocked"') ||
    normalizedContent.includes('"status-code":"429"') ||
    normalizedContent.includes('"status-code": "429"') ||
    normalizedContent.includes('{"error":{"status-code":') ||
    (normalizedContent.includes('"error"') && normalizedContent.includes('"blocked"')) ||
    normalizedContent.includes('403 forbidden') ||
    normalizedContent.includes('access denied') ||
    normalizedContent.includes('request blocked') ||
    normalizedUrl.includes('error=blocked') ||
    normalizedUrl.includes('error=403')
  );
}

export function isRetryableMailComError(error: unknown): boolean {
  if (error instanceof InboxMateError) {
    if (
      error.code === 'AUTH_FAILED' ||
      error.code === 'AUTH_REQUIRED' ||
      error.code === 'AUTH_DENIED' ||
      error.code === 'AUTH_EXPIRED' ||
      error.code === 'CANCELLED' ||
      error.code === 'CAPTCHA_TRIGGERED' ||
      error.code === 'BAD_REQUEST' ||
      error.code === 'UNSUPPORTED_PROVIDER'
    ) {
      return false;
    }
    if (
      error.code === 'PROXY_BLOCKED' ||
      error.code === 'TIMEOUT' ||
      error.code === 'CONNECTION_FAILED' ||
      error.code === 'RATE_LIMITED' ||
      error.code === 'INTERNAL'
    ) {
      return true;
    }
  }
  return true;
}

export async function humanType(locator: Locator, text: string, delayMs = 35): Promise<void> {
  const loc = locator as any;
  if (typeof loc.pressSequentially === 'function') {
    await loc.pressSequentially(text, { delay: delayMs });
  } else if (typeof loc.type === 'function') {
    await loc.type(text, { delay: delayMs });
  } else if (typeof loc.fill === 'function') {
    await loc.fill(text);
  }
}

async function waitForMailComRetry(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) throw new InboxMateError('CANCELLED');
  if (delayMs <= 0) return;
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new InboxMateError('CANCELLED'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function isAuthenticationFailure(url: string, content: string): boolean {
  const normalized = content.toLowerCase();
  const normalizedUrl = url.toLowerCase();
  return (
    /\/logout\/?\?ls=(?:wd|te|failed)/i.test(normalizedUrl) ||
    normalizedUrl.includes('error=invalid') ||
    normalizedUrl.includes('error=auth') ||
    normalized.includes('invalid credentials') ||
    normalized.includes('incorrect login or password') ||
    normalized.includes('incorrect login') ||
    normalized.includes('wrong password') ||
    normalized.includes('password is incorrect') ||
    normalized.includes('authentication failed') ||
    normalized.includes('login failed') ||
    normalized.includes('please check your email address and password') ||
    normalized.includes('please check your email address or password') ||
    normalized.includes('user name and password do not match') ||
    normalized.includes('access denied') ||
    normalized.includes('account has been locked') ||
    normalized.includes('temporarily locked') ||
    normalized.includes('your login was not successful')
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
  const frames = page.frames();
  let targetFrame: Frame | undefined = frames.find((candidate) => candidate.url().startsWith('https://webmailer.mail.com/'));
  if (!targetFrame) {
    for (const f of frames) {
      const count = await f.locator('list-mail-item, [data-test="mail-item"]').count().catch(() => 0);
      if (count > 0) {
        targetFrame = f;
        break;
      }
    }
  }
  if (!targetFrame) return [];

  const items = targetFrame.locator('list-mail-item');
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
    const frames = page.frames();
    for (const frame of frames) {
      const url = frame.url().toLowerCase();
      if (url.includes('webmailer.mail.com') || url.includes('/mail/') || url.includes('/mailbox/')) {
        const count = await frame.locator('list-mail-item, [data-test="mail-item"]').count().catch(() => 0);
        if (count > 0) return frame;
      }
    }
    for (const frame of frames) {
      const count = await frame.locator('list-mail-item').count().catch(() => 0);
      if (count > 0) return frame;
    }
    await page.waitForTimeout(250);
  }
  return undefined;
}

async function tryAutoSkipInterstitials(page: Page): Promise<boolean> {
  const skipSelectors = [
    'button:has-text("Continue to Mail")',
    'button:has-text("Continue to mailbox")',
    'button:has-text("Continue to Inbox")',
    'button:has-text("Skip")',
    'button:has-text("Remind me later")',
    'button:has-text("I agree")',
    'button:has-text("Accept all")',
    'button:has-text("Agree and continue")',
    'button#onetrust-accept-btn-handler',
    '[data-test="skip-button"]',
    '[data-test="continue-button"]',
    'a.pos-button',
    '.consent-accept',
    '.interstitial-skip'
  ];
  for (const sel of skipSelectors) {
    try {
      const btn = page.locator(sel).filter({ visible: true }).first();
      if ((await btn.count().catch(() => 0)) > 0) {
        await btn.click({ timeout: 1200 }).catch(() => {});
        return true;
      }
    } catch {
      // ignore
    }
  }
  return false;
}

async function captureForensicsSnapshot(page: Page | null, stage: string): Promise<{
  finalUrl: string;
  pageTitle: string;
  pageCategory: string;
  detectedPrompt: string;
  screenshotBase64?: string;
  framesCount: number;
}> {
  if (!page) {
    return {
      finalUrl: 'N/A',
      pageTitle: 'N/A',
      pageCategory: 'browser_not_initialized',
      detectedPrompt: '',
      framesCount: 0
    };
  }

  let finalUrl = '';
  let pageTitle = '';
  let detectedPrompt = '';
  let screenshotBase64: string | undefined = undefined;
  let framesCount = 0;

  try {
    finalUrl = page.url();
    pageTitle = await page.title().catch(() => '');
    framesCount = page.frames().length;

    detectedPrompt = await page.evaluate(() => {
      const errorSelectors = [
        '[role="alert"]',
        '.error-message',
        '.login-error',
        '.notification',
        '.alert',
        'h1',
        'h2',
        'p.error',
        '.interstitial-text',
        '.pos-headline'
      ];
      for (const sel of errorSelectors) {
        const el = document.querySelector(sel);
        if (el && el.textContent?.trim()) {
          return el.textContent.trim().slice(0, 300);
        }
      }
      return '';
    }).catch(() => '');

    const buffer = await page.screenshot({
      type: 'jpeg',
      quality: 45,
      scale: 'css'
    }).catch(() => null);

    if (buffer) {
      screenshotBase64 = `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }
  } catch {
    // fallback
  }

  let pageCategory = 'inbox_loading_timeout';
  const normUrl = finalUrl.toLowerCase();
  const normTitle = pageTitle.toLowerCase();
  const normPrompt = detectedPrompt.toLowerCase();

  if (
    normPrompt.includes('internal server error') ||
    normPrompt.includes('bad gateway') ||
    normPrompt.includes('service unavailable') ||
    normPrompt.includes('gateway timeout')
  ) {
    pageCategory = 'upstream_server_error';
  } else if (normUrl.includes('consent') || normTitle.includes('consent') || normPrompt.includes('consent')) {
    pageCategory = 'consent_interstitial';
  } else if (normUrl.includes('challenge') || normUrl.includes('verify') || normPrompt.includes('security') || normPrompt.includes('phone')) {
    pageCategory = 'security_challenge';
  } else if (normUrl.includes('welcome') || normUrl.includes('promo') || normTitle.includes('special offer') || normPrompt.includes('welcome')) {
    pageCategory = 'promo_interstitial';
  } else if (normUrl.includes('login') || normPrompt.includes('incorrect') || normPrompt.includes('invalid') || normPrompt.includes('password')) {
    pageCategory = 'login_failed';
  } else if (normPrompt.includes('human') || normPrompt.includes('captcha') || normUrl.includes('cf-chl')) {
    pageCategory = 'cloudflare_captcha';
  }

  return {
    finalUrl,
    pageTitle,
    pageCategory,
    detectedPrompt,
    screenshotBase64,
    framesCount
  };
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

export function selectMailComMessages<T extends CapturedMailPayload>(
  mails: T[],
  options: Pick<FetchAccountOptions, 'lookbackMinutes' | 'maxMessages'>
): T[] {
  const max = typeof options.maxMessages === 'number' && options.maxMessages > 0 ? options.maxMessages : 10;
  const threshold = options.lookbackMinutes && options.lookbackMinutes > 0
    ? Date.now() - options.lookbackMinutes * 60_000
    : undefined;

  return mails
    .filter((mail) => threshold === undefined || mail.receivedAt.getTime() >= threshold)
    .sort((left, right) => right.receivedAt.getTime() - left.receivedAt.getTime())
    .slice(0, max);
}

function mapResult(
  account: AccountInput,
  mails: CapturedMailPayload[],
  display: { idPrefix: string; defaultFrom: string } = {
    idPrefix: 'mailcom',
    defaultFrom: 'Mail.com Service'
  }
): FetchAccountResult {
  const items: EmailItem[] = mails.map((mail) => {
    const textBody = mail.body || mail.snippet || '';
    const codeMatch = extractVerificationCode({
      subject: mail.subject,
      text: textBody,
      receivedAt: mail.receivedAt,
      from: mail.from
    });
    return {
      id: `${display.idPrefix}-${mail.id}`,
      accountEmail: account.email,
      provider: account.provider,
      subject: mail.subject || '(无主题)',
      from: mail.from || display.defaultFrom,
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

function chromeVersion(browserVersion: string): string {
  return browserVersion.match(/\d+(?:\.\d+){0,3}/)?.[0] ?? '131.0.0.0';
}

export function createOffiLiveUserAgent(browserVersion: string, platform = process.platform): string {
  const platformToken =
    platform === 'win32'
      ? 'Windows NT 10.0; Win64; x64'
      : platform === 'darwin'
        ? 'Macintosh; Intel Mac OS X 10_15_7'
        : 'X11; Linux x86_64';
  return (
    `Mozilla/5.0 (${platformToken}) AppleWebKit/537.36 (KHTML, like Gecko) ` +
    `Chrome/${chromeVersion(browserVersion)} Safari/537.36`
  );
}

export function createOffiLiveContextOptions(
  browserVersion: string,
  proxyServer?: string
): BrowserContextOptions {
  return {
    proxy: proxyServer ? { server: proxyServer } : undefined,
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
    userAgent: createOffiLiveUserAgent(browserVersion),
    extraHTTPHeaders: {
      'Accept-Language': 'en-US,en;q=0.9'
    }
  };
}

export function sanitizeOffiLiveRequestHeaders(
  headers: Record<string, string>,
  userAgent: string
): Record<string, string> {
  const sanitized = { ...headers };
  for (const name of Object.keys(sanitized)) {
    const normalized = name.toLowerCase();
    if (
      normalized.startsWith('sec-ch-ua') ||
      normalized.startsWith('sec-fetch-') ||
      normalized === 'priority' ||
      normalized === 'upgrade-insecure-requests'
    ) {
      delete sanitized[name];
    }
  }
  sanitized['user-agent'] = userAgent;
  sanitized['accept-language'] = 'en-US,en;q=0.9';
  return sanitized;
}

export function isOffiLiveThemeStylesheetUrl(rawUrl: string): boolean {
  try {
    const url = new URL(rawUrl);
    return (
      url.protocol === 'https:' &&
      url.hostname.toLowerCase() === 'www.offidocs.com' &&
      url.pathname === '/SOGo/' &&
      /^\?\/Css(?:\/|$)/.test(url.search)
    );
  } catch {
    return false;
  }
}

export async function installOffiLiveNetworkGuards(page: Page, userAgent: string): Promise<void> {
  await page.route('**/*', (route) => {
    const request = route.request();
    let url: URL;
    try {
      url = new URL(request.url());
    } catch {
      return route.continue().catch(() => {});
    }

    const hostname = url.hostname.toLowerCase();
    if (
      hostname.includes('googletagmanager') ||
      hostname.includes('google-analytics') ||
      hostname.includes('doubleclick') ||
      hostname.includes('googlesyndication')
    ) {
      return route.abort().catch(() => {});
    }

    if (request.resourceType() === 'stylesheet' && isOffiLiveThemeStylesheetUrl(request.url())) {
      return route.fulfill({ status: 200, contentType: 'text/css', body: '' }).catch(() => {});
    }

    if (hostname === 'www.offidocs.com' && url.pathname.startsWith('/SOGo')) {
      return route
        .continue({ headers: sanitizeOffiLiveRequestHeaders(request.headers(), userAgent) })
        .catch(() => {});
    }
    return route.continue().catch(() => {});
  });
}

type JsonRecord = Record<string, unknown>;

function asJsonRecord(value: unknown): JsonRecord | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as JsonRecord)
    : undefined;
}

function asJsonString(value: unknown): string {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function asJsonNumber(value: unknown): number | undefined {
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : undefined;
}

function offiLiveCollection(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  const record = asJsonRecord(value);
  if (!record) return [];
  for (const key of ['@Collection', '@List', 'List']) {
    const candidate = record[key];
    if (Array.isArray(candidate)) return candidate;
  }
  return [];
}

function offiLiveAddressList(value: unknown): string {
  return offiLiveCollection(value)
    .map((entry) => {
      if (typeof entry === 'string') return entry.trim();
      const address = asJsonRecord(entry);
      if (!address) return '';
      const name = asJsonString(address.Name).trim();
      const email = asJsonString(address.Email).trim();
      return name && email ? `${name} <${email}>` : email || name;
    })
    .filter(Boolean)
    .join(', ');
}

function offiLiveDate(value: unknown): Date {
  const timestamp = asJsonNumber(value);
  if (timestamp === undefined || timestamp <= 0) return new Date(0);
  return new Date(timestamp < 1_000_000_000_000 ? timestamp * 1000 : timestamp);
}

export interface OffiLiveAppData {
  auth: boolean;
  authAccountHash: string;
  email: string;
  projectHash: string;
  token: string;
}

export function buildOffiLiveAppDataUrl(
  nonce = `${Date.now()}${Math.random().toString().slice(2)}`,
  authAccountHash = '0'
): string {
  const safeHash = /^[_.a-z\d-]+$/i.test(authAccountHash) ? authAccountHash : '0';
  const safeNonce = nonce.replace(/[^.a-z\d_-]/gi, '') || String(Date.now());
  return `${OFFILIVE_LOGIN_URL}?/AppData@no-mobile-0/${safeHash}/${safeNonce}/`;
}

export function parseOffiLiveAppDataScript(script: string): OffiLiveAppData {
  const match = script.match(/window\.__initAppData\((\{[\s\S]*\})\);\s*\}\s*$/);
  if (!match) throw new Error('RainLoop AppData wrapper is missing');

  const data = asJsonRecord(JSON.parse(match[1]));
  const system = asJsonRecord(data?.System);
  if (!data || !system || !Object.prototype.hasOwnProperty.call(system, 'token')) {
    throw new Error('RainLoop AppData token is missing');
  }

  return {
    auth: data.Auth === true,
    authAccountHash: asJsonString(data.AuthAccountHash),
    email: asJsonString(data.Email),
    projectHash: asJsonString(data.ProjectHash),
    token: asJsonString(system.token)
  };
}

export interface OffiLiveCapturedMail extends CapturedMailPayload {
  folder: string;
}

function offiLivePayloadResult(payload: unknown, action: string): JsonRecord | undefined {
  const root = asJsonRecord(payload);
  if (!root) return undefined;
  if (root.Action !== undefined && asJsonString(root.Action) !== action) return undefined;
  return asJsonRecord(root.Result) ?? root;
}

export function parseOffiLiveMessageListPayload(payload: unknown): OffiLiveCapturedMail[] {
  const result = offiLivePayloadResult(payload, 'MessageList');
  if (!result) return [];
  const defaultFolder = asJsonString(result.FolderName) || 'INBOX';

  return offiLiveCollection(result)
    .map((entry): OffiLiveCapturedMail | undefined => {
      const item = asJsonRecord(entry);
      if (!item) return undefined;
      const id = asJsonString(item.Uid ?? item.uid ?? item.id);
      if (!id) return undefined;
      const subject = asJsonString(item.Subject).trim();
      const from = offiLiveAddressList(item.From) || offiLiveAddressList(item.Sender);
      const snippet = asJsonString(item.Snippet ?? item.Preview).trim();
      return {
        id,
        folder: asJsonString(item.Folder) || defaultFolder,
        subject,
        from,
        receivedAt: offiLiveDate(item.DateTimeStampInUTC),
        snippet: snippet || subject,
        body: ''
      };
    })
    .filter((mail): mail is OffiLiveCapturedMail => Boolean(mail));
}

export interface OffiLiveMessageDetail {
  id: string;
  folder: string;
  subject: string;
  from: string;
  receivedAt: Date;
  plain: string;
  html: string;
}

export function parseOffiLiveMessagePayload(payload: unknown): OffiLiveMessageDetail | undefined {
  const result = offiLivePayloadResult(payload, 'Message');
  if (!result) return undefined;
  const id = asJsonString(result.Uid ?? result.uid);
  if (!id) return undefined;
  return {
    id,
    folder: asJsonString(result.Folder) || 'INBOX',
    subject: asJsonString(result.Subject).trim(),
    from: offiLiveAddressList(result.From) || offiLiveAddressList(result.Sender),
    receivedAt: offiLiveDate(result.DateTimeStampInUTC),
    plain: asJsonString(result.Plain).slice(0, MAX_BODY_BYTES),
    html: asJsonString(result.Html).slice(0, MAX_BODY_BYTES)
  };
}

export function isOffiLiveUpstreamFailure(status: number | null, pageText: string): boolean {
  if (status !== null && status >= 500 && status <= 599) return true;
  return /\b(?:500 internal server error|502 bad gateway|503 service unavailable|504 gateway timeout)\b/i.test(
    pageText
  );
}

interface OffiLiveLoginForm {
  emailInput: Locator;
  passwordInput: Locator;
  attempts: number;
  status: number | null;
}

async function readOffiLivePageText(page: Page): Promise<string> {
  return (await page.locator('body').innerText({ timeout: 1500 }).catch(() => '')).trim().slice(0, 500);
}

export async function ensureOffiLiveLoginFormVisible(
  page: Page,
  signal: AbortSignal,
  maxAttempts = OFFILIVE_LOGIN_ATTEMPTS
): Promise<OffiLiveLoginForm> {
  const emailInput = page.locator(OFFILIVE_EMAIL_SELECTOR).first();
  const passwordInput = page.locator(OFFILIVE_PASSWORD_SELECTOR).first();
  const attemptLimit = Math.max(1, maxAttempts);
  const deadline = Date.now() + OFFILIVE_LOGIN_BUDGET_MS;
  let lastStatus: number | null = null;
  let lastText = '';
  let lastError: unknown;

  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    if (signal.aborted) throw new InboxMateError('CANCELLED');
    const navigationBudget = Math.min(OFFILIVE_NAVIGATION_TIMEOUT_MS, deadline - Date.now());
    if (navigationBudget <= 0) break;

    try {
      const response = await page.goto(OFFILIVE_LOGIN_URL, {
        waitUntil: 'commit',
        timeout: navigationBudget
      });
      lastStatus = response?.status() ?? null;
    } catch (error) {
      lastError = error;
      lastStatus = null;
    }

    if (signal.aborted) throw new InboxMateError('CANCELLED');
    lastText = await readOffiLivePageText(page);

    if (!isOffiLiveUpstreamFailure(lastStatus, lastText)) {
      const formBudget = Math.min(15_000, deadline - Date.now());
      if (formBudget <= 0) break;
      try {
        await Promise.all([
          emailInput.waitFor({ state: 'visible', timeout: formBudget }),
          passwordInput.waitFor({ state: 'visible', timeout: formBudget })
        ]);
        return { emailInput, passwordInput, attempts: attempt, status: lastStatus };
      } catch (error) {
        lastError = error;
        lastText = await readOffiLivePageText(page);
      }
    }

    const lastMessage = lastError instanceof Error ? lastError.message.toLowerCase() : '';
    const shouldRetry =
      (isOffiLiveUpstreamFailure(lastStatus, lastText) || lastMessage.includes('timeout')) &&
      attempt < attemptLimit &&
      deadline > Date.now();
    if (!shouldRetry) break;
    await page.waitForTimeout(Math.min(500 * attempt, Math.max(0, deadline - Date.now())));
  }

  if (isOffiLiveUpstreamFailure(lastStatus, lastText)) {
    const statusText = lastStatus ? `HTTP ${lastStatus}` : 'HTTP 5xx';
    throw new InboxMateError(
      'CONNECTION_FAILED',
      502,
      `OffiLive / OffiDocs 登录服务暂时异常（${statusText}），已自动重试，请稍后再试。`
    );
  }

  const message = lastError instanceof Error ? lastError.message : String(lastError ?? '登录表单未出现');
  if (message.toLowerCase().includes('timeout')) {
    throw new InboxMateError(
      'TIMEOUT',
      408,
      `OffiLive 登录页加载超时，已自动重试（终点：${page.url()}）。`
    );
  }
  throw new InboxMateError(
    'CONNECTION_FAILED',
    502,
    `OffiLive 登录页未加载出账号密码输入框（终点：${page.url()}）。`
  );
}

function classifyOffiLiveBrowserError(error: unknown, stage: string, proxy: ProxyResolution): InboxMateError {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const normalized = rawMessage.toLowerCase();
  const message = rawMessage.split(/[\r\n]/, 1)[0].trim().slice(0, 240) || '未知网络错误';
  if (
    normalized.includes('err_proxy') ||
    normalized.includes('err_tunnel_connection_failed') ||
    normalized.includes('proxy connection') ||
    normalized.includes('socks connection')
  ) {
    return new InboxMateError(
      'PROXY_BLOCKED',
      400,
      `OffiLive 代理连接失败（阶段：${stage}），请检查 Clash 节点和代理端口。`
    );
  }
  if (normalized.includes('timeout')) {
    const network = proxy.server ? `代理 ${proxy.server}` : '直连网络';
    return new InboxMateError('TIMEOUT', 408, `OffiLive 网页抓取超时（阶段：${stage}，${network}）。`);
  }
  return new InboxMateError('CONNECTION_FAILED', 502, `OffiLive 网页抓取失败（阶段：${stage}）：${message}`);
}

interface OffiLiveJsonResponse {
  status: number;
  payload: JsonRecord;
}

export function safeOffiLiveErrorSummary(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.split(/[\r\n]/, 1)[0].trim().slice(0, 240) || '未知网络错误';
}

export function offiLiveAjaxRequestTimeout(
  deadline: number,
  stageLimit: number,
  now = Date.now()
): number {
  const remaining = Math.floor(deadline - now);
  if (remaining < OFFILIVE_AJAX_MIN_REQUEST_TIMEOUT_MS) return 0;
  return Math.min(stageLimit, remaining);
}

function offiLiveAjaxBudgetError(stage: string): InboxMateError {
  return new InboxMateError('TIMEOUT', 408, `OffiLive Ajax 抓取超时（阶段：${stage}，已达到总时间预算）。`);
}

function isRetryableOffiLiveAjaxError(error: unknown): boolean {
  if (error instanceof InboxMateError) {
    return error.code === 'CONNECTION_FAILED' || error.code === 'TIMEOUT';
  }
  const message = error instanceof Error ? error.message : String(error);
  return /(?:timeout|econn|socket|network|http\s+5\d\d|connection)/i.test(message);
}

async function waitForOffiLiveAjaxRetry(signal: AbortSignal, delayMs: number): Promise<void> {
  if (signal.aborted) throw new InboxMateError('CANCELLED');
  await new Promise<void>((resolve, reject) => {
    const onAbort = (): void => {
      clearTimeout(timer);
      reject(new InboxMateError('CANCELLED'));
    };
    const timer = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, delayMs);
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

async function readOffiLiveJsonResponse(response: APIResponse, action: string): Promise<OffiLiveJsonResponse> {
  const status = response.status();
  const body = await response.text();
  if (status >= 500 && status <= 599) {
    throw new InboxMateError(
      'CONNECTION_FAILED',
      502,
      `OffiLive / OffiDocs ${action} 服务暂时异常（HTTP ${status}）。`
    );
  }
  if (!response.ok()) {
    throw new InboxMateError('CONNECTION_FAILED', 502, `OffiLive ${action} 请求失败（HTTP ${status}）。`);
  }
  try {
    const payload = asJsonRecord(JSON.parse(body));
    if (!payload) throw new Error('JSON object expected');
    return { status, payload };
  } catch {
    throw new InboxMateError('CONNECTION_FAILED', 502, `OffiLive ${action} 返回了无法解析的数据。`);
  }
}

async function requestOffiLiveAppData(
  request: APIRequestContext,
  timeout = OFFILIVE_AJAX_BOOTSTRAP_TIMEOUT_MS
): Promise<OffiLiveAppData> {
  const response = await request.get(buildOffiLiveAppDataUrl(), {
    headers: {
      Accept: 'application/javascript, text/javascript, */*; q=0.01',
      'Accept-Encoding': 'identity',
      Referer: OFFILIVE_LOGIN_URL
    },
    timeout
  });
  const status = response.status();
  const body = await response.text();
  if (status >= 500 && status <= 599) {
    throw new Error(`OffiLive AppData upstream HTTP ${status}`);
  }
  if (!response.ok()) throw new Error(`OffiLive AppData HTTP ${status}`);
  return parseOffiLiveAppDataScript(body);
}

async function postOffiLiveAjax(
  request: APIRequestContext,
  action: string,
  form: Record<string, string>,
  timeout: number,
  authAccountHash = '0'
): Promise<OffiLiveJsonResponse> {
  const response = await request.post(buildOffiLiveAjaxUrl(authAccountHash), {
    form: { Action: action, ...form },
    headers: {
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'Accept-Encoding': 'identity',
      Origin: 'https://www.offidocs.com',
      Referer: OFFILIVE_LOGIN_URL,
      'X-Requested-With': 'XMLHttpRequest'
    },
    timeout
  });
  return readOffiLiveJsonResponse(response, action);
}

async function getOffiLiveMessage(
  request: APIRequestContext,
  appData: OffiLiveAppData,
  folder: string,
  uid: string,
  timeout: number
): Promise<OffiLiveJsonResponse> {
  const response = await request.get(
    buildOffiLiveMessageUrl(appData.authAccountHash, folder, uid, appData.projectHash),
    {
      headers: {
        Accept: 'application/json, text/javascript, */*; q=0.01',
        'Accept-Encoding': 'identity',
        Referer: OFFILIVE_LOGIN_URL,
        'X-Requested-With': 'XMLHttpRequest'
      },
      timeout
    }
  );
  return readOffiLiveJsonResponse(response, 'Message');
}

function offiLiveAjaxErrorCode(payload: JsonRecord): number | undefined {
  return asJsonNumber(payload.ErrorCode);
}

function offiLiveAjaxErrorDetail(payload: JsonRecord): string {
  return asJsonString(payload.ErrorMessageAdditional || payload.ErrorMessage)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

function isOffiLiveAjaxSuccess(payload: JsonRecord, action: string): boolean {
  return (
    asJsonString(payload.Action) === action &&
    payload.Result !== false &&
    payload.Result !== undefined &&
    payload.Result !== null
  );
}

function classifyOffiLiveLoginResponse(payload: JsonRecord): InboxMateError {
  const code = offiLiveAjaxErrorCode(payload);
  const detail = offiLiveAjaxErrorDetail(payload);
  const suffix = detail ? `：${detail}` : '';
  if (code === 105) {
    return new InboxMateError('CAPTCHA_TRIGGERED', 400, `OffiLive 登录触发了人机验证${suffix}。`);
  }
  if (code === 120 || code === 121 || payload.TwoFactorAuth === true) {
    return new InboxMateError('AUTH_REQUIRED', 400, `OffiLive 登录需要额外安全验证码${suffix}。`);
  }
  if (code === 104) {
    return new InboxMateError('CONNECTION_FAILED', 502, `OffiLive 无法连接其邮箱后端${suffix}。`);
  }
  if (code === 953) {
    return new InboxMateError('TIMEOUT', 408, `OffiLive 登录请求超时${suffix}。`);
  }
  if (code === 101) {
    return new InboxMateError('CONNECTION_FAILED', 502, 'OffiLive 登录会话令牌失效，请重试。');
  }
  if (code === 103 || code === 109 || code === 110) {
    return new InboxMateError('AUTH_DENIED', 400, `OffiLive 拒绝了此账号的登录请求${suffix}。`);
  }
  if (code === 901 || code === 950 || code === 952 || code === 999) {
    return new InboxMateError('CONNECTION_FAILED', 502, `OffiLive 登录服务返回异常${suffix}。`);
  }
  return new InboxMateError('AUTH_FAILED', 400, `OffiLive 登录失败，请检查邮箱账号和密码${suffix}。`);
}

async function requestOffiLiveAppDataWithRetry(
  request: APIRequestContext,
  signal: AbortSignal,
  deadline: number,
  stage: string,
  attemptLimit = OFFILIVE_AJAX_BOOTSTRAP_ATTEMPTS
): Promise<{ appData?: OffiLiveAppData; attempts: number; lastError?: unknown }> {
  let lastError: unknown;
  let attempts = 0;
  for (let attempt = 1; attempt <= attemptLimit; attempt += 1) {
    if (signal.aborted) throw new InboxMateError('CANCELLED');
    const timeout = offiLiveAjaxRequestTimeout(deadline, OFFILIVE_AJAX_BOOTSTRAP_TIMEOUT_MS);
    if (timeout === 0) {
      lastError = offiLiveAjaxBudgetError(stage);
      break;
    }
    attempts = attempt;
    try {
      return { appData: await requestOffiLiveAppData(request, timeout), attempts: attempt };
    } catch (error) {
      lastError = error;
    }
  }
  if (signal.aborted) throw new InboxMateError('CANCELLED');
  return { attempts, lastError };
}

interface OffiLiveAjaxRetryOptions {
  authAccountHash?: string;
  deadline: number;
  email: string;
  signal: AbortSignal;
  stage: string;
  timeout: number;
  traceId: string;
}

async function postOffiLiveAjaxWithRetry(
  request: APIRequestContext,
  action: string,
  form: Record<string, string>,
  options: OffiLiveAjaxRetryOptions
): Promise<OffiLiveJsonResponse> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= OFFILIVE_AJAX_REQUEST_ATTEMPTS; attempt += 1) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    const timeout = offiLiveAjaxRequestTimeout(options.deadline, options.timeout);
    if (timeout === 0) throw offiLiveAjaxBudgetError(options.stage);
    try {
      return await postOffiLiveAjax(request, action, form, timeout, options.authAccountHash);
    } catch (error) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');
      lastError = error;
      if (!isRetryableOffiLiveAjaxError(error) || attempt === OFFILIVE_AJAX_REQUEST_ATTEMPTS) throw error;
      diagLogger.warn(
        'web_rpa',
        options.stage,
        `OffiLive ${options.stage}遇到临时网络异常，准备重试（${attempt + 1}/${OFFILIVE_AJAX_REQUEST_ATTEMPTS}）`,
        { attempt, error: safeOffiLiveErrorSummary(error), traceId: options.traceId },
        options.email,
        options.traceId
      );
      const retryDelay = Math.min(OFFILIVE_AJAX_RETRY_DELAY_MS, Math.max(0, options.deadline - Date.now()));
      if (retryDelay < OFFILIVE_AJAX_MIN_REQUEST_TIMEOUT_MS) throw offiLiveAjaxBudgetError(options.stage);
      await waitForOffiLiveAjaxRetry(options.signal, retryDelay);
    }
  }
  throw lastError ?? new InboxMateError('CONNECTION_FAILED', 502, `OffiLive ${options.stage}请求失败。`);
}

export async function fetchOffiLiveViaAjax(
  request: APIRequestContext,
  account: AccountInput,
  options: FetchAccountOptions,
  traceId: string,
  proxy: ProxyResolution,
  ajaxDeadline = Date.now() + OFFILIVE_AJAX_TOTAL_BUDGET_MS
): Promise<FetchAccountResult | undefined> {
  if (account.auth.type !== 'app_password') {
    throw new InboxMateError('AUTH_REQUIRED', 400, 'OffiLive Ajax 抓取需要邮箱账号密码。');
  }

  const startedAt = Date.now();
  const email = account.email;
  const bootstrap = await requestOffiLiveAppDataWithRetry(request, options.signal, ajaxDeadline, 'Ajax 引导');
  if (!bootstrap.appData) {
    const message = safeOffiLiveErrorSummary(bootstrap.lastError);
    diagLogger.warn(
      'web_rpa',
      'Ajax 引导',
      `OffiLive Ajax 引导失败（尝试 ${bootstrap.attempts} 次）`,
      { error: message, attempts: bootstrap.attempts, traceId },
      email,
      traceId
    );
    return undefined;
  }

  diagLogger.info(
    'web_rpa',
    'Ajax 引导',
    `OffiLive RainLoop Ajax 引导成功（尝试 ${bootstrap.attempts} 次）`,
    { attempts: bootstrap.attempts, elapsedMs: Date.now() - startedAt, traceId },
    email,
    traceId
  );

  let appData = bootstrap.appData;
  let loginPayload: JsonRecord | undefined;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    try {
      const login = await postOffiLiveAjaxWithRetry(
        request,
        'Login',
        {
          Email: email,
          Login: '',
          Password: account.auth.secret,
          Language: '',
          AdditionalCode: '',
          AdditionalCodeSignMe: '0',
          SignMe: '0',
          XToken: appData.token
        },
        {
          deadline: ajaxDeadline,
          email,
          signal: options.signal,
          stage: 'Ajax 登录',
          timeout: OFFILIVE_AJAX_LOGIN_TIMEOUT_MS,
          traceId
        }
      );
      loginPayload = login.payload;
    } catch (error) {
      if (error instanceof InboxMateError) throw error;
      throw classifyOffiLiveBrowserError(error, 'Ajax 登录', proxy);
    }

    if (offiLiveAjaxErrorCode(loginPayload) !== 101) break;
    if (attempt === 2) {
      diagLogger.warn(
        'web_rpa',
        'Ajax 登录',
        'OffiLive 连续拒绝 Ajax 会话令牌，停止本次登录',
        { errorCode: 101, traceId },
        email,
        traceId
      );
      throw new InboxMateError('CONNECTION_FAILED', 502, 'OffiLive 连续拒绝 Ajax 会话令牌，请稍后重试。');
    }

    const refreshed = await requestOffiLiveAppDataWithRetry(
      request,
      options.signal,
      ajaxDeadline,
      '刷新 Ajax 会话令牌'
    );
    if (!refreshed.appData) {
      throw classifyOffiLiveBrowserError(
        refreshed.lastError ?? new Error('refreshed AppData missing'),
        '刷新 Ajax 会话令牌',
        proxy
      );
    }
    appData = refreshed.appData;
  }

  if (!loginPayload || !isOffiLiveAjaxSuccess(loginPayload, 'Login')) {
    throw classifyOffiLiveLoginResponse(loginPayload ?? {});
  }
  if (loginPayload.TwoFactorAuth === true) throw classifyOffiLiveLoginResponse(loginPayload);

  diagLogger.info(
    'web_rpa',
    'Ajax 登录',
    'OffiLive RainLoop Ajax 登录成功，正在确认会话',
    { elapsedMs: Date.now() - startedAt, traceId },
    email,
    traceId
  );

  const authenticated = await requestOffiLiveAppDataWithRetry(
    request,
    options.signal,
    ajaxDeadline,
    '确认 Ajax 登录会话',
    OFFILIVE_AJAX_AUTH_CONFIRM_ATTEMPTS
  );
  if (!authenticated.appData) {
    const error = authenticated.lastError ?? new Error('authenticated AppData missing');
    throw classifyOffiLiveBrowserError(error, '确认 Ajax 登录会话', proxy);
  }
  appData = authenticated.appData;
  if (!appData.auth || (appData.email && appData.email.toLowerCase() !== email.toLowerCase())) {
    throw new InboxMateError('AUTH_FAILED', 400, 'OffiLive 登录响应成功，但未建立有效邮箱会话。');
  }

  options.onProgress('searching');
  const requestedLimit = Math.min(50, Math.max(1, options.maxMessages || 5));
  let listPayload: JsonRecord;
  try {
    const list = await postOffiLiveAjaxWithRetry(
      request,
      'MessageList',
      {
        Folder: 'INBOX',
        Offset: '0',
        Limit: String(requestedLimit),
        Search: '',
        UidNext: '',
        UseThreads: '0',
        ThreadUid: '',
        XToken: appData.token
      },
      {
        authAccountHash: appData.authAccountHash,
        deadline: ajaxDeadline,
        email,
        signal: options.signal,
        stage: 'Ajax 邮件列表',
        timeout: OFFILIVE_AJAX_LIST_TIMEOUT_MS,
        traceId
      }
    );
    listPayload = list.payload;
  } catch (error) {
    if (error instanceof InboxMateError) throw error;
    throw classifyOffiLiveBrowserError(error, 'Ajax 邮件列表', proxy);
  }

  if (!isOffiLiveAjaxSuccess(listPayload, 'MessageList')) {
    const code = offiLiveAjaxErrorCode(listPayload);
    const detail = offiLiveAjaxErrorDetail(listPayload);
    const errorCode =
      code === 953
        ? 'TIMEOUT'
        : code === 102
          ? 'AUTH_FAILED'
          : code === 103
            ? 'AUTH_DENIED'
            : 'CONNECTION_FAILED';
    throw new InboxMateError(
      errorCode,
      errorCode === 'TIMEOUT'
        ? 408
        : errorCode === 'AUTH_FAILED' || errorCode === 'AUTH_DENIED'
          ? 400
          : 502,
      `OffiLive 无法读取收件箱${detail ? `：${detail}` : ''}。`
    );
  }

  const listedMails = parseOffiLiveMessageListPayload(listPayload);
  const mails = selectMailComMessages(listedMails, options);
  options.onProgress('parsing');

  let hydratedCount = 0;
  let bodyFailureCount = 0;
  let firstBodyFailure = '';
  const bodyDeadline = Math.min(ajaxDeadline, Date.now() + OFFILIVE_AJAX_BODY_BUDGET_MS);
  for (const mail of mails) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    const folder = mail.folder || 'INBOX';
    const bodyRemaining = Math.max(0, bodyDeadline - Date.now());
    const getStageLimit = Math.min(
      OFFILIVE_AJAX_BODY_TIMEOUT_MS,
      Math.max(OFFILIVE_AJAX_MIN_REQUEST_TIMEOUT_MS, Math.floor(bodyRemaining / 2))
    );
    const getTimeout = offiLiveAjaxRequestTimeout(bodyDeadline, getStageLimit);
    if (getTimeout === 0) {
      bodyFailureCount += 1;
      firstBodyFailure ||= '正文总时间预算已耗尽';
      break;
    }

    let response: OffiLiveJsonResponse | undefined;
    let getFailure = '';
    try {
      response = await getOffiLiveMessage(request, appData, folder, mail.id, getTimeout);
      if (!isOffiLiveAjaxSuccess(response.payload, 'Message')) {
        const code = offiLiveAjaxErrorCode(response.payload);
        getFailure = code === undefined ? 'GET 返回无效结果' : `GET ErrorCode ${code}`;
        response = undefined;
      }
    } catch (error) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');
      getFailure = `GET ${safeOffiLiveErrorSummary(error)}`;
    }

    if (!response) {
      const postTimeout = offiLiveAjaxRequestTimeout(bodyDeadline, OFFILIVE_AJAX_BODY_TIMEOUT_MS);
      if (postTimeout === 0) {
        bodyFailureCount += 1;
        firstBodyFailure ||= `${getFailure || 'GET 失败'}；POST 未执行（正文总时间预算已耗尽）`;
        break;
      }
      try {
        response = await postOffiLiveAjax(
          request,
          'Message',
          {
            Folder: folder,
            Uid: mail.id,
            XToken: appData.token
          },
          postTimeout,
          appData.authAccountHash
        );
      } catch (error) {
        if (options.signal.aborted) throw new InboxMateError('CANCELLED');
        bodyFailureCount += 1;
        firstBodyFailure ||= `${getFailure || 'GET 失败'}；POST ${safeOffiLiveErrorSummary(error)}`;
        continue;
      }
    }

    if (!isOffiLiveAjaxSuccess(response.payload, 'Message')) {
      const code = offiLiveAjaxErrorCode(response.payload);
      bodyFailureCount += 1;
      firstBodyFailure ||= `${getFailure ? `${getFailure}；` : ''}POST ${
        code === undefined ? '返回无效结果' : `ErrorCode ${code}`
      }`;
      continue;
    }
    const detail = parseOffiLiveMessagePayload(response.payload);
    if (!detail || detail.id !== mail.id) {
      bodyFailureCount += 1;
      firstBodyFailure ||= '正文响应与邮件列表不匹配';
      continue;
    }
    mail.subject = detail.subject || mail.subject;
    mail.from = detail.from || mail.from;
    if (detail.receivedAt.getTime() > 0) mail.receivedAt = detail.receivedAt;
    mail.htmlBody = detail.html || undefined;
    mail.body = detail.plain || (detail.html ? await htmlToText(detail.html) : '');
    mail.snippet = mail.body.replace(/\s+/g, ' ').slice(0, 300) || mail.snippet || mail.subject;
    hydratedCount += 1;
  }

  const result = mapResult(account, mails, { idPrefix: 'offilive', defaultFrom: 'OffiLive 用户' });
  if (mails.length > 0 && hydratedCount === 0 && bodyFailureCount > 0 && !result.primaryCode) {
    diagLogger.error(
      'web_rpa',
      'Ajax 邮件正文',
      'OffiLive 收件箱列表读取成功，但所有邮件正文请求均失败',
      { bodyFailureCount, firstFailure: firstBodyFailure, elapsedMs: Date.now() - startedAt, traceId },
      email,
      traceId
    );
    throw new InboxMateError(
      'CONNECTION_FAILED',
      502,
      'OffiLive 已读取到收件箱列表，但所有邮件正文请求均失败，未将其误判为无验证码。'
    );
  }
  diagLogger.info(
    'web_rpa',
    'Ajax 抓取完成',
    `OffiLive Ajax 抓取完成（邮件 ${result.messages.length} 封，正文 ${hydratedCount} 封，验证码 ${result.primaryCode?.code ?? '无'}）`,
    {
      totalMails: result.messages.length,
      hydratedCount,
      bodyFailureCount,
      primaryCode: result.primaryCode?.code,
      elapsedMs: Date.now() - startedAt,
      traceId
    },
    email,
    traceId
  );
  return result;
}

/** Headless Playwright driver for OffiLive / OffiDocs (RainLoop Webmail) accounts */
async function fetchOffiLiveAccount(
  account: AccountInput,
  options: FetchAccountOptions,
  traceId: string,
  proxy: ProxyResolution
): Promise<FetchAccountResult> {
  if (account.auth.type !== 'app_password') {
    throw new InboxMateError('AUTH_REQUIRED', 400, 'OffiLive 网页抓取需要邮箱账号密码。');
  }
  if (options.signal.aborted) throw new InboxMateError('CANCELLED');

  const email = account.email;
  const password = account.auth.secret;
  let stage = '启动浏览器';
  let context: BrowserContext | null = null;
  let activePage: Page | null = null;
  let browserAcquired = false;

  const closeOnAbort = (): void => {
    void context?.close().catch(() => {});
  };
  options.signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    options.onProgress('authenticating');
    stage = '启动浏览器';
    const startTime = Date.now();
    const browser = await acquireBrowser();
    browserAcquired = true;
    diagLogger.info(
      'web_rpa',
      stage,
      `启动无头浏览器 [并发任务数: ${activeRunningAccounts}, 代理: ${proxy.server ?? '直连'}]`,
      { proxy: proxy.source, proxyServer: proxy.server, concurrentTasks: activeRunningAccounts, provider: 'offilive', traceId },
      email,
      traceId
    );

    const contextOptions = createOffiLiveContextOptions(browser.version(), proxy.server);
    context = await browser.newContext(contextOptions);
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    stage = 'Ajax 快速抓取';
    const ajaxDeadline = startTime + OFFILIVE_AJAX_TOTAL_BUDGET_MS;
    let ajaxResult = await fetchOffiLiveViaAjax(context.request, account, options, traceId, proxy, ajaxDeadline);
    if (!ajaxResult) {
      diagLogger.warn(
        'web_rpa',
        'Ajax 新会话重试',
        'OffiLive 首次 Ajax 引导失败，正在新建代理会话重试',
        { elapsedMs: Date.now() - startTime, traceId },
        email,
        traceId
      );
      await context.close().catch(() => {});
      context = await browser.newContext(contextOptions);
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');
      ajaxResult = await fetchOffiLiveViaAjax(context.request, account, options, traceId, proxy, ajaxDeadline);
    }
    if (ajaxResult) return ajaxResult;
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    diagLogger.info(
      'web_rpa',
      '页面 RPA 兜底',
      `OffiLive Ajax 引导不可用，改用页面 RPA（已耗时 ${formatDuration(Date.now() - startTime)}）`,
      { traceId },
      email,
      traceId
    );

    const page = await context.newPage();
    activePage = page;
    await installOffiLiveNetworkGuards(page, contextOptions.userAgent ?? createOffiLiveUserAgent(browser.version()));

    // 1. Listen for RainLoop Ajax JSON responses (Turbo Mode)
    const ajaxMessages: OffiLiveCapturedMail[] = [];
    let mailListSeen = false;

    page.on('response', async (response) => {
      const url = response.url();
      if (url.includes('/?/Ajax/') || url.includes('/SOGo/?/Ajax/') || url.includes('Action=MessageList') || url.includes('Action=Message')) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json') || contentType.includes('text/javascript')) {
            const data = asJsonRecord(await response.json());
            if (!data) return;
            if (asJsonString(data.Action) === 'MessageList' && isOffiLiveAjaxSuccess(data, 'MessageList')) {
              mailListSeen = true;
              for (const parsed of parseOffiLiveMessageListPayload(data)) {
                if (!ajaxMessages.some((mail) => mail.id === parsed.id)) ajaxMessages.push(parsed);
              }
            } else if (asJsonString(data.Action) === 'Message' && isOffiLiveAjaxSuccess(data, 'Message')) {
              const detail = parseOffiLiveMessagePayload(data);
              if (!detail) return;
              const body = detail.plain || (detail.html ? await htmlToText(detail.html) : '');
              const match = ajaxMessages.find((mail) => mail.id === detail.id);
              if (match) {
                match.subject = detail.subject || match.subject;
                match.from = detail.from || match.from;
                if (detail.receivedAt.getTime() > 0) match.receivedAt = detail.receivedAt;
                match.body = body || match.body;
                match.htmlBody = detail.html || match.htmlBody;
                match.snippet = body.replace(/\s+/g, ' ').slice(0, 160) || match.snippet;
              } else {
                ajaxMessages.push({
                  id: detail.id,
                  folder: detail.folder,
                  subject: detail.subject,
                  from: detail.from,
                  receivedAt: detail.receivedAt,
                  snippet: body.replace(/\s+/g, ' ').slice(0, 160) || detail.subject,
                  body,
                  htmlBody: detail.html || undefined
                });
              }
            }
          }
        } catch {
          // ignore parsing error
        }
      }
    });

    // 2. Open the RainLoop login page directly and retry transient upstream failures.
    stage = '打开登录页';
    diagLogger.info(
      'web_rpa',
      stage,
      `正在打开 OffiLive RainLoop 登录页 (${OFFILIVE_LOGIN_URL})`,
      { proxy: proxy.server ?? '直连', traceId },
      email,
      traceId
    );

    const loginForm = await ensureOffiLiveLoginFormVisible(page, options.signal);
    diagLogger.info(
      'web_rpa',
      stage,
      `OffiLive 登录页加载成功 (HTTP ${loginForm.status ?? '未知'}，尝试 ${loginForm.attempts}/${OFFILIVE_LOGIN_ATTEMPTS})`,
      { finalUrl: page.url(), httpStatus: loginForm.status, attempts: loginForm.attempts, traceId },
      email,
      traceId
    );

    // 3. Fill Credentials
    stage = '填写账号密码';
    const emailInput = loginForm.emailInput;
    const passInput = loginForm.passwordInput;
    await emailInput.fill(email);
    await passInput.fill(password);

    diagLogger.info(
      'web_rpa',
      stage,
      `成功填写 OffiLive 账号及密码，准备提交登录`,
      { traceId },
      email,
      traceId
    );

    // 4. Submit Login Form
    stage = '提交登录';
    const submitBtn = page.locator('button.buttonLogin, button[type="submit"].btn-submit-icon-wrp, .thm-login button[type="submit"]').first();
    if (await submitBtn.isVisible({ timeout: 1500 }).catch(() => false)) {
      await submitBtn.click();
    } else {
      await passInput.press('Enter');
    }

    diagLogger.info(
      'web_rpa',
      stage,
      `已提交登录，正在等待收件箱加载 (启用 Fail-Fast 熔断监听)`,
      { traceId },
      email,
      traceId
    );

    // 5. Wait for Inbox or Fail-Fast on Auth Error
    stage = '等待收件箱';
    const inboxStart = Date.now();

    const errorAlert = page.locator('.alert.alertError, .alert.alert-danger, .alertError, .b-login-content .alert').first();
    const inboxItem = page.locator('.messageListItem, .b-message-view, #rl-content.rl-content-show .messages-list, .RL-Mail').first();

    let loginSuccess = false;
    while (Date.now() - inboxStart < 30_000) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');

      // Fail-Fast: Check error alert
      if (await errorAlert.isVisible({ timeout: 400 }).catch(() => false)) {
        const errText = (await errorAlert.textContent().catch(() => ''))?.trim() || '账号或密码错误';
        const forensics = await captureForensicsSnapshot(page, 'login_failed');
        diagLogger.error(
          'web_rpa',
          stage,
          `OffiLive 登录失败 (Fail-Fast 熔断): ${errText}`,
          { error: errText, ...forensics, traceId },
          email,
          traceId
        );
        throw new InboxMateError('AUTH_FAILED', 400, `OffiLive 登录失败：${errText}`);
      }

      // Success check: Inbox items or container visible
      if (await inboxItem.isVisible({ timeout: 400 }).catch(() => false)) {
        loginSuccess = true;
        break;
      }

      // An empty MessageList response also proves that the inbox loaded successfully.
      if (mailListSeen) {
        loginSuccess = true;
        break;
      }

      await page.waitForTimeout(600);
    }

    if (!loginSuccess) {
      const forensics = await captureForensicsSnapshot(page, 'inbox_loading_timeout');
      diagLogger.error(
        'web_rpa',
        stage,
        `OffiLive 30秒内未加载出收件箱列表`,
        { ...forensics, traceId },
        email,
        traceId
      );
      throw new InboxMateError('TIMEOUT', 400, `OffiLive 网页登录超时：未在规定时间内加载出收件箱。`);
    }

    diagLogger.info(
      'web_rpa',
      stage,
      `OffiLive 收件箱加载成功，耗时 ${formatDuration(Date.now() - inboxStart)}`,
      { ajaxInterceptedCount: ajaxMessages.length, traceId },
      email,
      traceId
    );

    // 6. Fetch / Parse Emails
    stage = '抓取邮件';
    options.onProgress('parsing');

    await page.waitForTimeout(1000);

    const messageListLocators = page.locator('.messageListItem');
    const mailCount = await messageListLocators.count().catch(() => 0);

    const messages: EmailItem[] = [];

    if (mailCount === 0 && ajaxMessages.length === 0) {
      diagLogger.info(
        'web_rpa',
        stage,
        `OffiLive 收件箱为空（未收到邮件）`,
        { traceId },
        email,
        traceId
      );
      return { messages: [] };
    }

    const requestedLimit =
      typeof options.maxMessages === 'number' && options.maxMessages > 0 ? options.maxMessages : 5;
    const processLimit = Math.min(requestedLimit, Math.max(mailCount, ajaxMessages.length));
    diagLogger.info(
      'web_rpa',
      stage,
      `开始解析最新 ${processLimit} 封邮件 (DOM邮件数: ${mailCount}, Ajax拦截数: ${ajaxMessages.length})`,
      { processLimit, mailCount, traceId },
      email,
      traceId
    );

    for (let i = 0; i < processLimit; i++) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');

      let subject = '';
      let from = '';
      let date = new Date();
      let bodyText = '';
      const ajaxMessage = ajaxMessages[i];

      if (ajaxMessage) {
        subject = ajaxMessage.subject;
        from = ajaxMessage.from;
        date = ajaxMessage.receivedAt;
        bodyText = ajaxMessage.body;
      }

      if (i < mailCount) {
        try {
          const itemLoc = messageListLocators.nth(i);
          if (!subject) {
            const subjectParts = await itemLoc
              .locator('.subject-prefix, .subject-suffix')
              .allTextContents()
              .catch(() => []);
            subject = subjectParts.join('').trim();
          }
          if (!from) {
            from = (await itemLoc.locator('.sender').textContent().catch(() => ''))?.trim() ?? '';
          }

          await itemLoc.click({ timeout: 2000 }).catch(() => {});
          await page.waitForTimeout(800);

          // The Message Ajax response is asynchronous; re-read the same captured object after the click.
          if (ajaxMessage?.body) bodyText = ajaxMessage.body;

          const rainLoopBody = await page
            .locator('.bodyText .b-text-part:visible, .bodyText .b-html-part:visible, .bodyText')
            .first()
            .innerText({ timeout: 2500 })
            .catch(() => '');
          if (rainLoopBody.trim()) {
            bodyText = rainLoopBody.trim();
          }

          if (!bodyText) {
            const outerBody = await page
              .locator('.b-message-view .message-body, .msg-content, .b-message-view .content')
              .first()
              .textContent({ timeout: 1500 })
              .catch(() => '');
            if (outerBody && outerBody.trim()) {
              bodyText = outerBody.trim();
            }
          }
        } catch {
          // ignore single item error
        }
      }

      const emailItem: EmailItem = {
        id: `offilive-${i + 1}-${Date.now()}`,
        accountEmail: email,
        provider: 'offilive',
        subject: subject || '(无主题)',
        from: from || 'OffiLive 用户',
        receivedAt: date.toISOString(),
        snippet: (bodyText || subject).slice(0, 160),
        textBody: bodyText || subject,
        htmlBody: ajaxMessage?.htmlBody
      };

      messages.push(emailItem);
    }

    // 7. Extract Verification Code
    stage = '解析验证码';
    let primaryCode: CodeMatch | undefined;
    for (const msg of messages) {
      const code = extractVerificationCode({
        subject: msg.subject,
        text: msg.textBody || msg.snippet,
        receivedAt: msg.receivedAt,
        from: msg.from
      });
      if (code) {
        primaryCode = code;
        msg.codeMatch = code;
        break;
      }
    }

    diagLogger.info(
      'web_rpa',
      stage,
      `OffiLive 邮件抓取与解析完成 (解析到 ${messages.length} 封邮件，提取验证码: ${primaryCode?.code ?? '无'})`,
      { totalMails: messages.length, primaryCode: primaryCode?.code, traceId },
      email,
      traceId
    );

    return { messages, primaryCode };
  } catch (error: unknown) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    const forensics = activePage ? await captureForensicsSnapshot(activePage, 'unknown_error').catch(() => undefined) : undefined;
    if (error instanceof InboxMateError) {
      if (stage === '打开登录页') {
        diagLogger.error(
          'web_rpa',
          stage,
          `OffiLive 登录入口异常: ${error.message}`,
          { code: error.code, ...forensics, traceId },
          email,
          traceId
        );
      }
      throw error;
    }
    const message = safeOffiLiveErrorSummary(error);
    const classified = classifyOffiLiveBrowserError(error, stage, proxy);
    diagLogger.error(
      'web_rpa',
      stage,
      `OffiLive RPA 执行异常: ${message}`,
      { code: classified.code, error: message, ...forensics, traceId },
      email,
      traceId
    );
    throw classified;
  } finally {
    options.signal.removeEventListener('abort', closeOnAbort);
    if (context) await context.close().catch(() => {});
    if (browserAcquired) await releaseBrowser();
  }
}

async function fetchMailComSingleSession(
  browser: Browser,
  account: AccountInput,
  email: string,
  password: string,
  options: FetchAccountOptions,
  attempt: number,
  maxAttempts: number,
  traceId: string,
  proxy: ProxyResolution,
  overallDeadline: number,
  startTime: number
): Promise<FetchAccountResult> {
  let stage = '启动浏览器';
  let context: BrowserContext | null = null;
  let activePage: Page | null = null;

  const closeOnAbort = (): void => {
    void context?.close().catch(() => {});
  };
  options.signal.addEventListener('abort', closeOnAbort, { once: true });

  try {
    options.onProgress('authenticating');
    stage = '启动浏览器';
    const currentConcurrent = activeRunningAccounts;
    diagLogger.info(
      'web_rpa',
      stage,
      `启动无头浏览器 [并发任务数: ${currentConcurrent}, 代理: ${proxy.server ?? '直连'}, 尝试: ${attempt}/${maxAttempts}]`,
      { proxy: proxy.source, proxyServer: proxy.server, concurrentTasks: currentConcurrent, attempt, maxAttempts, traceId },
      email,
      traceId
    );

    context = await browser.newContext({
      proxy: proxy.server ? { server: proxy.server } : undefined,
      viewport: { width: 1280, height: 800 },
      locale: 'en-US'
    });
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    const page = await context.newPage();
    activePage = page;

    // Resource Abort Optimization: Strip heavy media, fonts, ads, and trackers while safely whitelisting 1st-party
    await page.route('**/*', (route) => {
      const request = route.request();
      const resourceType = request.resourceType();
      let hostname = '';
      try {
        hostname = new URL(request.url()).hostname.toLowerCase();
      } catch {
        return route.continue().catch(() => {});
      }

      // Always allow 1st-party Mail.com / 1&1 / UI-Portal domains & essential auth scripts
      const isFirstParty =
        hostname.endsWith('mail.com') ||
        hostname.endsWith('mailbody-ui.de') ||
        hostname.endsWith('ui-portal.de') ||
        hostname.endsWith('1and1.com') ||
        hostname.endsWith('1und1.de') ||
        hostname.endsWith('gmx.com') ||
        hostname.endsWith('gmx.net');

      // Block non-essential media & assets
      if (['image', 'media', 'font'].includes(resourceType)) {
        return route.abort().catch(() => {});
      }

      // Block known 3rd-party ad networks and telemetry
      if (!isFirstParty) {
        if (
          hostname.includes('google-analytics') ||
          hostname.includes('googletagmanager') ||
          hostname.includes('doubleclick') ||
          hostname.includes('criteo') ||
          hostname.includes('outbrain') ||
          hostname.includes('taboola') ||
          hostname.includes('quantserve') ||
          hostname.includes('scorecardresearch') ||
          hostname.includes('adnxs') ||
          hostname.includes('facebook') ||
          hostname.includes('tiktok') ||
          hostname.includes('statcounter')
        ) {
          return route.abort().catch(() => {});
        }
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

    let loginBlocked = false;
    let blockedReason = '';

    page.on('response', async (response) => {
      const respUrl = response.url().toLowerCase();
      const status = response.status();
      if ((respUrl.includes('/login') || respUrl.includes('/navigator/')) && (status === 403 || status === 429)) {
        loginBlocked = true;
        blockedReason = `HTTP ${status}`;
      }

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
    diagLogger.debug('web_rpa', stage, `正在导航到 Mail.com 首页 (耗时: ${formatDuration(Date.now() - startTime)})`, { url: MAIL_COM_HOME }, email, traceId);
    await page.goto(MAIL_COM_HOME, { waitUntil: 'domcontentloaded', timeout: NAVIGATION_TIMEOUT_MS });
    const initialContent = await page.content().catch(() => '');
    if (isCaptchaPage(initialContent)) {
      const snapshot = await captureForensicsSnapshot(page, stage);
      diagLogger.warn('web_rpa', stage, '首页触发 Cloudflare/验证码阻拦', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
      throw new InboxMateError('CAPTCHA_TRIGGERED');
    }
    if (isMailComBlockedContent(initialContent, page.url())) {
      const snapshot = await captureForensicsSnapshot(page, stage);
      diagLogger.warn('web_rpa', stage, '首页触发安全风控拦截 (403 Blocked)', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
      throw new InboxMateError('PROXY_BLOCKED', 400, 'Mail.com 访问被目标安全风控拦截（HTTP 403 Blocked）。');
    }

    stage = '打开登录框';
    const { emailInput, passwordInput } = await ensureMailComLoginFormVisible(page);

    stage = '填写账号密码';
    await humanType(emailInput, email, Math.floor(Math.random() * 20 + 25));
    await page.waitForTimeout(Math.floor(Math.random() * 150 + 100));
    await humanType(passwordInput, password, Math.floor(Math.random() * 25 + 30));
    await page.waitForTimeout(Math.floor(Math.random() * 200 + 150));

    options.onProgress('searching');
    stage = '提交登录';
    diagLogger.debug('web_rpa', stage, `提交登录表单 (当前并发: ${activeRunningAccounts}, 尝试: ${attempt}/${maxAttempts})`, { currentUrl: page.url() }, email, traceId);
    const loginForm = page.locator('form').filter({ has: emailInput });
    const submitButton = loginForm.locator('button[type="submit"]').filter({ visible: true }).first();
    if ((await submitButton.count()) > 0) {
      await submitButton.click({ timeout: 10_000 });
    } else {
      await loginForm.evaluate((form) => {
        if (!(form instanceof HTMLFormElement)) throw new Error('Mail.com login form not found');
        form.requestSubmit();
      });
    }

    stage = '等待收件箱';
    const singleSessionTimeout = Math.min(25_000, Math.max(5_000, overallDeadline - Date.now() - 2_000));
    const deadline = Date.now() + singleSessionTimeout;
    let lastSkipAttempt = 0;

    while (Date.now() < deadline && !mailListSeen) {
      if (loginBlocked) {
        const snapshot = await captureForensicsSnapshot(page, stage);
        diagLogger.warn('web_rpa', stage, `登录触发目标安全风控拦截 (${blockedReason || '403 Blocked'})`, { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('PROXY_BLOCKED', 400, `Mail.com 登录被目标安全风控拦截（${blockedReason || 'HTTP 403 Blocked'}）。`);
      }

      const remaining = deadline - Date.now();
      const loaded = await Promise.race([
        mailListPromise.then(() => true),
        page.waitForTimeout(Math.min(1000, remaining)).then(() => false)
      ]);
      if (loaded || mailListSeen) break;

      // Auto-skip interstitials / promos / consent every 1.5s
      if (Date.now() - lastSkipAttempt > 1500) {
        lastSkipAttempt = Date.now();
        await tryAutoSkipInterstitials(page);
      }

      const currentUrl = page.url();
      const content = await page.content().catch(() => '');
      if (loginBlocked || isMailComBlockedContent(content, currentUrl)) {
        const snapshot = await captureForensicsSnapshot(page, stage);
        diagLogger.warn('web_rpa', stage, '检测到 Mail.com 安全风控拦截页面 (403 Blocked)', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('PROXY_BLOCKED', 400, 'Mail.com 登录被目标安全风控拦截（HTTP 403 Blocked）。');
      }
      if (isCaptchaPage(content)) {
        const snapshot = await captureForensicsSnapshot(page, stage);
        diagLogger.warn('web_rpa', stage, '登录中触发验证码阻拦', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('CAPTCHA_TRIGGERED');
      }
      if (isAuthenticationFailure(currentUrl, content)) {
        const snapshot = await captureForensicsSnapshot(page, stage);
        diagLogger.warn('web_rpa', stage, '账号或密码错误', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('AUTH_FAILED');
      }
    }

    if (!mailListSeen) {
      const content = await page.content().catch(() => '');
      const snapshot = await captureForensicsSnapshot(page, stage);

      if (loginBlocked || isMailComBlockedContent(content, page.url())) {
        diagLogger.warn('web_rpa', stage, '检测到 Mail.com 安全风控拦截页面 (403 Blocked)', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('PROXY_BLOCKED', 400, 'Mail.com 登录被目标安全风控拦截（HTTP 403 Blocked）。');
      }
      if (isCaptchaPage(content)) {
        diagLogger.warn('web_rpa', stage, '登录后检测到验证码', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('CAPTCHA_TRIGGERED');
      }
      if (isAuthenticationFailure(page.url(), content)) {
        diagLogger.warn('web_rpa', stage, '登录后检测到密码错误', { ...snapshot, concurrentTasks: activeRunningAccounts }, email, traceId);
        throw new InboxMateError('AUTH_FAILED');
      }

      diagLogger.warn(
        'web_rpa',
        stage,
        `单次会话未在 ${Math.round(singleSessionTimeout / 1000)} 秒内加载出收件箱列表 (并发: ${activeRunningAccounts}, 尝试: ${attempt}/${maxAttempts}, 耗时: ${formatDuration(Date.now() - startTime)})`,
        {
          ...snapshot,
          concurrentTasks: activeRunningAccounts,
          durationMs: Date.now() - startTime,
          proxy: proxy.server || '直连 Direct'
        },
        email,
        traceId
      );

      throw new InboxMateError(
        'TIMEOUT',
        400,
        `Mail.com 登录成功后未在 ${Math.round(singleSessionTimeout / 1000)} 秒内加载收件箱（当前并发: ${activeRunningAccounts}）。`
      );
    }

    const postLoginContent = await page.content().catch(() => '');
    if (isCaptchaPage(postLoginContent)) throw new InboxMateError('CAPTCHA_TRIGGERED');
    if (isAuthenticationFailure(page.url(), postLoginContent)) throw new InboxMateError('AUTH_FAILED');

    options.onProgress('parsing');
    stage = '解析邮件列表';
    if (capturedMails.length === 0) mergeCapturedMails(capturedMails, await parseMailboxDom(page));
    const selectedMails = selectMailComMessages(capturedMails, options);
    diagLogger.info('web_rpa', stage, `捕获到 ${capturedMails.length} 封邮件，筛选出 ${selectedMails.length} 封`, {
      concurrentTasks: activeRunningAccounts,
      totalCaptured: capturedMails.length,
      selectedCount: selectedMails.length
    }, email, traceId);

    stage = '抓取邮件正文';
    await hydrateMailBodies(
      page,
      selectedMails,
      options.signal,
      () => [...mailboxAccessTokens],
      () => noCacheKey
    );
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');

    const mapped = mapResult(account, selectedMails);
    diagLogger.info('web_rpa', '抓取成功', `完成邮件抓取，识别验证码: ${mapped.primaryCode?.code || '无'} (总耗时: ${formatDuration(Date.now() - startTime)})`, {
      code: mapped.primaryCode?.code,
      messageCount: mapped.messages.length,
      durationMs: Date.now() - startTime,
      concurrentTasks: activeRunningAccounts,
      attempts: attempt
    }, email, traceId);

    return mapped;
  } catch (error) {
    if (options.signal.aborted) throw new InboxMateError('CANCELLED');
    if (error instanceof InboxMateError) {
      diagLogger.warn('web_rpa', stage, `业务异常: ${error.message} (并发任务数: ${activeRunningAccounts})`, {
        code: error.code,
        concurrentTasks: activeRunningAccounts,
        attempt,
        maxAttempts
      }, email, traceId);
      throw error;
    }
    const classified = classifyBrowserError(error, stage, proxy);
    console.error(`[web-rpa] stage=${stage} error=${error instanceof Error ? error.message : String(error)}`);
    const snapshot = await captureForensicsSnapshot(activePage, stage);
    diagLogger.error('web_rpa', stage, `浏览器抓取异常: ${error instanceof Error ? error.message : String(error)} (并发: ${activeRunningAccounts})`, {
      ...snapshot,
      stage,
      concurrentTasks: activeRunningAccounts,
      proxy: proxy.server,
      attempt,
      maxAttempts
    }, email, traceId);
    throw classified;
  } finally {
    options.signal.removeEventListener('abort', closeOnAbort);
    if (context) await context.close().catch(() => {});
  }
}

/** Headless Playwright driver used for Mail.com-routed accounts with intelligent retry. */
export async function fetchMailComAccount(
  account: AccountInput,
  options: FetchAccountOptions
): Promise<FetchAccountResult> {
  if (account.auth.type !== 'app_password') {
    throw new InboxMateError('AUTH_REQUIRED', 400, 'Mail.com 网页抓取需要邮箱账号密码。');
  }
  if (options.signal.aborted) throw new InboxMateError('CANCELLED');

  const email = account.email;
  const password = account.auth.secret;
  const traceId = options.traceId || randomUUID();
  const startTime = Date.now();
  const overallDeadline = startTime + MAILCOM_TOTAL_BUDGET_MS;
  const proxy = await detectRpaProxy();
  logNetworkResolution(proxy);

  let browserAcquired = false;
  let browser: Browser | null = null;

  try {
    // Hold 1 browser concurrency semaphore across all retry attempts in this task
    browser = await acquireBrowser();
    browserAcquired = true;

    for (let attempt = 1; attempt <= MAILCOM_MAX_ATTEMPTS; attempt += 1) {
      if (options.signal.aborted) throw new InboxMateError('CANCELLED');

      const remainingBudget = overallDeadline - Date.now();
      if (remainingBudget < MAILCOM_MIN_REMAINING_BUDGET_MS && attempt > 1) {
        diagLogger.warn(
          'web_rpa',
          '重试超时',
          `Mail.com 任务总耗时预算不足 (${Math.round(remainingBudget / 1000)}s)，停止后续重试`,
          { attempt, maxAttempts: MAILCOM_MAX_ATTEMPTS, elapsedMs: Date.now() - startTime },
          email,
          traceId
        );
        break;
      }

      try {
        if (attempt > 1) {
          diagLogger.info(
            'web_rpa',
            '发起重试',
            `开始第 ${attempt}/${MAILCOM_MAX_ATTEMPTS} 次无痕会话尝试 (已耗时: ${formatDuration(Date.now() - startTime)})`,
            { attempt, maxAttempts: MAILCOM_MAX_ATTEMPTS, proxy: proxy.server ?? '直连' },
            email,
            traceId
          );
        }

        return await fetchMailComSingleSession(
          browser,
          account,
          email,
          password,
          options,
          attempt,
          MAILCOM_MAX_ATTEMPTS,
          traceId,
          proxy,
          overallDeadline,
          startTime
        );
      } catch (error) {
        if (options.signal.aborted) throw new InboxMateError('CANCELLED');

        const shouldRetry =
          isRetryableMailComError(error) &&
          attempt < MAILCOM_MAX_ATTEMPTS &&
          overallDeadline - Date.now() > MAILCOM_MIN_REMAINING_BUDGET_MS;

        if (!shouldRetry) {
          throw error;
        }

        const backoffBase = MAILCOM_RETRY_BASE_DELAY_MS * (2 ** (attempt - 1));
        const jitter = Math.floor(Math.random() * MAILCOM_RETRY_MAX_JITTER_MS);
        const retryDelay = Math.min(
          backoffBase + jitter,
          Math.max(0, overallDeadline - Date.now() - MAILCOM_MIN_REMAINING_BUDGET_MS)
        );

        const errMessage = error instanceof Error ? error.message : String(error);
        diagLogger.warn(
          'web_rpa',
          '异常退避',
          `Mail.com 抓取遭遇临时阻断或异常 [${errMessage}]，等待 ${retryDelay}ms 后执行第 ${attempt + 1}/${MAILCOM_MAX_ATTEMPTS} 次无痕重试`,
          {
            attempt,
            maxAttempts: MAILCOM_MAX_ATTEMPTS,
            retryDelayMs: retryDelay,
            error: errMessage
          },
          email,
          traceId
        );

        await waitForMailComRetry(options.signal, retryDelay);
      }
    }

    throw new InboxMateError('TIMEOUT', 400, `Mail.com 多次重试后仍未成功加载收件箱（共尝试 ${MAILCOM_MAX_ATTEMPTS} 次）。`);
  } finally {
    if (browserAcquired) {
      await releaseBrowser();
    }
  }
}

/** Top-level Web RPA Dispatcher */
export async function fetchAccountVerificationCodeViaWebRpa(
  account: AccountInput,
  options: FetchAccountOptions
): Promise<FetchAccountResult> {
  const domain = domainFromEmail(account.email);
  if (account.provider === 'offilive' || isOffiLiveDomain(domain)) {
    const traceId = options.traceId || randomUUID();
    const proxy = await detectRpaProxy();
    return fetchOffiLiveAccount(account, options, traceId, proxy);
  }
  return fetchMailComAccount(account, options);
}
