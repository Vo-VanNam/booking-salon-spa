#!/usr/bin/env bash
# Smoke test toàn bộ luồng nghiệp vụ Booking Salon/Spa (chạy qua HTTP lên
# stack production local: docker compose -f docker-compose.prod.yml up -d).
#
# Cách dùng:
#   bash scripts/smoke.sh
#
# Biến tùy chọn:
#   SMOKE_BASE_URL=https://localhost   # mặc định https://localhost (chấp nhận cert tự ký)
#   VNP_HASH_SECRET / SEED_ADMIN_*    # ghi đè giá trị trong .env.production
set -euo pipefail
cd "$(dirname "$0")/.."

if [ ! -f .env.production ]; then
  echo "Thiếu .env.production — tạo từ .env.production.example trước khi smoke test." >&2
  exit 1
fi

export SMOKE_BASE_URL="${SMOKE_BASE_URL:-https://localhost}"
# Cert Let's Encrypt chưa có trên local → chấp nhận cert tự ký (chỉ cho smoke test local)
export NODE_TLS_REJECT_UNAUTHORIZED=0

exec node scripts/smoke.mjs
