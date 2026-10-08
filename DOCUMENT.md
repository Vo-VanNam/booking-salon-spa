TÀI LIỆU YÊU CẦU SẢN PHẨM
Web App Quản Lý Booking Salon/Spa — Chuỗi 3-5 Chi Nhánh (VN)

═══════════════════════════════════════
1. TỔNG QUAN
═══════════════════════════════════════
Web app đặt lịch hẹn cho chuỗi salon/spa tại Việt Nam (kiểu Booksy/Fresha bản đơn giản hóa), quy mô 3-5 chi nhánh. Đây là hệ thống production thật, deploy lên server chạy chính thức — không phải bản demo/POC. Yêu cầu chất lượng: có error handling, validate input đầy đủ, structured logging, unit test cho logic nghiệp vụ quan trọng (đặc biệt là check trùng lịch).

Đối tượng người dùng: khách hàng (đặt lịch), stylist (xem lịch cá nhân trên điện thoại), branch_admin (quản lý 1 chi nhánh), super_admin (quản lý toàn chuỗi).

═══════════════════════════════════════
2. CHỨC NĂNG NGHIỆP VỤ
═══════════════════════════════════════

2.1 Đặt lịch (khách hàng)
- Flow chọn: chi nhánh → dịch vụ → stylist → khung giờ trống.
- Hệ thống tự động check trùng lịch theo stylist + chi nhánh, không cho đặt trùng slot.
- Khung giờ hợp lệ phải nằm trong working_hours của stylist, trong giờ mở cửa chi nhánh, và không rơi vào time_off của stylist.
- Thời lượng slot = đúng duration của dịch vụ được chọn.

2.2 Hủy / đổi lịch
- Cho phép hủy hoặc đổi lịch nếu còn cách giờ hẹn >= 24h.
- Trong vòng 24h trước giờ hẹn: từ chối, trả lỗi rõ ràng.
- Đổi lịch phải chạy lại toàn bộ logic check trùng như khi đặt mới.

2.3 Nhắc lịch
- Gửi email/SMS nhắc lịch trước 1 ngày và trước 1 giờ.
- Hủy nhắc lịch tương ứng nếu booking bị hủy hoặc đổi giờ.

2.4 Loyalty
- Khách đặt đủ 10 lần (tính theo booking có status = completed) → tự động tính giảm giá cho lần đặt kế tiếp.
- Mọi lần cộng/trừ điểm loyalty phải được ghi log để audit (ai, khi nào, vì booking nào).

2.5 Thanh toán
- Cho phép đặt cọc online qua VNPay hoặc Momo (production keys, cấu hình qua biến môi trường, không hardcode).
- Phần còn lại thanh toán tại quầy.
- Webhook callback từ VNPay/Momo phải verify chữ ký trước khi tin payload.
- Xử lý idempotent: webhook có thể được gọi lại nhiều lần nhưng không được cộng tiền/xác nhận cọc trùng lặp.
- Lưu lại giao dịch (bao gồm payload webhook gốc) để đối soát.

2.6 Dashboard admin (branch_admin / super_admin)
- Xem lịch theo ngày/tuần dạng calendar view, kéo thả để dời lịch.
- Quản lý dịch vụ + giá theo từng chi nhánh.
- Quản lý stylist: giờ làm việc theo từng ngày trong tuần, ngày nghỉ, trạng thái active.
- Xem doanh thu theo ngày/tháng/chi nhánh.
- branch_admin chỉ xem được dữ liệu của chi nhánh mình; super_admin xem toàn chuỗi.

2.7 Trang stylist
- Tài khoản riêng, xem lịch cá nhân, tối ưu cho điện thoại.
- Không cần đầy đủ tính năng như admin.

