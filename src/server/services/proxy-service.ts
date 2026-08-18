import { randomUUID } from 'node:crypto';
import http from 'node:http';
import https from 'node:https';
import net from 'node:net';
import { db } from '../db/database.js';
import { resolveIpRegion } from './usage-logger.js';
import { diagLogger } from './diag-logger.js';

export type ProxyProtocol = 'http' | 'https' | 'socks5';
export type ProxyStrategy = 'round_robin' | 'latency_first' | 'random';
export type ProxyStatus = 'ok' | 'error' | 'untested';

export interface ProxyNode {
  id: string;
  name: string;
  server: string;
  protocol: ProxyProtocol;
  isActive: boolean;
  weight: number;
  latencyMs: number;
  exitIp: string | null;
  exitRegion: string | null;
  lastCheckedAt: string | null;
  lastStatus: ProxyStatus;
  lastError: string | null;
  totalRequests: number;
  successRequests: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
}

export type ProxyRoutingMode = 'direct_first' | 'always' | 'targeted';

export interface GlobalProxyConfig {
  enabled: boolean;
  strategy: ProxyStrategy;
  routingMode: ProxyRoutingMode;
  failoverEnabled: boolean;
  directCooldownUntil?: string | null;
  isDirectCooling?: boolean;
}

export interface ProxyTrafficSummary {
  totalBytes: number;
  todayBytes: number;
  totalRequests: number;
  todayRequests: number;
  directRequests: number;
  savedBytesEst: number;
  savedRatioPercent: number;
  activeNodes: number;
  totalNodes: number;
  healthyNodes: number;
  avgLatencyMs: number;
}

export interface ProxyTrafficLogItem {
  id: string;
  proxyId: string;
  proxyName: string;
  proxyServer: string;
  traceId?: string;
  emailAccount?: string;
  bytesSent: number;
  bytesReceived: number;
  totalBytes: number;
  durationMs: number;
  status: string;
  createdAt: string;
}

export interface AddProxyInput {
  name?: string;
  server: string;
  protocol?: ProxyProtocol;
  isActive?: boolean;
  weight?: number;
}

export interface ParsedProxyItem {
  name: string;
  server: string;
  protocol: ProxyProtocol;
  raw: string;
}

export class ProxyService {
  private roundRobinIndex = 0;

  constructor() {
    this.ensureDefaultSettings();
  }

