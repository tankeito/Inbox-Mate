import { randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import express, { type NextFunction, type Request, type Response } from 'express';
import helmet from 'helmet';
import { fetchAccountVerificationCode } from './imap-client.js';
import { InboxMateError, isInboxMateError, safeError } from './errors.js';
import { JobManager } from './jobs.js';
import { MicrosoftOAuthService } from './microsoft-oauth.js';
import { oauthStartSchema, parseCreateJobInput } from './validation.js';
import { createBackyardRouter } from './routes/backyard-routes.js';
import { apiKeyService } from './services/api-key-service.js';
import { accessTokenService } from './services/access-token-service.js';
import { getClientIp, resolveIpRegion } from './services/usage-logger.js';

const HOST = '127.0.0.1';
const PORT = Number.parseInt(process.env.PORT ?? '3000', 10);
const SESSION_COOKIE = 'inbox_mate_session';
const CSRF_COOKIE = 'inbox_mate_csrf';
const sessionValue = randomBytes(32).toString('base64url');
const csrfValue = randomBytes(32).toString('base64url');

function parseCookies(header: string | undefined): Record<string, string> {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').flatMap((entry) => {
      const index = entry.indexOf('=');
      if (index < 1) return [];
      return [[entry.slice(0, index).trim(), decodeURIComponent(entry.slice(index + 1).trim())]];
    })
  );
}

function isLoopbackRequest(req: Request): boolean {
  const remote = req.socket.remoteAddress ?? '';
  const isLoopbackIp = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote);
  if (!isLoopbackIp && process.env.NODE_ENV !== 'production') return false;
  const origin = req.get('origin');
  if (!origin) return true;
  try {
    const url = new URL(origin);
    const host = req.get('host')?.split(':')[0];
    return (
      url.hostname === '127.0.0.1' ||
      url.hostname === 'localhost' ||
      url.hostname === '[::1]' ||
      (!!host && url.hostname === host)
    );
  } catch {
    return false;
  }
}

function requireLoopback(req: Request, res: Response, next: NextFunction): void {
  if (!isLoopbackRequest(req)) {
    res.status(403).json({ error: safeError('AUTH_DENIED') });
    return;
  }
  next();
}

function requireSession({ csrf = false }: { csrf?: boolean } = {}) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const cookies = parseCookies(req.headers.cookie);
    const validSession = cookies[SESSION_COOKIE] === sessionValue;
    const validCsrf = !csrf || (cookies[CSRF_COOKIE] === csrfValue && req.get('x-inbox-mate-csrf') === csrfValue);
    if (!validSession || !validCsrf) {
      res.status(403).json({ error: safeError('AUTH_DENIED') });
      return;
    }
    next();
  };
}

function writeSse(res: Response, event: { id: number; type: string; data: unknown }): void {
  res.write(`id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`);
}

function firstParam(value: string | string[] | undefined): string {
  if (!value) return '';
  return Array.isArray(value) ? value[0] ?? '' : value;
}

import { ipBlockService } from './services/ip-block-service.js';

function checkIpBlocked(req: Request, res: Response, next: NextFunction): void {
  const clientIp = getClientIp(req);
  const blockStatus = ipBlockService.isIpBlocked(clientIp);
  if (blockStatus.blocked) {
    res.status(403).json({
      ok: false,
      code: 'IP_BLOCKED',
      error: `您的 IP (${clientIp}) 已被管理员限制访问，如需解封请联系客服或管理员。`,
      reason: blockStatus.reason,
      ip: clientIp
    });
    return;
  }
  next();
}

const RESERVED_ROOT_PATHS = new Set([
  'backyard',
  'api',
  'assets',
  'favicon.ico',
  'vite.svg',
  'index.html',
  'doc',
  'health',
  'session',
  'robots.txt',
  'sitemap.xml'
]);

