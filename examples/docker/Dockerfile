FROM node:22-alpine

WORKDIR /app

# Install dependencies
COPY package.json package-lock.json ./
COPY packages/vm-core/package.json packages/vm-core/
COPY packages/vm-sandbox/package.json packages/vm-sandbox/
COPY packages/mcp-gateway/package.json packages/mcp-gateway/
COPY packages/cli/package.json packages/cli/
COPY packages/sdk/package.json packages/sdk/

RUN npm ci

# Copy source
COPY packages/ packages/
COPY tests/ tests/
COPY vitest.config.ts ./
COPY policy.yaml ./
COPY dashboard/ dashboard/

# Build
RUN cd packages/vm-core && npx tsc \
 && cd ../vm-sandbox && npx tsc \
 && cd ../mcp-gateway && npx tsc \
 && cd ../cli && npx tsc \
 && cd ../sdk && npx tsc

EXPOSE 3080

CMD ["node", "packages/cli/dist/index.js", "gateway", "start", "--port", "3080"]
