# Brainstorm V2 — Redesign toàn bộ UI/UX (Linear-inspired, zinc + electric blue)

*Phiên bản:* 2.0-brainstorm · *Ngày:* 2026-04-17 · *Persona:* solution-brainstormer (brutal honesty)
*Tác giả:* Claude (Opus 4.7, 1M context) — theo yêu cầu user sau khi judge V1 Direction B "quá xấu, font to quá đà"
*Input:* V1 Direction B LIVE (`redesign/direction-b` HEAD, 30 commit, 8 màn + 18 components, dashboard 500 bug nhưng UI render)
*Output mục tiêu:* File brainstorm duy nhất, làm input cho planner V2 cook nhánh mới `redesign/direction-b-v2` build local Windows → review browser → duyệt → deploy VPS MỚI.

**Ràng buộc chốt cứng (user đã duyệt):**
- Style: **Linear-inspired** (clean, low-contrast, mono-sharp, modern SaaS dev-tool)
- Palette: **P2 — zinc + electric blue** (zinc-950 primary, blue-500 accent, safety-orange chỉ còn semantic shortage/alert)
- Density: **D3 hybrid** (list row 36px, form/detail padding 20px)
- Font scale: **nhỏ hơn V1** (body 13px, KPI 22px, H1 20px)
- Dark mode: reserve CSS var, **KHÔNG** toggle UI V2.0
- Reuse 100% logic V1 (state machine, URL state, hooks, repos API) — chỉ redesign visual layer

**Tone:** brutal honesty, không lặp plan cũ. Mỗi value cụ thể px/hex/ms. Không "vừa phải" / "đẹp hơn".

---

## §1. Audit brutal V1 — 20 điểm cụ thể xấu

Đối chiếu Linear.app (home, issues list, project view, settings) với V1 hiện tại (screenshots render được các màn /login, /, /items, /suppliers, /items/import, /pwa/receive).

### 1.1. Body font 14-16px quá to — Linear dùng 13px

**Where:** `globals.css` html selector + `tailwind.config.ts` fontSize.base=14px; nhiều `text-base` trong form label, body paragraph, card content. Một số block (Dashboard headline, Login hero copy) dùng text-lg=16px, text-xl=20px cho content body.
**Why xấu:** Linear body = 13px (0.8125rem) với line-height 1.4; Notion/GitHub cũng 13-14px. V1 14-16px tạo cảm giác "ERP quê" giống SAP/Odoo/Oracle form enterprise cổ. Ở 1440px desktop, 14px body + line-height 22px ăn hết vertical space → phải scroll nhiều cho list dense 30 items.
**Fix V2:** body = 13px line-height 18-20px. Form label giữ 13px nhưng weight 500 (thay cho 14px weight 600). Text-sm legacy=13px thành default; xóa text-base 14px; text-lg 15px thay vì 16px (dùng cho H3 section header).

### 1.2. H1 Dashboard 24px/H2 section 20px quá to

**Where:** `(app)/page.tsx` Dashboard dùng `text-2xl` = 24px cho page title "Tổng quan vận hành"; section headers dùng `text-xl` = 20px.
**Why xấu:** Linear issue detail H1 = 20px weight 600; section header H2 = 15px weight 600 tracking-tight. Ở 1280px desktop, 24px title kéo page header dày 80-96px, chiếm 8% viewport height. V1 còn stack title + breadcrumb + action buttons → top chunk 128px, data thật chỉ còn 600-700px.
**Fix V2:** H1 page title = 20px weight 600 line-height 28px. H2 section = 15px weight 600 line-height 20px. H3 subsection = 13px weight 600 uppercase tracking-wide. Bỏ `font-heading` (Be Vietnam Pro) khỏi heading — dùng Inter weight 600 thuần.

### 1.3. KPI value 36px font-bold — quá visualization, thiếu data density

**Where:** `KpiCard.tsx` line 103: `text-4xl font-bold` = 36px. Card min-height 112px (`min-h-28`).
**Why xấu:** Linear insights / Cycle view metric cards: value 22-28px weight 500 (KHÔNG bold), label 12px weight 500 muted. Card height 64-72px. 36px bold giống Google Analytics hero — không phù hợp ERP data-dense nơi planner muốn nhìn 8-12 KPI cùng lúc không cuộn. V1 border-l 4px theo status còn gắt nữa, tạo "traffic light wall" visually noisy.
**Fix V2:** KPI value = 22px weight 500 (medium, KHÔNG bold) tabular-nums. Card min-height 72px, padding 16px. **Bỏ border-l 4px** theo status — thay bằng text-color status (value dùng `text-red-600` khi danger, `text-zinc-900` default). Label 11px uppercase tracking-wide text-zinc-500.

### 1.4. Card padding p-6 = 24px quá thoáng

**Where:** Hầu hết card V1 dùng `p-6` hoặc `p-5` = 24-20px. `OrdersReadinessTable.tsx`, `AlertsList.tsx`, Dashboard section blocks.
**Why xấu:** Linear card/panel padding = 16px (p-4). Với 24px padding x 4 side, một card chứa 5 rows text-sm chiếm 200px; với 16px padding chiếm 168px — tiết kiệm 16% mà vẫn breathing. 24px đúng cho landing page marketing, sai cho dashboard internal tool.
**Fix V2:** Card padding = 16px (p-4) cho list/dashboard card. Form section padding = 20px (p-5) giữ spacious cho input breathing. Dialog/Sheet body = 20px. Xóa dùng p-6 trong /app context.

### 1.5. Section gap-6 = 24px xa nhau

**Where:** Dashboard page `<div className="space-y-6">`, `items/page.tsx` `gap-6`. Filter bar xuống KPI row xuống table cách nhau 24px × 2.
**Why xấu:** Linear dashboard: section gap = 16-20px. Gap 24px + page padding 24px = 48px dead space chỉ trong nửa trên page. Dày quá → user phải scroll sớm, mất "tại-một-cái-nhìn" nature của dashboard.
**Fix V2:** Section vertical gap = 16px (space-y-4). Page content padding = 20px top/bottom, 24px sides desktop. Subsection gap = 12px.

### 1.6. Border radius mix rounded-sm/md/lg lộn xộn

**Where:** Button `rounded` = 6px (DEFAULT), Card `rounded-md` = 8px, Dialog `rounded-md` = 8px, Badge `rounded-sm` = 4px, Input `rounded` = 6px, Sheet `rounded-none` (mặc định shadcn). Mấy chỗ domain component hardcode `rounded-lg` = 12px.
**Why xấu:** Linear mọi thứ gần như cùng radius 6px (button/input/card/dialog), badge/chip 4px. V1 mix 4-6-8-12px khiến hình học UI "jittery" — hai card cạnh nhau khác radius, khó gom visual.
**Fix V2:** 3 radius thôi. `--radius-sm=4px` (badge/chip/tag), `--radius-md=6px` (button/input/card/popover/dropdown), `--radius-lg=8px` (dialog/sheet/command-palette). **Bỏ** `rounded-lg` 12px khỏi Tailwind config (nếu ai dùng nhẹ nhàng remap).

### 1.7. Shadow-sm quá mỏng + shadow-dialog quá nặng

**Where:** Card `shadow-sm` = `0 1px 3px rgba(15,23,42,0.06)`; Dialog `shadow-dialog` = `0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.08)`.
**Why xấu:** Linear card: **no shadow**, chỉ `border: 1px solid rgba(0,0,0,0.08)` (zinc-200). Dialog: `shadow: 0 16px 32px rgba(0,0,0,0.12)` — shadow mềm, không double-drop. V1 shadow-sm quá subtle trên bg-white → card lookss floating but flat; shadow-dialog double-drop retro-2020 Material style.
**Fix V2:** Card: **shadow none + border zinc-200** (1px). Popover/dropdown: `shadow: 0 4px 12px rgba(0,0,0,0.06)` + border zinc-200. Dialog/Sheet: `shadow: 0 16px 48px rgba(0,0,0,0.12)` single-layer. Toast: `shadow: 0 8px 24px rgba(0,0,0,0.10)`.

### 1.8. Color slate-900 #0F172A quá đen + hơi xanh

