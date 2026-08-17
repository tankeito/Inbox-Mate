import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'node:crypto';
import { db } from '../db/database.js';
import { parseAccountLineSmart } from '../../shared/account-parser.js';
import { providerForEmail } from '../providers.js';
import type { AccountInput, EmailItem, ProviderId } from '../../shared/types.js';
import { fetchAccountVerificationCode } from '../imap-client.js';
import { usageLogger } from './usage-logger.js';
import { diagLogger } from './diag-logger.js';

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
  messages: Array<{
    id: string;
    subject: string;
    from: string;
    receivedAt: string;
    snippet: string;
    hasCode: boolean;
    extractedCode?: string;
  }>;
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
    customHost?: string;
    customPort?: number;
    customProtocol?: 'imap' | 'pop3';
  }): ApiKeyItem {
    const id = randomBytes(16).toString('hex');
    const apiKey = this.generateKeyString();
    const email = params.email.trim().toLowerCase();
    const providerProfile = providerForEmail(email);
    const provider = params.provider || providerProfile.id;

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
        last_used_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?, 0, NULL, ?, ?)
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
    }
  ): { totalProcessed: number; successCount: number; failedCount: number; keys: Array<ApiKeyItem & { rawPassword?: string }> } {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const results: Array<ApiKeyItem & { rawPassword?: string }> = [];
    let failedCount = 0;

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
  }): { items: ApiKeyItem[]; total: number; page: number; pageSize: number; totalPages: number } {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const args: any[] = [];

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push('(account_email LIKE ? OR api_key LIKE ? OR name LIKE ?)');
      args.push(q, q, q);
    }

    if (params.provider && params.provider !== 'all') {
      conditions.push('provider = ?');
      args.push(params.provider);
    }

    const nowIso = new Date().toISOString();
    if (params.status === 'active') {
      conditions.push('is_active = 1 AND (expires_at IS NULL OR expires_at > ?)');
      args.push(nowIso);
    } else if (params.status === 'expired') {
      conditions.push('expires_at IS NOT NULL AND expires_at <= ?');
      args.push(nowIso);
    } else if (params.status === 'disabled') {
      conditions.push('is_active = 0');
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM api_keys WHERE ${whereClause}`);
    const countRow = countStmt.get(...args) as any;
    const total = countRow ? countRow.count : 0;

    const queryStmt = db.prepare(`
      SELECT id, api_key, name, account_email, provider, is_active, expires_at, call_count, last_used_at, created_at, updated_at
      FROM api_keys 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
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

  public updateKeyExpiry(id: string, expiresAt: string | null): void {
    const now = new Date().toISOString();
    db.prepare('UPDATE api_keys SET expires_at = ?, updated_at = ? WHERE id = ?').run(expiresAt, now, id);
  }

  public exportKeysFormatted(
    keys: ApiKeyItem[],
    domain: string,
    format: 'custom' | 'csv' | 'json' | 'urls'
  ): string {
    const baseUrl = domain.startsWith('http') ? domain : `https://${domain}`;

    if (format === 'urls') {
      return keys.map((k) => `${baseUrl}/${k.apiKey}`).join('\n');
    }

    if (format === 'json') {
      return JSON.stringify(
        keys.map((k) => ({
          email: k.accountEmail,
          provider: k.provider,
          apiKey: k.apiKey,
          apiUrl: `${baseUrl}/${k.apiKey}`,
          status: !k.isActive ? 'disabled' : k.expiresAt && new Date(k.expiresAt) <= new Date() ? 'expired' : 'active',
          expiresAt: k.expiresAt,
          calls: k.callCount
        })),
        null,
        2
      );
    }

    if (format === 'csv') {
      const headers = ['账号', '密码(解密)', '服务商', 'API Key', 'API URL', '状态', '有效期', '调用次数'];
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
          `"${baseUrl}/${k.apiKey}"`,
          `"${!k.isActive ? '已禁用' : k.expiresAt && new Date(k.expiresAt) <= new Date() ? '已过期' : '生效中'}"`,
          `"${k.expiresAt || '永久有效'}"`,
          k.callCount
        ].join(',');
      });
      return [headers.join(','), ...rows].join('\r\n');
    }

    // Format: 账号: anais_officiavhr@mail.com | 密码: oL9KZDccB | API：https://域名/{api key}
    const lines = keys.map((k) => {
      let rawPass = '';
      try {
        const raw = this.getRawKeyRecord(k.apiKey);
        if (raw) {
          const decrypted = JSON.parse(decryptSecret(raw.encrypted_auth, raw.auth_iv, raw.auth_tag)) as StoredAuthData;
          rawPass = decrypted.password || '';
        }
      } catch {}
      return `账号: ${k.accountEmail} | 密码: ${rawPass} | API：${baseUrl}/${k.apiKey}`;
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

    // Anti-hammering cooldown cache check
    const cachedEntry = apiKeyCooldownCache.get(apiKey);
    if (cachedEntry && Date.now() - cachedEntry.timestamp < API_COOLDOWN_MS) {
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

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    diagLogger.info('api', '接收请求', `收到 API Key 邮件拉取请求 (${email})`, { apiKey, clientIp: options.clientIp }, email);

    try {
      const fetchResult = await fetchAccountVerificationCode(accountInput, {
        lookbackMinutes: options.lookbackMinutes || 60,
        maxMessages: options.maxMessages || 5,
        signal: controller.signal,
        onProgress: (state) => {
          diagLogger.debug('api', `进度: ${state}`, `正在执行 ${state}`, undefined, email);
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

      // Record usage log
      usageLogger.record({
        clientIp: options.clientIp,
        region: options.region,
        emailAccount: email,
        provider,
        sourceMode: 'api_key',
        status: codeStr ? 'success' : 'no_code',
        hasCode: Boolean(codeStr),
        extractedCode: codeStr || undefined,
        durationMs,
        messageCount: fetchResult.messages?.length || 0
      });

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
        messages: (fetchResult.messages || []).map((m) => ({
          id: m.id,
          subject: m.subject,
          from: m.from,
          receivedAt: m.receivedAt,
          snippet: m.snippet,
          hasCode: Boolean(m.codeMatch),
          extractedCode: m.codeMatch?.code
        })),
        queriedAt: nowIso,
        durationMs
      };

      // Save to cooldown cache
      apiKeyCooldownCache.set(apiKey, { result: publicResult, timestamp: Date.now() });

      return publicResult;
    } catch (err: any) {
      clearTimeout(timeout);
      const durationMs = Date.now() - startTime;
      const errMsg = err?.message || '邮件拉取失败';

      usageLogger.record({
        clientIp: options.clientIp,
        region: options.region,
        emailAccount: email,
        provider,
        sourceMode: 'api_key',
        status: 'error',
        statusDetail: errMsg,
        hasCode: false,
        durationMs,
        messageCount: 0
      });

      diagLogger.error('api', '拉取失败', errMsg, { error: String(err) }, email);
      throw err;
    }
  }
}

export const apiKeyService = new ApiKeyService();
