import os from 'node:os';
import { db } from '../db/database.js';
import { diagLogger } from './diag-logger.js';

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

export const DEFAULT_SETTINGS: SystemConcurrencySettings = {
  concurrencyRpaMax: 3,
  concurrencyProviderMax: 10,
  concurrencyGlobalMax: 50,
  timeoutAccountSec: 30,
  timeoutRpaSec: 90,
  timeoutJobSec: 300,
  apiCooldownMs: 1500
};

export class SystemSettingsService {
  private listeners = new Set<(settings: SystemConcurrencySettings) => void>();

  constructor() {
    this.ensureDefaults();
  }

  private ensureDefaults(): void {
    const now = new Date().toISOString();
    const insertStmt = db.prepare(`
      INSERT OR IGNORE INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    for (const [key, val] of Object.entries(DEFAULT_SETTINGS)) {
      insertStmt.run(key, String(val), now);
    }
  }

  /**
   * Subscribe to settings change events for hot-reloading
   */
  onSettingsChanged(listener: (settings: SystemConcurrencySettings) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Read all current settings from SQLite with default fallbacks
   */
  getSettings(): SystemConcurrencySettings {
    const rows = db.prepare('SELECT key, value FROM system_settings').all() as Array<{ key: string; value: string }>;
    const map = new Map<string, string>();
    for (const row of rows) {
      map.set(row.key, row.value);
    }

    const parseNum = (key: keyof SystemConcurrencySettings, fallback: number, min: number, max: number): number => {
      const raw = map.get(key);
      if (raw === undefined || raw === null || raw.trim() === '') return fallback;
      const parsed = Number(raw);
      if (Number.isNaN(parsed)) return fallback;
      return Math.min(max, Math.max(min, Math.round(parsed)));
    };

    return {
      concurrencyRpaMax: parseNum('concurrencyRpaMax', DEFAULT_SETTINGS.concurrencyRpaMax, 1, 20),
      concurrencyProviderMax: parseNum('concurrencyProviderMax', DEFAULT_SETTINGS.concurrencyProviderMax, 1, 50),
      concurrencyGlobalMax: parseNum('concurrencyGlobalMax', DEFAULT_SETTINGS.concurrencyGlobalMax, 10, 200),
      timeoutAccountSec: parseNum('timeoutAccountSec', DEFAULT_SETTINGS.timeoutAccountSec, 10, 120),
      timeoutRpaSec: parseNum('timeoutRpaSec', DEFAULT_SETTINGS.timeoutRpaSec, 30, 180),
      timeoutJobSec: parseNum('timeoutJobSec', DEFAULT_SETTINGS.timeoutJobSec, 60, 600),
      apiCooldownMs: parseNum('apiCooldownMs', DEFAULT_SETTINGS.apiCooldownMs, 0, 10000)
    };
  }

  /**
   * Save updated settings to SQLite and trigger hot-reload for subscribers
   */
  updateSettings(input: Partial<SystemConcurrencySettings>): SystemConcurrencySettings {
    const current = this.getSettings();
    const sanitizeNum = (val: unknown, fallback: number, min: number, max: number): number => {
      if (val === undefined || val === null || val === '') return fallback;
      const num = Number(val);
      if (Number.isNaN(num)) return fallback;
      return Math.min(max, Math.max(min, Math.round(num)));
    };

    const updated: SystemConcurrencySettings = {
      concurrencyRpaMax: sanitizeNum(input.concurrencyRpaMax, current.concurrencyRpaMax, 1, 20),
      concurrencyProviderMax: sanitizeNum(input.concurrencyProviderMax, current.concurrencyProviderMax, 1, 50),
      concurrencyGlobalMax: sanitizeNum(input.concurrencyGlobalMax, current.concurrencyGlobalMax, 10, 200),
      timeoutAccountSec: sanitizeNum(input.timeoutAccountSec, current.timeoutAccountSec, 10, 120),
      timeoutRpaSec: sanitizeNum(input.timeoutRpaSec, current.timeoutRpaSec, 30, 180),
      timeoutJobSec: sanitizeNum(input.timeoutJobSec, current.timeoutJobSec, 60, 600),
      apiCooldownMs: sanitizeNum(input.apiCooldownMs, current.apiCooldownMs, 0, 10000)
    };

    const now = new Date().toISOString();
    const updateStmt = db.prepare(`
      INSERT OR REPLACE INTO system_settings (key, value, updated_at)
      VALUES (?, ?, ?)
    `);

    for (const [key, val] of Object.entries(updated)) {
      updateStmt.run(key, String(val), now);
    }

    diagLogger.info(
      'system',
      '配置热更新',
      `管理员更新了系统并发与调度参数 (RPA并发: ${updated.concurrencyRpaMax}, 全局并发: ${updated.concurrencyGlobalMax}, 单服务商并发: ${updated.concurrencyProviderMax})`
    );

    // Notify all in-memory subscribers (JobManager, ApiKeyService, etc.)
    for (const listener of this.listeners) {
      try {
        listener(updated);
      } catch (err) {
        console.error('[SystemSettingsService] Error in listener callback:', err);
      }
    }

    return updated;
  }

  /**
   * Reset all settings to factory default
   */
  resetToDefaults(): SystemConcurrencySettings {
    return this.updateSettings(DEFAULT_SETTINGS);
  }

  /**
   * Collect real-time OS hardware metrics
   */
  getHardwareInfo(): SystemHardwareInfo {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePercent = totalMem > 0 ? Math.round((usedMem / totalMem) * 1000) / 10 : 0;

    const cpus = os.cpus() || [];
    const cpuCount = cpus.length || 1;
    const cpuModel = cpus[0]?.model || 'Unknown CPU';

    const loadAvg = os.loadavg ? os.loadavg() : [0, 0, 0];
    const procMem = process.memoryUsage();

    return {
      totalMemMb: Math.round(totalMem / (1024 * 1024)),
      freeMemMb: Math.round(freeMem / (1024 * 1024)),
      memUsagePercent,
      cpuCount,
      cpuModel,
      loadAvg: loadAvg.map((n) => Math.round(n * 100) / 100),
      processMemoryMb: Math.round(procMem.rss / (1024 * 1024)),
      platform: process.platform
    };
  }

  /**
   * Calculate smart recommendation concurrency values based on available RAM and CPU cores
   */
  calculateRecommendations(hardware = this.getHardwareInfo()): SystemRecommendations {
    const freeMemMb = hardware.freeMemMb;
    const cpuCount = hardware.cpuCount;
    const estimatedInstanceMb = 300;
    const safeReserveMb = 1536; // 1.5GB reserved for OS and Node.js process

    // Usable memory for headless browsers
    const usableMemMb = Math.max(0, freeMemMb * 0.95 - safeReserveMb);
    const memoryCalculatedRpa = Math.floor(usableMemMb / estimatedInstanceMb);

    // CPU bounds (max 2 RPA browsers per CPU core, clamp between 1 and 20)
    const cpuBoundedRpa = Math.min(20, Math.max(1, cpuCount * 2));
    const rpaConcurrency = Math.min(cpuBoundedRpa, Math.max(1, memoryCalculatedRpa || 1));

    // Global and provider limits
    const globalConcurrency = Math.min(200, Math.max(20, cpuCount * 15));
    const providerConcurrency = Math.min(50, Math.max(5, Math.floor(globalConcurrency / 4)));

    let healthStatus: SystemRecommendations['healthStatus'] = 'healthy';
    let healthMessage = '系统可用内存充足，推荐保持当前或优化后的并发配置。';

    if (freeMemMb < 1500) {
      healthStatus = 'tight';
      healthMessage = `服务器可用内存较少 (${(freeMemMb / 1024).toFixed(1)} GB)，建议保持保守并发 (1~2 个)，防止内存溢出。`;
    } else if (freeMemMb >= 8000) {
      healthStatus = 'ultra';
      healthMessage = `服务器剩余内存极其充沛 (${(freeMemMb / 1024).toFixed(1)} GB)，建议开启高速并发 (${rpaConcurrency} 个 RPA) 充分释放算力！`;
    } else if (freeMemMb >= 4000) {
      healthStatus = 'robust';
      healthMessage = `服务器算力充裕 (${(freeMemMb / 1024).toFixed(1)} GB 可用)，推荐将 RPA 并发调至 ${rpaConcurrency} 个以加快批量抓取。`;
    }

    return {
      rpaConcurrency,
      globalConcurrency,
      providerConcurrency,
      healthStatus,
      healthMessage,
      estimatedRpaMemoryPerInstanceMb: estimatedInstanceMb
    };
  }

  /**
   * Get full payload for Backyard Settings UI
   */
  getFullPayload(): SystemSettingsPayload {
    const hardware = this.getHardwareInfo();
    const recommendations = this.calculateRecommendations(hardware);
    const currentSettings = this.getSettings();

    return {
      hardware,
      recommendations,
      currentSettings
    };
  }
}

export const systemSettingsService = new SystemSettingsService();
