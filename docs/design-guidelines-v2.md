# Design Guidelines V2 — Linear-inspired (zinc + electric blue)

*Phiên bản:* 2.0 · *Ngày:* 2026-04-17
*Nguồn đầy đủ:* [`plans/redesign-v2/260417-v2-design-spec.md`](../plans/redesign-v2/260417-v2-design-spec.md)

## 1. Triết lý thiết kế

**Linear-inspired — clean, low-contrast, mono-sharp, modern SaaS dev-tool.**

- Density `D3 hybrid` — list row 36px, form padding 20px, dashboard card 16px
- Font scale **nhỏ hơn V1**: body 13px, KPI value 22-24px, H1 page 20px
- Palette **zinc neutral + electric blue accent**, bỏ slate+safety-orange làm primary
- Safety-orange `#F97316` **chỉ** dùng cho shortage/critical semantic
- Dark mode: reserve CSS var, không cook toggle V2.0

## 2. Palette

### 2.1 Zinc (neutral — replace slate V1)

| Token | Hex | Usage |
|---|---|---|
| `zinc-50` | `#FAFAFA` | Page background |
| `zinc-100` | `#F4F4F5` | Row hover, skeleton base |
| `zinc-200` | `#E4E4E7` | Border subtle (card, input, divider) |
| `zinc-300` | `#D4D4D8` | Border strong, button outline |
| `zinc-400` | `#A1A1AA` | Icon muted, placeholder |
| `zinc-500` | `#71717A` | Meta text, helper, timestamp |
| `zinc-600` | `#52525B` | Secondary body text |
| `zinc-700` | `#3F3F46` | Tertiary heading, label alt |
| `zinc-900` | `#18181B` | **Primary text**, H1-H3 |
| `zinc-950` | `#09090B` | BulkActionBar, CommandPalette bg |

### 2.2 Blue (primary accent — electric)

| Token | Hex | Usage |
|---|---|---|
| `blue-50` | `#EFF6FF` | Row selected bg, info-soft |
| `blue-500` | `#3B82F6` | **Primary CTA default**, link, focus outline |
| `blue-600` | `#2563EB` | Button primary hover |
| `blue-700` | `#1D4ED8` | Button primary press, selected text |

Contrast `blue-500` trên `zinc-50` = 4.52:1 (AA), `blue-600` = 5.17:1, `blue-700` = 7.01:1 (AAA).

### 2.3 Semantic

| Semantic | Bg-soft | Icon | Text strong |
|---|---|---|---|
| Success (emerald) | `#ECFDF5` | `#10B981` | `#047857` |
| Warning (amber)   | `#FFFBEB` | `#F59E0B` | `#B45309` |
| Danger (red)      | `#FEF2F2` | `#EF4444` | `#B91C1C` |
| Info (sky)        | `#F0F9FF` | `#0EA5E9` | `#0369A1` |
| Shortage (orange) | `#FFF7ED` | `#F97316` | `#C2410C` |

### 2.4 Safety-orange rule (strict)

Safety-orange `orange-500` `#F97316` **chỉ** dùng cho:
- Badge "Thiếu hàng" / shortage semantic
- OrdersReadinessTable shortage row highlight
- PWA ReceivingConsole current-item card border-left
- Critical stock banner top dashboard

**Không dùng cho:** button primary, link, hover, focus ring, CTA generic, KPI value (trừ critical stock count), loading state, tab active.

## 3. Typography

Font family: **Inter** duy nhất với features `cv11`, `ss01`, `cv02`. Bỏ Be Vietnam Pro. Mono: **JetBrains Mono** cho SKU/batch/timestamp.

### 3.1 Scale V2 (nhỏ hơn V1)

| Token | Px | Line-h | Weight default | Usage |
|---|---|---|---|---|
| `text-xs` | 11 | 14 | 500 | Label uppercase, badge, kbd |
| `text-sm` | 12 | 16 | 400 | Small meta, helper, timestamp |
| `text-base` | 13 | 18 | 400 | **Body default**, input, table cell |
| `text-md` | 14 | 20 | 500 | Button label emphasis, PWA input |
| `text-lg` | 15 | 20 | 600 | H3 section, card title, dialog title |
| `text-xl` | 17 | 24 | 600 | H2 page section |
| `text-2xl` | 20 | 28 | 600 | **H1 page title** |
| `text-3xl` | 24 | 32 | 500 | KPI value large |
| `text-4xl` | 28 | 32 | 500 | Login hero mega |
| `text-5xl` | 40 | 44 | 500 | TV dashboard mode |

### 3.2 Weight

- `font-normal` 400 — body
- `font-medium` 500 — button, label, active nav, KPI value
- `font-semibold` 600 — heading H1-H3, card title
- `font-bold` 700 — **RARE**, không dùng cho H1 app

