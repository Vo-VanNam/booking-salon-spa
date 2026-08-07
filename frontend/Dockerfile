# ============================================================
# Frontend (Next.js 15 App Router) — multi-stage build
# Builder: npm ci -> next build (output: standalone)
# Runtime: node:22-alpine NON-ROOT, chi giu .next/standalone + static
# ============================================================

# ---------- Builder ----------
FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

COPY package*.json ./
RUN npm ci

COPY . .

# Build-time public env: /api (same-origin) — Nginx proxy /api -> backend,
# nen frontend khong can biet dia chi backend.
# Rewrite /api -> localhost:3001 trong next.config.ts chi chay khi request
# toi chinh Next server; o prod Nginx chan /api truoc khi toi Next nen
# rewrite khong bao gio kich hoat — an toan.
ENV NEXT_PUBLIC_API_URL=/api
RUN npm run build

# ---------- Runtime ----------
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
# Docker tu dong set HOSTNAME=<container-id> -> Next standalone bind vao do,
# khong nghe 0.0.0.0 -> healthcheck/nginx khong truy cap duoc. Ghi de lai:
ENV HOSTNAME=0.0.0.0
WORKDIR /app

# Standalone output da chua server.js + node_modules toi thieu can thiet
COPY --from=builder --chown=node:node /app/.next/standalone ./
# Static assets + public/ (standalone khong tu dong gom 2 thu nay)
COPY --from=builder --chown=node:node /app/.next/static ./.next/static
COPY --from=builder --chown=node:node /app/public ./public

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3000/ >/dev/null 2>&1 || exit 1

CMD ["node", "server.js"]
