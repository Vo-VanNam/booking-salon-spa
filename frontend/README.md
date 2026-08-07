This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Các trang chính

| Route | Mô tả |
|---|---|
| `/` | Trang chủ + danh sách chi nhánh |
| `/dat-lich` | Wizard đặt lịch (khách hàng) |
| `/dang-nhap`, `/dang-ky` | Đăng nhập / đăng ký tài khoản |
| `/admin*` | Trang quản trị: Lịch (FullCalendar, kéo-thả dời lịch), Dịch vụ, Stylist, Doanh thu (recharts), Chi nhánh + Tạo tài khoản (chỉ super_admin) |
| `/stylist` | Lịch làm việc stylist (mobile-first, chỉ xem) |

## Bảo vệ route và phiên đăng nhập

- Route `/admin` (super_admin, branch_admin) và `/stylist` (stylist) được bảo vệ phía client qua `RouteGuard`: kiểm tra phiên bằng `GET /auth/me` (tự refresh khi access token hết hạn) rồi kiểm tra vai trò, chuyển hướng về `/dang-nhap` nếu thiếu. Tradeoff: guard chạy ở client nên trang SSR vẫn render khung trước khi redirect; dữ liệu thật vẫn được backend bảo vệ bằng JWT + RolesGuard.
- Access token giữ trong memory (chống XSS đánh cắp), refresh token trong localStorage (sống qua lần tải lại trang). Sau F5, access token mất và api client tự refresh bằng refresh token. Chi tiết tại `src/lib/token-store.ts`.
- Sai vai trò sẽ bị chuyển về trang phù hợp với vai trò đó (vd stylist vào `/admin` → về `/stylist`).

## Múi giờ

- Backend lưu và trả thời gian theo ISO UTC; mọi hiển thị dùng múi giờ trình duyệt (nhất quán với `src/lib/format.ts`). FullCalendar nhận ISO UTC và tự đổi sang giờ địa phương; khi kéo-thả dời lịch, frontend gửi `startTime` dạng ISO UTC.
- Ngày query calendar/doanh thu gửi dạng `yyyy-MM-dd`, backend quy về ngày theo giờ Việt Nam (UTC+7, không DST).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
