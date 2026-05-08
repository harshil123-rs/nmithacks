# ── Frontend Build Stage ──
FROM node:20-slim AS client-builder
WORKDIR /app/client

# Install frontend dependencies
COPY client/package*.json ./
RUN npm ci

# Build frontend
COPY client/ ./
# We set a placeholder API URL, but since we're serving from the same domain, relative paths or the same origin work perfectly.
ENV VITE_API_URL="" 
RUN npm run build

# ── Backend Build Stage ──
FROM node:20-slim AS server-builder
WORKDIR /app/server

# Install build tools for native modules (tree-sitter C++ bindings require python and g++)
RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

# Install backend dependencies
COPY server/package*.json ./
RUN npm ci --legacy-peer-deps

# Build backend
COPY server/ ./
RUN npm run build

# Copy .scm query files (tsc doesn't copy non-TS assets)
RUN mkdir -p dist/agents/context/queries && \
    cp -r src/agents/context/queries/*.scm dist/agents/context/queries/

# Prune devDependencies to keep the production image lean
RUN npm prune --omit=dev --legacy-peer-deps

# ── Production Stage ──
FROM node:20-slim
WORKDIR /app

# tree-sitter native bindings need libstdc++ at runtime
RUN apt-get update && apt-get install -y --no-install-recommends libstdc++6 && rm -rf /var/lib/apt/lists/*

# Copy backend
COPY --from=server-builder /app/server/package*.json ./server/
COPY --from=server-builder /app/server/node_modules ./server/node_modules
COPY --from=server-builder /app/server/dist ./server/dist

# Copy frontend build to the client directory so the server can serve it
COPY --from=client-builder /app/client/dist ./client/dist

# Set production environment variables
ENV NODE_ENV=production
ENV PORT=3000

# Start server
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "dist/index.js"]
