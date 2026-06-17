FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm ci

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY prisma ./prisma
COPY src ./src
RUN npx prisma generate
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 supportpilot

COPY --from=builder --chown=supportpilot:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=supportpilot:nodejs /app/dist ./dist
COPY --from=builder --chown=supportpilot:nodejs /app/package.json ./package.json
COPY --from=builder --chown=supportpilot:nodejs /app/prisma ./prisma

USER supportpilot
EXPOSE 3000

CMD ["node", "dist/server.js"]
