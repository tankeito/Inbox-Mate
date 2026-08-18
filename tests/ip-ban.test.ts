import { describe, it, expect, beforeEach } from 'vitest';
import { ipBlockService } from '../src/server/services/ip-block-service';
import { geoIpService } from '../src/server/services/geo-ip-service';
import { db } from '../src/server/db/database';
import { formatFullDateTime, getDateRangePreset } from '../src/shared/format-utils';

describe('GeoIP Service Offline Resolution', () => {
  it('should resolve local and private IP ranges properly', () => {
    expect(geoIpService.resolve('127.0.0.1').countryCode).toBe('LOCAL');
    expect(geoIpService.resolve('192.168.1.100').countryCode).toBe('LAN');
    expect(geoIpService.resolve('10.0.0.5').countryCode).toBe('LAN');
  });

  it('should resolve recognized Chinese public IP ranges and fallback gracefully', () => {
    const res = geoIpService.resolve('114.114.114.114');
    expect(res.countryCode).toBe('CN');
    expect(res.countryName).toBe('中国');
    expect(res.flag).toBe('🇨🇳');
  });

  it('should resolve US DNS public IP ranges', () => {
    const res = geoIpService.resolve('8.8.8.8');
    expect(res.countryCode).toBe('US');
    expect(res.countryName).toBe('美国');
    expect(res.flag).toBe('🇺🇸');
  });
});

describe('IP Ban & TTL Auto-Unban Service', () => {
  const testIp = '198.51.100.99';

  beforeEach(() => {
    db.prepare('DELETE FROM blocked_ips WHERE ip = ?').run(testIp);
  });

  it('should block an IP permanently when durationHours is 0 / null', () => {
    const ban = ipBlockService.blockIp({
      ip: testIp,
      reason: '单元测试永久封禁',
      durationHours: null
    });

    expect(ban.ip).toBe(testIp);
    expect(ban.expiresAt).toBeNull();

    const status = ipBlockService.isIpBlocked(testIp);
    expect(status.blocked).toBe(true);
    expect(status.reason).toBe('单元测试永久封禁');
  });

  it('should block an IP with TTL and report expiresAt', () => {
    const ban = ipBlockService.blockIp({
      ip: testIp,
      reason: '单元测试临时封禁24小时',
      durationHours: 24
    });

    expect(ban.expiresAt).toBeTruthy();
    const status = ipBlockService.isIpBlocked(testIp);
    expect(status.blocked).toBe(true);
  });

  it('should automatically unblock when TTL has expired', () => {
    // Insert an expired ban directly into database
    const pastIso = new Date(Date.now() - 3600 * 1000).toISOString();
    db.prepare(`
      INSERT INTO blocked_ips (id, ip, reason, blocked_by, created_at, expires_at)
      VALUES ('blk_test_expired', ?, '已过期的封禁', 'admin', ?, ?)
      ON CONFLICT(ip) DO UPDATE SET expires_at = excluded.expires_at
    `).run(testIp, pastIso, pastIso);

    // Should detect expiry and return blocked = false
    const status = ipBlockService.isIpBlocked(testIp);
    expect(status.blocked).toBe(false);
  });

  it('should unblock manually', () => {
    ipBlockService.blockIp({ ip: testIp, reason: '测试手动解封' });
    expect(ipBlockService.isIpBlocked(testIp).blocked).toBe(true);

    const unblocked = ipBlockService.unblockIp(testIp);
    expect(unblocked).toBe(true);
    expect(ipBlockService.isIpBlocked(testIp).blocked).toBe(false);
  });

  it('should aggregate IP analytics and build world map dataset', () => {
    const analytics = ipBlockService.getIpAnalytics({ range: 'today' });
    expect(analytics.summary).toBeDefined();
    expect(analytics.ipList).toBeDefined();
    expect(analytics.countryList).toBeDefined();
    expect(analytics.worldMapData).toBeDefined();
  });

  it('should accurately calculate successRate including normal no_code polling status', () => {
    const testAnalyticsIp = '203.0.113.88';
    db.prepare('DELETE FROM usage_logs WHERE client_ip = ?').run(testAnalyticsIp);

    // Insert 2 'success', 2 'no_code', 1 'error'
    const insertLog = (status: string) => {
      db.prepare(`
        INSERT INTO usage_logs (id, client_ip, region, email_account, email_domain, provider, source_mode, status, has_code, duration_ms, message_count, created_at)
        VALUES (?, ?, '中国 江苏 南京', 'test@mail.com', 'mail.com', 'mailcom', 'api_key', ?, 0, 1500, 2, datetime('now'))
      `).run(`log_test_${Math.random()}`, testAnalyticsIp, status);
    };

    insertLog('success');
    insertLog('success');
    insertLog('no_code');
    insertLog('no_code');
    insertLog('error');

    const analytics = ipBlockService.getIpAnalytics();
    const item = analytics.ipList.find((i) => i.ip === testAnalyticsIp);

    expect(item).toBeDefined();
    expect(item?.requestCount).toBe(5);
    expect(item?.successCount).toBe(4); // 2 success + 2 no_code = 4
    expect(item?.successRate).toBe(80); // 4 / 5 = 80%
  });
});

describe('Date Formatter & Presets Compatibility', () => {
  it('should format full date time with year 2026/08/17 14:25:17', () => {
    const date = new Date('2026-08-17T14:25:17.000Z');
    const formatted = formatFullDateTime(date);
    expect(formatted).toMatch(/^2026\/08\/17 \d{2}:\d{2}:\d{2}$/);
  });

  it('should return valid preset ranges for today, 24h, 7d, 30d', () => {
    const today = getDateRangePreset('today');
    expect(today.startDate).toBeTruthy();
    expect(today.endDate).toBeTruthy();

    const sevenDays = getDateRangePreset('7d');
    expect(sevenDays.startDate < sevenDays.endDate).toBe(true);
  });
});
