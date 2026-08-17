import { randomBytes } from 'node:crypto';
import { db } from '../db/database.js';
import { diagLogger } from './diag-logger.js';
import { usageLogger, type UsageLogItem } from './usage-logger.js';

export interface AccessTokenRecord {
  id: string;
  token: string;
  name: string;
  total_quota: number;
  used_quota: number;
  is_active: number;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface FormattedAccessToken {
  id: string;
  token: string;
  name: string;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
  isActive: boolean;
  isExhausted: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

function formatToken(row: AccessTokenRecord): FormattedAccessToken {
  const remaining = Math.max(0, row.total_quota - row.used_quota);
  const isExpired = row.expires_at ? new Date(row.expires_at).getTime() < Date.now() : false;
  return {
    id: row.id,
    token: row.token,
    name: row.name,
    totalQuota: row.total_quota,
    usedQuota: row.used_quota,
    remainingQuota: remaining,
    isActive: Boolean(row.is_active) && !isExpired,
    isExhausted: remaining <= 0,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AccessTokenService {
  /**
   * Create a new access token
   */
  createToken(params: {
    name: string;
    totalQuota?: number;
    durationDays?: number | null;
  }): FormattedAccessToken {
    const id = randomBytes(16).toString('hex');
    const token = `tok_${randomBytes(16).toString('hex')}`;
    const name = params.name.trim() || '通用访问令牌';
    const totalQuota = Math.max(1, Number(params.totalQuota) || 10);
    const now = new Date().toISOString();

    let expiresAt: string | null = null;
    if (params.durationDays && params.durationDays > 0) {
      expiresAt = new Date(Date.now() + params.durationDays * 24 * 60 * 60 * 1000).toISOString();
    }

    const stmt = db.prepare(`
      INSERT INTO access_tokens (id, token, name, total_quota, used_quota, is_active, expires_at, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, 1, ?, ?, ?)
    `);
    stmt.run(id, token, name, totalQuota, expiresAt, now, now);

    diagLogger.info('system', '发行 Token', `管理员生成了新访问令牌 "${name}" (额度: ${totalQuota} 次, Token: ${token.slice(0, 8)}***)`);

    const created = this.getTokenById(id);
    if (!created) throw new Error('Token 创建失败');
    return created;
  }

  /**
   * Get token by ID
   */
  getTokenById(id: string): FormattedAccessToken | null {
    const stmt = db.prepare('SELECT * FROM access_tokens WHERE id = ?');
    const row = stmt.get(id) as AccessTokenRecord | undefined;
    return row ? formatToken(row) : null;
  }

  /**
   * Get token by token string
   */
  getTokenByString(tokenString: string): FormattedAccessToken | null {
    const stmt = db.prepare('SELECT * FROM access_tokens WHERE token = ?');
    const row = stmt.get(tokenString) as AccessTokenRecord | undefined;
    return row ? formatToken(row) : null;
  }

  /**
   * Verify whether a token can make an API request
   */
  verifyTokenAccess(tokenString: string): {
    valid: boolean;
    reason?: string;
    token?: FormattedAccessToken;
  } {
    if (!tokenString || typeof tokenString !== 'string') {
      return { valid: false, reason: '缺少访问 Token 凭据' };
    }

    const token = this.getTokenByString(tokenString.trim());
    if (!token) {
      return { valid: false, reason: '无效的访问 Token，未找到该授权令牌' };
    }

    if (!token.isActive) {
      return { valid: false, reason: '该 Token 已被管理员冻结或已过期' };
    }

    if (token.remainingQuota <= 0) {
      return {
        valid: false,
        reason: `该 Token 额度已用尽 (已用 ${token.usedQuota}/${token.totalQuota} 次)，请联系管理员充值`,
        token
      };
    }

    return { valid: true, token };
  }

  /**
   * Atomically consume 1 quota count (called only after successful execution)
   */
  consumeQuota(tokenId: string): boolean {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE access_tokens
      SET used_quota = used_quota + 1, updated_at = ?
      WHERE id = ? AND used_quota < total_quota AND is_active = 1
    `);
    const result = stmt.run(now, tokenId);
    return result.changes > 0;
  }

  /**
   * Top up quota for an existing token (+10, +50, or custom count)
   */
  topUpQuota(id: string, countToAdd: number): FormattedAccessToken {
    const count = Math.max(1, countToAdd);
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE access_tokens
      SET total_quota = total_quota + ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(count, now, id);

    const updated = this.getTokenById(id);
    if (!updated) throw new Error('未找到该 Token');

    diagLogger.info('system', '充值 Token', `管理员为 Token "${updated.name}" 充值了 +${count} 次 (当前总额度: ${updated.totalQuota} 次)`);
    return updated;
  }

  /**
   * Toggle token active state
   */
  setTokenActive(id: string, isActive: boolean): FormattedAccessToken {
    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE access_tokens
      SET is_active = ?, updated_at = ?
      WHERE id = ?
    `);
    stmt.run(isActive ? 1 : 0, now, id);

    const updated = this.getTokenById(id);
    if (!updated) throw new Error('未找到该 Token');
    return updated;
  }

  /**
   * Delete a token
   */
  deleteToken(id: string): boolean {
    const token = this.getTokenById(id);
    const stmt = db.prepare('DELETE FROM access_tokens WHERE id = ?');
    const result = stmt.run(id);
    if (token) {
      diagLogger.warn('system', '删除 Token', `管理员删除了访问令牌 "${token.name}" (${token.token.slice(0, 8)}***)`);
    }
    return result.changes > 0;
  }

  /**
   * List tokens with pagination & optional search
   */
  listTokens(params?: {
    page?: number;
    pageSize?: number;
    search?: string;
  }): {
    items: FormattedAccessToken[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
    summary: {
      totalTokens: number;
      activeTokens: number;
      totalQuotaAllocated: number;
      totalQuotaUsed: number;
      totalQuotaRemaining: number;
    };
  } {
    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, Math.min(100, params?.pageSize || 20));
    const offset = (page - 1) * pageSize;
    const search = params?.search?.trim() || '';

    let whereClause = '';
    const queryParams: any[] = [];

    if (search) {
      whereClause = 'WHERE name LIKE ? OR token LIKE ?';
      queryParams.push(`%${search}%`, `%${search}%`);
    }

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM access_tokens ${whereClause}`);
    const totalRow = countStmt.get(...queryParams) as unknown as { count: number };
    const total = totalRow ? totalRow.count : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const listStmt = db.prepare(`
      SELECT * FROM access_tokens
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = listStmt.all(...queryParams, pageSize, offset) as unknown as AccessTokenRecord[];

    // Summary statistics
    const summaryStmt = db.prepare(`
      SELECT
        COUNT(*) as total_tokens,
        SUM(CASE WHEN is_active = 1 THEN 1 ELSE 0 END) as active_tokens,
        SUM(total_quota) as sum_total_quota,
        SUM(used_quota) as sum_used_quota
      FROM access_tokens
    `);
    const sumRow = summaryStmt.get() as any;

    const totalAllocated = sumRow?.sum_total_quota || 0;
    const totalUsed = sumRow?.sum_used_quota || 0;

    return {
      items: rows.map(formatToken),
      total,
      page,
      pageSize,
      totalPages,
      summary: {
        totalTokens: sumRow?.total_tokens || 0,
        activeTokens: sumRow?.active_tokens || 0,
        totalQuotaAllocated: totalAllocated,
        totalQuotaUsed: totalUsed,
        totalQuotaRemaining: Math.max(0, totalAllocated - totalUsed)
      }
    };
  }

  /**
   * Get consumption usage logs for a specific token
   */
  getTokenLogs(
    idOrToken: string,
    params?: { page?: number; pageSize?: number }
  ): {
    token: FormattedAccessToken;
    items: UsageLogItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const token = this.getTokenById(idOrToken) || this.getTokenByString(idOrToken);
    if (!token) {
      throw new Error('Token 不存在或已被删除');
    }

    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, Math.min(100, params?.pageSize || 20));

    const result = usageLogger.query({
      page,
      pageSize,
      tokenId: token.id
    });

    // If query by tokenId returns 0, also fallback check if query by token string yields items
    let finalResult = result;
    if (result.total === 0) {
      const fallbackResult = usageLogger.query({
        page,
        pageSize,
        token: token.token
      });
      if (fallbackResult.total > 0) {
        finalResult = fallbackResult;
      }
    }

    return {
      token,
      items: finalResult.items,
      total: finalResult.total,
      page: finalResult.page,
      pageSize: finalResult.pageSize,
      totalPages: finalResult.totalPages
    };
  }
}

export const accessTokenService = new AccessTokenService();
