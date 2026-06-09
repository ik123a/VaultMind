import { PolicyConfig, Event, MCPRequest, MCPResponse, VaultDB, loadPolicy, PolicyEngine } from '@vaultmind/vm-core';

/**
 * VaultMind SDK Client
 *
 * Programmatic API for:
 * - Creating audit sessions
 * - Intercepting and evaluating tool calls
 * - Querying event history
 * - Generating policy from audit logs
 */
export class VaultMindClient {
  private policy: PolicyConfig;
  private engine: PolicyEngine;
  private db: VaultDB;
  private sessionId?: string;

  constructor(policyPath?: string) {
    this.policy = loadPolicy(policyPath);
    this.engine = new PolicyEngine(this.policy);
    this.db = new VaultDB();
  }

  /** Start a new audit session */
  async startSession(id?: string): Promise<string> {
    this.sessionId = id || crypto.randomUUID();
    await this.db.createSession(this.sessionId);
    return this.sessionId;
  }

  /** Evaluate and record a tool call */
  async evaluateCall(params: {
    tool: string;
    args: Record<string, unknown>;
    action: 'read' | 'write' | 'exec' | 'network';
    path?: string;
    agent?: string;
  }): Promise<{ verdict: string; reason: string }> {
    if (!this.sessionId) {
      await this.startSession();
    }
    const result = this.engine.evaluate(params);
    await this.db.insertEvent({
      sessionId: this.sessionId!,
      ts: Date.now(),
      agent: params.agent || 'sdk',
      tool: params.tool,
      params: params.args,
      verdict: result.verdict,
      reason: result.reason,
    });
    return result;
  }

  /** Get events for current session */
  getEvents(limit = 100): Record<string, unknown>[] {
    if (!this.sessionId) return [];
    return this.db.getSessionEvents(this.sessionId, limit);
  }

  /** Get session statistics */
  getStats(): { total: number; allowed: number; denied: number; errors: number } {
    if (!this.sessionId) return { total: 0, allowed: 0, denied: 0, errors: 0 };
    return this.db.getSessionStats(this.sessionId);
  }

  /** End the current session */
  async endSession(): Promise<void> {
    if (this.sessionId) {
      await this.db.endSession(this.sessionId);
      this.sessionId = undefined;
    }
  }

  /** Get the active policy */
  getPolicy(): PolicyConfig {
    return this.policy;
  }

  /** Update the active policy */
  setPolicy(policy: PolicyConfig): void {
    this.policy = policy;
    this.engine = new PolicyEngine(policy);
  }

  close(): void {
    this.db.close();
  }
}
