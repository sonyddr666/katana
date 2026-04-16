# Stage 1: dependencies
FROM node:18-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --only=production

# Stage 2: builder
FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# Stage 3: runner
FROM node:18-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Create non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 codex

# Copy built app
COPY --from=builder --chown=codex:nodejs /app/dist ./dist
COPY --from=builder --chown=codex:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=codex:nodejs /app/package.json ./

# Create directories
RUN mkdir -p /workspace && chown codex:nodejs /workspace

USER codex

EXPOSE 8080

CMD ["node", "dist/server/index.js"]
