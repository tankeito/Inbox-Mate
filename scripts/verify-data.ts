import { accessTokenService } from '../src/server/services/access-token-service.js';

console.log('================ 1. TAB: 全部流水 (all) ================');
const allRes = accessTokenService.getTokenLogs('tok-59c8f8aac15184216d0215993fcda472', { page: 1, pageSize: 10, status: 'all' });
console.log('Token Name:', allRes.token.name);
console.log('Token 扣费额度:', allRes.token.usedQuota, '/', allRes.token.totalQuota, '(剩余:', allRes.token.remainingQuota, ')');
console.log('第 1 页列表条数:', allRes.items.length);
console.log('当前 Tab 总记录数:', allRes.total, '总页数:', allRes.totalPages);
console.log('统计指标:', allRes.stats);

console.log('\n================ 2. TAB: 正常成功 (success) ================');
const successRes = accessTokenService.getTokenLogs('tok-59c8f8aac15184216d0215993fcda472', { page: 1, pageSize: 10, status: 'success' });
console.log('第 1 页列表条数:', successRes.items.length);
console.log('正常成功总记录数:', successRes.total, '总页数:', successRes.totalPages);
console.log('样例 (最新 2 条):', successRes.items.slice(0, 2).map(i => ({ time: i.createdAt, status: i.status, code: i.extractedCode })));

console.log('\n================ 3. TAB: 异常免扣 (error) ================');
const errorRes = accessTokenService.getTokenLogs('tok-59c8f8aac15184216d0215993fcda472', { page: 1, pageSize: 10, status: 'error' });
console.log('第 1 页列表条数:', errorRes.items.length);
console.log('异常免扣总记录数:', errorRes.total, '总页数:', errorRes.totalPages);
console.log('样例 (最新 2 条):', errorRes.items.slice(0, 2).map(i => ({ time: i.createdAt, status: i.status, detail: i.statusDetail })));
