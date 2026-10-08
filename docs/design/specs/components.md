# components.md — component system

Screens compose ONLY these components (shadcn/ui conventions: `components/ui/*`, `cn()` helper,
`cva` variants). Each component lists its anatomy and the tokens it consumes.

| Component | File | Anatomy | Tokens | States |
|---|---|---|---|---|
| `Button` | `components/ui/button.tsx` | text + optional leading icon | accent, accent-hover, text-inverse, radius 8, motion-micro | default / hover / focus-visible / disabled / loading ("Đang xử lý…") |
| `Input`, `Textarea` | `components/ui/input.tsx` | label (visible) + control + helper + inline error | surface, border → border-strong on focus, danger for error | default / focus / disabled / invalid |
| `Select` | `components/ui/select.tsx` | label + native/radix select | same as Input | default / open / disabled |
| `Card` | `components/ui/card.tsx` | surface + header (title/meta) + body + footer | surface, border, shadow-sm, radius 12 | static; `surface-2` header variant for tables |
| `Badge` | `components/ui/badge.tsx` | dot/label pill (status always has text) | success/warning/danger/info/accent-soft | one per booking status + AI marker |
| `Dialog` | `components/ui/dialog.tsx` | overlay + panel + title + actions | surface, shadow-md, scrim rgba(43,35,32,.35) | open (focus trapped, Esc/click-outside close) / closed |
| `Table` | `components/ui/table.tsx` | `<table>` + `<colgroup>`-style shared grid; numeric right, tabular-nums | border, surface-2 header | loading skeleton / empty row-slot / dense |
| `Tabs` | `components/ui/tabs.tsx` | tablist + panels | accent underline, surface-2 | selected / focus |
| `Toast` | `components/toast.tsx` | icon + message + optional action | success/danger/info, motion-toast | entering / leaving |
| `EmptyState` | `components/ui/empty-state.tsx` | icon + reason + CTA | text-muted, accent | static |
| `Skeleton` | `components/ui/skeleton.tsx` | shimmering rows | surface-2 | loading |
| `SlotButton` | `components/booking/slot-button.tsx` | "08:00 · 60 phút" | accent-soft selected, surface-3 pressed | available / selected / disabled |
| `StepRibbon` (signature) | `components/booking/step-ribbon.tsx` | accent bar carrying "60 phút · 350.000đ" + branch/stylist summary | accent, text-inverse | static, animates in at step ≥2 |
| `BookingWizard` | `components/booking/booking-wizard.tsx` | 4 steps + confirm, framer-motion step transition | motion-step, spacing scale | step loading / conflict / success |
| `AiChatWidget` | `components/chat/ai-chat-widget.tsx` | bubble → panel (header "Trợ lý đặt lịch", messages, input) | surface, shadow-md, info chip | closed / open / thinking / error (not configured) / handoff |
| `CalendarBoard` | `components/admin/calendar-board.tsx` | hours × stylist columns, absolutely positioned booking blocks, drag & drop | surface/surface-2, status badge colors, shadow-md drag ghost | loading / empty day / dragging / conflict toast / tablet scroll |
| `RevenueChart` | `components/admin/revenue-chart.tsx` | CSS bar chart (day/month) + legend + accessible table fallback | accent bars, text-muted axis | loading / empty / single branch |
| `KpiCard` | `components/admin/kpi-card.tsx` | label + value + delta + timestamp ("Cập nhật lúc HH:mm") | text, text-muted, semantic delta | loading / stale |
| `AdminSidebar` | `components/admin/sidebar.tsx` | grouped nav (≤7 items, one level) + branch switcher + user row | surface-2, accent-soft active | collapsed (icon rail) on tablet |
| `AnalyticsPanel` | `components/admin/ai-analytics-panel.tsx` | chat + suggested questions + branch-scope chip | info chip, surface | idle / loading / not-configured / refused |

## Composition rules
1. Screens never invent styles: a missing need is added to this table first, then composed from tokens.
2. Every table follows the shared-template rule (one grid/`<colgroup>`, same column classes in header
   and body, numeric columns right-aligned with tabular-nums) so header/body stay aligned at all breakpoints.
3. Data screens use ONE density tier (admin = dense 8/12/16/24 spacing); customer screens use the
   spacious tier, never mixed on one screen.
4. Calendar/table cells carry drill-down affordances: click a booking block → detail dialog with
   exact times, customer, status actions; the revenue chart exposes the same numbers as a table.
5. Every KPI/table shows its freshness timestamp; a number without one is not shown.
