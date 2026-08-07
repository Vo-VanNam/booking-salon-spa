Stack `https://localhost` đang chạy nhưng có BUG AUTH NGHIÊM TRỌNG — người dùng đăng nhập thành công nhưng vào admin pages bị redirect về `/dang-nhap` liên tục.

**BUG:**
File `frontend/src/components/auth-provider.tsx` — hàm `refresh()`:
```ts
const me = await apiGet<MeResponse>("/auth/me", true);  // ← skipAuth=true
```

`apiGet(path, skipAuth=true)` KHÔNG gắn `Authorization: Bearer <accessToken>` header (xem `lib/api.ts` line 210+). Khi không có token → server trả 401 → rơi vào catch `setUser(null)` → `RouteGuard` của `/admin` thấy `user=null` → `router.replace("/dang-nhap")` → loop.

**ĐĂNG NHẬP THÀNH CÔNG NHƯNG BỊ REDIRECT** vì `/auth/me` không bao giờ thấy token của user (skipAuth bỏ header).

**FIX (1 dòng):**
`frontend/src/components/auth-provider.tsx` — sửa:
```ts
const me = await apiGet<MeResponse>("/auth/me");  // bỏ skipAuth=true
```
Khi accessToken hết hạn → 401 → `tryRefresh()` trong `request()` xử lý tự động (line ~230 của `lib/api.ts`) → retry → 200. Không cần skipAuth cho lệnh gọi này — refresh logic đã xử lý.

**ACCEPTANCE CRITERIA:**
1. Login `admin@your-domain.example.com` / `SalonAdmin@2026-LocalTest` → redirect `/admin` (KHÔNG còn redirect về `/dang-nhap`).
2. Mở tab mới → `https://localhost/admin` (không có cookie/session) → redirect `/dang-nhap` (RouteGuard vẫn hoạt động đúng khi chưa auth).
3. Sau khi login, navigate `/stylist` (nếu role super_admin → redirect về `/admin` theo `homePathForRole`).
4. `/auth/me` trả 200 với token hợp lệ, 401 với token hết hạn (kiểm tra `tryRefresh` chạy).
5. Logout → `/auth/me` không gọi (no refreshToken) → user null → redirect `/dang-nhap`.

**FILE CẦN SỬA:** `frontend/src/components/auth-provider.tsx` (1 dòng).

**VERIFY:** chạy `cd /Users/nvoz/Projects/booking-salon-spa && export NODE_TLS_REJECT_UNAUTHORIZED=0 && node scripts/smoke.mjs` (nếu có test auth/login) + verify manual qua curl: login → lưu token → GET /admin → 200 (hoặc nội dung admin) — phải login thành công.

**LƯU Ý:** model đã làm chức năng login + nav + route-guard đúng — nhưng miss 1 dòng skipAuth. Sau fix, rebuild frontend container (`docker compose -f docker-compose.prod.yml build frontend && docker compose -f docker-compose.prod.yml up -d frontend`).
