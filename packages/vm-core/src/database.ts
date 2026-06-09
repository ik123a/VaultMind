import initSqlJs, { Database as SqlJsDatabase } from 'sql.js';
import * as fs from 'fs';
import * as path from 'path';

/**
 * VaultMind Database (sql.js backend – zero native deps)
 *
 * Lightweight SQLite store for sessions, events, and policy versions.
 * Schema mirrors the project specification exactly.
 *
 * Data is persisted to a single file at the configured path.
 */
export class VaultDB {
  private db!: SqlJsDatabase;
  private dbPath: string;
  private ready: Promise<void>;

  constructor(dbPath?: string) {
    this.dbPath = dbPath || path.join(process.cwd(), '.vaultmind', 'vault.db');
    this.ready = this.init();
  }

  async waitReady(): Promise<void> {
    await this.ready;
  }

  /* ─────────────────── Initialisation ───────────────────────── */

  private async init(): Promise<void> {
    const SQL = await initSqlJs();
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });

    // Load existing DB file or create new one
    try {
      const buffer = fs.readFileSync(this.dbPath);
      this.db = new SQL.Database(buffer);
    } catch {
      this.db = new SQL.Database();
    }

    this.db.run('PRAGMA journal_mode = WAL');
    this.runSchema();
    this.save(); // persist empty schema
  }

  private runSchema(): void {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS sessions (
        id         TEXT PRIMARY KEY,
        start_time INTEGER NOT NULL,
        policy_hash TEXT,
        status     TEXT CHECK(status IN ('recording','analyzing','done')) DEFAULT 'recording'
      );

      CREATE TABLE IF NOT EXISTS events (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL,
        ts         INTEGER NOT NULL,
        agent      TEXT NOT NULL,
        tool       TEXT NOT NULL,
        params     TEXT NOT NULL,
        verdict    TEXT CHECK(verdict IN ('allow','deny','error')) NOT NULL,
        reason     TEXT,
        FOREIGN KEY(session_id) REFERENCES sessions(id)
      );

      CREATE TABLE IF NOT EXISTS policies (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        version    TEXT NOT NULL,
        content    TEXT NOT NULL,
        created_by TEXT,
        applied_at INTEGER DEFAULT (strftime('%s','now'))
      );
    `);
  }

  /** Write the in-memory DB back to disk. */
  private save(): void {
    const data = this.db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(this.dbPath, buffer);
  }

  /* ─────────────────── Sessions ──────────────────────────────── */

  async createSession(id: string, policyHash?: string): Promise<void> {
    await this.ready;
    this.db.run(
      'INSERT OR IGNORE INTO sessions (id, start_time, policy_hash, status) VALUES (?, ?, ?, ?)',
      [id, Date.now(), policyHash ?? null, 'recording'],
    );
    this.save();
  }

  async endSession(id: string): Promise<void> {
    await this.ready;
    this.db.run('UPDATE sessions SET status = ? WHERE id = ?', ['done', id]);
    this.save();
  }

  /* ─────────────────── Events ────────────────────────────────── */

  async insertEvent(event: {
    sessionId: string;
    ts: number;
    agent: string;
    tool: string;
    params: Record<string, unknown>;
    verdict: string;
    reason?: string;
  }): Promise<void> {
    await this.ready;
    this.db.run(
      'INSERT INTO events (session_id, ts, agent, tool, params, verdict, reason) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [
        event.sessionId,
        event.ts,
        event.agent,
        event.tool,
        JSON.stringify(event.params),
        event.verdict,
        event.reason ?? null,
      ],
    );
    this.save();
  }

  getSessionEvents(
    sessionId: string,
    limit = 100,
    offset = 0,
  ): Record<string, unknown>[] {
    const stmt = this.db.prepare(
      'SELECT * FROM events WHERE session_id = ? ORDER BY ts DESC LIMIT ? OFFSET ?',
    );
    stmt.bind([sessionId, limit, offset]);
    const rows: Record<string, unknown>[] = [];
    while (stmt.step()) {
      rows.push(stmt.getAsObject());
    }
    stmt.free();
    return rows;
  }

  getSessionStats(
    sessionId: string,
  ): { total: number; allowed: number; denied: number; errors: number } {
    const stmt = this.db.prepare(
      `SELECT
         COUNT(*)                                         AS total,
         SUM(CASE WHEN verdict = 'allow' THEN 1 ELSE 0 END) AS allowed,
         SUM(CASE WHEN verdict = 'deny'  THEN 1 ELSE 0 END) AS denied,
         SUM(CASE WHEN verdict = 'error' THEN 1 ELSE 0 END) AS errors
       FROM events
       WHERE session_id = ?`,
    );
    stmt.bind([sessionId]);
    const row = stmt.getAsObject() as {
      total: number;
      allowed: number;
      denied: number;
      errors: number;
    };
    stmt.free();
    return row ?? { total: 0, allowed: 0, denied: 0, errors: 0 };
  }

  /* ─────────────────── Policies ──────────────────────────────── */

  async savePolicy(version: string, content: string, createdBy?: string): Promise<void> {
    await this.ready;
    this.db.run(
      'INSERT INTO policies (version, content, created_by) VALUES (?, ?, ?)',
      [version, content, createdBy ?? null],
    );
    this.save();
  }

  /* ─────────────────── Lifecycle ─────────────────────────────── */

  close(): void {
    this.save();
    this.db.close();
  }
}
