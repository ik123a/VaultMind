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

function isWithinPath(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === '' ||
    (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

/** Resolve existing links, retaining missing descendants for prospective writes. */
function resolvePolicyPath(target: string): string {
  let current = target || '.';
  const missing: string[] = [];

  for (;;) {
    let real: string;
    try {
      real = fs.realpathSync.native(current);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;

      // A dangling link is an existing entry, not a safe missing descendant.
      let entryExists = false;
      try {
        fs.lstatSync(current);
        entryExists = true;
      } catch (statError) {
        if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
      }
      if (entryExists) throw error;

      const parent = path.dirname(current);
      if (parent === current) throw error;
      missing.unshift(path.basename(current));
      current = parent;
      continue;
    }

    if (missing.length > 0 && !fs.statSync(real).isDirectory()) {
      throw new Error('Sandbox: path ancestor is not a directory');
    }
    return path.resolve(real, ...missing);
  }
}

/**
 * VaultMind Sandbox
 *
 * A process runner with a working-directory policy check, timeout, and output capture.
 * checkPathAccess is an explicit preflight helper, not filesystem enforcement.
 * Network-related environment variables are advisory and do not block sockets.
 *
 * This implementation provides no OS isolation on any platform. Children inherit
 * the host environment and permissions; Windows execution uses a command shell.
 * Only use trusted commands, or supply an independently enforced OS sandbox.
 */
export class Sandbox {
  private options: SandboxOptions;

  constructor(options?: Partial<SandboxOptions>) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Execute a trusted command after checking its working directory.
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
   * Check lexical and resolved path containment against the same policy for reads
   * and writes. Filesystem changes after this check are not prevented.
   */
  checkPathAccess(filePath: string, _operation: 'read' | 'write'): boolean {
    try {
      const absolute = path.resolve(filePath);
      const real = resolvePolicyPath(filePath);

      for (const denied of this.options.deniedPaths) {
        if (isWithinPath(path.resolve(denied), absolute) ||
            isWithinPath(resolvePolicyPath(denied), real)) return false;
      }

      if (this.options.allowedPaths.length === 0) return true;

      for (const allowed of this.options.allowedPaths) {
        if (isWithinPath(path.resolve(allowed), absolute) &&
            isWithinPath(resolvePolicyPath(allowed), real)) return true;
      }
    } catch {
      // Invalid paths, inaccessible ancestors, and unresolved links fail closed.
      return false;
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
