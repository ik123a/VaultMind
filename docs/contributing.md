# Contributing

## Prerequisites

- Node.js 20+
- npm (the repository is an npm workspace; pnpm also works)

## Setup

```bash
npm install
npm run build      # compiles all five packages, vm-core first
npm test           # builds vm-core, then runs the vitest suite
```

`npm test` depends on `@vaultmind/vm-core` being built, because the test suite imports its
compiled output from `packages/vm-core/dist`. The `pretest` script handles this for you.

## Type checking

```bash
npm run typecheck
```

This runs `tsc --noEmit` across every package.

## Running locally

```bash
npx tsx packages/cli/src/index.ts init
npx tsx packages/cli/src/index.ts record -- echo "hello"
npx tsx packages/cli/src/index.ts gateway start --port 3080
```

The dashboard is then served at `http://127.0.0.1:3080`.

## Good first issues

- Add CLI flags for the existing subcommands
- Extend the YAML policy syntax
- Add unit tests for the policy engine's rule precedence
- Improve error messages

## Before opening a pull request

1. `npm run typecheck` is clean
2. `npm test` passes
3. Commits are focused, with a message that explains the change rather than labelling it