# Base image for building
FROM oven/bun:1 AS builder
WORKDIR /app

# Copy root monorepo files
COPY package.json pnpm-workspace.yaml turbo.json ./
# Copy backend files
COPY apps/backend ./apps/backend

# Install dependencies (only for backend for minimal image size)
WORKDIR /app/apps/backend
RUN bun install

# Build the backend application
RUN bun run build

# ---

# Small runner image
FROM oven/bun:1-slim AS runner
WORKDIR /app

# Copy built files and dependencies
COPY --from=builder /app/apps/backend/dist ./dist
COPY --from=builder /app/apps/backend/node_modules ./node_modules
COPY --from=builder /app/apps/backend/package.json ./

ENV NODE_ENV=production
ENV PORT=8080

EXPOSE 8080

# Map to the compiled file instead of TS directly
CMD ["bun", "run", "dist/index.js"]
