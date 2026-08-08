import type { ProviderId } from './types.js';
import { normalizeEmail, providerForEmail } from '../server/providers.js';

export type ParseConfidence = 'high' | 'medium' | 'low';
export type DetectedFormat = 'kv_bracket' | 'json_query' | 'delimiter' | 'single_oauth';
export type ParseMode = 'auto' | 'kv' | 'four_parts' | 'custom' | 'json';

export interface ParsedAccount {
  email: string;
  secret: string;
  refreshToken?: string;
  clientId?: string;
  provider: ProviderId;
  lineNumber: number;
  customHost?: string;
  customPort?: number;
  customProtocol?: 'imap' | 'pop3';
}

export interface InvalidAccountLine {
  lineNumber: number;
  reason: 'empty_secret' | 'invalid_email' | 'unsupported_provider' | 'duplicate' | 'missing_separator';
}

export interface ParseAccountTextResult {
  accounts: ParsedAccount[];
  invalid: InvalidAccountLine[];
}

export interface SmartParsedAccount extends ParsedAccount {
  confidence: ParseConfidence;
  detectedFormat: DetectedFormat;
  rawLine: string;
}

export interface SmartParseResult {
  accounts: SmartParsedAccount[];
  invalid: InvalidAccountLine[];
  stats: {
    totalLines: number;
    validCount: number;
    lowConfidenceCount: number;
    formatCounts: Record<DetectedFormat, number>;
  };
}

// UUID Regex: strict 36 chars with 4 dashes
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Email Regex - Match candidate emails
const CANDIDATE_EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

export function normalizeLinePunctuation(str: string): string {
  return str
    .replace(/：/g, ':')
    .replace(/；/g, ';')
    .replace(/＝/g, '=')
    .replace(/【|［/g, '[')
    .replace(/】|］/g, ']')
    .replace(/，/g, ',');
}

