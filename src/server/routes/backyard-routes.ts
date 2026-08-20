import express, { type Request, type Response, type NextFunction } from 'express';
import {
  adminAuthService,
  requireAdmin,
  setSessionCookie,
  clearSessionCookie
} from '../auth/admin-auth.js';
import { usageLogger, getClientIp, resolveIpRegion } from '../services/usage-logger.js';
import { diagLogger } from '../services/diag-logger.js';
import { apiKeyService } from '../services/api-key-service.js';
import { accessTokenService } from '../services/access-token-service.js';
import { ipBlockService } from '../services/ip-block-service.js';
import { systemSettingsService } from '../services/system-settings-service.js';
import { proxyService } from '../services/proxy-service.js';
import { getRpaStatus, restartSharedBrowser, testRpaHealthCheck } from '../engines/web-rpa-engine.js';

function firstParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

export function createBackyardRouter(): express.Router {
  const router = express.Router();

  // Admin Auth Routes
  router.post('/auth/login', (req: Request, res: Response) => {
    try {
      const { email, password } = req.body || {};
      if (!email || !password) {
        res.status(400).json({ error: '请输入管理员账号与密码' });
        return;
      }

      const result = adminAuthService.login(email, password);
      if (result.token) {
        setSessionCookie(res, result.token);
      }
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message || '登录失败' });
    }
  });

  router.post('/auth/verify-2fa', (req: Request, res: Response) => {
    try {
      const { tempToken, code } = req.body || {};
      if (!tempToken || !code) {
        res.status(400).json({ error: '缺少两步验证凭据或 6 位动态验证码' });
        return;
      }

      const result = adminAuthService.verify2FALogin(tempToken, code);
      setSessionCookie(res, result.token);
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message || '2FA 验证失败' });
    }
  });

  router.get('/auth/me', requireAdmin, (req: Request, res: Response) => {
    const user = adminAuthService.getAdminUser();
    if (!user) {
      res.status(404).json({ error: '管理员用户不存在' });
      return;
    }
    res.json({ user });
  });

  router.post('/auth/logout', (_req: Request, res: Response) => {
    clearSessionCookie(res);
    res.json({ ok: true });
  });

  router.post('/auth/2fa/setup', requireAdmin, (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const data = adminAuthService.setup2FA(adminUser.userId);
      res.json(data);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '初始化 2FA 失败' });
    }
  });

  router.post('/auth/2fa/enable', requireAdmin, (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { code } = req.body || {};
      if (!code) {
        res.status(400).json({ error: '请输入 6 位动态验证码' });
        return;
      }
      adminAuthService.enable2FA(adminUser.userId, code);
      res.json({ ok: true, message: '2FA 双因素安全认证已成功开启' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '开启 2FA 失败' });
    }
  });

  router.post('/auth/2fa/disable', requireAdmin, (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { code } = req.body || {};
      if (!code) {
        res.status(400).json({ error: '请输入当前 6 位动态验证码以确认关闭' });
        return;
      }
      adminAuthService.disable2FA(adminUser.userId, code);
      res.json({ ok: true, message: '2FA 双因素安全认证已关闭' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '关闭 2FA 失败' });
    }
  });

  router.post('/auth/change-password', requireAdmin, (req: Request, res: Response) => {
    try {
      const adminUser = (req as any).adminUser;
      const { oldPassword, newPassword } = req.body || {};
      if (!oldPassword || !newPassword) {
        res.status(400).json({ error: '请填写原密码与新密码' });
        return;
      }
      adminAuthService.changePassword(adminUser.userId, oldPassword, newPassword);
      res.json({ ok: true, message: '管理员密码修改成功' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '修改密码失败' });
    }
  });

  // Overview Dashboard Stats
  router.get('/stats/overview', requireAdmin, (_req: Request, res: Response) => {
    try {
      const stats = usageLogger.getDashboardStats();
      const keysStat = apiKeyService.queryKeys({ page: 1, pageSize: 1 });
      res.json({
        ...stats,
        totalApiKeys: keysStat.total
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取统计信息失败' });
    }
  });

  // Usage Logs
  router.get('/logs', requireAdmin, (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 20;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || 'all';
      const provider = (req.query.provider as string) || 'all';
      const sourceMode = (req.query.sourceMode as string) || 'all';
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const data = usageLogger.query({
        page,
        pageSize,
        search,
        status,
        provider,
        sourceMode,
        startDate,
        endDate
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取使用记录失败' });
    }
  });

  router.get('/logs/export', requireAdmin, (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string) || '';
      const status = (req.query.status as string) || 'all';
      const provider = (req.query.provider as string) || 'all';
      const sourceMode = (req.query.sourceMode as string) || 'all';

      const csv = usageLogger.exportCsv({ search, status, provider, sourceMode });
      const filename = `inbox_mate_logs_${new Date().toISOString().slice(0, 10)}.csv`;

      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.send('\uFEFF' + csv);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '导出记录失败' });
    }
  });

  // Diagnostics Logs
  router.get('/diagnostics', requireAdmin, (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 30;
      const level = (req.query.level as string) || 'all';
      const engine = (req.query.engine as string) || 'all';
      const search = (req.query.search as string) || '';
      const traceId = (req.query.traceId as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const data = diagLogger.query({
        page,
        pageSize,
        level,
        engine,
        search,
        traceId,
        startDate,
        endDate
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取诊断日志失败' });
    }
  });

  router.post('/diagnostics/clear', requireAdmin, (_req: Request, res: Response) => {
    try {
      diagLogger.clear();
      res.json({ ok: true, message: '诊断日志已清空' });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '清空日志失败' });
    }
  });

  // API Key Management
  router.get('/keys', requireAdmin, (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 20;
      const search = (req.query.search as string) || '';
      const status = (req.query.status as any) || 'all';
      const provider = (req.query.provider as string) || 'all';
      const tokenId = (req.query.tokenId as string) || undefined;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const data = apiKeyService.queryKeys({
        page,
        pageSize,
        search,
        status,
        provider,
        tokenId,
        startDate,
        endDate
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取 API Key 列表失败' });
    }
  });

  router.post('/keys', requireAdmin, (req: Request, res: Response) => {
    try {
      const { email, password, refreshToken, provider, name, expiresInHours, customHost, customPort, customProtocol, tokenId } = req.body || {};
      if (!email) {
        res.status(400).json({ error: '请填写邮箱账号' });
        return;
      }
      if (!password && !refreshToken) {
        res.status(400).json({ error: '请提供邮箱密码或 Refresh Token' });
        return;
      }

      const item = apiKeyService.createKey({
        email,
        password,
        refreshToken,
        provider,
        name,
        expiresInHours,
        tokenId: typeof tokenId === 'string' ? tokenId : undefined,
        customHost,
        customPort,
        customProtocol
      });

      res.json(item);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '创建 API Key 失败' });
    }
  });

  router.post('/keys/batch-import', requireAdmin, (req: Request, res: Response) => {
    try {
      const { rawText, defaultProvider, expiresInHours, batchName, tokenId } = req.body || {};
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: '请粘贴包含账号密码的文本内容' });
        return;
      }

      const result = apiKeyService.batchImport(rawText, {
        defaultProvider,
        expiresInHours,
        batchName,
        tokenId: typeof tokenId === 'string' ? tokenId : undefined
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量导入失败' });
    }
  });

  router.post('/keys/batch-export', requireAdmin, (req: Request, res: Response) => {
    try {
      const { keyIds, format = 'custom', token, tokenId } = req.body || {};
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const domain = `${protocol}://${host}`;

      let activeTokenStr = typeof token === 'string' && token.trim() ? token.trim() : undefined;
      let activeTokenId = typeof tokenId === 'string' && tokenId.trim() ? tokenId.trim() : undefined;

      if (activeTokenId && !activeTokenStr) {
        const t = accessTokenService.getTokenById(activeTokenId);
        if (t) activeTokenStr = t.token;
      }
      if (activeTokenStr && !activeTokenId) {
        const t = accessTokenService.getTokenByString(activeTokenStr);
        if (t) activeTokenId = t.id;
      }

      const queryParams: any = { page: 1, pageSize: 10000 };
      if (activeTokenId) {
        queryParams.tokenId = activeTokenId;
      } else if (activeTokenStr) {
        queryParams.token = activeTokenStr;
      }

      const allKeys = apiKeyService.queryKeys(queryParams).items;
      const targetKeys = Array.isArray(keyIds) && keyIds.length > 0
        ? allKeys.filter((k) => keyIds.includes(k.id))
        : allKeys;

      const formatted = apiKeyService.exportKeysFormatted(targetKeys, domain, format, activeTokenStr);
      res.json({ formatted, count: targetKeys.length, token: activeTokenStr, tokenId: activeTokenId });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '导出失败' });
    }
  });

  router.post('/keys/:id/toggle', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const { active } = req.body || {};
      apiKeyService.toggleKeyActive(id, Boolean(active));
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '操作失败' });
    }
  });

  router.post('/keys/:id/expiry', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const { expiresAt } = req.body || {};
      apiKeyService.updateKeyExpiry(id, expiresAt || null);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '更新过期时间失败' });
    }
  });

  router.delete('/keys/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      apiKeyService.deleteKey(id);
      res.json({ ok: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '删除失败' });
    }
  });

  router.post('/keys/batch-toggle', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ids, active } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要批量操作的 API Key ID 列表' });
      }
      const result = apiKeyService.batchToggleKeyActive(ids, Boolean(active));
      res.json({ ok: true, count: result.count, message: `已成功批量${active ? '启用' : '禁用'} ${result.count} 个 API Key` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量切换状态失败' });
    }
  });

  router.post('/keys/batch-delete', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要批量删除的 API Key ID 列表' });
      }
      const result = apiKeyService.batchDeleteKeys(ids);
      res.json({ ok: true, count: result.count, message: `已成功批量删除 ${result.count} 个 API Key` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量删除 API Key 失败' });
    }
  });

  router.post('/keys/:apiKey/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      const apiKey = firstParam(req.params.apiKey);
      const clientIp = getClientIp(req);
      const region = resolveIpRegion(clientIp);

      const result = await apiKeyService.executeApiKeyFetch(apiKey, {
        lookbackMinutes: 0,
        maxMessages: 10,
        clientIp,
        region
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'API Key 测试执行失败' });
    }
  });

  // Security: IP Block & Rate Limiting Management
  router.get('/security/ip-analytics', requireAdmin, (req: Request, res: Response) => {
    try {
      const range = (req.query.range as string) || 'today';
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const data = ipBlockService.getIpAnalytics({ range, startDate, endDate });
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取 IP 访问统计失败' });
    }
  });

  router.get('/security/blocked-ips', requireAdmin, (req: Request, res: Response) => {
    try {
      const search = (req.query.search as string) || '';
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 50;

      const result = ipBlockService.listBlockedIps({ search, page, pageSize });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取封禁 IP 列表失败' });
    }
  });

  router.post('/security/blocked-ips', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ip, reason, durationHours } = req.body || {};
      if (!ip) {
        res.status(400).json({ error: '请提供要封禁的 IP 地址' });
        return;
      }
      const adminUser = (req as any).adminUser;
      const item = ipBlockService.blockIp({
        ip,
        reason,
        blockedBy: adminUser?.email || 'admin',
        durationHours: durationHours !== undefined ? Number(durationHours) : null
      });
      res.json({ ok: true, item, message: `已成功限制 IP: ${ip} 的访问` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '封禁 IP 失败' });
    }
  });

  router.post('/security/blocked-ips/:id/unban', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const success = ipBlockService.unblockIp(id);
      res.json({ ok: success, message: success ? '已成功解除 IP 限制' : '未找到该封禁记录' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '解封 IP 失败' });
    }
  });

  router.delete('/security/blocked-ips/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const success = ipBlockService.unblockIp(id);
      res.json({ ok: success, message: success ? '已成功解除 IP 限制' : '未找到该封禁记录' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '解封 IP 失败' });
    }
  });

  // Chrome RPA Status & Lifecycle Management
  router.get('/rpa/status', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const status = await getRpaStatus();
      res.json(status);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取 Chrome RPA 状态失败' });
    }
  });

  router.post('/rpa/restart', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await restartSharedBrowser();
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '重启 Chrome 失败' });
    }
  });

  router.post('/rpa/health-check', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const result = await testRpaHealthCheck();
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '自检探测失败' });
    }
  });

  // Access Token Management Routes
  router.get('/tokens', requireAdmin, (req: Request, res: Response) => {
    try {
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 20;
      const search = (req.query.search as string) || '';
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const result = accessTokenService.listTokens({ page, pageSize, search, startDate, endDate });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取 Token 列表失败' });
    }
  });

  router.post('/tokens', requireAdmin, (req: Request, res: Response) => {
    try {
      const { name, totalQuota, durationDays, scopeMode, enginePreference } = req.body || {};
      const token = accessTokenService.createToken({
        name,
        totalQuota: totalQuota ? Number(totalQuota) : 10,
        durationDays: durationDays ? Number(durationDays) : null,
        scopeMode: scopeMode || 'code_only',
        enginePreference: enginePreference || 'auto'
      });
      res.json({ ok: true, token, message: '成功发行新访问 Token' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '创建 Token 失败' });
    }
  });

  router.put('/tokens/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const { name, totalQuota, durationDays, scopeMode, enginePreference, isActive } = req.body || {};
      const token = accessTokenService.updateToken(id, {
        name,
        totalQuota: totalQuota !== undefined ? Number(totalQuota) : undefined,
        durationDays: durationDays !== undefined ? (durationDays ? Number(durationDays) : null) : undefined,
        scopeMode,
        enginePreference,
        isActive
      });
      res.json({ ok: true, token, message: 'Token 权限与配置已更新成功' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '更新 Token 失败' });
    }
  });

  router.post('/tokens/:id/topup', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const count = Number(req.body?.count) || 10;
      const token = accessTokenService.topUpQuota(id, count);
      res.json({ ok: true, token, message: `已成功为 Token 充值 +${count} 次额度` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '充值 Token 失败' });
    }
  });

  router.post('/tokens/:id/toggle', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const isActive = Boolean(req.body?.isActive);
      const token = accessTokenService.setTokenActive(id, isActive);
      res.json({ ok: true, token, message: isActive ? 'Token 已恢复启用' : 'Token 已冻结禁用' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '切换状态失败' });
    }
  });

  router.get('/tokens/:id/logs', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const page = Number.parseInt(req.query.page as string) || 1;
      const pageSize = Number.parseInt(req.query.pageSize as string) || 10;
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;
      const statusParam = (req.query.status as string) || 'all';
      const status = (statusParam === 'success' || statusParam === 'error') ? statusParam : 'all';

      const result = accessTokenService.getTokenLogs(id, { page, pageSize, startDate, endDate, status });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '获取 Token 消耗日志失败' });
    }
  });

  router.post('/tokens/:id/reconcile', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const result = accessTokenService.reconcileTokenQuota(id);
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '智能校准 Token 额度失败' });
    }
  });

  router.delete('/tokens/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const success = accessTokenService.deleteToken(id);
      res.json({ ok: success, message: success ? 'Token 已成功删除' : '未找到该 Token' });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '删除 Token 失败' });
    }
  });

  router.post('/tokens/batch-toggle', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ids, isActive } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要批量操作的 Token ID 列表' });
      }
      const result = accessTokenService.batchSetTokensActive(ids, Boolean(isActive));
      res.json({ ok: true, count: result.count, message: `已成功批量${isActive ? '启用' : '冻结'} ${result.count} 个 Token` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量切换 Token 状态失败' });
    }
  });

  router.post('/tokens/batch-delete', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要批量删除的 Token ID 列表' });
      }
      const result = accessTokenService.batchDeleteTokens(ids);
      res.json({ ok: true, count: result.count, message: `已成功批量删除 ${result.count} 个 Token` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量删除 Token 失败' });
    }
  });

  router.post('/tokens/batch-reconcile', requireAdmin, (req: Request, res: Response) => {
    try {
      const { ids } = req.body || {};
      if (!Array.isArray(ids) || ids.length === 0) {
        return res.status(400).json({ error: '请提供要批量智能识别的 Token ID 列表' });
      }
      const result = accessTokenService.batchReconcileTokens(ids);
      res.json({
        ok: true,
        count: result.count,
        results: result.results,
        message: `批量智能识别核销完成！共成功校准 ${result.count} 个 Token 的已用额度`
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量智能识别校准失败' });
    }
  });

  // System Concurrency & Hardware Tuning Settings
  router.get('/settings/system', requireAdmin, (_req: Request, res: Response) => {
    try {
      const data = systemSettingsService.getFullPayload();
      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取系统配置与硬件指标失败' });
    }
  });

  router.post('/settings/system', requireAdmin, (req: Request, res: Response) => {
    try {
      const updated = systemSettingsService.updateSettings(req.body || {});
      const full = systemSettingsService.getFullPayload();
      res.json({
        ok: true,
        message: '系统并发与调度设置已成功保存并立即热生效！',
        settings: updated,
        payload: full
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '保存系统配置失败' });
    }
  });

  router.post('/settings/system/reset', requireAdmin, (_req: Request, res: Response) => {
    try {
      const reset = systemSettingsService.resetToDefaults();
      const full = systemSettingsService.getFullPayload();
      res.json({
        ok: true,
        message: '已恢复系统默认并发与调度配置！',
        settings: reset,
        payload: full
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '重置系统配置失败' });
    }
  });

  // ================= Proxy Network & Traffic Pool Routes =================
  router.get('/proxy/config', requireAdmin, (_req: Request, res: Response) => {
    try {
      const config = proxyService.getConfig();
      const nodes = proxyService.listNodes();
      const summary = proxyService.getTrafficSummary();
      res.json({ config, nodes, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取代理配置失败' });
    }
  });

  router.post('/proxy/config', requireAdmin, (req: Request, res: Response) => {
    try {
      const updated = proxyService.updateConfig(req.body || {});
      const summary = proxyService.getTrafficSummary();
      res.json({
        ok: true,
        message: '代理全局网络与调度配置已成功保存！',
        config: updated,
        summary
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '保存代理配置失败' });
    }
  });

  router.get('/proxy/nodes', requireAdmin, (_req: Request, res: Response) => {
    try {
      const nodes = proxyService.listNodes();
      res.json({ nodes, total: nodes.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取代理节点列表失败' });
    }
  });

  router.post('/proxy/nodes', requireAdmin, (req: Request, res: Response) => {
    try {
      const { batchText, defaultProtocol, ...singleInput } = req.body || {};
      if (batchText && typeof batchText === 'string' && batchText.trim()) {
        const result = proxyService.batchImport(batchText, defaultProtocol);
        const nodes = proxyService.listNodes();
        const summary = proxyService.getTrafficSummary();
        res.json({
          ok: true,
          message: `批量导入完成：成功导入 ${result.imported} 个节点${result.errors.length > 0 ? `，${result.errors.length} 行解析异常` : ''}`,
          ...result,
          nodes,
          summary
        });
        return;
      }

      if (!singleInput.server) {
        res.status(400).json({ error: '请提供有效的代理服务器地址' });
        return;
      }

      const node = proxyService.addNode(singleInput);
      const summary = proxyService.getTrafficSummary();
      res.json({
        ok: true,
        message: '代理节点添加成功',
        node,
        summary
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '添加代理节点失败' });
    }
  });

  router.put('/proxy/nodes/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const updated = proxyService.updateNode(id, req.body || {});
      const summary = proxyService.getTrafficSummary();
      res.json({
        ok: true,
        message: '代理节点配置已更新',
        node: updated,
        summary
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '更新代理节点失败' });
    }
  });

  router.delete('/proxy/nodes/:id', requireAdmin, (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const success = proxyService.deleteNode(id);
      const summary = proxyService.getTrafficSummary();
      res.json({
        ok: success,
        message: success ? '代理节点已成功删除' : '未找到该节点',
        summary
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '删除代理节点失败' });
    }
  });

  router.post('/proxy/nodes/:id/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      const id = firstParam(req.params.id);
      const testRes = await proxyService.testProxyNode(id);
      const node = proxyService.getNode(id);
      res.json({
        ok: testRes.success,
        result: testRes,
        node
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '节点测速失败' });
    }
  });

  router.post('/proxy/test-raw', requireAdmin, async (req: Request, res: Response) => {
    try {
      const { server } = req.body || {};
      if (!server || typeof server !== 'string') {
        res.status(400).json({ error: '请提供待测代理地址' });
        return;
      }
      const parsed = proxyService.parseSingleProxy(server);
      const testRes = await proxyService.probeServer(parsed.server);
      res.json({
        ok: testRes.success,
        parsed,
        result: testRes
      });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '测速失败' });
    }
  });

  router.post('/proxy/test-all', requireAdmin, async (_req: Request, res: Response) => {
    try {
      const results = await proxyService.testAllNodes();
      const nodes = proxyService.listNodes();
      const summary = proxyService.getTrafficSummary();
      res.json({
        ok: true,
        message: `批量测速完成，共测试 ${results.length} 个节点`,
        results,
        nodes,
        summary
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '批量测速异常' });
    }
  });

  router.get('/proxy/traffic', requireAdmin, (req: Request, res: Response) => {
    try {
      const page = Number(req.query.page) || 1;
      const pageSize = Number(req.query.pageSize) || 10;
      const proxyId = (req.query.proxyId as string) || undefined;
      const result = proxyService.getTrafficLogs({ page, pageSize, proxyId });
      const summary = proxyService.getTrafficSummary();
      res.json({ ...result, summary });
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取流量消耗日志失败' });
    }
  });

  return router;
}
