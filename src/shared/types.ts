export const PROVIDER_IDS = [
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
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];
export type JobState = 'queued' | 'running' | 'cancelling' | 'completed' | 'failed' | 'cancelled';
export type AccountState =
  | 'pending'
  | 'authenticating'
  | 'connecting'
  | 'searching'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SafeErrorCode =
  | 'BAD_REQUEST'
  | 'UNSUPPORTED_PROVIDER'
  | 'AUTH_REQUIRED'
  | 'AUTH_DENIED'
  | 'AUTH_EXPIRED'
  | 'AUTH_FAILED'
  | 'MAILCOM_IMAP_DISABLED'
  | 'CONNECTION_FAILED'
  | 'TIMEOUT'
  | 'RATE_LIMITED'
  | 'NO_MATCH'
  | 'CANCELLED'
  | 'INTERNAL';

export interface AppPasswordAuthInput {
  type: 'app_password';
  secret: string;
}

export interface OAuthSessionAuthInput {
  type: 'oauth_session';
  sessionId: string;
}

export interface RefreshTokenAuthInput {
  type: 'refresh_token';
  refreshToken: string;
  clientId?: string;
}

export type AccountAuthInput = AppPasswordAuthInput | OAuthSessionAuthInput | RefreshTokenAuthInput;

export interface AccountInput {
  clientAccountId: string;
  email: string;
  provider: ProviderId;
  auth: AccountAuthInput;
  customHost?: string;
  customPort?: number;
  customProtocol?: 'imap' | 'pop3';
  customSecure?: boolean;
}

export interface CreateJobInput {
  accounts: AccountInput[];
  lookbackMinutes: number;
  maxMessagesPerAccount: number;
}

export interface CodeMatch {
  code: string;
  confidence: 'high' | 'medium' | 'low';
  score: number;
  receivedAt: string;
  subject?: string;
  from?: string;
  reason: string[];
}

export interface EmailItem {
  id: string;
  accountEmail: string;
  provider: ProviderId;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  textBody?: string;
  htmlBody?: string;
  codeMatch?: CodeMatch;
}

export interface AccountError {
  code: SafeErrorCode;
  message: string;
}

export interface AccountSnapshot {
  clientAccountId: string;
  email: string;
  provider: ProviderId;
  state: AccountState;
  customHost?: string;
  customPort?: number;
  customProtocol?: 'imap' | 'pop3';
  messages?: EmailItem[];
  result?: CodeMatch;
  error?: AccountError;
}

export interface JobSummary {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  matched: number;
  totalMessages: number;
}

export interface JobSnapshot {
  jobId: string;
  state: JobState;
  createdAt: string;
  updatedAt: string;
  accounts: AccountSnapshot[];
  summary: JobSummary;
}

export interface JobEvent {
  id: number;
  type: 'job.snapshot' | 'account.updated' | 'job.completed';
  data: JobSnapshot | AccountSnapshot | { jobId: string; state: JobState; summary: JobSummary };
}

