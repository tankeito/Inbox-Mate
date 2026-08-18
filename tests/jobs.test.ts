import { describe, expect, it } from 'vitest';
import type { AccountInput, CodeMatch, CreateJobInput } from '../src/shared/types';
import { InboxMateError } from '../src/server/errors';
import { JobManager, resolveRpaAccountTimeoutMs } from '../src/server/jobs';

const account: AccountInput = {
  clientAccountId: 'account-1',
  email: 'user@gmx.com',
  provider: 'gmx',
  auth: { type: 'app_password', secret: 'transient-secret' }
};

const payload: CreateJobInput = {
  accounts: [account],
  lookbackMinutes: 30,
  maxMessagesPerAccount: 5
};

async function eventually(assertion: () => void): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      assertion();
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
  }
  throw lastError;
}

describe('JobManager', () => {
  it('reserves a longer account timeout for OffiLive without reducing larger configured values', () => {
    expect(resolveRpaAccountTimeoutMs('offilive', 90_000)).toBe(285_000);
    expect(resolveRpaAccountTimeoutMs('offilive', 300_000)).toBe(300_000);
    expect(resolveRpaAccountTimeoutMs('mailcom', 90_000)).toBe(90_000);
  });

  it('publishes account progress and only exposes the safe account snapshot', async () => {
    const runner = async (_input: AccountInput, options: { onProgress: (state: 'connecting' | 'searching') => void }): Promise<CodeMatch> => {
      options.onProgress('connecting');
      options.onProgress('searching');
      return {
        code: '849201',
        confidence: 'high',
        score: 90,
        receivedAt: '2026-08-07T01:00:00.000Z',
        reason: ['six_digits']
      };
    };
    const manager = new JobManager(runner as never);
    const job = manager.create(payload);
    const events: string[] = [];
    const unsubscribe = manager.subscribe(job.jobId, undefined, (event) => events.push(event.type));

    await eventually(() => expect(manager.get(job.jobId)?.state).toBe('completed'));
    unsubscribe?.();
    const snapshot = manager.get(job.jobId);
    expect(snapshot?.accounts[0]).toMatchObject({ state: 'completed', result: { code: '849201' } });
    expect(JSON.stringify(snapshot)).not.toContain('transient-secret');
    expect(events).toContain('account.updated');
    expect(events).toContain('job.completed');
  });

  it('only deducts token quota for mail.com accounts, sparing other accounts', async () => {
    const { accessTokenService } = await import('../src/server/services/access-token-service.js');
    const token = accessTokenService.createToken({
      name: '混合任务测试Token',
      totalQuota: 10
    });

    const runner = async (input: AccountInput): Promise<CodeMatch> => {
      return {
        code: '123456',
        confidence: 'high',
        score: 90,
        receivedAt: new Date().toISOString(),
        reason: ['digits']
      };
    };

    const manager = new JobManager(runner as never);
    const mixedPayload: CreateJobInput = {
      token: token.token,
      accounts: [
        {
          clientAccountId: 'acc-gmx',
          email: 'user@gmx.com',
          provider: 'gmx',
          auth: { type: 'app_password', secret: 'secret' }
        },
        {
          clientAccountId: 'acc-mailcom',
          email: 'test@mail.com',
          provider: 'mailcom',
          auth: { type: 'app_password', secret: 'secret' }
        }
      ],
      lookbackMinutes: 0,
      maxMessagesPerAccount: 5
    };

    const job = manager.create(mixedPayload);
    await eventually(() => expect(manager.get(job.jobId)?.state).toBe('completed'));

    const updatedToken = accessTokenService.getTokenById(token.id);
    // Total 2 accounts ran, but ONLY 1 mail.com was consumed!
    expect(updatedToken?.usedQuota).toBe(1);
    expect(updatedToken?.remainingQuota).toBe(9);
  });
});
