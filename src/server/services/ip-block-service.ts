import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { diagLogger } from './diag-logger.js';

export interface BlockedIpItem {
  id: string;
  ip: string;
  reason: string;
  blockedBy: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface BlockIpInput {
  ip: string;
  reason?: string;
  blockedBy?: string;
  durationHours?: number | null;
}

class IpBlockService {
  /**
   * Check if an IP address is currently blocked
   */
  isIpBlocked(rawIp: string): { blocked: boolean; reason?: string } {
    if (!rawIp) return { blocked: false };
    const ip = this.normalizeIp(rawIp);
    if (ip === '127.0.0.1' || ip === '::1' || ip === 'localhost') {
      return { blocked: false };
    }

    try {
      const stmt = db.prepare(`
        SELECT id, ip, reason, expires_at 
        FROM blocked_ips 
        WHERE ip = ?
      `);
      const row = stmt.get(ip) as { id: string; ip: string; reason?: string; expires_at?: string } | undefined;

      if (!row) return { blocked: false };

      // Check expiration
      if (row.expires_at) {
        const expiry = new Date(row.expires_at).getTime();
        if (Date.now() >= expiry) {
          // Expired, automatically clean up
          this.unblockIp(row.id);
          return { blocked: false };
        }
      }

      return {
        blocked: true,
        reason: row.reason || '该 IP 存在异常高频请求，已被系统管理员限制访问。'
      };
    } catch (err) {
      console.error('[IpBlockService] Query error:', err);
      return { blocked: false };
    }
  }

  /**
   * Block an IP address
   */
  blockIp(input: BlockIpInput): BlockedIpItem {
    const ip = this.normalizeIp(input.ip);
    if (!ip) throw new Error('无效的 IP 地址');
    if (ip === '127.0.0.1' || ip === 'localhost') {
      throw new Error('不能封禁本地 Localhost 地址');
    }

    const id = `blk_${randomUUID().replace(/-/g, '').slice(0, 16)}`;
    const now = new Date().toISOString();
    let expiresAt: string | null = null;

    if (input.durationHours && input.durationHours > 0) {
      expiresAt = new Date(Date.now() + input.durationHours * 3600 * 1000).toISOString();
    }

    const reason = input.reason?.trim() || '高频异常抓取，管理员封禁';
    const blockedBy = input.blockedBy || 'admin';

    // Upsert logic
    const stmt = db.prepare(`
      INSERT INTO blocked_ips (id, ip, reason, blocked_by, created_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET
        reason = excluded.reason,
        blocked_by = excluded.blocked_by,
        expires_at = excluded.expires_at,
        created_at = excluded.created_at
    `);

    stmt.run(id, ip, reason, blockedBy, now, expiresAt);

    diagLogger.warn('system', 'IP封禁', `管理员封禁了 IP: ${ip} (原因: ${reason})`, {
      ip,
      reason,
      expiresAt
    });

    return {
      id,
      ip,
      reason,
      blockedBy,
      createdAt: now,
      expiresAt
    };
  }

  /**
   * Unblock an IP address
   */
  unblockIp(idOrIp: string): boolean {
    const stmt = db.prepare(`
      DELETE FROM blocked_ips WHERE id = ? OR ip = ?
    `);
    const res = stmt.run(idOrIp, idOrIp);

    diagLogger.info('system', 'IP解封', `解封 IP / 记录: ${idOrIp}`);
    return Number(res.changes) > 0;
  }

  /**
   * List all blocked IPs
   */
  listBlockedIps(): BlockedIpItem[] {
    const stmt = db.prepare(`
      SELECT id, ip, reason, blocked_by as blockedBy, created_at as createdAt, expires_at as expiresAt
      FROM blocked_ips
      ORDER BY created_at DESC
    `);
    const rows = stmt.all() as any[];

    // Auto-clean expired items
    const now = Date.now();
    const active: BlockedIpItem[] = [];

    for (const r of rows) {
      if (r.expiresAt && new Date(r.expiresAt).getTime() <= now) {
        this.unblockIp(r.id);
      } else {
        active.push(r);
      }
    }

    return active;
  }

  private normalizeIp(ip: string): string {
    let clean = ip.trim();
    if (clean.startsWith('::ffff:')) clean = clean.slice(7);
    if (clean === '::1') clean = '127.0.0.1';
    return clean;
  }
}

export const ipBlockService = new IpBlockService();
