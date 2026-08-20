import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from 'node:crypto';
import { db } from '../db/database.js';
import { parseAccountLineSmart } from '../../shared/account-parser.js';
import { providerForEmail } from '../providers.js';
import type { AccountInput, EmailItem, ProviderId } from '../../shared/types.js';
import { fetchAccountVerificationCode } from '../imap-client.js';
import { usageLogger } from './usage-logger.js';
import { diagLogger } from './diag-logger.js';
import { accessTokenService } from './access-token-service.js';
import { systemSettingsService } from './system-settings-service.js';
import { toLocalStartOfDayIso, toLocalEndOfDayIso } from '../../shared/format-utils.js';

const API_KEY_FETCH_TIMEOUT_MS = 60_000;
const OFFILIVE_API_KEY_FETCH_TIMEOUT_MS = 285_000;

export function resolveApiKeyFetchTimeoutMs(provider: ProviderId): number {
  return provider === 'offilive' ? OFFILIVE_API_KEY_FETCH_TIMEOUT_MS : API_KEY_FETCH_TIMEOUT_MS;
}

// Master key for encrypting credentials at rest
function getMasterKey(): Buffer {
  const row = db.prepare("SELECT value FROM system_settings WHERE key = 'master_crypto_key'").get() as any;
  if (row?.value) {
    return Buffer.from(row.value, 'hex');
  }
  const newKey = randomBytes(32);
  const now = new Date().toISOString();
  db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('master_crypto_key', ?, ?)").run(
    newKey.toString('hex'),
    now
  );
  return newKey;
}

const MASTER_KEY = getMasterKey();

export interface EncryptedPayload {
  cipher: string;
  iv: string;
  tag: string;
}

