import * as fs from 'fs';
import * as path from 'path';
import { Event, Verdict } from './types';

/**
 * VaultMind AuditLogger
 *
 * Writes structured JSONL event logs so the dashboard and CLI audit
 * commands can replay and analyse every agent action.
 */
export class AuditLogger {
  private logDir: string;
  private stream?: fs.WriteStream;

  constructor(logDir?: string) {
    this.logDir = logDir || path.join(process.cwd(), '.vaultmind', 'logs');
  }

  startSession(sessionId: string): void {
    fs.mkdirSync(this.logDir, { recursive: true });
    const logPath = path.join(this.logDir, `${sessionId}.jsonl`);
    this.stream = fs.createWriteStream(logPath, { flags: 'a' });
  }

  logEvent(event: Event): void {
    if (!this.stream) {
      console.warn('[audit] No active session stream – did you forget startSession()?');
      return;
    }
    this.stream.write(JSON.stringify(event) + '\n');
  }

  log(
    sessionId: string,
    agent: string,
    tool: string,
    params: Record<string, unknown>,
    verdict: Verdict,
    reason?: string,
  ): void {
    const event: Event = {
      sessionId,
      ts: Date.now(),
      agent: agent as Event['agent'],
      tool,
      params,
      verdict,
      reason,
    };
    this.logEvent(event);
  }

  endSession(): void {
    this.stream?.end();
    this.stream = undefined;
  }

  getSessionLogPath(sessionId: string): string {
    return path.join(this.logDir, `${sessionId}.jsonl`);
  }
}
