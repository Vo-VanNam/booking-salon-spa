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
- Rate limit riêng cho endpoint public dễ bị lạm dụng: POST /auth/login, POST /bookings.
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

═══════════════════════════════════════
PHẠM VI BẮT ĐẦU
═══════════════════════════════════════
Bắt đầu code từ backend: Prisma schema đầy đủ theo mục 3, sau đó API đặt lịch (POST /bookings) với logic check trùng lịch theo mục 4.1, và API lấy slot trống theo mục 4.2. Frontend làm sau khi backend phần đặt lịch hoàn chỉnh.