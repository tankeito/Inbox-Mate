import {
  AlertCircle,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardPaste,
  CloudOff,
  Copy,
  ExternalLink,
  FileText,
  Filter,
  Inbox,
  Info,
  KeyRound,
  Layers,
  LayoutGrid,
  List,
  LoaderCircle,
  LockKeyhole,
  Mail,
  Maximize2,
  Moon,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  Sun,
  Monitor,
  Trash2,
  UserCheck,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent, ReactNode } from 'react';

type Provider = 'gmx' | 'rambler' | 'microsoft' | 'mailru';
type CredentialType = 'appPassword' | 'oauth2';
type HealthState = 'checking' | 'ready' | 'offline';
type OauthState = 'not_started' | 'authorizing' | 'authorized' | 'denied' | 'expired' | 'consumed';
type ThemeMode = 'system' | 'light' | 'dark';

type AccountStatus =
  | 'draft'
  | 'queued'
  | 'connecting'
  | 'searching'
  | 'found'
  | 'no_code'
  | 'failed'
  | 'cancelled';

interface MailResult {
  code?: string;
  confidence?: 'high' | 'medium' | 'low';
  sender?: string;
  subject?: string;
  receivedAt?: string;
  score?: number;
  reason?: string[];
}

interface EmailItem {
  id: string;
  accountEmail: string;
  provider: Provider;
  subject: string;
  from: string;
  receivedAt: string;
  snippet: string;
  textBody?: string;
  htmlBody?: string;
  codeMatch?: MailResult;
}

interface Account {
  id: string;
  email: string;
  provider: Provider;
  credentialType: CredentialType;
  secret: string;
  oauthSessionId?: string;
  oauthState?: OauthState;
  refreshToken?: string;
  clientId?: string;
  status: AccountStatus;
  errorCode?: string;
  errorMessage?: string;
  result?: MailResult;
  messages?: EmailItem[];
}

interface AccountDraft {
  email: string;
  provider: Provider;
  secret: string;
  refreshToken?: string;
  clientId?: string;
}

interface ToastState {
  id: number;
  kind: 'success' | 'error' | 'info';
  message: string;
}

interface ApiAccountSnapshot {
  clientAccountId?: string;
  email?: string;
  provider?: Provider;
  state?: string;
  messages?: EmailItem[];
  result?: unknown;
  error?: { code?: unknown; message?: unknown };
}

interface ApiJobSnapshot {
  jobId?: string;
  state?: string;
  accounts?: ApiAccountSnapshot[];
}

const MAX_ACCOUNTS_LIMIT = 50;

const providerDetails: Record<Provider, { label: string; domain: string; authLabel: string; badgeColor: string }> = {
  microsoft: { label: 'Microsoft', domain: 'Outlook / Hotmail', authLabel: 'OAuth 2.0 授权', badgeColor: '#0ea5e9' },
  gmx: { label: 'GMX 邮箱', domain: 'GMX', authLabel: '密码', badgeColor: '#3b82f6' },
  rambler: { label: 'Rambler', domain: 'Rambler 邮箱', authLabel: '密码', badgeColor: '#8b5cf6' },
  mailru: { label: 'Mail.ru', domain: 'Mail.ru 邮箱', authLabel: '密码', badgeColor: '#005ff9' },
};

const providerDomains: Record<Provider, readonly string[]> = {
  microsoft: [
    'outlook.com',
    'hotmail.com',
    'live.com',
    'msn.com',
    'offilive.com',
    'outlook.de',
    'outlook.jp',
    'outlook.co.uk',
    'hotmail.co.uk',
    'hotmail.de',
  ],
  gmx: ['gmx.com', 'gmx.net', 'gmx.de', 'gmx.at', 'gmx.ch', 'gmx.fr', 'gmx.co.uk', 'gmx.us', 'gmx.info'],
  rambler: ['rambler.ru', 'myrambler.ru', 'ro.ru', 'lenta.ru', 'autorambler.ru'],
  mailru: ['mail.ru', 'inbox.ru', 'list.ru', 'bk.ru', 'internet.ru'],
};

const statusDetails: Record<
  AccountStatus,
  { label: string; tone: 'neutral' | 'working' | 'success' | 'warning' | 'danger' }
> = {
  draft: { label: '未执行', tone: 'neutral' },
  queued: { label: '排队中', tone: 'neutral' },
  connecting: { label: '正在连接', tone: 'working' },
  searching: { label: '正在读取', tone: 'working' },
  found: { label: '已完成', tone: 'success' },
  no_code: { label: '已完成', tone: 'success' },
  failed: { label: '需要处理', tone: 'danger' },
  cancelled: { label: '已取消', tone: 'warning' },
};

const defaultDraft: AccountDraft = {
  email: '',
  provider: 'microsoft',
  secret: '',
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

const isEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
const accountKey = (email: string) => email.trim().toLowerCase();

const providerForEmail = (email: string): Provider | undefined => {
  const domain = email.trim().toLowerCase().split('@')[1] ?? '';
  return (Object.keys(providerDomains) as Provider[]).find((provider) => providerDomains[provider].includes(domain));
};

const credentialForProvider = (provider: Provider): CredentialType =>
  provider === 'microsoft' ? 'oauth2' : 'appPassword';

function parseAccountLine(
  line: string,
): { email: string; secret?: string; refreshToken?: string; clientId?: string } | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const separators = ['----', '\t', '|'];
  for (const separator of separators) {
    if (trimmed.includes(separator)) {
      const parts = trimmed.split(separator).map((s) => s.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const email = parts[0];
        if (!isEmail(email)) return null;

        let secret = '';
        let refreshToken: string | undefined = undefined;
        let clientId: string | undefined = undefined;

        for (let i = 1; i < parts.length; i++) {
          const part = parts[i];
          if (part.startsWith('M.C') || part.length > 100) {
            refreshToken = part;
          } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
            clientId = part;
          } else if (i === 1) {
            secret = part;
          }
        }

        return { email, secret: secret || undefined, refreshToken, clientId };
      }
    }
  }

  const colonMatch = trimmed.match(/^([^\s:]+@[^\s:]+)\s*:\s*(.+)$/);
  if (colonMatch) {
    const email = colonMatch[1].trim();
    const rest = colonMatch[2].trim();
    const parts = rest.split(':').map((s) => s.trim()).filter(Boolean);

    let secret = parts[0] || '';
    let refreshToken: string | undefined = undefined;
    let clientId: string | undefined = undefined;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (part.startsWith('M.C') || part.length > 100) {
        refreshToken = part;
      } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(part)) {
        clientId = part;
      }
    }

    return { email, secret: secret || undefined, refreshToken, clientId };
  }

  return isEmail(trimmed) ? { email: trimmed } : null;
}