export function encryptSecret(secret: string): EncryptedPayload {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', MASTER_KEY, iv);
  let encrypted = cipher.update(secret, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');
  return { cipher: encrypted, iv: iv.toString('hex'), tag };
}

export function decryptSecret(encrypted: string, iv: string, tag: string): string {
  const decipher = createDecipheriv('aes-256-gcm', MASTER_KEY, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

export interface ApiKeyItem {
  id: string;
  apiKey: string;
  name?: string;
  accountEmail: string;
  provider: string;
  isActive: boolean;
  expiresAt: string | null;
  callCount: number;
  lastUsedAt: string | null;
  tokenId?: string | null;
  boundToken?: string | null;
  boundTokenName?: string | null;
  boundTokenRemaining?: number | null;
  boundTokenTotal?: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface StoredAuthData {
  password?: string;
  refreshToken?: string;
  customHost?: string;
  customPort?: number;
  customProtocol?: 'imap' | 'pop3';
}

export interface ApiKeyPublicResult {
  code: number;
  success: boolean;
  email: string;
  provider: string;
  verificationCode?: string | null;
  codeDetails?: {
    code: string;
    confidence: string;
    receivedAt: string;
    subject?: string;
    from?: string;
  } | null;
  messageCount: number;
  scopeMode?: 'code_only' | 'summary' | 'full';
  messages?: Array<{
    id: string;
    subject: string;
    from: string;
    receivedAt: string;
    snippet: string;
    body?: string;
    textBody?: string;
    htmlBody?: string;
    hasCode: boolean;
    extractedCode?: string;
  }>;
  tokenInfo?: {
    name: string;
    usedQuota: number;
    totalQuota: number;
    remainingQuota: number;
    scopeMode?: string;
    enginePreference?: string;
  };
  cached?: boolean;
  queriedAt: string;
  durationMs: number;
}

// In-memory 8-second cooldown cache to prevent slamming Chrome RPA / IMAP with automated rapid polling
const apiKeyCooldownCache = new Map<string, { result: ApiKeyPublicResult; timestamp: number }>();
const API_COOLDOWN_MS = 8000;

export class ApiKeyService {
  public generateKeyString(): string {
    return `im_${randomBytes(18).toString('base64url').replace(/[^a-zA-Z0-9]/g, '')}`;
  }

  public createKey(params: {
    email: string;
    password?: string;
    refreshToken?: string;
    provider?: string;
    name?: string;
    expiresInHours?: number | null;
    tokenId?: string;
    boundToken?: string;
    customHost?: string;
    customPort?: number;
    customProtocol?: 'imap' | 'pop3';
  }): ApiKeyItem {
    const id = randomBytes(16).toString('hex');
    const apiKey = this.generateKeyString();
    const email = params.email.trim().toLowerCase();
    const providerProfile = providerForEmail(email);
    const provider = params.provider || providerProfile.id;

    let tokenId = params.tokenId || null;
    let boundToken = params.boundToken || null;
    let boundTokenName: string | null = null;

    if (tokenId) {
      const t = accessTokenService.getTokenById(tokenId);
      if (t) {
        boundToken = t.token;
        boundTokenName = t.name;
      }
    }

    const authData: StoredAuthData = {
      password: params.password,
      refreshToken: params.refreshToken,
      customHost: params.customHost,
      customPort: params.customPort,
      customProtocol: params.customProtocol
    };

    const { cipher, iv, tag } = encryptSecret(JSON.stringify(authData));
    const now = new Date();
    const nowIso = now.toISOString();

    let expiresAt: string | null = null;
    if (params.expiresInHours && params.expiresInHours > 0) {
      expiresAt = new Date(now.getTime() + params.expiresInHours * 3600000).toISOString();
    }

    const stmt = db.prepare(`
      INSERT INTO api_keys (
        id, api_key, name, account_email, provider, encrypted_auth,
        auth_iv, auth_tag, is_active, expires_at, call_count,
        last_used_at, token_id, bound_token, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, NULL, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      apiKey,
      params.name || null,
      email,
      provider,
      cipher,
      iv,
      tag,
      expiresAt,
      tokenId,
      boundToken,
      nowIso,
      nowIso
    );

    return {
      id,
      apiKey,
      name: params.name,
      accountEmail: email,
      provider,
      isActive: true,
      expiresAt,
      callCount: 0,
      lastUsedAt: null,
      tokenId,
      boundToken,
      boundTokenName,
      createdAt: nowIso,
      updatedAt: nowIso
    };
  }

  public batchImport(
    rawText: string,
    options: {
      defaultProvider?: string;
      expiresInHours?: number | null;
      batchName?: string;
      tokenId?: string;
    }
  ): { totalProcessed: number; successCount: number; failedCount: number; keys: Array<ApiKeyItem & { rawPassword?: string }> } {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const results: Array<ApiKeyItem & { rawPassword?: string }> = [];
    let failedCount = 0;

    let boundToken: string | undefined;
    if (options.tokenId) {
      const t = accessTokenService.getTokenById(options.tokenId);
      if (t) boundToken = t.token;
    }

    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const parsed = parseAccountLineSmart(line, (options.defaultProvider as any) || 'smart');
      if (!parsed || !parsed.email) {
        failedCount++;
        continue;
      }

      const email = parsed.email.trim().toLowerCase();
      const password = parsed.secret || '';
      const refreshToken = parsed.refreshToken;

      if (!password && !refreshToken) {
        failedCount++;
        continue;
      }

      const name = options.batchName ? `${options.batchName} #${index + 1}` : undefined;
      const item = this.createKey({
        email,
        password,
        refreshToken,
        provider: parsed.provider,
        name,
        expiresInHours: options.expiresInHours,
        tokenId: options.tokenId,
        boundToken,
        customHost: parsed.customHost,
        customPort: parsed.customPort,
        customProtocol: parsed.customProtocol
      });

      results.push({ ...item, rawPassword: password });
    }

    return {
      totalProcessed: lines.length,
      successCount: results.length,
      failedCount,
      keys: results
    };
  }

  public queryKeys(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: 'all' | 'active' | 'expired' | 'disabled';
    provider?: string;
    tokenId?: string;
    token?: string;
    startDate?: string;
    endDate?: string;
  }): { items: ApiKeyItem[]; total: number; page: number; pageSize: number; totalPages: number } {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const args: any[] = [];

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push('(k.account_email LIKE ? OR k.api_key LIKE ? OR k.name LIKE ? OR t.name LIKE ?)');
      args.push(q, q, q, q);
    }

    if (params.provider && params.provider !== 'all') {
      conditions.push('k.provider = ?');
      args.push(params.provider);
    }

    if (params.tokenId && params.tokenId !== 'all') {
      conditions.push('(k.token_id = ? OR k.bound_token = ? OR t.token = ?)');
      args.push(params.tokenId, params.tokenId, params.tokenId);
    }

    if (params.token && params.token !== 'all') {
      conditions.push('(k.bound_token = ? OR t.token = ? OR k.token_id = ?)');
      args.push(params.token, params.token, params.token);
    }

    if ((params as any).startDate && (params as any).startDate.trim()) {
      const startIso = toLocalStartOfDayIso((params as any).startDate);
      if (startIso) {
        conditions.push('k.created_at >= ?');
        args.push(startIso);
      }
    }

    if ((params as any).endDate && (params as any).endDate.trim()) {
      const endIso = toLocalEndOfDayIso((params as any).endDate);
      if (endIso) {
        conditions.push('k.created_at <= ?');
        args.push(endIso);
      }
    }

    const nowIso = new Date().toISOString();
    if (params.status === 'active') {
      conditions.push('k.is_active = 1 AND (k.expires_at IS NULL OR k.expires_at > ?)');
      args.push(nowIso);
    } else if (params.status === 'expired') {
      conditions.push('k.expires_at IS NOT NULL AND k.expires_at <= ?');
      args.push(nowIso);
    } else if (params.status === 'disabled') {
      conditions.push('k.is_active = 0');
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = db.prepare(`
      SELECT COUNT(*) as count 
      FROM api_keys k 
      LEFT JOIN access_tokens t ON k.token_id = t.id 
      WHERE ${whereClause}
    `);
    const countRow = countStmt.get(...args) as any;
    const total = countRow ? countRow.count : 0;

    const queryStmt = db.prepare(`
      SELECT 
        k.id, k.api_key, k.name, k.account_email, k.provider, k.is_active, 
        k.expires_at, k.call_count, k.last_used_at, k.token_id, k.bound_token,
        t.name as bound_token_name, (t.total_quota - t.used_quota) as bound_token_remaining, t.total_quota as bound_token_total,
        k.created_at, k.updated_at
      FROM api_keys k
      LEFT JOIN access_tokens t ON k.token_id = t.id
      WHERE ${whereClause} 
      ORDER BY k.created_at DESC 
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...args, pageSize, offset) as any[];

    const items: ApiKeyItem[] = rows.map((r) => ({
      id: r.id,
      apiKey: r.api_key,
      name: r.name,
      accountEmail: r.account_email,
      provider: r.provider,
      isActive: Boolean(r.is_active),
      expiresAt: r.expires_at,
      callCount: r.call_count,
      lastUsedAt: r.last_used_at,
      tokenId: r.token_id,
      boundToken: r.bound_token,
      boundTokenName: r.bound_token_name,
      boundTokenRemaining: r.bound_token_remaining !== null ? Number(r.bound_token_remaining) : null,
      boundTokenTotal: r.bound_token_total !== null ? Number(r.bound_token_total) : null,
      createdAt: r.created_at,
      updatedAt: r.updated_at
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  public getRawKeyRecord(apiKey: string): any {
    const stmt = db.prepare('SELECT * FROM api_keys WHERE api_key = ? LIMIT 1');
    return stmt.get(apiKey);
  }

  public toggleKeyActive(id: string, active: boolean): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE api_keys SET is_active = ?, updated_at = ? WHERE id = ?').run(
      active ? 1 : 0,
      now,
      id
    );
  }

  public deleteKey(id: string): void {
    db.prepare('DELETE FROM api_keys WHERE id = ?').run(id);
  }

  public batchToggleKeyActive(ids: string[], active: boolean): { count: number } {
    if (!ids || ids.length === 0) return { count: 0 };
    const now = new Date().toISOString();
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`UPDATE api_keys SET is_active = ?, updated_at = ? WHERE id IN (${placeholders})`);
    const res = stmt.run(active ? 1 : 0, now, ...ids);
    diagLogger.info('api', '批量切换 API Key 状态', `管理员批量切换了 ${res.changes} 个 API Key 的激活状态为: ${active ? '启用' : '禁用'}`);
    return { count: Number(res.changes) };
  }

  public batchDeleteKeys(ids: string[]): { count: number } {
    if (!ids || ids.length === 0) return { count: 0 };
    const placeholders = ids.map(() => '?').join(',');
    const stmt = db.prepare(`DELETE FROM api_keys WHERE id IN (${placeholders})`);
    const res = stmt.run(...ids);
    diagLogger.warn('api', '批量删除 API Key', `管理员批量删除了 ${res.changes} 个 API Key`);
    return { count: Number(res.changes) };
  }

  public updateKeyExpiry(id: string, expiresAt: string | null): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE api_keys SET expires_at = ?, updated_at = ? WHERE id = ?').run(expiresAt, now, id);
  }

  public exportKeysFormatted(
    keys: ApiKeyItem[],
    domain: string,
    format: 'custom' | 'csv' | 'json' | 'urls',
    token?: string
  ): string {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    const buildUrl = (k: ApiKeyItem) => {
      const activeToken = (token && token.trim()) || k.boundToken;
      const tokenQuery = activeToken ? `?token=${encodeURIComponent(activeToken)}` : '';
      return `${baseUrl}/api/${k.apiKey}${tokenQuery}`;
    };

    if (format === 'urls') {
      return keys.map((k) => buildUrl(k)).join('\n');
    }

    if (format === 'json') {
      return JSON.stringify(
        keys.map((k) => ({
          email: k.accountEmail,
          provider: k.provider,
          apiKey: k.apiKey,
          apiUrl: buildUrl(k),
          token: k.boundToken || token || undefined,
          status: !k.isActive ? 'disabled' : k.expiresAt && new Date(k.expiresAt) <= new Date() ? 'expired' : 'active',
          expiresAt: k.expiresAt,
          calls: k.callCount
        })),
        null,
        2
      );
    }

    if (format === 'csv') {
      const headers = ['账号', '密码(解密)', '服务商', 'API Key', '绑定Token', 'API URL', '状态', '有效期', '调用次数'];
      const rows = keys.map((k) => {
        let rawPass = '';
        try {
          const raw = this.getRawKeyRecord(k.apiKey);
          if (raw) {
            const decrypted = JSON.parse(decryptSecret(raw.encrypted_auth, raw.auth_iv, raw.auth_tag)) as StoredAuthData;
            rawPass = decrypted.password || '';
          }
        } catch {}
        return [
          `"${k.accountEmail}"`,
          `"${rawPass}"`,
          `"${k.provider}"`,
          `"${k.apiKey}"`,
          `"${k.boundTokenName || k.boundToken || ''}"`,
          `"${buildUrl(k)}"`,
          `"${!k.isActive ? '已禁用' : k.expiresAt && new Date(k.expiresAt) <= new Date() ? '已过期' : '生效中'}"`,
          `"${k.expiresAt || '永久有效'}"`,
          k.callCount
        ].join(',');
      });
      return [headers.join(','), ...rows].join('\r\n');
    }

    // Format: 账号: anais_officiavhr@mail.com | 密码: oL9KZDccB | API：https://域名/api/{apiKey}?token={token}
    const lines = keys.map((k) => {
      let rawPass = '';
      try {
        const raw = this.getRawKeyRecord(k.apiKey);
        if (raw) {
          const decrypted = JSON.parse(decryptSecret(raw.encrypted_auth, raw.auth_iv, raw.auth_tag)) as StoredAuthData;
          rawPass = decrypted.password || '';
        }
      } catch {}
      return `账号: ${k.accountEmail} | 密码: ${rawPass} | API：${buildUrl(k)}`;
    });

    return lines.join('\n');
  }

  public async executeApiKeyFetch(
    apiKey: string,
    options: {
      lookbackMinutes?: number;
      maxMessages?: number;
      clientIp: string;
      region?: string;
      token?: string;
      scope?: 'code_only' | 'summary' | 'full';
      engine?: 'auto' | 'web_rpa' | 'imap_pop3';
    }
  ): Promise<ApiKeyPublicResult> {
    const startTime = Date.now();
    const row = this.getRawKeyRecord(apiKey);

    if (!row) {
      throw new Error('API Key 不存在或已失效');
    }

    if (!row.is_active) {
      throw new Error('此 API Key 已被管理员禁用');
    }

    if (row.expires_at && new Date(row.expires_at) <= new Date()) {
      throw new Error('此 API Key 已超过有效期');
    }

    // Determine active Token: query token takes precedence, followed by bound token
    const activeTokenStr = (options.token || row.bound_token || '').trim();
    let verifiedToken: any = null;

    if (activeTokenStr) {
      const check = accessTokenService.verifyTokenAccess(activeTokenStr);
      if (!check.valid) {
        // If mailcom or offilive, strictly require valid token
        if (row.provider === 'mailcom' || row.provider === 'offilive') {
          throw new Error(check.reason || '关联的授权 Token 额度已用尽或已被冻结');
        }
      } else {
        verifiedToken = check.token;
      }
    }

    // Determine effective Scope according to Least Privilege Principle (Token max privilege is the hard ceiling)
    const tokenMaxScope: 'code_only' | 'summary' | 'full' = verifiedToken?.scopeMode || 'full';
    let effectiveScope: 'code_only' | 'summary' | 'full' = 'full';
    if (tokenMaxScope === 'code_only') {
      // Hard cap: cannot be elevated even if caller requests ?scope=full
      effectiveScope = 'code_only';
    } else if (tokenMaxScope === 'summary') {
      effectiveScope = options.scope === 'code_only' ? 'code_only' : 'summary';
    } else {
      effectiveScope = options.scope || 'full';
    }

    // Determine effective Engine Preference
    const tokenEngine: 'auto' | 'web_rpa' | 'imap_pop3' = verifiedToken?.enginePreference || 'auto';
    const effectiveEngine: 'auto' | 'web_rpa' | 'imap_pop3' = options.engine || tokenEngine;

    // Anti-hammering cooldown cache check
    const cooldownMs = systemSettingsService.getSettings().apiCooldownMs;
    const cachedEntry = apiKeyCooldownCache.get(apiKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < cooldownMs) {
      return {
        ...cachedEntry.result,
        cached: true,
        durationMs: Date.now() - startTime
      };
    }

    let authData: StoredAuthData;
    try {
      authData = JSON.parse(decryptSecret(row.encrypted_auth, row.auth_iv, row.auth_tag)) as StoredAuthData;
    } catch {
      throw new Error('解密账户凭据失败');
    }

    const email = row.account_email;
    const provider = row.provider as ProviderId;

    let accountInput: AccountInput;
    if (authData.refreshToken) {
      accountInput = {
        clientAccountId: row.id,
        email,
        provider,
        auth: { type: 'refresh_token', refreshToken: authData.refreshToken }
      };
    } else {
      accountInput = {
        clientAccountId: row.id,
        email,
        provider,
        auth: { type: 'app_password', secret: authData.password || '' },
        customHost: authData.customHost,
        customPort: authData.customPort,
        customProtocol: authData.customProtocol
      };
    }

    const traceId = randomUUID();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), resolveApiKeyFetchTimeoutMs(provider));

    diagLogger.info('api', '接收请求', `收到 API Key 邮件拉取请求 (${email}) [范围: ${effectiveScope}, 分支: ${effectiveEngine}]`, { apiKey, clientIp: options.clientIp, traceId }, email, traceId);

    try {
      const fetchResult = await fetchAccountVerificationCode(accountInput, {
        lookbackMinutes: typeof options.lookbackMinutes === 'number' ? options.lookbackMinutes : 0,
        maxMessages: typeof options.maxMessages === 'number' && options.maxMessages > 0 ? options.maxMessages : 10,
        signal: controller.signal,
        traceId,
        scopeMode: effectiveScope,
        enginePreference: effectiveEngine,
        onProgress: (state) => {
          diagLogger.debug('api', `进度: ${state}`, `正在执行 ${state}`, undefined, email, traceId);
        },
        resolveMicrosoftAccessToken: () => {
          throw new Error('OAuth 会话不可用于直接 API Key 调用，请使用 Refresh Token 或应用密码');
        }
      });

      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const primaryCode = fetchResult.primaryCode;
      const codeStr = primaryCode ? primaryCode.code : null;

      // Update call count and last used
      const nowIso = new Date().toISOString();
      db.prepare('UPDATE api_keys SET call_count = call_count + 1, last_used_at = ? WHERE id = ?').run(nowIso, row.id);

      // Post-execution quota deduction (Deduct on all successful API calls using a verified token)
      let tokenInfoPayload: any = undefined;
      if (verifiedToken) {
        accessTokenService.consumeQuota(verifiedToken.id);
        tokenInfoPayload = {
          name: verifiedToken.name,
          usedQuota: verifiedToken.usedQuota + 1,
          totalQuota: verifiedToken.totalQuota,
          remainingQuota: Math.max(0, verifiedToken.remainingQuota - 1),
          scopeMode: effectiveScope,
          enginePreference: effectiveEngine
        };
      }

      // Record usage log
      usageLogger.record({
        id: traceId,
        clientIp: options.clientIp,
        region: options.region,
        emailAccount: email,
        provider,
        sourceMode: 'api_key',
        status: codeStr ? 'success' : 'no_code',
        hasCode: Boolean(codeStr),
        extractedCode: codeStr || undefined,
        durationMs,
        messageCount: fetchResult.messages?.length || 0,
        tokenId: verifiedToken?.id || row.token_id || undefined,
        token: verifiedToken?.token || row.bound_token || undefined,
        engine: fetchResult.engineUsed || (provider === 'offilive' ? 'web_rpa' : 'imap')
      });

      // Construct slim or full response based on effectiveScope
      let messagesOutput: any = undefined;
      if (effectiveScope === 'summary') {
        messagesOutput = (fetchResult.messages || []).map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          receivedAt: m.receivedAt,
          snippet: m.snippet,
          hasCode: Boolean(m.codeMatch),
          extractedCode: m.codeMatch?.code
        }));
      } else if (effectiveScope === 'full') {
        messagesOutput = (fetchResult.messages || []).map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          receivedAt: m.receivedAt,
          snippet: m.snippet,
          body: m.textBody || m.snippet || '',
          textBody: m.textBody || m.snippet || '',
          htmlBody: m.htmlBody || undefined,
          hasCode: Boolean(m.codeMatch),
          extractedCode: m.codeMatch?.code
        }));
      }

      const publicResult: ApiKeyPublicResult = {
        code: 200,
        success: true,
        email,
        provider,
        verificationCode: codeStr,
        codeDetails: primaryCode
          ? {
              code: primaryCode.code,
              confidence: primaryCode.confidence,
              receivedAt: primaryCode.receivedAt,
              subject: primaryCode.subject,
              from: primaryCode.from
            }
          : null,
        messageCount: fetchResult.messages?.length || 0,
        scopeMode: effectiveScope,
        messages: messagesOutput,
        tokenInfo: tokenInfoPayload,
        queriedAt: nowIso,
        durationMs
      } as any;

      // Save to cooldown cache
      apiKeyCooldownCache.set(apiKey, { result: publicResult, timestamp: Date.now() });

      return publicResult;
    } catch (err: any) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const errMsg = err?.message || '邮件拉取失败';

      usageLogger.record({
        id: traceId,
        clientIp: options.clientIp,
        region: options.region,
        emailAccount: email,
        provider,
        sourceMode: 'api_key',
        status: 'error',
        statusDetail: errMsg,
        hasCode: false,
        durationMs,
        messageCount: 0,
        tokenId: verifiedToken?.id || row.token_id || undefined,
        token: verifiedToken?.token || row.bound_token || undefined,
        engine: effectiveEngine === 'web_rpa' ? 'web_rpa' : (provider === 'offilive' ? 'web_rpa' : 'imap')
      });

      diagLogger.error('api', '拉取失败', errMsg, { error: String(err) }, email);
      throw err;
    }
  }
}

export const apiKeyService = new ApiKeyService();
