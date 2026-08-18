import { randomUUID } from 'node:crypto';
import type { Request } from 'express';
import { db } from '../db/database.js';
import { maskEmail } from '../providers.js';

export interface UsageEvent {
  id?: string;
  clientIp: string;
  region?: string;
  emailAccount: string;
  emailDomain?: string;
  provider: string;
  sourceMode: 'single' | 'batch' | 'api_key';
  status: 'success' | 'no_code' | 'error' | 'timeout' | 'captcha' | 'auth_failed' | 'cancelled';
  statusDetail?: string;
  hasCode: boolean;
  extractedCode?: string;
  durationMs: number;
  messageCount?: number;
  tokenId?: string;
  token?: string;
}

export interface UsageLogItem {
  id: string;
  clientIp: string;
  region: string;
  emailAccount: string;
  emailDomain: string;
  provider: string;
  sourceMode: string;
  status: string;
  statusDetail?: string;
  hasCode: boolean;
  extractedCode?: string;
  durationMs: number;
  messageCount: number;
  tokenId?: string;
  token?: string;
  createdAt: string;
}

export interface UsageLogsQuery {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: string;
  provider?: string;
  sourceMode?: string;
  tokenId?: string;
  token?: string;
  startDate?: string;
  endDate?: string;
}

// Extract real client IP
export function getClientIp(req: Request): string {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    const first = forwarded.split(',')[0].trim();
    if (first) return cleanIp(first);
  }
  const realIp = req.headers['x-real-ip'];
  if (typeof realIp === 'string' && realIp.trim()) {
    return cleanIp(realIp.trim());
  }
  const cfIp = req.headers['cf-connecting-ip'];
  if (typeof cfIp === 'string' && cfIp.trim()) {
    return cleanIp(cfIp.trim());
  }
  return cleanIp(req.socket.remoteAddress || '127.0.0.1');
}

function cleanIp(ip: string): string {
  if (ip.startsWith('::ffff:')) return ip.slice(7);
  if (ip === '::1') return '127.0.0.1';
  return ip;
}

// In-memory GeoIP cache to avoid repeated network lookups
const ipLocationCache = new Map<string, string>();

export function resolveIpRegion(ip: string): string {
  if (!ip || ip === '127.0.0.1' || ip === 'localhost' || ip === '::1') {
    return '本地沙盒 / Localhost';
  }
  if (
    ip.startsWith('10.') ||
    ip.startsWith('192.168.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(ip) ||
    ip.startsWith('169.254.')
  ) {
    return '局域网 (LAN)';
  }

  const cached = ipLocationCache.get(ip);
  if (cached) return cached;

  // Background non-blocking IP geo lookup
  fetchIpGeoAsync(ip);
  return '未知地区';
}

async function fetchIpGeoAsync(ip: string) {
  if (ipLocationCache.has(ip)) return;
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch(`http://ip-api.com/json/${ip}?lang=zh-CN`, {
      signal: controller.signal
    });
    clearTimeout(timeout);
    if (res.ok) {
      const data = (await res.json()) as any;
      if (data && data.status === 'success') {
        const region = [data.country, data.regionName, data.city].filter(Boolean).join(' ');
        ipLocationCache.set(ip, region || data.country || '公网 IP');
        return;
      }
    }
  } catch {
    // ignore
  }
  ipLocationCache.set(ip, '公网 IP');
}

