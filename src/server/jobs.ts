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
import { usageLogger } from './services/usage-logger.js';
import { diagLogger } from './services/diag-logger.js';
import { accessTokenService } from './services/access-token-service.js';

const ACCOUNT_TIMEOUT_MS = 30_000;
const RPA_ACCOUNT_TIMEOUT_MS = 90_000;
const OFFILIVE_RPA_ACCOUNT_TIMEOUT_MS = 285_000;
const JOB_TIMEOUT_MS = 300_000;
const JOB_RETENTION_MS = 10 * 60_000;

export function resolveRpaAccountTimeoutMs(provider: ProviderId, configuredTimeoutMs: number): number {
  return provider === 'offilive'
    ? Math.max(configuredTimeoutMs, OFFILIVE_RPA_ACCOUNT_TIMEOUT_MS)
    : configuredTimeoutMs;
}

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
  clientIp?: string;
  region?: string;
  token?: string;
  tokenId?: string;
}

import type { FetchAccountResult } from './imap-client.js';

export interface JobAccountRunnerOptions {
  signal: AbortSignal;
  lookbackMinutes: number;
  maxMessages: number;
  onProgress: (state: AccountSnapshot['state']) => void;
  traceId?: string;
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

import { systemSettingsService, type SystemConcurrencySettings } from './services/system-settings-service.js';

export class JobManager {
  private readonly jobs = new Map<string, JobRuntime>();
  private globalLimit: ReturnType<typeof pLimit>;
  private rpaLimit: ReturnType<typeof pLimit>;
  private providerLimitVal: number;
  private readonly providerLimits = new Map<string, ReturnType<typeof pLimit>>();
  private accountTimeoutMs: number;
  private rpaTimeoutMs: number;
  private jobTimeoutMs: number;

  private getProviderLimit(provider: string): ReturnType<typeof pLimit> {
    let limit = this.providerLimits.get(provider);
    if (!limit) {
      limit = pLimit(this.providerLimitVal);
      this.providerLimits.set(provider, limit);
    }
    return limit;
  }

  constructor(private readonly runAccount: JobAccountRunner) {
    const settings = systemSettingsService.getSettings();
    this.globalLimit = pLimit(settings.concurrencyGlobalMax);
    this.rpaLimit = pLimit(settings.concurrencyRpaMax);
    this.providerLimitVal = settings.concurrencyProviderMax;
    this.accountTimeoutMs = settings.timeoutAccountSec * 1000;
    this.rpaTimeoutMs = settings.timeoutRpaSec * 1000;
    this.jobTimeoutMs = settings.timeoutJobSec * 1000;

    systemSettingsService.onSettingsChanged((newSettings) => {
      this.applySettings(newSettings);
    });
  }

  applySettings(settings: SystemConcurrencySettings): void {
    // Keep the existing limiter instances so pending work follows a hot-reloaded
    // concurrency value instead of remaining trapped in the old queue.
    this.globalLimit.concurrency = settings.concurrencyGlobalMax;
    this.rpaLimit.concurrency = settings.concurrencyRpaMax;
    this.providerLimitVal = settings.concurrencyProviderMax;
    for (const limit of this.providerLimits.values()) {
      limit.concurrency = settings.concurrencyProviderMax;
    }
    this.accountTimeoutMs = settings.timeoutAccountSec * 1000;
    this.rpaTimeoutMs = settings.timeoutRpaSec * 1000;
    this.jobTimeoutMs = settings.timeoutJobSec * 1000;
  }

