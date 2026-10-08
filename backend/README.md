# Backend — NestJS + Prisma

API cho ứng dụng đặt lịch spa. Hợp đồng API: [`../docs/API.md`](../docs/API.md); mô hình dữ liệu:
[`../docs/DATA_MODEL.md`](../docs/DATA_MODEL.md).

## Lệnh

```bash
npm install          # cài dependencies
npm run build        # tsc → dist/
npm start            # chạy dist/main.js (PORT, mặc định 8100)
npm run start:dev    # ts-node src/main.ts
npm run migrate:deploy   # prisma migrate deploy (production)
npm run seed         # seed idempotent: 3 chi nhánh, dịch vụ, stylist, tài khoản mẫu
npm test             # overlap + race + AI(mock LLM) + payments (dựng DB test riêng)
npm run typecheck    # tsc --noEmit
```

`npm test` dựng PostgreSQL riêng qua `docker-compose.test.yml` (cổng 55433) và reset schema mỗi lần chạy
để kết quả xác định; không cần stack production.

## Cấu trúc

```
prisma/            schema.prisma, migrations, seed-data.ts (dùng lại trong test), seed.ts
src/common/        config (env), logger JSON, request-id, filter lỗi tiếng Việt, guard, rate limit, tiện ích thời gian VN
src/prisma/        PrismaService (tuỳ chọn advisory lock)
src/redis/         RedisService tuỳ chọn (cache slot, rate limit, lịch sử AI)
src/auth/          JWT access + refresh token luân chuyển, guard theo 4 role
src/branches|services|stylists/   catalog + CRUD theo quyền chi nhánh
src/slots/         tính slot trống + cache + gợi ý khung giờ thay thế
src/bookings/      overlap.util (thuần), booking-lock (advisory + FOR UPDATE), service, controller
src/loyalty/       tính giảm giá + ghi audit + cron đối soát
src/payments/      VNPay (HMAC-SHA512) + Momo (HMAC-SHA256), webhook idempotent
src/admin/         doanh thu, dashboard, analytics cho trợ lý phân tích
src/ai/            LLM client OpenAI-compatible, tool registry (whitelist), prompts, lịch sử Redis
src/queue/         BullMQ: nhắc lịch trước 24h/1h + cron loyalty
src/health/        GET /health (DB + Redis)
test/              e2e theo hợp đồng harness (API surface, AI mock LLM, payments)
```

## Ghi chú nghiệp vụ

- Mọi mốc thời gian lưu UTC (`timestamptz`); chuyển đổi sang `Asia/Ho_Chi_Minh` chỉ qua `src/common/time.ts`.
- Chống race: `pg_advisory_xact_lock(hashtext(stylist_id))` + `SELECT … FOR UPDATE` trong cùng transaction.
- Webhook thanh toán: mỗi `(provider, txn_ref)` có tối đa một bản ghi thành công → cộng cọc đúng một lần.
- Công cụ AI chỉ được thực thi nếu nằm trong whitelist; mọi lần gọi được ghi vào `ai_tool_calls`.
