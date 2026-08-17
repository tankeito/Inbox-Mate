import { z } from 'zod';
import { InboxMateError } from './errors.js';
import { normalizeEmail, providerForEmail, PROVIDER_REGISTRY } from './providers.js';
import type { AccountInput, CreateJobInput, ProviderId } from '../shared/types.js';

const providerSchema = z.enum([
  'microsoft',
  'gmx',
  'rambler',
  'mailru',
  'mailcom',
  'yahoo',
  'gmail',
  'netease163',
  'qq',
  'icloud',
  'zoho',
  'fastmail',
  'aol',
  'custom'
]);
const clientAccountIdSchema = z.string().min(1).max(128);

const accountSchema = z
  .object({
    clientAccountId: clientAccountIdSchema,
    email: z.string().trim().email().max(320),
    provider: providerSchema.optional(),
    customHost: z.string().max(256).optional(),
    customPort: z.number().int().min(1).max(65535).optional(),
    customProtocol: z.enum(['imap', 'pop3']).optional(),
    customSecure: z.boolean().optional(),
    auth: z.union([
      z.object({ type: z.literal('app_password'), secret: z.string().min(1).max(1024) }),
      z.object({ type: z.literal('oauth_session'), sessionId: z.string().min(1).max(256) }),
      z.object({ type: z.literal('refresh_token'), refreshToken: z.string().min(1), clientId: z.string().optional() })
    ])
  })
  .strict();

const createJobSchema = z
  .object({
    accounts: z.array(accountSchema).min(1).max(50),
    lookbackMinutes: z.number().int().min(0).max(525600).default(0),
    maxMessagesPerAccount: z.number().int().min(1).max(100).default(15),
    token: z.string().optional()
  })
  .strict();

export function parseCreateJobInput(body: unknown): CreateJobInput {
  const result = createJobSchema.safeParse(body);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    console.error('[ZOD FAIL]:', details);
    throw new InboxMateError('BAD_REQUEST', 400, `请求参数无效: ${details}`);
  }

  const seen = new Set<string>();
  const accounts: AccountInput[] = [];

  for (const account of result.data.accounts) {
    const email = normalizeEmail(account.email);
    if (seen.has(email)) continue; // Auto-deduplicate
    seen.add(email);

    const profile = providerForEmail(email);

    // Auto-correct provider to match email domain unless custom is explicitly requested
    const providerId = account.provider === 'custom' ? 'custom' : profile.id;

    if (account.auth.type === 'refresh_token') {
      // Refresh token auth is valid for Graph API / OAuth providers
    } else if (profile.auth === 'oauth2' && account.auth.type !== 'oauth_session') {
      throw new InboxMateError('AUTH_REQUIRED', 400, `邮箱 ${email} 需要微软 OAuth 授权`);
    } else if (profile.auth === 'app_password' && account.auth.type !== 'app_password') {
      throw new InboxMateError('AUTH_REQUIRED', 400, `邮箱 ${email} 需要填写应用专用密码`);
    }

    accounts.push({
      ...account,
      email,
      provider: providerId as ProviderId
    } as AccountInput);
  }

  if (!accounts.length) {
    throw new InboxMateError('BAD_REQUEST', 400, '队列中没有有效的邮箱账户');
  }

  // Check Mail.com batch prohibition (unless authorized with token)
  if (accounts.length > 1) {
    const hasMailCom = accounts.some((acc) => {
      const domain = acc.email.split('@')[1]?.toLowerCase() || '';
      return (
        acc.provider === 'mailcom' ||
        domain.endsWith('mail.com') ||
        domain.endsWith('cheerful.com') ||
        (PROVIDER_REGISTRY.mailcom.domains as readonly string[]).includes(domain)
      );
    });
    if (hasMailCom && !result.data.token) {
      throw new InboxMateError('BAD_REQUEST', 400, '批量导入不支持mail.com邮箱，请使用单账号添加功能');
    }
  }

  return {
    accounts,
    lookbackMinutes: result.data.lookbackMinutes,
    maxMessagesPerAccount: result.data.maxMessagesPerAccount,
    token: result.data.token
  };
}

export const oauthStartSchema = z.object({
  clientAccountId: clientAccountIdSchema,
  email: z.string().trim().email().max(320)
});
