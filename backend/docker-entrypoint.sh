#!/bin/sh
# Container backend (production): chạy migration rồi khởi động API.
# TUYỆT ĐỐI dùng `migrate deploy` (không dùng `migrate dev`) trong production — DOCUMENT.md §7.
set -e

echo "[entrypoint] Áp dụng migration Prisma…"
npx prisma migrate deploy

echo "[entrypoint] Khởi động API trên cổng ${PORT:-8100}…"
exec node dist/main.js
