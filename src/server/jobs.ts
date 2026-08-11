import { randomUUID } from 'node:crypto';
import pLimit from 'p-limit';
import type {
  AccountInput,
  AccountSnapshot,
  CodeMatch,
  CreateJobInput,
  JobEvent,
  JobSnapshot,
  JobState,
  ProviderId
} from '../shared/types.js';
import { InboxMateError, isInboxMateError, safeError } from './errors.js';
import { maskEmail } from './providers.js';

import { routeAccountEngine } from './engine-router.js';

const ACCOUNT_TIMEOUT_MS = 30_000;
const RPA_ACCOUNT_TIMEOUT_MS = 90_000;
const JOB_TIMEOUT_MS = 300_000;
const JOB_RETENTION_MS = 10 * 60_000;

interface AccountRuntime {
  input?: AccountInput;
  snapshot: AccountSnapshot;
}

interface JobRuntime {
  id: string;
  state: JobState;
  createdAt: Date;
  updatedAt: Date;
  accounts: AccountRuntime[];
  controller: AbortController;
  events: JobEvent[];
  listeners: Set<(event: JobEvent) => void>;
  eventId: number;
}

import type { FetchAccountResult } from './imap-client.js';

export interface JobAccountRunnerOptions {
  signal: AbortSignal;
  lookbackMinutes: number;
  maxMessages: number;
  onProgress: (state: AccountSnapshot['state']) => void;
}

export type JobAccountRunner = (input: AccountInput, options: JobAccountRunnerOptions) => Promise<FetchAccountResult>;

function isTerminal(state: JobState): boolean {
  return state === 'completed' || state === 'failed' || state === 'cancelled';
}

function cloneAccount(account: AccountSnapshot): AccountSnapshot {
  return {
    ...account,
    messages: account.messages
      ? account.messages.map((item) => ({
          ...item,
          codeMatch: item.codeMatch
            ? { ...item.codeMatch, reason: Array.isArray(item.codeMatch?.reason) ? [...item.codeMatch.reason] : [] }
            : undefined
        }))
      : undefined,
    result: account.result
      ? { ...account.result, reason: Array.isArray(account.result?.reason) ? [...account.result.reason] : [] }
      : undefined,
    error: account.error ? { ...account.error } : undefined
  };
}

export class JobManager {
  private readonly jobs = new Map<string, JobRuntime>();
  private readonly globalLimit = pLimit(50);
  private readonly rpaLimit = pLimit(3);
  private readonly providerLimits = new Map<string, ReturnType<typeof pLimit>>();

  private getProviderLimit(provider: string): ReturnType<typeof pLimit> {
    let limit = this.providerLimits.get(provider);
    if (!limit) {
      limit = pLimit(10);
      this.providerLimits.set(provider, limit);
    }
    return limit;
  }

  constructor(private readonly runAccount: JobAccountRunner) {}

  create(input: CreateJobInput): JobSnapshot {
    for (const [id, job] of this.jobs.entries()) {
      if (!isTerminal(job.state)) {
        this.cancel(id);
      }
    }
    const now = new Date();
    const job: JobRuntime = {
      id: randomUUID(),
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      accounts: input.accounts.map((account) => ({
        input: account,
        snapshot: {
          clientAccountId: account.clientAccountId,
          email: maskEmail(account.email),
          provider: account.provider,
          state: 'pending',
          customHost: account.customHost,
          customPort: account.customPort,
          customProtocol: account.customProtocol,
        }
      })),
      controller: new AbortController(),
      events: [],
      listeners: new Set(),
      eventId: 0
    };
    this.jobs.set(job.id, job);
    queueMicrotask(() => void this.execute(job, input));
    return this.snapshot(job);
  }

  get(jobId: string): JobSnapshot | undefined {
    const job = this.jobs.get(jobId);
    return job ? this.snapshot(job) : undefined;
  }

