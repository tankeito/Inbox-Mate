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

function firstParam(value: string | string[]): string {
  return Array.isArray(value) ? value[0] ?? '' : value;
}

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
  app.use(express.json({ limit: '64kb' }));
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

  app.get('/api/v1/oauth/microsoft/callback', (req, res) => void oauth.handleCallback(req, res));

  app.post('/api/v1/jobs', requireSession({ csrf: true }), (req, res, next) => {
    try {
      const input = parseCreateJobInput(req.body);
      const job = jobs.create(input);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createServer(PORT);
  app.listen(PORT, HOST, () => {
    console.log(`Inbox Mate listening at http://${HOST}:${PORT}`);
  });
}
