import { randomUUID } from 'node:crypto';
import { describe, it, expect, beforeEach } from 'vitest';
import { adminAuthService } from '../src/server/auth/admin-auth.js';
import { generateBase32Secret, generateTotp, verifyTotp, generateOtpAuthUri } from '../src/server/auth/totp.js';
import { usageLogger } from '../src/server/services/usage-logger.js';
import { diagLogger } from '../src/server/services/diag-logger.js';
import {
  apiKeyService,
  encryptSecret,
  decryptSecret,
  resolveApiKeyFetchTimeoutMs
} from '../src/server/services/api-key-service.js';
import { accessTokenService } from '../src/server/services/access-token-service.js';

describe('Backyard Management & API Engine', () => {
  it('allows OffiLive API Key fetches to use the full RPA timeout', () => {
    expect(resolveApiKeyFetchTimeoutMs('offilive')).toBe(285_000);
    expect(resolveApiKeyFetchTimeoutMs('mailcom')).toBe(60_000);
    expect(resolveApiKeyFetchTimeoutMs('gmx')).toBe(60_000);
  });

  describe('TOTP 2FA Engine', () => {
    it('generates valid base32 secrets', () => {
      const secret = generateBase32Secret(20);
      expect(secret).toBeDefined();
      expect(secret.length).toBeGreaterThanOrEqual(32);
      expect(/^[A-Z2-7]+$/.test(secret)).toBe(true);
    });

    it('generates and verifies 6-digit TOTP code correctly', () => {
      const secret = generateBase32Secret(20);
      const code = generateTotp(secret);
      expect(code).toHaveLength(6);
      expect(/^\d{6}$/.test(code)).toBe(true);
      expect(verifyTotp(code, secret)).toBe(true);
      expect(verifyTotp('000000', secret)).toBe(false);
    });

    it('generates otpauth URI with proper format', () => {
      const secret = 'JBSWY3DPEHPK3PXP';
      const uri = generateOtpAuthUri('InboxMate', 'tqd354@gmail.com', secret);
      expect(uri).toContain('otpauth://totp/InboxMate:tqd354%40gmail.com');
      expect(uri).toContain(`secret=${secret}`);
    });
  });

  describe('Admin Auth Service', () => {
    it('authenticates default admin credentials successfully', () => {
      const result = adminAuthService.login('tqd354@gmail.com', 'aaAA1122');
      expect(result).toBeDefined();
      expect(result.user?.email).toBe('tqd354@gmail.com');
      expect(result.token).toBeDefined();
    });

    it('rejects incorrect password', () => {
      expect(() => {
        adminAuthService.login('tqd354@gmail.com', 'wrongpassword');
      }).toThrow('用户名或密码错误');
    });

    it('sets up 2FA and verifies dynamic token', () => {
      const user = adminAuthService.getAdminUser();
      expect(user).toBeDefined();
      if (!user) return;

      const setup = adminAuthService.setup2FA(user.id);
      expect(setup.secret).toBeDefined();
      expect(setup.qrSvg).toContain('<svg');

      const code = generateTotp(setup.secret);
      adminAuthService.enable2FA(user.id, code);

      const updatedUser = adminAuthService.getAdminUser();
      expect(updatedUser?.twoFactorEnabled).toBe(true);

      // Now login requires 2FA
      const step1 = adminAuthService.login('tqd354@gmail.com', 'aaAA1122');
      expect(step1.require2FA).toBe(true);
      expect(step1.tempToken).toBeDefined();

      const step2 = adminAuthService.verify2FALogin(step1.tempToken!, code);
      expect(step2.token).toBeDefined();

      // Disable 2FA
      adminAuthService.disable2FA(user.id, code);
      const disabledUser = adminAuthService.getAdminUser();
      expect(disabledUser?.twoFactorEnabled).toBe(false);
    });
  });

  describe('Usage Logger Service', () => {
    it('records and queries usage logs with pagination and filters', () => {
      usageLogger.record({
        clientIp: '192.168.1.100',
        emailAccount: 'test_audit@mail.com',
        provider: 'mailcom',
        sourceMode: 'batch',
        status: 'success',
        hasCode: true,
        extractedCode: '849201',
        durationMs: 1420,
        messageCount: 3
      });

      const res = usageLogger.query({
        search: '849201',
        page: 1,
        pageSize: 10
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      const match = res.items.find((i) => i.extractedCode === '849201');
      expect(match).toBeDefined();
      expect(match?.emailAccount).toContain('mail.com');
      expect(match?.sourceMode).toBe('batch');
    });

    it('exports CSV formatted records', () => {
      const csv = usageLogger.exportCsv({ page: 1, pageSize: 10 });
      expect(csv).toContain('ID,请求时间,客户端IP,地理地区');
      expect(csv).toContain('849201');
    });
  });

  describe('API Key Service & Encryption', () => {
    it('encrypts and decrypts secrets with AES-256-GCM', () => {
      const rawSecret = 'oL9KZDccB_superSecret_123';
      const enc = encryptSecret(rawSecret);
      expect(enc.cipher).toBeDefined();
      expect(enc.iv).toBeDefined();
      expect(enc.tag).toBeDefined();

      const decrypted = decryptSecret(enc.cipher, enc.iv, enc.tag);
      expect(decrypted).toBe(rawSecret);
    });

    it('batch imports accounts from formatted text input', () => {
      const rawInput = `
        账号: anais_officiavhr@mail.com | 密码: oL9KZDccB
        batch_user2@outlook.com----passWord456
      `;

      const result = apiKeyService.batchImport(rawInput, {
        defaultProvider: 'smart',
        expiresInHours: 24,
        batchName: '单元测试导入'
      });

      expect(result.totalProcessed).toBe(2);
      expect(result.successCount).toBe(2);
      expect(result.keys).toHaveLength(2);
      expect(result.keys[0].accountEmail).toBe('anais_officiavhr@mail.com');
      expect(result.keys[0].apiKey).toMatch(/^im_/);
    });

    it('exports keys in user requested format', () => {
      const list = apiKeyService.queryKeys({ search: 'anais_officiavhr', page: 1, pageSize: 10 });
      expect(list.items.length).toBeGreaterThan(0);

      const formatted = apiKeyService.exportKeysFormatted(list.items, 'http://localhost:3000', 'custom');
      expect(formatted).toContain('账号: anais_officiavhr@mail.com');
      expect(formatted).toContain('密码: oL9KZDccB');
      expect(formatted).toContain('API：http://localhost:3000/api/im_');
    });

    it('filters and exports accounts specifically bound to a Token', () => {
      const token = accessTokenService.createToken({
        name: '分组测试Token',
        totalQuota: 50
      });

      const rawInput = `
        group_user1@mail.com----passGroup1
        group_user2@mail.com----passGroup2
      `;

      apiKeyService.batchImport(rawInput, {
        tokenId: token.id,
        batchName: 'Token分组'
      });

      // Query specifically by tokenId
      const tokenKeys = apiKeyService.queryKeys({ tokenId: token.id, pageSize: 100 });
      expect(tokenKeys.items).toHaveLength(2);
      expect(tokenKeys.items.map((k) => k.accountEmail)).toContain('group_user1@mail.com');
      expect(tokenKeys.items.map((k) => k.accountEmail)).toContain('group_user2@mail.com');

      // Export specifically for this token
      const exported = apiKeyService.exportKeysFormatted(tokenKeys.items, 'http://127.0.0.1:3000', 'custom', token.token);
      expect(exported).toContain(`?token=${token.token}`);
      expect(exported).toContain('group_user1@mail.com');
      expect(exported).toContain('group_user2@mail.com');
      expect(exported).not.toContain('batch_user2@outlook.com');
    });
  });

  describe('Diagnostic Logger Service', () => {
    it('records and filters diagnostic traces', () => {
      diagLogger.info('web_rpa', '打开登录框', 'Playwright 成功定位到登录按钮', { attempt: 1 }, 'user@mail.com');

      const res = diagLogger.query({
        engine: 'web_rpa',
        level: 'INFO',
        search: '登录按钮'
      });

      expect(res.total).toBeGreaterThanOrEqual(1);
      expect(res.items[0].stage).toBe('打开登录框');
    });

    it('records and isolates diagnostic traces by traceId', () => {
      const traceId1 = `trace-uuid-${randomUUID()}`;
      const traceId2 = `trace-uuid-${randomUUID()}`;

      diagLogger.info('web_rpa', '启动浏览器', '启动会话 1', undefined, 'u1@mail.com', traceId1);
      diagLogger.info('web_rpa', '等待收件箱', '等待邮件 1', undefined, 'u1@mail.com', traceId1);
      diagLogger.info('web_rpa', '启动浏览器', '启动会话 2', undefined, 'u2@mail.com', traceId2);

      const res1 = diagLogger.query({ traceId: traceId1 });
      expect(res1.items).toHaveLength(2);
      expect(res1.items.every((it) => it.traceId === traceId1)).toBe(true);

      const res2 = diagLogger.query({ traceId: traceId2 });
      expect(res2.items).toHaveLength(1);
      expect(res2.items[0].traceId).toBe(traceId2);
    });

    it('stores and retrieves forensics snapshot details with screenshots', () => {
      const traceId = `trace-forensics-${randomUUID()}`;
      const snapshot = {
        finalUrl: 'https://consent.mail.com/ui/consent',
        pageTitle: 'Mail.com - Privacy Consent',
        pageCategory: 'consent_interstitial',
        detectedPrompt: 'Please agree to our updated privacy policy',
        screenshotBase64: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...',
        framesCount: 2
      };

      diagLogger.warn('web_rpa', '等待收件箱', '30秒内未加载出收件箱列表', snapshot, 'test@mail.com', traceId);

      const res = diagLogger.query({ traceId });
      expect(res.items).toHaveLength(1);
      expect(res.items[0].details).toBeDefined();

      const parsed = JSON.parse(res.items[0].details!);
      expect(parsed.pageCategory).toBe('consent_interstitial');
      expect(parsed.screenshotBase64).toContain('data:image/jpeg;base64');
      expect(parsed.finalUrl).toBe('https://consent.mail.com/ui/consent');
    });
  });

  describe('IP Block & Access Control Service', () => {
    it('blocks an abusive IP and detects it correctly', async () => {
      const { ipBlockService } = await import('../src/server/services/ip-block-service.js');
      const testIp = '203.0.113.42';
      ipBlockService.unblockIp(testIp);

      expect(ipBlockService.isIpBlocked(testIp).blocked).toBe(false);

      ipBlockService.blockIp({
        ip: testIp,
        reason: '恶意大批量并发请求',
        durationHours: 24
      });

      const check = ipBlockService.isIpBlocked(testIp);
      expect(check.blocked).toBe(true);
      expect(check.reason).toBe('恶意大批量并发请求');

      const list = ipBlockService.listBlockedIps();
      expect(list.items.some((item) => item.ip === testIp)).toBe(true);

      ipBlockService.unblockIp(testIp);
      expect(ipBlockService.isIpBlocked(testIp).blocked).toBe(false);
    });
  });

  describe('Chrome RPA Lifecycle & Status', () => {
    it('reports engine status correctly', async () => {
      const { getRpaStatus } = await import('../src/server/engines/web-rpa-engine.js');
      const status = await getRpaStatus();
      expect(status).toBeDefined();
      expect(typeof status.activeConcurrentAccounts).toBe('number');
      expect(typeof status.maxRecycleUsage).toBe('number');
      expect(status.maxRecycleUsage).toBe(30);
      expect(status.proxyInfo).toBeDefined();
    });
  });

  describe('System Settings & Hardware Tuner Service', () => {
    it('provides full payload including hardware, recommendations, and settings', async () => {
      const { systemSettingsService } = await import('../src/server/services/system-settings-service.js');
      const payload = systemSettingsService.getFullPayload();
      expect(payload).toBeDefined();
      expect(payload.hardware).toBeDefined();
      expect(payload.recommendations).toBeDefined();
      expect(payload.currentSettings).toBeDefined();
      expect(payload.recommendations.rpaConcurrency).toBeGreaterThanOrEqual(1);
    });
  });
});
