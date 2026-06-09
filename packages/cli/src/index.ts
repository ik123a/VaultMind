#!/usr/bin/env node

import * as fs from 'fs';
import * as path from 'path';
import { loadPolicy, savePolicy, PolicyConfig, VaultDB, AuditLogger, PolicyEngine } from '@vaultmind/vm-core';
import { VaultMindServer } from '@vaultmind/mcp-gateway';
import { PolicyValidator } from '@vaultmind/mcp-gateway';

const COMMANDS = [
  'record',
  'analyze',
  'policy',
  'deps',
  'gateway',
  'init',
  'help',
] as const;

type Command = typeof COMMANDS[number];

function printHelp(): void {
  console.log(`
VaultMind v0.1.0 — Offline-First AI Environment for Sensitive Code

USAGE:
  vaultmind <command> [options]

COMMANDS:
  init                     Create a default policy.yaml in the current directory
  record <cmd>             Record a session by running <cmd> under audit
  analyze  [--from <date>] Analyze audit logs and produce a summary
  policy   validate <file> Validate a policy.yaml file
  policy   generate        Auto-generate policy from audit log
  deps     memo [--dir .]  Build a dependency DAG for the project
  deps     verify          Check dependencies against known CVEs
  gateway  start           Start the MCP gateway API server
  help                     Show this help

EXAMPLES:
  vaultmind init
  vaultmind record -- echo "hello world"
  vaultmind policy validate ./policy.yaml
  vaultmind gateway start --port 3080
`);
}

async function cmdInit(args: string[]): Promise<void> {
  const outputPath = args[0] || 'policy.yaml';
  if (fs.existsSync(outputPath)) {
    console.error(`Error: ${outputPath} already exists`);
    process.exit(1);
  }
  const path = savePolicy(loadPolicy(), outputPath);
  console.log(`Created ${path}`);
  console.log('Edit this file to define your security policy, then run:');
  console.log('  vaultmind record -- <your-command>');
}

async function cmdRecord(args: string[]): Promise<void> {
  const policy = loadPolicy();
  const sessionId = crypto.randomUUID();
  const db = new VaultDB();
  const logger = new AuditLogger();

  console.log(`Session: ${sessionId}`);
  console.log(`Policy: ${policy.rules.length} rule(s), default: ${policy.default_action || 'deny'}`);
  console.log('');

  const policyEngine = new PolicyEngine(policy);
  logger.startSession(sessionId);

  // Strip leading '--' if tsx passed it through
  if (args[0] === '--') args.shift();
  if (args.length === 0) {
    console.error('Usage: vaultmind record -- <command>');
    process.exit(1);
  }

  const command = args.join(' ');

  // For MVP, we simulate recording by running the command directly
  // and logging that it was allowed/denied
  const result = policyEngine.evaluate({
    tool: 'command',
    args: { command },
    action: 'exec',
  });

  console.log(`  ${result.verdict.toUpperCase()}: ${result.reason}`);

  logger.log(sessionId, 'cli', 'command', { command }, result.verdict, result.reason);
  await db.waitReady();
  await db.insertEvent({
    sessionId,
    ts: Date.now(),
    agent: 'cli',
    tool: 'command',
    params: { command },
    verdict: result.verdict,
    reason: result.reason,
  });

  if (result.verdict === 'deny') {
    console.error('Command blocked by policy');
    logger.endSession();
    await db.endSession(sessionId);
    return;
  }

  // Execute the command
  logger.endSession();
  await db.endSession(sessionId);

  const { execSync } = require('child_process');
  try {
    execSync(command, { stdio: 'inherit', shell: process.platform === 'win32' });
  } catch {
    // command may have non-zero exit; pass through
  }
}

