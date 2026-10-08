# manifesto.md — Booking Salon/Spa (VN chain)

## Brief
- **Who it is for**: chị Lan, 34 tuổi, quản lý chi nhánh Quận 3 của chuỗi spa 3 chi nhánh; mở app
  trên laptop lúc 8h sáng để biết hôm nay ai làm gì, và trên điện thoại khi khách gọi đổi giờ.
  Và bạn Trang, 26 tuổi, khách quen đặt lịch trên điện thoại trong 90 giây giữa giờ nghỉ trưa.
- **Feeling**: "một cuốn lịch giấy đắt tiền" — yên tĩnh, rõ ràng, không tranh giành sự chú ý với dữ liệu.
- **Difference statement**: đây không phải dashboard SaaS tím-xanh; nó là một **lịch giấy màu be**
  số hoá — chữ Việt đúng, giờ 24h, tiền VND, và mọi hành động (kể cả đặt lịch bằng chat) đều kết
  thúc bằng một khung giờ cụ thể trên lịch, không phải bằng một "cảm ơn bạn đã liên hệ".
- **Signature moment**: khi khách chọn dịch vụ, **dải ribbon thời lượng** (60 phút · 350.000đ)
  trượt lên nằm cạnh tên dịch vụ và bám theo suốt các bước sau — khách luôn biết mình đang mua gì.

## Look & Feel
- **Visual direction**: minimal, editorial-nhẹ — bố cục lệch nhịp một chút ở màn khách, kỷ luật
  tuyệt đối trên bảng dữ liệu.
- **Color language**: be (nền), nâu nhạt (đường viền + chữ phụ), trắng (surface), một accent
  nâu đậm cho hành động; đỏ/amber/xanh lá chỉ dành cho trạng thái (hủy/cảnh báo/hoàn tất).
- **Depth/material**: phẳng, 1 cấp shadow rất nhẹ; không gradient, không glow, không kính mờ.
- **Composition**: mobile-first, một cột cho khách; admin là grid 2 tầng (rail dọc + vùng lịch
  lớn); hero của admin là **cột lịch hôm nay**, không phải hàng thẻ KPI.

## Three concepts (architecture-level)
**Concept A — "Sổ lịch" (chosen).** Lịch là trung tâm: khách đi qua một cột dọc 4 bước;
admin mở ra là thấy cột lịch của ngày hôm nay, mọi thứ khác là panel trượt bên phải.
`branch ▸ service ▸ stylist ▸ slot`, mỗi bước ~1 màn hình điện thoại.
```
┌──────────────┐   ┌──────────────┐   ┌──────────────────────┐
│ Chi nhánh    │   │ Dịch vụ      │   │ 08:00 ▓ 09:00 ░ …    │
│ ▸ Q.3 (chọn) │ → │ 60' 350k  ▸  │ → │ stylist × giờ        │
└──────────────┘   └──────────────┘   └──────────────────────┘
```
**Concept B — "Chat-first".** Toàn bộ sản phẩm là một khung chat, lịch chỉ là kết quả render.
Rejected: chatbot bắt buộc (PRD §2.8) nhưng không được phép thay thế luồng đặt lịch —
khách vẫn cần tự nhìn thấy giờ trống, và admin vẫn cần calendar kéo thả.

**Concept C — "Command bar" (kiểu Linear).** Một ô lệnh duy nhất (`/dat lich`, `/doanh thu`).
Rejected: nhân viên salon không làm việc bằng phím tắt, và trên điện thoại command bar thua
một nút to.

## Decision record
Chọn **A**. Bị loại: **B** vì nó biến guardrail của AI thành đường duy nhất, trong khi PRD yêu cầu
AI là *thêm vào* luồng UI chứ không thay thế; **C** vì sai đối tượng người dùng (mobile, tay bận).
A không phải AI-default vì bố cục lấy **cột lịch** làm hero thay vì hero-metrics-features, và
palette be/nâu do PRD chỉ định chứ không phải màu mặc định của model.

## Voice
Một câu: *"Nói như một người quản lý salon tử tế — ngắn, cụ thể, không hứa hẹn."*
Ví dụ copy thật:
- Empty slot list: "Chi nhánh đã kín lịch ngày 08/10. Còn trống ngày 09/10 — xem ngay."
- Conflict: "Khung 14:00 vừa được đặt. Gần nhất còn trống: 15:00, 15:30."
- Blocked cancel: "Không thể hủy trong vòng 24 giờ trước giờ hẹn. Vui lòng gọi chi nhánh."
- Admin empty day: "Hôm nay chưa có lịch. Thêm lịch cho khách vãng lai."