**Where:** `brand.ink` = #0F172A, H1/H2/body text, topbar background khi inverted, login hero.
**Why xấu:** Linear primary text = `#111827` (zinc-900) hoặc `#09090B` (zinc-950) — gần pure neutral. Slate-900 #0F172A có ám xanh (R=15, G=23, B=42) — lạc lõng khi accent cũng màu xanh blue, tạo "double blue" tone confusion. Linear text đen neutral để accent electric blue pop ra.
**Fix V2:** Text primary = `#09090B` (zinc-950) hoặc `#18181B` (zinc-900). Border = `#E4E4E7` (zinc-200). Muted = `#71717A` (zinc-500). Page background = `#FAFAFA` (zinc-50). Card background = `#FFFFFF`. Xóa slate-* khỏi dùng app, chỉ giữ alias nếu cần migration an toàn.

### 1.9. Safety-orange #EA580C làm CTA chính — quá bão hòa, "cảnh báo" semantic

**Where:** Button variant default `bg-cta` = #EA580C, Dashboard primary action "Tạo đơn mới", Login "Đăng nhập", ItemForm save.
**Why xấu:** Orange #EA580C là màu cảnh báo/construction — não con người scan là "stop and look". Dùng cho CTA chung (Save, Create, Submit) → user lúc nào cũng thấy "warning" → fatigue + giảm giá trị tín hiệu khi cần báo shortage thật. Linear CTA = electric blue #5E6AD2 (custom) hoặc #3B82F6 (blue-500 Tailwind) — "go", "action", "link". Safety orange phải reserve cho "alert/stop/danger".
**Fix V2:** **Primary CTA** = blue-500 #3B82F6 (hover blue-600 #2563EB, press blue-700 #1D4ED8). **Safety-orange #F97316** CHỈ giữ cho: badge shortage, alert row highlight trong OrdersReadinessTable, scan current-row border PWA picklist. Đổi hex từ #EA580C → #F97316 (orange-500 Tailwind) vì bright hơn, đọc tốt hơn trên light bg khi chỉ còn 3-5% diện tích UI.

### 1.10. Button height h-10 (40px) quá cao + padding dày

**Where:** `button.tsx` size default `h-10 px-4 text-base` = 40px height, padding-x 16px, font 14px.
**Why xấu:** Linear primary button = 28px height (h-7) padding-x 12px font 13px weight 500. Secondary/ghost 24px (h-6) padding-x 8px. 40px buttons như V1 tạo cảm giác "mobile-first thô" — trên desktop với mouse precise, 28-32px là đủ. Button 40px chiếm nhiều header space.
**Fix V2:** Button sizes:
- `xs`: h-6 (24px) px-2 text-xs (12px) — inline chip button
- `sm`: h-7 (28px) px-2.5 text-sm (13px) — list row action, toolbar
- `default`: h-8 (32px) px-3 text-sm (13px) — form button, primary CTA desktop
- `lg`: h-11 (44px) px-4 text-sm (13px) — PWA touch target (chỉ dùng trong `/pwa/*` route)
- `icon`: h-8 w-8 — icon-only button (hoặc h-7 w-7 compact)

### 1.11. Input height 40px — list filter bar cồng kềnh

**Where:** `input.tsx` `h-10` default, ItemListTable search bar, FilterBar SelectTrigger, ImportWizard upload dropzone.
**Why xấu:** Linear filter bar input/select = 28px height. Form field input = 32-36px. V1 filter bar 40px cao hơn button cùng height → row mismatched. Search field "Tìm kiếm SKU/name" chiếm 40px cao × 320px rộng ở page /items trông giống search engine landing.
**Fix V2:**
- List filter input: h-8 (32px) text-sm px-2.5
- Form input: h-9 (36px) text-sm px-3 (density D3 spacious cho form)
- PWA scan input: h-11 (44px) text-base — override cho touch
- Search với icon-left: h-8, icon 14px, padding-left 28px

### 1.12. Checkbox 20px Radix default — square + tick mỏng

**Where:** `checkbox.tsx` dùng Radix default `h-5 w-5` = 20px; tick SVG stroke 2, size 14px.
**Why xấu:** Linear checkbox = 14-16px box, tick SVG stroke 2.5, màu blue-500 khi checked. 20px V1 trong ItemListTable row 48px chiếm visual weight quá lớn khi user chọn 50 rows bulk. Select-all checkbox top row gần như cùng size với row icon — nhiễu.
**Fix V2:** Checkbox = 16px box (h-4 w-4), border zinc-300 1.5px, checked bg-blue-500 border-blue-500 + tick stroke 2.5. Focus ring blue-500 2px offset 1px. Indeterminate state: dash 2px wide centered.

### 1.13. Sidebar 240px expanded / 56px collapsed — collapse animation lãng phí

**Where:** `Sidebar.tsx` `w-60` (240px) / `w-14` (56px), transition width 320ms ease-industrial.
**Why xấu:** Linear sidebar = 220px fixed (có thể toggle 100% off nhưng không mini-rail 56px). Collapse-to-rail 56px phù hợp tablet landscape, nhưng trên desktop 1440px+ (nhóm người dùng thật: planner văn phòng), expanded 240px là quá dày so với content area 1200px. Rail mode 56px không mang nhiều giá trị (user chuyển tab rất ít, nav items chỉ 6-8 mục).
**Fix V2:** Sidebar = **220px fixed** (desktop). Mobile/tablet: drawer slide từ trái overlay. Bỏ rail-collapsed 56px (YAGNI — user test V1 chưa ai xài). Width biến thành `--sidebar-width: 220px`. Nav item padding-y 6px, height 28px mỗi row, icon 16px (thay vì 20px V1).

### 1.14. TopBar 56px height + quá nhiều element

**Where:** `TopBar.tsx` `h-14` = 56px, chứa: breadcrumb + search box + notif bell + user avatar + help button.
**Why xấu:** Linear topbar = 40-48px (h-10 đến h-12), thường chỉ chứa breadcrumb left + user avatar right. Search chuyển thành CommandPalette Cmd+K (không hiển thị thường trực). 56px topbar + sidebar header 56px = 112px top-dead-zone khi sidebar có header riêng.
**Fix V2:** TopBar = 44px (h-11). Chứa: breadcrumb left + Cmd+K hint (right-side, text "Tìm nhanh · ⌘K" muted) + notif bell + avatar. Bỏ search box inline (dùng CommandPalette). Bỏ help button (chuyển vào user menu dropdown).

### 1.15. Typography mix 2 fonts Be Vietnam Pro + Inter — Vietnamese diacritics OK nhưng visually inconsistent

**Where:** `globals.css` h1-h6 `font-family: "Be Vietnam Pro"`, body Inter. Mỗi heading switch font tạo vertical rhythm jitter.
**Why xấu:** Be Vietnam Pro x-height và letter-spacing khác Inter rõ rệt — "Đơn hàng" render dưới Be Vietnam Pro rộng hơn dưới Inter 4-6%. Khi section header + body cạnh nhau, 2 font clash. Linear dùng 1 font (Inter custom features hoặc Geist) xuyên suốt. Inter subset `vietnamese` render dấu tiếng Việt tốt, ko cần Be Vietnam Pro.
**Fix V2:** **1 font duy nhất — Inter** với font-feature-settings: `"cv11" 1` (alternates straight i/l) + `"ss01" 1` (stylistic set open digits) + `"cv02" 1`. Load qua `next/font/google` subset `['vietnamese','latin']`. Heading = Inter weight 600 tracking-tight. Body = Inter weight 400. Label = Inter weight 500 uppercase tracking-wide letter-spacing 0.02em. Mono cho SKU/số lô = JetBrains Mono 12px tabular-nums.

### 1.16. Table row 48px + zebra stripe #F1F5F9

**Where:** `OrdersReadinessTable.tsx` row h-12 = 48px, mỗi dòng chẵn `bg-zebra` = #F1F5F9. ItemListTable row height 48px desktop.
**Why xấu:** Linear issues list row = 36-40px, **no zebra stripe**. Zebra là convention ERP/Excel cũ từ thập niên 90, thiết kế hiện đại chỉ dùng border-bottom zinc-100 mảnh 1px tách row. 48px row với zebra làm table look like QuickBooks 2005. Với 10k items, user scan vertical bởi data column chính (SKU mã), không cần zebra.
**Fix V2:** List table row = 36px (h-9) density D3 compact. **Bỏ zebra stripe hoàn toàn.** Thay bằng border-bottom `border-b border-zinc-100` (1px mảnh). Row hover = `bg-zinc-50`. Row selected = `bg-blue-50` + left-border 2px blue-500. Font row = 13px. Sticky header row = 36px bg-white border-b zinc-200.

### 1.17. Empty state illustration 120-144px quá lớn

