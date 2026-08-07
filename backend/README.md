# Backend — Salon Booking & Spa (NestJS)

API backend cho hệ thống đặt lịch salon: đặt lịch, quản lý admin/stylist, loyalty,
nhắc lịch (BullMQ + email/SMS) và thanh toán cọc trực tuyến (VNPay + MoMo).

## Stack

NestJS 11, Prisma 6 + PostgreSQL 16, Redis 7 (ioredis), BullMQ 5, JWT (access + refresh rotation),
argon2, luxon (múi giờ `Asia/Ho_Chi_Minh`), nestjs-pino (log JSON kèm `x-request-id`), @nestjs/throttler.

## Chạy dev

```bash
# 1. Hạ tầng (postgres + redis)
docker compose -f docker-compose.dev.yml up -d

# 2. Cài đặt + migrate + seed (lần đầu)
npm install
cp .env.example .env          # điền các secret placeholder
npx prisma migrate deploy
npx prisma db seed

# 3. Chạy
npm run start:dev             # http://localhost:3001/api
```

## Test

```bash
npm run lint && npm run build && npm test        # unit
npm run test:integration                          # integration (DB booking_test, migrate tự động)
```

## Biến môi trường

Xem `.env.example` (placeholder — **không commit key thật**). Nhóm chính:

| Nhóm | Biến | Ghi chú |
|---|---|---|
| Chung | `DATABASE_URL`, `REDIS_URL`, `JWT_*`, `THROTTLE_*`, `CORS_ORIGIN` | fail-fast khi thiếu |
| Admin seed | `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD` | **BẮT BUỘC đổi `SEED_ADMIN_PASSWORD` khi deploy** |
| Thanh toán | `PAYMENT_ENABLED` (`true`/`false`), `DEPOSIT_PERCENT` (mặc định 30), `VNP_*`, `MOMO_*` | `PAYMENT_ENABLED=false` là hợp lệ; khi đó `POST /api/bookings/:id/deposit` trả 503 "Chưa cấu hình thanh toán trực tuyến..." |
| Nhắc lịch | `SMTP_HOST/PORT/USER/PASS/FROM` | Thiếu `SMTP_HOST` → chỉ log, không gửi email thật |
| SMS | `SMS_API_URL`, `SMS_API_KEY`, `SMS_SENDER` | Thiếu `SMS_API_URL` → `LogSmsProvider` (log JSON tag `[SMS]`) |

## Thanh toán cọc (Task 14)

- `POST /api/bookings/:id/deposit` (khách sở hữu booking hoặc admin) `{ provider: 'vnpay' | 'momo', amount? }` →
  tạo `PaymentTransaction` (`@@unique([provider, providerTxnRef])` — idempotent) và trả `{ paymentUrl }`.
  Cọc mặc định = `DEPOSIT_PERCENT`% `priceAtBooking` (≤ tổng tiền còn lại).
- Webhook công khai (`@Public` + `@SkipThrottle`), lưu toàn bộ payload gốc vào `rawPayload`:
  - VNPay `GET/POST /api/payments/vnpay/ipn` — verify HMAC-SHA512 (sắp xếp key, loại `vnp_SecureHash`/`vnp_SecureHashType`);
    thành công khi `ResponseCode='00'` && `TransactionStatus='00'`; trả JSON `RspCode`: `00` Confirm Success / `01` không tìm thấy đơn / `02` sai số tiền / `04` đã xử lý; chữ ký sai → 401.
  - MoMo `POST /api/payments/momo/ipn` — verify HMAC-SHA256 theo chuỗi `key=value&...` đúng thứ tự field trong docs;
    `resultCode=0` là thành công; trả HTTP 200 `OK`; chữ ký sai → 401.
- Quyết định: booking bị hủy khi IPN đến → VNPay trả `RspCode 01` / MoMo trả 400 (không xử lý, hoàn cọc thủ công qua admin); giao dịch thất bại vẫn xác nhận nhận (VNPay `00` / MoMo `OK`) và ghi `failed`.
- Không hardcode key kể cả sandbox; `PAYMENT_ENABLED=false` khi chưa có key.

## Nhắc lịch (Task 13)

- BullMQ queue `reminders`: 2 delayed job/booking, jobId `${bookingId}-d1` (24h trước giờ hẹn) và `${bookingId}-h1` (1h trước).
  Ghi chú: spec ban đầu dùng `${bookingId}:d1`, nhưng bullmq v5 từ chối ký tự `:` trong jobId tùy chỉnh → dùng `-`.
- Worker kiểm tra lại booking còn `confirmed`/`pending` VÀ `startTime` khớp job data trước khi gửi (chống gửi nhầm sau reschedule).
- Tạo/cancel/reschedule/đổi trạng thái booking → schedule/unschedule tự động (lỗi nhắc lịch không làm hỏng luồng đặt lịch).
- Nội dung tiếng Việt: "Nhắc lịch: [khách], [dịch vụ] lúc [HH:mm dd/MM/yyyy] tại [branch — địa chỉ]...".

## API

Prefix `/api`. Khách: `/auth/*`, `/branches`, `/services`, `/stylists`, `/stylists/:id/slots`, `/bookings` (POST, cancel, reschedule, deposit).
Admin: `/admin/*` (calendar, bookings, services, stylists, revenue, users). Stylist: `/stylist/me*`. Health: `GET /api/health`.

## Hạn chế đã biết

- SMS/email: dev mặc định log-only; cần SMTP thật / nhà cung cấp SMS (Speedsms/VietGuys dạng generic HTTP) để gửi thật.
- VNPay/MoMo: cần key thật từ merchant để live-test; hiện mới test bằng webhook tự ký.
