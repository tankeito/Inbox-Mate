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
  proxyName?: string;
  proxyServer?: string;
  networkMode?: 'proxy' | 'direct';
  engine?: 'imap' | 'pop3' | 'web_rpa' | 'graph';
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
  traceId?: string;
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
  tokenId?: string | null;
  boundToken?: string | null;
  boundTokenName?: string | null;
  boundTokenRemaining?: number | null;
  boundTokenTotal?: number | null;
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
  durationHours: number;
  createdAt: string;
  expiresAt: string | null;
  isActive: boolean;
}

export interface IpAnalyticsSummary {
  totalRequests: number;
  uniqueIps: number;
  totalSuccess: number;
  successRate: number;
  activeBansCount: number;
  topCountry: { code: string; name: string; flag: string; count: number };
}

export interface IpAnalyticsItem {
  ip: string;
  countryCode: string;
  countryName: string;
  region: string;
  flag: string;
  requestCount: number;
  successCount: number;
  successRate: number;
  lastSeenAt: string;
  isBanned: boolean;
  banDetails?: {
    id: string;
    reason: string;
    expiresAt: string | null;
    durationHours: number;
    createdAt: string;
  };
}

export interface CountryStatItem {
  countryCode: string;
  countryName: string;
  flag: string;
  requestCount: number;
  uniqueIps: number;
  percentage: number;
}

export interface WorldMapStat {
  count: number;
  uniqueIps: number;
  percentage: number;
}

export interface IpAnalyticsResponse {
  summary: IpAnalyticsSummary;
  ipList: IpAnalyticsItem[];
  countryList: CountryStatItem[];
  worldMapData: Record<string, WorldMapStat>;
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

export type ScopeMode = 'code_only' | 'summary' | 'full';
export type EnginePreference = 'auto' | 'web_rpa' | 'imap_pop3';

export interface AccessTokenItem {
  id: string;
  token: string;
  name: string;
  totalQuota: number;
  usedQuota: number;
  remainingQuota: number;
  scopeMode: ScopeMode;
  enginePreference: EnginePreference;
  isActive: boolean;
  isExhausted: boolean;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TokenSummaryStats {
  totalTokens: number;
  activeTokens: number;
  totalQuotaAllocated: number;
  totalQuotaUsed: number;
  totalQuotaRemaining: number;
}

export interface SystemConcurrencySettings {
  concurrencyRpaMax: number;
  concurrencyProviderMax: number;
  concurrencyGlobalMax: number;
  timeoutAccountSec: number;
  timeoutRpaSec: number;
  timeoutJobSec: number;
  apiCooldownMs: number;
}

export interface SystemHardwareInfo {
  totalMemMb: number;
  freeMemMb: number;
  memUsagePercent: number;
  cpuCount: number;
  cpuModel: string;
  loadAvg: number[];
  processMemoryMb: number;
  platform: string;
}

export interface SystemRecommendations {
  rpaConcurrency: number;
  globalConcurrency: number;
  providerConcurrency: number;
  healthStatus: 'tight' | 'healthy' | 'robust' | 'ultra';
  healthMessage: string;
  estimatedRpaMemoryPerInstanceMb: number;
}

export interface SystemSettingsPayload {
  hardware: SystemHardwareInfo;
  recommendations: SystemRecommendations;
  currentSettings: SystemConcurrencySettings;
}

export interface TokenLogsStats {
  totalCalls: number;
  successCalls: number;
  errorCalls: number;
  successRate: number;
  freeProtectionCount: number;
}

export interface TokenLogsResponse {
  token: AccessTokenItem;
  items: UsageLogItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  stats?: TokenLogsStats;
}

export type ProxyProtocol = 'http' | 'https' | 'socks5';
export type ProxyStrategy = 'round_robin' | 'latency_first' | 'random';
export type ProxyRoutingMode = 'direct_first' | 'always' | 'targeted';
export type ProxyStatus = 'ok' | 'error' | 'untested';

export interface ProxyNode {
  id: string;
  name: string;
  server: string;
  protocol: ProxyProtocol;
  isActive: boolean;
  weight: number;
  latencyMs: number;
  exitIp: string | null;
  exitRegion: string | null;
  lastCheckedAt: string | null;
  lastStatus: ProxyStatus;
  lastError: string | null;
  totalRequests: number;
  successRequests: number;
  totalBytes: number;
  createdAt: string;
  updatedAt: string;
}

export interface GlobalProxyConfig {
  enabled: boolean;
  strategy: ProxyStrategy;
  routingMode: ProxyRoutingMode;
  failoverEnabled: boolean;
  directCooldownUntil?: string | null;
  isDirectCooling?: boolean;
}

export interface ProxyTrafficSummary {
  totalBytes: number;
  todayBytes: number;
  totalRequests: number;
  todayRequests: number;
  directRequests: number;
  savedBytesEst: number;
  savedRatioPercent: number;
  activeNodes: number;
  totalNodes: number;
  healthyNodes: number;
  avgLatencyMs: number;
}

export interface ProxyConfigResponse {
  config: GlobalProxyConfig;
  nodes: ProxyNode[];
  summary: ProxyTrafficSummary;
}

export interface ProxyTrafficLogItem {
  id: string;
  proxyId: string;
  proxyName: string;
  proxyServer: string;
  traceId?: string;
  emailAccount?: string;
  bytesSent: number;
  bytesReceived: number;
  totalBytes: number;
  durationMs: number;
  status: string;
  createdAt: string;
}