function parseSingleAccountInput(
  raw: string,
): { email: string; provider: Provider; secret: string; refreshToken?: string; clientId?: string } | null {
  const line = raw.trim();
  if (!line) return null;
  const parsed = parseAccountLine(line);
  if (!parsed || !isEmail(parsed.email)) {
    if (isEmail(line)) {
      const provider = providerForEmail(line) ?? 'gmx';
      return { email: line, provider, secret: '' };
    }
    return null;
  }
  const provider = providerForEmail(parsed.email) ?? 'gmx';
  return {
    email: parsed.email,
    provider,
    secret: parsed.secret ?? '',
    refreshToken: parsed.refreshToken,
    clientId: parsed.clientId,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function normalizeResult(value: unknown): MailResult | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const data = value as Record<string, unknown>;
  const confidence = stringValue(data.confidence)?.toLowerCase();
  return {
    code: stringValue(data.code),
    confidence: confidence === 'high' || confidence === 'medium' || confidence === 'low' ? confidence : undefined,
    sender: stringValue(data.from ?? data.sender),
    subject: stringValue(data.subject),
    receivedAt: stringValue(data.receivedAt ?? data.received_at),
  };
}

function statusFromSnapshot(snapshot: ApiAccountSnapshot): AccountStatus {
  const state = String(snapshot.state ?? '').toLowerCase();
  const result = normalizeResult(snapshot.result);
  const hasMessages = Array.isArray(snapshot.messages) && snapshot.messages.length > 0;
  const errorCode = stringValue(snapshot.error?.code)?.toUpperCase();

  if (state === 'cancelled' || errorCode === 'CANCELLED') return 'cancelled';
  if (state === 'failed') return 'failed';
  if (state === 'completed') {
    if (result?.code) return 'found';
    if (hasMessages) return 'no_code';
    return errorCode === 'NO_MATCH' || !errorCode ? 'no_code' : 'failed';
  }
  if (state === 'pending' || state === 'queued') return 'queued';
  if (state === 'authenticating' || state === 'connecting') return 'connecting';
  return 'searching';
}

function timestampLabel(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const elapsed = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.round(elapsed / 60_000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

function getErrorTag(code?: string): { label: string; tip: string } {
  switch (code) {
    case 'AUTH_FAILED':
    case 'AUTH_REQUIRED':
      return { label: '密码错误', tip: '应用专用密码无效或未开启 IMAP 服务' };
    case 'AUTH_DENIED':
      return { label: '授权拒绝', tip: 'Microsoft OAuth 授权被拒绝' };
    case 'AUTH_EXPIRED':
      return { label: '授权过期', tip: 'OAuth 会话已失效，请重新连接' };
    case 'CONNECTION_FAILED':
      return { label: '连接失败', tip: '无法连接到邮件服务器' };
    case 'TIMEOUT':
      return { label: '响应超时', tip: '邮件服务器连接超时' };
    case 'UNSUPPORTED_PROVIDER':
      return { label: '不支持的服务商', tip: '不支持该邮箱后缀' };
    default:
      return { label: '异常断开', tip: '请检查密码或网络后重试' };
  }
}

export function App() {
  const [health, setHealth] = useState<HealthState>('checking');
  const [pasteText, setPasteText] = useState('');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [draft, setDraft] = useState<AccountDraft>(defaultDraft);
  const [singleRawInput, setSingleRawInput] = useState('');
  const [queuePage, setQueuePage] = useState(1);

  // Left panel mode: single vs batch tab (Requirement 2: Default to single)
  const [addAccountTab, setAddAccountTab] = useState<'single' | 'batch'>('single');

  const [maxMessagesPerAccount, setMaxMessagesPerAccount] = useState(15);
  const [lookbackMinutes, setLookbackMinutes] = useState(0); // 0 = 不限时间
  const [jobId, setJobId] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Theme state (System / Light / Dark)
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => {
    return (localStorage.getItem('inbox_mate_theme') as ThemeMode) || 'system';
  });
  const [isThemeMenuOpen, setIsThemeMenuOpen] = useState(false);

  // Filters and views for email feed
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [accountFilter, setAccountFilter] = useState<string>('all');
  const [onlyCodeFilter, setOnlyCodeFilter] = useState<boolean>(false);
  const [feedViewMode, setFeedViewMode] = useState<'grid' | 'list'>('grid');
  const [activeMobileTab, setActiveMobileTab] = useState<'queue' | 'feed' | 'settings'>('feed');
  const [selectedMailModal, setSelectedMailModal] = useState<EmailItem | null>(null);
  const [editingSecretId, setEditingSecretId] = useState<string | null>(null);
  const [editSecretValue, setEditSecretValue] = useState('');

  // Feed Pagination State
  const [feedPage, setFeedPage] = useState(1);
  const [feedPageSize, setFeedPageSize] = useState(12);

  const csrfTokenRef = useRef<string | null>(null);
  const eventSourceRef = useRef<EventSource | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const oauthPollersRef = useRef(new Map<string, { interval: number; timeout: number }>());

  const isRunning = Boolean(jobId);

  // Search input Debounce (250ms) to prevent heavy recalculations during fast typing
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery);
    }, 250);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Dynamic Theme evaluation
  useEffect(() => {
    localStorage.setItem('inbox_mate_theme', themeMode);
    let resolvedTheme = themeMode;
    if (themeMode === 'system') {
      resolvedTheme = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
    }
    document.documentElement.setAttribute('data-theme', resolvedTheme);
  }, [themeMode]);

  // Reset feed page to 1 when filters or search change
  useEffect(() => {
    setFeedPage(1);
  }, [debouncedSearchQuery, accountFilter, onlyCodeFilter, feedPageSize]);

  // Stats calculation
  const stats = useMemo(() => {
    const totalAccounts = accounts.length;
    const activeAccounts = accounts.filter((account) => ['queued', 'connecting', 'searching'].includes(account.status)).length;
    const completedAccounts = accounts.filter((account) => ['found', 'no_code', 'failed', 'cancelled'].includes(account.status)).length;
    const failedAccounts = accounts.filter((account) => account.status === 'failed').length;

    let totalMails = 0;
    let codeMails = 0;
    const allMails: EmailItem[] = [];

    accounts.forEach((account) => {
      if (account.messages) {
        totalMails += account.messages.length;
        account.messages.forEach((msg) => {
          allMails.push(msg);
          if (msg.codeMatch?.code) codeMails += 1;
        });
      }
    });

    return {
      totalAccounts,
      activeAccounts,
      completedAccounts,
      failedAccounts,
      totalMails,
      codeMails,
      allMails,
    };
  }, [accounts]);

  const [feedGroupMode, setFeedGroupMode] = useState<'timeline' | 'grouped'>('timeline');

  // Filtered emails based on search & toggles
  const filteredEmails = useMemo(() => {
    return stats.allMails.filter((mail) => {
      if (onlyCodeFilter && !mail.codeMatch?.code) return false;
      if (accountFilter !== 'all' && mail.accountEmail.toLowerCase() !== accountFilter.toLowerCase()) return false;
      if (debouncedSearchQuery.trim()) {
        const q = debouncedSearchQuery.toLowerCase();
        const inSubject = mail.subject.toLowerCase().includes(q);
        const inFrom = mail.from.toLowerCase().includes(q);
        const inSnippet = mail.snippet.toLowerCase().includes(q);
        const inCode = mail.codeMatch?.code?.toLowerCase().includes(q);
        const inEmail = mail.accountEmail.toLowerCase().includes(q);
        return inSubject || inFrom || inSnippet || Boolean(inCode) || inEmail;
      }
      return true;
    });
  }, [stats.allMails, onlyCodeFilter, accountFilter, debouncedSearchQuery]);

  const groupedEmails = useMemo(() => {
    const map = new Map<string, EmailItem[]>();
    for (const mail of filteredEmails) {
      const list = map.get(mail.accountEmail) || [];
      list.push(mail);
      map.set(mail.accountEmail, list);
    }
    const result: Array<{ accountEmail: string; provider: Provider; emails: EmailItem[] }> = [];
    for (const [email, emails] of map.entries()) {
      const provider = emails[0]?.provider ?? 'gmx';
      result.push({ accountEmail: email, provider, emails });
    }
    return result;
  }, [filteredEmails]);

  // Feed Pagination Engine
  const totalFeedPages = useMemo(() => {
    if (feedPageSize === 0) return 1;
    return Math.max(1, Math.ceil(filteredEmails.length / feedPageSize));
  }, [filteredEmails.length, feedPageSize]);

  const currentFeedPage = Math.min(feedPage, totalFeedPages);

  const paginatedEmails = useMemo(() => {
    if (feedPageSize === 0) return filteredEmails;
    const start = (currentFeedPage - 1) * feedPageSize;
    return filteredEmails.slice(start, start + feedPageSize);
  }, [filteredEmails, currentFeedPage, feedPageSize]);

  const paginatedGroupedEmails = useMemo(() => {
    const pageMails =
      feedPageSize === 0
        ? filteredEmails
        : filteredEmails.slice((currentFeedPage - 1) * feedPageSize, currentFeedPage * feedPageSize);

    const map = new Map<string, EmailItem[]>();
    for (const mail of pageMails) {
      const list = map.get(mail.accountEmail) || [];
      list.push(mail);
      map.set(mail.accountEmail, list);
    }
    const result: Array<{ accountEmail: string; provider: Provider; emails: EmailItem[] }> = [];
    for (const [email, emails] of map.entries()) {
      const provider = emails[0]?.provider ?? 'gmx';
      result.push({ accountEmail: email, provider, emails });
    }
    return result;
  }, [filteredEmails, currentFeedPage, feedPageSize]);

  const QUEUE_PAGE_SIZE = 20;
  const totalQueuePages = Math.max(1, Math.ceil(accounts.length / QUEUE_PAGE_SIZE));
  const currentQueuePage = Math.min(queuePage, totalQueuePages);

  const paginatedAccounts = useMemo(() => {
    const start = (currentQueuePage - 1) * QUEUE_PAGE_SIZE;
    return accounts.slice(start, start + QUEUE_PAGE_SIZE);
  }, [accounts, currentQueuePage]);

  const notify = useCallback((kind: ToastState['kind'], message: string) => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ id: Date.now(), kind, message });
    toastTimerRef.current = window.setTimeout(() => setToast(null), 4_500);
  }, []);

  const closeEventStream = useCallback(() => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;
  }, []);

  const clearOauthPoller = useCallback((accountId: string) => {
    const poller = oauthPollersRef.current.get(accountId);
    if (!poller) return;
    window.clearInterval(poller.interval);
    window.clearTimeout(poller.timeout);
    oauthPollersRef.current.delete(accountId);
  }, []);

  const loadSession = useCallback(async () => {
    setHealth('checking');
    try {
      const response = await fetch('/api/v1/session', {
        cache: 'no-store',
        headers: { Accept: 'application/json' },
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const csrfToken = stringValue(body?.csrfToken);
      if (!response.ok || !csrfToken) throw new Error('session-unavailable');
      csrfTokenRef.current = csrfToken;
      setHealth('ready');
      return csrfToken;
    } catch {
      csrfTokenRef.current = null;
      setHealth('offline');
      throw new Error('session-unavailable');
    }
  }, []);

  const csrfToken = useCallback(async () => csrfTokenRef.current ?? loadSession(), [loadSession]);

  useEffect(() => {
    void loadSession().catch(() => undefined);
    return () => {
      closeEventStream();
      oauthPollersRef.current.forEach((poller) => {
        window.clearInterval(poller.interval);
        window.clearTimeout(poller.timeout);
      });
      oauthPollersRef.current.clear();
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, [closeEventStream, loadSession]);

  const importAccounts = () => {
    if (!pasteText.trim()) {
      notify('info', '请在输入框中粘贴邮箱数据');
      return;
    }

    let rejected = 0;
    let microsoftCount = 0;
    const known = new Set(accounts.map((account) => accountKey(account.email)));
    const parsed: Account[] = [];

    for (const line of pasteText.split(/\r?\n/)) {
      const entry = parseAccountLine(line);
      if (!entry) {
        if (line.trim() && !line.trim().startsWith('#')) rejected += 1;
        continue;
      }
      const provider = providerForEmail(entry.email);
      const key = accountKey(entry.email);
      if (
        !isEmail(entry.email) ||
        !provider ||
        known.has(key) ||
        accounts.length + parsed.length >= MAX_ACCOUNTS_LIMIT
      ) {
        rejected += 1;
        continue;
      }
      known.add(key);
      if (provider === 'microsoft') microsoftCount += 1;
      parsed.push({
        id: createId(),
        email: entry.email.trim(),
        provider,
        credentialType: credentialForProvider(provider),
        secret: entry.secret ?? '',
        refreshToken: entry.refreshToken,
        clientId: entry.clientId,
        oauthState: provider === 'microsoft' ? (entry.refreshToken ? 'authorized' : 'not_started') : undefined,
        status: 'draft',
      });
    }

    if (parsed.length === 0) {
      notify('error', '未解析出有效的全新邮箱格式');
      return;
    }

    setAccounts((current) => [...current, ...parsed]);
    setPasteText('');
    if (microsoftCount > 0) {
      notify('info', `成功导入 ${parsed.length} 个账号，其中包含 ${microsoftCount} 个 Microsoft 账户`);
    } else {
      notify('success', `成功添加 ${parsed.length} 个新账号至队列`);
    }
  };

  const addAccount = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsed = parseSingleAccountInput(singleRawInput) ?? (draft.email ? { email: draft.email.trim(), provider: draft.provider, secret: draft.secret.trim() } : null);
    if (!parsed || !isEmail(parsed.email)) {
      notify('error', '请粘贴或输入正确的邮箱格式 (例如: 账号----密码)');
      return;
    }
    if (accounts.length >= MAX_ACCOUNTS_LIMIT) {
      notify('info', `单次处理最多支持 ${MAX_ACCOUNTS_LIMIT} 个邮箱账户`);
      return;
    }
    if (parsed.provider !== 'microsoft' && !parsed.secret) {
      notify('error', '请填写该邮箱密码');
      return;
    }
    if (accounts.some((account) => accountKey(account.email) === accountKey(parsed.email))) {
      notify('info', '该邮箱已在队列中');
      return;
    }

    setAccounts((current) => [
      ...current,
      {
        id: createId(),
        email: parsed.email,
        provider: parsed.provider,
        credentialType: credentialForProvider(parsed.provider),
        secret: parsed.provider === 'microsoft' ? (parsed.secret || '') : parsed.secret,
        oauthState: parsed.provider === 'microsoft' ? 'not_started' : undefined,
        status: 'draft',
      },
    ]);
    setSingleRawInput('');
    setDraft(defaultDraft);
    notify('success', `已添加 ${parsed.email}`);
  };

  const removeAccount = (id: string) => {
    if (isRunning) return;
    clearOauthPoller(id);
    setAccounts((current) => current.filter((account) => account.id !== id));
  };

  const saveEditedSecret = (id: string, secretValue?: string) => {
    const valueToSave = (secretValue ?? editSecretValue).trim();
    if (!valueToSave) return;
    setAccounts((current) =>
      current.map((account) => (account.id === id ? { ...account, secret: valueToSave, status: 'draft', errorCode: undefined } : account)),
    );
    setEditingSecretId(null);
    setEditSecretValue('');
    notify('success', '密码已保存，可开始抓取');
  };

  const updateAccountProvider = (id: string, provider: Provider) => {
    if (isRunning) return;
    clearOauthPoller(id);
    setAccounts((current) =>
      current.map((account) =>
        account.id === id
          ? {
              ...account,
              provider,
              credentialType: credentialForProvider(provider),
              secret: '',
              oauthSessionId: undefined,
              oauthState: provider === 'microsoft' ? 'not_started' : undefined,
              status: 'draft',
              errorCode: undefined,
            }
          : account,
      ),
    );
  };

  const applyAccountSnapshot = useCallback((snapshot: ApiAccountSnapshot) => {
    const accountId = stringValue(snapshot.clientAccountId);
    if (!accountId) return;
    const result = normalizeResult(snapshot.result);
    const errorCode = stringValue(snapshot.error?.code)?.toUpperCase();
    const messages = Array.isArray(snapshot.messages) ? snapshot.messages : undefined;

    setAccounts((current) =>
      current.map((account) =>
        account.id === accountId
          ? {
              ...account,
              status: statusFromSnapshot(snapshot),
              result: result?.code || result?.subject || result?.sender ? result : account.result,
              messages: messages ?? account.messages,
              errorCode,
            }
          : account,
      ),
    );
  }, []);

  const applyJobSnapshot = useCallback(
    (snapshot: ApiJobSnapshot) => {
      if (!Array.isArray(snapshot.accounts)) return;
      snapshot.accounts.forEach(applyAccountSnapshot);
    },
    [applyAccountSnapshot],
  );

  const openEventStream = useCallback(
    (nextJobId: string) => {
      closeEventStream();
      const stream = new EventSource(`/api/v1/jobs/${encodeURIComponent(nextJobId)}/events`);
      eventSourceRef.current = stream;

      const parse = (event: MessageEvent<string>) => {
        try {
          const data = JSON.parse(event.data) as unknown;
          if (!data || typeof data !== 'object') return;
          if (event.type === 'job.snapshot') {
            applyJobSnapshot(data as ApiJobSnapshot);
          } else if (event.type === 'account.updated') {
            applyAccountSnapshot(data as ApiAccountSnapshot);
          } else if (event.type === 'job.completed') {
            closeEventStream();
            setJobId(null);
            setIsCancelling(false);
            const state = stringValue((data as ApiJobSnapshot).state)?.toLowerCase();
            notify(
              state === 'cancelled' ? 'info' : 'success',
              state === 'cancelled' ? '邮箱检查任务已取消' : '批量邮箱抓取完成！',
            );
          }
        } catch {
          // Ignore SSE glitch
        }
      };

      ['job.snapshot', 'account.updated', 'job.completed'].forEach((type) => stream.addEventListener(type, parse));
      stream.onerror = () => {
        if (stream.readyState === EventSource.CLOSED && eventSourceRef.current === stream) {
          closeEventStream();
          setJobId(null);
          setIsCancelling(false);
          notify('error', '本地服务连接在任务结束前中断');
        }
      };
    },
    [applyAccountSnapshot, applyJobSnapshot, closeEventStream, notify],
  );

  const pollMicrosoftStatus = useCallback(
    (accountId: string) => {
      clearOauthPoller(accountId);
      const poll = async () => {
        try {
          const response = await fetch(
            `/api/v1/oauth/microsoft/status?clientAccountId=${encodeURIComponent(accountId)}`,
            { cache: 'no-store', headers: { Accept: 'application/json' } },
          );
          const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
          const sessionId = stringValue(body?.sessionId);
          const status = stringValue(body?.status ?? body?.state)?.toLowerCase();
          if (response.ok && sessionId) {
            clearOauthPoller(accountId);
            setAccounts((current) =>
              current.map((account) =>
                account.id === accountId ? { ...account, oauthSessionId: sessionId, oauthState: 'authorized' } : account,
              ),
            );
            notify('success', 'Microsoft 邮箱授权成功');
          } else if (status === 'denied' || status === 'expired' || status === 'error') {
            clearOauthPoller(accountId);
            setAccounts((current) =>
              current.map((account) =>
                account.id === accountId
                  ? { ...account, oauthSessionId: undefined, oauthState: status === 'expired' ? 'expired' : 'denied' }
                  : account,
              ),
            );
            notify('error', status === 'expired' ? 'Microsoft 授权已过期' : 'Microsoft 授权失败');
          }
        } catch {
          // Ignore polling errors
        }
      };
      const interval = window.setInterval(() => void poll(), 2_000);
      const timeout = window.setTimeout(() => {
        clearOauthPoller(accountId);
        setAccounts((current) =>
          current.map((account) =>
            account.id === accountId && account.oauthState === 'authorizing'
              ? { ...account, oauthState: 'expired' }
              : account,
          ),
        );
        notify('error', 'Microsoft 授权响应超时');
      }, 10 * 60_000);
      oauthPollersRef.current.set(accountId, { interval, timeout });
      void poll();
    },
    [clearOauthPoller, notify],
  );

  const startMicrosoftOAuth = async (account: Account) => {
    if (isRunning) return;
    const popup = window.open('', 'inbox-mate-microsoft-oauth', 'popup=yes,width=560,height=720');
    setAccounts((current) =>
      current.map((item) => (item.id === account.id ? { ...item, oauthState: 'authorizing', oauthSessionId: undefined } : item)),
    );
    try {
      const token = await csrfToken();
      const response = await fetch('/api/v1/oauth/microsoft/start', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'X-Inbox-Mate-CSRF': token,
        },
        body: JSON.stringify({ clientAccountId: account.id, email: account.email }),
      });
      const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const authorizationUrl = stringValue(body?.authorizationUrl);
      if (!response.ok || !authorizationUrl) throw new Error('oauth-start-failed');

      if (popup) {
        popup.opener = null;
        popup.location.assign(authorizationUrl);
      } else {
        window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
      }
      pollMicrosoftStatus(account.id);
    } catch {
      popup?.close();
      setAccounts((current) =>
        current.map((item) => (item.id === account.id ? { ...item, oauthState: 'not_started' } : item)),
      );
      notify('error', '当前环境未配置 Microsoft OAuth App');
    }
  };

  const startJob = async () => {
    if (health !== 'ready') {
      notify('error', '本地 Backend 服务未准备就绪');
      return;
    }
    if (!accounts.length) {
      notify('info', '请先添加至少一个邮箱账户');
      return;
    }

    // Precise Password Validation
    const missingSecretAccount = accounts.find((acc) => acc.provider !== 'microsoft' && !acc.refreshToken && !acc.secret.trim());
    if (missingSecretAccount) {
      setEditingSecretId(missingSecretAccount.id);
      notify('error', `账户 ${missingSecretAccount.email} 尚未填写应用密码，请在队列卡片中填写`);
      return;
    }

    const missingOAuthAccount = accounts.find((acc) => acc.provider === 'microsoft' && !acc.oauthSessionId && !acc.refreshToken);
    if (missingOAuthAccount) {
      notify('error', `账户 ${missingOAuthAccount.email} 尚未完成 Microsoft 授权，请点击【连接】`);
      return;
    }

    setIsStarting(true);
    setAccounts((current) =>
      current.map((account) => ({
        ...account,
        status: 'queued',
        result: undefined,
        messages: undefined,
        errorCode: undefined,
      })),
    );
    try {
      const token = await loadSession();
      const response = await fetch('/api/v1/jobs', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'Cache-Control': 'no-store',
          'X-Inbox-Mate-CSRF': token,
        },
        body: JSON.stringify({
          accounts: accounts.map((account) => ({
            clientAccountId: account.id,
            email: account.email.trim(),
            provider: account.provider,
            auth:
              account.refreshToken
                ? { type: 'refresh_token', refreshToken: account.refreshToken, clientId: account.clientId }
                : account.provider === 'microsoft'
                  ? { type: 'oauth_session', sessionId: account.oauthSessionId }
                  : { type: 'app_password', secret: account.secret.trim() },
          })),
          lookbackMinutes,
          maxMessagesPerAccount,
        }),
      });
      const responseBody = (await response.json().catch(() => null)) as Record<string, unknown> | null;
      const nextJobId = stringValue(responseBody?.jobId);
      if (!response.ok || !nextJobId) {
        const errObj = responseBody?.error as Record<string, unknown> | undefined;
        const serverError = stringValue(errObj?.message) || stringValue(errObj?.code);
        throw new Error(serverError ? `服务报错: ${serverError}` : '无法启动邮件抓取任务');
      }

      setJobId(nextJobId);
      openEventStream(nextJobId);
      notify('success', `已启动 批量邮件读取 (${accounts.length} 个邮箱)`);
    } catch (err) {
      setAccounts((current) => current.map((account) => ({ ...account, status: 'draft' })));
      notify('error', err instanceof Error ? err.message : '无法启动邮件抓取任务');
    } finally {
      setIsStarting(false);
    }
  };

  const cancelJob = async () => {
    if (!jobId) return;
    setIsCancelling(true);
    try {
      const token = await csrfToken();
      const response = await fetch(`/api/v1/jobs/${encodeURIComponent(jobId)}`, {
        method: 'DELETE',
        cache: 'no-store',
        headers: { Accept: 'application/json', 'Cache-Control': 'no-store', 'X-Inbox-Mate-CSRF': token },
      });
      if (!response.ok) throw new Error('cancel-failed');
      notify('info', '正在发送终止请求...');
    } catch {
      setIsCancelling(false);
      notify('error', '取消任务失败');
    }
  };

  const copyCode = async (code: string) => {
    try {
      if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
        navigator.vibrate(50);
      }
      await navigator.clipboard.writeText(code);
      notify('success', `验证码 ${code} 已复制到剪贴板`);
    } catch {
      notify('error', '复制失败，浏览器拒绝权限');
    }
  };

  return (
    <div className="app-shell">
      {/* Top Bar Header */}
      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-icon">
            <Mail size={20} strokeWidth={2.4} />
          </div>
          <div>
            <div className="brand-title">
              <h1>Inbox Mate</h1>
              <span className="brand-badge">PRO</span>
            </div>
            <p className="brand-sub">专业级多账户邮件读取与检索工具</p>
          </div>
        </div>

        {/* Global Stats Board */}
        <div className="header-stats-board">
          <div className="stat-pill">
            <span className="stat-label">邮箱账户</span>
            <span className="stat-value">{stats.totalAccounts} / {MAX_ACCOUNTS_LIMIT}</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">已抓取邮件</span>
            <span className="stat-value highlight-cyan">{stats.totalMails} 封</span>
          </div>
          <div className="stat-pill">
            <span className="stat-label">包含验证码</span>
            <span className="stat-value highlight-emerald">{stats.codeMails} 个</span>
          </div>
        </div>

        <div className="topbar-actions">
          {/* Theme Switcher Menu */}
          <div className="theme-menu-wrap">
            <button
              className="theme-trigger-btn"
              type="button"
              onClick={() => setIsThemeMenuOpen(!isThemeMenuOpen)}
              title="切换主题模式"
            >
              {themeMode === 'light' ? (
                <Sun size={15} className="text-amber" />
              ) : themeMode === 'dark' ? (
                <Moon size={15} className="text-cyan" />
              ) : (
                <Monitor size={15} />
              )}
              {themeMode !== 'system' && <span>{themeMode === 'light' ? '亮色' : '暗色'}</span>}
              <ChevronDown size={12} />
            </button>

            {isThemeMenuOpen && (
              <div className="theme-dropdown-menu" onClick={() => setIsThemeMenuOpen(false)}>
                <button
                  type="button"
                  className={`theme-option-btn ${themeMode === 'system' ? 'active' : ''}`}
                  onClick={() => setThemeMode('system')}
                >
                  <Monitor size={14} />
                  <span>跟随系统</span>
                </button>
                <button
                  type="button"
                  className={`theme-option-btn ${themeMode === 'light' ? 'active' : ''}`}
                  onClick={() => setThemeMode('light')}
                >
                  <Sun size={14} />
                  <span>亮色模式</span>
                </button>
                <button
                  type="button"
                  className={`theme-option-btn ${themeMode === 'dark' ? 'active' : ''}`}
                  onClick={() => setThemeMode('dark')}
                >
                  <Moon size={14} />
                  <span>暗色模式</span>
                </button>
              </div>
            )}
          </div>

          <HealthIndicator health={health} onRefresh={() => void loadSession().catch(() => undefined)} />
          <div className="local-boundary-tag">
            <LockKeyhole size={14} />
            <span>纯本地内存沙盒</span>
          </div>
        </div>
      </header>

      {/* Mobile Tab Switcher */}
      <nav className="mobile-tab-bar" aria-label="移动端视图导航">
        <button
          type="button"
          className={`mobile-tab-btn ${activeMobileTab === 'feed' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('feed')}
        >
          <Inbox size={15} />
          <span>邮件流 ({filteredEmails.length})</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeMobileTab === 'queue' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('queue')}
        >
          <UserCheck size={15} />
          <span>邮箱队列 ({accounts.length})</span>
        </button>
        <button
          type="button"
          className={`mobile-tab-btn ${activeMobileTab === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveMobileTab('settings')}
        >
          <Filter size={15} />
          <span>检索设置</span>
        </button>
      </nav>

      {/* Main Workspace Layout */}
      <main className={`workspace active-mobile-${activeMobileTab}`}>
        {/* Left Sidebar Panel */}
        <aside className="sidebar-column">
          {/* Requirement 2: Combined Add Account Card with Tab Switcher (Single vs Batch) */}
          <div className="surface-card add-account-card">
            {/* Card Header with Tabs */}
            <div className="add-tab-header">
              <div className="add-tabs-wrap">
                <button
                  type="button"
                  className={`add-tab-btn ${addAccountTab === 'single' ? 'active' : ''}`}
                  onClick={() => setAddAccountTab('single')}
                >
                  <KeyRound size={13} />
                  <span>单账号添加</span>
                </button>
                <button
                  type="button"
                  className={`add-tab-btn ${addAccountTab === 'batch' ? 'active' : ''}`}
                  onClick={() => setAddAccountTab('batch')}
                >
                  <ClipboardPaste size={13} />
                  <span>批量导入</span>
                </button>
              </div>

              {/* Stylish Capacity Badge */}
              <span className="import-capacity-tag">
                <Sparkles size={11} className="text-amber" />
                <span>支持 40+ 账号并发导入</span>
              </span>
            </div>

            {/* Tab 1: Single Account Form (Default) */}
            {addAccountTab === 'single' ? (
              <form onSubmit={addAccount} className="tab-form-content">
                <div className="form-field full-width">
                  <label htmlFor="input-single-raw">粘贴或输入账号信息 (邮箱地址----应用密码)</label>
                  <input
                    id="input-single-raw"
                    value={singleRawInput}
                    onChange={(event) => {
                      const val = event.target.value;
                      setSingleRawInput(val);
                      const parsed = parseSingleAccountInput(val);
                      if (parsed) {
                        setDraft({ email: parsed.email, provider: parsed.provider, secret: parsed.secret });
                      }
                    }}
                    type="text"
                    autoComplete="off"
                    placeholder="邮箱地址----应用密码"
                    disabled={isRunning}
                  />
                </div>

                {draft.email && (
                  <div className="auto-parsed-preview-bar">
                    <span className="parsed-label">智能识别:</span>
                    <span className="parsed-email">{draft.email}</span>
                    <span className={`provider-pill provider-${draft.provider}`}>
                      {providerDetails[draft.provider].label}
                    </span>
                  </div>
                )}

                <button className="btn btn-emerald full-width mt-1" type="submit" disabled={isRunning || !singleRawInput.trim()}>
                  <Plus size={15} />
                  <span>加入账号队列</span>
                </button>

                {/* Format Guide Box with All Supported Providers & Formats */}
                <div className="format-guide-box">
                  <div className="format-guide-title">
                    <FileText size={13} />
                    <span>支持邮箱及导入格式说明：</span>
                  </div>
                  
                  <div className="format-item-group">
                    <div className="format-group-title">
                      <span className="fmt-provider-tag tag-microsoft">1. Microsoft 阵列</span>
                      <span className="fmt-domain-list">(Outlook / Hotmail / Offilive / Live / MSN)</span>
                    </div>
                    <div className="format-item">
                      <span className="fmt-desc">4段式 Graph 刷新令牌 (免登录推荐):</span>
                      <code>邮箱----密码----客户端ID----刷新令牌</code>
                    </div>
                    <div className="format-item">
                      <span className="fmt-desc">在线一键授权:</span>
                      <code>name@outlook.com</code>
                    </div>
                  </div>

                  <div className="format-item-group">
                    <div className="format-group-title">
                      <span className="fmt-provider-tag tag-mailru">2. Mail.ru 邮箱</span>
                      <span className="fmt-domain-list">(Mail.ru / Inbox.ru / List.ru / Bk.ru)</span>
                    </div>
                    <div className="format-item">
                      <code>name@mail.ru----外置应用专用密码</code>
                    </div>
                  </div>

                  <div className="format-item-group">
                    <div className="format-group-title">
                      <span className="fmt-provider-tag tag-gmx">3. GMX 邮箱</span>
                      <span className="fmt-domain-list">(GMX.com / GMX.net / GMX.de)</span>
                    </div>
                    <div className="format-item">
                      <code>name@gmx.com----密码</code>
                    </div>
                  </div>

                  <div className="format-item-group">
                    <div className="format-group-title">
                      <span className="fmt-provider-tag tag-rambler">4. Rambler 邮箱</span>
                      <span className="fmt-domain-list">(Rambler.ru / Lenta.ru / Ro.ru)</span>
                    </div>
                    <div className="format-item">
                      <code>name@rambler.ru----密码</code>
                    </div>
                  </div>
                </div>
              </form>
            ) : (
              /* Tab 2: Batch Import Form (Taller Textarea Height) */
              <div className="tab-form-content">
                <textarea
                  className="batch-textarea batch-textarea-tall"
                  value={pasteText}
                  onChange={(event) => setPasteText(event.target.value)}
                  placeholder={`# 【批量导入统一格式说明 - 每行一个账号】

# 1. 微软 / Outlook / Hotmail / Offilive (4段式 Graph 刷新令牌免登录抓取推荐)
邮箱----密码----客户端ID----刷新令牌

# 2. 微软 / Outlook / Hotmail / Offilive (在线 OAuth 一键授权)
name@outlook.com
name@hotmail.com

# 3. Mail.ru 邮箱 (使用外置应用专用密码)
name@mail.ru----外置应用专用密码

# 4. GMX 邮箱 (使用账号密码)
name@gmx.com----密码

# 5. Rambler 邮箱 (使用账号密码)
name@rambler.ru----密码`}
                  spellCheck={false}
                  autoComplete="off"
                  disabled={isRunning}
                />
                <div className="card-footer mt-1">
                  <span className="security-subtext">
                    <LockKeyhole size={12} />
                    <span>凭据不落盘，关闭页面即清空</span>
                  </span>
                  <div className="action-row">
                    {pasteText && (
                      <button
                        className="icon-btn"
                        type="button"
                        onClick={() => setPasteText('')}
                        disabled={isRunning}
                        title="清空"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <button
                      className="btn btn-secondary btn-sm"
                      type="button"
                      onClick={importAccounts}
                      disabled={isRunning || !pasteText.trim()}
                    >
                      <Plus size={14} />
                      <span>导入至队列</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Account Queue Management List (Expanded Height & Pinned Layout) */}
          <div className="surface-card account-queue-card">
            <div className="card-header border-b">
              <div className="card-title">
                <UserCheck size={15} className="text-cyan" />
                <span>账号队列 ({accounts.length})</span>
              </div>
              {accounts.length > 0 && (
                <div className="queue-header-actions">
                  {totalQueuePages > 1 && (
                    <div className="queue-pagination-ctrls">
                      <span className="queue-page-text">{currentQueuePage}/{totalQueuePages}页</span>
                      <button
                        type="button"
                        className="queue-page-btn"
                        onClick={() => setQueuePage((p) => Math.max(1, p - 1))}
                        disabled={currentQueuePage <= 1}
                        title="上一页"
                      >
                        <ChevronLeft size={11} />
                      </button>
                      <button
                        type="button"
                        className="queue-page-btn"
                        onClick={() => setQueuePage((p) => Math.min(totalQueuePages, p + 1))}
                        disabled={currentQueuePage >= totalQueuePages}
                        title="下一页"
                      >
                        <ChevronRight size={11} />
                      </button>
                    </div>
                  )}
                  {!isRunning && (
                    <button
                      className="btn btn-xs btn-outline-danger"
                      type="button"
                      onClick={() => { setAccounts([]); setQueuePage(1); }}
                      title="清空队列中的所有账号"
                    >
                      <Trash2 size={11} />
                      <span>清空全部</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="queue-scroll-container">
              {paginatedAccounts.length > 0 ? (
                paginatedAccounts.map((account) => (
                  <AccountQueueCard
                    key={account.id}
                    account={account}
                    disabled={isRunning}
                    isEditingSecret={editingSecretId === account.id}
                    editSecretValue={editSecretValue}
                    onStartEditSecret={(val) => {
                      setEditingSecretId(account.id);
                      setEditSecretValue(val);
                    }}
                    onCancelEditSecret={() => setEditingSecretId(null)}
                    onSaveEditSecret={(val) => saveEditedSecret(account.id, val)}
                    onEditSecretChange={setEditSecretValue}
                    onRemove={() => removeAccount(account.id)}
                    onProviderChange={(p) => updateAccountProvider(account.id, p)}
                    onConnect={() => void startMicrosoftOAuth(account)}
                  />
                ))
              ) : (
                <div className="empty-state">
                  <Mail size={22} className="text-muted" />
                  <p>队列为空，请在上方添加或批量粘贴邮箱账户</p>
                </div>
              )}
            </div>
          </div>

          {/* Execution Controls & Settings */}
          <div className="surface-card run-settings-card">
            <div className="card-header">
              <div className="card-title">
                <Sparkles size={15} className="text-amber" />
                <span>检索任务配置</span>
              </div>
            </div>
            <div className="settings-inputs-grid">
              <div className="form-field">
                <label>单账号最多抓取</label>
                <NumberField
                  value={maxMessagesPerAccount}
                  min={1}
                  max={20}
                  suffix="封"
                  onChange={setMaxMessagesPerAccount}
                  disabled={isRunning}
                />
              </div>
              <div className="form-field">
                <label>检索时间范围</label>
                <SelectField
                  value={String(lookbackMinutes)}
                  onChange={(val) => setLookbackMinutes(Number(val))}
                  disabled={isRunning}
                  ariaLabel="时间范围"
                >
                  <option value="0">不限时间 (全部)</option>
                  <option value="30">最近 30 分钟</option>
                  <option value="60">最近 1 小时</option>
                  <option value="1440">最近 24 小时</option>
                  <option value="10080">最近 7 天</option>
                  <option value="43200">最近 30 天</option>
                </SelectField>
              </div>
            </div>

            {isRunning ? (
              <button
                className="btn btn-danger full-width btn-lg mt-2"
                type="button"
                onClick={() => void cancelJob()}
                disabled={isCancelling}
              >
                {isCancelling ? <LoaderCircle className="spin" size={16} /> : <Square size={14} fill="currentColor" />}
                <span>{isCancelling ? '正在中止任务...' : '中止当前检查'}</span>
              </button>
            ) : (
              <button
                className="btn btn-primary full-width btn-lg mt-2"
                type="button"
                onClick={() => void startJob()}
                disabled={isStarting || !accounts.length || health !== 'ready'}
              >
                {isStarting ? <LoaderCircle className="spin" size={16} /> : <Search size={16} />}
                <span>{isStarting ? '正在初始化...' : `开始并发抓取 (${accounts.length} 账号)`}</span>
              </button>
            )}
          </div>
        </aside>

        {/* Right Main Feed & Content Reader Workspace */}
        <section className="main-feed-column">
          {/* Feed Filter & Toolbar */}
          <div className="feed-toolbar">
            <div className="search-bar-wrap">
              <Search size={16} className="search-icon" />
              <input
                className="search-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="搜索邮件主题、发件人、正文关键字或验证码..."
              />
              {searchQuery && (
                <button type="button" className="clear-search-btn" onClick={() => setSearchQuery('')}>
                  <X size={14} />
                </button>
              )}
            </div>

            <div className="toolbar-controls">
              {/* Account Dropdown Filter */}
              <div className="filter-select-wrap">
                <Filter size={14} />
                <select value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value="all">全部账户 ({accounts.length})</option>
                  {accounts.map((acc) => (
                    <option key={acc.id} value={acc.email}>
                      {acc.email} ({acc.messages?.length ?? 0} 封)
                    </option>
                  ))}
                </select>
                <ChevronDown size={14} />
              </div>

              {/* Mobile Toolbar Bottom Actions */}
              <div className="toolbar-bottom-actions">
                <label className="toggle-chip">
                  <input
                    type="checkbox"
                    checked={onlyCodeFilter}
                    onChange={(e) => setOnlyCodeFilter(e.target.checked)}
                  />
                  <span className="toggle-slider"></span>
                  <span className="toggle-label">仅验证码</span>
                </label>

                <div className="group-mode-toggle-pill">
                  <button
                    type="button"
                    className={`mode-btn ${feedGroupMode === 'timeline' ? 'active' : ''}`}
                    onClick={() => setFeedGroupMode('timeline')}
                    title="平铺时间流"
                  >
                    <span>平铺流</span>
                  </button>
                  <button
                    type="button"
                    className={`mode-btn ${feedGroupMode === 'grouped' ? 'active' : ''}`}
                    onClick={() => setFeedGroupMode('grouped')}
                    title="按邮箱分组"
                  >
                    <Layers size={13} />
                    <span>按邮箱分组</span>
                  </button>
                </div>

                <div className="view-mode-toggle">
                  <button
                    type="button"
                    className={`view-btn ${feedViewMode === 'grid' ? 'active' : ''}`}
                    onClick={() => setFeedViewMode('grid')}
                    title="网格视图"
                  >
                    <LayoutGrid size={15} />
                  </button>
                  <button
                    type="button"
                    className={`view-btn ${feedViewMode === 'list' ? 'active' : ''}`}
                    onClick={() => setFeedViewMode('list')}
                    title="列表视图"
                  >
                    <List size={15} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Email Cards Feed Grid */}
          <div className={`feed-scroll-container view-${feedViewMode} display-${feedGroupMode}`}>
            {filteredEmails.length > 0 ? (
              feedGroupMode === 'grouped' ? (
                paginatedGroupedEmails.map((group) => (
                  <AccountGroupCard
                    key={group.accountEmail}
                    accountEmail={group.accountEmail}
                    provider={group.provider}
                    emails={group.emails}
                    viewMode={feedViewMode}
                    onOpenModal={(mail) => setSelectedMailModal(mail)}
                    onCopyCode={(code) => void copyCode(code)}
                  />
                ))
              ) : (
                paginatedEmails.map((mail) => (
                  <EmailCard
                    key={mail.id}
                    email={mail}
                    onOpenModal={() => setSelectedMailModal(mail)}
                    onCopyCode={(code) => void copyCode(code)}
                  />
                ))
              )
            ) : (
              <div className="feed-empty-state">
                <Inbox size={48} className="empty-icon text-muted" />
                <h3>{isRunning ? '正在连接各邮箱拉取邮件...' : '暂无符合条件的邮件'}</h3>
                <p>
                  {isRunning
                    ? '后端服务正通过 IMAP 并发搜索 INBOX 最近邮件，抓取结果将实时推送到此处'
                    : '在左侧点击【开始并发抓取】，或者修改顶部的搜索过滤条件'}
                </p>
              </div>
            )}
          </div>

          {/* Bottom Pagination Control Bar */}
          <FeedPaginationBar
            currentPage={currentFeedPage}
            totalPages={totalFeedPages}
            pageSize={feedPageSize}
            totalItems={filteredEmails.length}
            onPageChange={setFeedPage}
            onPageSizeChange={setFeedPageSize}
          />
        </section>
      </main>

      {/* Global Responsive App Footer (PC & Mobile) */}
      <AppFooter
        stats={stats}
        health={health}
        onClearCache={() => {
          if (isRunning) {
            notify('error', '当前正在并发抓取邮件，请先停止任务');
            return;
          }
          setAccounts([]);
          notify('info', '已成功清空本地内存中的所有托管账户与历史数据');
        }}
      />

      {/* Email Reader Modal */}
      {selectedMailModal && (
        <EmailReaderModal
          email={selectedMailModal}
          onClose={() => setSelectedMailModal(null)}
          onCopyCode={(code) => void copyCode(code)}
        />
      )}

      {/* Toast Notification Banner */}
      {toast && (
        <div className={`toast-banner toast-${toast.kind}`} role="status">
          {toast.kind === 'success' ? (
            <CheckCircle2 size={18} />
          ) : toast.kind === 'error' ? (
            <AlertCircle size={18} />
          ) : (
            <ShieldCheck size={18} />
          )}
          <span>{toast.message}</span>
          <button className="toast-close-btn" type="button" onClick={() => setToast(null)}>
            <X size={15} />
          </button>
        </div>
      )}
    </div>
  );
}

function HealthIndicator({ health, onRefresh }: { health: HealthState; onRefresh: () => void }) {
  const content: Record<HealthState, { label: string; icon: ReactNode; colorClass: string }> = {
    checking: { label: '连接服务中...', icon: <LoaderCircle className="spin" size={13} />, colorClass: 'text-amber' },
    ready: { label: 'Backend 在线', icon: <CheckCircle2 size={13} />, colorClass: 'text-emerald' },
    offline: { label: '服务不可用', icon: <CloudOff size={13} />, colorClass: 'text-danger' },
  };
  const current = content[health];
  return (
    <div className="health-badge">
      <span className={`health-icon ${current.colorClass}`}>{current.icon}</span>
      <span>{current.label}</span>
      <button className="icon-btn health-refresh-btn" type="button" onClick={onRefresh} title="刷新连接状态">
        <RefreshCw size={12} />
      </button>
    </div>
  );
}

function SelectField({
  value,
  onChange,
  children,
  disabled,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  disabled?: boolean;
  ariaLabel: string;
}) {
  return (
    <span className="select-wrap">
      <select value={value} onChange={(event) => onChange(event.target.value)} disabled={disabled} aria-label={ariaLabel}>
        {children}
      </select>
      <ChevronDown size={13} className="select-arrow" />
    </span>
  );
}

function NumberField({
  value,
  min,
  max,
  suffix,
  onChange,
  disabled,
}: {
  value: number;
  min: number;
  max: number;
  suffix?: string;
  onChange: (value: number) => void;
  disabled?: boolean;
}) {
  return (
    <span className="number-wrap">
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        onChange={(event) => {
          const next = Number(event.target.value);
          if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, next)));
        }}
        disabled={disabled}
      />
      {suffix && <span className="number-suffix">{suffix}</span>}
    </span>
  );
}

function AccountQueueCard({
  account,
  disabled,
  isEditingSecret,
  editSecretValue,
  onStartEditSecret,
  onCancelEditSecret,
  onSaveEditSecret,
  onEditSecretChange,
  onRemove,
  onProviderChange,
  onConnect,
}: {
  account: Account;
  disabled: boolean;
  isEditingSecret: boolean;
  editSecretValue: string;
  onStartEditSecret: (val: string) => void;
  onCancelEditSecret: () => void;
  onSaveEditSecret: (val?: string) => void;
  onEditSecretChange: (val: string) => void;
  onRemove: () => void;
  onProviderChange: (p: Provider) => void;
  onConnect: () => void;
}) {
  const detail = statusDetails[account.status];
  const isError = account.status === 'failed';
  const errorInfo = isError ? getErrorTag(account.errorCode) : null;
  const isMicrosoft = account.provider === 'microsoft';
  const hasRefreshToken = Boolean(account.refreshToken);
  const isSecretMissing = !isMicrosoft && !hasRefreshToken && !account.secret.trim();

  return (
    <div className={`queue-card status-tone-${detail.tone}`}>
      <div className="queue-card-main">
        <div className="queue-account-info">
          <span className="provider-indicator" style={{ backgroundColor: providerDetails[account.provider].badgeColor }}>
            {account.provider.slice(0, 1).toUpperCase()}
          </span>
          <div className="email-meta">
            <span className="email-text" title={account.email}>
              {account.email}
            </span>
            <span className="messages-count">
              {account.messages
                ? `${account.messages.length} 封邮件`
                : hasRefreshToken
                  ? 'Graph API 刷新令牌'
                  : providerDetails[account.provider].domain}
            </span>
          </div>
        </div>

        <div className="queue-card-actions">
          {hasRefreshToken ? (
            <span className="graph-token-tag" title="微软 Refresh Token (Graph API)">
              [Graph 令牌]
            </span>
          ) : isSecretMissing ? (
            <span className="missing-secret-tag">[未设置密码]</span>
          ) : null}
          <StatusChip status={account.status} />
          {!disabled && (
            <button className="icon-btn remove-btn" type="button" onClick={onRemove} title="从队列删除">
              <Trash2 size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Error state alert bar with retry/edit button */}
      {isError && (
        <div className="queue-card-error-bar">
          <div className="error-tag-wrap" title={errorInfo?.tip}>
            <AlertCircle size={13} />
            <span className="error-tag-label">[{errorInfo?.label}]</span>
            <span className="error-tag-tip">{errorInfo?.tip}</span>
          </div>
          {!isMicrosoft && (
            <button
              className="btn btn-xs btn-outline-danger"
              type="button"
              onClick={() => onStartEditSecret(account.secret)}
            >
              <RotateCcw size={11} />
              <span>设置密码</span>
            </button>
          )}
        </div>
      )}

      {/* Inline Editing Password Drawer */}
      {(isEditingSecret || isSecretMissing) && !isMicrosoft && (
        <div className="edit-secret-box">
          <input
            type="password"
            className="edit-secret-input"
            value={isEditingSecret ? editSecretValue : account.secret}
            onChange={(e) => {
              if (isEditingSecret) onEditSecretChange(e.target.value);
              else onSaveEditSecret(e.target.value);
            }}
            placeholder="输入应用专用密码"
            autoFocus={isEditingSecret}
          />
          {isEditingSecret && (
            <div className="edit-secret-actions">
              <button className="btn btn-xs btn-emerald" type="button" onClick={() => onSaveEditSecret()}>
                保存
              </button>
              <button className="btn btn-xs btn-secondary" type="button" onClick={onCancelEditSecret}>
                取消
              </button>
            </div>
          )}
        </div>
      )}

      {/* OAuth Button */}
      {isMicrosoft && (
        <div className="queue-card-sub">
          <button
            className={`btn btn-xs oauth-btn oauth-state-${account.oauthState ?? 'not_started'}`}
            type="button"
            onClick={onConnect}
            disabled={disabled || account.oauthState === 'authorizing' || account.oauthState === 'consumed'}
          >
            {account.oauthState === 'authorizing' ? (
              <LoaderCircle className="spin" size={12} />
            ) : account.oauthState === 'authorized' ? (
              <Check size={12} />
            ) : (
              <ExternalLink size={12} />
            )}
            <span>
              {account.oauthState === 'authorized'
                ? 'OAuth 已就绪'
                : account.oauthState === 'authorizing'
                ? '等待浏览器授权...'
                : '连接 Microsoft 账户'}
            </span>
          </button>
        </div>
      )}
    </div>
  );
}

function StatusChip({ status }: { status: AccountStatus }) {
  const detail = statusDetails[status];
  return (
    <span className={`status-badge tone-${detail.tone}`}>
      {detail.tone === 'working' && <LoaderCircle className="spin" size={11} />}
      <span>{detail.label}</span>
    </span>
  );
}

function AccountGroupCard({
  accountEmail,
  provider,
  emails,
  viewMode,
  onOpenModal,
  onCopyCode,
}: {
  accountEmail: string;
  provider: Provider;
  emails: EmailItem[];
  viewMode: 'grid' | 'list';
  onOpenModal: (mail: EmailItem) => void;
  onCopyCode: (code: string) => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const providerInfo = providerDetails[provider];
  const primaryCode = emails.find(
    (item) => item.codeMatch?.code && item.codeMatch?.confidence !== 'low'
  )?.codeMatch;

  return (
    <div className="account-group-container">
      <div className="account-group-header" onClick={() => setCollapsed(!collapsed)}>
        <div className="group-header-left">
          <button className="group-collapse-btn" type="button">
            <ChevronDown size={16} className={`collapse-arrow ${collapsed ? 'collapsed' : ''}`} />
          </button>
          <span className="group-account-email">{accountEmail}</span>
          <span className={`provider-pill provider-${provider}`}>{providerInfo.label}</span>
          <span className="group-count-badge">{emails.length} 封邮件</span>
        </div>
        <div className="group-header-right">
          {primaryCode && (
            <div
              className="group-code-pill"
              onClick={(e) => {
                e.stopPropagation();
                if (primaryCode?.code) onCopyCode(primaryCode.code);
              }}
              title="点击复制该邮箱最新验证码"
            >
              <Sparkles size={12} />
              <span>验证码: <strong>{primaryCode.code}</strong></span>
              <Copy size={12} />
            </div>
          )}
        </div>
      </div>

      {!collapsed && (
        <div className={`group-emails-wrapper view-${viewMode}`}>
          {emails.map((mail) => (
            <EmailCard
              key={mail.id}
              email={mail}
              onOpenModal={() => onOpenModal(mail)}
              onCopyCode={onCopyCode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function EmailCard({
  email,
  onOpenModal,
  onCopyCode,
}: {
  email: EmailItem;
  onOpenModal: () => void;
  onCopyCode: (code: string) => void;
}) {
  const hasCode = Boolean(email.codeMatch?.code && email.codeMatch?.confidence !== 'low');

  return (
    <article className={`email-card ${hasCode ? 'has-code' : ''}`}>
      <div className="card-topline">
        <div className="account-tag">
          <Mail size={12} />
          <span>{email.accountEmail}</span>
        </div>
        <span className="received-time">{timestampLabel(email.receivedAt)}</span>
      </div>

      <div className="email-header">
        <h4 className="email-subject" title={email.subject}>
          {email.subject}
        </h4>
        <p className="email-sender">来自: {email.from}</p>
      </div>

      {/* Verification Code Box */}
      {hasCode && (
        <div className="verification-code-box">
          <div className="code-info">
            <span className="code-label">验证码</span>
            <span className="code-digits">{email.codeMatch?.code}</span>
          </div>
          <button
            className="btn btn-copy-code"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              if (email.codeMatch?.code) onCopyCode(email.codeMatch.code);
            }}
          >
            <Copy size={14} />
            <span>一键复制</span>
          </button>
        </div>
      )}

      {/* Email Body Snippet Preview */}
      <p className="email-snippet">{email.snippet}</p>

      <div className="email-card-footer">
        <button className="btn-read-more" type="button" onClick={onOpenModal}>
          <Maximize2 size={12} />
          <span>查看完整正文</span>
        </button>
        {email.codeMatch?.confidence && (
          <span className={`confidence-chip confidence-${email.codeMatch.confidence}`}>
            置信度: {email.codeMatch.confidence === 'high' ? '高' : email.codeMatch.confidence === 'medium' ? '中' : '低'}
          </span>
        )}
      </div>
    </article>
  );
}

function EmailReaderModal({
  email,
  onClose,
  onCopyCode,
}: {
  email: EmailItem;
  onClose: () => void;
  onCopyCode: (code: string) => void;
}) {
  const [viewTab, setViewTab] = useState<'html' | 'text'>(email.htmlBody ? 'html' : 'text');
  const [copied, setCopied] = useState(false);
  const hasCode = Boolean(email.codeMatch?.code);
  const isHighConfidence = email.codeMatch?.confidence === 'high' || email.codeMatch?.confidence === 'medium';
  const providerLabel = providerDetails[email.provider]?.label ?? email.provider;

  const handleCopy = () => {
    if (email.codeMatch?.code) {
      onCopyCode(email.codeMatch.code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container saas-detail-modal" onClick={(e) => e.stopPropagation()}>
        {/* Header Bar */}
        <div className="modal-header-bar">
          <div className="header-meta-left">
            <span className={`provider-pill provider-${email.provider}`}>
              {providerLabel}
            </span>
            <span className="account-tag-pill">
              <Mail size={12} />
              <span>{email.accountEmail}</span>
            </span>
          </div>
          <button className="icon-btn modal-close-btn" type="button" onClick={onClose} title="关闭 (Esc)">
            <X size={18} />
          </button>
        </div>

        {/* Subject & Hero Meta */}
        <div className="modal-hero-meta">
          <h2 className="modal-subject-title">{email.subject}</h2>
          <div className="modal-sender-row">
            <div className="sender-avatar">
              {(email.from[0] || 'M').toUpperCase()}
            </div>
            <div className="sender-info">
              <span className="sender-name">{email.from}</span>
              <span className="receiver-target">至 {email.accountEmail}</span>
            </div>
            <span className="modal-timestamp">{timestampLabel(email.receivedAt)} ({email.receivedAt})</span>
          </div>
        </div>

        {/* OTP Code Hero Banner */}
        {hasCode && (
          <div className={`modal-code-hero ${isHighConfidence ? 'confidence-hero-emerald' : 'confidence-hero-neutral'}`}>
            <div className="code-hero-content">
              <div className="code-hero-badge">
                {isHighConfidence ? <Sparkles size={14} /> : <Info size={14} />}
                <span>
                  {isHighConfidence ? '⚡ 核心提取验证码' : '信息提示: 包含候选 6 位数字'}
                </span>
              </div>
              <div className="code-hero-digits">{email.codeMatch?.code}</div>
              {!isHighConfidence && (
                <span className="code-hero-subtext">该邮件为注册/通知类邮件，此数字提取自正文链接或候选参考号</span>
              )}
            </div>
            <button className={`btn btn-copy-hero ${copied ? 'copied' : ''}`} type="button" onClick={handleCopy}>
              {copied ? <Check size={16} /> : <Copy size={16} />}
              <span>{copied ? '已复制' : '一键复制'}</span>
            </button>
          </div>
        )}

        {/* Content Format Toggle Tabs */}
        <div className="modal-view-tabs">
          {email.htmlBody && (
            <button
              className={`view-tab-btn ${viewTab === 'html' ? 'active' : ''}`}
              type="button"
              onClick={() => setViewTab('html')}
            >
              <Sparkles size={13} />
              <span>富文本视图 (HTML)</span>
            </button>
          )}
          <button
            className={`view-tab-btn ${viewTab === 'text' ? 'active' : ''}`}
            type="button"
            onClick={() => setViewTab('text')}
          >
            <FileText size={13} />
            <span>纯文本视图 (Text)</span>
          </button>
        </div>

        {/* Mail Content Viewer Area */}
        <div className="modal-content-viewport">
          {viewTab === 'html' && email.htmlBody ? (
            <iframe
              className="email-html-iframe"
              srcDoc={email.htmlBody}
              title="Email HTML Body"
              sandbox="allow-popups allow-popups-to-escape-sandbox"
            />
          ) : (
            <div className="email-text-renderer">
              {email.textBody || email.snippet || '(无正文内容)'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function FeedPaginationBar({
  currentPage,
  totalPages,
  pageSize,
  totalItems,
  onPageChange,
  onPageSizeChange,
}: {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  if (totalItems === 0) return null;

  const startItem = pageSize === 0 ? 1 : (currentPage - 1) * pageSize + 1;
  const endItem = pageSize === 0 ? totalItems : Math.min(currentPage * pageSize, totalItems);

  // Smart page numbers windowing
  const pageNumbers: number[] = [];
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = startPage + maxVisible - 1;
  if (endPage > totalPages) {
    endPage = totalPages;
    startPage = Math.max(1, endPage - maxVisible + 1);
  }
  for (let i = startPage; i <= endPage; i++) {
    pageNumbers.push(i);
  }

  return (
    <div className="feed-pagination-bar">
      <div className="pagination-info">
        <span>
          显示 <strong>{startItem}</strong> - <strong>{endItem}</strong> 封
        </span>
        <span className="pagination-total">（共 {totalItems} 封邮件）</span>
      </div>

      <div className="pagination-controls">
        <button
          type="button"
          className="page-nav-btn"
          disabled={currentPage <= 1 || pageSize === 0}
          onClick={() => onPageChange(currentPage - 1)}
          title="上一页"
        >
          <ChevronLeft size={14} />
          <span className="nav-btn-text">上一页</span>
        </button>

        {pageSize > 0 && totalPages > 1 && (
          <div className="page-numbers-list">
            {startPage > 1 && (
              <>
                <button type="button" className="page-num-btn" onClick={() => onPageChange(1)}>
                  1
                </button>
                {startPage > 2 && <span className="page-ellipsis">...</span>}
              </>
            )}

            {pageNumbers.map((num) => (
              <button
                key={num}
                type="button"
                className={`page-num-btn ${num === currentPage ? 'active' : ''}`}
                onClick={() => onPageChange(num)}
              >
                {num}
              </button>
            ))}

            {endPage < totalPages && (
              <>
                {endPage < totalPages - 1 && <span className="page-ellipsis">...</span>}
                <button type="button" className="page-num-btn" onClick={() => onPageChange(totalPages)}>
                  {totalPages}
                </button>
              </>
            )}
          </div>
        )}

        <button
          type="button"
          className="page-nav-btn"
          disabled={currentPage >= totalPages || pageSize === 0}
          onClick={() => onPageChange(currentPage + 1)}
          title="下一页"
        >
          <span className="nav-btn-text">下一页</span>
          <ChevronRight size={14} />
        </button>
      </div>

      <div className="pagination-size-wrap">
        <label htmlFor="feed-page-size-select">每页展示:</label>
        <select
          id="feed-page-size-select"
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="page-size-select"
        >
          <option value="12">12 封</option>
          <option value="24">24 封</option>
          <option value="48">48 封</option>
          <option value="96">96 封</option>
          <option value="0">全部 (无限流模式)</option>
        </select>
      </div>
    </div>
  );
}

function AppFooter({
  stats,
  health,
  onClearCache,
}: {
  stats: { totalAccounts: number; activeAccounts: number; totalMails: number; codeMails: number };
  health: HealthState;
  onClearCache: () => void;
}) {
  return (
    <footer className="app-footer">
      <div className="footer-container">
        {/* Left Branding & Security Badge */}
        <div className="footer-left">
          <div className="footer-brand-badge">
            <span className="brand-name">Inbox Mate</span>
            <span className="version-pill">PRO v2.4.0</span>
          </div>
          <span className="footer-separator">|</span>
          <span className="copyright-text">© 2026 Inbox Mate Inc. All rights reserved.</span>
          <span className="footer-separator">|</span>
          <div className="security-tag" title="数据仅存在于客户端浏览器与本地 Node 内部通信，不经过任何第三方服务器">
            <ShieldCheck size={13} className="text-emerald" />
            <span>本地纯内存沙盒 (IMAP TLS 1.3)</span>
          </div>
        </div>

        {/* Center Live Operational Metrics */}
        <div className="footer-center">
          <span className="footer-stat-item">
            托管: <strong>{stats.totalAccounts}</strong> 账号
          </span>
          <span className="dot-divider">•</span>
          <span className="footer-stat-item">
            已检索: <strong className="text-cyan">{stats.totalMails}</strong> 封邮件
          </span>
          <span className="dot-divider">•</span>
          <span className="footer-stat-item">
            已识别验证码: <strong className="text-emerald">{stats.codeMails}</strong> 个
          </span>
        </div>

        {/* Right Action Links */}
        <div className="footer-right">
          <button type="button" className="footer-link-btn" onClick={onClearCache} title="一键重置/清空本地内存中的账号与临时抓取记录">
            <Trash2 size={12} />
            <span>清空内存缓存</span>
          </button>
          <span className="footer-separator">|</span>
          <span className="footer-status-pill">
            <span className={`status-dot ${health === 'ready' ? 'online' : 'offline'}`}></span>
            <span>{health === 'ready' ? 'Backend 在线' : '服务断开'}</span>
          </span>
        </div>
      </div>
    </footer>
  );
}
