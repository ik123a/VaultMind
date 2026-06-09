# Security Policy

## Supported Versions

| Version | Supported |
|---------|----------|
| 0.1.x   | Yes |

## Architecture

VaultMind runs **100% offline** by design. All sensitive data stays on your machine:

1. Policy evaluation is done locally.
2. Audit logs are stored in local SQLite + JSONL files.
3. The dashboard serves from localhost only.
4. The MCP proxy intercepts tool calls in-process.

## Reporting a Vulnerability

Email security@vaultmind.dev. Response within 48 hours.

## Security Status

| Claim | Status |
|-------|--------|
| No data leaves machine | Done |
| Policy hash verification | Done |
| Append-only audit trail | Done |
| Network access control | Done |
| Kernel sandbox | Planned |
