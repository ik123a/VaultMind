import { PolicyConfig, Verdict } from './types';

/**
 * VaultMind PolicyEngine
 *
 * Evaluates every agent action (read, write, exec, network) against
 * the loaded policy rules.  First matching rule wins; deny beats allow
 * by evaluation order.  Falls back to default_action when no rule matches.
 */
export class PolicyEngine {
  private policy: PolicyConfig;

  constructor(policy: PolicyConfig) {
    this.policy = policy;
  }

  evaluate(params: {
    tool: string;
    args: Record<string, unknown>;
    action: 'read' | 'write' | 'exec' | 'network';
    path?: string;
  }): { verdict: Verdict; reason: string } {
    const { action, path: filePath, tool } = params;

    for (const rule of this.policy.rules) {
      if (rule.deny && this.matchesAny(rule.deny, action, filePath, tool)) {
        return { verdict: 'deny', reason: `Denied by rule "${rule.id || 'unnamed'}": ${action} on ${filePath || tool}` };
      }
      if (rule.allow && this.matchesAny(rule.allow, action, filePath, tool)) {
        return { verdict: 'allow', reason: `Allowed by rule "${rule.id || 'unnamed'}": ${action} on ${filePath || tool}` };
      }
    }

    if (action === 'network') {
      const netRule = this.policy.rules.find(r => r.network !== undefined);
      if (netRule) {
        if (netRule.network === 'off') return { verdict: 'deny', reason: 'Network access disabled by policy' };
        if (netRule.network === 'on' || netRule.network === 'allowlist') return { verdict: 'allow', reason: 'Network access permitted by policy' };
      }
    }

    const defaultVerdict: Verdict = this.policy.default_action || 'deny';
    return { verdict: defaultVerdict, reason: `Default policy: ${defaultVerdict}` };
  }

  private matchesAny(patterns: string[], action: string, filePath?: string, tool?: string): boolean {
    return patterns.some(p => this.matchesOne(p, action, filePath, tool));
  }

  private matchesOne(pattern: string, action: string, filePath?: string, tool?: string): boolean {
    const m = pattern.match(/^(\w+)\((.+)\)$/);
    if (!m) return tool === pattern;
    if (m[1] !== action) return false;
    if (!filePath) return false;
    return this.globMatch(m[2], filePath);
  }

  private globMatch(glob: string, target: string): boolean {
    const escaped = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&');
    const reStr = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
    return new RegExp('^' + reStr + '$').test(target);
  }
}