2.8 Trợ lý AI đặt lịch (chatbot khách hàng)
- Widget chat tiếng Việt trên trang đặt lịch, trả lời và thao tác ngay trong hội thoại.
- Trả lời FAQ (giờ mở cửa, địa chỉ, bảng giá dịch vụ) — dữ liệu lấy từ DB, không được bịa.
- Kiểm tra khung giờ trống: bắt buộc gọi API slots nội bộ của hệ thống (mục 4.2); tuyệt đối không tự sinh khung giờ.
- Đặt lịch qua hội thoại: thu thập tên, SĐT, dịch vụ, stylist (nếu khách chọn), thời gian → gọi POST /bookings với đúng validation như UI; slot bị chiếm → đề xuất khung giờ khác.
- Handoff: câu hỏi ngoài phạm vi hoặc khách yêu cầu → đánh dấu hội thoại cần nhân viên hỗ trợ.
- Guardrails: chỉ được gọi tool trong whitelist (services, slots, bookings); chống prompt injection (yêu cầu vượt quyền như đặt miễn phí, xem dữ liệu khách khác → từ chối); không echo key/secret; không lộ PII của khách khác.
- Kỹ thuật: chạy hoàn toàn server-side, endpoint POST /ai/chat (streaming SSE là điểm cộng); bắt buộc dùng function/tool calling (không parse text tự do để đặt lịch); provider LLM OpenAI-compatible cấu hình qua biến môi trường AI_BASE_URL / AI_API_KEY / AI_MODEL (ví dụ DeepSeek) — không hardcode key ở bất kỳ đâu; lịch sử hội thoại lưu Redis với TTL, không log nội dung nhạy cảm.
- Rate limit riêng cho POST /ai/chat.

2.9 Trợ lý phân tích cho admin (tùy chọn — tier sau)
- Ô chat trong dashboard admin: hỏi bằng tiếng Việt về kinh doanh (doanh thu theo ngày/tháng/chi nhánh, top dịch vụ, top stylist, tỷ lệ hủy).
- Model chỉ được gọi các API analytics whitelist có sẵn; cấm sinh SQL trực tiếp từ model.
- Phân quyền: branch_admin chỉ nhận số liệu chi nhánh mình; không rò rỉ dữ liệu chi nhánh khác.
- Cùng cơ chế provider/env và guardrails như 2.8.

═══════════════════════════════════════
3. MÔ HÌNH DỮ LIỆU (chốt trước khi code)
═══════════════════════════════════════

Branch: tên, địa chỉ, giờ mở/đóng cửa, trạng thái active.

Service: tên, mô tả, giá, thời lượng (phút), thuộc branch nào.

Stylist: thông tin cá nhân, branch làm việc, working_hours theo từng ngày trong tuần, time_off, trạng thái active.

Customer: tên, số điện thoại (unique, validate định dạng VN: 10 số, đầu 03/05/07/08/09), email, số lần đặt lịch hoàn thành (phục vụ loyalty).

Booking: branch_id, service_id, stylist_id, customer_id, start_time, end_time, status (pending/confirmed/completed/cancelled/no_show), deposit_amount, deposit_status, created_at.

User (auth): liên kết customer/stylist/branch_admin/super_admin, role, password_hash.

LoyaltyTransaction: log mỗi lần cộng/trừ điểm loyalty.

PaymentTransaction: log giao dịch VNPay/Momo, payload webhook gốc, trạng thái.

Index bắt buộc: (stylist_id, start_time, end_time) và (branch_id, start_time) — phục vụ query slot trống nhanh.

Thời gian: xử lý theo timezone Asia/Ho_Chi_Minh ở tầng ứng dụng, lưu trong DB dạng UTC.

═══════════════════════════════════════
4. RÀNG BUỘC NGHIỆP VỤ QUAN TRỌNG
═══════════════════════════════════════

4.1 Check trùng lịch
- Điều kiện overlap chuẩn: NOT (end_time <= existing.start_time OR start_time >= existing.end_time).
- Chống race condition khi nhiều người đặt cùng lúc 1 slot: dùng transaction Postgres với row-level lock (SELECT ... FOR UPDATE trên các booking hiện có của stylist trong khoảng thời gian liên quan).
- Toàn bộ lỗi trả về client bằng tiếng Việt, rõ ràng: trùng lịch / ngoài giờ làm việc / stylist đang nghỉ.

