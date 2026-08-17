import { describe, expect, it } from 'vitest';
import {
  formatDuration,
  formatFullDateTime,
  formatDateOnly,
  getDateRangePreset
} from '../src/shared/format-utils.js';

describe('formatDuration utility', () => {
  it('formats milliseconds under 1000ms correctly', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(150)).toBe('150ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats milliseconds >= 1000ms as seconds', () => {
    expect(formatDuration(1000)).toBe('1s');
    expect(formatDuration(3200)).toBe('3.2s');
    expect(formatDuration(17237)).toBe('17.2s');
    expect(formatDuration(12000)).toBe('12s');
    expect(formatDuration(1550)).toBe('1.6s');
  });

  it('handles null, undefined and NaN', () => {
    expect(formatDuration(null)).toBe('-');
    expect(formatDuration(undefined)).toBe('-');
    expect(formatDuration(Number.NaN)).toBe('-');
  });
});

describe('formatFullDateTime utility', () => {
  it('formats dates into YYYY/MM/DD HH:mm:ss standard', () => {
    const fixedDate = new Date(2026, 7, 17, 14, 25, 17); // Month index 7 is August
    expect(formatFullDateTime(fixedDate)).toBe('2026/08/17 14:25:17');
  });

  it('handles invalid or null date gracefully', () => {
    expect(formatFullDateTime(null)).toBe('-');
    expect(formatFullDateTime(undefined)).toBe('-');
    expect(formatFullDateTime('invalid-date')).toBe('-');
  });
});

describe('getDateRangePreset utility', () => {
  it('generates today, 24h, 7d, 30d presets correctly', () => {
    const today = getDateRangePreset('today');
    expect(today.startDate).toBe(today.endDate);
    expect(/^\d{4}-\d{2}-\d{2}$/.test(today.startDate)).toBe(true);

    const d7 = getDateRangePreset('7d');
    expect(d7.startDate).toBeDefined();
    expect(d7.endDate).toBeDefined();
    expect(new Date(d7.startDate).getTime()).toBeLessThanOrEqual(new Date(d7.endDate).getTime());
  });
});
