import { db } from '../src/server/db/database.js';
import { randomUUID } from 'node:crypto';

export function seedOnlineTestData() {
  console.log('🚀 开始导入线上环境真实对照测试数据...');

  const tokenId = 'tok-59c8f8aac15184216d0215993fcda472';
  const tokenStr = 'tok_59c8f8aac15184216d0215993fcda472';
  const tokenName = '闲鱼-专业codex充值';

  // 1. 插入/更新主 Token（已用 12 / 共 15 次，剩余 3 次）
  db.prepare(`
    INSERT OR REPLACE INTO access_tokens (
      id, token, name, total_quota, used_quota, is_active, expires_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    tokenId,
    tokenStr,
    tokenName,
    15, // total_quota
    12, // used_quota
    1,  // is_active
    null,
    '2026-08-18T17:06:41.000Z',
    '2026-08-18T19:32:56.000Z'
  );

  // 2. 补充其他参考 Token
  const otherTokens = [
    { id: 'tok-4ce25f8e5c', token: 'tok_4ce25f8e5c1234567890abcdef123456', name: '闲鱼-娴情。', total: 10, used: 0, createdAt: '2026-08-18T17:14:30.000Z' },
    { id: 'tok-8a308f188f', token: 'tok_8a308f188f1234567890abcdef123456', name: '闲鱼3', total: 50, used: 21, createdAt: '2026-08-18T16:39:56.000Z' },
    { id: 'tok-6f138bde68', token: 'tok_6f138bde681234567890abcdef123456', name: '闲鱼1', total: 50, used: 11, createdAt: '2026-08-18T16:27:02.000Z' },
    { id: 'tok-0f8b63a90f', token: 'tok_0f8b63a90f1234567890abcdef123456', name: '123', total: 30, used: 27, createdAt: '2026-08-18T09:38:30.000Z' },
    { id: 'tok-40322ff559', token: 'tok_40322ff5591234567890abcdef123456', name: 'yansir', total: 5, used: 2, createdAt: '2026-08-18T08:51:31.000Z' }
  ];

  for (const t of otherTokens) {
    db.prepare(`
      INSERT OR REPLACE INTO access_tokens (
        id, token, name, total_quota, used_quota, is_active, expires_at, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(t.id, t.token, t.name, t.total, t.used, 1, null, t.createdAt, t.createdAt);
  }

  // 3. 清理该 Token 已有的旧日志，准备写入精准的 32 条线上复刻日志
  db.prepare('DELETE FROM usage_logs WHERE token_id = ? OR token = ?').run(tokenId, tokenStr);

  const logsToInsert: Array<{
    ip: string;
    region: string;
    email: string;
    status: string;
    statusDetail?: string;
    hasCode: boolean;
    extractedCode: string | null;
    durationMs: number;
    createdAt: string;
  }> = [
    // 最新的 10 条（图 2 现场前 6 条 + 紧随其后的 4 条）
    { ip: '59.82.83.188', region: '未知地区', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '758047', durationMs: 14200, createdAt: '2026-08-18T19:32:56.000Z' },
    { ip: '59.82.83.28', region: '未知地区', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '758047', durationMs: 16000, createdAt: '2026-08-18T19:32:48.000Z' },
    { ip: '59.82.83.178', region: '未知地区', email: 'sh••••@mail.com', status: 'success', hasCode: true, extractedCode: '667597', durationMs: 10300, createdAt: '2026-08-18T19:09:29.000Z' },
    { ip: '59.82.83.125', region: '未知地区', email: 'sh••••@mail.com', status: 'success', hasCode: true, extractedCode: '667597', durationMs: 10600, createdAt: '2026-08-18T19:09:22.000Z' },
    { ip: '59.82.83.10', region: '未知地区', email: 'ja••••@mail.com', status: 'error', statusDetail: 'Mail.com 登录成功后未在 30 秒内加载收件箱', hasCode: false, extractedCode: null, durationMs: 33200, createdAt: '2026-08-18T18:14:46.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '758047', durationMs: 9800, createdAt: '2026-08-18T18:01:08.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '758047', durationMs: 12300, createdAt: '2026-08-18T18:01:03.000Z' },
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '413028', durationMs: 10300, createdAt: '2026-08-18T17:54:54.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '目标返回 403 Blocked', hasCode: false, extractedCode: null, durationMs: 6000, createdAt: '2026-08-18T17:53:46.000Z' },
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '目标返回 403 Blocked', hasCode: false, extractedCode: null, durationMs: 4600, createdAt: '2026-08-18T17:52:34.000Z' },

    // 第 11 ~ 20 条（第 2 页）
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '413028', durationMs: 11200, createdAt: '2026-08-18T17:50:12.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '758047', durationMs: 10800, createdAt: '2026-08-18T17:48:45.000Z' },
    { ip: '198.58.104.233', region: '美国 得克萨斯州 Richardson', email: 'sh••••@mail.com', status: 'error', statusDetail: 'Mail.com 登录未在 30 秒内加载收件箱', hasCode: false, extractedCode: null, durationMs: 33100, createdAt: '2026-08-18T17:45:20.000Z' },
    { ip: '198.58.104.233', region: '美国 得克萨斯州 Richardson', email: 'sh••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4200, createdAt: '2026-08-18T17:44:10.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '582910', durationMs: 13500, createdAt: '2026-08-18T17:40:00.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '582910', durationMs: 11900, createdAt: '2026-08-18T17:38:22.000Z' },
    { ip: '59.82.83.10', region: '未知地区', email: 'ja••••@mail.com', status: 'error', statusDetail: '连接超时', hasCode: false, extractedCode: null, durationMs: 25000, createdAt: '2026-08-18T17:35:10.000Z' },
    { ip: '59.82.83.10', region: '未知地区', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 3800, createdAt: '2026-08-18T17:34:00.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '网络抖动', hasCode: false, extractedCode: null, durationMs: 5000, createdAt: '2026-08-18T17:30:15.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4100, createdAt: '2026-08-18T17:28:40.000Z' },

    // 第 21 ~ 30 条（第 3 页）
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'success', hasCode: true, extractedCode: '918234', durationMs: 12100, createdAt: '2026-08-18T17:25:00.000Z' },
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4500, createdAt: '2026-08-18T17:24:10.000Z' },
    { ip: '59.82.83.10', region: '未知地区', email: 'sh••••@mail.com', status: 'error', statusDetail: '超时未加载收件箱', hasCode: false, extractedCode: null, durationMs: 30000, createdAt: '2026-08-18T17:22:00.000Z' },
    { ip: '59.82.83.10', region: '未知地区', email: 'sh••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 3900, createdAt: '2026-08-18T17:20:50.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4200, createdAt: '2026-08-18T17:18:30.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '网络异常', hasCode: false, extractedCode: null, durationMs: 6500, createdAt: '2026-08-18T17:16:10.000Z' },
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4000, createdAt: '2026-08-18T17:14:00.000Z' },
    { ip: '212.107.30.67', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4100, createdAt: '2026-08-18T17:12:00.000Z' },
    { ip: '198.58.104.233', region: '美国 得克萨斯州 Richardson', email: 'sh••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 3800, createdAt: '2026-08-18T17:10:00.000Z' },
    { ip: '198.58.104.233', region: '美国 得克萨斯州 Richardson', email: 'sh••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 3700, createdAt: '2026-08-18T17:08:50.000Z' },

    // 第 31 ~ 32 条（第 4 页，共 2 条，使得总页数达到 4 页，总记录数恰好 32 条）
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '403 Blocked', hasCode: false, extractedCode: null, durationMs: 4200, createdAt: '2026-08-18T17:07:30.000Z' },
    { ip: '216.23.82.105', region: '日本 东京都 东京', email: 'ja••••@mail.com', status: 'error', statusDetail: '初始探测 403', hasCode: false, extractedCode: null, durationMs: 4000, createdAt: '2026-08-18T17:06:50.000Z' }
  ];

  const insertLogStmt = db.prepare(`
    INSERT INTO usage_logs (
      id, client_ip, region, email_account, email_domain, provider,
      source_mode, status, status_detail, has_code, extracted_code,
      duration_ms, message_count, token_id, token, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const item of logsToInsert) {
    insertLogStmt.run(
      randomUUID(),
      item.ip,
      item.region,
      item.email,
      'mail.com',
      'mailcom',
      'api_key',
      item.status,
      item.statusDetail || '',
      item.hasCode ? 1 : 0,
      item.extractedCode,
      item.durationMs,
      item.hasCode ? 1 : 0,
      tokenId,
      tokenStr,
      item.createdAt
    );
  }

  const successCount = logsToInsert.filter((l) => l.status === 'success').length;
  const errorCount = logsToInsert.filter((l) => l.status !== 'success').length;
  console.log(`✅ 成功导入: Token [${tokenName}], 额度 [${successCount}/15], 总审计日志 [${logsToInsert.length}条: 成功${successCount}次, 异常${errorCount}次]`);
}

// 如果直接运行该文件则执行
seedOnlineTestData();
