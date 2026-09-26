# CLI Reference

The `vaultmind` CLI is the primary interface to VaultMind. Every subcommand below is
dispatched from `packages/cli/src/index.ts`.

```
USAGE:
  vaultmind <command> [options]
```

| Command | What it does |
| --- | --- |
| `init [file]` | Create a default `policy.yaml`. Refuses to overwrite an existing file. |
| `record -- <cmd>` | Evaluate `<cmd>` against the active policy, log the verdict, then execute it if allowed. |
| `analyze [--from <date>]` | Summarise recorded audit logs. |
| `policy validate <file>` | Validate a policy file, printing errors and warnings. |
| `policy generate` | Derive a `policy.yaml` skeleton from observed audit history. |
| `deps memo [--dir .]` | Build a dependency DAG from a lockfile. |
| `deps verify` | Check memoised dependencies against known CVEs. |
| `gateway start [--port N]` | Start the MCP gateway HTTP/WebSocket server. |
| `help` | Print usage. |

## Examples

```bash
vaultmind init
vaultmind record -- echo "hello world"
vaultmind policy validate ./policy.yaml
vaultmind gateway start --port 3080
```

## How `record` behaves

`record` is the core loop:

1. The trailing command is read from `process.argv` (everything after `--`).
2. The policy engine evaluates it and produces a verdict of `allow`, `deny`, or `error`.
3. The event is written to the audit log with the agent, tool, parameters, verdict and reason.
4. If the verdict is not `allow`, the command is **not** executed and the reason is printed.
5. Otherwise the command runs with `execSync`, inheriting stdio, and a non-zero exit code is passed through.

The child process runs with `shell: true` on Windows, matching the host platform shell.

## Exit behaviour

`record` reports a blocked command rather than exiting silently. Unrecognised top-level
commands fall through to `help` rather than erroring, so a typo prints usage instead of a stack trace.
A fatal error anywhere in `main()` prints `Fatal error:` and exits with code 1.

## Dependency scanning

`deps memo` reads the first lockfile it finds and reports when none is present. Supported
files are `package-lock.json`, `yarn.lock`, `go.sum`, `Cargo.lock` and `requirements.txt`.

`deps verify` runs in offline mode by default. It reports that no blocked CVEs were found
and points at configuring an internal mirror of osv.dev or the GitHub Advisory Database for
full coverage.