## 4. Spacing

| Token | Px | Usage |
|---|---|---|
| `1` | 4 | Icon-text inline gap |
| `2` | 8 | Button icon gap, badge padding |
| `3` | 12 | Input padding-x, row padding |
| `4` | 16 | Card padding, section gap |
| `5` | 20 | Form section padding, dialog body |
| `6` | 24 | Page padding-x desktop |
| `8` | 32 | Page padding-y desktop |
| `12` | 48 | Empty state vertical padding |
| `16` | 64 | Hero top-bottom login |

Giữ `7=28px` (sidebar nav), `9=36px` (form input), `11=44px` (PWA touch), `14=56px` (mobile topbar), `60=240px` (sidebar drawer).

## 5. Border radius

| Token | Px | Usage |
|---|---|---|
| `rounded-sm` | 4 | Badge, chip, kbd, tag |
| `rounded-md` | 6 | Button, input, select, card, popover, dropdown |
| `rounded-lg` | 8 | Dialog, sheet, command palette |
| `rounded-full` | 9999 | Avatar, status dot |

## 6. Shadow

Ít shadow hơn V1 — chủ yếu border zinc-200.

| Token | Usage |
|---|---|
| `shadow-xs` | Card interactive hover |
| `shadow-sm` | Popover, dropdown, tooltip |
| `shadow-md` | Command palette, combobox |
| `shadow-lg` | Dialog, sheet, modal full |
| `shadow-toast` | Sonner toast |

## 7. Motion

### 7.1 Duration

- `duration-100` (100ms) — hover bg, button press, row hover
- `duration-150` (150ms) — fade in/out, focus glow
- `duration-200` (200ms) — sheet slide, dialog open
- `duration-300` (300ms) — command palette open
- `duration-1200` (1200ms) — skeleton shimmer loop

### 7.2 Easing

- `ease-out-quart` `cubic-bezier(0.25, 1, 0.5, 1)` — **default cho sheet/dialog/popover** (Linear signature)
- `ease-out` `cubic-bezier(0.16, 1, 0.3, 1)` — fade out
- `ease-in-soft` `cubic-bezier(0.4, 0, 1, 1)` — exit

### 7.3 Keyframes

- `fade-in` / `fade-out` 150ms
- `slide-in-right` / `slide-out-right` 200ms (sheet)
- `dialog-in` / `dialog-out` 200/150ms (scale + fade)
- `shimmer-sm` 1200ms linear loop
- `scan-flash-success` / `scan-flash-danger` 400ms (giảm từ V1 600ms)
- `scan-shake-sm` 300ms ±4px (giảm từ V1 240ms ±6px)
- `toast-slide-up` 200ms

## 8. Focus ring

V2 dùng CSS `outline` thuần thay box-shadow V1 (không stack với border input).

- Default: `outline: 2px solid #3B82F6; outline-offset: 2px`
- PWA route: `outline: 3px solid #2563EB; outline-offset: 2px`
- Inverted (trên zinc-950): `outline: 2px solid #FFFFFF`

Trigger chỉ trên `:focus-visible` (keyboard), không `:focus` mouse.

## 9. Layout geometry

- `--sidebar-width: 220px` (V1 là 240px)
- `--topbar-height: 44px` desktop (V1 là 56px), mobile 56px
- `--content-max-width: 1440px`
- `--page-padding-x: 24px` desktop, 16px mobile
- `--page-padding-y: 20px`

## 10. Component sizing cheat-sheet

| Component | Size |
|---|---|
| Button `xs` / `sm` / `default` / `lg` | h-6 / h-7 / h-8 / h-11 |
| Input `sm` / `default` / `lg` (PWA) | h-8 / h-9 / h-11 |
| Checkbox | 14px (h-3.5) |
| Dropdown/Select item | h-8 text-base |
| Tabs list | h-9, trigger h-8 |
| Dialog padding | 20px |
| Sheet width md | 420px (V1 480px) |
| Popover padding | 8-12px |
| Tooltip | text-sm 12px, bg zinc-900 |
| Table row | h-9 (36px) |
| List row PWA | h-14 (56px) |

## 11. Quy tắc audit pre-merge

- Grep safety-orange: `rg 'orange-(500|600|700)|text-orange|bg-orange' apps/web/src` — mỗi match phải justify shortage semantic.
- Grep slate legacy: `rg 'slate-\d+' apps/web/src` — V2 chỉ còn back-compat tokens, không import mới.
- Grep font-bold heading: `rg 'font-bold' apps/web/src/app` — chỉ cho phép trong landing hero copy, không cho H1 app.
- Grep focus-visible: `rg 'focus-visible:shadow-focus' apps/web/src` — V2 phải migrate sang CSS outline (`:focus-visible` native).
