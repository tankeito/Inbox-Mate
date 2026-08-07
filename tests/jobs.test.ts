import { describe, expect, it } from 'vitest';
import type { AccountInput, CodeMatch, CreateJobInput } from '../src/shared/types';
import { InboxMateError } from '../src/server/errors';
import { JobManager } from '../src/server/jobs';

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

  it('cancels an in-flight account through its abort signal', async () => {
    const runner = async (_input: AccountInput, options: { signal: AbortSignal }): Promise<undefined> =>
      new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new InboxMateError('CANCELLED')), { once: true });
      });
    const manager = new JobManager(runner as never);
    const job = manager.create(payload);
    manager.cancel(job.jobId);

    await eventually(() => expect(manager.get(job.jobId)?.state).toBe('cancelled'));
    expect(manager.get(job.jobId)?.accounts[0]).toMatchObject({ state: 'cancelled', error: { code: 'CANCELLED' } });
  });
});
