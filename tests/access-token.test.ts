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

  it('requires an explicitly supplied Token bound to the API Key', () => {
    const token = accessTokenService.createToken({
      name: 'API Key 强制鉴权测试Token',
      totalQuota: 10
    });
    const imported = apiKeyService.batchImport('api_auth_test@mail.com----password123', {
      tokenId: token.id,
      batchName: 'API Key 强制鉴权测试'
    });
    const key = imported.keys[0];
    expect(key).toBeDefined();

    expect(() => apiKeyService.validateApiKeyToken(key.apiKey)).toThrowError(/缺少访问 Token 凭据/);

    const otherToken = accessTokenService.createToken({
      name: 'API Key 错误绑定测试Token',
      totalQuota: 10
    });
    expect(() => apiKeyService.validateApiKeyToken(key.apiKey, otherToken.token)).toThrowError(/不匹配/);

    const verified = apiKeyService.validateApiKeyToken(key.apiKey, token.token);
    expect(verified.id).toBe(token.id);
  });

  it('rejects API Keys without a bound Token', () => {
    const imported = apiKeyService.batchImport('api_unbound_test@mail.com----password123', {
      batchName: 'API Key 未绑定鉴权测试'
    });
    const key = imported.keys[0];
    const token = accessTokenService.createToken({
      name: 'API Key 未绑定鉴权测试Token',
      totalQuota: 10
    });
    expect(() => apiKeyService.validateApiKeyToken(key.apiKey, token.token)).toThrowError(/尚未绑定/);
  });

  it('retrieves detailed usage consumption logs for a token with stats and status filtering', () => {
    const token = accessTokenService.createToken({
      name: '日志分类测试Token',
      totalQuota: 20
    });

    // Record 1 success (with code)
    usageLogger.record({
      clientIp: '192.168.1.100',
      region: '北京市',
      emailAccount: 'tester1@mail.com',
      provider: 'mailcom',
      sourceMode: 'api_key',
      status: 'success',
      hasCode: true,
      extractedCode: '884821',
      durationMs: 3200,
      messageCount: 5,
      tokenId: token.id,
      token: token.token
    });

    // Record 1 success (no_code / 邮件获取)
    usageLogger.record({
      clientIp: '192.168.1.102',
      region: '广州市',
      emailAccount: 'tester3@mail.com',
      provider: 'mailcom',
      sourceMode: 'api_key',
      status: 'no_code',
      hasCode: false,
      extractedCode: undefined,
      durationMs: 2800,
      messageCount: 3,
      tokenId: token.id,
      token: token.token
    });

    // Record 1 error
    usageLogger.record({
      clientIp: '192.168.1.101',
      region: '上海市',
      emailAccount: 'tester2@mail.com',
      provider: 'mailcom',
      sourceMode: 'api_key',
      status: 'error',
      statusDetail: '403 Blocked',
      hasCode: false,
      extractedCode: undefined,
      durationMs: 4100,
      messageCount: 0,
      tokenId: token.id,
      token: token.token
    });

    // Query all (3 total)
    const allLogs = accessTokenService.getTokenLogs(token.id, { status: 'all' });
    expect(allLogs).toBeDefined();
    expect(allLogs.total).toBe(3);
    expect(allLogs.stats.totalCalls).toBe(3);
    expect(allLogs.stats.successCalls).toBe(2); // success + no_code
    expect(allLogs.stats.errorCalls).toBe(1);
    expect(allLogs.stats.successRate).toBe(66.7);
    expect(allLogs.stats.freeProtectionCount).toBe(1);

    // Query success only (2 items: success + no_code)
    const successLogs = accessTokenService.getTokenLogs(token.id, { status: 'success' });
    expect(successLogs.total).toBe(2);
    expect(successLogs.items.map((i) => i.status)).toContain('success');
    expect(successLogs.items.map((i) => i.status)).toContain('no_code');

    // Query error only (1 item: error, no_code MUST NOT be here)
    const errorLogs = accessTokenService.getTokenLogs(token.id, { status: 'error' });
    expect(errorLogs.total).toBe(1);
    expect(errorLogs.items[0].status).toBe('error');
    expect(errorLogs.items[0].clientIp).toBe('192.168.1.101');
  });
});