export function createServer(port = PORT) {
  const app = express();
  const oauth = new MicrosoftOAuthService(port);
  const jobs = new JobManager((account, options) =>
    fetchAccountVerificationCode(account, {
      ...options,
      onProgress: (state) => options.onProgress(state),
      resolveMicrosoftAccessToken: (sessionId, email) => oauth.consume(sessionId, email)
    })
  );

  app.disable('x-powered-by');
  app.use(
    helmet({
      crossOriginEmbedderPolicy: false,
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          baseUri: ["'self'"],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          imgSrc: ["'self'", 'data:'],
          objectSrc: ["'none'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"]
        }
      },
      referrerPolicy: { policy: 'no-referrer' }
    })
  );
  app.use(express.json({ limit: '512kb' }));

  // Backyard Admin API Routes
  app.use('/api/backyard', createBackyardRouter());

  // Public API endpoint handler
  async function handlePublicApiKeyFetch(req: Request, res: Response): Promise<void> {
    const apiKey = firstParam(req.params.apiKey);
    if (!apiKey || RESERVED_ROOT_PATHS.has(apiKey.toLowerCase()) || !/^[a-zA-Z0-9_-]{16,64}$/.test(apiKey)) {
      res.status(404).json({ code: 404, success: false, error: '未找到 API 路由' });
      return;
    }

    const clientIp = getClientIp(req);
    const region = resolveIpRegion(clientIp);
    const lookbackParam = req.query.lookback as string | undefined;
    const lookback = lookbackParam !== undefined ? (Number.parseInt(lookbackParam, 10) || 0) : 0;
    const max = Number.parseInt(req.query.max as string) || 10;
    const format = (req.query.format as string) || 'json';

    // IP Block Check
    const blockStatus = ipBlockService.isIpBlocked(clientIp);
    if (blockStatus.blocked) {
      if (format === 'code' || format === 'text') {
        res.status(403).setHeader('Content-Type', 'text/plain; charset=utf-8').send(`BLOCKED: IP ${clientIp} is restricted`);
        return;
      }
      res.status(403).json({
        code: 403,
        success: false,
        error: `您的 IP (${clientIp}) 已被管理员限制访问，如需解封请联系管理员。`,
        reason: blockStatus.reason
      });
      return;
    }

    // Token Extraction (URL Query ?token=tok_xxx, Header X-Access-Token, or Bearer token)
    let tokenStr = typeof req.query.token === 'string' ? req.query.token.trim() : '';
    if (!tokenStr && typeof req.headers['x-access-token'] === 'string') {
      tokenStr = req.headers['x-access-token'].trim();
    }
    if (!tokenStr && typeof req.headers['authorization'] === 'string') {
      const auth = req.headers['authorization'].trim();
      if (auth.toLowerCase().startsWith('bearer ')) {
        tokenStr = auth.slice(7).trim();
      }
    }

    let verifiedToken: any = null;
    if (tokenStr) {
      const verifyResult = accessTokenService.verifyTokenAccess(tokenStr);
      if (!verifyResult.valid) {
        if (format === 'code' || format === 'text') {
          res.status(403).setHeader('Content-Type', 'text/plain; charset=utf-8').send(`TOKEN_ERROR: ${verifyResult.reason}`);
          return;
        }
        res.status(403).json({
          code: 403,
          success: false,
          error: 'TOKEN_INVALID_OR_EXHAUSTED',
          message: verifyResult.reason,
          token: tokenStr,
          queriedAt: new Date().toISOString()
        });
        return;
      }
      verifiedToken = verifyResult.token;
    }

    try {
      const result = await apiKeyService.executeApiKeyFetch(apiKey, {
        lookbackMinutes: lookback,
        maxMessages: max,
        clientIp,
        region
      });

      // Post-execution quota deduction (Deduct ONLY when fetch succeeds!)
      if (verifiedToken) {
        accessTokenService.consumeQuota(verifiedToken.id);
        (result as any).tokenInfo = {
          name: verifiedToken.name,
          usedQuota: verifiedToken.usedQuota + 1,
          totalQuota: verifiedToken.totalQuota,
          remainingQuota: Math.max(0, verifiedToken.remainingQuota - 1)
        };
      }

      if (format === 'code' || format === 'text') {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.send(result.verificationCode || 'NONE');
        return;
      }

      res.json(result);
    } catch (err: any) {
      if (format === 'code' || format === 'text') {
        res.status(400).setHeader('Content-Type', 'text/plain; charset=utf-8').send(`ERROR: ${err.message || 'Fetch failed'}`);
        return;
      }
      res.status(400).json({
        code: 400,
        success: false,
        error: err.message || '邮件拉取失败',
        queriedAt: new Date().toISOString()
      });
    }
  }

  // Standard API Routes
  app.get('/api/:apiKey', (req, res, next) => {
    const apiKey = firstParam(req.params.apiKey);
    if (!apiKey || RESERVED_ROOT_PATHS.has(apiKey.toLowerCase()) || !/^[a-zA-Z0-9_-]{16,64}$/.test(apiKey)) {
      next();
      return;
    }
    void handlePublicApiKeyFetch(req, res);
  });

  app.get('/api/public/:apiKey', (req, res) => void handlePublicApiKeyFetch(req, res));

  // Workspace API V1
  app.use('/api/v1', requireLoopback);
  app.use('/api/v1', (_req, res, next) => {
    res.set('Cache-Control', 'no-store, max-age=0');
    next();
  });

  app.get('/api/v1/health', (_req, res) => res.json({ ok: true, mode: 'local-only' }));

  app.get('/api/v1/session', (_req, res) => {
    res.cookie(SESSION_COOKIE, sessionValue, { httpOnly: true, sameSite: 'strict', path: '/', secure: false });
    res.cookie(CSRF_COOKIE, csrfValue, { httpOnly: false, sameSite: 'strict', path: '/', secure: false });
    res.json({ csrfToken: csrfValue });
  });

  app.post('/api/v1/oauth/microsoft/start', requireSession({ csrf: true }), (req, res, next) => {
    try {
      const parsed = oauthStartSchema.safeParse(req.body);
      if (!parsed.success) throw new InboxMateError('BAD_REQUEST');
      res.json(oauth.start(parsed.data.clientAccountId, parsed.data.email));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/oauth/microsoft/status', requireSession(), (req, res, next) => {
    try {
      const clientAccountId = typeof req.query.clientAccountId === 'string' ? req.query.clientAccountId : '';
      if (!clientAccountId || clientAccountId.length > 128) throw new InboxMateError('BAD_REQUEST');
      res.json(oauth.getStatus(clientAccountId));
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/token/info', (req, res) => {
    const tokenStr = (req.query.token as string) || req.get('x-access-token') || '';
    if (!tokenStr) {
      res.status(400).json({ valid: false, error: '请提供 Token 参数' });
      return;
    }
    const check = accessTokenService.verifyTokenAccess(tokenStr);
    if (!check.valid || !check.token) {
      res.json({
        valid: false,
        error: check.reason || 'Token 无效或已用尽',
        token: tokenStr
      });
      return;
    }
    res.json({
      valid: true,
      token: check.token.token,
      name: check.token.name,
      totalQuota: check.token.totalQuota,
      usedQuota: check.token.usedQuota,
      remainingQuota: check.token.remainingQuota,
      isExhausted: check.token.isExhausted,
      expiresAt: check.token.expiresAt
    });
  });

  app.post('/api/v1/jobs', requireSession({ csrf: true }), checkIpBlocked, (req, res, next) => {
    try {
      const input = parseCreateJobInput(req.body);
      const headerToken = req.get('x-access-token') || (req.query.token as string);
      if (!input.token && headerToken) {
        input.token = headerToken;
      }
      const clientIp = getClientIp(req);
      const region = resolveIpRegion(clientIp);
      const job = jobs.create(input, { clientIp, region, token: input.token });
      res.status(202).json({ jobId: job.jobId, state: job.state });
    } catch (error) {
      next(error);
    }
  });

  app.get('/api/v1/jobs/:jobId', requireSession(), (req, res) => {
    const job = jobs.get(firstParam(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: safeError('BAD_REQUEST') });
      return;
    }
    res.json(job);
  });

  app.delete('/api/v1/jobs/:jobId', requireSession({ csrf: true }), (req, res) => {
    const job = jobs.cancel(firstParam(req.params.jobId));
    if (!job) {
      res.status(404).json({ error: safeError('BAD_REQUEST') });
      return;
    }
    res.status(202).json({ jobId: job.jobId, state: job.state });
  });

  app.get('/api/v1/jobs/:jobId/events', requireSession(), (req, res) => {
    const lastIdHeader = req.get('last-event-id');
    const afterId = lastIdHeader && /^\d+$/.test(lastIdHeader) ? Number(lastIdHeader) : undefined;
    res.status(200).set({
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.flushHeaders();
    const unsubscribe = jobs.subscribe(firstParam(req.params.jobId), afterId, (event) => writeSse(res, event));
    if (!unsubscribe) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: safeError('BAD_REQUEST') })}\n\n`);
      res.end();
      return;
    }
    const heartbeat = setInterval(() => res.write(': heartbeat\n\n'), 15_000);
    heartbeat.unref();
    req.on('close', () => {
      clearInterval(heartbeat);
      unsubscribe();
    });
  });

  app.use('/api/v1', (_req, res) => res.status(404).json({ error: safeError('BAD_REQUEST') }));

  // Root Public API Endpoint: GET /:apiKey (with strict regex & reserved keyword check)
  app.get('/:apiKey', (req, res, next) => {
    const apiKey = firstParam(req.params.apiKey);
    if (
      !apiKey ||
      RESERVED_ROOT_PATHS.has(apiKey.toLowerCase()) ||
      !/^[a-zA-Z0-9_-]{16,64}$/.test(apiKey)
    ) {
      next();
      return;
    }
    void handlePublicApiKeyFetch(req, res);
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const appError = isInboxMateError(error) ? error : new InboxMateError('INTERNAL', 500);
    res.status(appError.status).json({ error: safeError(appError.code, appError.customMessage) });
  });

  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const dist = path.join(root, 'dist');
  if (existsSync(dist)) {
    app.use(express.static(dist, { index: false, maxAge: 0, etag: false }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }

  return app;
}

import { closeSharedBrowser } from './engines/web-rpa-engine.js';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createServer(PORT);
  const server = app.listen(PORT, HOST, () => {
    console.log(`Inbox Mate listening at http://${HOST}:${PORT}`);
  });

  const shutdown = async () => {
    server.close();
    await closeSharedBrowser();
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