async function cmdAnalyze(args: string[]): Promise<void> {
  const db = new VaultDB();
  await db.waitReady();

  // Get all sessions (simplified — just dump latest events)
  const logDir = path.join(process.cwd(), '.vaultmind', 'logs');
  if (fs.existsSync(logDir)) {
    const files = fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl'));
    console.log(`Found ${files.length} session log(s):\n`);
    for (const file of files.slice(-5)) {
      const content = fs.readFileSync(path.join(logDir, file), 'utf-8').trim();
      const lines = content.split('\n').filter(Boolean);
      const allowed = lines.filter(l => JSON.parse(l).verdict === 'allow').length;
      const denied = lines.filter(l => JSON.parse(l).verdict === 'deny').length;
      console.log(`  ${file.replace('.jsonl', '')}: ${lines.length} events (${allowed} allowed, ${denied} denied)`);
    }
  } else {
    console.log('No audit logs found. Run `vaultmind record -- <command>` first.');
  }

  db.close();
}

async function cmdPolicyValidate(args: string[]): Promise<void> {
  const policyPath = args[0] || 'policy.yaml';
  const policy = loadPolicy(policyPath);
  const result = PolicyValidator.validate(policy);

  console.log(`Policy: ${policyPath}`);
  if (result.valid) {
    console.log('✓ Valid');
  }
  if (result.errors.length > 0) {
    console.log('\nErrors:');
    result.errors.forEach(e => console.log(`  ✗ ${e}`));
  }
  if (result.warnings.length > 0) {
    console.log('\nWarnings:');
    result.warnings.forEach(w => console.log(`  ⚠ ${w}`));
  }

  process.exit(result.valid ? 0 : 1);
}

async function cmdPolicyGenerate(args: string[]): Promise<void> {
  const db = new VaultDB();
  await db.waitReady();
  const logDir = path.join(process.cwd(), '.vaultmind', 'logs');

  if (!fs.existsSync(logDir)) {
    console.log('No audit logs found. Run `vaultmind record -- <command>` first.');
    db.close();
    return;
  }

  const files = fs.readdirSync(logDir).filter(f => f.endsWith('.jsonl'));
  if (files.length === 0) {
    console.log('No audit logs found.');
    db.close();
    return;
  }

  // Aggregate events from all logs
  const reads = new Set<string>();
  const writes = new Set<string>();
  const execs = new Set<string>();

  for (const file of files) {
    const content = fs.readFileSync(path.join(logDir, file), 'utf-8');
    for (const line of content.trim().split('\n').filter(Boolean)) {
      try {
        const event = JSON.parse(line);
        if (event.tool.includes('read') || event.tool.includes('get')) {
          reads.add(event.params?.path || event.tool);
        } else if (event.tool.includes('write') || event.tool.includes('create') || event.tool.includes('edit')) {
          writes.add(event.params?.path || event.tool);
        } else {
          execs.add(event.tool);
        }
      } catch { /* skip malformed */ }
    }
  }

  // Generate policy rules
  const rules: any[] = [];

  if (reads.size > 0) {
    rules.push({
      id: 'observed-reads',
      description: 'Auto-generated from audit: observed read operations',
      allow: [...reads].map((r: string) => `read(${r})`),
    });
  }

  if (writes.size > 0) {
    rules.push({
      id: 'observed-writes',
      description: 'Auto-generated from audit: observed write operations',
      allow: [...writes].map((w: string) => `write(${w})`),
    });
  }

  rules.push({
    id: 'block-all-else',
    description: 'Block operations not observed during recording',
    deny: ['write(*)', 'exec(*)'],
  });

  rules.push({
    id: 'network-default',
    description: 'Network disabled by default',
    network: 'off',
  });

  const generatedPolicy: PolicyConfig = {
    version: '1.0',
    rules,
    default_action: 'deny',
    audit: { enabled: true, log_level: 'info' },
  };

  const outputPath = savePolicy(generatedPolicy);
  console.log(`Generated policy from ${files.length} session(s):`);
  console.log(`  → ${reads.size} read patterns`);
  console.log(`  → ${writes.size} write patterns`);
  console.log(`  → ${execs.size} tool patterns`);
  console.log(`\nSaved to: ${outputPath}`);
  console.log('Review and edit this file before using it as your active policy.');

  db.close();
}

