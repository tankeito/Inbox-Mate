import { createHmac, randomBytes } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { db, hashPassword, verifyPassword } from '../db/database.js';
import { generateBase32Secret, generateOtpAuthUri, generateQrCodeSvg, verifyTotp } from './totp.js';

const JWT_SECRET = process.env.ADMIN_JWT_SECRET || randomBytes(32).toString('hex');
const SESSION_COOKIE_NAME = 'backyard_session';

export interface AdminUser {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface TokenPayload {
  userId: string;
  email: string;
  type: 'session' | '2fa_pending';
  exp: number;
}

function signToken(payload: TokenPayload): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = createHmac('sha256', JWT_SECRET)
    .update(`${header}.${body}`)
    .digest('base64url');
  return `${header}.${body}.${signature}`;
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [header, body, signature] = parts;
    const expectedSignature = createHmac('sha256', JWT_SECRET)
      .update(`${header}.${body}`)
      .digest('base64url');
    if (signature !== expectedSignature) return null;

    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

export class AdminAuthService {
  private temp2faSecrets = new Map<string, { secret: string; expiresAt: number }>();

  public getAdminUser(): AdminUser | null {
    const stmt = db.prepare('SELECT id, email, two_factor_enabled, created_at, updated_at FROM admin_users LIMIT 1');
    const row = stmt.get() as any;
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };
  }

  public login(email: string, password: string): { require2FA: boolean; tempToken?: string; token?: string; user?: AdminUser } {
    const stmt = db.prepare('SELECT * FROM admin_users WHERE LOWER(email) = LOWER(?) LIMIT 1');
    const row = stmt.get(email.trim()) as any;
    if (!row) {
      throw new Error('用户名或密码错误');
    }

    const isValid = verifyPassword(password, row.password_hash, row.password_salt);
    if (!isValid) {
      throw new Error('用户名或密码错误');
    }

    const user: AdminUser = {
      id: row.id,
      email: row.email,
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    if (user.twoFactorEnabled) {
      const tempToken = signToken({
        userId: user.id,
        email: user.email,
        type: '2fa_pending',
        exp: Date.now() + 5 * 60 * 1000 // 5 minutes
      });
      return { require2FA: true, tempToken };
    }

    const sessionToken = signToken({
      userId: user.id,
      email: user.email,
      type: 'session',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    return { require2FA: false, token: sessionToken, user };
  }

  public verify2FALogin(tempToken: string, code: string): { token: string; user: AdminUser } {
    const payload = verifyToken(tempToken);
    if (!payload || payload.type !== '2fa_pending') {
      throw new Error('验证凭据已失效，请重新登录');
    }

    const stmt = db.prepare('SELECT * FROM admin_users WHERE id = ?');
    const row = stmt.get(payload.userId) as any;
    if (!row || !row.two_factor_secret) {
      throw new Error('用户未绑定 2FA');
    }

    const isValid = verifyTotp(code, row.two_factor_secret);
    if (!isValid) {
      throw new Error('2FA 动态验证码不正确');
    }

    const user: AdminUser = {
      id: row.id,
      email: row.email,
      twoFactorEnabled: Boolean(row.two_factor_enabled),
      createdAt: row.created_at,
      updatedAt: row.updated_at
    };

    const sessionToken = signToken({
      userId: user.id,
      email: user.email,
      type: 'session',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    });

    return { token: sessionToken, user };
  }

  public setup2FA(userId: string): { secret: string; uri: string; qrSvg: string } {
    const stmt = db.prepare('SELECT email FROM admin_users WHERE id = ?');
    const row = stmt.get(userId) as any;
    if (!row) throw new Error('用户不存在');

    const secret = generateBase32Secret(20);
    const uri = generateOtpAuthUri('InboxMate Admin', row.email, secret);
    const qrSvg = generateQrCodeSvg(uri, 220);

    this.temp2faSecrets.set(userId, {
      secret,
      expiresAt: Date.now() + 10 * 60 * 1000
    });

    return { secret, uri, qrSvg };
  }

  public enable2FA(userId: string, code: string): void {
    const pending = this.temp2faSecrets.get(userId);
    if (!pending || Date.now() > pending.expiresAt) {
      throw new Error('2FA 绑定会话已过期，请重新发起绑定');
    }

    const isValid = verifyTotp(code, pending.secret);
    if (!isValid) {
      throw new Error('验证码错误，请确保时间同步并输入 6 位有效动态码');
    }

    const now = new Date().toISOString();
    const stmt = db.prepare(`
      UPDATE admin_users 
      SET two_factor_secret = ?, two_factor_enabled = 1, updated_at = ? 
      WHERE id = ?
    `);
    stmt.run(pending.secret, now, userId);
    this.temp2faSecrets.delete(userId);
  }

  public disable2FA(userId: string, code: string): void {
    const stmt = db.prepare('SELECT two_factor_secret FROM admin_users WHERE id = ?');
    const row = stmt.get(userId) as any;
    if (!row || !row.two_factor_secret) {
      throw new Error('未开启 2FA');
    }

    const isValid = verifyTotp(code, row.two_factor_secret);
    if (!isValid) {
      throw new Error('2FA 动态验证码不正确');
    }

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE admin_users 
      SET two_factor_secret = NULL, two_factor_enabled = 0, updated_at = ? 
      WHERE id = ?
    `);
    updateStmt.run(now, userId);
  }

  public changePassword(userId: string, oldPass: string, newPass: string): void {
    const stmt = db.prepare('SELECT password_hash, password_salt FROM admin_users WHERE id = ?');
    const row = stmt.get(userId) as any;
    if (!row) throw new Error('用户不存在');

    const isValid = verifyPassword(oldPass, row.password_hash, row.password_salt);
    if (!isValid) throw new Error('原密码不正确');

    if (!newPass || newPass.length < 6) {
      throw new Error('新密码长度不能少于 6 位');
    }

    const { hash, salt } = hashPassword(newPass);
    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      UPDATE admin_users 
      SET password_hash = ?, password_salt = ?, updated_at = ? 
      WHERE id = ?
    `);
    updateStmt.run(hash, salt, now, userId);
  }
}

export const adminAuthService = new AdminAuthService();

export function extractAuthToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice(7).trim();
  }
  const cookies = req.headers.cookie;
  if (cookies) {
    const match = cookies.match(new RegExp(`(?:^|;\\s*)${SESSION_COOKIE_NAME}=([^;]+)`));
    if (match) return decodeURIComponent(match[1]);
  }
  return null;
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  const token = extractAuthToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '未授权或登录已过期' } });
    return;
  }

  const payload = verifyToken(token);
  if (!payload || payload.type !== 'session') {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: '登录会话已失效' } });
    return;
  }

  (req as any).adminUser = payload;
  next();
}

export function setSessionCookie(res: Response, token: string): void {
  res.cookie(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
    secure: false
  });
}

export function clearSessionCookie(res: Response): void {
  res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
}