  create(input: CreateJobInput, meta?: { clientIp?: string; region?: string; token?: string }): JobSnapshot {
    for (const [id, job] of this.jobs.entries()) {
      if (!isTerminal(job.state)) {
        this.cancel(id);
      }
    }

    const tokenStr = (input.token || meta?.token || '').trim();
    let verifiedTokenId: string | undefined;

    const hasRpaAccount = input.accounts.some((acc) => {
      const email = acc.email.trim().toLowerCase();
      return (
        acc.provider === 'mailcom' ||
        acc.provider === 'offilive' ||
        routeAccountEngine(acc) === 'web_rpa' ||
        email.endsWith('@mail.com') ||
        email.endsWith('@cheerful.com') ||
        email.endsWith('@offilive.com') ||
        email.endsWith('@offidocs.com') ||
        email.endsWith('@onworks.net')
      );
    });
    // Token authorization is a batch-only control for browser/RPA providers.
    // A single account may always be tested directly, even without a Token.
    const requiresRpaToken = input.accounts.length > 1 && hasRpaAccount;

    if (requiresRpaToken && !tokenStr) {
      throw new InboxMateError('AUTH_FAILED', 403, '批量抓取 Mail.com / OffiLive 账号需要授权 Token');
    }

    if (requiresRpaToken && tokenStr) {
      const check = accessTokenService.verifyTokenAccess(tokenStr);
      if (!check.valid) {
        throw new InboxMateError('AUTH_FAILED', 403, check.reason || 'Token 无效或额度已用尽');
      }
      verifiedTokenId = check.token?.id;
    }

    const effectiveJobToken = requiresRpaToken ? tokenStr : undefined;

    const now = new Date();
    const job: JobRuntime = {
      id: randomUUID(),
      state: 'queued',
      createdAt: now,
      updatedAt: now,
      clientIp: meta?.clientIp || '127.0.0.1',
      region: meta?.region,
      token: effectiveJobToken,
      tokenId: verifiedTokenId,
      accounts: input.accounts.map((account) => ({
        input: account,
        snapshot: {
          clientAccountId: account.clientAccountId,
          email: account.email,
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
    const jobTimeout = setTimeout(() => job.controller.abort(), this.jobTimeoutMs);
    jobTimeout.unref();

    try {
      await Promise.all(
        job.accounts.map(async (account, index) => {
          if (!account.input) return;
          const isMailCom = account.input.provider === 'mailcom' || account.input.email.endsWith('@mail.com') || account.input.email.endsWith('@cheerful.com');
          const engineType = routeAccountEngine(account.input);

          if (engineType === 'web_rpa' || isMailCom) {
            const timeoutMs = resolveRpaAccountTimeoutMs(account.input.provider, this.rpaTimeoutMs);
            return this.rpaLimit(async () => {
              // Add a gentle stagger for batch executions (300ms ~ 800ms) to prevent burst collisions on the same target IP
              if (index > 0 && job.accounts.length > 1 && !job.controller.signal.aborted) {
                const staggerMs = Math.min(index * 250, 1500) + Math.floor(Math.random() * 200);
                await new Promise<void>((r) => setTimeout(r, staggerMs));
              }
              return this.executeAccount(job, account, input, timeoutMs);
            });
          }
          const provider = account.snapshot.provider;
          const limit = this.getProviderLimit(provider);
          return this.globalLimit(() => limit(() => this.executeAccount(job, account, input, this.accountTimeoutMs)));
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

    const email = account.input.email;
    const provider = account.snapshot.provider;
    const mode = job.accounts.length > 1 ? 'batch' : 'single';
    const startTime = Date.now();
    const traceId = randomUUID();

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
        traceId,
        onProgress: (state) => this.setAccountState(job, account, state)
      });
      if (combined.aborted) {
        this.setAccountState(job, account, 'cancelled');
        usageLogger.record({
          id: traceId,
          clientIp: job.clientIp || '127.0.0.1',
          region: job.region,
          emailAccount: email,
          provider,
          sourceMode: mode,
          status: 'cancelled',
          hasCode: false,
          durationMs: Date.now() - startTime,
          tokenId: job.tokenId,
          token: job.token
        });
      } else {
        const primaryCode = result && typeof result === 'object' && 'primaryCode' in result ? (result as FetchAccountResult).primaryCode : (result as unknown as CodeMatch);
        const messages = result && typeof result === 'object' && 'messages' in result ? (result as FetchAccountResult).messages : undefined;
        const engineUsed = result && typeof result === 'object' && 'engineUsed' in result ? (result as FetchAccountResult).engineUsed : (account.input && routeAccountEngine(account.input) === 'web_rpa' ? 'web_rpa' : 'imap');
        account.snapshot.result = primaryCode;
        account.snapshot.messages = messages;
        account.snapshot.error = (messages && messages.length > 0) || primaryCode ? undefined : safeError('NO_MATCH');
        this.setAccountState(job, account, 'completed');

        // Post-execution quota deduction: only batch RPA calls consume Token quota.
        const isRpaAccount = (
          provider === 'mailcom' ||
          account.input?.provider === 'mailcom' ||
          provider === 'offilive' ||
          account.input?.provider === 'offilive' ||
          email.endsWith('@mail.com') ||
          email.endsWith('@cheerful.com') ||
          email.endsWith('@offilive.com') ||
          email.endsWith('@offidocs.com') ||
          email.endsWith('@onworks.net') ||
          (account.input ? routeAccountEngine(account.input) === 'web_rpa' : false)
        );

        if (job.accounts.length > 1 && job.tokenId && isRpaAccount) {
          accessTokenService.consumeQuota(job.tokenId);
        }

        usageLogger.record({
          id: traceId,
          clientIp: job.clientIp || '127.0.0.1',
          region: job.region,
          emailAccount: email,
          provider,
          sourceMode: mode,
          status: primaryCode ? 'success' : 'no_code',
          hasCode: Boolean(primaryCode),
          extractedCode: primaryCode?.code,
          durationMs: Date.now() - startTime,
          messageCount: messages?.length || 0,
          tokenId: job.tokenId,
          token: job.token,
          engine: engineUsed
        });
      }
    } catch (error) {
      const durationMs = Date.now() - startTime;
      let status: 'timeout' | 'captcha' | 'auth_failed' | 'error' = 'error';
      let errorMsg = '抓取异常';

      if (timedOut) {
        status = 'timeout';
        errorMsg = '请求超时';
        this.setAccountState(job, account, 'failed', safeError('TIMEOUT'));
      } else if (job.controller.signal.aborted || combined.aborted) {
        this.setAccountState(job, account, 'cancelled');
        status = 'error';
        errorMsg = '用户取消';
      } else if (isInboxMateError(error)) {
        if (error.code === 'CAPTCHA_TRIGGERED') status = 'captcha';
        else if (error.code === 'AUTH_FAILED' || error.code === 'AUTH_DENIED') status = 'auth_failed';
        else if (error.code === 'TIMEOUT') status = 'timeout';
        errorMsg = error.customMessage || error.code;
        this.setAccountState(job, account, 'failed', safeError(error.code, error.customMessage));
      } else {
        this.setAccountState(job, account, 'failed', safeError('INTERNAL'));
      }

      const failEngine = account.input ? (routeAccountEngine(account.input) === 'web_rpa' ? 'web_rpa' : 'imap') : 'imap';
      usageLogger.record({
        id: traceId,
        clientIp: job.clientIp || '127.0.0.1',
        region: job.region,
        emailAccount: email,
        provider,
        sourceMode: mode,
        status,
        statusDetail: errorMsg,
        hasCode: false,
        durationMs,
        messageCount: 0,
        tokenId: job.tokenId,
        token: job.token,
        engine: failEngine
      });
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
