import * as http from 'http';
import * as url from 'url';
import * as fs from 'fs';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { MCPGateway, GatewayEvent } from './gateway';
import { PolicyConfig, VaultDB, loadPolicy } from '@vaultmind/vm-core';
import { PolicyValidator } from './validator';

export interface ServerOptions {
  port: number;
  policyPath?: string;
  dbPath?: string;
  dashboardPath?: string;
}

function resolveDashboardPath(): string {
  // Always resolve from CWD (project root when using CLI)
  const cwdPath = path.join(process.cwd(), 'dashboard', 'dist');
  return cwdPath;
}

const DEFAULT_OPTIONS: ServerOptions = {
  port: 3080,
  dashboardPath: resolveDashboardPath(),
};

/**
 * VaultMind API Server
 *
 * Serves:
 *   - POST /v1/sessions — create a new auditing session
 *   - WS /v1/stream — real-time event stream
 *   - GET /v1/sessions/:id/events — paginated audit history
 *   - POST /v1/policies/validate — syntax/security check for policy.yaml
 *   - POST /v1/sessions/:id/stop — end session + generate report
 *   - GET /v1/stats — overview statistics
 *   - Dashboard static files (if available)
 */
export class VaultMindServer {
  private options: ServerOptions;
  private db: VaultDB;
  private httpServer: http.Server;
  private wss: WebSocketServer;
  private activeGateways: Map<string, MCPGateway> = new Map();
  private wsClients: Set<WebSocket> = new Set();

  constructor(options?: Partial<ServerOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.db = new VaultDB(this.options.dbPath);
    this.httpServer = http.createServer((req, res) => this.handleRequest(req, res));
    this.wss = new WebSocketServer({ noServer: true });

    // WebSocket upgrade handling
    this.httpServer.on('upgrade', (request, socket, head) => {
      const pathname = url.parse(request.url!).pathname;
      if (pathname === '/v1/stream') {
        this.wss.handleUpgrade(request, socket, head, (ws) => {
          this.wsClients.add(ws);
          ws.on('close', () => this.wsClients.delete(ws));
        });
      } else {
        socket.destroy();
      }
    });
  }

  async start(): Promise<void> {
    return new Promise((resolve) => {
      this.httpServer.listen(this.options.port, '0.0.0.0', () => {
        console.log(`[VaultMind] Server running on http://0.0.0.0:${this.options.port}`);
        console.log(`[VaultMind] WebSocket stream at ws://127.0.0.1:${this.options.port}/v1/stream`);
        resolve();
      });
    });
  }

  stop(): void {
    this.httpServer.close();
    this.wss.close();
    this.db.close();
  }

  private async handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || '', true);
    const pathname = parsedUrl.pathname || '';

    try {
      if (pathname === '/v1/sessions' && req.method === 'POST') {
        await this.createSession(req, res);
      } else if (pathname === '/v1/policies/validate' && req.method === 'POST') {
        await this.validatePolicy(req, res);
      } else if (pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/) && req.method === 'GET') {
        const id = pathname.match(/^\/v1\/sessions\/([^/]+)\/events$/)?.[1];
        if (id) await this.getSessionEvents(id, req, res);
        else this.notFound(res);
      } else if (pathname.match(/^\/v1\/sessions\/([^/]+)\/stop$/) && req.method === 'POST') {
        const id = pathname.match(/^\/v1\/sessions\/([^/]+)\/stop$/)?.[1];
        if (id) await this.stopSession(id, req, res);
        else this.notFound(res);
      } else if (pathname === '/v1/stats' && req.method === 'GET') {
        await this.getStats(res);
      } else {
        // Try serving dashboard static files
        await this.serveDashboard(pathname, res);
      }
    } catch (err: unknown) {
      this.jsonResponse(res, 500, { error: (err as Error).message });
    }
  }

  /* ──────────────── Route Handlers ────────────────────────────── */

  private async createSession(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const policyPath = body ? JSON.parse(body).policyPath : undefined;

    const policy: PolicyConfig = loadPolicy(policyPath);
    const sessionId = crypto.randomUUID();

    const gateway = new MCPGateway(policy, sessionId, this.db);
    gateway.on('event', (event: GatewayEvent) => {
      this.broadcast(event);
    });
    this.activeGateways.set(sessionId, gateway);

    this.jsonResponse(res, 201, {
      sessionId,
      wsUrl: `ws://localhost:${this.options.port}/v1/stream`,
      policy: policy,
    });
  }

  private async validatePolicy(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const body = await this.readBody(req);
    const policy: PolicyConfig = JSON.parse(body);
    const result = PolicyValidator.validate(policy);
    this.jsonResponse(res, result.valid ? 200 : 422, result);
  }

  private async getSessionEvents(sessionId: string, _req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const events = this.db.getSessionEvents(sessionId);
    const stats = this.db.getSessionStats(sessionId);
    this.jsonResponse(res, 200, { sessionId, events, stats });
  }

  private async stopSession(sessionId: string, _req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
    const gateway = this.activeGateways.get(sessionId);
    if (gateway) {
      gateway.endSession();
      this.activeGateways.delete(sessionId);
    } else {
      this.db.endSession(sessionId);
    }
    const stats = this.db.getSessionStats(sessionId);
    this.jsonResponse(res, 200, { sessionId, status: 'done', stats });
  }

  private async getStats(res: http.ServerResponse): Promise<void> {
    this.jsonResponse(res, 200, {
      activeSessions: this.activeGateways.size,
      wsConnections: this.wsClients.size,
      status: 'running',
    });
  }

  private async serveDashboard(pathname: string, res: http.ServerResponse): Promise<void> {
    const dashboardDir = this.options.dashboardPath!;
    let filePath = pathname === '/' || pathname === '' ? '/index.html' : pathname;
    const fullPath = path.join(dashboardDir, filePath);

    try {
      const content = fs.readFileSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const mimeTypes: Record<string, string> = {
        '.html': 'text/html',
        '.js': 'application/javascript',
        '.css': 'text/css',
        '.json': 'application/json',
        '.png': 'image/png',
        '.svg': 'image/svg+xml',
      };
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(content);
    } catch {
      // Fallback: serve index.html for SPA routing
      try {
        const idx = fs.readFileSync(path.join(dashboardDir, 'index.html'));
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(idx);
      } catch {
        this.notFound(res);
      }
    }
  }

  /* ──────────────── Helpers ──────────────────────────────────── */

  private broadcast(event: GatewayEvent): void {
    const msg = JSON.stringify(event);
    for (const ws of this.wsClients) {
      try { ws.send(msg); } catch { /* client disconnected */ }
    }
  }

  private jsonResponse(res: http.ServerResponse, status: number, data: unknown): void {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(data));
  }

  private notFound(res: http.ServerResponse): void {
    this.jsonResponse(res, 404, { error: 'Not found' });
  }

  private readBody(req: http.IncomingMessage): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: string) => (body += chunk));
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}
