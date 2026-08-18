import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { diagLogger } from './diag-logger.js';
import { geoIpService } from './geo-ip-service.js';

export interface BlockedIpItem {
  id: string;
  ip: string;
  reason: string;
  blockedBy: string;
  durationHours: number;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

export interface BlockIpInput {
  ip: string;
  reason?: string;
  blockedBy?: string;
  durationHours?: number | null; // 0 or null = permanent
}

export interface IpAnalyticsSummary {
  totalRequests: number;
  uniqueIps: number;
  totalSuccess: number;
  successRate: number;
  activeBansCount: number;
  topCountry: { code: string; name: string; flag: string; count: number };
}

export interface IpAnalyticsItem {
  ip: string;
  countryCode: string;
  countryName: string;
  region: string;
  flag: string;
  requestCount: number;
  successCount: number;
  successRate: number;
  lastSeenAt: string;
  isBanned: boolean;
  banDetails?: {
    id: string;
    reason: string;
    expiresAt: string | null;
    durationHours: number;
    createdAt: string;
  };
}

export interface CountryStatItem {
  countryCode: string;
  countryName: string;
  flag: string;
  requestCount: number;
  uniqueIps: number;
  percentage: number;
}

export interface IpAnalyticsResult {
  summary: IpAnalyticsSummary;
  ipList: IpAnalyticsItem[];
  countryList: CountryStatItem[];
  worldMapData: Record<string, { count: number; uniqueIps: number; percentage: number }>;
}

class IpBlockService {
  /**
   * Check if an IP address is currently blocked
   */
  isIpBlocked(rawIp: string): { blocked: boolean; reason?: string; expiresAt?: string | null } {
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
        reason: row.reason || '该 IP 存在异常高频请求，已被系统管理员限制访问。',
        expiresAt: row.expires_at || null
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
    const durationHours = Math.max(0, input.durationHours || 0);
    let expiresAt: string | null = null;

    if (durationHours > 0) {
      expiresAt = new Date(Date.now() + durationHours * 3600 * 1000).toISOString();
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

    const durationText = durationHours === 0 ? '永久封禁' : `${durationHours} 小时 (至 ${expiresAt})`;
    diagLogger.warn('system', 'IP封禁', `管理员封禁了 IP: ${ip} (原因: ${reason}, 期限: ${durationText})`, {
      ip,
      reason,
      durationHours,
      expiresAt
    });

    return {
      id,
      ip,
      reason,
      blockedBy,
      durationHours,
      createdAt: now,
      expiresAt,
      isActive: true
    };
  }

  /**
   * Unblock an IP address
   */
  unblockIp(idOrIp: string): boolean {
    const clean = this.normalizeIp(idOrIp);
    const stmt = db.prepare(`
      DELETE FROM blocked_ips WHERE id = ? OR ip = ?
    `);
    const res = stmt.run(clean, clean);

    diagLogger.info('system', 'IP解封', `解封 IP / 记录: ${clean}`);
    return Number(res.changes) > 0;
  }

  /**
   * List all blocked IPs
   */
  listBlockedIps(params?: { search?: string; page?: number; pageSize?: number }): {
    items: BlockedIpItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    // Auto-clean expired items first
    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at < ?').run(nowIso);

    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, Math.min(100, params?.pageSize || 50));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const queryParams: any[] = [];

    if (params?.search?.trim()) {
      conditions.push('(ip LIKE ? OR reason LIKE ?)');
      const s = `%${params.search.trim()}%`;
      queryParams.push(s, s);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM blocked_ips ${whereClause}`);
    const countRes = countStmt.get(...queryParams) as any;
    const total = countRes ? countRes.count : 0;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    const stmt = db.prepare(`
      SELECT id, ip, reason, blocked_by as blockedBy, created_at as createdAt, expires_at as expiresAt
      FROM blocked_ips
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `);
    const rows = stmt.all(...queryParams, pageSize, offset) as any[];

    const items: BlockedIpItem[] = rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      reason: r.reason,
      blockedBy: r.blockedBy,
      durationHours: r.expiresAt ? Math.round((new Date(r.expiresAt).getTime() - new Date(r.createdAt).getTime()) / 3600000) : 0,
      createdAt: r.createdAt,
      expiresAt: r.expiresAt,
      isActive: true
    }));

    return { items, total, page, pageSize, totalPages };
  }

  /**
   * Aggregates IP access statistics, region distributions and world map heat dataset
   */
  getIpAnalytics(params?: {
    range?: string;
    startDate?: string;
    endDate?: string;
  }): IpAnalyticsResult {
    // Auto-clean expired bans
    const nowIso = new Date().toISOString();
    db.prepare('DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at < ?').run(nowIso);

    // Build date filters for usage_logs
    const conditions: string[] = [];
    const args: any[] = [];

    if (params?.startDate && params.startDate.trim()) {
      const s = params.startDate.trim();
      const startIso = s.includes('T') ? s : `${s}T00:00:00.000Z`;
      conditions.push('created_at >= ?');
      args.push(startIso);
    }

    if (params?.endDate && params.endDate.trim()) {
      const e = params.endDate.trim();
      const endIso = e.includes('T') ? e : `${e}T23:59:59.999Z`;
      conditions.push('created_at <= ?');
      args.push(endIso);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    // Query aggregated logs grouped by client_ip (status IN ('success', 'no_code') are normal successful fetches)
    const ipRows = db.prepare(`
      SELECT
        client_ip,
        region,
        COUNT(*) as total_count,
        SUM(CASE WHEN status IN ('success', 'no_code') THEN 1 ELSE 0 END) as success_count,
        MAX(created_at) as last_seen
      FROM usage_logs
      ${whereClause}
      GROUP BY client_ip
      ORDER BY total_count DESC
    `).all(...args) as any[];

    // Fetch active bans
    const banRows = db.prepare(`
      SELECT id, ip, reason, blocked_by, created_at, expires_at 
      FROM blocked_ips
    `).all() as any[];
    const banMap = new Map<string, any>();
    banRows.forEach((b) => banMap.set(b.ip, b));

    let totalRequests = 0;
    let totalSuccess = 0;
    const countryAggMap = new Map<string, { count: number; ips: Set<string> }>();

    const ipList: IpAnalyticsItem[] = ipRows.map((r) => {
      const geo = geoIpService.resolve(r.client_ip, r.region);
      const reqCount = r.total_count || 0;
      const succCount = r.success_count || 0;
      totalRequests += reqCount;
      totalSuccess += succCount;

      // Group into country
      const cCode = geo.countryCode;
      if (!countryAggMap.has(cCode)) {
        countryAggMap.set(cCode, { count: 0, ips: new Set<string>() });
      }
      const cEntry = countryAggMap.get(cCode)!;
      cEntry.count += reqCount;
      cEntry.ips.add(r.client_ip);

      const ban = banMap.get(r.client_ip);
      return {
        ip: r.client_ip,
        countryCode: geo.countryCode,
        countryName: geo.countryName,
        region: geo.region,
        flag: geo.flag,
        requestCount: reqCount,
        successCount: succCount,
        successRate: reqCount > 0 ? Math.round((succCount / reqCount) * 100) : 100,
        lastSeenAt: r.last_seen || nowIso,
        isBanned: Boolean(ban),
        banDetails: ban
          ? {
              id: ban.id,
              reason: ban.reason,
              expiresAt: ban.expires_at,
              durationHours: ban.expires_at ? Math.round((new Date(ban.expires_at).getTime() - new Date(ban.created_at).getTime()) / 3600000) : 0,
              createdAt: ban.created_at
            }
          : undefined
      };
    });

    const countryList: CountryStatItem[] = [];
    const worldMapData: Record<string, { count: number; uniqueIps: number; percentage: number }> = {};

    countryAggMap.forEach((data, code) => {
      const meta = geoIpService.getCountryMeta(code);
      const pct = totalRequests > 0 ? Number(((data.count / totalRequests) * 100).toFixed(1)) : 0;
      const item: CountryStatItem = {
        countryCode: code,
        countryName: meta.name,
        flag: meta.flag,
        requestCount: data.count,
        uniqueIps: data.ips.size,
        percentage: pct
      };
      countryList.push(item);
      worldMapData[code] = {
        count: data.count,
        uniqueIps: data.ips.size,
        percentage: pct
      };
    });

    countryList.sort((a, b) => b.requestCount - a.requestCount);

    const topCountry = countryList[0]
      ? {
          code: countryList[0].countryCode,
          name: countryList[0].countryName,
          flag: countryList[0].flag,
          count: countryList[0].requestCount
        }
      : { code: 'CN', name: '中国', flag: '🇨🇳', count: 0 };

    const summary: IpAnalyticsSummary = {
      totalRequests,
      uniqueIps: ipList.length,
      totalSuccess,
      successRate: totalRequests > 0 ? Math.round((totalSuccess / totalRequests) * 100) : 100,
      activeBansCount: banRows.length,
      topCountry
    };

    return {
      summary,
      ipList,
      countryList,
      worldMapData
    };
  }

  private normalizeIp(ip: string): string {
    let clean = (ip || '').trim();
    if (clean.startsWith('::ffff:')) clean = clean.slice(7);
    if (clean === '::1') clean = '127.0.0.1';
    return clean;
  }
}

export const ipBlockService = new IpBlockService();
