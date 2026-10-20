FROM node:24-alpine AS base
WORKDIR /app
RUN apk add --no-cache openssl libc6-compat wget

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS migrator
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 supportpilot
COPY --from=deps /app/node_modules ./node_modules
COPY package.json ./
COPY prisma ./prisma
USER supportpilot

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM base AS runner
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 supportpilot

COPY --from=builder --chown=supportpilot:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=supportpilot:nodejs /app/dist ./dist
COPY --from=builder --chown=supportpilot:nodejs /app/package.json ./package.json
COPY --from=builder --chown=supportpilot:nodejs /app/prisma ./prisma

USER supportpilot
EXPOSE 3000

HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/ready || exit 1

CMD ["node", "dist/server.js"]
