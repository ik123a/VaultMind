import { PolicyConfig, PolicyRule } from '@vaultmind/vm-core';

export type PolicyHelper = ReturnType<typeof createPolicyHelper>;

/**
 * Policy Helper — fluent builder for policy.yaml
 *
 * Usage:
 *   const policy = createPolicyHelper()
 *     .allow('read(docs/*)')
 *     .allow('read(*.md)')
 *     .deny('write(src/*)')
 *     .network('off')
 *     .build();
 */
export function createPolicyHelper(existing?: PolicyConfig) {
  const rules: PolicyRule[] = existing?.rules?.map(r => ({ ...r })) || [];
  let defaultAction: 'allow' | 'deny' = existing?.default_action || 'deny';
  let networkRule: PolicyRule | null = rules.find(r => r.network !== undefined) || null;

  const helper = {
    allow(pattern: string) {
      const rule: PolicyRule = { id: `allow-${pattern}`, allow: [pattern] };
      rules.push(rule);
      return helper;
    },

    deny(pattern: string) {
      const rule: PolicyRule = { id: `deny-${pattern}`, deny: [pattern] };
      rules.push(rule);
      return helper;
    },

    network(mode: 'on' | 'off' | 'allowlist') {
      if (networkRule) {
        networkRule.network = mode;
      } else {
        networkRule = { id: 'network', network: mode };
        rules.push(networkRule);
      }
      return helper;
    },

    defaultTo(action: 'allow' | 'deny') {
      defaultAction = action;
      return helper;
    },

    build(): PolicyConfig {
      return {
        version: '1.0',
        rules,
        default_action: defaultAction,
        audit: { enabled: true, log_level: 'info' },
      };
    },
  };

  return helper;
}
