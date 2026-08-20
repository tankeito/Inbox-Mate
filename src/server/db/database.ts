import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';

function getProjectDataDir(): string {
  if (process.env.DATA_DIR && process.env.DATA_DIR.trim()) {
    return path.resolve(process.env.DATA_DIR.trim());
  }
  const cwdData = path.resolve(process.cwd(), 'data');
  if (existsSync(path.resolve(process.cwd(), 'package.json')) || existsSync(cwdData)) {
    return cwdData;
  }
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    return path.resolve(__dirname, '../../../data');
  } catch {
    return cwdData;
  }
}

const DATA_DIR = getProjectDataDir();
if (!existsSync(DATA_DIR)) {
  mkdirSync(DATA_DIR, { recursive: true });
}

const isTestEnv = process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
const dbFileName = isTestEnv ? 'inbox_mate_test.db' : 'inbox_mate.db';
const DB_PATH = path.join(DATA_DIR, dbFileName);

export function hashPassword(password: string, salt?: string): { hash: string; salt: string } {
  const actualSalt = salt || randomBytes(16).toString('hex');
  const derivedKey = scryptSync(password, actualSalt, 64);
  return { hash: derivedKey.toString('hex'), salt: actualSalt };
}

export function verifyPassword(password: string, hash: string, salt: string): boolean {
  try {
    const derivedKey = scryptSync(password, salt, 64);
    const keyBuffer = Buffer.from(hash, 'hex');
    return timingSafeEqual(derivedKey, keyBuffer);
  } catch {
    return false;
  }
}

class DatabaseService {
  private db: DatabaseSync;

  constructor() {
    this.db = new DatabaseSync(DB_PATH);
    this.initPragmas();
    this.initTables();
    this.initDefaultAdmin();
  }

  private initPragmas() {
    this.db.exec('PRAGMA busy_timeout = 10000;');
    this.db.exec('PRAGMA journal_mode = WAL;');
    this.db.exec('PRAGMA synchronous = NORMAL;');
    this.db.exec('PRAGMA foreign_keys = ON;');
  }

