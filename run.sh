#!/usr/bin/env bash
# ══════════════════════════════════════════════════════════════════════════════
# run.sh — điểm khởi động duy nhất (BENCHMARK RUN CONTRACT §1-§3)
#
#   bash run.sh
#
# Việc script làm (idempotent, không hỏi tương tác):
#   1. nạp .env nếu có — CHỈ điền biến còn thiếu, không ghi đè biến môi trường đã đặt
#   2. dựng PostgreSQL + Redis bằng docker compose
#   3. cài dependencies (nếu thiếu), chạy migration, seed dữ liệu mẫu
#   4. build + chạy backend (8100) và frontend (8101)
#   5. in ĐÚNG MỘT dòng "URL: http://<host>:<port>" ra stdout rồi chạy tiếp ở foreground
#
# Muốn cấu hình thanh toán/AI: đặt VNPAY_*/MOMO_*/AI_* trong môi trường trước khi chạy.
# ══════════════════════════════════════════════════════════════════════════════
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"

BACKEND_PORT="${PORT:-8100}"
FRONTEND_PORT="${FRONTEND_PORT:-8101}"
HOST="${HOST:-localhost}"
RUN_DIR="$ROOT/.run"
BACKEND_LOG="$RUN_DIR/backend.log"
FRONTEND_LOG="$RUN_DIR/frontend.log"

log() { printf '[run] %s\n' "$*" >&2; }
fail() { printf '[run] LỖI: %s\n' "$*" >&2; exit 1; }

mkdir -p "$RUN_DIR"

# ── 1. Nạp .env không ghi đè biến đã có ───────────────────────────────────────
if [[ -f "$ROOT/.env" ]]; then
  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "${line// }" || "${line:0:1}" == "#" ]] && continue
    key="${line%%=*}"
    value="${line#*=}"
    key="${key//[[:space:]]/}"
    [[ -z "$key" || "$key" == "$line" ]] && continue
    if [[ -z "${!key:-}" ]]; then
      export "$key=$value"
    fi
  done < "$ROOT/.env"
fi

# ── 2. Sinh .env nếu chưa có (secret ngẫu nhiên, không hardcode trong mã) ─────
if [[ ! -f "$ROOT/.env" ]]; then
  log "Chưa có .env — sinh cấu hình mới với secret ngẫu nhiên"
  PG_PASSWORD="$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")"
  JWT_SECRET_VALUE="$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")"
  PG_PORT_DEFAULT="55432"
  REDIS_PORT_DEFAULT="56379"
  cat > "$ROOT/.env" <<ENVFILE
# Sinh tự động bởi run.sh (đã nằm trong .gitignore). KHÔNG commit file này.
NODE_ENV=production
POSTGRES_USER=booking
POSTGRES_PASSWORD=$PG_PASSWORD
POSTGRES_DB=booking
POSTGRES_PORT=$PG_PORT_DEFAULT
REDIS_PORT=$REDIS_PORT_DEFAULT
DATABASE_URL=postgresql://booking:$PG_PASSWORD@127.0.0.1:$PG_PORT_DEFAULT/booking?schema=public
REDIS_URL=redis://127.0.0.1:$REDIS_PORT_DEFAULT
PORT=8100
JWT_SECRET=$JWT_SECRET_VALUE
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL_DAYS=7
CORS_ORIGINS=http://localhost:8101,http://127.0.0.1:8101
SLOT_CACHE_TTL_SECONDS=30
SLOT_STEP_MINUTES=15
QUEUE_ENABLED=true
LOYALTY_THRESHOLD=10
LOYALTY_DISCOUNT_PERCENT=10
REMINDER_HOURS=24,1
NEXT_PUBLIC_API_URL=http://localhost:8100
# VNPAY_* / MOMO_* / AI_* cố ý để trống: ứng dụng phải chạy được khi thiếu các khoá này.
ENVFILE
  log "Đã tạo .env"
fi

export POSTGRES_USER="${POSTGRES_USER:-booking}"
export POSTGRES_DB="${POSTGRES_DB:-booking}"
export POSTGRES_PORT="${POSTGRES_PORT:-55432}"
export REDIS_PORT="${REDIS_PORT:-56379}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-$(node -e "process.stdout.write(require('crypto').randomBytes(16).toString('hex'))")}"
export DATABASE_URL="${DATABASE_URL:-postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@127.0.0.1:${POSTGRES_PORT}/${POSTGRES_DB}?schema=public}"
export REDIS_URL="${REDIS_URL:-redis://127.0.0.1:${REDIS_PORT}}"
export JWT_SECRET="${JWT_SECRET:-$(node -e "process.stdout.write(require('crypto').randomBytes(48).toString('hex'))")}"
export PORT="$BACKEND_PORT"
export CORS_ORIGINS="${CORS_ORIGINS:-http://localhost:${FRONTEND_PORT},http://127.0.0.1:${FRONTEND_PORT}}"
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://${HOST}:${BACKEND_PORT}}"