4.2 Slot trống
- Tính từ: working_hours trừ time_off trừ booking hiện có.
- Cache bằng Redis, key theo branch + stylist + date, TTL ngắn (vài chục giây).
- Invalidate cache ngay khi có booking mới/hủy ảnh hưởng đến slot đã cache.

═══════════════════════════════════════
5. KIẾN TRÚC BACKEND
═══════════════════════════════════════
- Node.js + TypeScript, framework NestJS.
- PostgreSQL là DB chính, ORM: Prisma.
- Redis: cache slot trống.
- BullMQ: job queue cho nhắc lịch (email/SMS) và cron tính loyalty.
- Auth: JWT access token (thời hạn ngắn) + refresh token (lưu hashed trong DB, revoke được).
- 4 role: customer / stylist / branch_admin / super_admin, phân quyền theo guard.
- Tích hợp VNPay/Momo API thật, production keys qua biến môi trường.
- Validate + sanitize input kỹ, chống injection.
- Rate limit riêng cho endpoint public dễ bị lạm dụng: POST /auth/login, POST /bookings, POST /ai/chat.
- Module ai (mục 2.8/2.9): service gọi LLM OpenAI-compatible + tool registry bọc API nội bộ (services/slots/bookings/analytics), validate tham số tool, log mọi tool call để audit.
- Structured logging (JSON, có request_id để trace).
- Health check endpoint kiểm tra được cả kết nối DB và Redis.

═══════════════════════════════════════
6. KIẾN TRÚC FRONTEND
═══════════════════════════════════════
- Next.js (App Router) + TypeScript.
- TailwindCSS + shadcn/ui (button, dialog, calendar, form...).
- Thiết kế: minimal, tone màu be/nâu nhạt/trắng, không dùng màu sặc sỡ. Font: Be Vietnam Pro cho tiếng Việt, Inter cho số/latin.
- Trang đặt lịch (khách): flow từng bước với animation chuyển bước mượt (framer-motion), mobile-friendly vì khách chủ yếu đặt trên điện thoại.
- Trang admin: layout dashboard riêng, sidebar + calendar view kéo thả (FullCalendar hoặc tự build), ưu tiên desktop nhưng không vỡ layout trên tablet.
- Trang stylist: mobile-first.
- Toàn bộ UI text tiếng Việt. Format ngày giờ chuẩn VN (dd/MM/yyyy, 24h).
- Validate client-side: số điện thoại VN, email.
- Widget chat AI (mục 2.8) trên trang đặt lịch: bong bóng chat góc màn hình, mobile-friendly; ô chat phân tích trong dashboard admin (mục 2.9) thuộc tier sau.

═══════════════════════════════════════
7. TRIỂN KHAI PRODUCTION
═══════════════════════════════════════
- Docker: Dockerfile multi-stage riêng cho backend và frontend, tối ưu size image (alpine base, chỉ copy production deps).
- Chạy sau Nginx reverse proxy, HTTPS qua Let's Encrypt/certbot.
- Biến môi trường tách theo môi trường (production), không hardcode secret ở bất kỳ đâu (kể cả comment, test).
- Migration DB chạy tự động khi deploy bằng `prisma migrate deploy` — không dùng `migrate dev` trong production.
- docker-compose cho production stack: app backend + app frontend + postgres + redis + nginx, named volume cho postgres data.
- Mục tiêu hạ tầng: VPS (DigitalOcean/Vultr).