  private initTables() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        two_factor_secret TEXT,
        two_factor_enabled INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS usage_logs (
        id TEXT PRIMARY KEY,
        client_ip TEXT NOT NULL,
        region TEXT NOT NULL,
        email_account TEXT NOT NULL,
        email_domain TEXT NOT NULL,
        provider TEXT NOT NULL,
        source_mode TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        has_code INTEGER NOT NULL DEFAULT 0,
        extracted_code TEXT,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        message_count INTEGER NOT NULL DEFAULT 0,
        token_id TEXT,
        token TEXT,
        proxy_name TEXT,
        proxy_server TEXT,
        network_mode TEXT DEFAULT 'direct',
        engine TEXT DEFAULT 'imap',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_usage_logs_created_at ON usage_logs(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_email ON usage_logs(email_account);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_ip ON usage_logs(client_ip);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_status ON usage_logs(status);
      CREATE INDEX IF NOT EXISTS idx_usage_logs_provider ON usage_logs(provider);

      CREATE TABLE IF NOT EXISTS diagnostic_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        level TEXT NOT NULL,
        engine TEXT NOT NULL,
        account_email TEXT,
        stage TEXT NOT NULL,
        message TEXT NOT NULL,
        details TEXT,
        trace_id TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_diag_logs_timestamp ON diagnostic_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_diag_logs_engine ON diagnostic_logs(engine);
      CREATE INDEX IF NOT EXISTS idx_diag_logs_level ON diagnostic_logs(level);

      CREATE TABLE IF NOT EXISTS api_keys (
        id TEXT PRIMARY KEY,
        api_key TEXT UNIQUE NOT NULL,
        name TEXT,
        account_email TEXT NOT NULL,
        provider TEXT NOT NULL,
        encrypted_auth TEXT NOT NULL,
        auth_iv TEXT NOT NULL,
        auth_tag TEXT NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        call_count INTEGER NOT NULL DEFAULT 0,
        last_used_at TEXT,
        token_id TEXT,
        bound_token TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(api_key);
      CREATE INDEX IF NOT EXISTS idx_api_keys_email ON api_keys(account_email);
      CREATE INDEX IF NOT EXISTS idx_api_keys_status ON api_keys(is_active, expires_at);

      CREATE TABLE IF NOT EXISTS system_settings (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS blocked_ips (
        id TEXT PRIMARY KEY,
        ip TEXT UNIQUE NOT NULL,
        reason TEXT NOT NULL,
        blocked_by TEXT DEFAULT 'admin',
        created_at TEXT NOT NULL,
        expires_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_blocked_ips_ip ON blocked_ips(ip);
      CREATE INDEX IF NOT EXISTS idx_blocked_ips_created_at ON blocked_ips(created_at DESC);

      CREATE TABLE IF NOT EXISTS ip_bans (
        id TEXT PRIMARY KEY,
        ip TEXT UNIQUE NOT NULL,
        reason TEXT NOT NULL,
        banned_by TEXT DEFAULT 'admin',
        duration_hours INTEGER NOT NULL DEFAULT 0,
        banned_at TEXT NOT NULL,
        expires_at TEXT,
        is_active INTEGER NOT NULL DEFAULT 1,
        unbanned_at TEXT,
        unban_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_ip_bans_ip ON ip_bans(ip);
      CREATE INDEX IF NOT EXISTS idx_ip_bans_active ON ip_bans(is_active);
      CREATE INDEX IF NOT EXISTS idx_ip_bans_banned_at ON ip_bans(banned_at DESC);

      CREATE TABLE IF NOT EXISTS access_tokens (
        id TEXT PRIMARY KEY,
        token TEXT UNIQUE NOT NULL,
        name TEXT NOT NULL,
        total_quota INTEGER NOT NULL DEFAULT 10,
        used_quota INTEGER NOT NULL DEFAULT 0,
        scope_mode TEXT NOT NULL DEFAULT 'code_only',
        engine_preference TEXT NOT NULL DEFAULT 'auto',
        is_active INTEGER NOT NULL DEFAULT 1,
        expires_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_access_tokens_token ON access_tokens(token);
      CREATE INDEX IF NOT EXISTS idx_access_tokens_active ON access_tokens(is_active);

      CREATE TABLE IF NOT EXISTS proxy_nodes (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        server TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'http',
        is_active INTEGER NOT NULL DEFAULT 1,
        weight INTEGER NOT NULL DEFAULT 1,
        latency_ms INTEGER NOT NULL DEFAULT -1,
        exit_ip TEXT,
        exit_region TEXT,
        last_checked_at TEXT,
        last_status TEXT NOT NULL DEFAULT 'untested',
        last_error TEXT,
        total_requests INTEGER NOT NULL DEFAULT 0,
        success_requests INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_proxy_nodes_active ON proxy_nodes(is_active);
      CREATE INDEX IF NOT EXISTS idx_proxy_nodes_status ON proxy_nodes(last_status);

      CREATE TABLE IF NOT EXISTS proxy_traffic_logs (
        id TEXT PRIMARY KEY,
        proxy_id TEXT,
        proxy_name TEXT,
        proxy_server TEXT,
        trace_id TEXT,
        email_account TEXT,
        bytes_sent INTEGER NOT NULL DEFAULT 0,
        bytes_received INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        duration_ms INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_traffic_logs_proxy_id ON proxy_traffic_logs(proxy_id);
      CREATE INDEX IF NOT EXISTS idx_traffic_logs_created_at ON proxy_traffic_logs(created_at DESC);
    `);

    // Column migrations
    try {
      const tokenColumns = (this.db.prepare('PRAGMA table_info(access_tokens)').all() as any[]).map((c) => c.name);
      if (!tokenColumns.includes('scope_mode')) {
        this.db.exec("ALTER TABLE access_tokens ADD COLUMN scope_mode TEXT NOT NULL DEFAULT 'code_only';");
      }
      if (!tokenColumns.includes('engine_preference')) {
        this.db.exec("ALTER TABLE access_tokens ADD COLUMN engine_preference TEXT NOT NULL DEFAULT 'auto';");
      }

      const usageColumns = (this.db.prepare('PRAGMA table_info(usage_logs)').all() as any[]).map((c) => c.name);
      if (!usageColumns.includes('token_id')) {
        this.db.exec('ALTER TABLE usage_logs ADD COLUMN token_id TEXT;');
      }
      if (!usageColumns.includes('token')) {
        this.db.exec('ALTER TABLE usage_logs ADD COLUMN token TEXT;');
      }
      if (!usageColumns.includes('proxy_name')) {
        this.db.exec('ALTER TABLE usage_logs ADD COLUMN proxy_name TEXT;');
      }
      if (!usageColumns.includes('proxy_server')) {
        this.db.exec('ALTER TABLE usage_logs ADD COLUMN proxy_server TEXT;');
      }
      if (!usageColumns.includes('network_mode')) {
        this.db.exec("ALTER TABLE usage_logs ADD COLUMN network_mode TEXT DEFAULT 'direct';");
      }
      if (!usageColumns.includes('engine')) {
        this.db.exec("ALTER TABLE usage_logs ADD COLUMN engine TEXT DEFAULT 'imap';");
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_usage_logs_token_id ON usage_logs(token_id);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_usage_logs_token ON usage_logs(token);');
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_usage_logs_engine ON usage_logs(engine);');

      const diagColumns = (this.db.prepare('PRAGMA table_info(diagnostic_logs)').all() as any[]).map((c) => c.name);
      if (!diagColumns.includes('trace_id')) {
        this.db.exec('ALTER TABLE diagnostic_logs ADD COLUMN trace_id TEXT;');
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_diag_logs_trace_id ON diagnostic_logs(trace_id);');

      const keyColumns = (this.db.prepare('PRAGMA table_info(api_keys)').all() as any[]).map((c) => c.name);
      if (!keyColumns.includes('token_id')) {
        this.db.exec('ALTER TABLE api_keys ADD COLUMN token_id TEXT;');
      }
      if (!keyColumns.includes('bound_token')) {
        this.db.exec('ALTER TABLE api_keys ADD COLUMN bound_token TEXT;');
      }
      this.db.exec('CREATE INDEX IF NOT EXISTS idx_api_keys_token_id ON api_keys(token_id);');
    } catch {}
  }

  private initDefaultAdmin() {
    const defaultEmail = 'tqd354@gmail.com';
    const defaultPass = 'aaAA1122';

    const checkStmt = this.db.prepare('SELECT id FROM admin_users WHERE email = ?');
    const existing = checkStmt.get(defaultEmail);

    if (!existing) {
      const { hash, salt } = hashPassword(defaultPass);
      const now = new Date().toISOString();
      const insertStmt = this.db.prepare(`
        INSERT OR IGNORE INTO admin_users (id, email, password_hash, password_salt, two_factor_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
      `);
      insertStmt.run(randomBytes(16).toString('hex'), defaultEmail, hash, salt, now, now);
      console.info('[Database] Default admin initialized securely.');
    }
  }

  public getRawDb(): DatabaseSync {
    return this.db;
  }
}

export const dbService = new DatabaseService();
export const db = dbService.getRawDb();
