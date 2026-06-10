# Quick Start

## Prerequisites

- Node.js 22+
- npm

## Installation

```bash
git clone https://github.com/your-org/vaultmind.git
cd vaultmind
npm install
cd packages/vm-core && npm install && npx tsc && cd ../..
cd packages/vm-sandbox && npm link @vaultmind/vm-core && npm install && cd ../..
cd packages/mcp-gateway && npm link @vaultmind/vm-core @vaultmind/vm-sandbox && npm install && cd ../..
cd packages/cli && npm link @vaultmind/vm-core @vaultmind/mcp-gateway && npm install && cd ../..
cd packages/sdk && npm link @vaultmind/vm-core && npm install && cd ../..
```

## First Session

```bash
# Create a policy
npx tsx packages/cli/src/index.ts init

# Record a command
npx tsx packages/cli/src/index.ts record -- echo "hello world"

# Analyze the audit log
npx tsx packages/cli/src/index.ts analyze

# Generate a policy from audit data
npx tsx packages/cli/src/index.ts policy generate

# Start the gateway + dashboard
npx tsx packages/cli/src/index.ts gateway start --port 3080
```

Open `http://127.0.0.1:3080` for the dashboard.