# ── 3. Giải phóng cổng (tiến trình cũ còn giữ 8100/8101) ──────────────────────
free_port() {
  local port="$1"
  local pids
  pids="$(ss -ltnp 2>/dev/null | awk -v suffix=":$port" '$4 ~ suffix "$" {print $NF}' | grep -o 'pid=[0-9]*' | cut -d= -f2 | sort -u || true)"
  for pid in $pids; do
    [[ -z "$pid" ]] && continue
    local cmd cwd
    cmd="$(tr '\0' ' ' < "/proc/$pid/cmdline" 2>/dev/null || true)"
    cwd="$(readlink -f "/proc/$pid/cwd" 2>/dev/null || true)"
    # Cổng đã được ấn định cho ứng dụng này: thu hồi từ tiến trình còn sót lại.
    log "Thu hồi cổng $port từ pid $pid ($cmd) [cwd=$cwd]"
    kill "$pid" 2>/dev/null || true
    for _ in 1 2 3 4 5; do
      kill -0 "$pid" 2>/dev/null || break
      sleep 0.5
    done
    kill -9 "$pid" 2>/dev/null || true
  done
}

free_port "$BACKEND_PORT"
free_port "$FRONTEND_PORT"

# ── 4. Hạ tầng: PostgreSQL + Redis ───────────────────────────────────────────
start_infra() {
  if ! command -v docker >/dev/null 2>&1; then
    log "CẢNH BÁO: không có docker — dùng DATABASE_URL/REDIS_URL sẵn có: $DATABASE_URL"
    return
  fi
  log "Khởi động PostgreSQL + Redis (docker compose)…"
  docker compose -f "$ROOT/docker-compose.yml" up -d --wait postgres redis >&2
}

start_infra

# ── 5. Backend: deps → migrate → seed → build ────────────────────────────────
cd "$ROOT/backend"

if [[ ! -d node_modules || ! -x node_modules/.bin/prisma ]]; then
  log "Cài dependencies backend…"
  npm install --no-audit --no-fund >&2
fi

log "Áp dụng migration (prisma migrate deploy)…"
if ! npx prisma migrate deploy >&2; then
  log "migrate deploy không thành công — dùng prisma db push để đồng bộ schema"
  npx prisma db push --skip-generate --accept-data-loss >&2
fi

log "Seed dữ liệu mẫu (idempotent)…"
npm run --silent seed >&2

log "Build backend (tsc)…"
npm run --silent build >&2

log "Chạy backend trên cổng $BACKEND_PORT…"
NODE_ENV=production node dist/main.js >> "$BACKEND_LOG" 2>&1 &
BACKEND_PID=$!

# ── 6. Frontend ──────────────────────────────────────────────────────────────
cd "$ROOT/frontend"
if [[ ! -d node_modules || ! -d node_modules/next ]]; then
  log "Cài dependencies frontend…"
  npm install --no-audit --no-fund >&2
fi

log "Chạy frontend trên cổng $FRONTEND_PORT…"
NODE_ENV=development npx next dev -p "$FRONTEND_PORT" -H 0.0.0.0 >> "$FRONTEND_LOG" 2>&1 &
FRONTEND_PID=$!

cleanup() {
  log "Đang dừng ứng dụng…"
  kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
  wait "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

# ── 7. Chờ sẵn sàng rồi in đúng một dòng URL ─────────────────────────────────
log "Chờ backend sẵn sàng…"
if ! node "$ROOT/scripts/wait-ready.mjs" "http://127.0.0.1:${BACKEND_PORT}/health" 300 --expect=status=ok; then
  log "Backend không sẵn sàng. 20 dòng log cuối:"
  tail -20 "$BACKEND_LOG" >&2 || true
  fail "backend không khởi động được"
fi

log "Chờ frontend sẵn sàng…"
if ! node "$ROOT/scripts/wait-ready.mjs" "http://127.0.0.1:${FRONTEND_PORT}/" 180; then
  log "Frontend không sẵn sàng. 20 dòng log cuối:"
  tail -20 "$FRONTEND_LOG" >&2 || true
  fail "frontend không khởi động được"
fi

printf 'URL: http://%s:%s\n' "$HOST" "$FRONTEND_PORT"
log "Ứng dụng đã chạy. Log: $BACKEND_LOG , $FRONTEND_LOG"

# Giữ tiến trình ở foreground cho tới khi bị dừng.
wait "$BACKEND_PID" "$FRONTEND_PID"
