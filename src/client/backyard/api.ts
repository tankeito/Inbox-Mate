import type {
  AdminUser,
  ApiKeyItem,
  BlockedIpItem,
  DashboardStats,
  DiagLogItem,
  PagedResult,
  RpaStatusData,
  UsageLogItem
} from './types';

const BASE_URL = '/api/backyard';

function getAuthHeader(): Record<string, string> {
  const token = localStorage.getItem('backyard_token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Content-Type': 'application/json',
    ...getAuthHeader(),
    ...(options.headers || {})
  };

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers
  });

  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new Error(data.error || `请求失败 (${res.status})`);
  }

  return data as T;
}

export const backyardApi = {
  // Auth
  async login(email: string, password: string) {
    return request<{ require2FA: boolean; tempToken?: string; token?: string; user?: AdminUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
  },

  async verify2FA(tempToken: string, code: string) {
    return request<{ token: string; user: AdminUser }>('/auth/verify-2fa', {
      method: 'POST',
      body: JSON.stringify({ tempToken, code })
    });
  },

  async getMe() {
    return request<{ user: AdminUser }>('/auth/me');
  },

  async logout() {
    localStorage.removeItem('backyard_token');
    return request<{ ok: boolean }>('/auth/logout', { method: 'POST' });
  },

  async setup2FA() {
    return request<{ secret: string; uri: string; qrSvg: string }>('/auth/2fa/setup', { method: 'POST' });
  },

  async enable2FA(code: string) {
    return request<{ ok: boolean; message: string }>('/auth/2fa/enable', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  },

  async disable2FA(code: string) {
    return request<{ ok: boolean; message: string }>('/auth/2fa/disable', {
      method: 'POST',
      body: JSON.stringify({ code })
    });
  },

  async changePassword(oldPassword: string, newPassword: string) {
    return request<{ ok: boolean; message: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ oldPassword, newPassword })
    });
  },

  // Stats
  async getOverviewStats() {
    return request<DashboardStats>('/stats/overview');
  },

  // Usage Logs
  async getUsageLogs(params: {
    page?: number;
    pageSize?: number;
    search?: string;
    status?: string;
    provider?: string;
    sourceMode?: string;
  }) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.provider && params.provider !== 'all') query.set('provider', params.provider);
    if (params.sourceMode && params.sourceMode !== 'all') query.set('sourceMode', params.sourceMode);

    return request<PagedResult<UsageLogItem>>(`/logs?${query.toString()}`);
  },

  getExportLogsUrl(params: { search?: string; status?: string; provider?: string; sourceMode?: string }) {
    const query = new URLSearchParams();
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.provider && params.provider !== 'all') query.set('provider', params.provider);
    if (params.sourceMode && params.sourceMode !== 'all') query.set('sourceMode', params.sourceMode);
    return `${BASE_URL}/logs/export?${query.toString()}`;
  },

  // Diagnostics
  async getDiagnostics(params: {
    page?: number;
    pageSize?: number;
    level?: string;
    engine?: string;
    search?: string;
  }) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params.level && params.level !== 'all') query.set('level', params.level);
    if (params.engine && params.engine !== 'all') query.set('engine', params.engine);
    if (params.search) query.set('search', params.search);

    return request<PagedResult<DiagLogItem>>(`/diagnostics?${query.toString()}`);
  },

  async clearDiagnostics() {
    return request<{ ok: boolean; message: string }>('/diagnostics/clear', { method: 'POST' });
  },

  // Keys
  async getKeys(params: { page?: number; pageSize?: number; search?: string; status?: string; provider?: string }) {
    const query = new URLSearchParams();
    if (params.page) query.set('page', params.page.toString());
    if (params.pageSize) query.set('pageSize', params.pageSize.toString());
    if (params.search) query.set('search', params.search);
    if (params.status && params.status !== 'all') query.set('status', params.status);
    if (params.provider && params.provider !== 'all') query.set('provider', params.provider);

    return request<PagedResult<ApiKeyItem>>(`/keys?${query.toString()}`);
  },

  async createKey(payload: {
    email: string;
    password?: string;
    refreshToken?: string;
    provider?: string;
    name?: string;
    expiresInHours?: number | null;
    customHost?: string;
    customPort?: number;
    customProtocol?: 'imap' | 'pop3';
  }) {
    return request<ApiKeyItem>('/keys', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async batchImportKeys(payload: {
    rawText: string;
    defaultProvider?: string;
    expiresInHours?: number | null;
    batchName?: string;
  }) {
    return request<{
      totalProcessed: number;
      successCount: number;
      failedCount: number;
      keys: Array<ApiKeyItem & { rawPassword?: string }>;
    }>('/keys/batch-import', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async batchExportKeys(payload: { keyIds?: string[]; format: 'custom' | 'csv' | 'json' | 'urls' }) {
    return request<{ formatted: string; count: number }>('/keys/batch-export', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async toggleKeyActive(id: string, active: boolean) {
    return request<{ ok: boolean }>(`/keys/${id}/toggle`, {
      method: 'POST',
      body: JSON.stringify({ active })
    });
  },

  async updateKeyExpiry(id: string, expiresAt: string | null) {
    return request<{ ok: boolean }>(`/keys/${id}/expiry`, {
      method: 'POST',
      body: JSON.stringify({ expiresAt })
    });
  },

  async deleteKey(id: string) {
    return request<{ ok: boolean }>(`/keys/${id}`, { method: 'DELETE' });
  },

  async testApiKey(apiKey: string) {
    return request<any>(`/keys/${apiKey}/test`, { method: 'POST' });
  },

  // Security: Blocked IPs
  async getBlockedIps() {
    return request<{ items: BlockedIpItem[]; total: number }>('/security/blocked-ips');
  },

  async blockIp(payload: { ip: string; reason?: string; durationHours?: number | null }) {
    return request<{ ok: boolean; item: BlockedIpItem; message: string }>('/security/blocked-ips', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  },

  async unblockIp(id: string) {
    return request<{ ok: boolean; message: string }>(`/security/blocked-ips/${id}`, {
      method: 'DELETE'
    });
  },

  // Chrome RPA Engine Status & Lifecycle Management
  async getRpaStatus() {
    return request<RpaStatusData>('/rpa/status');
  },

  async restartRpa() {
    return request<{ ok: boolean; message: string; activeAccountsBefore: number }>('/rpa/restart', {
      method: 'POST'
    });
  },

  async testRpaHealthCheck() {
    return request<{
      ok: boolean;
      latencyMs: number;
      proxyUsed: string;
      pageTitle: string;
      statusCode: number;
      hasCaptcha: boolean;
    }>('/rpa/health-check', {
      method: 'POST'
    });
  }
};
