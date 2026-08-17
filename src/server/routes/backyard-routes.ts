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
import { ipBlockService } from '../services/ip-block-service.js';
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
      const startDate = (req.query.startDate as string) || undefined;
      const endDate = (req.query.endDate as string) || undefined;

      const data = diagLogger.query({
        page,
        pageSize,
        level,
        engine,
        search,
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

      const data = apiKeyService.queryKeys({
        page,
        pageSize,
        search,
        status,
        provider
      });

      res.json(data);
    } catch (err: any) {
      res.status(500).json({ error: err.message || '获取 API Key 列表失败' });
    }
  });

  router.post('/keys', requireAdmin, (req: Request, res: Response) => {
    try {
      const { email, password, refreshToken, provider, name, expiresInHours, customHost, customPort, customProtocol } = req.body || {};
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
      const { rawText, defaultProvider, expiresInHours, batchName } = req.body || {};
      if (!rawText || typeof rawText !== 'string') {
        res.status(400).json({ error: '请粘贴包含账号密码的文本内容' });
        return;
      }

      const result = apiKeyService.batchImport(rawText, {
        defaultProvider,
        expiresInHours,
        batchName
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || '批量导入失败' });
    }
  });

  router.post('/keys/batch-export', requireAdmin, (req: Request, res: Response) => {
    try {
      const { keyIds, format = 'custom' } = req.body || {};
      const host = req.get('host') || 'localhost:3000';
      const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
      const domain = `${protocol}://${host}`;

      const allKeys = apiKeyService.queryKeys({ page: 1, pageSize: 5000 }).items;
      const targetKeys = Array.isArray(keyIds) && keyIds.length > 0
        ? allKeys.filter((k) => keyIds.includes(k.id))
        : allKeys;

      const formatted = apiKeyService.exportKeysFormatted(targetKeys, domain, format);
      res.json({ formatted, count: targetKeys.length });
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

  router.post('/keys/:apiKey/test', requireAdmin, async (req: Request, res: Response) => {
    try {
      const apiKey = firstParam(req.params.apiKey);
      const clientIp = getClientIp(req);
      const region = resolveIpRegion(clientIp);

      const result = await apiKeyService.executeApiKeyFetch(apiKey, {
        lookbackMinutes: 120,
        maxMessages: 5,
        clientIp,
        region
      });

      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'API Key 测试执行失败' });
    }
  });

  // Security: IP Block & Rate Limiting Management
  router.get('/security/blocked-ips', requireAdmin, (_req: Request, res: Response) => {
    try {
      const list = ipBlockService.listBlockedIps();
      res.json({ items: list, total: list.length });
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
        durationHours: durationHours ? Number(durationHours) : null
      });
      res.json({ ok: true, item, message: `已成功限制 IP: ${ip} 的访问` });
    } catch (err: any) {
      res.status(400).json({ error: err.message || '封禁 IP 失败' });
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

  return router;
}
