import { randomUUID } from 'node:crypto';
import { db } from '../db/database.js';
import { maskEmail } from '../providers.js';
import { toLocalStartOfDayIso, toLocalEndOfDayIso } from '../../shared/format-utils.js';

export type LogLevel = 'DEBUG' | 'INFO' | 'WARN' | 'ERROR';
export type EngineType = 'web_rpa' | 'imap_pop3' | 'microsoft_graph' | 'api' | 'system';

export interface DiagEvent {
  level: LogLevel;
  engine: EngineType;
  accountEmail?: string;
  stage: string;
  message: string;
  details?: Record<string, unknown> | string;
  traceId?: string;
}

export interface DiagLogItem {
  id: string;
  timestamp: string;
  level: LogLevel;
  engine: EngineType;
  accountEmail?: string;
  stage: string;
  message: string;
  details?: string;
  traceId?: string;
}

export interface DiagQuery {
  page?: number;
  pageSize?: number;
  level?: string;
  engine?: string;
  search?: string;
  traceId?: string;
  startDate?: string;
  endDate?: string;
}

class DiagnosticLoggerService {
  public log(event: DiagEvent): void {
    try {
      const id = randomUUID();
      const now = new Date().toISOString();
      const rawEmail = event.accountEmail ? event.accountEmail.trim() : undefined;
      const detailsStr =
        typeof event.details === 'object'
          ? JSON.stringify(event.details)
          : typeof event.details === 'string'
          ? event.details
          : null;

      const stmt = db.prepare(`
        INSERT INTO diagnostic_logs (id, timestamp, level, engine, account_email, stage, message, details, trace_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      stmt.run(
        id,
        now,
        event.level,
        event.engine,
        rawEmail || null,
        event.stage,
        event.message,
        detailsStr,
        event.traceId || null
      );

      // Keep recent logs pruned to maximum 10,000 items to conserve disk
      if (Math.random() < 0.05) {
        db.exec(`
          DELETE FROM diagnostic_logs 
          WHERE id NOT IN (SELECT id FROM diagnostic_logs ORDER BY timestamp DESC LIMIT 10000)
        `);
      }
    } catch (err) {
      console.error('[DiagLogger] Failed to write diag log:', err);
    }
  }

  public info(engine: EngineType, stage: string, message: string, details?: any, email?: string, traceId?: string) {
    this.log({ level: 'INFO', engine, stage, message, details, accountEmail: email, traceId });
  }

  public warn(engine: EngineType, stage: string, message: string, details?: any, email?: string, traceId?: string) {
    this.log({ level: 'WARN', engine, stage, message, details, accountEmail: email, traceId });
  }

  public error(engine: EngineType, stage: string, message: string, details?: any, email?: string, traceId?: string) {
    this.log({ level: 'ERROR', engine, stage, message, details, accountEmail: email, traceId });
  }

  public debug(engine: EngineType, stage: string, message: string, details?: any, email?: string, traceId?: string) {
    this.log({ level: 'DEBUG', engine, stage, message, details, accountEmail: email, traceId });
  }

  public query(params: DiagQuery): { items: DiagLogItem[]; total: number; page: number; pageSize: number; totalPages: number } {
    const page = Math.max(1, params.page || 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize || 30));
    const offset = (page - 1) * pageSize;

    const conditions: string[] = ['1=1'];
    const args: any[] = [];

    if (params.traceId && params.traceId.trim()) {
      const tid = params.traceId.trim();
      conditions.push('(trace_id = ? OR details LIKE ?)');
      args.push(tid, `%${tid}%`);
    }

    if (params.search && params.search.trim()) {
      const q = `%${params.search.trim()}%`;
      conditions.push('(message LIKE ? OR stage LIKE ? OR account_email LIKE ? OR details LIKE ? OR trace_id LIKE ?)');
      args.push(q, q, q, q, q);
    }

    if (params.level && params.level !== 'all') {
      conditions.push('level = ?');
      args.push(params.level);
    }

    if (params.engine && params.engine !== 'all') {
      conditions.push('engine = ?');
      args.push(params.engine);
    }

    if (params.startDate && params.startDate.trim()) {
      const startIso = toLocalStartOfDayIso(params.startDate);
      if (startIso) {
        conditions.push('timestamp >= ?');
        args.push(startIso);
      }
    }

    if (params.endDate && params.endDate.trim()) {
      const endIso = toLocalEndOfDayIso(params.endDate);
      if (endIso) {
        conditions.push('timestamp <= ?');
        args.push(endIso);
      }
    }

    const whereClause = conditions.join(' AND ');

    const countStmt = db.prepare(`SELECT COUNT(*) as count FROM diagnostic_logs WHERE ${whereClause}`);
    const countResult = countStmt.get(...args) as any;
    const total = countResult ? countResult.count : 0;

    const queryStmt = db.prepare(`
      SELECT * FROM diagnostic_logs 
      WHERE ${whereClause} 
      ORDER BY timestamp DESC 
      LIMIT ? OFFSET ?
    `);

    const rows = queryStmt.all(...args, pageSize, offset) as any[];

    const items: DiagLogItem[] = rows.map((r) => ({
      id: r.id,
      timestamp: r.timestamp,
      level: r.level as LogLevel,
      engine: r.engine as EngineType,
      accountEmail: r.account_email,
      stage: r.stage,
      message: r.message,
      details: r.details,
      traceId: r.trace_id || undefined
    }));

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1
    };
  }

  public clear(): void {
    db.exec('DELETE FROM diagnostic_logs');
  }
}

export const diagLogger = new DiagnosticLoggerService();