  cancel(jobId: string): JobSnapshot | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    if (isTerminal(job.state)) return this.snapshot(job);
    job.state = 'cancelling';
    job.updatedAt = new Date();
    job.controller.abort();
    return this.snapshot(job);
  }

  subscribe(jobId: string, afterId: number | undefined, listener: (event: JobEvent) => void): (() => void) | undefined {
    const job = this.jobs.get(jobId);
    if (!job) return undefined;
    listener({ id: job.eventId, type: 'job.snapshot', data: this.snapshot(job) });
    for (const event of job.events) {
      if (afterId === undefined || event.id > afterId) listener(event);
    }
    job.listeners.add(listener);
    return () => job.listeners.delete(listener);
  }

  private async execute(job: JobRuntime, input: CreateJobInput): Promise<void> {
    if (job.controller.signal.aborted) return this.finishCancelled(job);
    job.state = 'running';
    job.updatedAt = new Date();
    const jobTimeout = setTimeout(() => job.controller.abort(), JOB_TIMEOUT_MS);
    jobTimeout.unref();

    try {
      await Promise.all(
        job.accounts.map((account) => {
          if (!account.input) return Promise.resolve();
          const engineType = routeAccountEngine(account.input);
          if (engineType === 'web_rpa') {
            return this.rpaLimit(() => this.executeAccount(job, account, input, RPA_ACCOUNT_TIMEOUT_MS));
          }
          const provider = account.snapshot.provider;
          const limit = this.getProviderLimit(provider);
          return this.globalLimit(() => limit(() => this.executeAccount(job, account, input, ACCOUNT_TIMEOUT_MS)));
        })
      );
      if (job.controller.signal.aborted) {
        this.finishCancelled(job);
      } else {
        const completed = job.accounts.filter((account) => account.snapshot.state === 'completed').length;
        job.state = completed === 0 ? 'failed' : 'completed';
        job.updatedAt = new Date();
        this.emit(job, 'job.completed', { jobId: job.id, state: job.state, summary: this.summary(job) });
        this.scheduleCleanup(job);
      }
    } finally {
      clearTimeout(jobTimeout);
      for (const account of job.accounts) account.input = undefined;
    }
  }

  private async executeAccount(
    job: JobRuntime,
    account: AccountRuntime,
    input: CreateJobInput,
    timeoutMs = ACCOUNT_TIMEOUT_MS
  ): Promise<void> {
    if (job.controller.signal.aborted || !account.input) {
      this.setAccountState(job, account, 'cancelled');
      return;
    }

    const timeoutController = new AbortController();
    let timedOut = false;
    const timeout = setTimeout(() => {
      timedOut = true;
      timeoutController.abort();
    }, timeoutMs);
    timeout.unref();
    const combined = AbortSignal.any([job.controller.signal, timeoutController.signal]);

    try {
      const result = await this.runAccount(account.input, {
        signal: combined,
        lookbackMinutes: input.lookbackMinutes,
        maxMessages: input.maxMessagesPerAccount,
        onProgress: (state) => this.setAccountState(job, account, state)
      });
      if (combined.aborted) {
        this.setAccountState(job, account, 'cancelled');
      } else {
        const primaryCode = result && typeof result === 'object' && 'primaryCode' in result ? (result as FetchAccountResult).primaryCode : (result as unknown as CodeMatch);
        const messages = result && typeof result === 'object' && 'messages' in result ? (result as FetchAccountResult).messages : undefined;
        account.snapshot.result = primaryCode;
        account.snapshot.messages = messages;
        account.snapshot.error = (messages && messages.length > 0) || primaryCode ? undefined : safeError('NO_MATCH');
        this.setAccountState(job, account, 'completed');
      }
    } catch (error) {
      if (timedOut) {
        this.setAccountState(job, account, 'failed', safeError('TIMEOUT'));
      } else if (job.controller.signal.aborted || combined.aborted) {
        this.setAccountState(job, account, 'cancelled');
      } else if (isInboxMateError(error)) {
        this.setAccountState(job, account, 'failed', safeError(error.code, error.customMessage));
      } else {
        this.setAccountState(job, account, 'failed', safeError('INTERNAL'));
      }
    } finally {
      clearTimeout(timeout);
    }
  }

  private setAccountState(
    job: JobRuntime,
    account: AccountRuntime,
    state: AccountSnapshot['state'],
    error?: AccountSnapshot['error']
  ): void {
    if (isTerminal(job.state)) return;
    account.snapshot.state = state;
    if (error) account.snapshot.error = error;
    if (state === 'cancelled') account.snapshot.error = safeError('CANCELLED');
    job.updatedAt = new Date();
    this.emit(job, 'account.updated', cloneAccount(account.snapshot));
  }

  private finishCancelled(job: JobRuntime): void {
    if (isTerminal(job.state)) return;
    for (const account of job.accounts) {
      if (!['completed', 'failed', 'cancelled'].includes(account.snapshot.state)) {
        account.snapshot.state = 'cancelled';
        account.snapshot.error = safeError('CANCELLED');
        this.emit(job, 'account.updated', cloneAccount(account.snapshot));
      }
    }
    job.state = 'cancelled';
    job.updatedAt = new Date();
    this.emit(job, 'job.completed', { jobId: job.id, state: job.state, summary: this.summary(job) });
    this.scheduleCleanup(job);
  }

  private snapshot(job: JobRuntime): JobSnapshot {
    return {
      jobId: job.id,
      state: job.state,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
      accounts: job.accounts.map((account) => cloneAccount(account.snapshot)),
      summary: this.summary(job)
    };
  }

  private summary(job: JobRuntime): JobSnapshot['summary'] {
    const accounts = job.accounts.map((account) => account.snapshot);
    const totalMessages = accounts.reduce((acc, account) => acc + (account.messages?.length ?? 0), 0);
    return {
      total: accounts.length,
      completed: accounts.filter((account) => account.state === 'completed').length,
      failed: accounts.filter((account) => account.state === 'failed').length,
      cancelled: accounts.filter((account) => account.state === 'cancelled').length,
      matched: accounts.filter((account) => Boolean(account.result)).length,
      totalMessages
    };
  }

  private emit(job: JobRuntime, type: JobEvent['type'], data: JobEvent['data']): void {
    const event: JobEvent = { id: ++job.eventId, type, data };
    job.events.push(event);
    if (job.events.length > 120) job.events.shift();
    for (const listener of job.listeners) listener(event);
  }

  private scheduleCleanup(job: JobRuntime): void {
    const cleanup = setTimeout(() => {
      job.listeners.clear();
      job.events.length = 0;
      this.jobs.delete(job.id);
    }, JOB_RETENTION_MS);
    cleanup.unref();
  }
}
