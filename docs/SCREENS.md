# SCREENS.md — Booking Salon/Spa (screen map)

Design inputs: `DOCUMENT.md` §6 (minimal, be/nâu nhạt/trắng, Be Vietnam Pro + Inter, mobile-first
cho khách, desktop-first cho admin, mobile-first cho stylist) and `docs/PRD.md` (requirements).
Journeys come from PRD §2. Each row answers "what does the user need to FEEL or DO here".

## Journeys

1. **Khách đặt lịch** (mobile, 60–90s): mở trang → chọn chi nhánh → chọn dịch vụ → chọn stylist →
   chọn khung giờ → nhập tên/SĐT → xác nhận. Aha moment: khung giờ trống hiện ra tức thì, không
   phải chờ ai xác nhận.
2. **Khách hỏi chatbot** (mobile): bong bóng chat → hỏi giá/giờ mở cửa → bot trả lời từ DB → đặt
   lịch ngay trong hội thoại. Aha: đặt được lịch mà không cần rời khỏi khung chat.
3. **Khách hủy/đổi lịch**: tra cứu theo SĐT → chọn lịch → hủy hoặc đổi trong điều kiện ≥24h.
4. **branch_admin mở ca** (desktop/tablet): đăng nhập → thấy lịch hôm nay theo stylist → kéo thả
   một lịch sang giờ khác → xem doanh thu. Aha: kéo thả xong, khung giờ tự cập nhật.
5. **super_admin điều hành chuỗi**: chuyển chi nhánh bằng một cú click, so doanh thu 3 chi nhánh.
6. **Stylist xem lịch trên điện thoại** (mobile, ngoài giờ làm): mở trang → thấy lịch hôm nay và
   tuần này, không cần đăng nhập phức tạp.
7. **Staff quản trị dịch vụ/stylist**: thêm dịch vụ + giá, chỉnh giờ làm việc, đánh dấu nghỉ.
8. **Chủ chuỗi hỏi trợ lý phân tích** (tier 2): hỏi "doanh thu chi nhánh 1 tháng này?" bằng tiếng Việt.

## Screen map

| Screen | Why it exists (need it answers) | Signature moment | Data shown / entered | States designed |
|---|---|---|---|---|
| `login.html` — Đăng nhập | Staff needs one door for all 4 roles; the redirect after login must feel like the app already knows their job. | Role-aware redirect landing directly on the right surface | email, password | loading, wrong-credentials error, rate-limit error |
| `booking.html` — Đặt lịch (customer, mobile-first) | The whole product lives or dies here; must fit one thumb and finish in <90s. | Step transition: the chosen service slides forward with its duration/price carried in the header ribbon | branches, services, stylists, slots, name/phone/email | step loading, no-slots (empty, offers next day), 409 conflict (offers neighbours), validation errors, success + deposit CTA |
| `booking-lookup.html` — Tra cứu / hủy / đổi lịch | A customer changes their mind days later; they must not have to call the salon. | Timeline card showing the 24h boundary and exactly why a cancel is allowed or blocked | phone → bookings; new start time for reschedule | empty (no bookings), <24h blocked, rescheduled confirmation |
| `admin-calendar.html` — Lịch chi nhánh | The day view is the admin's workspace; the schedule must be movable without leaving the page. | Drag a booking block sideways and the whole column re-flows to the new slot | bookings by stylist × hour, statuses, quick KPI band | loading skeleton, empty day (invite to create), drag-in-flight, conflict toast, tablet reflow |
| `admin-services.html` — Dịch vụ & giá | Price/duration changes are the most frequent admin edit and must be per-branch. | Inline price edit that shows the delta against the previous value | name, price, duration, active | empty list, validation error, save success |
| `admin-stylists.html` — Stylist | Working hours and time off drive every slot the customer sees. | Weekly hour matrix where unset days read as closed, not as zero | stylist profile, 7-day hours, time-off ranges, active | no-hours week, time-off overlay, deactivating warning |
| `admin-revenue.html` — Doanh thu | Owners decide with revenue, not with bookings count. | Branch comparison strip: 3 branches, one scale, current branch highlighted | total, by day, by month, by branch, completed count | loading, empty month, single-branch scope (branch_admin) |
| `admin-ai.html` — Trợ lý phân tích (tier 2) | Non-technical owners ask in Vietnamese instead of clicking through reports. | Answer arrives with the exact figure and its date range in the sentence | chat, suggested questions, branch scope badge | not-configured error, out-of-scope refusal, loading |
| `stylist.html` — Lịch của stylist (mobile-first) | Stylists check their day one-handed between clients. | Today's next appointment pinned at the top with a countdown | today + week schedule, customer first name, service duration | empty day, many services day, offline/stale timestamp |
| `404.html` | Broken links and stale bookmarks exist; a dead end must still send people somewhere useful. | — | links back to booking / login | — |

## States checklist (applies to every screen above)
- **Empty**: list screens show an invitation with a CTA, never a bare "Không có dữ liệu".
- **Loading**: <1s → nothing, 1–3s → spinner, >3s → skeleton rows (motion tokens in design-tokens.md).
- **Error**: field-level Vietnamese errors near the field; network errors as an inline banner with retry.
- **Freshness**: calendar/revenue show "Cập nhật lúc HH:mm" from the last successful fetch.
- **Responsive**: 375 / 768 / 1024 / 1440; admin calendar switches to day-column scroll on tablet;
  booking wizard and stylist page are designed at 375 first.
- **Keyboard**: visible focus ring on every interactive element; drag & drop has a keyboard path
  (chọn lịch → "Dời lịch" → chọn giờ mới).
- **Contrast**: every text/surface pair meets WCAG AA (table in `design-tokens.md`).

## Scope note (benchmark)
The Next.js app implements these screens directly; the separate HTML mockup set would duplicate the
shipped UI, so `docs/design/specs/*` (manifesto, tokens, components) plus the live app is the
implementation contract. Deviations are recorded in the final report.