**Where:** `empty-state.tsx` + `illustrations/` folder (18 files SVG V1), Dashboard empty "Chưa có đơn hàng", Items empty "Chưa có item".
**Why xấu:** Linear empty state = icon 32-40px (Lucide stroke 1.5) hoặc 48px illustration outline-only. V1 illustration 120px bên trên message + CTA chiếm 240-320px vertical → empty state feel như "landing page" chứ không phải "tạm thời trống".
**Fix V2:** Empty state:
- Icon single Lucide 32px stroke 1.5 color zinc-400 (không illustration SVG custom)
- Title 14px weight 500 text-zinc-900
- Description 12px text-zinc-500 max-width 320px center
- CTA button size sm (h-7) ghost variant
- Total block height 120-160px (so với V1 320px)
- **Bỏ** folder `illustrations/` V1 (18 file SVG không dùng nữa — xóa sạch commit V2)

### 1.18. Motion thiếu hover lift + press scale + no transition on border

**Where:** Hầu như card V1 chỉ có `transition-colors duration-fast` — không có scale, không có translate-y. Button press = change bg color duy nhất.
**Why xấu:** Linear micro: row hover lift 0px (không dịch), chỉ bg-zinc-50; button hover = bg darker; button press = scale-[0.98] + bg-darker (cảm giác tactile). Dialog/sheet open = fade + translate-y 4px + scale 0.96→1. V1 thiếu press feedback → button bấm như dead. Thiếu transition border-color khi focus input → "pop" không smooth.
**Fix V2:**
- Hover row: `transition-colors duration-100 hover:bg-zinc-50`
- Button press: `active:scale-[0.98] transition-transform duration-100`
- Card interactive (link card): hover `border-zinc-300 shadow-[0_1px_2px_rgba(0,0,0,0.05)]` transition-all 150ms
- Input focus: `transition-[border-color,box-shadow] duration-150` border-blue-500 + ring-2 blue-500/30
- Dialog: fade 150ms + scale 96→100 200ms ease-out-quart
- Sheet: translate-x 100%→0 200ms ease-out-quart

### 1.19. Focus ring 3px rgba(3,105,161,0.35) — info xanh nhưng quá nhạt

**Where:** `globals.css` `--ring-focus: 0 0 0 3px rgba(3, 105, 161, 0.35)`.
**Why xấu:** Linear focus ring = `2px solid #3B82F6` với `outline-offset: 2px` — sharp, contrast AAA (4.5:1+ vs bg). 35% opacity ring V1 nhạt dưới ánh sáng xưởng (600-900 lux), khó nhìn outline khi ring lẫn vào border. 3px ring hơi dày cho desktop (tốt cho PWA nhưng cả app dùng chung là overkill).
**Fix V2:** Default focus ring: `outline: 2px solid #3B82F6; outline-offset: 2px;` (CSS outline, không box-shadow fake). Đổi từ box-shadow→outline để stack đúng với border input. PWA override: `outline: 3px solid #2563EB; outline-offset: 2px` cho outdoor. Bỏ `:focus` dùng `:focus-visible` only để mouse click không có ring phiền.

### 1.20. Dashboard "KPI border-l 4px + value 36px" — nhìn tưởng alarm panel nhà máy

**Where:** `KpiCard.tsx` line 128 `border-l-4` + status color (`border-l-success`, `border-l-danger`), value text-4xl font-bold.
**Why xấu:** Border-l 4px vertical stripe bên trái card là pattern Bootstrap 4 alert (2017). Linear metric card không dùng. 4 KPI xếp hàng với 4 stripe đỏ/cam/xanh/vàng trông như dashboard SCADA điện lực — mất tính "tool thân thiện". Value 36px bold làm KPI dominant, label nhỏ lại bị lép.
**Fix V2:** Bỏ border-l 4px hoàn toàn. Card equal border 1px zinc-200 all sides. Status signal qua **text-color của value** (hiếm dùng, chỉ khi critical): `text-red-600` nếu shortage > threshold. Default value = `text-zinc-900` font-medium 22px tabular-nums. Label 11px uppercase tracking-wide zinc-500. Delta arrow 10px kế value 12px font-mono. Icon top-right 16px zinc-400.

---

## §2. Direction V2 — Linear design system

### 2.1 Palette zinc + electric blue

**Neutral (zinc scale Tailwind):**

| Token | Hex | Dùng cho |
|---|---|---|
| `bg-page` | `#FAFAFA` (zinc-50) | Page background app |
| `bg-card` | `#FFFFFF` | Card, dialog, sheet, popover panel |
| `bg-muted` | `#F4F4F5` (zinc-100) | Zebra-replacement subtle, skeleton base, inactive tab bg |
| `bg-hover` | `#F4F4F5` (zinc-100) | Row hover, button ghost hover |
| `border-subtle` | `#E4E4E7` (zinc-200) | Card border, input border, divider |
| `border-strong` | `#D4D4D8` (zinc-300) | Input focus (secondary), button outline |
| `text-primary` | `#18181B` (zinc-900) | Body, H1-H3, button primary label |
| `text-secondary` | `#3F3F46` (zinc-700) | Secondary body, label form |
| `text-muted` | `#71717A` (zinc-500) | Meta, timestamp, helper text |
| `text-placeholder` | `#A1A1AA` (zinc-400) | Input placeholder, empty state desc |
| `text-inverse` | `#FAFAFA` (zinc-50) | Text trên bg-dark (TV mode dark badge, primary button) |

Contrast check: zinc-900 trên zinc-50 = **18.37:1** (AAA xa). zinc-500 trên zinc-50 = **4.71:1** (AA body, AAA large). zinc-400 trên zinc-50 = **3.12:1** (dưới AA — chỉ dùng cho non-interactive placeholder, không cho text quan trọng).

**Accent Electric Blue (blue scale Tailwind):**

| Token | Hex | Dùng cho |
|---|---|---|
| `accent-default` | `#3B82F6` (blue-500) | CTA primary, link, selected row left-border, checkbox checked |
| `accent-hover` | `#2563EB` (blue-600) | Button hover |
| `accent-press` | `#1D4ED8` (blue-700) | Button active/press |
| `accent-soft` | `#EFF6FF` (blue-50) | Selected row bg, info soft bg, link hover subtle |
| `accent-ring` | `rgba(59, 130, 246, 0.35)` | Focus ring semi-transparent |
| `accent-border` | `#93C5FD` (blue-300) | Selected card border |

Contrast blue-500 trên bg-card white = **4.52:1** (AA pass body/link).

**Status (semantic, giữ từ Tailwind core):**

| Token | Hex | Dùng cho |
|---|---|---|
| `success-default` | `#10B981` (emerald-500) | PASS QC, Ready 100%, success toast |
| `success-soft` | `#ECFDF5` (emerald-50) | Success row bg, success badge bg |
| `success-strong` | `#047857` (emerald-700) | Success text trên light bg (AAA) |
| `warning-default` | `#F59E0B` (amber-500) | Partial ready, PO ETA gần |
| `warning-soft` | `#FFFBEB` (amber-50) | Warning row bg |
| `warning-strong` | `#B45309` (amber-700) | Warning text (AAA) |
| `danger-default` | `#EF4444` (red-500) | FAIL QC, error toast, destructive button |
| `danger-soft` | `#FEF2F2` (red-50) | Error input border bg subtle |
| `danger-strong` | `#B91C1C` (red-700) | Danger text (AAA) |
| `info-default` | `#0EA5E9` (sky-500) | Info badge, help tag |
| `info-soft` | `#F0F9FF` (sky-50) | Info toast bg |
| `info-strong` | `#0369A1` (sky-700) | Info text (AAA) |

**Safety Orange — RESERVE SEMANTIC ONLY:**

| Token | Hex | Dùng cho |
|---|---|---|
| `shortage-default` | `#F97316` (orange-500) | Badge "Shortage", alert row PWA picklist current-item border-l, critical stock banner |
| `shortage-soft` | `#FFF7ED` (orange-50) | Shortage row bg |
| `shortage-strong` | `#C2410C` (orange-700) | Shortage text AAA |

Không dùng orange cho button/CTA/link — chỉ shortage/critical alert semantic.

**Dark mode reserve (CSS var chỉ, KHÔNG cook toggle V2.0):**

