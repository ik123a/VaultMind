// ─── Policy Types ──────────────────────────────────────────────

export type Verdict = 'allow' | 'deny' | 'error';
export type AgentName = 'claude' | 'cursor' | 'vscode' | 'generic';

export interface PolicyRule {
  id?: string;
  description?: string;
  allow?: string[];
  deny?: string[];
  network?: 'on' | 'off' | 'allowlist';
  resources?: {
    cpu?: string;
    memory?: string;
    timeout?: number;
  };
}

export interface PolicyConfig {
  version: string;
  rules: PolicyRule[];
  default_action?: 'allow' | 'deny';
  audit?: {
    enabled: boolean;
    log_level?: 'info' | 'warn' | 'error';
  };
}

// ─── Session / Event Types ────────────────────────────────────

export interface Session {
  id: string;
  startTime: number;
  policyHash?: string;
  status: 'recording' | 'analyzing' | 'done';
}

export interface Event {
  id?: number;
  sessionId: string;
  ts: number;
  agent: AgentName;
  tool: string;
  params: Record<string, unknown>;
  verdict: Verdict;
  reason?: string;
}

// ─── MCP Wire Protocol (subset) ────────────────────────────────

export interface MCPRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: string;
  params?: Record<string, unknown>;
}

export interface MCPResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
}

// ─── Dependency Memoisation / SBOM ─────────────────────────────

export interface DependencyNode {
  name: string;
  version: string;
  path: string;
  dependencies: string[];
  hash: string;
}

export interface DependencyGraph {
  root: string;
  nodes: Map<string, DependencyNode>;
}

export interface VaultLockEntry {
  package: string;
  version: string;
  status: 'allow' | 'deny' | 'unknown';
  cves?: string[];
  hash: string;
}

export interface VaultLock {
  version: string;
  timestamp: number;
  entries: VaultLockEntry[];
}

// ─── Sandbox Types ─────────────────────────────────────────────

export interface SandboxOptions {
  allowNetwork: boolean;
  allowedPaths: string[];
  deniedPaths: string[];
  memoryLimit?: string;
  cpuLimit?: string;
  timeoutMs: number;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  durationMs: number;
  resourceUsage?: {
    memoryBytes?: number;
    cpuTimeMs?: number;
  };
}
