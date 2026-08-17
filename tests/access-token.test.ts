import { describe, it, expect, beforeEach } from 'vitest';
import { accessTokenService } from '../src/server/services/access-token-service.js';
import { apiKeyService } from '../src/server/services/api-key-service.js';
import { usageLogger } from '../src/server/services/usage-logger.js';

describe('Access Token Service & Quota Management', () => {
  it('creates an access token with default 10 quota', () => {
    const token = accessTokenService.createToken({
      name: '测试自动化用户A',
      totalQuota: 10,
      durationDays: 7
    });

    expect(token).toBeDefined();
    expect(token.token.startsWith('tok_')).toBe(true);
    expect(token.name).toBe('测试自动化用户A');
    expect(token.totalQuota).toBe(10);
    expect(token.usedQuota).toBe(0);
    expect(token.remainingQuota).toBe(10);
    expect(token.isActive).toBe(true);
    expect(token.isExhausted).toBe(false);
    expect(token.expiresAt).not.toBeNull();
  });

  it('verifies token access and consumes quota correctly until exhausted', () => {
    const token = accessTokenService.createToken({
      name: '扣费测试Token',
      totalQuota: 3
    });

    // 1st verify: Valid
    let check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(true);
    expect(check.token?.remainingQuota).toBe(3);

    // Consume 1st time
    const consumed1 = accessTokenService.consumeQuota(token.id);
    expect(consumed1).toBe(true);

    // 2nd verify: 2 remaining
    check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(true);
    expect(check.token?.remainingQuota).toBe(2);

    // Consume 2nd and 3rd time
    accessTokenService.consumeQuota(token.id);
    accessTokenService.consumeQuota(token.id);

    // 4th verify: Exhausted!
    check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('额度已用尽');

    // Trying to consume again should fail
    const consumedOver = accessTokenService.consumeQuota(token.id);
    expect(consumedOver).toBe(false);
  });

  it('tops up quota for an existing token', () => {
    const token = accessTokenService.createToken({
      name: '充值测试Token',
      totalQuota: 5
    });

    // Use 5 times with audit logs
    for (let i = 0; i < 5; i++) {
      accessTokenService.consumeQuota(token.id);
      usageLogger.record({
        clientIp: '127.0.0.1',
        emailAccount: `recharge_test_${i}@mail.com`,
        provider: 'mailcom',
        sourceMode: 'api_key',
        status: 'success',
        hasCode: true,
        extractedCode: String(100000 + i),
        durationMs: 1200 + i * 100,
        messageCount: 1,
        tokenId: token.id,
        token: token.token
      });
    }
    expect(accessTokenService.verifyTokenAccess(token.token).valid).toBe(false);

    // Top up +10
    const updated = accessTokenService.topUpQuota(token.id, 10);
    expect(updated.totalQuota).toBe(15);
    expect(updated.usedQuota).toBe(5);
    expect(updated.remainingQuota).toBe(10);
    expect(updated.isExhausted).toBe(false);

    // Check token audit logs
    const tokenLogs = accessTokenService.getTokenLogs(token.id);
    expect(tokenLogs.total).toBe(5);
    expect(tokenLogs.items.length).toBe(5);

    // Verify access is restored
    const check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(true);
  });

  it('freezes and unfreezes token', () => {
    const token = accessTokenService.createToken({
      name: '冻结测试Token',
      totalQuota: 10
    });

    accessTokenService.setTokenActive(token.id, false);
    let check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(false);
    expect(check.reason).toContain('已被管理员冻结');

    accessTokenService.setTokenActive(token.id, true);
    check = accessTokenService.verifyTokenAccess(token.token);
    expect(check.valid).toBe(true);
  });

  it('exports API Keys with bound token parameter seamlessly', () => {
    const mockKey = {
      id: 'key_test_1',
      apiKey: 'im_testkey12345678',
      name: 'Test Account',
      accountEmail: 'testuser@mail.com',
      provider: 'mailcom',
      isActive: true,
      expiresAt: null,
      callCount: 0,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const formattedWithoutToken = apiKeyService.exportKeysFormatted(
      [mockKey],
      'https://example.com',
      'custom'
    );
    expect(formattedWithoutToken).toContain('API：https://example.com/api/im_testkey12345678');

    const formattedWithToken = apiKeyService.exportKeysFormatted(
      [mockKey],
      'https://example.com',
      'custom',
      'tok_mysecrettoken999'
    );
    expect(formattedWithToken).toContain('API：https://example.com/api/im_testkey12345678?token=tok_mysecrettoken999');
  });

  it('retrieves detailed usage consumption logs for a token', () => {
    const token = accessTokenService.createToken({
      name: '日志测试Token',
      totalQuota: 20
    });

    usageLogger.record({
      clientIp: '192.168.1.100',
      region: '北京市',
      emailAccount: 'tester1@mail.com',
      provider: 'mailcom',
      sourceMode: 'single',
      status: 'success',
      hasCode: true,
      extractedCode: '884821',
      durationMs: 3200,
      messageCount: 5,
      tokenId: token.id,
      token: token.token
    });

    const logsResult = accessTokenService.getTokenLogs(token.id);
    expect(logsResult).toBeDefined();
    expect(logsResult.token.name).toBe('日志测试Token');
    expect(logsResult.items.length).toBeGreaterThanOrEqual(1);
    expect(logsResult.items[0].clientIp).toBe('192.168.1.100');
    expect(logsResult.items[0].extractedCode).toBe('884821');
  });
});
