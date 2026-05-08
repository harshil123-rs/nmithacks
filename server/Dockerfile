# ── Build stage ──
FROM node:20-slim AS builder

WORKDIR /app

# Install build tools for native modules (tree-sitter C++ bindings)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci --legacy-peer-deps

COPY tsconfig.json ./                                                                                                                                                                                                   
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# Copy .scm query files (tsc doesn't copy non-TS assets)
RUN mkdir -p dist/agents/context/queries && \
    cp -r src/agents/context/queries/*.scm dist/agents/context/queries/

# Prune devDependencies from node_modules so we can copy a lean set
RUN npm prune --omit=dev --legacy-peer-deps

# ── Production stage ──
FROM node:20-slim

WORKDIR /app

# tree-sitter native bindings need libstdc++ at runtime
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*

COPY package.json ./

# Copy pre-built node_modules (with native bindings already compiled) from builder
COPY --from=builder /app/node_modules ./node_modules

# Copy compiled JS + .scm query files
COPY --from=builder /app/dist ./dist

EXPOSE 3000

CMD ["node", "dist/index.js"]
