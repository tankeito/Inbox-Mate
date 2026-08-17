export interface AdminUser {
  id: string;
  email: string;
  twoFactorEnabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UsageLogItem {
  id: string;
  clientIp: string;
  region: string;
  emailAccount: string;
  emailDomain: string;
  provider: string;
  sourceMode: 'single' | 'batch' | 'api_key';
  status: 'success' | 'no_code' | 'error' | 'timeout' | 'captcha' | 'auth_failed' | 'cancelled';
  statusDetail?: string;
  hasCode: boolean;
  extractedCode?: string;
  durationMs: number;
  messageCount: number;
  createdAt: string;
}

export interface DiagLogItem {
  id: string;
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
  engine: 'web_rpa' | 'imap_pop3' | 'microsoft_graph' | 'api' | 'system';
  accountEmail?: string;
  stage: string;
  message: string;
  details?: string;
}

export interface ApiKeyItem {
  id: string;
  apiKey: string;
  name?: string;
  accountEmail: string;
  provider: string;
  isActive: boolean;
  expiresAt: string | null;
  callCount: number;
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalRequests: number;
  todayRequests: number;
  todaySuccessCount: number;
  todaySuccessRate: number;
  todayCodesFound: number;
  activeIpsToday: number;
  avgDurationMs: number;
  totalApiKeys: number;
  providerStats: Array<{ provider: string; count: number; percentage: number }>;
  recentHourly: Array<{ hour: string; count: number; success: number }>;
}

export interface PagedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

export interface BlockedIpItem {
  id: string;
  ip: string;
  reason: string;
  blockedBy: string;
  createdAt: string;
  expiresAt: string | null;
}

export interface RpaStatusData {
  status: 'running' | 'idle' | 'ready' | 'busy';
  isConnected: boolean;
  activeConcurrentAccounts: number;
  browserUsageCount: number;
  maxRecycleUsage: number;
  proxyInfo: {
    server: string | null;
    source: string;
  };
  uptimeSeconds: number;
  systemPlatform: string;
  nodeVersion: string;
  memoryUsageMb: number;
  heapUsedMb: number;
}