export class UsageLoggerService {
  public record(event: UsageEvent): void {
    try {
      const id = event.id || randomUUID();
      const ip = event.clientIp || '127.0.0.1';
      const region = event.region || resolveIpRegion(ip);
      const rawEmail = (event.emailAccount || '').trim();
      const email = rawEmail || 'unknown@custom.com';
      const atIndex = email.lastIndexOf('@');
      const domain = atIndex > 0 ? email.slice(atIndex + 1).toLowerCase() : 'unknown';
      const masked = maskEmail(email);
      const now = new Date().toISOString();

      const stmt = db.prepare(`
        INSERT INTO usage_logs (
          id, client_ip, region, email_account, email_domain, provider,
          source_mode, status, status_detail, has_code, extracted_code,
          duration_ms, message_count, token_id, token, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        ip,
        region,
        masked,
        domain,
        event.provider || 'custom',
        event.sourceMode || 'single',
        event.status || 'success',
        (event.statusDetail || '').slice(0, 500),
        event.hasCode ? 1 : 0,
        event.extractedCode || null,
        Math.max(0, Math.round(event.durationMs || 0)),
        event.messageCount || 0,
        event.tokenId || null,
        event.token || null,
        now
      );
    } catch (err) {
      console.error('[UsageLogger] Failed to write usage log:', err);
    }
  }

  public query(params: UsageLogsQuery): { items: UsageLogItem[]; total: number; page: number; pageSize: number; totalPages: number } {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 20));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const args: any[] = [];

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push('(email_account LIKE ? OR client_ip LIKE ? OR region LIKE ? OR extracted_code LIKE ? OR token LIKE ?)');
      args.push(q, q, q, q, q);
    }

    if (params.status && params.status !== 'all') {
      conditions.push('status = ?');
      args.push(params.status);
    }

    if (params.provider && params.provider !== 'all') {
      conditions.push('provider = ?');
      args.push(params.provider);
    }

    if (params.sourceMode && params.sourceMode !== 'all') {
      conditions.push('source_mode = ?');
      args.push(params.sourceMode);
    }

    if (params.tokenId) {
      conditions.push('token_id = ?');
      args.push(params.tokenId);
    }

    if (params.token) {
      conditions.push('token = ?');
      args.push(params.token);
    }

    if (params.startDate && params.startDate.trim()) {
      const s = params.startDate.trim();
      const startIso = s.includes('T') ? s : `${s}T00:00:00.000Z`;
      conditions.push('created_at >= ?');
      args.push(startIso);
    }

    if (params.endDate && params.endDate.trim()) {
      const e = params.endDate.trim();
      const endIso = e.includes('T') ? e : `${e}T23:59:59.999Z`;
      conditions.push('created_at <= ?');
      args.push(endIso);
    }

    const whereClause = conditions.join(' AND ');

    // Total count
    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM usage_logs WHERE ${whereClause}`);
    const countResult = countStmt.get(...args) as any;
    const total = countResult ? countResult.count : 0;

    // Paged items
    const queryStmt = db.prepare(`
      SELECT * FROM usage_logs 
      WHERE ${whereClause} 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...args, pageSize, offset) as any[];

    const items: UsageLogItem[] = rows.map((r) => ({
      id: r.id,
      clientIp: r.client_ip,
      region: r.region,
      emailAccount: r.email_account,
      emailDomain: r.email_domain,
      provider: r.provider,
      sourceMode: r.source_mode,
      status: r.status,
      statusDetail: r.status_detail,
      hasCode: Boolean(r.has_code),
      extractedCode: r.extracted_code,
      durationMs: r.duration_ms,
      messageCount: r.message_count,
      tokenId: r.token_id || undefined,
      token: r.token || undefined,
      createdAt: r.created_at
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  public getDashboardStats(): {
    totalRequests: number;
    todayRequests: number;
    todaySuccessCount: number;
    todaySuccessRate: number;
    todayCodesFound: number;
    activeIpsToday: number;
    avgDurationMs: number;
    providerStats: Array<{ provider: string; count: number; percentage: number }>;
    recentHourly: Array<{ hour: string; count: number; success: number }>;
  } {
    const now = new Date();
    // Use UTC midnight for standard ISO string comparison
    const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
    const todayIso = todayStart.toISOString();

    const totalRow = db.prepare('SELECT COUNT(*) as count FROM usage_logs').get() as any;
    const totalRequests = totalRow?.count || 0;

    const todayStats = db.prepare(`
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status IN ('success', 'no_code') THEN 1 ELSE 0 END) as success,
        SUM(CASE WHEN has_code = 1 THEN 1 ELSE 0 END) as codes,
        COUNT(DISTINCT client_ip) as ips,
        AVG(duration_ms) as avg_duration
      FROM usage_logs 
      WHERE created_at >= ?
    `).get(todayIso) as any;

    const todayRequests = todayStats?.total || 0;
    const todaySuccessCount = todayStats?.success || 0;
    const todaySuccessRate = todayRequests > 0 ? Math.round((todaySuccessCount / todayRequests) * 100) : 100;
    const todayCodesFound = todayStats?.codes || 0;
    const activeIpsToday = todayStats?.ips || 0;
    const avgDurationMs = Math.round(todayStats?.avg_duration || 0);

    // Provider distribution (last 7 days)
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();
    const providerRows = db.prepare(`
      SELECT provider, COUNT(*) as count 
      FROM usage_logs 
      WHERE created_at >= ? 
      GROUP BY provider 
      ORDER BY count DESC 
      LIMIT 6
    `).all(sevenDaysAgo) as any[];

    const providerTotal = providerRows.reduce((acc, r) => acc + (r.count || 0), 0) || 1;
    const providerStats = providerRows.map((r) => ({
      provider: r.provider,
      count: r.count,
      percentage: Math.round(((r.count || 0) / providerTotal) * 100)
    }));

    // Recent 24 hours stats
    const hourlyRows = db.prepare(`
      SELECT 
        strftime('%m-%d %H:00', created_at) as hour,
        COUNT(*) as count,
        SUM(CASE WHEN status IN ('success', 'no_code') THEN 1 ELSE 0 END) as success
      FROM usage_logs 
      WHERE created_at >= datetime('now', '-24 hours')
      GROUP BY hour
      ORDER BY hour ASC
    `).all() as any[];

    return {
      totalRequests,
      todayRequests,
      todaySuccessCount,
      todaySuccessRate,
      todayCodesFound,
      activeIpsToday,
      avgDurationMs,
      providerStats,
      recentHourly: hourlyRows
    };
  }

  public exportCsv(params: UsageLogsQuery): string {
    const result = this.query({ ...params, page: 1, pageSize: 5000 });
    const headers = ['ID', '请求时间', '客户端IP', '地理地区', '邮箱账号(脱敏)', '服务商', '调用模式', '执行状态', '验证码', '耗时(ms)', '状态详情'];
    const rows = result.items.map((it) => [
      `"${it.id}"`,
      `"${it.createdAt}"`,
      `"${it.clientIp}"`,
      `"${it.region}"`,
      `"${it.emailAccount}"`,
      `"${it.provider}"`,
      `"${it.sourceMode}"`,
      `"${it.status}"`,
      `"${it.extractedCode || ''}"`,
      it.durationMs,
      `"${(it.statusDetail || '').replace(/"/g, '""')}"`
    ]);

    return [headers.join(','), ...rows.map((r) => r.join(','))].join('\r\n');
  }
}

export const usageLogger = new UsageLoggerService();
