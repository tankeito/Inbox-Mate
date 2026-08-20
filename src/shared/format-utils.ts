/**
 * Utility functions for formatting duration, dates, and numbers across Inbox Mate.
 */

/**
 * Formats duration in milliseconds to a human-readable string:
 * - If ms >= 1000: formats as seconds (e.g. 3200ms -> '3.2s', 1000ms -> '1s', 17237ms -> '17.2s')
 * - If ms < 1000: formats as milliseconds (e.g. 450ms -> '450ms', 0ms -> '0ms')
 */
export function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || Number.isNaN(ms)) {
    return '-';
  }
  if (ms >= 1000) {
    const s = ms / 1000;
    const formatted = s % 1 === 0 ? s.toFixed(0) : s.toFixed(1);
    return `${formatted}s`;
  }
  return `${Math.round(ms)}ms`;
}

/**
 * Formats any timestamp / date string into standard full format:
 * 'YYYY/MM/DD HH:mm:ss' (e.g. '2026/08/17 14:25:17')
 */
export function formatFullDateTime(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '-';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '-';

  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());
  const hours = pad(d.getHours());
  const minutes = pad(d.getMinutes());
  const seconds = pad(d.getSeconds());

  return `${year}/${month}/${day} ${hours}:${minutes}:${seconds}`;
}

/**
 * Formats date into 'YYYY-MM-DD'
 */
export function formatDateOnly(dateInput: string | number | Date | null | undefined): string {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (Number.isNaN(d.getTime())) return '';

  const pad = (n: number) => String(n).padStart(2, '0');
  const year = d.getFullYear();
  const month = pad(d.getMonth() + 1);
  const day = pad(d.getDate());

  return `${year}-${month}-${day}`;
}

export type DatePreset = 'today' | '24h' | '7d' | '30d';

/**
 * Generates startDate and endDate strings ('YYYY-MM-DD') based on preset
 */
export function getDateRangePreset(preset: DatePreset): { startDate: string; endDate: string } {
  const now = new Date();
  const todayStr = formatDateOnly(now);

  switch (preset) {
    case 'today':
      return { startDate: todayStr, endDate: todayStr };
    case '24h': {
      const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
      return { startDate: formatDateOnly(yesterday), endDate: todayStr };
    }
    case '7d': {
      const d7 = new Date(now.getTime() - 6 * 24 * 60 * 60 * 1000);
      return { startDate: formatDateOnly(d7), endDate: todayStr };
    }
    case '30d': {
      const d30 = new Date(now.getTime() - 29 * 24 * 60 * 60 * 1000);
      return { startDate: formatDateOnly(d30), endDate: todayStr };
    }
    default:
      return { startDate: '', endDate: '' };
  }
}

/**
 * Safely converts a date string (YYYY-MM-DD or YYYY/MM/DD or ISO) into UTC ISO string for start-of-day in local timezone:
 * e.g. '2026-08-20' -> '2026-08-19T16:00:00.000Z' (in UTC+8)
 */
export function toLocalStartOfDayIso(dateStr?: string | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();
  if (s.includes('T')) return s;

  const parts = s.split(/[-/]/).map(Number);
  if (parts.length < 3 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || Number.isNaN(parts[2])) {
    return null;
  }
  const [year, month, day] = parts;
  const localDate = new Date(year, month - 1, day, 0, 0, 0, 0);
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

/**
 * Safely converts a date string (YYYY-MM-DD or YYYY/MM/DD or ISO) into UTC ISO string for end-of-day in local timezone:
 * e.g. '2026-08-20' -> '2026-08-20T15:59:59.999Z' (in UTC+8)
 */
export function toLocalEndOfDayIso(dateStr?: string | null): string | null {
  if (!dateStr || !dateStr.trim()) return null;
  const s = dateStr.trim();
  if (s.includes('T')) return s;

  const parts = s.split(/[-/]/).map(Number);
  if (parts.length < 3 || Number.isNaN(parts[0]) || Number.isNaN(parts[1]) || Number.isNaN(parts[2])) {
    return null;
  }
  const [year, month, day] = parts;
  const localDate = new Date(year, month - 1, day, 23, 59, 59, 999);
  if (Number.isNaN(localDate.getTime())) return null;
  return localDate.toISOString();
}