```css
/* globals.css — @layer base, data-theme="dark" reserve token */
[data-theme="dark"] {
  --bg-page: #09090B;         /* zinc-950 */
  --bg-card: #18181B;         /* zinc-900 */
  --bg-muted: #27272A;        /* zinc-800 */
  --border-subtle: #27272A;   /* zinc-800 */
  --text-primary: #FAFAFA;    /* zinc-50 */
  --text-muted: #A1A1AA;      /* zinc-400 */
  --accent-default: #60A5FA;  /* blue-400 bright hơn trên dark */
}
```
Không import vào layout, không toggle. Để sẵn V2.1+ kích hoạt.

### 2.2 Typography scale V2

| Token | CSS | Px | Line-height | Weight | Dùng cho |
|---|---|---|---|---|---|
| `text-[11px]` | 0.6875rem | 11 | 14 | 500 | Label uppercase, tag, kbd key |
| `text-xs` | 0.75rem | 12 | 16 | 400-500 | Meta, timestamp, helper, table meta |
| `text-sm` | 0.8125rem | 13 | 18-20 | 400-500 | **Body default**, button label, input, table row |
| `text-[15px]` | 0.9375rem | 15 | 20 | 600 | H3 section header, card title |
| `text-lg` | 1.125rem | 18 | 24 | 600 | H2 page section |
| `text-xl` | 1.25rem | 20 | 28 | 600 | **H1 page title** |
| `text-2xl` | 1.375rem | 22 | 28 | 500 | KPI value |
| `text-3xl` | 1.75rem | 28 | 32 | 500 | KPI value hero (login, large card) |
| `text-5xl` | 3rem | 48 | 52 | 500 | TV dashboard KPI |

Label uppercase spec: `text-[11px] font-medium uppercase tracking-wide text-zinc-500 letter-spacing: 0.02em`.

Mono: `font-mono text-xs tabular-nums` = JetBrains Mono 12px. Dùng cho: SKU code, batch number, timestamp ISO, count delta, quantity cell in table.

Font family: `Inter` với `font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1` (alternates: straight i/l, open digits 0/6/9, alt a). Load qua `next/font/google` subset `['latin','latin-ext','vietnamese']`. Bỏ `Be Vietnam Pro` khỏi dependency.

### 2.3 Spacing scale V2

Chỉ 9 values, bỏ fractional và odd tokens:

| Token | Px | Rem | Dùng cho |
|---|---|---|---|
| `1` | 4 | 0.25 | Icon-text gap nhỏ, divider inline |
| `2` | 8 | 0.5 | Button icon gap, badge padding |
| `3` | 12 | 0.75 | Input padding-x, button padding-x, row padding |
| `4` | 16 | 1 | Card padding, section gap, form row gap |
| `5` | 20 | 1.25 | Form section padding spacious (D3) |
| `6` | 24 | 1.5 | Page padding-x desktop |
| `8` | 32 | 2 | Page padding-y desktop, section hero gap |
| `12` | 48 | 3 | Empty state vertical padding |
| `16` | 64 | 4 | Hero top-bottom |

Bỏ: 6/14/18/22 spacing V1 custom — vô dụng. Giữ `60` = 240px (sidebar mobile drawer width override).

### 2.4 Border radius consistent

| Token | Px | Dùng cho |
|---|---|---|
| `rounded-sm` | 4 | Badge, chip, kbd |
| `rounded-md` | 6 | Button, input, card, popover, dropdown, tab |
| `rounded-lg` | 8 | Dialog, sheet, command palette, image thumb |
| `rounded-full` | 9999 | Avatar, status dot, toggle thumb |

Mapping cụ thể:
- Button = `rounded-md` (6px) — tất cả variant
- Input/Select/Textarea = `rounded-md` (6px)
- Card = `rounded-md` (6px)
- Dialog/Sheet = `rounded-lg` (8px) — slight softer
- Badge/Tag/Chip = `rounded-sm` (4px)
- Command palette = `rounded-lg` (8px)

### 2.5 Elevation V2

| Token | Value | Dùng cho |
|---|---|---|
| `shadow-none` | `0 0 #0000` | Card default (chỉ border) |
| `shadow-xs` | `0 1px 2px rgba(0,0,0,0.04)` | Card interactive hover |
| `shadow-sm` | `0 2px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)` | Popover, dropdown, tooltip |
| `shadow-md` | `0 4px 12px rgba(0,0,0,0.06)` | Command palette |
| `shadow-lg` | `0 16px 48px rgba(0,0,0,0.12)` | Dialog, sheet |
| `shadow-toast` | `0 8px 24px rgba(0,0,0,0.10)` | Toast |
| `ring-focus` | `outline: 2px solid #3B82F6; outline-offset: 2px` | Focus visible (CSS outline not box-shadow) |

Border + shadow pair:
- Card: `border border-zinc-200 bg-white` (no shadow)
- Card hover: `border-zinc-300 shadow-xs transition-all 150ms`
- Popover: `border border-zinc-200 bg-white shadow-sm rounded-md`
- Dialog: `border border-zinc-200 bg-white shadow-lg rounded-lg`

### 2.6 Motion V2

| Duration | ms | Ease | Dùng cho |
|---|---|---|---|
| `micro` | 100 | ease-out | Hover bg-color, button press scale |
| `fast` | 150 | ease-out-quart | Fade in/out, border-color transition |
| `standard` | 200 | ease-out-quart | Sheet slide, dialog open, popover |
| `large` | 320 | ease-out-quart | Page transition, sidebar toggle (nếu giữ) |

Cubic-bezier values:
- `ease-out`: `cubic-bezier(0.16, 1, 0.3, 1)` — smooth decel
- `ease-out-quart`: `cubic-bezier(0.25, 1, 0.5, 1)` — Linear signature smooth
- `ease-industrial`: giữ alias cho back-compat V1 code path chưa migrate

Hover lift (card interactive):
```css
transition: border-color 150ms, box-shadow 150ms, transform 150ms;
/* hover */
transform: translateY(-1px);
box-shadow: 0 1px 2px rgba(0,0,0,0.05);
border-color: var(--border-strong);
```

Press scale:
```css
transition: transform 100ms ease-out;
/* active */
transform: scale(0.98);
```

Keyframes scan (giữ logic V1 cho PWA nhưng retune):
- `flash-success`: 400ms ease-out (giảm từ 600ms V1), ring 3px emerald-500/30 → 0, bg emerald-50 → transparent
- `flash-danger`: 400ms ease-out, ring 3px red-500/30 → 0, bg red-50 → transparent
- `shake`: 3 × 60ms (tổng 180ms, từ V1 240ms), translate-x ±4px (V1 ±6px)

### 2.7 Density D3 hybrid rules (chốt)

**List pages** (/items, /suppliers, orders list sau này, /items/import list):
- Row height: 36px (h-9)
- Row padding-x: 12px
- Table font: 13px (text-sm)
- Header row: 36px sticky bg-white border-b zinc-200
- Filter bar: h-8 input/select (32px), gap-2
- Toolbar: h-9 container (36px), button h-7 sm size

**Form / detail pages** (/items/[id]/edit, /items/new, /suppliers/[id], /items/import/[stepId]):
- Section padding: 20px (p-5)
- Input height: 36px (h-9)
- Label font: 13px weight 500 (label uppercase 11px ONLY cho section group title)
- Form gap: vertical 16px (gap-4)
- Card padding: 20px (p-5)

**Dashboard** (/):
- KPI card padding: 16px (p-4), min-height 72px
- Section gap: 16px (space-y-4)
- Subsection heading: 15px weight 600
- Chart container padding: 16px