═══════════════════════════════════════
8. YÊU CẦU PHI CHỨC NĂNG
═══════════════════════════════════════
- Toàn bộ UI text và message lỗi trả về client: tiếng Việt.
- Format ngày giờ theo chuẩn VN.
- Validate số điện thoại VN và email nghiêm ngặt cả client lẫn server.
- Unit test bắt buộc cho logic check trùng lịch, bao gồm test race condition (giả lập 2 request đồng thời tranh cùng 1 slot).
- Test bắt buộc cho AI: dùng mock LLM server (OpenAI-compatible) trả tool calls theo kịch bản — deterministic, không gọi API LLM thật trong CI. Case tối thiểu: (1) hỏi slot → app gọi API slots thật và trả khung giờ có thật; (2) yêu cầu đặt lịch → gọi POST /bookings đúng validation; (3) slot bị chiếm → trả lỗi kèm gợi ý khác; (4) prompt injection → từ chối, không bypass quyền; (5) rate limit hoạt động.
- Key LLM và key thanh toán không bao giờ xuất hiện trong client bundle hay log.

═══════════════════════════════════════
PHẠM VI BẮT ĐẦU
═══════════════════════════════════════
Bắt đầu code từ backend: Prisma schema đầy đủ theo mục 3, sau đó API đặt lịch (POST /bookings) với logic check trùng lịch theo mục 4.1, và API lấy slot trống theo mục 4.2. Frontend làm sau khi backend phần đặt lịch hoàn chỉnh. Trợ lý AI (mục 2.8 bắt buộc, mục 2.9 tùy chọn) làm sau khi core đặt lịch chạy được end-to-end.

## BENCHMARK RUN CONTRACT (fixed; appended by the harness, overrides anything conflicting above)

This section fixes how the result is started and checked. It does not change the product requirements.

1. The repo root must contain `run.sh`, runnable as `bash run.sh` on Linux with network access. It must install dependencies if needed (idempotent), start everything the app needs (PostgreSQL and Redis may be started via `docker compose` — Docker is available on the machine), apply migrations, seed sample data if the DB is empty (idempotent), and start backend + frontend. Once ready (within 420 seconds), it must print exactly one line of the form `URL: http://<host>:<port>` to stdout (the frontend URL), then keep running in the foreground.
2. Ports are fixed: the backend listens on `http://localhost:8100`, the frontend on `http://localhost:8101` (the `URL:` line reflects the frontend). Do not use port 8080.
3. All state the grader needs must come from `bash run.sh` alone — no manual setup steps, no interactive prompts (`docker compose` must run without `-it`).
4. Seed data (idempotent, applied by run.sh when the DB is empty): 3 branches; each branch >= 2 services (name, price, duration); each branch >= 2 stylists with working_hours 08:00–20:00 every day of the week and no time_off; accounts: super_admin `admin@booking.vn` / `admin12345`, branch_admin of branch 1 `branch1@booking.vn` / `branch12345`, stylist of branch 1 `stylist1@booking.vn` / `stylist12345`.
5. `GET http://localhost:8100/health` returns HTTP 200 with JSON containing `"status":"ok"` (DB + Redis status may be included).
6. The app reads configuration only from environment variables. Payment keys (VNPAY_*, MOMO_*) and AI keys (AI_BASE_URL, AI_API_KEY, AI_MODEL) may be absent: the app must still start, payment creation must fail with a clear Vietnamese error, and POST /ai/chat must return a clear Vietnamese error (no crash). When `VNPAY_HASH_SECRET` is set, the webhook endpoint must verify HMAC signatures against it so the grader can forge valid test callbacks.
7. `POST http://localhost:8100/ai/chat` must work against any OpenAI-compatible `AI_BASE_URL` (the grader runs a local mock `/v1/chat/completions` supporting tool calls); non-streaming responses are acceptable.
8. Backend unit tests: `npm test` (or the equivalent documented in the backend README) runs the overlap + race-condition tests; tests may start their own dockerized DB but must not require the production stack to be running.
9. UI text is Vietnamese; dates use dd/MM/yyyy, 24h; timezone Asia/Ho_Chi_Minh.

## GRADER API SURFACE (fixed — the minimal interface the automated checker calls)

Part of the run contract: implement these exact routes and field names. Extra routes/fields are
fine; the aliases noted below are the only alternates the checker accepts. Unless stated, JSON
request/response bodies.

Auth
- POST /auth/login  {"email","password"} -> 200 JSON with "access_token" (string).
- Authenticated requests use header: Authorization: Bearer <access_token>.

