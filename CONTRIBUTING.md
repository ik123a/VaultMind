# Contributing to VaultMind

## Setup

```bash
git clone https://github.com/your-org/vaultmind.git
cd vaultmind
npm install
cd packages/vm-core && npm install && npm link && npx tsc && cd ../..
cd packages/vm-sandbox && npm link @vaultmind/vm-core && npm install && cd ../..
cd packages/mcp-gateway && npm link @vaultmind/vm-core @vaultmind/vm-sandbox && npm install && cd ../..
cd packages/cli && npm link @vaultmind/vm-core @vaultmind/mcp-gateway && cd ../..
cd packages/sdk && npm link @vaultmind/vm-core && npm install && cd ../..
```

## Running Tests

```bash
npx vitest run
```

## Code Style

- TypeScript strict mode
- Use async/await
- Keep functions under 40 lines
- Add JSDoc for public APIs

## Good First Issues

1. Add --verbose flag to CLI
2. Add exclude patterns to policy rules
3. Write tests for the validator
4. Add cron support in policy
5. Improve dashboard with more charts
