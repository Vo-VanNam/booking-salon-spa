# Booking Salon/Spa — Web App đặt lịch cho chuỗi salon/spa

Web app quản lý đặt lịch cho chuỗi salon/spa 3–5 chi nhánh tại Việt Nam (kiểu Booksy/Fresha đơn giản hóa): khách đặt lịch online, admin quản lý lịch làm việc và doanh thu, stylist xem lịch cá nhân trên điện thoại. Hệ thống production: error handling, validate input, structured logging, unit + integration test (kể cả test race condition khi đặt trùng slot).

## Kiến trúc

- **Backend:** NestJS 11 + TypeScript strict, Prisma 6 + PostgreSQL 16, Redis 7 (cache slot trống), BullMQ (nhắc lịch -24h/-1h, cron loyalty), JWT access ngắn hạn + refresh token hash trong DB (rotation, revoke), argon2, luxon (timezone `Asia/Ho_Chi_Minh` — DB lưu UTC), nestjs-pino (log JSON có `request_id`), @nestjs/throttler (rate limit: global 100/min, login 10/min, bookings 20/min), VNPay + MoMo (webhook verify chữ ký, idempotent).
- **Frontend:** Next.js 15 (App Router) + TypeScript, Tailwind CSS + shadcn/ui, framer-motion (wizard đặt lịch), FullCalendar (calendar kéo-thả admin), recharts (doanh thu). Theme be/nâu nhạt (#FAF7F2/#8B6F47), font Be Vietnam Pro + Inter. Toàn bộ UI + lỗi trả client bằng tiếng Việt, format dd/MM/yyyy + 24h.
- **Infra:** Docker compose production (backend + frontend + postgres + redis + nginx reverse proxy, Let's Encrypt/certbot). Xem `deploy/README-DEPLOY.md`.

## Cấu trúc repo

```
├── backend/          # NestJS API (port 3001, prefix /api)
├── frontend/         # Next.js app (port 3000 dev)
├── deploy/           # nginx.conf, nginx-http.conf, README-DEPLOY.md
├── scripts/          # smoke.sh / smoke.mjs (E2E toàn luồng)
├── docker-compose.dev.yml     # postgres 16 + redis 7 (dev)
├── docker-compose.prod.yml    # stack production đầy đủ
└── .env.production.example    # mẫu biến môi trường production (KHÔNG secret thật)
```

## Chạy dev

```bash
# 1. Cơ sở dữ liệu + Redis
docker compose -f docker-compose.dev.yml up -d

# 2. Backend (cần .env từ backend/.env.example)
cd backend && cp -n .env.example .env && npm i && npx prisma migrate deploy && npx prisma db seed
npm run start:dev        # http://localhost:3001/api (health: /api/health)

# 3. Frontend (rewrite /api/* → backend)
cd frontend && cp -n .env.example .env && npm i
npm run dev              # http://localhost:3000
```

Tài khoản seed: super_admin `admin@salonglow.vn` / mật khẩu trong `backend/.env` (`SEED_ADMIN_PASSWORD`) — **bắt buộc đổi trước khi deploy**. Seed có 3 chi nhánh (Q1, Q7, Thủ Đức), 24 dịch vụ, 12 stylist, 2 khách, ~10 booking mẫu. Seed không idempotent — chỉ chạy 1 lần (hoặc `npx prisma migrate reset --force && npx prisma db seed`).

## Chạy production (VPS)

```bash
cp .env.production.example .env.production   # điền toàn bộ CHANGED
docker compose --env-file .env.production -f docker-compose.prod.yml build
docker compose --env-file .env.production -f docker-compose.prod.yml up -d
# certbot --nginx -d domain — xem deploy/README-DEPLOY.md
```

Migration chạy tự động khi backend container start (`npx prisma migrate deploy` — không dùng `db push` ở production). Seed production chạy thủ công lần đầu: `docker compose ... exec backend npx prisma db seed`.

## Danh sách API chính (prefix `/api`)

| Nhóm | Endpoint | Quyền |
|---|---|---|
| Public | `GET /health` | — |
| Public | `GET /branches`, `GET /branches/:id`, `GET /branches/:id/services`, `GET /branches/:id/stylists` | — |
| Public | `GET /stylists/:id/slots?branchId=&date=&durationMinutes=` (cache Redis 30s) | — |
| Auth | `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `GET /auth/me` | register/login public, rate limit 10/min |
| Bookings | `POST /bookings` (rate limit 20/min, check trùng slot chống race), `PATCH /bookings/:id/cancel`, `PATCH /bookings/:id/reschedule` (quy tắc ≥ 24h với khách) | customer sở hữu / admin |
| Deposit | `POST /bookings/:id/deposit {provider: vnpay\|momo, amount?}` | chủ booking / admin |
| Webhook | `GET+POST /payments/vnpay/ipn`, `POST /payments/momo/ipn` (verify chữ ký trước, idempotent) | public |
| Admin | `GET /admin/calendar?branchId&from&to&stylistId?`, `GET /admin/revenue?branchId&from&to&groupBy=day\|month` | branch_admin (scope branch của mình) / super_admin |
| Admin | CRUD `/admin/services`, `/admin/stylists` (+ `PUT :id/working-hours`, `POST/DELETE :id/time-off`), `/admin/branches`, `POST /admin/users` | branch_admin / super_admin (branches, users: chỉ super) |
| Admin | `PATCH /admin/bookings/:id/move` (kéo-thả), `PATCH /admin/bookings/:id/status` | branch_admin / super_admin |
| Stylist | `GET /stylist/me`, `GET /stylist/me/bookings?from&to`, `GET /stylist/me/today` | stylist |

Lỗi trả về dạng `{ statusCode, message (tiếng Việt), requestId }`, requestId nằm cả trong header `x-request-id` và log JSON.

## Quyết định thiết kế

1. Booking tạo ra với status `confirmed` ngay (self-service). `pending` dành cho đặt cọc chưa thanh toán hoặc admin tạo tay.
2. Chống race đặt trùng slot: transaction + `SELECT ... FOR UPDATE` trên booking của stylist trong khoảng thời gian liên quan, **tăng cường** bằng exclusion constraint Postgres `btree_gist` trên `(stylistId, tstzrange)` với `status IN ('pending','confirmed')` — lỗi 23P01 dịch sang message tiếng Việt.
3. Cache slot: key `slots:{branchId}:{stylistId}:{date}`, TTL 30s, không phụ thuộc duration; `DEL` ngay khi tạo/hủy/đổi/dời booking.
4. Loyalty: 10 điểm/lần booking `completed`, đủ 100 điểm → giảm 10% booking kế tiếp (ghi `discountAmount`); mọi biến động điểm ghi `LoyaltyTransaction` (actor, bookingId, lý do).
5. Nhắc lịch: BullMQ delayed jobs `${bookingId}-d1` / `${bookingId}-h1` (jobId của BullMQ v5 không cho phép ký tự `:`), worker chỉ gửi khi booking còn confirmed/pending và giờ không đổi. Email qua SMTP env; SMS qua interface `SmsProvider` (thiếu key → chỉ log, tag `[SMS]`).
6. Cọc online mặc định 30% (`DEPOSIT_PERCENT`); `PAYMENT_ENABLED=false` → endpoint deposit trả 503 tiếng Việt. Webhook verify chữ ký trước khi tin payload; idempotent qua `@@unique([provider, providerTxnRef])`; lưu `rawPayload` gốc để đối soát. Booking bị hủy khi IPN tới → không tự xử lý, admin hoàn tiền thủ công.
7. Refresh token: random 64-byte, hash SHA-256 trong DB, rotation mỗi lần refresh, phát hiện token cũ dùng lại → thu hồi toàn bộ phiên.
8. Frontend: access token giữ trong memory (chống XSS), refresh token trong localStorage — tradeoff đã ghi trong `frontend/README.md`; route admin/stylist bảo vệ client-side.
9. Timezone: mọi tính toán qua luxon zone cố định `Asia/Ho_Chi_Minh` (VN không DST); DB lưu UTC (`timestamptz`). Revenue/calendar API yêu cầu `branchId` kể cả với super_admin (mỗi lần xem 1 chi nhánh).

## Kiểm thử

```bash
cd backend
npm run lint && npm run build
npm test                              # unit: 201 tests (overlap, 24h, VN phone, slot engine, chữ ký VNPay/Momo…)
npm run test:integration              # integration: 61 tests (DB riêng booking_test, gồm race condition 2 request cùng slot)

# E2E toàn luồng trên stack production local (docker compose prod đang chạy, PAYMENT_ENABLED=true)
bash scripts/smoke.sh                 # health → branches → services → stylists → slots → đặt lịch → trùng slot 409 → revenue → cọc VNPay + webhook tự ký → idempotent → hủy ≥24h
```

## Hạn chế đã biết

- SMS: cần cấu hình `SMS_API_URL`/`SMS_API_KEY` của nhà cung cấp để gửi thật (mặc định chỉ log).
- VNPay/MoMo: cần merchant key thật (sandbox/production) để live-test; smoke test dùng webhook tự ký bằng cùng hàm signature.
- Image backend ~727MB (Prisma 6 kéo `prisma` CLI vào prod deps; compressed ~230MB) — chấp nhận được cho VPS, theo dõi nếu muốn tối ưu thêm.
- `npm run start:prod` trỏ `dist/src/main.js` (đã sửa) — luôn dùng Dockerfile production cho deploy thật.
