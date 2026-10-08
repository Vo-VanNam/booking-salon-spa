#!/usr/bin/env bash
# Chạy test backend: dựng Postgres riêng cho test (docker), đồng bộ schema, rồi chạy Jest.
# Không cần stack production đang chạy. Redis/queue bị tắt để test mang tính xác định.
set -euo pipefail

cd "$(dirname "$0")/.."

export POSTGRES_USER=booking
export POSTGRES_PASSWORD=booking_test
export POSTGRES_DB=booking_test
export TEST_DATABASE_URL="postgresql://booking:booking_test@127.0.0.1:55433/booking_test?schema=public"
export DATABASE_URL="$TEST_DATABASE_URL"
export QUEUE_ENABLED=false
export LOG_LEVEL=silent
export JWT_SECRET="${JWT_SECRET:-test_jwt_secret_for_ci_only}"
export SLOT_STEP_MINUTES="${SLOT_STEP_MINUTES:-15}"
unset REDIS_URL

echo "[test] Dựng Postgres test (docker compose)…"
if command -v docker >/dev/null 2>&1; then
  docker compose -f docker-compose.test.yml up -d --wait >/dev/null
else
  echo "[test] Không có docker — dùng DATABASE_URL test sẵn có: ${DATABASE_URL}" >&2
fi

echo "[test] Đồng bộ schema Prisma lên DB test (reset để mỗi lần chạy đều xác định)…"
npx prisma db push --skip-generate --accept-data-loss --force-reset >/dev/null

echo "[test] Chạy Jest…"
exec npx jest --runInBand "$@"
