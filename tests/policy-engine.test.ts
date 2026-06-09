/**
 * VaultMind Integration Tests
 *
 * Tests the policy engine, validation, and end-to-end flows.
 * Run with: npx vitest run
 */

import { describe, it, expect } from 'vitest';
// Direct imports from compiled vm-core (tests run inside the workspace)
const { PolicyEngine } = require('../packages/vm-core/dist/policy-engine');
const { PolicyConfig } = require('../packages/vm-core/dist/types');

/* ────────── Policy Engine Tests ──────────────────────────── */

const basePolicy: PolicyConfig = {
  version: '1.0',
  rules: [
    { id: 'allow-docs', allow: ['read(docs/*)', 'read(*.md)'], deny: ['write(*)'] },
    { id: 'network-off', network: 'off' },
  ],
  default_action: 'deny',
  audit: { enabled: true },
};

describe('PolicyEngine', () => {
  const engine = new PolicyEngine(basePolicy);

  it('allows permitted reads', () => {
    const result = engine.evaluate({ tool: 'read_file', args: {}, action: 'read', path: 'docs/guide.md' });
    expect(result.verdict).toBe('allow');
  });

  it('denies disallowed reads', () => {
    const result = engine.evaluate({ tool: 'read_file', args: {}, action: 'read', path: 'src/secrets.env' });
    expect(result.verdict).toBe('deny');
  });

  it('denies all writes', () => {
    const result = engine.evaluate({ tool: 'write_file', args: {}, action: 'write', path: 'docs/new.md' });
    expect(result.verdict).toBe('deny');
  });

  it('denies network access', () => {
    const result = engine.evaluate({ tool: 'fetch', args: {}, action: 'network', path: 'https://api.example.com' });
    expect(result.verdict).toBe('deny');
  });

  it('allows read of markdown files', () => {
    const result = engine.evaluate({ tool: 'read_file', args: {}, action: 'read', path: 'README.md' });
    expect(result.verdict).toBe('allow');
  });

  it('defaults to deny for unmatched actions', () => {
    const result = engine.evaluate({ tool: 'exec', args: {}, action: 'exec' });
    expect(result.verdict).toBe('deny');
  });
});

/* ────────── Per-pattern Tests ────────────────────────────── */

describe('PolicyEngine — glob patterns', () => {
  it('matches star glob correctly', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [{ id: 'allow-all-reads', allow: ['read(*)'] }],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'read_file', args: {}, action: 'read', path: 'anything/deep/file.txt' });
    expect(result.verdict).toBe('allow');
  });

  it('denies when no rule matches', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [{ id: 'only-reads', allow: ['read(*)'] }],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'write_file', args: {}, action: 'write', path: 'test.txt' });
    expect(result.verdict).toBe('deny');
  });

  it('handles bare tool name patterns', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [{ id: 'allow-filesystem', allow: ['filesystem_read'] }],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'filesystem_read', args: {}, action: 'read', path: 'doc.txt' });
    expect(result.verdict).toBe('allow');
  });
});

/* ────────── Network Policy Tests ─────────────────────────── */

describe('PolicyEngine — network policy', () => {
  it('blocks network when set to off', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [{ id: 'no-net', network: 'off' }],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'fetch', args: {}, action: 'network', path: 'https://example.com' });
    expect(result.verdict).toBe('deny');
  });

  it('allows network when set to on', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [{ id: 'net-ok', network: 'on' }],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'fetch', args: {}, action: 'network', path: 'https://example.com' });
    expect(result.verdict).toBe('allow');
  });
});

/* ────────── Default Action Tests ─────────────────────────── */

describe('PolicyEngine — default action', () => {
  it('respects default_action: allow', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [],
      default_action: 'allow',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'some_tool', args: {}, action: 'exec' });
    expect(result.verdict).toBe('allow');
  });

  it('respects default_action: deny', () => {
    const policy: PolicyConfig = {
      version: '1.0',
      rules: [],
      default_action: 'deny',
    };
    const engine = new PolicyEngine(policy);
    const result = engine.evaluate({ tool: 'some_tool', args: {}, action: 'exec' });
    expect(result.verdict).toBe('deny');
  });
});