**Mobile/tablet PWA** (/pwa/receive, /pwa/*):
- Touch target min: 44px (h-11 button, h-11 input, list row h-14 = 56px)
- Font base: 14px (text-base) — nhỉnh hơn desktop 13px
- Padding-x container: 16px
- Override D3 desktop density khi viewport < 1024px

### 2.8 Z-index scale (carry từ V1, thu gọn)

```
base:    0
sticky:  10   (sticky filter, sticky table header)
sidebar: 20   (mobile drawer overlay)
topbar:  30
dropdown:40   (user menu, combobox, select)
cmdk:    50   (command palette)
dialog:  60
popover: 65   (tooltip above dialog edge case)
toast:   70
skip:    80
```

---

## §3. Component redesign delta — 32 components

| Component | Đổi gì cụ thể | Keep/Replace/Tune |
|---|---|---|
| **AppShell** | Grid layout 2-column: sidebar 220px fixed + main 1fr. Topbar 44px sticky top. Mobile: sidebar drawer overlay. Skip-link giữ nguyên. | **Tune** — giảm sidebar width, topbar height |
| **Sidebar** | 220px fixed desktop; bỏ rail-collapsed 56px. Nav item h-7 (28px), padding-x 12px, icon 16px, text 13px weight 500. Active: `bg-blue-50 text-blue-700` + left-border 2px blue-500 (bỏ orange cta). Logo area 48px height (giảm từ 56px). | **Replace** — rewrite cleaner |
| **TopBar** | 44px height. Left: breadcrumb 13px. Right: `⌘K` hint text + notif bell (16px icon) + avatar 28px. Bỏ search input inline, bỏ help button. | **Replace** |
| **UserMenu** | Dropdown `shadow-sm border border-zinc-200 rounded-md`, item h-8 (32px) padding-x 10px text-sm. Avatar 24px trong menu header. | **Tune** |
| **Breadcrumb** | Font 13px zinc-500, separator `/` zinc-300. Last item zinc-900. | **Tune** — giảm font từ 14 → 13 |
| **CommandPalette** | `rounded-lg shadow-lg`, width 560px. Input h-11 (44px) text-sm border-0 border-b border-zinc-200. Item h-9 (36px) text-sm. Kbd hint 11px bg-zinc-100 rounded-sm. Max 8 results. Fuzzy match giữ V1 logic. | **Tune** |
| **Button** | Variants: default (bg-blue-500 text-white), secondary (bg-zinc-100 text-zinc-900), outline (border-zinc-300), ghost (hover:bg-zinc-100), danger (bg-red-500 text-white), link (text-blue-600 underline-offset-2). Sizes: xs/sm/default/lg/icon (xem §1.10). Press `active:scale-[0.98]`. Remove `font-medium` → add only to primary; secondary/ghost dùng `font-normal`. | **Replace** — full rewrite |
| **Input** | h-9 form (36px), h-8 filter (32px), h-11 PWA. Border zinc-200, focus border-blue-500 + outline 2px blue-500/offset-2. Error: border-red-500 + outline red-500. Padding-x 12px. Radius md (6px). | **Replace** |
| **Label** | 13px weight 500 text-zinc-900, margin-bottom 6px. Uppercase variant: 11px tracking-wide weight 500 zinc-500. Required asterisk text-red-500. | **Tune** |
| **Checkbox** | h-4 w-4 (16px), border-zinc-300 1.5px, checked bg-blue-500 border-blue-500 + tick stroke 2.5 size 12px. Focus outline 2px blue-500/offset 1px. Indeterminate dash 2px center. | **Replace** |
| **Select** | Trigger h-9 (form) / h-8 (filter), chevron 14px icon zinc-500. Dropdown content `shadow-sm border border-zinc-200 rounded-md`, item h-8 padding-x 10px text-sm, selected bg-blue-50 text-blue-700 + check icon 14px right. | **Tune** |
| **Textarea** | Border zinc-200, min-h 72px, padding 12px, text-sm, focus border-blue-500 + outline 2px. Resize vertical. | **Tune** |
| **Dialog** | Overlay rgba(0,0,0,0.5) (darker for mobile visibility). Content max-w-md, rounded-lg, shadow-lg, border zinc-200, padding 20px. Header padding-bottom 16px border-b zinc-100. Footer padding-top 16px border-t zinc-100, button right-aligned gap-2. Animation: fade 150ms + scale 96→100 200ms. | **Replace** |
| **Sheet** | Slide right 200ms ease-out-quart. Width 480px desktop, 100% mobile. Header/body/footer padding 20px. `rounded-l-lg` (8px on left side only). Backdrop rgba(0,0,0,0.4). | **Replace** |
| **Popover** | Width auto, max-w-80, padding 12px, shadow-sm border zinc-200 rounded-md. Arrow bỏ (Linear không dùng arrow, chỉ offset 4px từ trigger). | **Tune** |
| **Dropdown** | Như Select dropdown content. Item h-8 text-sm padding-x 10px. Icon leading 14px zinc-500. Shortcut hint right side 11px zinc-400 font-mono. | **Tune** |
| **Tabs** | Tab h-8 padding-x 12px text-sm font-medium. Active: text-zinc-900 + border-b-2 border-zinc-900 (không dùng blue để giữ neutral, chỉ blue khi tab action/CTA). Inactive: text-zinc-500 hover:text-zinc-700. Remove pill/filled variant V1. | **Replace** |
| **Tooltip (NEW)** | Add mới — Radix Tooltip. Bg zinc-900 text-white text-xs (12px) padding 6px 10px rounded-md shadow-sm. Delay 300ms open, 0ms close. Max-w 240px. Dùng cho icon-only button, truncate cell text. | **NEW** |
| **Skeleton** | Bg zinc-100, shimmer overlay rgba(255,255,255,0.4) 1200ms linear. `rounded-md` by default. Giữ keyframe V1. | **Keep** |
| **Badge** | h-5 (20px) padding-x 8px text-xs (12px) weight 500 rounded-sm. Variants: default (bg-zinc-100 text-zinc-700), success (bg-emerald-50 text-emerald-700), warning (bg-amber-50 text-amber-700), danger (bg-red-50 text-red-700), info (bg-sky-50 text-sky-700), shortage (bg-orange-50 text-orange-700). | **Replace** |
| **KpiCard** | Padding 16px, min-h 72px, border zinc-200 bg-white radius-md. Label top 11px uppercase tracking-wide zinc-500. Value 22px weight 500 tabular-nums text-zinc-900 (hoặc text-red-600 nếu critical). Delta inline 12px font-mono bên phải value. Icon top-right 16px zinc-400. **Bỏ border-l-4.** | **Replace** |
| **OrdersReadinessTable** | Row h-9 (36px), no zebra, border-b zinc-100. Cell font 13px. SKU cell font-mono 12px. Status badge inline. Shortage row: bg-orange-50 + left-border 2px orange-500 (reuse shortage semantic). Readiness % progress bar h-1 (4px) bg-zinc-100 + fill success-500. | **Replace** |
| **AlertsList** | List item h-12 (48px) padding-x 16px py-3 border-b zinc-100 hover:bg-zinc-50. Icon leading 16px (warning amber / danger red / shortage orange). Title 13px weight 500. Meta timestamp 11px zinc-500. Action link text-xs blue-600. | **Tune** |
| **SystemHealthCard** | Padding 16px, status dot h-2 w-2 rounded-full (success emerald-500, warning amber-500, danger red-500). Text 13px, label 11px uppercase. Metric row h-6 flex gap-2. | **Tune** |
| **EmptyState** | Icon Lucide 32px stroke 1.5 zinc-400. Title 14px weight 500 zinc-900. Description 12px zinc-500 max-w-80. CTA button sm ghost. Total height 120-160px. **Xóa folder `components/ui/illustrations/`**. | **Replace** |
| **StatusBadge** | Giữ 3-channel (icon + label + color). Height 20px, icon 12px leading, text 11px uppercase tracking-wide weight 500. Variants map lại với palette V2. Ready = emerald, Partial = amber, Shortage = orange, Fail = red, Draft = zinc, Released = blue. | **Tune** |
| **ItemListTable** | Row h-9, no zebra, sticky header h-9. Checkbox cell w-8. SKU cell font-mono 12px w-32. Name cell 13px truncate with Tooltip. Qty cell font-mono 12px tabular-nums right-aligned. Status cell badge. Actions cell icon-button h-7 w-7 ghost. Hover row bg-zinc-50. Selected row bg-blue-50 + left-border 2px blue-500. | **Replace** |
| **ItemForm** | Section card padding 20px (p-5) bg-white border zinc-200. Section header 15px weight 600 + subsection divider border-t zinc-100 margin-y 20px. Field label 13px weight 500 zinc-900 margin-b 6px. Input h-9. Helper text 12px zinc-500 margin-t 4px. Error text 12px red-600. Save button bottom-right, outline "Hủy" + primary "Lưu". | **Tune** |
| **FilterBar** | h-9 container bg-white border zinc-200 rounded-md sticky top-11 (topbar height 44). Padding 8px. Input search h-8 w-64 icon leading 14px. Filter chips: badge h-6 padding-x 8px, close icon 10px. "Xóa hết" link text-xs blue-600 margin-left auto. | **Tune** |
| **BulkActionBar** | Sticky bottom slide-up 200ms. Height 48px, bg zinc-900 text-white, padding-x 16px. Count "3 mục đã chọn" text-sm. Action buttons ghost-on-dark h-7 text-sm. Close icon-button right. | **Replace** |
| **ItemQuickEditSheet** | Sheet right 480px. Header 48px padding-x 20px border-b. Body padding 20px, vertical gap 16px. Footer h-14 padding-x 20px border-t, "Hủy" outline + "Lưu" primary. | **Tune** |
| **ColumnMapperStep** | 2-column layout: source cols (Excel header) left, target fields right. Row h-9 connect with dashed line. Auto-suggest hint 11px zinc-500. Error inline 12px red-600. | **Tune** |
| **ImportWizard** | Stepper top 48px bg-white border-b, step h-10 w-10 rounded-full border-2 (active blue-500 bg, done emerald-500 bg + check, todo zinc-300 border). Content padding 24px. Footer sticky bottom h-14 bg-white border-t, "Quay lại" outline + "Tiếp" primary. | **Tune** |
| **SupplierForm** | Kế thừa ItemForm spec. Address field textarea min-h 72px. VAT/tax field font-mono. | **Tune** |
| **ReceivingConsole (PWA)** | Full-screen single-task. Scan input h-11 (44px) autofocus. Current-item card padding 16px, border-l 2px orange-500 (semantic shortage preserved). List row h-14 (56px) touch-friendly. Action bar bottom h-18 (72px) padding-x 16px, 2 buttons h-11 text-base. | **Tune** — giữ PWA density override |
| **BarcodeScanner** | Modal full-screen, camera viewport 100% width aspect 4:3. Guide rectangle border-2 dashed white 64% width center. Beep logic giữ V1. | **Keep** |
| **ScanQueueBadge** | Top-right corner PWA, bg zinc-900 text-white h-6 padding-x 8px text-xs tabular-nums rounded-full. Pulse animate-pulse khi >0. | **Tune** |
| **LoginHero** | Left panel 50% width bg gradient linear-gradient zinc-50 → blue-50 (subtle). Tagline 28px weight 600 zinc-900 max-w-md. Supporting text 15px zinc-600. Logo top-left 32px. | **Replace** |
| **BuildInfo** | Footer login page right-aligned, text-xs zinc-400 font-mono. "v1.0.0 · build a3f2b · 2026-04-17". | **Keep** |

---

## §4. Screen redesign notes — 8 màn

### 4.1 `/login` — Login page
- V1 xấu: LoginHero chiếm 50% với illustration SVG + heading Be Vietnam Pro 36px, form input h-12 + button CTA orange 48px height, tổng page body 960px height dày.
- V2 đổi: Hero 50% gradient zinc-50→blue-50, tagline 28px Inter weight 600. Form panel 50% bg-white, max-w-sm center, input h-9 border zinc-200, button primary blue-500 h-9 full-width. Footer BuildInfo 11px font-mono zinc-400.
- Mobile: single column, form 100% width padding-x 24px.

### 4.2 `/` — Dashboard
- V1 xấu: H1 24px, 4 KPI cards border-l-4 orange/green/red/blue value 36px, section gap 24px, OrdersReadinessTable row 48px zebra, page body 1100px scroll.
- V2 đổi: H1 20px weight 600. 4 KPI cards h 72px, value 22px, no border-l. Grid 12 col, KPI span-3. Section gap 16px. OrdersReadinessTable row 36px no zebra. AlertsList sidebar right span-4 card padding 16px. SystemHealthCard bottom-right 72px height. Total above-fold ~720px — fit 1080p viewport.
- TV mode giữ route riêng (`/tv` sau này) với font scale ×2.

### 4.3 `/items` — Item List
- V1 xấu: Page padding 32px, FilterBar h-12 + input h-10, ItemListTable row 48px zebra, BulkActionBar 56px height bg-slate-900.
- V2 đổi: Page padding-x 24px, padding-y 20px. FilterBar h-9 sticky top-11, input h-8. Table row 36px no zebra border-b zinc-100. Selected row bg-blue-50 left-border 2px blue-500. BulkActionBar 48px height bg zinc-900. Pagination bottom h-9.

### 4.4 `/items/new` + `/items/[id]/edit` — Item Form
- V1 xấu: Card padding 24px, label text-base 14px weight 600, input h-10, button size default h-10.
- V2 đổi: Card padding 20px, label 13px weight 500, input h-9. Section divider border-t zinc-100 margin-y 20px. Save/Cancel buttons bottom-right h-8 default size. Breadcrumb Items > Chi tiết > {name}.

### 4.5 `/items/import` — Import Wizard
- V1 xấu: Stepper top 64px, step icon 40px, content padding 48px, footer 72px với button h-12.
- V2 đổi: Stepper top 48px, step 32px. Content padding 24px. ColumnMapperStep 2-col layout clean. Footer h-14 padding-x 20px, button h-9.

### 4.6 `/suppliers` + `/suppliers/new` — Suppliers CRUD
- V1 xấu: Kế thừa /items style cũ → cùng bệnh.
- V2 đổi: Kế thừa /items V2 spec. List table row 36px. Form section card padding 20px. Add route `/suppliers/[id]` detail panel với tabs (Thông tin / Lịch sử PO / Ghi chú).

### 4.7 `/pwa/receive` — PWA Receiving
- V1 xấu: Container padding 16px OK nhưng font body 16px, button h-12, action bar 72px (OK cho touch).
- V2 đổi: Container padding 16px, font-base 14px PWA override (D3 mobile). Button h-11 (44px) touch target. Action bar h-18 (72px) bg-white border-t zinc-200 2 button full-width split. Current item card border-l 2px orange-500 (shortage semantic). Scan flash ring emerald/red 400ms.

### 4.8 Layout shell app-wide
- V1 xấu: Sidebar 240/56 + topbar 56 = 112px dead top corner. Content max-width 1440px center nhưng padding 32px.
- V2 đổi: Sidebar 220 fixed, topbar 44. Dead corner 44×220 = vừa đủ cho logo. Content max-width 1440px, padding-x 24px padding-y 20px. Mobile: sidebar drawer, topbar full-width.

---

## §5. Font size cheatsheet V1 vs V2

| Element | V1 px | V2 px | Delta | Note |
|---|---|---|---|---|
| Body text | 14-16 | 13 | -19% | `text-sm` default |
| H1 page title | 24-30 | 20 | -33% | |
| H2 section | 20 | 18 | -10% | |
| H3 subsection | 16 | 15 | -6% | |
| Card title | 16-20 | 15 | -25% | |
| Table row cell | 13-14 | 13 | 0% | Đã OK V1 |
| Table header | 13 | 12 | -8% | Uppercase tracking-wide |
| KPI label | 14 | 11 | -21% | Uppercase |
| KPI value | 36 | 22 | -39% | weight 500 not bold |
| KPI delta | 13 | 12 | -8% | Font-mono |
| Button label (default) | 14 | 13 | -7% | |
| Button label (sm) | 13 | 13 | 0% | |
| Button height | 40 | 32 | -20% | h-10 → h-8 |
| Input height (form) | 40 | 36 | -10% | h-10 → h-9 |
| Input height (filter) | 40 | 32 | -20% | h-10 → h-8 |
| Input height (PWA) | 48 | 44 | -8% | h-12 → h-11 |
| Table row height | 48 | 36 | -25% | h-12 → h-9 |
| Sidebar nav item | 40 | 28 | -30% | h-10 → h-7 |
| Topbar height | 56 | 44 | -21% | h-14 → h-11 |
| Checkbox size | 20 | 16 | -20% | h-5 → h-4 |
| Sidebar width expanded | 240 | 220 | -8% | |
| Empty state icon | 120 | 32 | -73% | Illustration → Lucide icon |
| Label uppercase | 14 | 11 | -21% | weight 500 tracking-wide |
| Meta/timestamp | 12-13 | 11-12 | -8-15% | |
| Badge | 12 | 12 | 0% | OK V1 |
| Tab label | 14 | 13 | -7% | |
| Dialog title | 20 | 15 | -25% | weight 600 |
| Mono (SKU, batch) | 13 | 12 | -8% | JetBrains Mono |

Phân bố delta: giảm trung bình **-18%** size UI elements. Font scale body -19%, interactive -20%, KPI hero -39%, heading -30%.

---

## §6. Density D3 hybrid — quy tắc áp dụng

### 6.1 List pages (compact)
Routes: `/items`, `/suppliers`, `/items/import` (list view), future `/orders`, `/work-orders`.
- Row: 36px height
- Padding-x row: 12px
- Table font: 13px
- Header row: 36px sticky, font 12px uppercase tracking-wide weight 500 zinc-500
- No zebra. Border-b zinc-100 1px tách row.
- Hover: `bg-zinc-50 transition-colors 100ms`
- Selected: `bg-blue-50 + border-l-2 border-blue-500` (cell đầu padding-left giảm 2px để bù border)
- Actions cell: icon-button h-7 w-7 ghost, icon 14px

### 6.2 Form / detail pages (spacious)
Routes: `/items/new`, `/items/[id]/edit`, `/suppliers/new`, `/suppliers/[id]`, `/items/import/[stepId]`.
- Section card padding: 20px (p-5)
- Section gap vertical: 20px
- Field gap: 16px (gap-4)
- Label: 13px weight 500 margin-b 6px
- Input: h-9 (36px)
- Helper/error: 12px margin-t 4px
- Divider giữa group: `border-t border-zinc-100 margin-y 20px`
- Button submit: h-8 default, align right footer

### 6.3 Dashboard (hybrid)
Routes: `/`.
- Page padding: padding-x 24px, padding-y 20px
- Section gap: 16px
- KPI card: padding 16px, min-h 72px
- Chart card: padding 16px, aspect 2:1
- Table section: D3 list compact (row 36px)

### 6.4 Mobile / Tablet / PWA (touch)
Breakpoint: viewport < 1024px hoặc route `/pwa/*`.
- Touch target: min 44px (h-11)
- Font base: 14px (thay 13px)
- Padding-x container: 16px
- Row list: h-14 (56px)
- Button: h-11 (44px) primary action; h-9 (36px) secondary
- Input: h-11 (44px)

Override desktop D3 bằng Tailwind responsive prefix: `h-9 lg:h-8` etc.

---

## §7. Accessibility preserve

- **WCAG AA body contrast**: zinc-900 trên zinc-50 = 18.37:1 (AAA xa). Muted zinc-500 trên zinc-50 = 4.71:1 (AA). Shortage orange-700 trên orange-50 = 9.8:1 (AAA) preserved.
- **Focus ring**: CSS `outline: 2px solid #3B82F6; outline-offset: 2px` trên `:focus-visible`. PWA override: `outline: 3px solid #2563EB`.
- **Keyboard shortcut**: giữ V1 `j/k` next/prev row, `e` edit, Space toggle select, `Ctrl+K` command palette, `Esc` close dialog/sheet, `/` focus search. Không break binding.
- **Status 3-channel mandatory**: Badge luôn `{icon}{label}{color}`. Empty state luôn `{icon}{title}{description}`. Scan feedback luôn `{flash color}{border color}{beep sound}`.
- **Safety-orange semantic**: preserved — chỉ cho shortage/critical. Không dùng cho CTA. Badge "Thiếu hàng" = orange-soft bg + orange-strong text + AlertTriangle icon 12px. PWA current row = border-l 2px orange-500.
- **Reduced motion**: `@media (prefers-reduced-motion: reduce)` tắt shimmer, shake, scale, hover lift. Giữ fade 150ms (không gây chóng mặt).
- **Vietnamese diacritics**: Inter subset `vietnamese` load `next/font/google` display swap. Test glyph: `ư ơ đ ươ ướng ưỡng`.
- **Tap target 44×44px**: PWA route override cưỡng chế; desktop mouse relax 28-32px OK.

---

## §8. Implementation strategy V2

### 8.1 Branch + commit order
- Branch mới `redesign/direction-b-v2` từ HEAD `redesign/direction-b` (30 commit V1 base, dashboard 500 bug chưa fix nhưng chấp nhận — V2 redesign visual, bug dashboard root cause riêng).
- Commit sequence (mỗi commit buildable local):
  1. `chore(redesign-v2): tokens refactor — tailwind.config zinc+blue, typography scale, spacing 9-value` (cập nhật tailwind.config.ts + globals.css + tạo `docs/design-guidelines-v2.md` 150-200 dòng)
  2. `refactor(redesign-v2): UI primitives — Button/Input/Label/Checkbox/Select/Textarea` (6 files, break visual V1 nhưng giữ API props)
  3. `refactor(redesign-v2): UI primitives — Dialog/Sheet/Popover/Dropdown/Tabs/Skeleton/Badge + add Tooltip` (7 files)
  4. `refactor(redesign-v2): layout — AppShell/Sidebar/TopBar/UserMenu/Breadcrumb/CommandPalette` (6 files)
  5. `refactor(redesign-v2): domain — KpiCard/OrdersReadinessTable/AlertsList/SystemHealthCard/StatusBadge/EmptyState` (6 files + xóa folder illustrations)
  6. `refactor(redesign-v2): items — ItemListTable/ItemForm/FilterBar/BulkActionBar/ItemQuickEditSheet` (5 files)
  7. `refactor(redesign-v2): import — ColumnMapperStep/ImportWizard` (2 files)
  8. `refactor(redesign-v2): suppliers — SupplierForm + routes` (2 files)
  9. `refactor(redesign-v2): pwa — ReceivingConsole/BarcodeScanner/ScanQueueBadge` (3 files)
  10. `refactor(redesign-v2): login — LoginHero/BuildInfo + page layout` (3 files)
  11. `chore(redesign-v2): cleanup — remove Be Vietnam Pro font, old illustrations, dead slate-* tokens`
  12. `docs(redesign-v2): update PROGRESS.md + plans/redesign-v2/260417-design-spec-v2.md` (sau khi user duyệt)

### 8.2 Build local Windows
- `pnpm install` (first run, cache warm 3 phút)
- `pnpm -F @iot/web build` local trước mỗi commit (expect 60-120s)
- `pnpm -F @iot/web dev` → `http://localhost:3000` browser review
- KHÔNG touch VPS cũ trong suốt V2 cook. VPS cũ giữ V1 Direction B LIVE làm fallback.

### 8.3 Iteration loop
- Mỗi milestone (commit 1, 2, 4, 6 lớn) user review browser local:
  - commit 1 (tokens): không có UI thay đổi rõ → skip review, chỉ check build pass
  - commit 2+3 (primitives): storybook mini trên `/storybook` route dev-only hoặc demo page `/v2-preview`
  - commit 4 (layout): review shell + nav + topbar trên `/` login → / dashboard flow
  - commit 5+6 (dashboard + items): review / + /items + /items/new
  - commit 7+8 (import + suppliers): review flow end-to-end
  - commit 9 (PWA): review /pwa/receive tablet emulate DevTools
  - commit 10 (login): final polish
- Dự kiến 5-10 vòng iterate, mỗi vòng user edit feedback → Claude tune class/spec → rebuild.

### 8.4 VPS deploy (sau duyệt)
- User ping chốt "V2 OK"
- Branch merge hoặc tạo tag `v2.0.0`
- Deploy VPS MỚI (SSD spec, chưa setup) — không động VPS cũ
- DNS cutover khi V2 LIVE stable 24h

---

## §9. Checklist 25 quyết định execution cho planner

**Q1: Dùng font Inter hay Geist?**
→ **A: Inter** với font-feature-settings `"cv11" 1, "ss01" 1, "cv02" 1`. Load `next/font/google` subset `['latin','latin-ext','vietnamese']`. Bỏ Be Vietnam Pro. Geist là font Vercel open-source nhưng Inter đã stable + free + đã có trong next/font, support diacritic tốt.

**Q2: Dark mode V2.0?**
→ **A: Reserve token CSS var + `[data-theme="dark"]` attribute, KHÔNG cook toggle UI V2.0.** YAGNI — user chưa yêu cầu. Token chỉ đặt sẵn trong globals.css, không có ThemeProvider, không có toggle. V2.1+ kích hoạt.

**Q3: Border color default?**
→ **A: zinc-200 (#E4E4E7).** Replace slate-200 (#E2E8F0). Subtle hơn nhẹ nhàng hơn, gần neutral pure.

**Q4: Primary CTA hex?**
→ **A: blue-500 (#3B82F6) default, blue-600 (#2563EB) hover, blue-700 (#1D4ED8) press.** Không custom hex. Tailwind blue scale AA pass contrast trên white (4.52:1).

**Q5: Safety-orange dùng ở đâu?**
→ **A: CHỈ shortage semantic.** Cụ thể: (1) Badge "Thiếu hàng" bg-orange-50 + text-orange-700 + AlertTriangle icon 12px. (2) OrdersReadinessTable row shortage: `bg-orange-50 + border-l-2 border-orange-500`. (3) PWA ReceivingConsole current item card border-l 2px orange-500. KHÔNG cho button/CTA/link/hover-state.

**Q6: Font body px?**
→ **A: 13px (0.8125rem) default.** Line-height 18px (1.38 ratio). `text-sm` mapped thành 13/18.

**Q7: H1 page title?**
→ **A: 20px (1.25rem) weight 600 line-height 28px tracking-tight (-0.01em).** Inter, không Be Vietnam Pro.

**Q8: KPI value px + weight?**
→ **A: 22px (1.375rem) weight 500 (medium, KHÔNG bold) tabular-nums.** Màu text-zinc-900 default, text-red-600 khi critical, text-orange-600 khi shortage.

**Q9: Button default size?**
→ **A: h-8 (32px) px-3 text-sm (13px) weight 500 rounded-md.** PWA route override h-11 (44px) text-base (14px).

**Q10: Input default size (form)?**
→ **A: h-9 (36px) px-3 text-sm (13px) rounded-md border-zinc-200.** Filter bar h-8 (32px). PWA h-11 (44px).

**Q11: Table row height list pages?**
→ **A: h-9 (36px).** No zebra. border-b zinc-100.

**Q12: Row hover bg?**
→ **A: `bg-zinc-50` (#FAFAFA).** Transition 100ms ease-out.

**Q13: Row selected?**
→ **A: `bg-blue-50 (#EFF6FF) + border-l-2 border-blue-500` (cell đầu padding-left giảm 2px bù).** Checkbox sync checked.

**Q14: Sidebar width?**
→ **A: 220px fixed desktop (`--sidebar-width: 13.75rem`).** Mobile drawer 280px overlay. Bỏ rail-collapsed 56px.

**Q15: Topbar height?**
→ **A: 44px (h-11) desktop. Mobile: 56px (h-14) vì cần tap target.**

**Q16: Card padding?**
→ **A: list/dashboard card padding 16px (p-4). Form section card padding 20px (p-5).** Dialog/Sheet body 20px.

**Q17: Focus ring?**
→ **A: CSS outline not box-shadow. `outline: 2px solid #3B82F6; outline-offset: 2px` cho `:focus-visible`.** PWA override 3px #2563EB.

**Q18: Border radius mapping?**
→ **A: 3 tokens. sm=4px (badge/chip), md=6px (button/input/card/popover/dropdown/tab), lg=8px (dialog/sheet/command-palette).** Bỏ 12px.

**Q19: Shadow default card?**
→ **A: `shadow-none + border border-zinc-200 bg-white`.** Interactive card hover: shadow-xs + border-zinc-300.

**Q20: Dialog shadow?**
→ **A: `0 16px 48px rgba(0,0,0,0.12)` single-layer.** Bỏ double-drop V1.

**Q21: Motion hover duration?**
→ **A: 100ms (duration-100) ease-out cho bg-color + border-color.** Button press scale 100ms. Card hover lift 150ms.

**Q22: Sheet slide duration?**
→ **A: 200ms ease-out-quart `cubic-bezier(0.25, 1, 0.5, 1)`.**

**Q23: Font size label uppercase?**
→ **A: 11px (0.6875rem) weight 500 uppercase tracking-wide letter-spacing 0.02em text-zinc-500.**

**Q24: Empty state style?**
→ **A: Lucide icon 32px stroke 1.5 zinc-400 + title 14px weight 500 + desc 12px zinc-500 + CTA sm ghost. XÓA `components/ui/illustrations/` folder V1.**

**Q25: Keep Tailwind slate color alias cho migration?**
→ **A: Tạm giữ 1 commit đầu (Commit 1 tokens) để code cũ không break build. Commit 11 cleanup xóa slate-* khỏi tailwind.config và remap các chỗ còn dùng thành zinc-*.** Tránh big-bang rewrite gây conflict merge.

---

## §10. Risk register + mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| PWA UX regression do desktop density áp PWA | Med | High | D3 rule §6.4 cưỡng chế override, test route `/pwa/*` trước khi merge commit 9 |
| Vietnamese diacritics Inter render tofu | Low | High | Preload `next/font/google` subset `vietnamese`, test `ư ơ đ ệ` headline + body, font-display swap fallback system-ui |
| Build local Windows pnpm symlink fail (V1 worker container bug đã biết) | Med | Med | Chỉ build `@iot/web`, KHÔNG cook worker V2. Worker giữ V1 state (disabled). |
| User feedback loop kéo dài > 10 vòng | Med | Med | Chốt cứng design spec commit 1 trước khi cook primitives. Feedback chỉ tune không rewrite spec. |
| Dashboard 500 bug V1 blend vào V2 | Low | Low | Branch V2 nhận root cause debug riêng (nếu bug layer data, V2 redesign visual không fix). Ghi chú PROGRESS.md. |
| Safety-orange shortage semantic nhầm chỗ | Low | Med | Grep `bg-cta|bg-orange|border-orange` audit commit 11, chỉ còn shortage-related nodes. |
| Focus ring change outline vs box-shadow break stacking | Med | Low | Test keyboard tab qua toàn app commit 4 layout, verify outline không bị clip bởi `overflow-hidden` parent (thêm padding `p-0.5` parent nếu cần). |
| Tailwind config big refactor break CI type check | Low | Med | Commit 1 build + typecheck pass. Không delete token nào ngay commit 1 (chỉ add zinc). Commit 11 cleanup dùng codemod grep. |
| CSS variable conflict V1 `--sidebar-width: 15rem` → V2 `13.75rem` | Low | Low | Đổi var in commit 4 layout cùng với width class, không để lệch. |
| User đổi ý palette giữa chừng | Low | High | Token layer tập trung tailwind.config + globals.css → rollback 1 commit. Component code không hardcode hex, chỉ dùng class Tailwind. |

---

## §11. Out of scope V2.0

- Dark mode UI toggle (reserve token only)
- Work Orders route (chưa cook V1, chờ V1.1 sprint)
- Orders detail route (V1 chỉ có stub)
- BOM editor tree (V1.1)
- TV dashboard `/tv` mode (V1.2)
- i18n English toggle (VN-only V2.0)
- Worker container recover (bug disabled V1, không liên quan visual)
- Dashboard 500 bug root cause debug (nếu debug được trong commit 4-5 tiện tay thì fix, không block V2)
- A11y audit automated (axe-core CI) — chuyển V2.1
- Unit/integration test UI primitives (V2.1)

---

## §12. Tổng kết quyết định brutal honesty

1. **V1 Direction B thất bại visually vì 3 nguyên nhân gốc:**
   - Palette slate+orange sai match với target aesthetic modern dev-tool (Linear/Notion/Vercel)
   - Font scale ERP cũ 14-16px body + 36px KPI value
   - Density card/button/input paddings mobile-first thô 40-48px không phù hợp desktop planner

2. **V2 không phải "tune V1" — là rewrite visual layer từ tokens lên.** Giữ 100% logic (hooks, state machine, repos, URL state, RBAC) nhưng viết lại className mọi component.

3. **Giá trị giữ từ V1:**
   - Safety-orange semantic shortage (đã cài sâu trong design spec)
   - 3-channel status (icon+label+color) — best practice preserved
   - PWA touch target 44px override — chuẩn industrial HMI
   - Reduced motion media query
   - Skip-link + keyboard shortcut
   - Vietnamese diacritic subset loading
   - Storage pattern (sidebar collapsed, theme)

4. **Giá trị bỏ:**
   - `Be Vietnam Pro` font (replace Inter)
   - Slate palette (replace zinc)
   - Sidebar rail 56px collapsed (YAGNI)
   - Zebra stripe (outdated)
   - Border-l-4 status indicator KPI (retro SCADA)
   - Illustration SVG folder (overkill)
   - Shadow double-drop (Material 2020)
   - 40-48px button height desktop (mobile-first thô)

5. **Timeline dự kiến:** 10-14 ngày cook commit 1-11 + 5-10 vòng iterate + final review → sẵn sàng deploy VPS mới. Build local Windows buộc tránh 13 phút/vòng VPS cũ.

6. **Cửa thoát nếu V2 flop:** rollback về branch `redesign/direction-b` (V1 LIVE, UI xấu nhưng functional), DNS giữ VPS cũ. Không burn bridge.

---

**File này là input bắt buộc cho:**
- `/plan` next step → planner-researcher đọc §1-9, tạo `plans/redesign-v2/260417-design-spec-v2.md` (implementation-level, replicate `260417-design-spec.md` V1 2433 dòng nhưng tokens V2)
- `/cook` sau khi user duyệt spec → commit sequence §8.1

**Không duyệt, không cook.** Chờ user approve brainstorm này trước.

---

*— End of brainstorm V2 · Claude Opus 4.7 · 2026-04-17*
