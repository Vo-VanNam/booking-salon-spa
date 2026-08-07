# ============================================================
# Backend (NestJS + Prisma) — multi-stage build
# Builder: npm ci -> prisma generate -> nest build
# Runtime: node:22-alpine NON-ROOT, migrate deploy truoc khi start
# ============================================================

# ---------- Builder ----------
FROM node:22-alpine AS builder
WORKDIR /app

# Cai deps truoc (lockfile -> npm ci deterministic, layer cache tot)
COPY package*.json ./
RUN npm ci

# Generate Prisma client tu schema (bat buoc sau khi cai deps)
COPY prisma ./prisma
RUN npx prisma generate

# Build TypeScript -> dist/
COPY . .
RUN npm run build

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app

# Chi cai production deps (nhe hon ~2/3 so voi full deps).
# - argon2: prebuild (prebuildify) co san trong package, khop linux-musl
# - @prisma/client@6.19+ keo theo prisma CLI nhu PROD dep (de tu generate),
#   nen "npx prisma migrate deploy" dung duoc luon - khong can cai them
# - xoa npm cache ngay trong layer de khong phinh image
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && rm -rf /root/.npm

# Prisma client da generate (code + query engine binary) tu builder
COPY --from=builder --chown=node:node /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder --chown=node:node /app/dist ./dist
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --from=builder --chown=node:node /app/package.json ./package.json

# Chay non-root (user "node" co san trong node image)
USER node

EXPOSE 3001

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/api/health >/dev/null 2>&1 || exit 1

# migrate deploy moi lan start (idempotent, chi chay migration chua chay).
# LUU Y: tsconfig khong dat rootDir -> tsc giu nguyen cay thu muc,
# output nam o dist/src/main.js (khong phai dist/main.js)
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
