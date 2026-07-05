# Base Node.js image
FROM node:20-slim AS builder

WORKDIR /app

# Copy configuration files and source code
COPY package.json package-lock.json ./
COPY packages/ packages/
COPY dashboard/ dashboard/

# Install dependencies (handles workspace linking automatically)
RUN npm ci

# Build all TypeScript workspace packages in correct dependency order
RUN npm run build --workspace=@vaultmind/vm-core && \
    npm run build --workspace=@vaultmind/vm-sandbox && \
    npm run build --workspace=@vaultmind/mcp-gateway && \
    npm run build --workspace=@vaultmind/sdk && \
    npm run build --workspace=@vaultmind/cli && \
    npm run build --workspace=@vaultmind/dashboard

# Production runtime stage
FROM node:20-slim

WORKDIR /app

# Copy build artifacts and dependencies from builder stage
COPY --from=builder /app /app

# Create directory for vault database persistence
RUN mkdir -p /app/.vaultmind

# Expose VaultMind gateway port
EXPOSE 3080

# Run the gateway server using compiled JavaScript
CMD ["node", "packages/cli/dist/index.js", "gateway", "start", "--port", "3080"]
