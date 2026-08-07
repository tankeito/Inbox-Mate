import { z } from 'zod';
import { InboxMateError } from './errors.js';
import { normalizeEmail, providerForEmail } from './providers.js';
import type { AccountInput, CreateJobInput, ProviderId } from '../shared/types.js';

const providerSchema = z.enum(['microsoft', 'gmx', 'rambler']);
const clientAccountIdSchema = z.string().min(1).max(128);

const accountSchema = z
  .object({
    clientAccountId: clientAccountIdSchema,
    email: z.string().trim().email().max(320),
    provider: providerSchema,
    auth: z.discriminatedUnion('type', [
      z.object({ type: z.literal('app_password'), secret: z.string().min(1).max(1024) }),
      z.object({ type: z.literal('oauth_session'), sessionId: z.string().min(1).max(256) })
    ])
  })
  .strict();

const createJobSchema = z
  .object({
    accounts: z.array(accountSchema).min(1).max(50),
    lookbackMinutes: z.number().int().min(0).max(525600).default(0),
    maxMessagesPerAccount: z.number().int().min(1).max(100).default(15)
  })
  .strict();

export function parseCreateJobInput(body: unknown): CreateJobInput {
  const result = createJobSchema.safeParse(body);
  if (!result.success) {
    console.error('Zod validation failed on POST /api/v1/jobs:', JSON.stringify(result.error.issues, null, 2));
    throw new InboxMateError('BAD_REQUEST');
  }

  const seen = new Set<string>();
  const accounts = result.data.accounts.map((account) => {
    const email = normalizeEmail(account.email);
    const profile = providerForEmail(email);
    if (!profile || profile.id !== account.provider) throw new InboxMateError('UNSUPPORTED_PROVIDER');
    if (seen.has(email)) throw new InboxMateError('BAD_REQUEST');
    seen.add(email);

    if (profile.auth === 'oauth2' && account.auth.type !== 'oauth_session') {
      throw new InboxMateError('AUTH_REQUIRED');
    }
    if (profile.auth === 'app_password' && account.auth.type !== 'app_password') {
      throw new InboxMateError('AUTH_REQUIRED');
    }

    return { ...account, email, provider: profile.id as ProviderId } as AccountInput;
  });

  return {
    accounts,
    lookbackMinutes: result.data.lookbackMinutes,
    maxMessagesPerAccount: result.data.maxMessagesPerAccount
  };
}

export const oauthStartSchema = z.object({
  clientAccountId: clientAccountIdSchema,
  email: z.string().trim().email().max(320)
});
