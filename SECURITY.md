# Security Policy

## Supported Versions

| Version | Supported |
|---------|----------|
| 0.1.x   | Yes |

## Architecture

Policy evaluation and audit storage run locally. This does not make programs launched by
VaultMind offline or prevent them from accessing sensitive data:

1. Policy evaluation is done locally.
2. Audit logs are stored in local SQLite + JSONL files.
3. The dashboard serves from localhost only.
4. The MCP proxy intercepts tool calls in-process.

## Execution boundary

`@vaultmind/vm-sandbox` is a process runner with policy helpers. It provides no OS-level
filesystem or network isolation on Windows, Linux, or macOS.

- `execute` validates only the working directory before launch. It does not inspect command
  arguments or mediate the child process's file operations.
- `checkPathAccess` is an explicit, synchronous check. Allow and deny roots match whole path
  components. Deny rules take precedence for either the lexical path or its resolved target;
  an allowed root must contain both. Existing symlinks/junctions are resolved, including the
  existing ancestors of paths intended for creation. Unresolvable paths fail closed. An empty
  allow list permits all paths that are not denied. Read and write checks use the same roots.
- Checks describe the filesystem at that instant. They do not prevent later link replacement,
  other filesystem races, or access through hard-link aliases. They are not a substitute for
  enforcing access at the actual file operation.
- `allowNetwork: false` changes environment variables only. `checkNetworkAccess` and
  `isNetworkCommand` are policy helpers, not socket interception. None of these prevent a
  launched program from using the network.
- Children inherit the parent environment and host permissions. On Windows, commands run
  through a shell. Commands and arguments must be trusted.
- `timeoutMs` is passed to Node's child-process API. CPU and memory limits are not enforced,
  output capture is not size-limited, and descendant processes are not terminated as a group.

Run untrusted code only within an independently configured OS/container/VM boundary with
the required filesystem, network, environment, and resource restrictions.

## Reporting a Vulnerability

Email security@vaultmind.dev. Response within 48 hours.

## Security Status

| Claim | Status |
|-------|--------|
| No data leaves machine | Not guaranteed for launched programs |
| Policy hash verification | Done |
| Append-only audit trail | Done |
| Network access control | Policy decisions and advisory environment flags only |
| Kernel sandbox | Not implemented |