export function parseAccountLineSmart(
  rawLine: string,
  lineNumber = 1,
  mode: ParseMode = 'auto',
  customDelimiter?: string
): SmartParsedAccount | null {
  const rawTrimmed = rawLine.trim();
  if (!rawTrimmed || rawTrimmed.startsWith('#')) return null;

  const normalized = normalizeLinePunctuation(rawTrimmed);

  // 1. JSON Object Mode
  if ((mode === 'auto' || mode === 'json') && normalized.startsWith('{') && normalized.endsWith('}')) {
    try {
      const obj = JSON.parse(normalized);
      if (typeof obj === 'object' && obj !== null) {
        const email = String(
          obj.email || obj.account || obj.user || obj.username || obj.login || obj.mail || obj['邮箱'] || obj['账号'] || ''
        ).trim().replace(/^[^a-zA-Z0-9]+/, '');
        const secret = String(
          obj.secret || obj.password || obj.pwd || obj.pass || obj.app_password || obj['密码'] || obj['应用密码'] || ''
        ).trim();
        const clientId = String(obj.clientId || obj.client_id || obj.clientid || obj['客户端ID'] || '').trim() || undefined;
        const refreshToken = String(obj.refreshToken || obj.refresh_token || obj.token || obj['刷新令牌'] || '').trim() || undefined;
        const customHost = String(obj.host || obj.imapHost || obj.popHost || obj.server || obj['服务器'] || '').trim() || undefined;
        const rawPort = obj.port || obj.imapPort || obj.popPort || obj['端口'];
        const customPort = rawPort ? Number(rawPort) : undefined;
        const rawProto = String(obj.protocol || obj.proto || obj['协议'] || '').trim().toLowerCase();
        const customProtocol: 'imap' | 'pop3' | undefined = rawProto.includes('pop') ? 'pop3' : rawProto.includes('imap') ? 'imap' : undefined;

        const normEmail = normalizeEmail(email);
        if (/^\S+@\S+\.\S+$/.test(normEmail)) {
          const provider = providerForEmail(normEmail);
          return {
            email: normEmail,
            secret,
            clientId,
            refreshToken,
            provider: provider.id,
            lineNumber,
            customHost,
            customPort,
            customProtocol,
            confidence: secret || refreshToken ? 'high' : 'medium',
            detectedFormat: 'json_query',
            rawLine,
          };
        }
      }
    } catch {
      // Ignore JSON parse errors
    }
  }

  // 2. Query String / URL params mode
  if ((mode === 'auto' || mode === 'json') && (normalized.includes('email=') || normalized.includes('account=') || normalized.includes('user='))) {
    try {
      const paramsStr = normalized.includes('?') ? normalized.split('?')[1] : normalized;
      const params = new URLSearchParams(paramsStr.replace(/&amp;/g, '&'));
      const email = (params.get('email') || params.get('account') || params.get('user') || '').trim().replace(/^[^a-zA-Z0-9]+/, '');
      const secret = (params.get('password') || params.get('pass') || params.get('pwd') || params.get('secret') || '').trim();
      const clientId = (params.get('client_id') || params.get('clientId') || '').trim() || undefined;
      const refreshToken = (params.get('refresh_token') || params.get('refreshToken') || '').trim() || undefined;
      const customHost = (params.get('host') || params.get('server') || '').trim() || undefined;
      const rawPort = params.get('port');
      const customPort = rawPort ? Number(rawPort) : undefined;
      const rawProto = (params.get('protocol') || '').trim().toLowerCase();
      const customProtocol: 'imap' | 'pop3' | undefined = rawProto.includes('pop') ? 'pop3' : rawProto.includes('imap') ? 'imap' : undefined;

      const normEmail = normalizeEmail(email);
      if (/^\S+@\S+\.\S+$/.test(normEmail)) {
        const provider = providerForEmail(normEmail);
        return {
          email: normEmail,
          secret,
          clientId,
          refreshToken,
          provider: provider.id,
          lineNumber,
          customHost,
          customPort,
          customProtocol,
          confidence: 'high',
          detectedFormat: 'json_query',
          rawLine,
        };
      }
    } catch {
      // Ignore URL parse errors
    }
  }

  // 3. Key-Value / Labeled String Mode (e.g., 【账号: demo_user@domain.com | 密码: DemoPassword123】)
  if (mode === 'auto' || mode === 'kv') {
    const emailKvMatch = normalized.match(/(?:账号|邮箱|account|user|email|login|username)\s*[:=]\s*([^\s\|;,\]}]+@[^\s\|;,\]}]+)/i);
    if (emailKvMatch) {
      const rawE = emailKvMatch[1].replace(/^[^a-zA-Z0-9]+/, '');
      const normEmail = normalizeEmail(rawE);
      if (/^\S+@\S+\.\S+$/.test(normEmail)) {
        const provider = providerForEmail(normEmail);
        let secret = '';
        const passMatch = normalized.match(/(?:密码|应用密码|pwd|pass|password|secret)\s*[:=]\s*([^\s\|;,\]}]+|(?<=[:=]).*?(?=\s*[\|;,\]]|$))/i);
        if (passMatch) {
          secret = passMatch[1].trim();
          secret = secret.replace(/[\]\}]$/, '').trim();
        }

        let clientId: string | undefined = undefined;
        const cidMatch = normalized.match(/(?:客户端ID|client_id|clientId)\s*[:=]\s*([a-f0-9-]{36})/i);
        if (cidMatch) clientId = cidMatch[1].trim();

        let refreshToken: string | undefined = undefined;
        const tokenMatch = normalized.match(/(?:刷新令牌|refresh_token|refreshToken|token)\s*[:=]\s*(\S+)/i);
        if (tokenMatch) refreshToken = tokenMatch[1].trim().replace(/[\]\}]$/, '');

        let customHost: string | undefined = undefined;
        const hostMatch = normalized.match(/(?:服务器|host|server)\s*[:=]\s*([^\s\|;,\]}]+)/i);
        if (hostMatch) customHost = hostMatch[1].trim();

        let customPort: number | undefined = undefined;
        const portMatch = normalized.match(/(?:端口|port)\s*[:=]\s*(\d+)/i);
        if (portMatch) customPort = Number(portMatch[1]);

        let customProtocol: 'imap' | 'pop3' | undefined = undefined;
        const protoMatch = normalized.match(/(?:协议|protocol)\s*[:=]\s*(imap|pop3|pop)/i);
        if (protoMatch) customProtocol = protoMatch[1].toLowerCase().includes('pop') ? 'pop3' : 'imap';

        const confidence: ParseConfidence = secret || refreshToken ? 'high' : provider.id === 'microsoft' ? 'medium' : 'low';
        return {
          email: normEmail,
          secret,
          clientId,
          refreshToken,
          provider: provider.id,
          lineNumber,
          customHost,
          customPort,
          customProtocol,
          confidence,
          detectedFormat: 'kv_bracket',
          rawLine,
        };
      }
    }
  }

  // 4. Delimiter Mode with Email Anchor & Two-End Shrink Strategy (两端收缩匹配策略)
  if (mode === 'auto' || mode === 'four_parts' || mode === 'custom') {
    const rawMatches = Array.from(normalized.matchAll(CANDIDATE_EMAIL_REGEX));
    if (rawMatches.length > 0) {
      let chosenEmail = '';
      let chosenProvider: ReturnType<typeof providerForEmail> = providerForEmail('user@custom.com');
      let emailMatchObj = rawMatches[0];

      for (const m of rawMatches) {
        const cleaned = m[0].replace(/^[^a-zA-Z0-9]+/, '');
        const candidateEmail = normalizeEmail(cleaned);
        const p = providerForEmail(candidateEmail);
        if (p) {
          chosenEmail = candidateEmail;
          chosenProvider = p;
          emailMatchObj = m;
          break;
        }
      }

      if (!chosenEmail && rawMatches.length > 0) {
        const cleaned = rawMatches[0][0].replace(/^[^a-zA-Z0-9]+/, '');
        chosenEmail = normalizeEmail(cleaned);
        chosenProvider = providerForEmail(chosenEmail);
      }

      if (chosenEmail) {
        const rawMatchedText = emailMatchObj[0];
        const cleanedText = rawMatchedText.replace(/^[^a-zA-Z0-9]+/, '');
        const emailIndex = (emailMatchObj.index ?? 0) + (rawMatchedText.length - cleanedText.length);
        const emailLen = cleanedText.length;

        // Strip noise to the left of Email (Left Anchor)
        const rightPart = normalized.slice(emailIndex + emailLen).trim();

        let activeDelimiters = ['----', '---', '--', '\t', '|', ':', ',', ';'];
        if (customDelimiter && customDelimiter.trim()) {
          activeDelimiters = [customDelimiter.trim(), ...activeDelimiters];
        }

        let remainingRight = rightPart.replace(/^(?:----|---|--|\t|\||:|,|;|\s)+/, '');

        if (!remainingRight) {
          if (chosenProvider.id === 'microsoft') {
            return {
              email: chosenEmail,
              secret: '',
              provider: chosenProvider.id,
              lineNumber,
              confidence: 'high',
              detectedFormat: 'single_oauth',
              rawLine,
            };
          } else {
            return {
              email: chosenEmail,
              secret: '',
              provider: chosenProvider.id,
              lineNumber,
              confidence: 'low',
              detectedFormat: 'delimiter',
              rawLine,
            };
          }
        }

        let usedDelimiter: string | null = null;
        for (const d of activeDelimiters) {
          if (remainingRight.includes(d)) {
            usedDelimiter = d;
            break;
          }
        }

        let segments: string[] = [];
        if (usedDelimiter) {
          segments = remainingRight.split(usedDelimiter).map((s) => s.trim()).filter(Boolean);
        } else {
          segments = [remainingRight];
        }

        let clientId: string | undefined = undefined;
        let refreshToken: string | undefined = undefined;
        let customHost: string | undefined = undefined;
        let customPort: number | undefined = undefined;
        let customProtocol: 'imap' | 'pop3' | undefined = undefined;

        // Two-End Shrink Strategy (Right-side shrink for server/port/protocol/UUID/token)
        const remainingSegments: string[] = [];

        for (let i = 0; i < segments.length; i++) {
          const seg = segments[i];
          const segLower = seg.toLowerCase();

          if (!clientId && UUID_REGEX.test(seg)) {
            clientId = seg;
          } else if (!refreshToken && (seg.startsWith('M.C') || seg.length > 80)) {
            refreshToken = seg;
          } else if (!customProtocol && (segLower === 'pop3' || segLower === 'pop' || segLower === 'imap')) {
            customProtocol = segLower.includes('pop') ? 'pop3' : 'imap';
          } else if (!customPort && /^(993|995|110|143|25|465|587)$/.test(seg)) {
            customPort = parseInt(seg, 10);
          } else if (!customHost && /^(?:imap|pop|mail|smtp)[a-z0-9.-]+\.[a-z]{2,}$/i.test(seg)) {
            customHost = seg;
          } else {
            remainingSegments.push(seg);
          }
        }

        const secret = remainingSegments.join(usedDelimiter ?? '');

        let confidence: ParseConfidence = 'high';
        if (!secret && !refreshToken && chosenProvider.id !== 'microsoft') {
          confidence = 'low';
        } else if (remainingSegments.length > 2) {
          confidence = 'medium';
        }

        return {
          email: chosenEmail,
          secret,
          clientId,
          refreshToken,
          provider: chosenProvider.id,
          lineNumber,
          customHost,
          customPort,
          customProtocol,
          confidence,
          detectedFormat: 'delimiter',
          rawLine,
        };
      }
    }
  }

  return null;
}

