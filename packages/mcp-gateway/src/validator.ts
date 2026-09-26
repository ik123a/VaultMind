import { PolicyConfig, PolicyRule } from '@vaultmind/vm-core';

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Policy Validator
 *
 * Checks a PolicyConfig for syntax errors, conflicts, and security
 * concerns before it's applied to the gateway.
 */
export class PolicyValidator {
  static validate(policy: PolicyConfig): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Version check
    if (!policy.version) {
      errors.push('Missing "version" field');
    }

    if (!policy.rules || policy.rules.length === 0) {
      warnings.push('No rules defined — all actions will use default_action');
    } else {
      for (let i = 0; i < policy.rules.length; i++) {
        const rule = policy.rules[i];
        this.validateRule(rule, i, errors, warnings);
      }

      // Check for redundant/conflicting rules
      this.checkConflicts(policy.rules, warnings);
    }

    // Default action check
    if (!policy.default_action) {
      warnings.push('No default_action set — defaulting to "deny" (recommended)');
    }

    return { valid: errors.length === 0, errors, warnings };
  }

  private static validateRule(
    rule: PolicyRule,
    index: number,
    errors: string[],
    warnings: string[],
  ): void {
    if (!rule.allow && !rule.deny) {
      warnings.push(`Rule #${index} (${rule.id || 'unnamed'}): no allow or deny patterns defined`);
    }

    // Check pattern syntax
    for (const pattern of [...(rule.allow || []), ...(rule.deny || [])]) {
      const m = pattern.match(/^(\w+)\((.+)\)$/);
      if (!m) {
        warnings.push(
          `Rule #${index}: "${pattern}" is not in action(glob) format — treated as tool name match`,
        );
      } else {
        const validActions = ['read', 'write', 'exec', 'network'];
        if (!validActions.includes(m[1])) {
          warnings.push(
            `Rule #${index}: "${m[1]}" is not a standard action (use ${validActions.join(', ')})`,
          );
        }
      }
    }

    // Network policy
    if (rule.network && !['on', 'off', 'allowlist'].includes(rule.network)) {
      errors.push(`Rule #${index}: network must be 'on', 'off', or 'allowlist'`);
    }
  }

  private static checkConflicts(rules: PolicyRule[], warnings: string[]): void {
    // Check for identical allow/deny on same path
    for (const rule of rules) {
      if (rule.allow && rule.deny) {
        const common = rule.allow.filter(a => rule.deny!.includes(a));
        if (common.length > 0) {
          warnings.push(
            `Rule "${rule.id || 'unnamed'}": same pattern in allow and deny: ${common.join(', ')}`,
          );
        }
      }
    }
  }
}
