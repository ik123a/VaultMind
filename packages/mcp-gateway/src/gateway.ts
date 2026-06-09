import { MCPRequest, MCPResponse, PolicyConfig } from '@vaultmind/vm-core';
import { PolicyEngine } from '@vaultmind/vm-core';
import { AuditLogger, VaultDB } from '@vaultmind/vm-core';
import { Sandbox } from '@vaultmind/vm-sandbox';
import { EventEmitter } from 'events';

export interface GatewayEvent {
  type: 'request' | 'response' | 'blocked' | 'error';
  request: MCPRequest;
  response?: MCPResponse;
  verdict?: string;
  reason?: string;
  ts: number;
}

/**
 * VaultMind MCP Gateway
 *
 * Sits between AI coding agents (Claude, Cursor, VS Code) and the
 * tools they call.  Every request is:
 *   1. Intercepted and logged
 *   2. Evaluated against the active policy
 *   3. Allowed (forwarded) or denied (blocked with audit trail)
 *
 * Emits 'event' for real-time streaming to the dashboard.
 */
export class MCPGateway extends EventEmitter {
  private policyEngine: PolicyEngine;
  private logger: AuditLogger;
  private db: VaultDB;
  private sandbox: Sandbox;
  private sessionId: string;

  constructor(
    policy: PolicyConfig,
    sessionId: string,
    db: VaultDB,
    sandbox?: Sandbox,
    logger?: AuditLogger,
  ) {
    super();
    this.policyEngine = new PolicyEngine(policy);
    this.sessionId = sessionId;
    this.db = db;
    this.logger = logger || new AuditLogger();
    this.sandbox = sandbox || new Sandbox({ allowNetwork: false });
    this.logger.startSession(sessionId);
  }

  /**
   * Process an incoming MCP request from the agent.
   * Returns either the original request to forward, or a blocked response.
   */
  async processRequest(request: MCPRequest): Promise<{
    action: 'forward' | 'block' | 'error';
    response?: MCPResponse;
  }> {
    const ts = Date.now();

    try {
      // Map MCP tool call to policy action
      const { action: policyAction, filePath } = this.classifyTool(request);
      const args = request.params || {};

      // Evaluate against policy
      const result = this.policyEngine.evaluate({
        tool: request.method,
        args,
        action: policyAction,
        path: filePath,
      });

      // Check sandbox path access for file operations
      if (filePath && result.verdict === 'allow') {
        const sandboxOk = this.sandbox.checkPathAccess(
          filePath,
          policyAction === 'write' ? 'write' : 'read',
        );
        if (!sandboxOk) {
          const deniedEvent: GatewayEvent = {
            type: 'blocked',
            request,
            verdict: 'deny',
            reason: `Sandbox denied ${policyAction} access to: ${filePath}`,
            ts,
          };
          this.emit('event', deniedEvent);
          this.logger.log(this.sessionId, 'generic', request.method, args, 'deny', deniedEvent.reason);
          this.db.insertEvent({
            sessionId: this.sessionId,
            ts,
            agent: 'generic',
            tool: request.method,
            params: args,
            verdict: 'deny',
            reason: deniedEvent.reason,
          });
          return {
            action: 'block',
            response: this.buildError(request, 'Access denied by sandbox', -32000),
          };
        }
      }

      // Log the event
      this.logger.log(this.sessionId, 'generic', request.method, args, result.verdict, result.reason);
      this.db.insertEvent({
        sessionId: this.sessionId,
        ts,
        agent: 'generic',
        tool: request.method,
        params: args,
        verdict: result.verdict,
        reason: result.reason,
      });

      // Emit for real-time dashboard
      const gatewayEvent: GatewayEvent = {
        type: result.verdict === 'allow' ? 'request' : 'blocked',
        request,
        verdict: result.verdict,
        reason: result.reason,
        ts,
      };
      this.emit('event', gatewayEvent);

      if (result.verdict === 'deny') {
        return {
          action: 'block',
          response: this.buildError(
            request,
            `Policy violation: ${result.reason}`,
            -32001,
          ),
        };
      }

      return { action: 'forward' };
    } catch (err: unknown) {
      const errorEvent: GatewayEvent = {
        type: 'error',
        request,
        verdict: 'error',
        reason: `Gateway error: ${(err as Error).message}`,
        ts,
      };
      this.emit('event', errorEvent);
      this.logger.log(this.sessionId, 'generic', request.method, request.params || {}, 'error', errorEvent.reason);
      return {
        action: 'error',
        response: this.buildError(request, `Gateway error: ${(err as Error).message}`, -32002),
      };
    }
  }

  /**
   * Build a standard MCP error response.
   */
  private buildError(request: MCPRequest, message: string, code: number): MCPResponse {
    return {
      jsonrpc: '2.0',
      id: request.id,
      error: { code, message },
    };
  }

  /**
   * Classify an MCP tool call into a policy action.
   */
  private classifyTool(request: MCPRequest): {
    action: 'read' | 'write' | 'exec' | 'network';
    filePath?: string;
  } {
    const method = request.method;
    const params = request.params || {};

    // File system tools (Claude/Cursor MCP conventions)
    if (method.startsWith('read') || method.startsWith('get') || method.includes('read_file')) {
      return { action: 'read', filePath: (params.path || params.filePath || '').toString() };
    }
    if (method.startsWith('write') || method.startsWith('create') || method.startsWith('edit') || method.includes('write_file')) {
      return { action: 'write', filePath: (params.path || params.filePath || '').toString() };
    }
    if (method.startsWith('delete') || method.startsWith('remove') || method.startsWith('rm')) {
      return { action: 'write', filePath: (params.path || params.filePath || '').toString() };
    }
    if (method.startsWith('exec') || method.startsWith('run') || method.startsWith('bash') || method.startsWith('command') || method.includes('execute')) {
      return { action: 'exec' };
    }
    if (method.startsWith('http') || method.startsWith('fetch') || method.startsWith('request') || method.startsWith('network') || method.includes('curl')) {
      return { action: 'network' };
    }

    // Default: tool operations are exec-like
    return { action: 'exec' };
  }

  /**
   * End the session and clean up.
   */
  endSession(): void {
    this.logger.endSession();
    this.db.endSession(this.sessionId);
  }
}
