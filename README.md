# Booking Salon/Spa — chuỗi 3–5 chi nhánh (VN)

Web app đặt lịch hẹn cho chuỗi salon/spa: khách đặt lịch trên điện thoại, stylist xem lịch cá nhân,
quản lý chi nhánh vận hành lịch + dịch vụ + stylist + doanh thu, quản trị chuỗi xem toàn bộ,
kèm trợ lý AI đặt lịch (chat tiếng Việt, function calling server-side).

Yêu cầu sản phẩm đầy đủ và hợp đồng chạy của harness: [`DOCUMENT.md`](DOCUMENT.md).
Kiến trúc/dữ liệu/API: [`docs/STACK.md`](docs/STACK.md), [`docs/DATA_MODEL.md`](docs/DATA_MODEL.md),
[`docs/API.md`](docs/API.md), bản đồ màn hình: [`docs/SCREENS.md`](docs/SCREENS.md),
quy ước làm việc: [`RAI.md`](RAI.md).

## Chạy nhanh

```bash
bash run.sh
```

Script này (idempotent, không hỏi gì):

1. nạp `.env` nếu có — chỉ điền biến **còn thiếu**, không ghi đè biến môi trường bạn đã đặt;
2. dựng PostgreSQL + Redis bằng `docker compose` (named volume cho dữ liệu Postgres);
3. cài dependencies, chạy `prisma migrate deploy`, seed dữ liệu mẫu;
4. build backend và chạy backend ở cổng **8100**, frontend ở cổng **8101**;
5. in đúng một dòng `URL: http://localhost:8101` rồi tiếp tục chạy ở foreground.

Log: `.run/backend.log`, `.run/frontend.log`.

## Dịch vụ và cổng

| Thành phần | URL / cổng |
|---|---|
| Frontend (Next.js) | http://localhost:8101 |
| Backend API (NestJS) | http://localhost:8100 |
| Health check | http://localhost:8100/health (kiểm tra cả PostgreSQL và Redis) |
| PostgreSQL | localhost:55432 (`POSTGRES_PORT`) |
| Redis | localhost:56379 (`REDIS_PORT`) |

## Tài khoản mẫu (seed)

| Vai trò | Email | Mật khẩu |
|---|---|---|
| Quản trị chuỗi (super_admin) | `admin@booking.vn` | `admin12345` |
| Quản lý chi nhánh 1 (branch_admin) | `branch1@booking.vn` | `branch12345` |
| Stylist chi nhánh 1 | `stylist1@booking.vn` | `stylist12345` |

Seed tạo 3 chi nhánh, mỗi chi nhánh ≥2 dịch vụ và ≥2 stylist với giờ làm việc 08:00–20:00 cả tuần.

## Tính năng

- **Khách**: wizard 4 bước (chi nhánh → dịch vụ → stylist → khung giờ) + xác nhận, animation chuyển
  bước, mobile-first; tra cứu/hủy/đặt cọc theo số điện thoại; widget chat AI tiếng Việt.
- **Đặt lịch an toàn**: check trùng lịch theo biểu thức chuẩn `NOT (end <= start OR start >= end)`,
  khoá `pg_advisory_xact_lock` theo stylist + `SELECT … FOR UPDATE` trên các booking liên quan
  (chống race khi hai người tranh cùng một slot).
- **Slot trống**: tính từ working_hours − time_off − booking, cache Redis TTL 30s, invalidate ngay khi
  có booking mới/hủy/dời.
- **Hủy/đổi lịch**: chỉ cho phép khi còn ≥ 24h; đổi lịch chạy lại toàn bộ kiểm tra như đặt mới.
- **Nhắc lịch**: BullMQ job trước 1 ngày và 1 giờ (email qua SMTP khi cấu hình, có bảng `notifications`
  để audit); hủy/dời lịch sẽ xoá và xếp lại job.
