import { accessTokenService } from '../src/server/services/access-token-service.js';
import { usageLogger } from '../src/server/services/usage-logger.js';
import { db } from '../src/server/db/database.js';

// Create test token for Figure 1
const token = accessTokenService.createToken({
  name: '闲鱼-娴情。',
  totalQuota: 10,
  token: 'tok_4ce25f8e5c4907f090e886588bdd66f0'
});

// Update used quota to 7
db.prepare('UPDATE access_tokens SET used_quota = 7 WHERE id = ?').run(token.id);

// Record 7 'no_code' (邮件获取)
for (let i = 0; i < 7; i++) {
  usageLogger.record({
    clientIp: `195.114.193.${20 + i}`,
    region: '中国 四川 成都',
    emailAccount: 'tr••••@mail.com',
    provider: 'mailcom',
    sourceMode: 'api_key',
    status: 'no_code',
    hasCode: false,
    extractedCode: undefined,
    durationMs: 13000,
    messageCount: 1,
    tokenId: token.id,
    token: token.token
  });
}

// Record 1 'error' (异常)
usageLogger.record({
  clientIp: '59.82.83.198',
  region: '未知地区',
  emailAccount: 'tr••••@mail.com',
  provider: 'mailcom',
  sourceMode: 'api_key',
  status: 'error',
  statusDetail: '请求超时',
  hasCode: false,
  extractedCode: undefined,
  durationMs: 33100,
  messageCount: 0,
  tokenId: token.id,
  token: token.token
});

console.log('================ 图1 Token 验证结果 ================');
const res = accessTokenService.getTokenLogs(token.id);
console.log('Token 额度:', res.token.usedQuota, '/', res.token.totalQuota, '剩余:', res.token.remainingQuota);
console.log('总流水:', res.stats.totalCalls, '成功次数:', res.stats.successCalls, '异常次数:', res.stats.errorCalls);
console.log('成功率:', res.stats.successRate + '%', '免扣保护次数:', res.stats.freeProtectionCount);

const successRes = accessTokenService.getTokenLogs(token.id, { status: 'success' });
console.log('【正常成功】Tab 条数:', successRes.total, '包含:', successRes.items.map(i => i.status));

const errorRes = accessTokenService.getTokenLogs(token.id, { status: 'error' });
console.log('【异常免扣】Tab 条数:', errorRes.total, '包含:', errorRes.items.map(i => i.status));