Catalog (public)
- GET /branches -> JSON array (or {"data":[...]}) of {"id","name"}, ordered by id ascending.
- GET /branches/{branchId}/services -> array of {"id","name","price","duration_minutes"}
  ("duration" is accepted as an alias for duration_minutes).
- GET /branches/{branchId}/stylists -> array of {"id","name"}.

Slots
- GET /slots?branch_id=&stylist_id=&service_id=&date=YYYY-MM-DD (interpreted in Asia/Ho_Chi_Minh)
  -> array of {"start_time", ...}; start_time is ISO 8601 with +07:00 offset (or "Z").

Bookings
- POST /bookings  {"branch_id","service_id","stylist_id","start_time",
  "customer_name","customer_phone","customer_email"?}
  -> 201 JSON {"id","status","start_time","end_time","deposit_status","deposit_amount","discount_amount"}
  (ISO 8601 times; deposit_amount and discount_amount are integer VND; discount_amount = 0 unless the
  loyalty discount of 2.4 applies to this booking).
  Slot conflict -> 409 with a Vietnamese error in "error" or "message".
  Invalid input (phone/email/time outside working hours) -> 400 with a Vietnamese error.
- GET /bookings/{id} -> 200 JSON with the same fields as the POST response.
- POST /bookings/{id}/cancel -> 200 or 204; within 24h before start -> 4xx Vietnamese error.
- POST /bookings/{id}/complete -> 200, status becomes "completed"; requires a Bearer token of
  super_admin or branch_admin of that branch; accepts any non-cancelled booking (no time
  precondition).

Admin
- GET /admin/revenue?branch_id=  (Bearer token required; branch_id optional)
  -> 200 JSON with numeric "total_revenue" (VND). branch_admin may only query own branch
  (other branch -> 403); missing/invalid token -> 401.

Payments (VNPay only; the checker forges callbacks)
- POST /bookings/{id}/deposit -> 200 JSON {"payment_url","txn_ref"} when VNPAY_* env is configured;
  without VNPAY keys -> 4xx with a Vietnamese error.
- POST /webhooks/vnpay  body = flat JSON of vnp_* fields including vnp_TxnRef and vnp_SecureHash.
  Signature: lowercase hex HMAC-SHA512, secret = VNPAY_HASH_SECRET, message = all other vnp_* fields
  sorted by key ascending, each "<key>=<value>", joined with "&". vnp_Amount is integer VND
  (not multiplied by 100). Valid signature -> 200 {"status":"ok"} (or "already_processed");
  the booking's deposit_status becomes "paid" and deposit_amount is credited exactly once per
  vnp_TxnRef — repeated callbacks must not change deposit_amount. Invalid signature -> 4xx;
  without VNPAY_HASH_SECRET configured -> 4xx.

AI
- POST /ai/chat  {"message","session_id"?} -> 200 JSON with the assistant reply text in "reply"
  ("message" is accepted as an alias). Without AI configuration -> 4xx/5xx with a Vietnamese
  error (no crash). The LLM is called at {AI_BASE_URL}/chat/completions, where AI_BASE_URL is
  the OpenAI-style base URL (in the grader it already ends with /v1); non-streaming responses
  are acceptable.
- Mock LLM interop (the grader runs a scripted local mock at AI_BASE_URL): expose these tools
  to the model with exactly these names and argument keys — get_slots(branch_id, stylist_id,
  service_id, date), returning the app's real slots, and create_booking(branch_id, service_id,
  stylist_id, start_time, customer_name, customer_phone), creating a real booking. The mock
  replies with one assistant message per request; tool calls outside the whitelist must not be
  executed. Tool results (with their ISO 8601 start_time values) must be sent back to the model,
  and the model's final text must reach the client as the reply.

Rate limits
- POST /ai/chat -> 429 after at most 30 requests per 60 s per client.
- POST /bookings must allow at least 60 creations per minute per client; the grader's booking
  sequence must not be throttled.
