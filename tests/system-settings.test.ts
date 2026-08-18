import { describe, it, expect, beforeEach } from 'vitest';
import { systemSettingsService, DEFAULT_SETTINGS } from '../src/server/services/system-settings-service.js';
import { db } from '../src/server/db/database.js';

describe('SystemSettingsService & Concurrency Tuner', () => {
  beforeEach(() => {
    // Reset defaults before each test
    systemSettingsService.resetToDefaults();
  });

  it('should return valid hardware metrics from OS', () => {
    const hw = systemSettingsService.getHardwareInfo();
    expect(hw.totalMemMb).toBeGreaterThan(0);
    expect(hw.freeMemMb).toBeGreaterThan(0);
    expect(hw.cpuCount).toBeGreaterThanOrEqual(1);
    expect(typeof hw.cpuModel).toBe('string');
    expect(Array.isArray(hw.loadAvg)).toBe(true);
    expect(hw.memUsagePercent).toBeGreaterThanOrEqual(0);
    expect(hw.memUsagePercent).toBeLessThanOrEqual(100);
  });

  it('should compute smart recommendations bounded by hardware', () => {
    const mockHw = {
      totalMemMb: 16384,
      freeMemMb: 8192,
      memUsagePercent: 50,
      cpuCount: 8,
      cpuModel: 'Intel Core i7',
      loadAvg: [0.5, 0.5, 0.5],
      processMemoryMb: 120,
      platform: 'win32'
    };

    const rec = systemSettingsService.calculateRecommendations(mockHw);
    expect(rec.rpaConcurrency).toBeGreaterThanOrEqual(1);
    expect(rec.rpaConcurrency).toBeLessThanOrEqual(20);
    expect(rec.globalConcurrency).toBeGreaterThanOrEqual(20);
    expect(rec.globalConcurrency).toBeLessThanOrEqual(200);
    expect(rec.providerConcurrency).toBeGreaterThanOrEqual(5);
    expect(rec.healthStatus).toBe('ultra');
    expect(rec.estimatedRpaMemoryPerInstanceMb).toBe(300);
  });

  it('should provide conservative recommendations on low-memory servers', () => {
    const lowMemHw = {
      totalMemMb: 2048,
      freeMemMb: 800,
      memUsagePercent: 60,
      cpuCount: 2,
      cpuModel: 'Low End VPS',
      loadAvg: [0.9, 0.8, 0.7],
      processMemoryMb: 80,
      platform: 'linux'
    };

    const rec = systemSettingsService.calculateRecommendations(lowMemHw);
    expect(rec.rpaConcurrency).toBe(1);
    expect(rec.healthStatus).toBe('tight');
  });

  it('should read default settings correctly from SQLite', () => {
    const settings = systemSettingsService.getSettings();
    expect(settings.concurrencyRpaMax).toBe(DEFAULT_SETTINGS.concurrencyRpaMax);
    expect(settings.concurrencyProviderMax).toBe(DEFAULT_SETTINGS.concurrencyProviderMax);
    expect(settings.concurrencyGlobalMax).toBe(DEFAULT_SETTINGS.concurrencyGlobalMax);
    expect(settings.timeoutAccountSec).toBe(DEFAULT_SETTINGS.timeoutAccountSec);
    expect(settings.timeoutRpaSec).toBe(DEFAULT_SETTINGS.timeoutRpaSec);
    expect(settings.timeoutJobSec).toBe(DEFAULT_SETTINGS.timeoutJobSec);
    expect(settings.apiCooldownMs).toBe(DEFAULT_SETTINGS.apiCooldownMs);
  });

  it('should persist and update settings dynamically with hot reload notification', () => {
    let notified = false;
    let notifiedSettings: any = null;

    const unsubscribe = systemSettingsService.onSettingsChanged((newSettings) => {
      notified = true;
      notifiedSettings = newSettings;
    });

    const updated = systemSettingsService.updateSettings({
      concurrencyRpaMax: 8,
      concurrencyProviderMax: 20,
      concurrencyGlobalMax: 100,
      timeoutRpaSec: 120,
      apiCooldownMs: 2500
    });

    expect(updated.concurrencyRpaMax).toBe(8);
    expect(updated.concurrencyProviderMax).toBe(20);
    expect(updated.concurrencyGlobalMax).toBe(100);
    expect(updated.timeoutRpaSec).toBe(120);
    expect(updated.apiCooldownMs).toBe(2500);

    expect(notified).toBe(true);
    expect(notifiedSettings?.concurrencyRpaMax).toBe(8);

    // Verify persistent in SQLite
    const retrieved = systemSettingsService.getSettings();
    expect(retrieved.concurrencyRpaMax).toBe(8);
    expect(retrieved.concurrencyProviderMax).toBe(20);
    expect(retrieved.concurrencyGlobalMax).toBe(100);
    expect(retrieved.apiCooldownMs).toBe(2500);

    unsubscribe();
  });

  it('should clamp out-of-range values safely within limits', () => {
    const clamped = systemSettingsService.updateSettings({
      concurrencyRpaMax: 999, // Should clamp to max 20
      concurrencyProviderMax: 0, // Should clamp to min 1
      concurrencyGlobalMax: 500, // Should clamp to max 200
      timeoutAccountSec: 5, // Should clamp to min 10
      timeoutRpaSec: 300, // Should clamp to max 180
      apiCooldownMs: 99999 // Should clamp to max 10000
    });

    expect(clamped.concurrencyRpaMax).toBe(20);
    expect(clamped.concurrencyProviderMax).toBe(1);
    expect(clamped.concurrencyGlobalMax).toBe(200);
    expect(clamped.timeoutAccountSec).toBe(10);
    expect(clamped.timeoutRpaSec).toBe(180);
    expect(clamped.apiCooldownMs).toBe(10000);
  });
});