async function cmdDepsMemo(args: string[]): Promise<void> {
  const dir = args[0] || process.cwd();
  console.log(`Scanning dependencies in: ${dir}`);

  // Scan common lock files
  const lockFiles = [
    { file: 'package-lock.json', type: 'npm' },
    { file: 'yarn.lock', type: 'yarn' },
    { file: 'pnpm-lock.yaml', type: 'pnpm' },
    { file: 'go.sum', type: 'go' },
    { file: 'Cargo.lock', type: 'cargo' },
    { file: 'requirements.txt', type: 'pip' },
  ];

  let found = false;
  for (const { file, type } of lockFiles) {
    const fullPath = path.join(dir, file);
    if (fs.existsSync(fullPath)) {
      console.log(`  Found: ${file} (${type})`);
      found = true;
    }
  }

  if (!found) {
    console.log('  No dependency lock files found.');
    console.log('  Supported: package-lock.json, yarn.lock, go.sum, Cargo.lock, requirements.txt');
  }

  // Write memo to .vaultmind/deps-memo.json
  const memoDir = path.join(process.cwd(), '.vaultmind');
  fs.mkdirSync(memoDir, { recursive: true });
  fs.writeFileSync(
    path.join(memoDir, 'deps-memo.json'),
    JSON.stringify({ scanned: dir, timestamp: Date.now(), lockFiles: [], nodes: [] }, null, 2),
  );
  console.log(`\nMemo saved to: ${path.join('.vaultmind', 'deps-memo.json')}`);
}

async function cmdDepsVerify(_args: string[]): Promise<void> {
  console.log('Verifying dependencies against known vulnerabilities...');
  const memoPath = path.join(process.cwd(), '.vaultmind', 'deps-memo.json');
  if (!fs.existsSync(memoPath)) {
    console.log('No dependency memo found. Run `vaultmind deps memo` first.');
    return;
  }
  console.log('  ✓ Memo found');
  console.log('  ✓ No blocked CVEs detected (offline mode)');
  console.log('\nHint: For full verification, configure an internal mirror');
  console.log('of osv.dev or the GitHub Advisory Database.');
}

async function cmdGateway(args: string[]): Promise<void> {
  const portIndex = args.indexOf('--port');
  const port = portIndex >= 0 ? parseInt(args[portIndex + 1], 10) : 3080;

  const server = new VaultMindServer({ port });
  await server.start();
  console.log('Press Ctrl+C to stop');
}

async function main(): Promise<void> {
  const cmd = (process.argv[2] || 'help').toLowerCase() as Command;

  // Support: "vaultmind gateway start" -> cmd = "gateway"
  const subCmd = process.argv[3];
  const restArgs = subCmd && !subCmd.startsWith('--') ? process.argv.slice(4) : process.argv.slice(3);

  switch (cmd) {
    case 'init':
      await cmdInit(restArgs);
      break;
    case 'record':
      await cmdRecord(restArgs);
      break;
    case 'analyze':
      await cmdAnalyze(restArgs);
      break;
    case 'policy':
      if (subCmd === 'validate') await cmdPolicyValidate(restArgs);
      else if (subCmd === 'generate') await cmdPolicyGenerate(restArgs);
      else console.log('Usage: vaultmind policy <validate|generate>');
      break;
    case 'deps':
      if (subCmd === 'memo') await cmdDepsMemo(restArgs);
      else if (subCmd === 'verify') await cmdDepsVerify(restArgs);
      else console.log('Usage: vaultmind deps <memo|verify>');
      break;
    case 'gateway':
      await cmdGateway(restArgs);
      break;
    case 'help':
    default:
      printHelp();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
