# Frontend — Next.js (App Router) + TailwindCSS

Giao diện tiếng Việt cho 3 nhóm người dùng. Design tokens và quy ước thành phần:
[`../docs/design/specs/design-tokens.md`](../docs/design/specs/design-tokens.md),
[`../docs/design/specs/components.md`](../docs/design/specs/components.md).

## Lệnh

```bash
npm install
npm run dev        # next dev -p 8101
npm run build      # next build
npm start          # next start -p 8101
npm run typecheck  # tsc --noEmit
```

Biến môi trường: `NEXT_PUBLIC_API_URL` (mặc định `http://localhost:8100`). Không có khoá bí mật nào ở client.

## Màn hình

| Route | Đối tượng | Nội dung |
|---|---|---|
| `/` | Khách | Wizard đặt lịch 4 bước + xác nhận, ribbon lựa chọn, widget chat AI |
| `/lookup` | Khách | Tra cứu theo SĐT, hủy lịch, đặt cọc |
| `/login` | Nhân viên | Đăng nhập, điều hướng theo vai trò |
| `/admin` | branch/super admin | Lịch ngày theo stylist, kéo–thả dời lịch, dialog chi tiết + trạng thái |
| `/admin/services` | branch/super admin | Thêm/sửa giá/ẩn dịch vụ theo chi nhánh |
| `/admin/stylists` | branch/super admin | Giờ làm việc theo tuần, ngày nghỉ, trạng thái |
| `/admin/revenue` | branch/super admin | Doanh thu theo ngày/tháng/chi nhánh + bảng số liệu |
| `/admin/ai` | branch/super admin | Trợ lý phân tích tiếng Việt (chỉ gọi API analytics được cấp) |
| `/stylist` | Stylist | Lịch cá nhân mobile-first |

Quy ước: mọi text tiếng Việt, ngày `dd/MM/yyyy`, giờ 24h, múi giờ `Asia/Ho_Chi_Minh`
(`lib/format.ts`); validate SĐT/email ở `lib/validators.ts`; mọi lời gọi API qua `lib/api.ts`.