- **Loyalty**: đủ 10 lần hoàn thành → giảm 10% cho lần đặt kế tiếp (một lần cho mỗi chu kỳ),
  mọi lần cộng/trừ ghi vào `loyalty_transactions`; cron 02:00 rà soát lại số liệu.
- **Thanh toán**: đặt cọc online VNPay (HMAC-SHA512) và Momo (HMAC-SHA256); webhook verify chữ ký
  trước khi tin payload, ghi nhận **đúng một lần** cho mỗi `(provider, txn_ref)`, lưu payload gốc để đối soát.
- **Dashboard admin**: lịch ngày theo stylist, kéo–thả để dời lịch, dialog chi tiết + hoàn tất/không đến/hủy,
  CRUD dịch vụ & giá theo chi nhánh, giờ làm việc theo tuần + ngày nghỉ, doanh thu theo ngày/tháng/chi nhánh.
- **Trang stylist**: mobile-first, ca kế tiếp + lịch hôm nay + lịch sắp tới.
- **Trợ lý AI**: `/ai/chat` (khách) và `/ai/admin-chat` (phân tích), OpenAI-compatible qua
  `AI_BASE_URL`/`AI_API_KEY`/`AI_MODEL`, function calling với whitelist công cụ, chống prompt injection,
  lịch sử hội thoại trong Redis (TTL 1h), audit mọi tool call, rate limit 30 req/60s.

## Biến môi trường

Xem [`.env.example`](.env.example). Nguyên tắc:

- Ứng dụng chỉ đọc cấu hình từ biến môi trường; **không hardcode secret** ở bất kỳ đâu.
- `VNPAY_*`, `MOMO_*`, `AI_*` có thể **thiếu**: app vẫn khởi động, tạo thanh toán trả lỗi tiếng Việt rõ ràng,
  `/ai/chat` trả lỗi tiếng Việt (HTTP 503) chứ không crash.
- Khi có `VNPAY_HASH_SECRET`, webhook `POST /webhooks/vnpay` xác thực chữ ký HMAC-SHA512 theo đúng
  định dạng của DOCUMENT.md (chuỗi `key=value` sắp xếp theo key, nối bằng `&`, hex thường).

## Test

```bash
cd backend && npm test
```

Test dựng PostgreSQL riêng cho test (`backend/docker-compose.test.yml`, cổng 55433) và **không** cần
stack production đang chạy. Bao gồm:

- `src/bookings/overlap.util.spec.ts` — logic trùng lịch (biên, bao nhau, chạm biên).
- `test/api-surface.e2e-spec.ts` — toàn bộ bề mặt API theo hợp đồng + **test race condition**
  (hai request đồng thời tranh một slot → đúng một thắng, một nhận 409) + loyalty + phân quyền chi nhánh.
- `test/ai-chat.e2e-spec.ts` — mock LLM server (OpenAI-compatible): slot thật, đặt lịch thật, slot bị chiếm
  kèm gợi ý, prompt injection/tool ngoài whitelist bị từ chối, rate limit 429.
- `test/payments.e2e-spec.ts` — ký webhook bằng implementation độc lập, idempotent (kể cả callback song song),
  chữ ký sai bị từ chối.
- `src/payments/vnpay.adapter.spec.ts` — vector HMAC cố định.

## Kiểm tra bề mặt API đang chạy

```bash
node scripts/api-check.mjs                 # mặc định http://localhost:8100
BASE=http://localhost:8100 node scripts/api-check.mjs
```

## Triển khai production (§7)

```bash
cp .env.example .env      # điền secret thật
docker compose -f docker-compose.prod.yml up -d --build
```

Stack gồm backend + frontend + PostgreSQL + Redis + Nginx, dùng named volume cho dữ liệu Postgres,
backend tự chạy `prisma migrate deploy` khi khởi động (`backend/docker-entrypoint.sh`).
HTTPS: lấy chứng chỉ Let's Encrypt bằng certbot rồi mở khối `server 443` trong `nginx/nginx.conf`.
