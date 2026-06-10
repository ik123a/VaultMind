# Policy Guide

## Overview

VaultMind controls AI agent behavior through `policy.yaml`. Each tool call is checked against the policy rules before execution.

## Policy Structure

```yaml
version: "1.0"
rules:
  - id: "allow-docs"
    allow:
      - "read(docs/*)"
      - "read(*.md)"
  - id: "block-writes"
    deny:
      - "write(src/*)"
network: "off"
default_action: "deny"
audit:
  enabled: true
```

## Rule Patterns

| Pattern | Meaning |
|---------|---------|
| `read(docs/*)` | Read files matching the glob |
| `write(*)` | Write to any path |
| `exec(rm *)` | Execute matching commands |
| `network: off` | Block network access |

## Evaluation Order

1. **Deny rules** are checked first (deny always wins)
2. **Allow rules** are checked next
3. **Network policy** is checked for network actions
4. **Default action** is used if no rule matches

## Auto-Generation

```bash
vaultmind policy generate
```

This analyzes all past audit logs and produces a `policy.yaml` skeleton capturing observed safe patterns.
