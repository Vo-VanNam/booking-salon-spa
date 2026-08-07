STACK ĐANG CHẠY (https://localhost) nhưng có GAP NGHIÊM TRỌNG về navigation/info-architecture.

VẤN ĐỀ: Tất cả 12 pages + toàn bộ backend đều serve 200, nhưng user mở `https://localhost` chỉ thấy 1 trang (home + button "Đặt lịch") → vào `/dat-lich` → booking flow → hết. User KHÔNG BIẾT tồn tại admin dashboard, stylist portal, login, register — phải gõ URL tay.

ROOT CAUSE:
1. `frontend/src/app/layout.tsx` — `<Providers>{children}</Providers>` — KHÔNG có nav header/menu. Home page chỉ link tới `/dat-lich` (1 link duy nhất).
2. Các pages bị orphaned (admin, stylist, dang-nhap, dang-ky) — không link discovery từ bất kỳ page nào.
3. Plan ban đầu liệt kê pages + backend features NHƯNG KHÔNG có "info architecture" — không zonet "pages liên kết qua nav, sitemap, breadcrumbs".

FIX CẦN LÀM (ưu tiên — 1 PR):
1. Tạo `frontend/src/components/nav.tsx` — Nav header component (server component, dùng shadcn/ui sẵn):
   - Logo "Salon Glow" → `/`
   - "Đặt lịch" → `/dat-lich` (public)
   - "Stylist" → `/stylist` (CHỈ hiện khi auth + role stylist/branch_admin/super_admin)
   - "Admin" → `/admin` (CHỈ hiện khi auth + role branch_admin/super_admin)
   - Auth menu: "Đăng nhập"/"Đăng ký" nếu chưa auth; user dropdown (name + logout) nếu đã auth
2. `frontend/src/app/layout.tsx` — include `<Nav />` trên cùng, sau `<Providers>`, trước `{children}`. Nav là server component, dùng session/auth provider.
3. `frontend/src/app/page.tsx` (home) — thêm footer links "Quản lý salon" → `/admin`, "Stylist portal" → `/stylist` (visible discovery dù chưa auth).
4. Mỗi page admin/stylist có breadcrumb "← Quay lại trang chủ" → `/`.

ACCEPTANCE CRITERIA:
- Vào `https://localhost` (không auth) → thấy nav với: Đặt lịch, Admin (link), Stylist (link), Đăng nhập, Đăng ký
- Vào `https://localhost/stylist` (không auth) → redirect `/dang-nhap` HOẶC placeholder yêu cầu login
- Login admin → nav cập nhật: user dropdown + link được phép
- Mobile responsive: nav hamburger menu trên màn hẹp (shadcn Sheet/Dialog)
- Nav không bị overlap với hero

CHÚ Ý: model test headless không thấy UI navigation — chỉ curl API. Lần này verify navigation BẰNG CÁCH mở browser thật (curl từng page + check content có nav link tới). Sau khi fix, restart nginx container (`docker compose restart nginx`) nếu cần.
