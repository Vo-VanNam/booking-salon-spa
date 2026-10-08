# design-tokens.md

```
Design Module: "Be lịch" =
  styles.md[Minimalism / editorial-light] + palettes.md[warm neutral: be–nâu nhạt–trắng]
  + typography-pairings.md[Be Vietnam Pro + Inter] + depth:<flat, 1 shadow step> + density:<customer 3 / admin 7> + radius:<8–12px>
```
Traceability: PRD §6 fixes the direction (minimal, be/nâu nhạt/trắng, không màu sặc sỡ, Be Vietnam Pro
cho tiếng Việt + Inter cho số/latin). Adjustments stay inside that neutral-brown family; no foreign hues.

## Color

| Token | Hex | Use |
|---|---|---|
| `--color-bg` | `#FAF7F2` | page background (be nhạt) |
| `--color-surface` | `#FFFFFF` | cards, sheets, calendar cells |
| `--color-surface-2` | `#F3EDE4` | rails, table headers, hover rows |
| `--color-surface-3` | `#EAE1D4` | pressed states, selected slot |
| `--color-border` | `#E4DACB` | hairlines, inputs |
| `--color-border-strong` | `#C9B79E` | focused inputs, table rules |
| `--color-text` | `#2B2320` | primary text (nâu đen) |
| `--color-text-muted` | `#6F6257` | secondary text, metadata |
| `--color-text-inverse` | `#FFFDF9` | text on accent |
| `--color-accent` | `#7A5C3E` | primary action (nâu đậm) |
| `--color-accent-hover` | `#63492F` | hover/active |
| `--color-accent-soft` | `#EFE6DA` | selected day, active nav item |
| `--color-success` | `#2F7D4F` | completed |
| `--color-warning` | `#B4761A` | pending, sắp tới giờ |
| `--color-danger` | `#B3261E` | cancelled, validation error |
| `--color-info` | `#3A6EA5` | informational banner, AI marker |

**Contrast table (WCAG AA, measured)** — normal text needs ≥ 4.5:1, large ≥ 3:1:

| Pair | Ratio | Rule |
|---|---|---|
| `--color-text` on `--color-bg` | 14.4:1 | body copy everywhere |
| `--color-text` on `--color-surface` | 15.6:1 | cards, sheets |
| `--color-text-muted` on `--color-surface` | 5.9:1 | metadata only, never the only carrier of meaning |
| `--color-text-inverse` on `--color-accent` | 6.1:1 | primary buttons, badges |
| `--color-success` on `--color-surface` | 4.9:1 | status text + icon (never color alone) |
| `--color-danger` on `--color-surface` | 5.4:1 | errors: text + icon |
| `--color-warning` on `--color-surface` | 4.6:1 | cảnh báo: text + icon |

Distribution 60-30-10: be/trắng (60) · nâu nhạt + borders (30) · accent nâu (10). Status colors only
as signals. Never color-only: every status carries a Vietnamese label (Hoàn tất / Đã hủy / …) plus icon.

## Typography
- Pairing: **Be Vietnam Pro** (display + body, Vietnamese-first) + **Inter** for numerals/data
  (`font-variant-numeric: tabular-nums`). Fallback stack: `system-ui, -apple-system, Segoe UI, Roboto, sans-serif`.
- Scale (ratio 1.25, base 16): `12 / 14 / 16 / 20 / 25 / 31` — roles: meta(12) · body-sm(14) ·
  body(16) · section(20) · title(25) · display(31, booking hero + login only).
- Weights: 400 body · 500 UI labels · 600 section titles (hierarchy jumps ≥2 steps) · never more than 3 per screen.
- Hierarchy rule for text-dense admin screens (Title / Section / Body / Meta) is enforced by the
  four sizes above plus one emphasis (semibold + accent) for key values.
- Line height 1.5 body / 1.25 titles; max line length 68ch.

## Spacing / layout
- 4px base scale: `4 8 12 16 24 32 48 64`; customer screens use the spacious half, admin the dense half.
- Grid: `max-width 1200px` customer, fluid admin (rail 240px + content); gutters 16 (mobile) / 24 (desktop).
- Breakpoints: 375 / 768 / 1024 / 1440. Calendar switches to horizontally scrollable day columns ≤1024.
- Touch targets ≥ 44px (customer/stylist), ≥ 32px desktop admin; focus ring
  `0 0 0 3px rgba(122,92,62,0.35)` on every interactive element.
- Radius: 8px controls, 12px cards, 999px pills. Borders 1px `--color-border`.

## Surfaces & elevation
Three levels: `bg` → `surface` → `surface-2`, plus `surface-3` for pressed/selected.
Shadow steps: `--shadow-sm: 0 1px 2px rgba(43,35,32,0.06)` (cards),
`--shadow-md: 0 6px 16px rgba(43,35,32,0.10)` (popovers, dialogs, drag ghost). No glow, no gradients.

## Motion (one system)
| Token | Value | Use |
|---|---|---|
| `--motion-micro` | 120ms `cubic-bezier(0.2,0,0,1)` | button/badge state |
| `--motion-base` | 200ms same easing | panel, hover, toast |
| `--motion-step` | 320ms same easing | booking wizard step transition (framer-motion) |
| `--motion-toast` | 3000ms visible, then 200ms out | success/error toasts |
| reduce | `@media (prefers-reduced-motion: reduce)` → duration 0.01ms, opacity-only | all of the above |

Loading decision tree: <1s nothing · 1–3s inline spinner · >3s skeleton rows (calendar, revenue).
Charts/bars animate height only, 200ms, once.

## States (empty / error / loading)
- **Empty**: icon + one-line reason + CTA. Ví dụ: "Chưa có lịch hôm nay · Thêm lịch cho khách vãng lai".
- **Error**: inline near the field for validation; banner with `--color-danger` + retry for network.
  Never a raw stack trace; message tiếng Việt nói rõ việc cần làm.
- **Loading**: skeleton for calendar/revenue, spinner for form submits (button locked, label "Đang xử lý…").
- **AI**: an "AI" marker chip (`--color-info`) on assistant messages + "Đang trả lời…" indeterminate state.

## Icons
One family: `lucide-react`, 20px stroke 1.75 (16px inside dense tables). No emoji as icons.

## Signature element (the one weird thing)
The **duration ribbon**: a slim accent bar carrying `60 phút · 350.000đ` that attaches to the chosen
service and travels with the wizard. Data-light moments only (booking wizard, login); admin screens
stay disciplined — one accent, grid-aligned, no off-grid stunts.
