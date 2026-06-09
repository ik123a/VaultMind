import * as fs from 'fs';
import * as path from 'path';
import * as yaml from 'js-yaml';
import { PolicyConfig } from './types';

const DEFAULT_POLICY: PolicyConfig = {
  version: '1.0',
  rules: [
    {
      id: 'default-read-docs',
      description: 'Allow reading documentation files',
      allow: ['read(docs/*)', 'read(*.md)', 'read(*.txt)'],
    },
    {
      id: 'block-writes-src',
      description: 'Block writes to source directories by default',
      deny: ['write(src/*)', 'write(lib/*)'],
    },
    {
      id: 'block-destructive',
      description: 'Never allow destructive operations',
      deny: ['exec(rm *)', 'exec(del *)', 'exec(shutdown)'],
    },
  ],
  default_action: 'deny',
  audit: {
    enabled: true,
    log_level: 'info',
  },
};

/**
 * Load and parse a policy.yaml file.
 * Falls back to a sensible default if the file is missing.
 */
export function loadPolicy(policyPath?: string): PolicyConfig {
  const resolvedPath = policyPath || path.join(process.cwd(), 'policy.yaml');
  try {
    const raw = fs.readFileSync(resolvedPath, 'utf-8');
    const parsed = yaml.load(raw) as PolicyConfig;
    if (!parsed || !parsed.version) {
      console.warn('[vm-core] policy.yaml missing required "version" field; using defaults');
      return DEFAULT_POLICY;
    }
    return parsed;
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
      console.warn('[vm-core] No policy.yaml found at', resolvedPath, '— using default policy');
    } else {
      console.warn('[vm-core] Error reading policy.yaml:', (err as Error).message);
    }
    return DEFAULT_POLICY;
  }
}

/**
 * Serialise a PolicyConfig and write it as YAML.
 */
export function savePolicy(policy: PolicyConfig, outputPath?: string): string {
  const resolvedPath = outputPath || path.join(process.cwd(), 'policy.yaml');
  const yamlStr = yaml.dump(policy, { indent: 2, lineWidth: 120, noRefs: true });
  fs.writeFileSync(resolvedPath, yamlStr, 'utf-8');
  return resolvedPath;
}
