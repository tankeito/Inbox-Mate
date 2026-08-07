import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Request, Response } from 'express';
import { InboxMateError } from './errors.js';
import { normalizeEmail, providerForEmail } from './providers.js';

const OAUTH_TTL_MS = 10 * 60 * 1000;
const OAUTH_SCOPE = 'offline_access https://outlook.office.com/IMAP.AccessAsUser.All';

interface PendingAuthorization {
  clientAccountId: string;
  email: string;
  verifier: string;
  expiresAt: number;
}

interface OAuthSession {
  clientAccountId: string;
  email: string;
  accessToken: string;
  expiresAt: number;
}

export class MicrosoftOAuthService {
  private readonly pending = new Map<string, PendingAuthorization>();
  private readonly sessions = new Map<string, OAuthSession>();
  private readonly outcomes = new Map<string, { state: 'denied' | 'expired'; expiresAt: number }>();

  constructor(
    private readonly port: number,
    private readonly clientId = process.env.MICROSOFT_CLIENT_ID,
    private readonly tenant = process.env.MICROSOFT_TENANT ?? 'consumers'
  ) {}

  private get redirectUri(): string {
    return `http://127.0.0.1:${this.port}/api/v1/oauth/microsoft/callback`;
  }

  start(clientAccountId: string, rawEmail: string): { authorizationUrl: string; expiresAt: string } {
    const email = normalizeEmail(rawEmail);
    if (providerForEmail(email)?.id !== 'microsoft') throw new InboxMateError('UNSUPPORTED_PROVIDER');
    if (!this.clientId) throw new InboxMateError('AUTH_REQUIRED');

    const state = randomBytes(32).toString('base64url');
    const verifier = randomBytes(48).toString('base64url');
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    const expiresAt = Date.now() + OAUTH_TTL_MS;
    this.outcomes.delete(clientAccountId);
    this.pending.set(state, { clientAccountId, email, verifier, expiresAt });

    const url = new URL(`https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0/authorize`);
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', this.redirectUri);
    url.searchParams.set('response_mode', 'query');
    url.searchParams.set('scope', OAUTH_SCOPE);
    url.searchParams.set('state', state);
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
    url.searchParams.set('login_hint', email);
    url.searchParams.set('prompt', 'select_account');

    return { authorizationUrl: url.toString(), expiresAt: new Date(expiresAt).toISOString() };
  }

  getStatus(clientAccountId: string): { state: 'pending' | 'ready' | 'denied' | 'expired'; sessionId?: string; expiresAt?: string } {
    const now = Date.now();
    for (const [state, pending] of this.pending) {
      if (pending.clientAccountId === clientAccountId && pending.expiresAt < now) {
        this.pending.delete(state);
        this.outcomes.set(clientAccountId, { state: 'expired', expiresAt: now + OAUTH_TTL_MS });
      }
    }
    this.prune();
    for (const [sessionId, session] of this.sessions) {
      if (session.clientAccountId === clientAccountId) {
        return { state: 'ready', sessionId, expiresAt: new Date(session.expiresAt).toISOString() };
      }
    }
    const outcome = this.outcomes.get(clientAccountId);
    if (outcome) return { state: outcome.state, expiresAt: new Date(outcome.expiresAt).toISOString() };
    return { state: 'pending' };
  }

  async handleCallback(req: Request, res: Response): Promise<void> {
    const state = typeof req.query.state === 'string' ? req.query.state : undefined;
    const code = typeof req.query.code === 'string' ? req.query.code : undefined;
    const denied = typeof req.query.error === 'string';
    const pending = state ? this.pending.get(state) : undefined;
    if (!state || !pending || pending.expiresAt < Date.now()) {
      if (state && pending) {
        this.pending.delete(state);
        this.outcomes.set(pending.clientAccountId, { state: 'expired', expiresAt: Date.now() + OAUTH_TTL_MS });
      }
      this.renderCallback(res, false, '授权会话已过期，请回到 Inbox Mate 重试。');
      return;
    }
    this.pending.delete(state);
    if (denied || !code || !this.clientId) {
      this.outcomes.set(pending.clientAccountId, { state: 'denied', expiresAt: Date.now() + OAUTH_TTL_MS });
      this.renderCallback(res, false, '授权未完成。你可以关闭此窗口并重新尝试。');
      return;
    }

    try {
      const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(this.tenant)}/oauth2/v2.0/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: this.clientId,
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri,
          code_verifier: pending.verifier,
          scope: OAUTH_SCOPE
        })
      });
      const payload = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
      if (!response.ok || !payload?.access_token) {
        this.outcomes.set(pending.clientAccountId, { state: 'denied', expiresAt: Date.now() + OAUTH_TTL_MS });
        this.renderCallback(res, false, '授权令牌交换失败。请回到 Inbox Mate 重试。');
        return;
      }

      const sessionId = randomUUID();
      const expiresAt = Math.min(Date.now() + OAUTH_TTL_MS, Date.now() + Math.max(60, payload.expires_in ?? 600) * 1000);
      this.sessions.set(sessionId, {
        clientAccountId: pending.clientAccountId,
        email: pending.email,
        accessToken: payload.access_token,
        expiresAt
      });
      this.renderCallback(res, true, '授权完成。请回到 Inbox Mate。');
    } catch {
      this.outcomes.set(pending.clientAccountId, { state: 'denied', expiresAt: Date.now() + OAUTH_TTL_MS });
      this.renderCallback(res, false, '授权令牌交换失败。请回到 Inbox Mate 重试。');
    }
  }

  consume(sessionId: string, email: string): string {
    this.prune();
    const session = this.sessions.get(sessionId);
    if (!session) throw new InboxMateError('AUTH_EXPIRED');
    if (session.email !== normalizeEmail(email)) throw new InboxMateError('AUTH_DENIED');
    this.sessions.delete(sessionId);
    return session.accessToken;
  }

  private prune(): void {
    const now = Date.now();
    for (const [key, value] of this.pending) if (value.expiresAt < now) this.pending.delete(key);
    for (const [key, value] of this.sessions) if (value.expiresAt < now) this.sessions.delete(key);
    for (const [key, value] of this.outcomes) if (value.expiresAt < now) this.outcomes.delete(key);
  }

  private renderCallback(res: Response, success: boolean, message: string): void {
    res
      .status(success ? 200 : 400)
      .set({
        'Cache-Control': 'no-store',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"
      })
      .send(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>Inbox Mate</title><style>body{font:16px system-ui;margin:48px;color:#1d2939}main{max-width:480px}strong{color:${success ? '#067647' : '#b42318'}}</style><main><strong>${success ? '已完成' : '未完成'}</strong><p>${message}</p><p>此窗口可以关闭。</p><script>window.setTimeout(()=>window.close(), 900)</script></main></html>`);
  }
}