  private ensureDefaultSettings(): void {
    const now = new Date().toISOString();
    const insert = db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);
    insert.run('proxy_enabled', '0', now);
    insert.run('proxy_strategy', 'round_robin', now);
    insert.run('proxy_routing_mode', 'direct_first', now);
    insert.run('proxy_failover_enabled', '1', now);
    insert.run('proxy_direct_requests', '0', now);
    insert.run('proxy_direct_saved_bytes', '0', now);
    insert.run('proxy_direct_cooldown_until', '', now);
    insert.run('proxy_direct_403_streak', '0', now);
    insert.run('proxy_direct_403_last_ts', '0', now);
  }

  // ================= Global Config =================
  public getConfig(): GlobalProxyConfig {
    const rows = db.prepare(`
      SELECT key, value FROM system_settings 
      WHERE key IN (
        'proxy_enabled', 'proxy_strategy', 'proxy_routing_mode',
        'proxy_failover_enabled', 'proxy_direct_cooldown_until'
      )
    `).all() as Array<{ key: string; value: string }>;

    const map = new Map(rows.map((r) => [r.key, r.value]));
    const cooldownVal = map.get('proxy_direct_cooldown_until') || null;
    const isCooling = Boolean(cooldownVal && new Date(cooldownVal).getTime() > Date.now());

    return {
      enabled: map.get('proxy_enabled') === '1',
      strategy: (map.get('proxy_strategy') as ProxyStrategy) || 'round_robin',
      routingMode: (map.get('proxy_routing_mode') as ProxyRoutingMode) || 'direct_first',
      failoverEnabled: map.get('proxy_failover_enabled') !== '0',
      directCooldownUntil: isCooling ? cooldownVal : null,
      isDirectCooling: isCooling
    };
  }

  public updateConfig(input: Partial<GlobalProxyConfig>): GlobalProxyConfig {
    const now = new Date().toISOString();
    const update = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    if (input.enabled !== undefined) {
      update.run('proxy_enabled', input.enabled ? '1' : '0', now);
    }
    if (input.strategy !== undefined) {
      update.run('proxy_strategy', input.strategy, now);
    }
    if (input.routingMode !== undefined) {
      update.run('proxy_routing_mode', input.routingMode, now);
    }
    if (input.failoverEnabled !== undefined) {
      update.run('proxy_failover_enabled', input.failoverEnabled ? '1' : '0', now);
    }

    diagLogger.info(
      'system',
      '代理全局配置更新',
      `更新代理设置 [开关: ${input.enabled ? '开启' : '关闭'}, 路由模式: ${input.routingMode || '未修改'}, 策略: ${input.strategy || '未修改'}, 403故障轮换: ${input.failoverEnabled !== false ? '开启' : '关闭'}]`
    );

    return this.getConfig();
  }

  // ================= Direct IP Cooldown & Traffic Saving Helpers =================
  public isDirectCooling(): boolean {
    try {
      const row = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_cooldown_until'").get() as any;
      if (!row || !row.value) return false;
      const expireTs = new Date(row.value).getTime();
      return Date.now() < expireTs;
    } catch {
      return false;
    }
  }

  public reportDirect403(): void {
    try {
      const now = Date.now();
      const streakRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_403_streak'").get() as any;
      const lastTsRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_403_last_ts'").get() as any;
      const lastTs = Number(lastTsRow?.value || 0);
      let streak = Number(streakRow?.value || 0);

      if (now - lastTs < 120_000) {
        streak += 1;
      } else {
        streak = 1;
      }

      const iso = new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_403_streak', ?, ?)").run(streak.toString(), iso);
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_403_last_ts', ?, ?)").run(now.toString(), iso);

      if (streak >= 2) {
        const cooldownUntil = new Date(now + 5 * 60 * 1000).toISOString();
        db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_cooldown_until', ?, ?)").run(cooldownUntil, iso);
        diagLogger.warn(
          'system',
          '机房直连 IP 触发 403 频控冷却',
          `检测到宿主机机房直连连续 ${streak} 次遭遇 403 阻断，开启 5 分钟冷却保护至 ${cooldownUntil}，期间 direct_first 模式将直通代理池清洗流量`
        );
      }
    } catch (err) {
      console.error('[ProxyService] Failed to report direct 403:', err);
    }
  }

  public reportDirectSuccess(): void {
    try {
      const iso = new Date().toISOString();
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_403_streak', '0', ?)").run(iso);
    } catch {}
  }

  public recordDirectRequest(bytesEstimated = 120 * 1024): void {
    try {
      const now = new Date().toISOString();
      const directReqRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_requests'").get() as any;
      const currentReqs = Number(directReqRow?.value || 0) + 1;
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_requests', ?, ?)").run(currentReqs.toString(), now);

      const savedBytesRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_saved_bytes'").get() as any;
      const currentSaved = Number(savedBytesRow?.value || 0) + Math.max(1024, bytesEstimated);
      db.prepare("INSERT OR REPLACE INTO system_settings (key, value, updated_at) VALUES ('proxy_direct_saved_bytes', ?, ?)").run(currentSaved.toString(), now);
    } catch (err) {
      console.error('[ProxyService] Failed to record direct request saving:', err);
    }
  }

  // ================= Node CRUD =================
  public listNodes(): ProxyNode[] {
    const rows = db.prepare('SELECT * FROM proxy_nodes ORDER BY is_active DESC, created_at ASC').all() as any[];
    return rows.map(this.mapNodeRow);
  }

  public getNode(id: string): ProxyNode | null {
    const row = db.prepare('SELECT * FROM proxy_nodes WHERE id = ?').get(id) as any;
    return row ? this.mapNodeRow(row) : null;
  }

  public addNode(input: AddProxyInput): ProxyNode {
    const parsed = this.parseSingleProxy(input.server);
    const id = randomUUID();
    const now = new Date().toISOString();
    const name = (input.name || '').trim() || parsed.name;
    const protocol = input.protocol || parsed.protocol;
    const server = parsed.server;
    const isActive = input.isActive !== false ? 1 : 0;
    const weight = Math.max(1, Math.min(100, Number(input.weight) || 1));

    const stmt = db.prepare(`
      INSERT INTO proxy_nodes (
        id, name, server, protocol, is_active, weight, latency_ms,
        exit_ip, exit_region, last_checked_at, last_status, last_error,
        total_requests, success_requests, total_bytes, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, -1, NULL, NULL, NULL, 'untested', NULL, 0, 0, 0, ?, ?)
    `);

    stmt.run(id, name, server, protocol, isActive, weight, now, now);
    return this.getNode(id)!;
  }

  public updateNode(id: string, input: Partial<AddProxyInput & { isActive?: boolean; weight?: number }>): ProxyNode {
    const existing = this.getNode(id);
    if (!existing) throw new Error(`代理节点不存在 (${id})`);

    const now = new Date().toISOString();
    let server = existing.server;
    let protocol = existing.protocol;
    let name = input.name !== undefined ? (input.name.trim() || existing.name) : existing.name;

    if (input.server && input.server.trim()) {
      const parsed = this.parseSingleProxy(input.server);
      server = parsed.server;
      protocol = input.protocol || parsed.protocol;
      if (!input.name) name = parsed.name;
    }

    const isActive = input.isActive !== undefined ? (input.isActive ? 1 : 0) : (existing.isActive ? 1 : 0);
    const weight = input.weight !== undefined ? Math.max(1, Math.min(100, Number(input.weight) || 1)) : existing.weight;

    const stmt = db.prepare(`
      UPDATE proxy_nodes SET
        name = ?,
        server = ?,
        protocol = ?,
        is_active = ?,
        weight = ?,
        updated_at = ?
      WHERE id = ?
    `);

    stmt.run(name, server, protocol, isActive, weight, now, id);
    return this.getNode(id)!;
  }

  public deleteNode(id: string): boolean {
    const res = db.prepare('DELETE FROM proxy_nodes WHERE id = ?').run(id);
    return res.changes > 0;
  }

  // ================= Smart Multi-Format Batch Parser =================
  /**
   * Parses arbitrary proxy strings. Handles formats:
   * 1. ip:port:user:pass
   * 2. ip:port
   * 3. user:pass@ip:port
   * 4. protocol://user:pass@ip:port
   * 5. ip:port:user:pass (tab or comma separated)
   */
  public parseSingleProxy(raw: string, defaultNamePrefix = 'Proxy', index = 1): ParsedProxyItem {
    const trimmed = raw.trim();
    if (!trimmed) throw new Error('代理地址不能为空');

    let protocol: ProxyProtocol = 'http';
    let user = '';
    let pass = '';
    let host = '';
    let port = '';

    // Check if starts with protocol://
    if (/^(https?|socks5):\/\//i.test(trimmed)) {
      try {
        const parsedUrl = new URL(trimmed);
        protocol = parsedUrl.protocol.replace(':', '').toLowerCase() as ProxyProtocol;
        if (protocol === 'https') protocol = 'http'; // Standard HTTP proxy with CONNECT
        user = decodeURIComponent(parsedUrl.username || '');
        pass = decodeURIComponent(parsedUrl.password || '');
        host = parsedUrl.hostname;
        port = parsedUrl.port || (protocol === 'socks5' ? '1080' : '8080');
      } catch {
        // Fall back to regex
      }
    }

    if (!host) {
      // Clean string
      let clean = trimmed.replace(/^(https?|socks5):\/\//i, '');
      if (trimmed.toLowerCase().startsWith('socks5://')) protocol = 'socks5';

      // Format: user:pass@host:port
      if (clean.includes('@')) {
        const parts = clean.split('@');
        const authPart = parts[0];
        const hostPart = parts[1];
        if (authPart.includes(':')) {
          const authArr = authPart.split(':');
          user = authArr[0];
          pass = authArr.slice(1).join(':');
        } else {
          user = authPart;
        }
        if (hostPart.includes(':')) {
          const hostArr = hostPart.split(':');
          host = hostArr[0];
          port = hostArr[1];
        } else {
          host = hostPart;
          port = '8080';
        }
      } else {
        // Delimiter could be ':' or ',' or '\t'
        const parts = clean.split(/[:,\t]/);
        if (parts.length >= 4) {
          // Format: ip:port:user:pass
          host = parts[0].trim();
          port = parts[1].trim();
          user = parts[2].trim();
          pass = parts.slice(3).join(':').trim();
        } else if (parts.length === 2) {
          // Format: ip:port
          host = parts[0].trim();
          port = parts[1].trim();
        } else {
          host = clean.trim();
          port = '8080';
        }
      }
    }

    if (!host) throw new Error(`无法解析有效的代理主机地址: "${raw}"`);
    const portNum = Number(port) || 8080;

    let normalizedServer = '';
    if (user && pass) {
      normalizedServer = `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${host}:${portNum}`;
    } else {
      normalizedServer = `${protocol}://${host}:${portNum}`;
    }

    const name = `${defaultNamePrefix}-${index.toString().padStart(2, '0')} (${host}:${portNum})`;

    return {
      name,
      server: normalizedServer,
      protocol,
      raw: trimmed
    };
  }

  public batchImport(rawText: string, defaultProtocol: ProxyProtocol = 'http'): { imported: number; errors: string[] } {
    const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0 && !l.startsWith('#'));
    let imported = 0;
    const errors: string[] = [];

    const existingRows = db.prepare('SELECT server FROM proxy_nodes').all() as Array<{ server: string }>;
    const existingServers = new Set(existingRows.map((r) => r.server.toLowerCase()));

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      try {
        const parsed = this.parseSingleProxy(line, 'Proxy', i + 1);
        if (defaultProtocol && !line.includes('://')) {
          parsed.protocol = defaultProtocol;
          if (parsed.server.startsWith('http://') && defaultProtocol === 'socks5') {
            parsed.server = parsed.server.replace(/^http:\/\//, 'socks5://');
          }
        }

        if (existingServers.has(parsed.server.toLowerCase())) {
          // Skip duplicates or update
          continue;
        }

        const id = randomUUID();
        const now = new Date().toISOString();
        db.prepare(`
          INSERT INTO proxy_nodes (
            id, name, server, protocol, is_active, weight, latency_ms,
            exit_ip, exit_region, last_checked_at, last_status, last_error,
            total_requests, success_requests, total_bytes, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 1, 1, -1, NULL, NULL, NULL, 'untested', NULL, 0, 0, 0, ?, ?)
        `).run(id, parsed.name, parsed.server, parsed.protocol, now, now);

        existingServers.add(parsed.server.toLowerCase());
        imported += 1;
      } catch (err: any) {
        errors.push(`第 ${i + 1} 行 (${line.slice(0, 30)}...): ${err?.message || '解析失败'}`);
      }
    }

    return { imported, errors };
  }

  // ================= Health Check & Speed Test =================
  public async testProxyNode(nodeId: string): Promise<{ success: boolean; latencyMs: number; exitIp?: string; exitRegion?: string; error?: string }> {
    const node = this.getNode(nodeId);
    if (!node) throw new Error(`代理节点不存在 (${nodeId})`);

    const result = await this.probeServer(node.server);
    const now = new Date().toISOString();

    db.prepare(`
      UPDATE proxy_nodes SET
        latency_ms = ?,
        exit_ip = ?,
        exit_region = ?,
        last_checked_at = ?,
        last_status = ?,
        last_error = ?,
        updated_at = ?
      WHERE id = ?
    `).run(
      result.latencyMs,
      result.exitIp || null,
      result.exitRegion || null,
      now,
      result.success ? 'ok' : 'error',
      result.error || null,
      now,
      nodeId
    );

    return result;
  }

  public async testAllNodes(): Promise<Array<{ id: string; name: string; success: boolean; latencyMs: number; exitIp?: string; exitRegion?: string; error?: string }>> {
    const nodes = this.listNodes();
    const results = await Promise.all(
      nodes.map(async (n) => {
        const res = await this.testProxyNode(n.id).catch((err) => ({
          success: false,
          latencyMs: -1,
          error: err?.message || '测速异常'
        }));
        return {
          id: n.id,
          name: n.name,
          ...res
        };
      })
    );
    return results;
  }

  /**
   * Probe proxy connectivity via HTTP CONNECT to target or ipify
   */
  public async probeServer(proxyUrl: string): Promise<{ success: boolean; latencyMs: number; exitIp?: string; exitRegion?: string; error?: string }> {
    const startTime = Date.now();
    try {
      const url = new URL(proxyUrl);
      const isSocks = url.protocol.startsWith('socks');
      const proxyHost = url.hostname;
      const proxyPort = Number(url.port) || (isSocks ? 1080 : 8080);
      const auth = url.username ? `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password || '')}` : undefined;

      return await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          socket.destroy();
          resolve({ success: false, latencyMs: -1, error: '连接超时 (5000ms)' });
        }, 5000);

        const socket = net.createConnection({ host: proxyHost, port: proxyPort }, () => {
          const connectHeaders = [
            'CONNECT www.mail.com:443 HTTP/1.1',
            'Host: www.mail.com:443',
            'Connection: close'
          ];
          if (auth) {
            connectHeaders.push(`Proxy-Authorization: Basic ${Buffer.from(auth).toString('base64')}`);
          }
          connectHeaders.push('', '');

          socket.write(connectHeaders.join('\r\n'));
        });

        let data = '';
        socket.on('data', (chunk) => {
          data += chunk.toString('latin1');
          if (data.includes('\r\n\r\n') || data.includes('\n\n')) {
            clearTimeout(timeout);
            socket.destroy();
            const latencyMs = Date.now() - startTime;
            const firstLine = data.split('\r\n')[0] || '';
            if (/HTTP\/\d(?:\.\d)?\s+2\d\d/i.test(firstLine)) {
              // Resolved successfully
              const exitRegion = resolveIpRegion(proxyHost);
              resolve({
                success: true,
                latencyMs,
                exitIp: proxyHost,
                exitRegion
              });
            } else {
              let reason = `代理返回错误: ${firstLine || 'Unknown'}`;
              if (data.toLowerCase().includes('auth fail') || data.includes('407') || data.includes('403 Forbidden') || data.includes('Proxy-Authenticate')) {
                reason = `代理认证失败 (403/407 Auth Fail)：账号或密码错误`;
                if (url.password && (url.password.includes('\u2022') || url.password.includes('%E2%80%A2'))) {
                  reason += '（检测到密码为网页小圆点 • 占位符，请填入真实的明文密码）';
                }
              }
              if (isSocks && data.includes('HTTP/')) {
                reason += '；该节点返回了 HTTP 报文，请将协议切换为【HTTP / HTTPS 隧道代理】';
              }
              resolve({
                success: false,
                latencyMs,
                error: reason
              });
            }
          }
        });

        socket.on('error', (err) => {
          clearTimeout(timeout);
          resolve({ success: false, latencyMs: -1, error: `握手失败: ${err.message}` });
        });
      });
    } catch (err: any) {
      return { success: false, latencyMs: -1, error: err?.message || '代理 URL 格式非法' };
    }
  }

  // ================= Dynamic Scheduling & 403 Failover =================
  /**
   * Acquire the next proxy according to active routingMode & scheduling strategy.
   * If routingMode === 'direct_first', only returns a proxy if it's a retry or direct IP is in 403 cooldown.
   */
  public acquireProxy(options?: { excludeProxyId?: string; isRetry?: boolean; provider?: string } | string): ProxyNode | null {
    const config = this.getConfig();
    if (!config.enabled) return null;

    const opts = typeof options === 'string' ? { excludeProxyId: options } : options || {};
    const { excludeProxyId, isRetry = false, provider } = opts;

    // Check routing mode
    if (config.routingMode === 'direct_first') {
      const isCooling = this.isDirectCooling();
      if (!isRetry && !isCooling) {
        // Attempt 1: Direct datacenter connection preferred (saves proxy bandwidth)
        return null;
      }
    } else if (config.routingMode === 'targeted') {
      const isTargetedProvider = provider === 'mailcom' || provider === 'offilive';
      if (!isTargetedProvider && !isRetry) {
        // Non-targeted provider on attempt 1 uses direct
        return null;
      }
    }
    // Mode 'always' or fallback/retry: acquire healthy node from pool

    const allActive = db.prepare(`
      SELECT * FROM proxy_nodes 
      WHERE is_active = 1
      ORDER BY created_at ASC
    `).all() as any[];

    if (allActive.length === 0) return null;

    // Filter out excluded failed proxy if failover is enabled and other nodes exist
    let candidates = allActive.map(this.mapNodeRow);
    if (excludeProxyId && config.failoverEnabled && candidates.length > 1) {
      const filtered = candidates.filter((n) => n.id !== excludeProxyId);
      if (filtered.length > 0) {
        candidates = filtered;
      }
    }

    if (candidates.length === 0) return null;

    if (config.strategy === 'latency_first') {
      const sorted = [...candidates].sort((a, b) => {
        const latA = a.latencyMs > 0 ? a.latencyMs : 99999;
        const latB = b.latencyMs > 0 ? b.latencyMs : 99999;
        return latA - latB;
      });
      return sorted[0];
    }

    if (config.strategy === 'random') {
      const idx = Math.floor(Math.random() * candidates.length);
      return candidates[idx];
    }

    // Default: Round-Robin
    const selected = candidates[this.roundRobinIndex % candidates.length];
    this.roundRobinIndex = (this.roundRobinIndex + 1) % 1000000;
    return selected;
  }

  // ================= Traffic & Bandwidth Logging =================
  public recordTraffic(params: {
    proxyId?: string;
    bytesSent?: number;
    bytesReceived?: number;
    durationMs?: number;
    status: string;
    traceId?: string;
    emailAccount?: string;
  }): void {
    try {
      const {
        proxyId,
        bytesSent = 0,
        bytesReceived = 0,
        durationMs = 0,
        status,
        traceId,
        emailAccount
      } = params;

      const totalBytes = Math.max(0, bytesSent + bytesReceived);
      if (!proxyId) return;

      const node = this.getNode(proxyId);
      const id = randomUUID();
      const now = new Date().toISOString();

      // 1. Insert detailed log
      db.prepare(`
        INSERT INTO proxy_traffic_logs (
          id, proxy_id, proxy_name, proxy_server, trace_id,
          email_account, bytes_sent, bytes_received, total_bytes,
          duration_ms, status, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        id,
        proxyId,
        node?.name || '未知节点',
        node?.server || '',
        traceId || null,
        emailAccount || null,
        bytesSent,
        bytesReceived,
        totalBytes,
        durationMs,
        status,
        now
      );

      // 2. Increment counters on proxy_nodes
      const isSuccess = status === 'success' || status === 'completed' || status === 'no_code' ? 1 : 0;
      db.prepare(`
        UPDATE proxy_nodes SET
          total_requests = total_requests + 1,
          success_requests = success_requests + ?,
          total_bytes = total_bytes + ?,
          updated_at = ?
        WHERE id = ?
      `).run(isSuccess, totalBytes, now, proxyId);
    } catch (err) {
      console.error('[ProxyService] Failed to record traffic:', err);
    }
  }

  public getTrafficSummary(): ProxyTrafficSummary {
    const nodes = this.listNodes();
    const activeNodes = nodes.filter((n) => n.isActive).length;
    const healthyNodes = nodes.filter((n) => n.isActive && n.lastStatus === 'ok').length;
    const validLatencies = nodes.filter((n) => n.latencyMs > 0).map((n) => n.latencyMs);
    const avgLatencyMs = validLatencies.length > 0
      ? Math.round(validLatencies.reduce((a, b) => a + b, 0) / validLatencies.length)
      : 0;

    const totalStats = db.prepare(`
      SELECT 
        SUM(total_bytes) as totalBytes,
        COUNT(*) as totalRequests
      FROM proxy_traffic_logs
    `).get() as any;

    const todayIso = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const todayStats = db.prepare(`
      SELECT 
        SUM(total_bytes) as todayBytes,
        COUNT(*) as todayRequests
      FROM proxy_traffic_logs
      WHERE created_at >= ?
    `).get(todayIso) as any;

    const directReqRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_requests'").get() as any;
    const directSavedBytesRow = db.prepare("SELECT value FROM system_settings WHERE key = 'proxy_direct_saved_bytes'").get() as any;
    const directRequests = Number(directReqRow?.value || 0);
    const savedBytesEst = Number(directSavedBytesRow?.value || 0);
    const proxyReqs = Number(totalStats?.totalRequests || 0);
    const totalAllReqs = proxyReqs + directRequests;
    const savedRatioPercent = totalAllReqs > 0 ? Math.round((directRequests / totalAllReqs) * 1000) / 10 : 0;

    return {
      totalBytes: Number(totalStats?.totalBytes || 0),
      todayBytes: Number(todayStats?.todayBytes || 0),
      totalRequests: proxyReqs,
      todayRequests: Number(todayStats?.todayRequests || 0),
      directRequests,
      savedBytesEst,
      savedRatioPercent,
      activeNodes,
      totalNodes: nodes.length,
      healthyNodes,
      avgLatencyMs
    };
  }

  public getTrafficLogs(params?: { page?: number; pageSize?: number; proxyId?: string }): {
    items: ProxyTrafficLogItem[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  } {
    const page = Math.max(1, params?.page || 1);
    const pageSize = Math.max(1, Math.min(100, params?.pageSize || 10));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = [];
    const args: any[] = [];

    if (params?.proxyId) {
      conditions.push('proxy_id = ?');
      args.push(params.proxyId);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRes = db.prepare(`SELECT COUNT(*) as count FROM proxy_traffic_logs ${whereClause}`).get(...args) as any;
    const total = countRes ? Number(countRes.count || 0) : 0;

    const rows = db.prepare(`
      SELECT * FROM proxy_traffic_logs
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(...args, pageSize, offset) as any[];

    return {
      items: rows.map(this.mapTrafficRow),
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  private mapNodeRow(row: any): ProxyNode {
    return {
      id: row.id,
      name: row.name,
      server: row.server,
      protocol: (row.protocol as ProxyProtocol) || 'http',
      isActive: row.is_active === 1,
      weight: Number(row.weight || 1),
      latencyMs: Number(row.latency_ms ?? -1),
      exitIp: row.exit_ip || null,
      exitRegion: row.exit_region || null,
      lastCheckedAt: row.last_checked_at || null,
      lastStatus: (row.last_status as ProxyStatus) || 'untested',
      lastError: row.last_error || null,
      totalRequests: Number(row.total_requests || 0),
      successRequests: Number(row.success_requests || 0),
      totalBytes: Number(row.total_bytes || 0),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  private mapTrafficRow(row: any): ProxyTrafficLogItem {
    return {
      id: row.id,
      proxyId: row.proxy_id,
      proxyName: row.proxy_name,
      proxyServer: row.proxy_server,
      traceId: row.trace_id,
      emailAccount: row.email_account,
      bytesSent: Number(row.bytes_sent || 0),
      bytesReceived: Number(row.bytes_received || 0),
      totalBytes: Number(row.total_bytes || 0),
      durationMs: Number(row.duration_ms || 0),
      status: row.status,
      createdAt: row.created_at
    };
  }
}

export const proxyService = new ProxyService();