export function parseAccountTextSmart(
  input: string,
  maxAccounts = 1000,
  mode: ParseMode = 'auto',
  customDelimiter?: string
): SmartParseResult {
  const accounts: SmartParsedAccount[] = [];
  const invalid: InvalidAccountLine[] = [];
  const seen = new Set<string>();
  const formatCounts: Record<DetectedFormat, number> = {
    kv_bracket: 0,
    json_query: 0,
    delimiter: 0,
    single_oauth: 0,
  };

  const lines = input.split(/\r?\n/);
  let totalLines = 0;
  let lowConfidenceCount = 0;

  lines.forEach((line, index) => {
    const lineNumber = index + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) return;

    totalLines += 1;
    const parsed = parseAccountLineSmart(line, lineNumber, mode, customDelimiter);
    if (!parsed) {
      invalid.push({ lineNumber, reason: 'missing_separator' });
      return;
    }

    if (seen.has(parsed.email)) {
      invalid.push({ lineNumber, reason: 'duplicate' });
      return;
    }

    if (accounts.length >= maxAccounts) {
      invalid.push({ lineNumber, reason: 'duplicate' });
      return;
    }

    seen.add(parsed.email);
    accounts.push(parsed);
    formatCounts[parsed.detectedFormat] = (formatCounts[parsed.detectedFormat] || 0) + 1;
    if (parsed.confidence === 'low') {
      lowConfidenceCount += 1;
    }
  });

  return {
    accounts,
    invalid,
    stats: {
      totalLines,
      validCount: accounts.length,
      lowConfidenceCount,
      formatCounts,
    },
  };
}

export function parseAccountText(input: string, maxAccounts = 10): ParseAccountTextResult {
  const smartResult = parseAccountTextSmart(input, maxAccounts, 'auto');
  return {
    accounts: smartResult.accounts.map((a) => ({
      email: a.email,
      secret: a.secret,
      provider: a.provider,
      lineNumber: a.lineNumber,
      customHost: a.customHost,
      customPort: a.customPort,
      customProtocol: a.customProtocol,
    })),
    invalid: smartResult.invalid,
  };
}

