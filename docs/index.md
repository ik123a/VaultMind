# VaultMind

**Offline-First AI Environment for Sensitive Code**

VaultMind is the first open-source policy decision point for AI coding agents that runs completely offline. It combines a lightweight secure MCP gateway, an immutable audit trail, and a software supply chain explorer.

## Key Features

- **Local MCP Gateway** - Offline proxy intercepting every tool call
- **Policy Engine** - Simple `policy.yaml` with allow/deny/network rules
- **Immutable Audit Trail** - Every event logged to SQLite + JSONL
- **Sandbox Execution** - Process isolation with path ACLs
- **Auto Policy Generation** - Generate policy from audit logs
- **Dependency Memoization** - Scan and verify dependency trees
- **Real-time Dashboard** - WebSocket-powered monitoring UI

## Quick Links

- [Quick Start](quickstart.md)
- [Policy Guide](policy.md)
- [CLI Reference](cli.md)
- [API](api.md)
