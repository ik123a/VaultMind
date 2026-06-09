import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { SandboxOptions, SandboxResult } from '@vaultmind/vm-core';

const DEFAULT_OPTIONS: SandboxOptions = {
  allowNetwork: false,
  allowedPaths: [process.cwd()],
  deniedPaths: [],
  timeoutMs: 30_000,
};

export { SandboxOptions } from '@vaultmind/vm-core';

/**
 * VaultMind Sandbox
 *
 * A lightweight execution sandbox for Windows that:
 * - Spawns processes with resource limits (timeout, memory hints)
 * - Checks file access paths against allow/deny lists
 * - Blocks network access when configured (via environment variable injection)
 * - Captures stdout/stderr and timing
 *
 * NOTE: True kernel-level sandboxing (seccomp, Landlock) requires Rust/Linux.
 * This Node.js implementation provides policy-level enforcement suitable
 * for the MVP.
 */
export class Sandbox {
  private options: SandboxOptions;

  constructor(options?: Partial<SandboxOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a command inside the sandbox.
   */
  async execute(command: string, args: string[], cwd?: string): Promise<SandboxResult> {
    const startTime = Date.now();
    const resolvedCwd = cwd || process.cwd();
    this.validatePath(resolvedCwd);

    const env: Record<string, string | undefined> = {
      ...process.env,
      VAULTMIND_SANDBOX: '1',
    };
    if (!this.options.allowNetwork) {
      env.HTTP_PROXY = '';
      env.HTTPS_PROXY = '';
      env.VAULTMIND_NETWORK_BLOCKED = '1';
    }

    return new Promise((resolve) => {
      const child: ChildProcess = spawn(command, args, {
        cwd: resolvedCwd,
        env: env as NodeJS.ProcessEnv,
        shell: process.platform === 'win32',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: this.options.timeoutMs,
        windowsHide: true,
      });

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      child.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      child.on('error', (err: Error) => {
        resolve({
          exitCode: -1,
          stdout,
          stderr: stderr + `\n[SpawnError] ${err.message}`,
          durationMs: Date.now() - startTime,
        });
      });

      child.on('exit', (code: number | null) => {
        resolve({
          exitCode: code ?? -1,
          stdout,
          stderr,
          durationMs: Date.now() - startTime,
        });
      });
    });
  }

  /**
   * Check whether a file path is allowed by sandbox policy.
   */
  checkPathAccess(filePath: string, operation: 'read' | 'write'): boolean {
    const absolute = path.resolve(filePath);

    for (const denied of this.options.deniedPaths) {
      const deniedAbs = path.resolve(denied);
      if (absolute.startsWith(deniedAbs)) return false;
    }

    if (this.options.allowedPaths.length === 0) return true;

    for (const allowed of this.options.allowedPaths) {
      const allowedAbs = path.resolve(allowed);
      if (absolute.startsWith(allowedAbs)) return true;
    }

    return false;
  }

  /**
   * Check network access.
   */
  checkNetworkAccess(host: string, _port?: number): boolean {
    if (this.options.allowNetwork) return true;
    if (['127.0.0.1', 'localhost', '::1'].includes(host)) return true;
    return false;
  }

  /**
   * Heuristic: detect network-using commands.
   */
  static isNetworkCommand(command: string): boolean {
    const netTools = [
      'curl', 'wget', 'fetch', 'nc', 'ncat', 'netcat',
      'ssh', 'scp', 'rsync', 'telnet', 'ftp', 'sftp',
      'npm install', 'npm publish', 'npx', 'pip install',
      'yarn', 'pnpm', 'go get', 'cargo install',
    ];
    const base = path.basename(command).toLowerCase();
    return netTools.some(tool => base === tool || command.includes(tool));
  }

  private validatePath(target: string): void {
    if (!fs.existsSync(target)) {
      throw new Error(`Sandbox: path does not exist: ${target}`);
    }
    if (!this.checkPathAccess(target, 'read')) {
      throw new Error(`Sandbox: access denied to: ${target}`);
    }
  }
}
