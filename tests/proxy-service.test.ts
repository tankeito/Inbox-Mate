import { describe, it, expect, beforeEach } from 'vitest';
import { proxyService } from '../src/server/services/proxy-service.js';
import { db } from '../src/server/db/database.js';

describe('ProxyService & Traffic Management', () => {
  beforeEach(() => {
    db.prepare('DELETE FROM proxy_traffic_logs').run();
    db.prepare('DELETE FROM proxy_nodes').run();
    db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'proxy_enabled'").run();
    db.prepare("UPDATE system_settings SET value = 'round_robin' WHERE key = 'proxy_strategy'").run();
    db.prepare("UPDATE system_settings SET value = 'direct_first' WHERE key = 'proxy_routing_mode'").run();
    db.prepare("UPDATE system_settings SET value = '1' WHERE key = 'proxy_failover_enabled'").run();
    db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'proxy_direct_requests'").run();
    db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'proxy_direct_saved_bytes'").run();
    db.prepare("UPDATE system_settings SET value = '' WHERE key = 'proxy_direct_cooldown_until'").run();
    db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'proxy_direct_403_streak'").run();
    db.prepare("UPDATE system_settings SET value = '0' WHERE key = 'proxy_direct_403_last_ts'").run();
  });

  describe('1. Multi-Format Proxy Parsing & Batch Import', () => {
    it('parses ip:port:user:pass correctly', () => {
      const parsed = proxyService.parseSingleProxy('192.168.1.100:8080:admin:secret123');
      expect(parsed.protocol).toBe('http');
      expect(parsed.server).toBe('http://admin:secret123@192.168.1.100:8080');
      expect(parsed.name).toContain('192.168.1.100:8080');
    });

    it('parses socks5://user:pass@ip:port correctly', () => {
      const parsed = proxyService.parseSingleProxy('socks5://myuser:mypass@10.0.0.1:1080');
      expect(parsed.protocol).toBe('socks5');
      expect(parsed.server).toBe('socks5://myuser:mypass@10.0.0.1:1080');
    });

    it('parses ip:port without auth', () => {
      const parsed = proxyService.parseSingleProxy('1.2.3.4:3128');
      expect(parsed.protocol).toBe('http');
      expect(parsed.server).toBe('http://1.2.3.4:3128');
    });

    it('batch imports multiple formats and ignores duplicates', () => {
      const batchText = `
        # Comment line
        192.168.1.1:8080:user1:pass1
        socks5://user2:pass2@192.168.1.2:1080
        192.168.1.3:8080
        192.168.1.1:8080:user1:pass1
      `;
      const result = proxyService.batchImport(batchText);
      expect(result.imported).toBe(3);
      expect(result.errors.length).toBe(0);

      const nodes = proxyService.listNodes();
      expect(nodes.length).toBe(3);
    });
  });

  describe('2. Global Switch & Dynamic Round-Robin Scheduling', () => {
    it('returns null when proxy is globally disabled', () => {
      proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      proxyService.updateConfig({ enabled: false });

      const proxy = proxyService.acquireProxy();
      expect(proxy).toBeNull();
    });

    it('round-robins across multiple active nodes when enabled', () => {
      const n1 = proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      const n2 = proxyService.addNode({ name: 'Node 2', server: 'http://2.2.2.2:8080' });
      const n3 = proxyService.addNode({ name: 'Node 3', server: 'http://3.3.3.3:8080' });

      proxyService.updateConfig({ enabled: true, strategy: 'round_robin', routingMode: 'always' });

      const pick1 = proxyService.acquireProxy();
      const pick2 = proxyService.acquireProxy();
      const pick3 = proxyService.acquireProxy();
      const pick4 = proxyService.acquireProxy();

      expect(pick1?.id).toBe(n1.id);
      expect(pick2?.id).toBe(n2.id);
      expect(pick3?.id).toBe(n3.id);
      expect(pick4?.id).toBe(n1.id); // Wraps around
    });

    it('excludes failed proxy on retry for 403 failover rotation', () => {
      const n1 = proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      const n2 = proxyService.addNode({ name: 'Node 2', server: 'http://2.2.2.2:8080' });

      proxyService.updateConfig({ enabled: true, failoverEnabled: true, routingMode: 'always' });

      // Simulate attempt 1 got 403 on Node 1, attempt 2 requests a rotation excluding Node 1
      const retryProxy = proxyService.acquireProxy(n1.id);
      expect(retryProxy?.id).toBe(n2.id);
    });
  });

  describe('3. Smart Tiered Routing (Direct-First, Always, Targeted) & Coordinated Backoff', () => {
    it('direct_first mode: returns null on attempt 1, but allocates proxy on retry (403 fallback)', () => {
      const n1 = proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      proxyService.updateConfig({ enabled: true, routingMode: 'direct_first' });

      // Attempt 1: Direct preferred (0 proxy bandwidth)
      const attempt1 = proxyService.acquireProxy({ isRetry: false, provider: 'mailcom' });
      expect(attempt1).toBeNull();

      // Attempt 2 (Retry on 403): Proxy allocated immediately
      const attempt2 = proxyService.acquireProxy({ isRetry: true, provider: 'mailcom' });
      expect(attempt2?.id).toBe(n1.id);
    });

    it('direct_first mode: triggers 5min Coordinated Backoff after consecutive 403s on direct IP', () => {
      const n1 = proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      proxyService.updateConfig({ enabled: true, routingMode: 'direct_first' });

      expect(proxyService.isDirectCooling()).toBe(false);

      // Simulate 2 consecutive 403s on direct IP
      proxyService.reportDirect403();
      proxyService.reportDirect403();

      expect(proxyService.isDirectCooling()).toBe(true);
      const config = proxyService.getConfig();
      expect(config.isDirectCooling).toBe(true);
      expect(config.directCooldownUntil).not.toBeNull();

      // In cooldown, even attempt 1 directly uses proxy pool to save latency!
      const directPiped = proxyService.acquireProxy({ isRetry: false, provider: 'mailcom' });
      expect(directPiped?.id).toBe(n1.id);

      // Success resets streak
      proxyService.reportDirectSuccess();
    });

    it('targeted mode: allocates proxy only for mailcom/offilive on attempt 1', () => {
      const n1 = proxyService.addNode({ name: 'Node 1', server: 'http://1.1.1.1:8080' });
      proxyService.updateConfig({ enabled: true, routingMode: 'targeted' });

      const gmx = proxyService.acquireProxy({ isRetry: false, provider: 'gmx' });
      expect(gmx).toBeNull();

      const mailcom = proxyService.acquireProxy({ isRetry: false, provider: 'mailcom' });
      expect(mailcom?.id).toBe(n1.id);
    });
  });

  describe('4. Traffic Logging & Saved Bandwidth Ratio', () => {
    it('records traffic and computes savings ratio accurately', () => {
      const node = proxyService.addNode({ name: 'Node Traffic Test', server: 'http://1.1.1.1:8080' });

      // 1 proxy request (10 KB)
      proxyService.recordTraffic({
        proxyId: node.id,
        bytesSent: 1024,
        bytesReceived: 9216,
        durationMs: 3200,
        status: 'success',
        traceId: 'trace-123',
        emailAccount: 'tester@mail.com'
      });

      // 9 direct requests (saved ~100KB each)
      for (let i = 0; i < 9; i++) {
        proxyService.recordDirectRequest(100 * 1024);
      }

      const summary = proxyService.getTrafficSummary();
      expect(summary.totalBytes).toBe(10240);
      expect(summary.totalRequests).toBe(1);
      expect(summary.directRequests).toBe(9);
      expect(summary.savedRatioPercent).toBe(90); // 9 out of 10 = 90.0% saved
      expect(summary.savedBytesEst).toBe(900 * 1024);
    });
  });
});
