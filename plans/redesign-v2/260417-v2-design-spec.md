# Design Spec chi tiết V2 — Linear-inspired Redesign (zinc + electric blue)

*Phiên bản:* 2.0 · *Ngày:* 2026-04-17 · *Persona:* UI/UX Designer (ui-ux-pro-max)
*Nguồn tham chiếu:* [`plans/redesign-v2/260417-v2-brainstorm.md`](./260417-v2-brainstorm.md) §1-12, [`plans/redesign/260417-design-spec.md`](../redesign/260417-design-spec.md) (V1, để biết cái gì REPLACE), [`apps/web/tailwind.config.ts`](../../apps/web/tailwind.config.ts), [`apps/web/src/app/globals.css`](../../apps/web/src/app/globals.css)
*Mục tiêu:* Blueprint cấp implementation — dev cook trực tiếp từng section không cần hỏi lại. Replace V1 Direction B visual layer, KEEP 100% logic.

**Ràng buộc bất di bất dịch V2:**
- Style Linear-inspired (clean, low-contrast, mono-sharp, modern SaaS dev-tool)
- Palette **zinc + electric blue** (zinc-950 primary, blue-500 accent, safety-orange CHỈ shortage/alert semantic)
- Density **D3 hybrid** (list row 36px, form padding 20px, dashboard card 16px)
- Font scale NHỎ hơn V1 (body 13px, KPI value 22-24px, H1 page 20px)
- Dark mode: reserve CSS var, KHÔNG cook toggle V2.0
- Reuse 100% logic V1 (state machine, URL state, hooks, repos, API, middleware, auth)

**Tone:** brutal concrete. Mỗi value px/hex/ms cụ thể. Không "vừa phải" / "đẹp hơn".

---

## §1. Design tokens V2 — replace V1 hoàn toàn

### 1.1 Palette zinc + blue

#### 1.1.1 Zinc scale (neutral 11 values)

| Token | Hex | Usage chính |
|---|---|---|
| `zinc-50` | `#FAFAFA` | Page background, button secondary soft hover |
| `zinc-100` | `#F4F4F5` | Row hover, skeleton base, ghost button hover, tab bg inactive |
| `zinc-200` | `#E4E4E7` | Border subtle (card, input, divider), progress bar track |
| `zinc-300` | `#D4D4D8` | Border strong (input focus outline pair, button outline default) |
| `zinc-400` | `#A1A1AA` | Icon muted, placeholder text, empty state icon |
| `zinc-500` | `#71717A` | Meta text, timestamp, helper text, label uppercase muted |
| `zinc-600` | `#52525B` | Secondary body, icon active secondary |
| `zinc-700` | `#3F3F46` | Tertiary heading, form label (alt), button secondary text |
| `zinc-800` | `#27272A` | (Reserve dark mode border) |
| `zinc-900` | `#18181B` | **Primary text**, H1-H3, button primary label on light |
| `zinc-950` | `#09090B` | BulkActionBar bg, CommandPalette bg top layer, emphasis hero text |

Contrast check trên `zinc-50` (#FAFAFA) background:
- `zinc-900` #18181B → **17.1:1** (AAA xa)
- `zinc-700` #3F3F46 → **9.2:1** (AAA)
- `zinc-500` #71717A → **4.9:1** (AA body, AAA large)
- `zinc-400` #A1A1AA → **3.1:1** (AA non-text only — không dùng cho text quan trọng)

#### 1.1.2 Blue scale (primary CTA)

| Token | Hex | Usage |
|---|---|---|
| `blue-50` | `#EFF6FF` | Row selected bg, info-soft bg, link hover subtle |
| `blue-100` | `#DBEAFE` | Card accent subtle, tag selected bg |
| `blue-200` | `#BFDBFE` | Divider accent, selected card border alt |
| `blue-300` | `#93C5FD` | Selected card border, progress fill subtle |
| `blue-400` | `#60A5FA` | (Reserve dark mode accent) |
| `blue-500` | `#3B82F6` | **Primary CTA default**, link, selected row left-border, checkbox checked, focus outline |
| `blue-600` | `#2563EB` | Button primary hover, link hover strong, PWA focus outline override |
| `blue-700` | `#1D4ED8` | Button primary press/active, selected text |
| `blue-800` | `#1E40AF` | Emphasis text trên light bg (rare) |
| `blue-900` | `#1E3A8A` | (Reserve dark mode selected bg) |
| `blue-950` | `#172554` | (Reserve dark mode deep) |

Contrast `blue-500` trên `zinc-50` = **4.52:1** (AA body/link pass).
Contrast `blue-600` trên `zinc-50` = **5.17:1** (AA body pass).
Contrast `blue-700` trên `zinc-50` = **7.01:1** (AAA body).

#### 1.1.3 Emerald scale (success semantic)

| Token | Hex | Usage |
|---|---|---|
| `emerald-50` | `#ECFDF5` | Success row bg, success badge bg, scan-flash-success bg |
| `emerald-100` | `#D1FAE5` | Success toast bg subtle |
| `emerald-200` | `#A7F3D0` | Scan ring mid frame |
| `emerald-300` | `#6EE7B7` | Progress fill |
| `emerald-400` | `#34D399` | Status dot active |
| `emerald-500` | `#10B981` | PASS QC icon, Ready badge, success toast icon, progress-bar fill |
| `emerald-600` | `#059669` | Success button press |
| `emerald-700` | `#047857` | Success text trên light bg (AAA), ready label text |

Contrast `emerald-700` trên `emerald-50` = **9.8:1** (AAA).

#### 1.1.4 Amber scale (warning semantic)

| Token | Hex | Usage |
|---|---|---|
| `amber-50` | `#FFFBEB` | Warning row bg, partial-ready badge bg |
| `amber-100` | `#FEF3C7` | Warning toast bg subtle |
| `amber-200` | `#FDE68A` | Status dot ring warning |
| `amber-300` | `#FCD34D` | Progress warning fill subtle |
| `amber-400` | `#FBBF24` | Warning icon inline |
| `amber-500` | `#F59E0B` | Warning badge icon, partial-ready progress fill |
| `amber-600` | `#D97706` | Warning button (rare) |
| `amber-700` | `#B45309` | Warning text AAA, partial-ready label |

Contrast `amber-700` trên `amber-50` = **8.9:1** (AAA).

#### 1.1.5 Red scale (danger semantic)

| Token | Hex | Usage |
|---|---|---|
| `red-50` | `#FEF2F2` | Error input border bg, danger row bg subtle |
| `red-100` | `#FEE2E2` | Danger toast bg, scan-flash-danger bg |
| `red-200` | `#FECACA` | Danger border subtle |
| `red-300` | `#FCA5A5` | Danger icon subtle |
| `red-400` | `#F87171` | Danger icon inline |
| `red-500` | `#EF4444` | **Destructive button** bg, FAIL QC icon, error toast |
| `red-600` | `#DC2626` | Destructive button hover, KPI value critical |
| `red-700` | `#B91C1C` | Danger text AAA, error dialog title |

Contrast `red-700` trên `red-50` = **9.1:1** (AAA). `red-500` trên white = **4.54:1** (AA).

#### 1.1.6 Sky scale (info semantic)

| Token | Hex | Usage |
|---|---|---|
| `sky-50` | `#F0F9FF` | Info toast bg, info badge bg, help tag bg |
| `sky-100` | `#E0F2FE` | Info subtle bg alt |
| `sky-200` | `#BAE6FD` | Info border |
| `sky-400` | `#38BDF8` | Info icon inline |
| `sky-500` | `#0EA5E9` | Info badge icon |
| `sky-600` | `#0284C7` | Info link |
| `sky-700` | `#0369A1` | Info text AAA |

Contrast `sky-700` trên `sky-50` = **9.7:1** (AAA).

#### 1.1.7 Safety orange — RESERVED shortage/critical ONLY

| Token | Hex | Usage (STRICT) |
|---|---|---|
| `orange-50` | `#FFF7ED` | Shortage row bg, critical alert banner bg |
| `orange-200` | `#FED7AA` | Shortage badge border |
| `orange-500` | `#F97316` | **Shortage badge icon**, PWA picklist current-item border-l, shortage alert dot |
| `orange-600` | `#EA580C` | Shortage button (destructive-adjacent, rare) |
| `orange-700` | `#C2410C` | Shortage text AAA, critical stock label |

Contrast `orange-700` trên `orange-50` = **9.8:1** (AAA).

**Quy tắc sử dụng safety-orange V2 (strict):**
- CHỈ được dùng cho: Badge "Thiếu hàng" / shortage semantic, OrdersReadinessTable shortage row highlight, PWA ReceivingConsole current-item card border-left, critical stock banner top dashboard khi có SKU < safety stock.
- KHÔNG được dùng cho: button primary, link, hover, focus ring, CTA generic, KPI value (trừ critical stock count), loading state, tab active, breadcrumb active.
- Grep rule audit pre-merge: `rg 'orange-(500|600|700)|safety-orange|text-orange|bg-orange' apps/web/src` — mỗi match phải justify shortage semantic.

#### 1.1.8 Overlay & Scrim

| Token | Value | Usage |
|---|---|---|
| `overlay-scrim` | `rgba(0, 0, 0, 0.5)` | Dialog backdrop (darker than V1 V1 0.48 để mobile outdoor readable) |
| `overlay-sheet` | `rgba(0, 0, 0, 0.4)` | Sheet backdrop (lighter, slide vào side không đen như dialog) |
| `overlay-toast` | `rgba(0, 0, 0, 0.05)` | Toast backdrop shadow ambient |

#### 1.1.9 Focus ring

| Token | Value | Usage |
|---|---|---|
| `focus-ring-default` | `outline: 2px solid #3B82F6; outline-offset: 2px;` | Desktop form/button/link focus-visible |
| `focus-ring-pwa` | `outline: 3px solid #2563EB; outline-offset: 2px;` | PWA route override (outdoor visibility) |
| `focus-ring-inverted` | `outline: 2px solid #FFFFFF; outline-offset: 2px;` | Focus trên bg zinc-950 (BulkActionBar) |

**Thay đổi vs V1:** V1 dùng `box-shadow: 0 0 0 3px rgba(3,105,161,0.35)` → V2 dùng CSS `outline` thuần để không stack với border input khiến "pop" visual. Chỉ trigger trên `:focus-visible` (keyboard), không `:focus` mouse.

#### 1.1.10 Dark mode reserve (KHÔNG cook V2.0)

```css
[data-theme="dark"] {
  --bg-page: #09090B;        /* zinc-950 */
  --bg-card: #18181B;        /* zinc-900 */
  --bg-muted: #27272A;       /* zinc-800 */
  --border-subtle: #27272A;
  --border-strong: #3F3F46;
  --text-primary: #FAFAFA;
  --text-secondary: #D4D4D8;
  --text-muted: #A1A1AA;
  --accent-default: #60A5FA; /* blue-400 bright */
  --accent-hover: #93C5FD;
  --accent-press: #3B82F6;
}
```
Để sẵn globals.css V2 nhưng không import `ThemeProvider`, không toggle. V2.1+ kích hoạt sau.

### 1.2 Typography scale V2

Font family: **Inter** (duy nhất) với `font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1`. Load qua `next/font/google` subset `['latin', 'latin-ext', 'vietnamese']`. **Bỏ Be Vietnam Pro** khỏi dependency (xóa import trong `apps/web/src/app/layout.tsx`).

Mono: **JetBrains Mono** 12-13px tabular-nums cho SKU, batch code, timestamp ISO.

#### 1.2.1 Font size scale

| Token | rem | px | line-height | Default weight | Usage chính |
|---|---|---|---|---|---|
| `text-xs` | 0.6875 | **11** | 14 | 500 | Label uppercase, badge text, kbd key, tag small |
| `text-sm` | 0.75 | **12** | 16 | 400 | Small meta, helper text, timestamp, table header uppercase |
| `text-base` | 0.8125 | **13** | 18 | 400 | **Body default**, input text, table row cell, button label |
| `text-md` | 0.875 | **14** | 20 | 500 | Button label emphasis, form input PWA, nav item active |
| `text-lg` | 0.9375 | **15** | 20 | 600 | H3 section header, card title, dialog title |
| `text-xl` | 1.0625 | **17** | 24 | 600 | H2 page section |
| `text-2xl` | 1.25 | **20** | 28 | 600 | **H1 page title**, login hero tagline |
| `text-3xl` | 1.5 | **24** | 32 | 500 | KPI value large (dashboard hero), modal title alt |
| `text-4xl` | 1.75 | **28** | 32 | 500 | Login hero mega, special standalone number |
| `text-5xl` | 2.5 | **40** | 44 | 500 | TV dashboard mode (route `/tv` sau này) |
| `text-mono-sm` | 0.75 | **12** | 16 | 400 | Mono code, SKU cell |
| `text-mono-base` | 0.8125 | **13** | 18 | 400 | Mono body, batch number inline |

**Lưu ý vs V1:** V1 có `text-base = 14px`, V2 hạ xuống `13px`. V1 có `text-2xl = 24px` → V2 `20px`. V1 có `text-4xl = 36px` → V2 hạ xuống `28px` (và KPI dùng `text-3xl` 24px thay vì 36px).

#### 1.2.2 Weight scale

| Token | Value | Usage |
|---|---|---|
| `font-normal` | 400 | Body text mặc định, input text, helper |
| `font-medium` | 500 | Button label, label form, active nav, KPI value, strong body |
| `font-semibold` | 600 | Heading H1-H3, card title, dialog title, section header |
| `font-bold` | 700 | (RARE) chỉ dùng cho hero copy landing, **KHÔNG cho H1 app** |

Quy tắc: heading app dùng `font-semibold` (600), KHÔNG dùng `font-bold` (700) để tránh visual noise. V1 có chỗ dùng `text-4xl font-bold` cho KPI → V2 thay bằng `text-3xl font-medium` (nhẹ hơn ~30% visual weight).

#### 1.2.3 Line-height guide

| Token | Value | Usage |
|---|---|---|
| `leading-tight` | 1.2 | Heading H1-H2 |
| `leading-snug` | 1.35 | Card title, dialog title |
| `leading-[1.4]` | 1.4 | **Body default**, input text |
| `leading-normal` | 1.5 | Body long-form (login hero desc, empty state desc) |
| `leading-relaxed` | 1.625 | Prose/article (hiếm dùng trong MES) |

#### 1.2.4 Letter-spacing

| Token | Value | Usage |
|---|---|---|
| `tracking-tight` | -0.01em | H1-H2 page title |
| `tracking-normal` | 0 | Body, default |
| `tracking-wide` | 0.025em | Label uppercase, tab, kbd |
| `tracking-wider` | 0.05em | Badge uppercase, section group title |

#### 1.2.5 Font feature settings (Inter)

```css
html {
  font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
  font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1;
}

.tabular-nums {
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1, "cv11" 1, "ss01" 1;
}

.mono-num {
  font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, monospace;
  font-variant-numeric: tabular-nums;
  font-feature-settings: "tnum" 1;
}
```

- `cv11 1`: alternates straight i/l — tăng legibility ở text-base 13px
- `ss01 1`: stylistic set open digits 0/6/9 — tránh confusion
- `cv02 1`: alt a single-story — consistent với modern SaaS

### 1.3 Spacing scale V2

Chỉ 9 values, bỏ fractional V1 (6/14/18/22 exotic):

| Token | px | rem | Usage |
|---|---|---|---|
| `1` | **4** | 0.25 | Icon-text inline gap, separator dot |
| `2` | **8** | 0.5 | Button icon gap, badge padding, tag gap |
| `3` | **12** | 0.75 | Input padding-x, button padding-x sm, row padding |
| `4` | **16** | 1 | Card padding (list/dashboard), section gap, form row gap |
| `5` | **20** | 1.25 | Form section padding D3 spacious, dialog body padding |
| `6` | **24** | 1.5 | Page padding-x desktop, empty state padding |
| `8` | **32** | 2 | Page padding-y desktop, section hero gap |
| `12` | **48** | 3 | Empty state vertical padding, login panel padding |
| `16` | **64** | 4 | Hero top-bottom login |

Giữ từ V1: `60 = 240px` (sidebar mobile drawer width). Bỏ hoàn toàn: `7/9/14/18/22` V1 custom.

**Mapping spacing → component rules:**

| Rule | Token | Px |
|---|---|---|
| Page padding-x desktop (`lg+`) | `6` | 24 |
| Page padding-y desktop | `8` | 32 |
| Page padding-x mobile | `4` | 16 |
| Card padding list/dashboard | `4` | 16 |
| Card padding form section | `5` | 20 |
| Dialog body padding | `5` | 20 |
| Sheet body padding | `5` | 20 |
| Section gap vertical | `4` | 16 |
| Form field gap | `4` | 16 |
| Button padding-x default (h-8) | `3` | 12 |
| Button padding-x sm (h-7) | `2.5` (10) | — dùng class arbitrary `px-2.5` |
| Input padding-x | `3` | 12 |
| Row padding-x table | `3` | 12 |
| Badge padding-x | `2` | 8 |

### 1.4 Border radius

| Token | Px | Usage |
|---|---|---|
| `rounded-sm` | **4** | Badge, chip, kbd key, tag |
| `rounded-md` | **6** | Button, input, select, textarea, card, popover, dropdown, tab |
| `rounded-lg` | **8** | Dialog, sheet, command palette, image thumb |
| `rounded-full` | 9999 | Avatar, status dot, toggle thumb, pill-badge (rare) |

**Bỏ `rounded-lg = 12px` V1** — remap xuống `8px` cho dialog/sheet. Button/input V1 dùng `rounded DEFAULT = 6px` → V2 rename thành `rounded-md` (vẫn 6px), giữ back-compat.

### 1.5 Elevation / Shadow

Ít shadow hơn V1 — dựa chủ yếu vào border zinc-200.

| Token | Value | Usage |
|---|---|---|
| `shadow-none` | `0 0 #0000` | Card default (chỉ border) |
| `shadow-xs` | `0 1px 2px rgba(0, 0, 0, 0.04)` | Card interactive hover, card link subtle |
| `shadow-sm` | `0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04)` | Popover, dropdown, tooltip |
| `shadow-md` | `0 4px 12px rgba(0, 0, 0, 0.06)` | Command palette, combobox dropdown |
| `shadow-lg` | `0 16px 48px rgba(0, 0, 0, 0.12)` | Dialog, sheet, modal full |
| `shadow-toast` | `0 8px 24px rgba(0, 0, 0, 0.10)` | Sonner toast |

**Pair shadow + border chuẩn V2:**

```css
/* Card default (no elevation) */
.card-default {
  border: 1px solid #E4E4E7;
  background: #FFFFFF;
  /* no shadow */
}

/* Card interactive (link card) */
.card-interactive:hover {
  border-color: #D4D4D8;
  box-shadow: 0 1px 2px rgba(0,0,0,0.05);
  transform: translateY(-1px);
  transition: all 150ms cubic-bezier(0.25, 1, 0.5, 1);
}

/* Popover */
.popover {
  border: 1px solid #E4E4E7;
  background: #FFFFFF;
  box-shadow: 0 2px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04);
  border-radius: 6px;
}

/* Dialog */
.dialog {
  border: 1px solid #E4E4E7;
  background: #FFFFFF;
  box-shadow: 0 16px 48px rgba(0,0,0,0.12);
  border-radius: 8px;
}
```

**Bỏ V1:** `shadow-dialog` double-drop (`0 20px 25px ... 0 8px 10px ...`) — V2 thay bằng single-layer `shadow-lg`. `shadow-scan-success/error` chuyển thành keyframe outer ring, không phải shadow token.

### 1.6 Motion

#### 1.6.1 Duration scale

| Token | ms | Usage |
|---|---|---|
| `duration-100` | 100 | Hover bg-color, button press scale, row hover |
| `duration-150` | 150 | Fade in/out, border-color transition, input focus glow |
| `duration-200` | 200 | Sheet slide, dialog open, popover, skeleton step |
| `duration-300` | 300 | Command palette open, large sheet slide |
| `duration-1200` | 1200 | Skeleton shimmer loop |

Bỏ V1 exotic: `duration-instant: 80ms`, `duration-slow: 320ms`, `duration-base: 200ms` alias (giữ `200` chuẩn Tailwind). Nếu code cũ dùng `duration-fast` → migration comment ghi chuyển sang `duration-150`.

#### 1.6.2 Easing

| Token | Value | Usage |
|---|---|---|
| `ease-out` | `cubic-bezier(0.16, 1, 0.3, 1)` | Fade out, subtle hover |
| `ease-out-quart` | `cubic-bezier(0.25, 1, 0.5, 1)` | **Default cho sheet/dialog/popover** (Linear signature) |
| `ease-in-out` | `cubic-bezier(0.4, 0, 0.2, 1)` | Transition bg/border đối xứng |
| `ease-in-soft` | `cubic-bezier(0.4, 0, 1, 1)` | Exit (slide-out, fade-out) |
| `linear` | `linear` | Shimmer loop |

#### 1.6.3 Keyframes V2

```css
/* Fade in/out — 150ms */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fade-out {
  from { opacity: 1; }
  to { opacity: 0; }
}

/* Slide-in-right — 200ms (sheet) */
@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0); opacity: 1; }
}
@keyframes slide-out-right {
  from { transform: translateX(0); opacity: 1; }
  to   { transform: translateX(100%); opacity: 0; }
}

/* Dialog scale + fade — 200ms */
@keyframes dialog-in {
  from { transform: scale(0.96); opacity: 0; }
  to   { transform: scale(1); opacity: 1; }
}
@keyframes dialog-out {
  from { transform: scale(1); opacity: 1; }
  to   { transform: scale(0.98); opacity: 0; }
}

/* Skeleton shimmer — 1200ms linear loop */
@keyframes shimmer-sm {
  from { background-position: -200% 0; }
  to   { background-position: 200% 0; }
}

/* Scan flash success — 400ms (giảm từ V1 600ms) */
@keyframes scan-flash-success {
  0%   { outline: 0 solid rgba(16, 185, 129, 0);     background-color: transparent; }
  30%  { outline: 3px solid rgba(16, 185, 129, 0.5); background-color: #ECFDF5; }
  100% { outline: 0 solid rgba(16, 185, 129, 0);     background-color: transparent; }
}

/* Scan flash danger — 400ms */
@keyframes scan-flash-danger {
  0%   { outline: 0 solid rgba(239, 68, 68, 0);     background-color: transparent; }
  30%  { outline: 3px solid rgba(239, 68, 68, 0.5); background-color: #FEF2F2; }
  100% { outline: 0 solid rgba(239, 68, 68, 0);     background-color: transparent; }
}

/* Shake — 300ms (giảm từ V1 240ms + biên độ ±4px giảm từ ±6px) */
@keyframes scan-shake-sm {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  50%      { transform: translateX(4px); }
  75%      { transform: translateX(-2px); }
}

/* Toast slide-up — 200ms */
@keyframes toast-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0); opacity: 1; }
}
```

#### 1.6.4 Hover/press micro rules

```css
/* Card interactive hover */
.card-interactive {
  transition: transform 150ms cubic-bezier(0.25, 1, 0.5, 1),
              box-shadow 150ms cubic-bezier(0.25, 1, 0.5, 1),
              border-color 100ms ease-out;
}
.card-interactive:hover {
  transform: translateY(-1px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border-color: #D4D4D8;
}

/* Button press */
.button-press {
  transition: transform 100ms ease-out,
              background-color 100ms ease-out;
}
.button-press:active {
  transform: scale(0.98);
}

/* Input focus */
.input-focus {
  transition: border-color 150ms ease-out,
              outline-color 150ms ease-out;
}
.input-focus:focus-visible {
  border-color: #3B82F6;
  outline: 2px solid #3B82F6;
  outline-offset: 0;
}

/* Row hover (table) */
.row-hover {
  transition: background-color 100ms ease-out;
}
.row-hover:hover {
  background-color: #FAFAFA;
}
```

### 1.7 Tailwind config V2 — diff cụ thể

Patch trên file `apps/web/tailwind.config.ts` (replace V1):

```ts
import type { Config } from "tailwindcss";

export default {
  darkMode: ["class", '[data-theme="dark"]'], // Reserve V2.1
  content: ["./src/**/*.{ts,tsx,mdx}", "./src/components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Neutral (zinc — replace slate V1)
        zinc: {
          50:  "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },

        // Primary accent (blue — electric blue Linear-style)
        blue: {
          50:  "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },

        // Semantic
        emerald: {
          50:  "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
        },
        amber: {
          50:  "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },
        red: {
          50:  "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
        },
        sky: {
          50:  "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
        },

        // Safety-orange — SHORTAGE SEMANTIC ONLY
        orange: {
          50:  "#FFF7ED",
          200: "#FED7AA",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
        },

        // Aliases V2
        "accent": {
          DEFAULT: "#3B82F6",
          hover:   "#2563EB",
          press:   "#1D4ED8",
          soft:    "#EFF6FF",
          ring:    "rgba(59, 130, 246, 0.35)",
        },
        "shortage": {
          DEFAULT: "#F97316",
          soft:    "#FFF7ED",
          strong:  "#C2410C",
        },

        // Scrims
        "overlay-scrim": "rgba(0, 0, 0, 0.5)",
        "overlay-sheet": "rgba(0, 0, 0, 0.4)",

        // Legacy aliases (migration back-compat, remove in commit 11)
        slate: { /* same as zinc for drop-in migration */ },
        brand: { DEFAULT: "#18181B", ink: "#18181B" },
        cta: { DEFAULT: "#3B82F6", hover: "#2563EB", press: "#1D4ED8", soft: "#EFF6FF" },
      },

      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Inter", "ui-sans-serif", "system-ui"], // alias, same as sans V2
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "monospace"],
      },

      fontSize: {
        // V2 scale (smaller than V1)
        xs:    ["0.6875rem", { lineHeight: "0.875rem" }],  // 11/14
        sm:    ["0.75rem",   { lineHeight: "1rem" }],       // 12/16
        base:  ["0.8125rem", { lineHeight: "1.125rem" }],   // 13/18
        md:    ["0.875rem",  { lineHeight: "1.25rem" }],    // 14/20
        lg:    ["0.9375rem", { lineHeight: "1.25rem" }],    // 15/20
        xl:    ["1.0625rem", { lineHeight: "1.5rem" }],     // 17/24
        "2xl": ["1.25rem",   { lineHeight: "1.75rem" }],    // 20/28
        "3xl": ["1.5rem",    { lineHeight: "2rem" }],       // 24/32
        "4xl": ["1.75rem",   { lineHeight: "2rem" }],       // 28/32
        "5xl": ["2.5rem",    { lineHeight: "2.75rem" }],    // 40/44 (TV mode)
      },

      spacing: {
        // V2 scale — 9 values (replace V1 fractional)
        0:  "0",
        1:  "0.25rem",  // 4
        2:  "0.5rem",   // 8
        3:  "0.75rem",  // 12
        4:  "1rem",     // 16
        5:  "1.25rem",  // 20
        6:  "1.5rem",   // 24
        7:  "1.75rem",  // 28 (sidebar nav row)
        8:  "2rem",     // 32
        9:  "2.25rem",  // 36 (form input / list row)
        10: "2.5rem",   // 40
        11: "2.75rem",  // 44 (PWA touch)
        12: "3rem",     // 48
        14: "3.5rem",   // 56 (mobile topbar)
        16: "4rem",     // 64
        20: "5rem",     // 80
        24: "6rem",     // 96
        60: "15rem",    // 240 (sidebar mobile drawer)
      },

      borderRadius: {
        none: "0",
        sm:   "4px",
        DEFAULT: "6px", // button, input default
        md:   "6px",
        lg:   "8px",    // dialog, sheet
        full: "9999px",
      },

      boxShadow: {
        xs:    "0 1px 2px rgba(0, 0, 0, 0.04)",
        sm:    "0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04)",
        md:    "0 4px 12px rgba(0, 0, 0, 0.06)",
        lg:    "0 16px 48px rgba(0, 0, 0, 0.12)",
        toast: "0 8px 24px rgba(0, 0, 0, 0.10)",
        // Legacy aliases for back-compat
        pop: "0 4px 12px rgba(0, 0, 0, 0.06)",
        dialog: "0 16px 48px rgba(0, 0, 0, 0.12)",
      },

      zIndex: {
        base: "0",
        sticky: "10",
        sidebar: "20",
        topbar: "30",
        dropdown: "40",
        "command-palette": "50",
        dialog: "60",
        popover: "65",
        toast: "70",
        "skip-link": "80",
      },

      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        "out":       "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-soft":   "cubic-bezier(0.4, 0, 1, 1)",
        // Back-compat
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        snap:       "cubic-bezier(0.25, 1, 0.5, 1)",
      },

      transitionDuration: {
        100:  "100ms",
        150:  "150ms",
        200:  "200ms",
        300:  "300ms",
        1200: "1200ms",
        // Back-compat
        fast: "150ms",
        base: "200ms",
      },

      keyframes: {
        "fade-in":  { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "slide-in-right":  {
          from: { transform: "translateX(100%)", opacity: "0" },
          to:   { transform: "translateX(0)",    opacity: "1" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)",    opacity: "1" },
          to:   { transform: "translateX(100%)", opacity: "0" },
        },
        "dialog-in":  {
          from: { transform: "scale(0.96)", opacity: "0" },
          to:   { transform: "scale(1)",    opacity: "1" },
        },
        "dialog-out": {
          from: { transform: "scale(1)",    opacity: "1" },
          to:   { transform: "scale(0.98)", opacity: "0" },
        },
        "shimmer-sm": {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
        "scan-flash-success": {
          "0%":   { outline: "0 solid rgba(16, 185, 129, 0)",     backgroundColor: "transparent" },
          "30%":  { outline: "3px solid rgba(16, 185, 129, 0.5)", backgroundColor: "#ECFDF5" },
          "100%": { outline: "0 solid rgba(16, 185, 129, 0)",     backgroundColor: "transparent" },
        },
        "scan-flash-danger": {
          "0%":   { outline: "0 solid rgba(239, 68, 68, 0)",     backgroundColor: "transparent" },
          "30%":  { outline: "3px solid rgba(239, 68, 68, 0.5)", backgroundColor: "#FEF2F2" },
          "100%": { outline: "0 solid rgba(239, 68, 68, 0)",     backgroundColor: "transparent" },
        },
        "scan-shake-sm": {
          "0%,100%": { transform: "translateX(0)" },
          "25%":     { transform: "translateX(-4px)" },
          "50%":     { transform: "translateX(4px)" },
          "75%":     { transform: "translateX(-2px)" },
        },
        "toast-slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to:   { transform: "translateY(0)",    opacity: "1" },
        },
      },

      animation: {
        "fade-in":        "fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out":       "fade-out 150ms cubic-bezier(0.4, 0, 1, 1)",
        "slide-in-right": "slide-in-right 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        "slide-out-right":"slide-out-right 200ms cubic-bezier(0.4, 0, 1, 1)",
        "dialog-in":      "dialog-in 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        "dialog-out":     "dialog-out 150ms cubic-bezier(0.4, 0, 1, 1)",
        "shimmer":        "shimmer-sm 1200ms linear infinite",
        "scan-flash-success": "scan-flash-success 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
        "scan-flash-danger":  "scan-flash-danger 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
        "scan-shake":     "scan-shake-sm 300ms cubic-bezier(0.4, 0, 0.2, 1) 1",
        "toast-slide-up": "toast-slide-up 200ms cubic-bezier(0.25, 1, 0.5, 1)",
      },

      screens: {
        sm:   "375px",
        md:   "768px",
        lg:   "1024px",
        xl:   "1280px",
        "2xl":"1536px",
        tv:   "1920px",
      },

      gridTemplateColumns: {
        "dense-12": "repeat(12, minmax(0, 1fr))",
        "tv-6":     "repeat(6, minmax(0, 1fr))",
        "shell":    "220px 1fr", // AppShell grid
        "shell-collapsed": "0 1fr", // mobile
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("tailwindcss-animate"),
  ],
} satisfies Config;
```

### 1.8 `globals.css` V2 — replace

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

/* ============================================================
 * V2 CSS custom properties — Linear-inspired zinc + blue
 * Reserve dark mode via [data-theme="dark"] — NO toggle V2.0
 * ============================================================ */
@layer base {
  :root {
    /* Background layers */
    --bg-page:   #FAFAFA;
    --bg-card:   #FFFFFF;
    --bg-muted:  #F4F4F5;
    --bg-hover:  #F4F4F5;
    --bg-elevated: #FFFFFF;

    /* Borders */
    --border-subtle: #E4E4E7;
    --border-strong: #D4D4D8;
    --border-focus:  #3B82F6;

    /* Text */
    --text-primary:     #18181B;
    --text-secondary:   #3F3F46;
    --text-muted:       #71717A;
    --text-placeholder: #A1A1AA;
    --text-inverse:     #FAFAFA;
    --text-link:        #2563EB;

    /* Accent */
    --accent:        #3B82F6;
    --accent-hover:  #2563EB;
    --accent-press:  #1D4ED8;
    --accent-soft:   #EFF6FF;
    --accent-ring:   rgba(59, 130, 246, 0.35);

    /* Semantic */
    --success:        #10B981;
    --success-strong: #047857;
    --success-soft:   #ECFDF5;
    --warning:        #F59E0B;
    --warning-strong: #B45309;
    --warning-soft:   #FFFBEB;
    --danger:         #EF4444;
    --danger-strong:  #B91C1C;
    --danger-soft:    #FEF2F2;
    --info:           #0EA5E9;
    --info-strong:    #0369A1;
    --info-soft:      #F0F9FF;
    --shortage:       #F97316;
    --shortage-strong:#C2410C;
    --shortage-soft:  #FFF7ED;

    /* Layout geometry */
    --sidebar-width:    13.75rem; /* 220px — giảm từ V1 240px */
    --topbar-height:    2.75rem;  /* 44px — giảm từ V1 56px */
    --content-max-width:1440px;
    --page-padding-x:   1.5rem;   /* 24px */
    --page-padding-y:   1.25rem;  /* 20px */

    /* Focus ring */
    --focus-ring:       2px solid #3B82F6;
    --focus-ring-offset:2px;
    --focus-ring-pwa:   3px solid #2563EB;
  }

  /* Dark mode reserve — NOT ACTIVATED V2.0 */
  [data-theme="dark"] {
    --bg-page:   #09090B;
    --bg-card:   #18181B;
    --bg-muted:  #27272A;
    --border-subtle: #27272A;
    --border-strong: #3F3F46;
    --text-primary:   #FAFAFA;
    --text-secondary: #D4D4D8;
    --text-muted:     #A1A1AA;
    --accent:       #60A5FA;
    --accent-hover: #93C5FD;
    --accent-press: #3B82F6;
    --accent-soft:  #172554;
  }

  html {
    font-family: "Inter", ui-sans-serif, system-ui, -apple-system, sans-serif;
    font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1;
    font-size: 16px; /* base for rem calc; actual body = 13px (text-base) */
    background: var(--bg-page);
    color: var(--text-primary);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    text-rendering: optimizeLegibility;
  }

  body {
    @apply min-h-screen bg-zinc-50 text-zinc-900 text-base leading-[1.4];
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: "Inter", ui-sans-serif, system-ui, sans-serif;
    @apply text-zinc-900 tracking-tight;
  }

  h1 { @apply text-2xl font-semibold leading-tight; }   /* 20px */
  h2 { @apply text-xl font-semibold leading-snug; }     /* 17px */
  h3 { @apply text-lg font-semibold leading-snug; }     /* 15px */
  h4 { @apply text-md font-semibold; }                  /* 14px */
  h5 { @apply text-base font-semibold; }                /* 13px */
  h6 { @apply text-xs font-medium uppercase tracking-wide; } /* 11px */

  /* Focus visible — CSS outline thay box-shadow V1 */
  :focus { outline: none; }
  :focus-visible {
    outline: 2px solid var(--border-focus);
    outline-offset: 2px;
    border-radius: 6px;
  }

  /* PWA focus override */
  [data-route="pwa"] :focus-visible {
    outline: 3px solid var(--accent-hover);
    outline-offset: 2px;
  }

  /* Reduced motion */
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 1ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 1ms !important;
      scroll-behavior: auto !important;
    }
  }
}

/* ============================================================
 * Component utilities
 * ============================================================ */
@layer components {
  /* Skip link WCAG 2.4.1 */
  .skip-link {
    @apply absolute left-2 top-2 z-[80] -translate-y-20 rounded-md bg-zinc-900 px-3 py-1.5 text-sm text-white transition-transform focus:translate-y-0;
  }

  /* Skeleton shimmer */
  .skeleton {
    @apply relative overflow-hidden rounded-md bg-zinc-100;
    background-image: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.5) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer-sm 1200ms linear infinite;
  }

  /* Tabular numbers */
  .tabular-nums {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1, "cv11" 1, "ss01" 1;
  }

  /* Mono number cell */
  .mono-num {
    font-family: "JetBrains Mono", ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }

  /* Scan feedback — PWA */
  .scan-row-current {
    @apply border-l-2 border-orange-500 bg-orange-50/60;
  }
  .scan-flash-success {
    animation: scan-flash-success 400ms cubic-bezier(0.25, 1, 0.5, 1) 1;
  }
  .scan-flash-danger {
    animation: scan-flash-danger 400ms cubic-bezier(0.25, 1, 0.5, 1) 1;
  }
  .scan-shake {
    animation: scan-shake-sm 300ms cubic-bezier(0.4, 0, 0.2, 1) 1;
  }

  /* Card interactive hover */
  .card-interactive {
    @apply border border-zinc-200 bg-white transition-all duration-150 ease-[cubic-bezier(0.25,1,0.5,1)];
  }
  .card-interactive:hover {
    @apply border-zinc-300 shadow-xs;
    transform: translateY(-1px);
  }

  /* Row hover (tables) */
  .row-hover {
    @apply transition-colors duration-100 ease-out;
  }
  .row-hover:hover {
    @apply bg-zinc-50;
  }
  .row-selected {
    @apply bg-blue-50 border-l-2 border-blue-500;
  }
}

/* ============================================================
 * Reduced motion override
 * ============================================================ */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none !important;
    background: var(--bg-muted) !important;
  }
  .scan-flash-success,
  .scan-flash-danger,
  .scan-shake {
    animation: none !important;
  }
}
```

---

## §2. Screen specs (8 màn)

Mỗi màn cấu trúc: Layout grid breakpoint-specific px, ASCII wireframe V2 đa state, Component tree, Interactions/shortcuts, Acceptance criteria, Font/density spec cụ thể.

---

### 2.1 `/login` — Login page (split 50/50 refined)

**Route:** `apps/web/src/app/login/page.tsx`
**Breakpoints:**
- Mobile (< 768px): single column, form 100% width, hero hidden
- Tablet (768-1023px): split 40/60 (hero shrink, form rộng)
- Desktop (≥ 1024px): split 50/50 max-width 1440px

**Grid desktop (1440px viewport):**
```
+-- viewport 1440px -------------------------------+
| LEFT hero panel 720px    | RIGHT form panel 720px|
|  gradient zinc-50→blue-50|  bg-white              |
|  padding 64px all        |  flex center           |
|  max content-w 480px     |  max form-w 400px      |
+--------------------------+------------------------+
```

**ASCII wireframe — POPULATED state:**
```
+------------------------------------+------------------------------------+
| [LOGO 32px]                        |                                    |
|                                    |       MES XUONG CO KHI             |
|                                    |       ----------------             |
| Quan ly BOM - Theo doi             |                                    |
| ton kho - Thu mua                  |   Email / Username                 |
| [h1 20px weight 600]               |   +-----------------------------+  |
|                                    |   | admin                       |  |
| Toi uu workflow xuong              |   +-----------------------------+  |
| co khi 2-10 nguoi tu               |                                    |
| don hang den giao hang.            |   Mat khau                         |
| [body 15px zinc-600]               |   +-----------------------------+  |
|                                    |   | ........             [eye]  |  |
| [SVG line-art CNC manh             |   +-----------------------------+  |
|  stroke 1.5 zinc-400               |                                    |
|  max-w 320px]                      |   +-----------------------------+  |
|                                    |   |       Dang nhap             |  |
|                                    |   +-----------------------------+  |
|                                    |                                    |
|                                    |   Quen mat khau? [text-xs blue-600]|
|                                    |                                    |
| v1.0.0 - build a3f2b [11px mono]   |                     2026 Song Chau |
+------------------------------------+------------------------------------+
```

**ASCII wireframe — LOADING (submit button loading):**
```
|   +-----------------------------+  |
|   | [spinner 14px] Dang dang... |  |  button disabled, bg blue-500
|   +-----------------------------+  |  spinner left, text center
```

**ASCII wireframe — ERROR state:**
```
|   Mat khau                         |
|   +-----------------------------+  |  border red-500, bg red-50/30
|   | ....                  [eye] |  |
|   +-----------------------------+  |
|   [!] Tai khoan hoac mat khau sai  |  text-xs red-700 icon 12px
|                                    |
|   +-----------------------------+  |
|   |       Dang nhap             |  |  button primary re-enabled
|   +-----------------------------+  |
```

**ASCII wireframe — EMPTY (first hydration):**
Form panel hiển thị 2 skeleton input h-9 + skeleton button h-9 full-width, tổng skeleton height ~180px, shimmer 1200ms loop.

**Component tree:**
```
<LoginPage>
  <LoginHero>        // left 50%, gradient bg, logo + tagline + SVG
  <LoginForm>        // right 50%, centered max-w-[400px]
    <LoginHeader>    // "MES XUONG CO KHI" + subtitle
    <LoginInput name="username" />  // h-9, text-base, label 13px
    <LoginInput name="password" type="password" />
    <Button type="submit" size="default" variant="primary" full-width />
    <LoginLinks>     // "Quen mat khau?"
    <BuildInfo />    // 11px mono footer
```

**Interactions/shortcuts:**
- `Tab`: focus order username → password → show/hide → submit → forgot-link
- `Enter` trong input: submit form
- Auto-focus username khi page load (attribute `autofocus`)
- Show/hide password: click icon eye → toggle type
- Submit: POST `/api/auth/login`, success → redirect dashboard, fail → error inline 12px red-700 under input

**Acceptance criteria (8):**
1. Body font 13px (text-base), heading hero 20px (text-2xl, giảm từ V1 30px)
2. Input h-9 (36px), button h-9 (36px) — không h-10/12 V1
3. Tagline h1 20px weight 600 (text-2xl)
4. Gradient hero `linear-gradient(135deg, zinc-50 0%, blue-50 100%)`
5. SVG line-art CNC stroke 1.5 zinc-400 max-w 320px (refine từ V1 illustration dày)
6. Focus ring CSS outline 2px blue-500 offset 2px (không box-shadow)
7. Mobile (< 768px): hero hidden, form 100% padding-x 24px
8. Vietnamese diacritics render đúng với Inter subset vietnamese

**Font/density spec:**
- Hero logo: 32px SVG
- Hero h1 tagline: text-2xl (20px) weight 600 line-height 28px zinc-900
- Hero supporting text: text-lg (15px) leading-normal zinc-600 max-w-md
- Form header: text-2xl (20px) weight 600 tracking-tight
- Form label: text-base (13px) weight 500 zinc-900 margin-b 6px
- Input: h-9 (36px) text-base (13px) padding-x 12px rounded-md border-zinc-200
- Button submit: h-9 (36px) text-base (13px) weight 500 full-width bg-blue-500 hover:bg-blue-600
- Forgot link: text-sm (12px) text-blue-600 hover:text-blue-700 underline-offset-2
- Build info: text-xs (11px) font-mono zinc-400
- Vertical gap giữa input: 16px (gap-4)

---

### 2.2 `/` — Dashboard (compact KPI + readiness table)

**Route:** `apps/web/src/app/(app)/page.tsx`
**Breakpoints:**
- Mobile: 1-column, KPI stack
- Tablet: 2-col grid KPI, main full-width
- Desktop (≥ 1024px): 12-column grid, KPI span-3 x 4, main span-8 + sidebar-right span-4

**Grid desktop (1280px viewport, sidebar 220px, content 1060px):**
```
+-- content 1060px (padding-x 24px -> inner 1012px) -------+
| H1 "Tong quan van hanh" + action bar           h=28px    |
| [gap 16px]                                               |
| KPI Grid: 4 cols x span-3 (each ~237px)       h=72px each|
|   [KPI1] [KPI2] [KPI3] [KPI4]                            |
| [gap 16px]                                               |
| Main row split 8/4:                                      |
| +-- OrdersReadinessTable span-8 --+-- AlertsList span-4 -+|
| |  padding 16px                   |  padding 16px        ||
| |  table rows 36px x 8            |  alerts 48px x 5     ||
| |  max 10 rows visible            |  scroll to 10        ||
| +---------------------------------+----------------------+|
| [gap 16px]                                               |
| SystemHealthCard span-12  h=72px                          |
+----------------------------------------------------------+

Total above-fold (1080p): 32 + 16 + 28 + 16 + 72 + 16 + 288 + 16 + 72 = ~728px
-> fit viewport 1080p (content area ~960px available).
```

**ASCII — POPULATED:**
```
+--------------------------------------------------------------+
| Tong quan van hanh                   [+ Tao don moi]          | h1 20px + btn h-8
+--------------------------------------------------------------+
| +----------++----------++----------++----------+             |
| | DON MO   || TON TRAN || NHAP/TUAN|| SHORTAGE |             | label 11px uppercase
| | 42       || 18       || 96       || 3        |             | value 22px weight 500
| | +3 tuan  || -2       || +12%     || critical |             | delta 12px mono
| +----------++----------++----------++----------+             |
|                                                              |
| +-- Don hang san sang ---------+-- Canh bao -----------+    |
| | SO      KH       %READY Stt  | PO-024 tre 2 ngay     |    |
| | SO-089  Dien Co  100%  RDY   | BOM-315 xung dot      |    |
| | SO-090  Tan Tien  85%  PART  | SKU M6-20 thieu 30    |    |
| | SO-091  Cam Pha   40%  SHRT  | Ton duoi min: 5 SKU   |    |
| | SO-092  Dong Hai 100%  RDY   | Tai khoan lock x2     |    |
| | ...    row 36px x 8 total    |                       |    |
| +------------------------------+-----------------------+    |
|                                                              |
| +-- Tinh trang he thong --------------------------------+    |
| | * DB 12ms  * Redis 2ms  * Worker 0 job  Last sync 18s |    | dots 8px
| +-------------------------------------------------------+    |
+--------------------------------------------------------------+
```

**ASCII — LOADING:**
- 4 KPI skeleton 72px tall, label line 80px × 11px + value line 60px × 22px + delta line 40px × 12px
- Table skeleton: 1 header row + 8 body rows h-9 (each row 4 cell skeleton)
- Alerts skeleton: 5 items 48px, dot + text line 180px

**ASCII — EMPTY (no data):**
```
+----------------------------------------------------------+
| Tong quan van hanh                 [+ Tao don moi]        |
+----------------------------------------------------------+
| 4 KPI cards (all 0 or dash "-")                          |
+----------------------------------------------------------+
|                                                          |
|          [Icon 32px inbox zinc-400]                      |
|          Chua co du lieu                                 |  14px weight 500
|          Tao don hang dau tien de bat dau theo doi       |  12px zinc-500 max-w 320
|          [+ Tao don moi] [button sm ghost]               |  h-7 ghost
|          Height tong 140px                                |
+----------------------------------------------------------+
```

**ASCII — ERROR (dashboard 500):**
```
+----------------------------------------------------------+
| [!] Khong tai duoc du lieu                               | red-700 text
|     May chu khong phan hoi. [Thu lai]                    | 12px helper
|     Ma loi: DASH_500_QUERY_FAIL [11px mono zinc-500]     |
+----------------------------------------------------------+
```

**Component tree:**
```
<DashboardPage>
  <PageHeader title="Tong quan van hanh" action={<CreateOrderButton />} />
  <KpiGrid cols={4}>
    <KpiCard label="DON MO" value={42} delta="+3 tuan" icon={<ShoppingCart />} />
    <KpiCard label="TON TRAN" value={18} delta="-2" status="warning" />
    <KpiCard label="NHAP/TUAN" value={96} delta="+12%" status="success" />
    <KpiCard label="SHORTAGE" value={3} status="critical" />   // text-red-600
  </KpiGrid>
  <DashboardMainRow>
    <OrdersReadinessTable span={8} />
    <AlertsList span={4} />
  </DashboardMainRow>
  <SystemHealthCard />
```

**Interactions/shortcuts:**
- `Ctrl+K`: open command palette
- `j/k`: nav xuống/lên alert list khi focus (future V2.1)
- KPI click → drill-down (future V2.1 enable)
- "Tao don moi" → `/orders/new` (future route; V2.0 disabled với tooltip "Sap co")

**Acceptance criteria (7):**
1. H1 page title 20px weight 600 (text-2xl), line-height 28px
2. KPI card height 72px min (không 112px V1), padding 16px (không 24px V1)
3. KPI value 22px weight 500 (không 36px bold V1), label 11px uppercase
4. KPI card không còn border-l-4 color stripe V1 — chỉ `text-red-600` khi critical
5. Table row 36px (không 48px V1), no zebra (border-b zinc-100 only)
6. Total above-fold ≤ 750px tại viewport 1080p (fit màn Dell 24" đứng)
7. Section gap 16px (space-y-4), page padding 24px x / 20px y

**Font/density spec:**
- H1 page: text-2xl (20px) weight 600 tracking-tight zinc-900
- Action button header: h-8 (32px) text-base (13px) weight 500 bg-blue-500
- KPI card padding: 16px (p-4), border border-zinc-200 rounded-md bg-white
- KPI label: text-xs (11px) weight 500 uppercase tracking-wide zinc-500
- KPI value: text-[22px] arbitrary weight 500 tabular-nums
- KPI delta: text-sm (12px) font-mono zinc-500 (hoặc text-emerald-600 / text-red-600 khi colored)
- Table header row: text-sm (12px) weight 500 uppercase tracking-wide zinc-500 h-9
- Table body row: text-base (13px) zinc-900 h-9
- Alert item: text-base (13px) weight 500 title + text-xs (11px) meta zinc-500
- SystemHealth: text-base (13px) + status dot 8px

---

### 2.3 `(app)/layout` — AppShell (Sidebar 220 + TopBar 44)

**File:** `apps/web/src/app/(app)/layout.tsx` + `components/layout/app-shell.tsx`

**Grid layout:**
```
Desktop (>= 1024px):
+-- viewport full-width -------------------------------+
| Sidebar 220px fixed   | TopBar 44px fixed top-0      |
|                       +-- Main content 1fr ---------+|
|                       |  padding-x 24, padding-y 20 ||
|                       |  max-w 1440 center          ||
+-----------------------+-----------------------------+

Mobile (< 768px):
+-- viewport full --------+
| TopBar 56px fixed full  |  burger menu button
| Main full width         |
|  padding-x 16           |
+-------------------------+
Sidebar: slide-in overlay drawer 280px when burger clicked
```

**ASCII wireframe desktop:**
```
+--------+--------------------------------------------------+
| [LOGO] | Tong quan / [CmdK Tim nhanh]  [Bell3] [avatar]    | topbar 44px
|  MES   +--------------------------------------------------+
|--------|                                                  |
| Tong q |                                                  |
| Items  |              Main content                        |
| NCC    |                                                  |
| Nhap   |            padding-x 24, padding-y 20             |
| Cai dat|                                                  |
|        |                                                  |
|--------|                                                  |
| User v |                                                  |
| admin  |                                                  |
+--------+--------------------------------------------------+
```

**Component tree:**
```
<AppShell>
  <Sidebar>       // 220px fixed desktop, overlay mobile
    <SidebarLogo />     // 48px header, logo + app name
    <SidebarNav>
      <NavItem icon={Grid} label="Tong quan" href="/" />
      <NavItem icon={Package} label="Items" href="/items" />
      <NavItem icon={Handshake} label="Nha cung cap" href="/suppliers" />
      <NavItem icon={Inbox} label="Nhap kho" href="/pwa/receive" />
      <NavItem icon={Settings} label="Cai dat" href="/settings" />
    </SidebarNav>
    <SidebarFooter>     // user menu trigger
      <UserMenu />
    </SidebarFooter>
  </Sidebar>
  <TopBar>        // 44px sticky
    <Breadcrumb />
    <CommandPaletteHint />  // "CmdK Tim nhanh" text 12px zinc-500
    <NotificationBell />
    <UserAvatar />
  </TopBar>
  <main>{children}</main>
  <CommandPalette />  // portal mounted
```

**Interactions/shortcuts:**
- `Ctrl+K` / `Cmd+K`: open CommandPalette
- Mobile: hamburger button → slide Sidebar drawer (animation 200ms slide-in-right mirror)
- Click outside drawer → close
- Active nav item: URL match → `bg-blue-50 text-blue-700 + border-l-2 border-blue-500`
- Escape: close sidebar drawer mobile

**Acceptance criteria (7):**
1. Sidebar 220px fixed desktop (không 240px V1), không rail-collapsed 56px
2. TopBar 44px height desktop (không 56px V1), mobile 56px
3. Logo area 48px height (không 56px V1)
4. Nav item h-7 (28px) padding-x 12px, icon 16px, text 13px weight 500
5. Active nav: bg-blue-50 text-blue-700 + border-l-2 blue-500 (không orange V1)
6. Mobile drawer 280px slide-in 200ms ease-out-quart
7. Total top-left dead corner = 44 × 220 = vừa đủ logo + app name

**Font/density spec:**
- Logo text "MES Xuong": text-base (13px) weight 600 zinc-900
- Nav item: h-7 (28px), padding-x 12px, gap 8px icon-text
- Nav item icon: 16px (lucide-react) zinc-500 (default) hoặc zinc-900 (active)
- Nav item label: text-base (13px) weight 500 (inactive zinc-700, active zinc-900)
- Nav section header (nếu grouping sau): text-xs (11px) uppercase tracking-wide zinc-500 padding-y 8px padding-x 12px
- TopBar breadcrumb: text-base (13px) zinc-500 (parent) + zinc-900 (last)
- TopBar cmdk hint: text-sm (12px) zinc-500 + kbd 11px bg-zinc-100 rounded-sm padding 2px 6px
- User avatar: 28px rounded-full border zinc-200
- Notification badge: 16px rounded-full bg-red-500 text-white text-xs (11px) tabular-nums

---

### 2.4 `(app)/items` — Item List (D3 compact)

**Route:** `apps/web/src/app/(app)/items/page.tsx`
**Breakpoints:**
- Mobile: card stack (1 item = 1 card h-auto padding 12)
- Tablet: card grid 2-col hoặc table fallback với horizontal scroll
- Desktop: full table 7-8 columns

**Grid desktop (1440 viewport, sidebar 220, content 1220 padding-x 24 → inner 1172):**
```
+-- inner 1172px ----------------------------------------------+
| PageHeader h-9: H1 "Items" + Action "+ Item moi"             |
| [gap 16]                                                     |
| FilterBar h-9 sticky top-11:                                 |
|   [search w-64 h-8] [Loai v] [NCC v] [Stt v] [Clear]         |
| [gap 16]                                                     |
| Table:                                                       |
|  +-- header h-9 -----------------------------------------+  |
|  | [ ] | SKU        | Ten          | Loai | Ton | Stt |... | |
|  +-----+------------+--------------+------+-----+-----+---+ |
|  | [x] | M6-20     | Bulon M6x20  | Raw  | 125 | OK  | . | h-9 |
|  | [ ] | M8-30     | Bulon M8x30  | Raw  |  34 | Low | . | h-9 |
|  | [ ] | ASM-001   | Khung CNC A  | Asm  |  12 | OK  | . | h-9 |
|  | ...                                                       | |
|  +---------------------------------------------------------+ |
| [gap 16]                                                     |
| Pagination h-9: "1-30 / 245"  [< 1 2 3 ... 9 >]              |
+--------------------------------------------------------------+

BulkActionBar (sticky bottom khi selected > 0):
  h-12 bg-zinc-950 text-white padding-x 16, slide-up 200ms
  "3 muc da chon"  [Xuat Excel] [Xoa] [Bo chon]  [x]
```

**ASCII — POPULATED:**
```
+-----------------------------------------------------------------+
| Items                                         [+ Item moi]       | h1 20px
+-----------------------------------------------------------------+
| [Tim SKU/Ten              ] [Loai v] [NCC v] [Status v]  Clear   | filter bar h-9
+-----------------------------------------------------------------+
| [ ] SKU       Ten                 Loai  Ton   Trang    .        | header h-9
| [x] M6-20    Bulon M6x20          Raw   125   OK       .        | selected bg-blue-50
| [ ] M8-30    Bulon M8x30          Raw    34   Low      .        | hover bg-zinc-50
| [ ] ASM-001  Khung CNC A          Asm    12   OK       .        |
| [ ] M6-15    Bulon M6x15          Raw     0   Shortage .        | bg-orange-50 border-l
| [ ] ...                                                          |
|                                                                 |
| 1-30 / 245                       [< 1 2 3 4 ... 9 >]            | pagination h-9
+-----------------------------------------------------------------+

+--- BulkActionBar sticky bottom ---------------------------------+
| 3 muc da chon    [Xuat Excel] [Xoa]  [Bo chon]          [x]     | zinc-950 bg
+-----------------------------------------------------------------+
```

**ASCII — LOADING (first load):**
- Table skeleton: header row h-9 + 10 rows h-9 skeleton (each row 6 cell skeleton staggered 50ms)
- Filter bar: render real (instant)
- Pagination placeholder h-9 skeleton

**ASCII — EMPTY (no items matching filter):**
```
+---------------------------------------------------------+
|                                                         |
|              [Icon 32px Search zinc-400]                |
|              Khong tim thay item nao                    |  14px weight 500
|              Thu xoa bo loc hoac tim tu khoa khac       |  12px zinc-500
|              [Xoa bo loc]  h-7 ghost sm                 |
|                                                         |
+---------------------------------------------------------+
height 160px, centered
```

**ASCII — EMPTY (no items at all):**
```
|              [Icon 32px Package zinc-400]               |
|              Chua co item nao                           |
|              Tao item moi hoac import Excel             |
|              [+ Item moi]  [Import Excel]               |  2 button h-7 ghost gap-2
```

**ASCII — ERROR:**
```
|  [!] Khong tai duoc danh sach items                     |  red-700
|      [Thu lai]  Ma loi ITM_FETCH_500                    |
```

**Component tree:**
```
<ItemsPage>
  <PageHeader title="Items" action={<Button>+ Item moi</Button>} />
  <FilterBar sticky top-11>
    <SearchInput />
    <FilterSelect label="Loai" />
    <FilterSelect label="NCC" />
    <FilterSelect label="Status" />
    <ClearFiltersButton />
  </FilterBar>
  <ItemListTable>
    <TableHeader />
    <TableBody>{items.map(<ItemRow />)}</TableBody>
  </ItemListTable>
  <Pagination />
  <BulkActionBar visible={selected > 0} />  // portal sticky bottom
```

**Interactions/shortcuts (preserve V1 logic):**
- `/`: focus search input
- `j` / `k`: next / prev row (highlight, scroll if offscreen)
- `Space`: toggle select on focused row
- `e`: edit focused row (navigate `/items/{id}/edit`)
- `Enter`: open detail
- `Shift+click` row checkbox: range-select
- `Ctrl+A` (khi focus trong table): select all visible
- `Esc`: clear selection, close filter dropdown

**Acceptance criteria (8):**
1. Row height 36px (h-9), không 48px V1
2. No zebra stripe, border-b zinc-100 1px only
3. Row hover bg-zinc-50 transition 100ms
4. Row selected bg-blue-50 + border-l-2 blue-500 (không V1 orange)
5. Row shortage (stock < safety): bg-orange-50 + border-l-2 orange-500 (preserve shortage semantic)
6. Sticky filter bar top-11 (below topbar 44), h-9 padding 8px
7. BulkActionBar bottom h-12 bg-zinc-950 (không 56px V1)
8. Pagination h-9, text 13px, button h-7 icon-only

**Font/density spec:**
- H1 page: text-2xl (20px) weight 600
- Action button "+ Item moi": h-8 (32px) text-base (13px) weight 500 bg-blue-500
- FilterBar container: h-9 (36px) padding 8px bg-white border border-zinc-200 rounded-md sticky top-11 z-sticky
- Search input: h-8 (32px) w-64 text-base (13px) padding-l 28px icon-left 14px
- Filter select: h-8 (32px) text-base (13px) padding-x 10px chevron 14px
- Clear button: text-sm (12px) text-blue-600 ml-auto
- Table header row: h-9 sticky top-[calc(44px+48px)] bg-white border-b-zinc-200 text-sm (12px) uppercase tracking-wide weight 500 zinc-500
- Table body row: h-9 text-base (13px) zinc-900 border-b-zinc-100
- SKU cell: font-mono text-sm (12px) zinc-700 width 128px (w-32)
- Name cell: text-base (13px) truncate + Tooltip on overflow
- Status cell: StatusBadge h-5 text-xs (11px) uppercase
- Action cell: icon-button h-7 w-7 ghost (MoreHorizontal 14px)
- Checkbox cell: h-4 w-4 blue-500 (width cell w-8)
- Pagination: h-9 text-base (13px), page button h-7 w-7 sm
- BulkActionBar: h-12 bg-zinc-950 text-white text-base (13px) padding-x 16px

---

### 2.5 `(app)/items/[id]` detail + `/new` form (compact tab + spacious form)

**Routes:**
- `apps/web/src/app/(app)/items/[id]/page.tsx` (detail view)
- `apps/web/src/app/(app)/items/[id]/edit/page.tsx` (edit form)
- `apps/web/src/app/(app)/items/new/page.tsx` (create form)

**Grid desktop (content 1172px):**
```
+-- content ------------------------------------------------+
| Breadcrumb h-6: Items / M6-20 / Chinh sua                 |
| [gap 12]                                                  |
| PageHeader: H1 "Bulon M6x20" + SKU mono 12px + actions    |
| [gap 16]                                                  |
| Tabs h-9 border-b:                                        |
| | Thong tin | BOM | Lich su | Don hang | NCC |            |
| [gap 16]                                                  |
| Tab content:                                              |
|  +-- Section card padding 20 ----------------------+      |
|  | THONG TIN CO BAN [11px uppercase section label] |      |
|  | ------------------------------------------      |      |
|  | SKU * [input h-9]       Ten * [input h-9]       |      |
|  | Mo ta [textarea min-h 72]                       |      |
|  | Loai [select h-9]       Don vi [select h-9]     |      |
|  | ... 2-col grid gap-4                             |      |
|  +-------------------------------------------------+      |
|  [gap 16]                                                 |
|  +-- Section "Thong so kho" padding 20 ------------+      |
|  | Ton kho [input h-9] Min [input h-9] Max [input] |      |
|  +-------------------------------------------------+      |
| [gap 20]                                                  |
| Form footer sticky bottom (khi edit):                     |
|  +----------------------------------------------+         |
|  |                  [Huy] [Luu thay doi]        |         |
|  +----------------------------------------------+         |
+-----------------------------------------------------------+
```

**ASCII — POPULATED (edit state):**
```
+------------------------------------------------------------+
| Items / M6-20 / Chinh sua                                  | breadcrumb 12px
+------------------------------------------------------------+
| Bulon M6x20                         [Xem] [Xoa]            | h1 + actions
| SKU: M6-20 - Da tao 2026-04-01                              | meta 11px
+------------------------------------------------------------+
| |Thong tin| BOM | Lich su | Don hang | NCC |               | tabs h-9
+------------------------------------------------------------+
|                                                            |
| +-- THONG TIN CO BAN ----------------------------------+   |
| |                                                       |  |
| | SKU *                      Ten *                      |  |
| | +--------------+           +------------------------+ |  |
| | | M6-20        |           | Bulon M6x20            | |  | h-9 input
| | +--------------+           +------------------------+ |  |
| |                                                       |  |
| | Mo ta                                                 |  |
| | +----------------------------------------------------+|  |
| | | Bulon hex M6 dai 20mm thep carbon lop 8.8          ||  | textarea
| | +----------------------------------------------------+|  |
| |                                                       |  |
| | Loai *                     Don vi *                   |  |
| | +--------------+           +--------------+           |  |
| | | Raw material |           | Cai          |           |  |
| | +--------------+           +--------------+           |  |
| |                                                       |  |
| +-------------------------------------------------------+  |
|                                                            |
| +-- THONG SO KHO --------------------------------------+   |
| | Ton hien tai    Min an toan    Max ton kho            |  |
| | +------+        +------+       +------+               |  |
| | | 125  |        | 50   |       | 500  |               |  | mono-num
| | +------+        +------+       +------+               |  |
| +-------------------------------------------------------+  |
|                                                            |
+------------------------------------------------------------+
|                                     [Huy] [Luu thay doi]   | footer sticky
+------------------------------------------------------------+
```

**ASCII — ERROR (validation inline):**
```
| SKU *                                                    |
| +--------------+                                         |
| |              |  border red-500, outline red-500        |
| +--------------+                                         |
| [!] Khong duoc de trong                                  |  12px red-700
```

**ASCII — LOADING (saving):**
```
| [Huy] [spinner Dang luu...]   button disabled spinner left
```

**Component tree:**
```
<ItemDetailPage>
  <Breadcrumb items={[{label:"Items", href:"/items"}, {label: sku}, {label:"Chinh sua"}]} />
  <PageHeader title={name} subtitle={`SKU: ${sku} - Da tao ${createdAt}`} actions={<ViewButton /><DeleteButton />} />
  <Tabs defaultValue="info">
    <TabsList>
      <TabsTrigger value="info">Thong tin</TabsTrigger>
      <TabsTrigger value="bom">BOM</TabsTrigger>
      ...
    </TabsList>
    <TabsContent value="info">
      <ItemForm>
        <FormSection label="THONG TIN CO BAN">
          <FormGrid cols={2}>
            <FormField name="sku" required />
            <FormField name="name" required />
            <FormField name="description" colSpan={2} as="textarea" />
            <FormField name="type" as="select" required />
            <FormField name="unit" as="select" required />
          </FormGrid>
        </FormSection>
        <FormSection label="THONG SO KHO">
          <FormGrid cols={3}>
            <FormField name="stock" as="number" />
            <FormField name="min" as="number" />
            <FormField name="max" as="number" />
          </FormGrid>
        </FormSection>
      </ItemForm>
    </TabsContent>
  </Tabs>
  <FormFooter sticky>
    <Button variant="outline">Huy</Button>
    <Button type="submit">Luu thay doi</Button>
  </FormFooter>
```

**Interactions/shortcuts:**
- `Ctrl+S`: save form (preventDefault browser save-page)
- `Esc` trong form: prompt "Ban co thay doi chua luu. Huy?"
- Tab navigate between input fields
- Auto-save draft to localStorage every 30s (future V2.1)
- "Xem" button: switch sang detail read-only view

**Acceptance criteria (8):**
1. Tabs h-9 (36px) border-b, active border-b-2 zinc-900 (không blue để giữ neutral)
2. Form section card padding 20px (p-5), border zinc-200, rounded-md bg-white
3. Form section header "THONG TIN CO BAN" text-xs (11px) uppercase tracking-wider weight 500 zinc-500 margin-b 16px
4. Input h-9 (36px) text-base (13px), border zinc-200, focus outline 2px blue-500
5. Label text-base (13px) weight 500 zinc-900 margin-b 6px
6. Helper text 12px zinc-500 margin-t 4px, error text 12px red-700
7. Form footer sticky bottom h-14 (56px) bg-white border-t zinc-100 padding-x 20 button right-align gap-2
8. 2-col grid desktop, 1-col mobile (< 768px)

**Font/density spec:**
- Breadcrumb: text-sm (12px) zinc-500 / zinc-900 last, separator "/" 8px zinc-300
- H1 page: text-2xl (20px) weight 600 tracking-tight
- Subtitle meta: text-xs (11px) zinc-500 mono-num partial
- Action buttons header: h-7 (28px) sm ghost/outline text-sm (12px)
- Tabs: h-9 list, each trigger h-8 padding-x 12px text-base (13px) weight 500
- Tabs active: text-zinc-900 border-b-2 border-zinc-900, inactive text-zinc-500 hover:text-zinc-700
- Form section card: padding 20px, border zinc-200 rounded-md
- Section header: text-xs (11px) weight 500 uppercase tracking-wider zinc-500
- Label: text-base (13px) weight 500 zinc-900 margin-b 6px
- Required asterisk: text-red-500 margin-l 2px
- Input: h-9 (36px) padding-x 12px text-base (13px) border zinc-200 rounded-md
- Textarea: min-h 72px padding 12px text-base (13px) resize-vertical
- Select trigger: h-9 same as input + chevron 14px right
- Helper: text-sm (12px) zinc-500 margin-t 4px
- Error: text-sm (12px) red-700 margin-t 4px + icon 12px AlertCircle
- Footer: h-14 (56px) border-t zinc-100, button h-8 default gap 8px

---

### 2.6 `(app)/items/import` — Import Wizard 4-step

**Routes:** `apps/web/src/app/(app)/items/import/[stepId]/page.tsx` (stepId: upload / mapping / preview / result)

**Grid desktop:**
```
+-- content 1172px ------------------------------------------+
| PageHeader h-9: Import Items + "Huy"                       |
| [gap 16]                                                   |
| Stepper h-12 border-b zinc-200 bg-white sticky top-11:     |
|  [1 Tai] -> [2 Mapping] -> [3 Preview] -> [4 Ket qua]      |
|  step dot 32px rounded-full, line 2px between              |
| [gap 24]                                                   |
| Step content max-w 960px mx-auto:                          |
|  (Step 1) Upload dropzone                                  |
|  (Step 2) ColumnMapper 2-col split                         |
|  (Step 3) Preview table + error highlight                  |
|  (Step 4) Result summary + download errors                 |
| [gap 24]                                                   |
| Footer h-14 sticky bottom bg-white border-t:               |
|  [Quay lai]                     [Tiep / Hoan tat]          |
+------------------------------------------------------------+
```

**ASCII — STEP 1 Upload:**
```
+----------------------------------------------------------+
| Import Items                                 [Huy]        |
+----------------------------------------------------------+
| [x1 Tai]--[o2 Mapping]--[o3 Preview]--[o4 Ket qua]        |
+----------------------------------------------------------+
|                                                          |
|         +----------------------------------------+       |
|         |                                        |       |
|         |  [Icon 32px zinc-400]                  |       |
|         |                                        |       |
|         |  Keo file Excel/CSV vao day            |       | 14px weight 500
|         |  hoac [Chon file]                      |       | link blue-600
|         |                                        |       |
|         |  XLSX / CSV - toi da 10MB              |       | 12px zinc-500
|         |                                        |       |
|         |  dropzone 640px x 240px                |       |
|         |  border dashed zinc-300 2px            |       |
|         |  hover border-blue-500 bg-blue-50/30   |       |
|         +----------------------------------------+       |
|                                                          |
|         [Tai template Excel mau]  link 12px              |
|                                                          |
+----------------------------------------------------------+
| [Quay lai] disabled            [Tiep disabled]            | footer h-14
+----------------------------------------------------------+
```

**ASCII — STEP 2 Mapping (ColumnMapperStep):**
```
+----------------------------------------------------------+
| [v1 Tai]--[x2 Mapping]--[o3 Preview]--[o4 Ket qua]        |
+----------------------------------------------------------+
| Map cot Excel -> truong he thong                         |
| File: items-import.xlsx (245 dong, 8 cot)                | 13px + 12px meta
|                                                          |
| +--------------------+------+-------------------------+  |
| | COT EXCEL          | ->   | TRUONG MES              |  | header 11px upper
| +--------------------+------+-------------------------+  |
| | Ma san pham        |      | SKU * [Select v]        |  | row h-9
| | [auto: "Ma..."->SKU]| ->  | (auto-suggest blue-600) |  | hint 11px
| | Ten san pham        | ->  | Ten * [Select v]        |  |
| | Loai                | ->  | Loai [Select v]         |  |
| | DVT                 | ->  | Don vi [Select v]       |  |
| | Ton                 | ->  | Ton hien tai [Select v] |  |
| | SafetyStock         | ->  | Min an toan [Select v]  |  |
| | GhiChu              | ->  | Mo ta [Select v]        |  |
| | Unused              | [Bo qua]                      |  | italic zinc-500
| +--------------------+------+-------------------------+  |
|                                                          |
| [i] 7/8 cot da map - 1 cot bo qua                        | 12px info-700
+----------------------------------------------------------+
| [Quay lai]                        [Tiep Preview]          |
+----------------------------------------------------------+
```

**ASCII — STEP 3 Preview:**
```
+----------------------------------------------------------+
| Preview 245 dong (243 OK - 2 loi)                        | 13px + badges inline
|                                                          |
| +- Table row 32px compact -----------------------------+ |
| | # | SKU       | Ten         | Loai | Ton | Trang   | |
| | 1 | M6-20     | Bulon M6x20 | Raw  | 125 | OK      | |
| | 2 | M8-30     | Bulon M8x30 | Raw  |  34 | OK      | |
| | 3 |           | Bulon M4x10 | Raw  |  20 | SKU thieu| bg-red-50
| | 4 | ABC-1     |             | ...  | 0   | Ten thieu| bg-red-50
| | ...                                                   | |
| +------------------------------------------------------+ |
|                                                          |
| [!] 2 dong co loi — [Tai danh sach loi Excel]            | link 12px blue-600
+----------------------------------------------------------+
| [Quay lai]              [Import 243 dong hop le]         |
+----------------------------------------------------------+
```

**ASCII — STEP 4 Result:**
```
+----------------------------------------------------------+
|                                                          |
|         [v Icon 48px emerald-500]                        |
|         Import thanh cong                                | 20px weight 600
|         243 items da duoc tao                            | 13px zinc-700
|                                                          |
|         Tong hop:                                        | 11px upper
|         * Tao moi:  220                                  | 13px list
|         * Cap nhat:  23                                  |
|         * Bo qua:     2 (loi)                            |
|                                                          |
|         [Tai danh sach loi]  [Xem items da import]       | 2 button
|                                                          |
+----------------------------------------------------------+
|                                       [Hoan tat]          | primary button
+----------------------------------------------------------+
```

**Component tree:**
```
<ImportWizardPage stepId={stepId}>
  <PageHeader title="Import Items" cancel />
  <Stepper currentStep={stepId}>
    <Step id="upload" label="Tai" />
    <Step id="mapping" label="Mapping" />
    <Step id="preview" label="Preview" />
    <Step id="result" label="Ket qua" />
  </Stepper>
  {stepId === "upload"  && <UploadStep />}
  {stepId === "mapping" && <ColumnMapperStep />}
  {stepId === "preview" && <PreviewStep />}
  {stepId === "result"  && <ResultStep />}
  <WizardFooter>
    <Button variant="outline" onClick={back}>Quay lai</Button>
    <Button onClick={next}>Tiep</Button>
  </WizardFooter>
```

**Interactions/shortcuts:**
- Drag file over dropzone: highlight border blue-500, bg blue-50/30
- Drop file: validate size/type → auto-advance to step 2 after parse
- Step 2 auto-suggest: fuzzy match Excel header → MES field (VD: "Ma" → "SKU", "Ten" → "Name")
- Step 3: click row error → show detail tooltip
- Back button disabled step 1, Next disabled when step validation fail
- `Ctrl+Z` undo mapping change (V2.1)

**Acceptance criteria (8):**
1. Stepper h-12 (48px) border-b zinc-200 sticky top-11, step dot h-8 w-8 rounded-full
2. Active step: bg-blue-500 text-white, done: bg-emerald-500 + check icon 14px, todo: border-zinc-300 bg-white text-zinc-500
3. Line connector 2px between step: done = bg-emerald-500, active/todo = bg-zinc-200
4. Dropzone border dashed zinc-300 2px, hover border-blue-500 bg-blue-50/30
5. Mapping table row h-9 compact, auto-suggest hint text-xs blue-600 italic
6. Preview table row 32px compact, error row bg-red-50 border-l-2 red-500
7. Footer h-14 sticky bottom, primary button right, secondary left, gap 12px
8. Success icon 48px emerald-500 + h1 20px weight 600

**Font/density spec:**
- Page header: h1 text-2xl (20px) weight 600, cancel link text-sm (12px) zinc-500
- Stepper: h-12 padding-x 24, step circle h-8 w-8, label text-base (13px) weight 500 (active) / 400 (done/todo)
- Dropzone: 640×240 border dashed 2px zinc-300, icon 32px zinc-400
- Dropzone text: h2 text-md (14px) weight 500 + helper text-sm (12px) zinc-500
- Mapping table row: h-9, source cell text-base (13px), target select h-8 (32px) text-base (13px)
- Mapping auto-hint: text-xs (11px) italic zinc-500 weight 400
- Preview table: h-8 (32px) row text-sm (12px) — density cao hơn list thường vì data preview
- Result icon: 48px (lucide CheckCircle stroke 2)
- Result summary list: text-base (13px) with bullet, mono-num right-aligned

---

### 2.7 `/suppliers` list + detail (kế thừa /items V2 style)

**Routes:**
- `apps/web/src/app/(app)/suppliers/page.tsx` (list)
- `apps/web/src/app/(app)/suppliers/[id]/page.tsx` (detail)
- `apps/web/src/app/(app)/suppliers/new/page.tsx` (create)

**Grid — identical to /items §2.4** nhưng columns khác:

| Column | Width | Type |
|---|---|---|
| [checkbox] | 32px | w-8 |
| Ma NCC | 96px | font-mono |
| Ten | flex-1 | truncate |
| SDT | 120px | mono-num |
| Email | 200px | text |
| So PO | 80px | mono-num right |
| Trang thai | 96px | StatusBadge |
| [dots] | 32px | icon-button |

**Detail page layout:**
```
+-- content ------------------------------------------------+
| Breadcrumb: NCC / Co khi Thanh Phat                       |
| PageHeader: H1 "Co khi Thanh Phat" + ma NCC mono + tags   |
| [gap 16]                                                  |
| Tabs h-9:                                                 |
| | Thong tin | Lich su PO | Items cung cap | Ghi chu |     |
| [gap 16]                                                  |
| Tab content — section cards:                              |
|  Thong tin: name / code / address / phone / email / tax   |
|  Lich su PO: table row 36px (PO#, ngay, gia tri, status)  |
|  Items cung cap: table row 36px (SKU, ten, gia, lead time)|
|  Ghi chu: textarea note + history timeline                |
+-----------------------------------------------------------+
```

**Acceptance criteria (6):**
1. List table row 36px identical items V2 density
2. Detail tabs h-9 tương tự items, 4 tab chính
3. Supplier form section card padding 20 tương tự ItemForm
4. Address field textarea min-h 72px
5. VAT/tax code field font-mono text-sm zinc-700
6. Status badge: Active emerald / Inactive zinc / Blocked red — preserve 3-channel

**Font/density spec:** Kế thừa §2.4 + §2.5 — không thêm token riêng, chỉ khác column mapping.

---

### 2.8 `/pwa/receive/[poId]` — PWA Receiving Console (tablet compact)

**Route:** `apps/web/src/app/pwa/receive/[poId]/page.tsx`
**Viewport target:** iPad / Android tablet 9-10" portrait/landscape, outdoor 600-900 lux.

**Grid tablet 1024x768 portrait (768 wide):**
```
+-- viewport 768px wide ------------+
| TopBar 56px (mobile override):    |
|  [Back] PO-024 - 12/25 items      | 14px weight 500
| [gap 0] (no filter bar PWA)       |
|                                   |
| Current item card h-auto:         |
|   padding 16, border-l 2 orange-500|
|   SKU 14 mono + scan count 16 mono|
|   name 14, qty "3 / 10 cai" 14    |
|                                   |
| Scan input h-11 (44px):           |
|   [cam] [input autofocus     ]    |
|                                   |
| List remaining items:             |
|  row h-14 (56px) padding-x 16     |
|  [checkbox 20px] SKU 13 mono      |
|                   name 14         |
|                   qty 13 mono right|
|  ... scrollable                   |
|                                   |
| Action bar fixed bottom h-18 (72):|
|  [Hoan tat 12/25] [Tam dung]     |
+-----------------------------------+
```

**ASCII — POPULATED (tablet portrait):**
```
+------------------------------------------+
| [Back] PO-024 - 12/25 items               | topbar 56px 14px
+------------------------------------------+
| +- DANG XU LY (orange border-l 2) ------+ |
| | SKU: M6-20                             | | mono 14
| | Bulon M6x20                            | | 14 weight 500
| | Da nhan: 3 / 10 cai                    | | mono 14 + zinc-500
| | [Scan queue 0] [cam Scan camera]       | | badge + button
| +----------------------------------------+ |
|                                          |
| +----------------------------------------+|
| | [search] [input autofocus       ] [cam]|| h-11 44px
| +----------------------------------------+|
|                                          |
+- Chua nhan (13) ---------------------------+  header 12 upper
| [ ] M8-30   Bulon M8x30           0/20    | row h-14
| [ ] ASM-1   Khung CNC A            0/5    | row h-14
| [ ] SPR-5   Lo xo phi 5           0/30    | row h-14
| [ ] M4-10   Bulon M4x10            0/50   | row h-14
| [ ] ...                                    |
|                                          |
+- Da hoan tat (11) v ----------------------+  accordion
| [x] M6-15  Bulon M6x15    10/10  OK       | row h-14 bg-emerald-50/30
| ...                                       |
+------------------------------------------+
|   [ Hoan tat 12/25 ]    [ Tam dung ]      | h-18 72px
+------------------------------------------+
```

**ASCII — SCAN FLASH SUCCESS:**
```
| +- DANG XU LY (outline 3px emerald/50 400ms) --+ |
| | SKU: M6-20                                    | |
| | Bulon M6x20                                   | |
| | v Da nhan: 4 / 10 cai                         | | bg-emerald-50 400ms
| +-----------------------------------------------+ |
| [beep-success 60ms]                               |
```

**ASCII — SCAN FLASH DANGER (barcode not match):**
```
| +- DANG XU LY (outline 3px red/50 400ms) -----+ |
| | SKU: M6-20  [shake 300ms +/-4px]             | |
| | [!] Barcode khong khop: M6-25                | | red-700 12px
| +----------------------------------------------+ |
| [beep-error 200ms]                               |
```

**ASCII — EMPTY (no items remaining, all done):**
```
|                                          |
|       [v Icon 48px emerald-500]          |
|       Da nhan du tat ca items             | 14 weight 500
|       PO-024 hoan tat                     | 12 zinc-500
|                                          |
|       [Xac nhan giao] [Tam dung]          | h-11 button
```

**ASCII — ERROR (offline):**
```
| +- OFFLINE banner top -----------------+ |
| | [!] Mat ket noi - Scan se dong bo     | | bg-amber-100 h-8 (32px)
| |    khi co mang  [Thu lai]             | | 12px weight 500 padding 8
| +---------------------------------------+ |
```

**Component tree:**
```
<PwaReceivePage>
  <PwaTopBar>
    <BackButton />
    <PwaPageTitle>PO-024 - 12/25 items</PwaPageTitle>
  </PwaTopBar>
  <OfflineBanner visible={!online} />
  <CurrentItemCard item={currentItem} />
  <ScanInput autoFocus />
  <ScanQueueBadge count={queue.length} />
  <RemainingItemsList items={remaining} />
  <CompletedItemsAccordion items={completed} />
  <PwaActionBar>
    <Button size="lg">Hoan tat 12/25</Button>
    <Button variant="outline" size="lg">Tam dung</Button>
  </PwaActionBar>
  <BarcodeScannerModal open={scannerOpen} />  // camera full-screen
```

**Interactions/shortcuts:**
- Auto-focus scan input khi page load + sau mỗi scan success (300ms delay)
- Enter trong scan input: commit scan → match against currentItem SKU
- Match success: flash emerald 400ms + beep 60ms + qty++
- Match fail: flash red 400ms + shake 300ms + beep error 200ms + inline error message
- Camera button: open full-screen modal với camera live view (Quagga.js)
- Offline: queue scans localStorage, badge shows count, sync khi online
- Swipe horizontal on row (touch): reveal action buttons (future V2.1)

**Acceptance criteria (8):**
1. Button primary h-11 (44px) — preserve PWA touch target
2. Input scan h-11 (44px) text-md (14px) autofocus
3. List row h-14 (56px) padding-x 16px — touch-friendly
4. Current item card border-l 2px orange-500 (preserve safety-orange shortage semantic)
5. Scan flash success 400ms ease-out-quart (giảm từ V1 600ms để responsive hơn)
6. Scan shake 300ms +/-4px (giảm biên độ từ V1 +/-6px)
7. Focus ring PWA override 3px blue-600 (outdoor visibility)
8. Action bar sticky bottom h-18 (72px) bg-white border-t zinc-200

**Font/density spec (PWA override desktop D3):**
- TopBar PWA: h-14 (56px) — mobile override
- PWA title: text-md (14px) weight 500 zinc-900
- Current item card: padding 16, border-l 2 orange-500, bg-orange-50/30
- Current SKU: font-mono text-md (14px) weight 500 zinc-700
- Current name: text-md (14px) weight 500 zinc-900
- Current qty: text-md (14px) mono-num with "/" separator: "3 / 10 cai"
- Scan input: h-11 (44px) text-md (14px) padding-l 36 icon 18
- List row: h-14 (56px) padding-x 16px
- List SKU: font-mono text-base (13px) zinc-700
- List name: text-md (14px) weight 500 zinc-900
- List qty right: font-mono text-base (13px) zinc-500
- Action bar button: h-11 (44px) text-md (14px) weight 500
- Offline banner: h-8 (32px) bg-amber-100 text-amber-700 text-sm (12px)

---

## §3. Component library V2 — 38 components

Mỗi component: **Props TypeScript** (nếu đổi API), **Visual spec cụ thể** (size/padding/color/state), **ASCII render** multi-state, **ARIA/a11y**, **Delta với V1**.

---

### 3.1 Layout (6)

#### 3.1.1 AppShell

**File:** `components/layout/app-shell.tsx`

**Props (unchanged V1):**
```ts
interface AppShellProps {
  children: React.ReactNode;
  user?: UserContext;
}
```

**Visual spec:**
- Grid layout desktop: `grid-cols-[220px_1fr] grid-rows-[44px_1fr]`
- Grid mobile: `grid-cols-1 grid-rows-[56px_1fr]`
- Sidebar area: col-start-1 col-end-2 row-start-1 row-end-3 (full-height left)
- TopBar area: col-start-2 row-start-1 (top-right)
- Main area: col-start-2 row-start-2 padding-x-6 padding-y-5 max-w-[1440px] mx-auto
- Background: bg-zinc-50 root

**ASCII render (desktop):**
```
+--------+----------------------------+
|Sidebar |TopBar 44px                 |
| 220px  +----------------------------+
|        |Main content                |
|        | padding 24x/20y max-w 1440 |
+--------+----------------------------+
```

**ARIA:** `<div role="application">` wrapper, `<nav aria-label="Menu chinh">` cho Sidebar, `<header role="banner">` cho TopBar, `<main id="main">` với skip-link target.

**Delta V1:** Sidebar 240→220px, TopBar 56→44px, padding-x 32→24px, không rail-collapsed.

---

#### 3.1.2 Sidebar

**File:** `components/layout/sidebar.tsx`

**Props (unchanged V1):**
```ts
interface SidebarProps {
  items: NavItem[];
  user: UserContext;
  onToggleMobile?: () => void;
}
```

**Visual spec:**
- Container: w-[220px] h-screen bg-white border-r border-zinc-200 flex flex-col
- Logo area: h-12 (48px) padding-x 16 flex items-center gap-2 border-b border-zinc-100
- Logo icon: 24px SVG + text-base (13px) weight 600 zinc-900 "MES Xưởng"
- Nav container: flex-1 padding-y 8 overflow-y-auto
- Nav section (nếu grouping): label text-xs (11px) uppercase tracking-wide zinc-500 padding-y 6 padding-x 12 margin-t 12
- Nav item: h-7 (28px) padding-x 12 rounded-md margin-x 8 flex items-center gap-2 text-base (13px) zinc-700 weight 500 hover:bg-zinc-100
- Nav item active: bg-blue-50 text-blue-700 border-l-2 border-blue-500 padding-l [10px] (bù 2px border)
- Nav item icon: 16px lucide stroke 1.75 zinc-500 (default) / blue-600 (active)
- Footer: border-t border-zinc-100 padding 12 with UserMenu trigger

**ASCII render (desktop expanded):**
```
+-- Sidebar 220px -----+
| [icon] MES Xuong     |  h-12 logo, 13px weight 600
+----------------------+
| [grid] Tong quan     |  h-7 active: bg-blue-50 border-l-2 blue
| [pkg]  Items         |  h-7 hover: bg-zinc-100
| [hand] Nha cung cap  |
| [in]   Nhap kho      |
| [gear] Cai dat       |
|                      |
|                      |
+----------------------+
| [avatar] admin v     |  h-10 padding 12
+----------------------+
```

**States:**
- Default: zinc-700 text
- Hover: bg-zinc-100 text-zinc-900
- Active (URL match): bg-blue-50 text-blue-700 border-l-2 blue-500
- Focus: outline 2 blue-500 offset -2 (inside, avoid clipping)
- Mobile: translated -100% off-screen, slide-in when `isOpen` state true

**ARIA:** `<nav aria-label="Menu chinh">`, `<ul role="list">`, each item `<a href aria-current={active ? "page" : undefined}>`.

**Delta V1:**
- Width 240→220px
- Logo header 56→48px
- Nav item 40→28px height (h-10 → h-7)
- Nav item icon 20→16px
- Active style: orange border → blue-500 border + blue-50 bg
- Bỏ rail-collapsed 56px (không cần mini mode)

---

#### 3.1.3 TopBar

**File:** `components/layout/top-bar.tsx`

**Props:**
```ts
interface TopBarProps {
  breadcrumb: BreadcrumbItem[];
  user: UserContext;
  onMobileMenuClick?: () => void;
}
```

**Visual spec:**
- Container: h-11 (44px) padding-x 16 sticky top-0 z-topbar bg-white border-b border-zinc-200 flex items-center gap-4
- Mobile: h-14 (56px), show hamburger icon 20px left
- Left area: Breadcrumb flex-1
- Right area: cmdk hint + bell + avatar
- Cmdk hint: flex items-center gap-1 text-sm (12px) zinc-500 hover:text-zinc-700 cursor-pointer (clicking opens palette)
- Kbd chip: padding 2/6 bg-zinc-100 rounded-sm border border-zinc-200 text-xs (11px) font-mono zinc-600 — "⌘K"
- Notification bell: button h-7 w-7 (28x28) icon 16px + badge if unread
- Avatar: 28px rounded-full border border-zinc-200 hover ring-1 ring-zinc-300

**ASCII render:**
```
+------------------------------------------------------------+
| Items / M6-20            [CmdK Tim nhanh] [Bell3] [avatar] | h-11 44px
+------------------------------------------------------------+
```

**Mobile ASCII:**
```
+----------------------------+
| [menu] MES     [Bell][ava] | h-14 56px
+----------------------------+
(breadcrumb hidden, mobile menu button replaces, max 3 items visible)
```

**ARIA:** `<header role="banner">`, Cmdk hint `<button aria-label="Mo tim nhanh" aria-keyshortcuts="Control+K">`, Notification `<button aria-label="Thong bao">` + badge with `aria-live="polite"`.

**Delta V1:** Height 56→44px desktop, bỏ search input inline (chuyển cmdk), bỏ help button (chuyển user menu), avatar 32→28px.

---

#### 3.1.4 UserMenu

**File:** `components/layout/user-menu.tsx`

**Props:**
```ts
interface UserMenuProps {
  user: UserContext;
  trigger?: "avatar" | "sidebar-footer";
}
```

**Visual spec:**
- Trigger (sidebar variant): full-width button h-10 padding-x 12 flex items-center gap-2 hover:bg-zinc-50 rounded-md
- Trigger avatar: 24px rounded-full
- Trigger name: text-base (13px) weight 500 zinc-900 truncate
- Trigger chevron: 14px zinc-400
- Dropdown content: shadow-sm border border-zinc-200 rounded-md bg-white min-w-[200px] padding-y 4
- Menu header: padding 12 border-b zinc-100
- Header name: text-base (13px) weight 600 zinc-900
- Header email: text-sm (12px) zinc-500 truncate
- Menu item: h-8 (32px) padding-x 10 text-base (13px) zinc-700 hover:bg-zinc-100 flex items-center gap-2
- Menu item icon: 14px zinc-500
- Divider: border-t zinc-100 margin-y 4
- Sign out item: text-red-700 hover:bg-red-50

**ASCII render (dropdown open):**
```
+-- trigger sidebar footer h-10 ------+
| [avatar] admin                   v  |
+--+------------------------------------+
   | admin                        [x]  |  header h-12
   | admin@songchau.vn                  |  12px zinc-500
   +------------------------------------+
   | [user] Tai khoan cua toi           |  h-8 32px
   | [gear] Cai dat                     |
   | [help] Tro giup                    |
   +------------------------------------+
   | [out]  Dang xuat                   |  text-red-700
   +------------------------------------+
```

**ARIA:** Radix `DropdownMenu` primitives — `aria-expanded`, `role="menu"`, `role="menuitem"`.

**Delta V1:** Content padding 8→4 tight, item height 40→32, text 14→13.

---

#### 3.1.5 Breadcrumb

**File:** `components/layout/breadcrumb.tsx`

**Props:**
```ts
interface BreadcrumbProps {
  items: Array<{ label: string; href?: string }>;
  maxItems?: number; // truncate middle with ellipsis if exceeded
}
```

**Visual spec:**
- Container: flex items-center gap-1 text-base (13px) zinc-500
- Item link: text-blue-600 hover:text-blue-700 underline-offset-2 hover:underline
- Separator: "/" text-zinc-300 margin-x 4 (padding-x dùng arbitrary `px-1`)
- Last item: text-zinc-900 weight 500 (không underline, no link)
- Ellipsis (middle truncate): "..." dropdown on click show hidden items

**ASCII render:**
```
Items / M6-20 / Chinh sua
```

Render breakdown:
- "Items" text-blue-600 (link)
- " / " text-zinc-300 padding-x 4
- "M6-20" text-blue-600 (link, font-mono 12px)
- " / " separator
- "Chinh sua" text-zinc-900 weight 500

**ARIA:** `<nav aria-label="Breadcrumb">`, `<ol>` list, last `<li aria-current="page">`.

**Delta V1:** Font 14→13px, separator "/" (V1 chevron "›"), last weight 600→500.

---

#### 3.1.6 CommandPalette

**File:** `components/command/command-palette.tsx`

**Props:**
```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  commands: Command[]; // fuzzy search input
}
```

**Visual spec:**
- Dialog overlay: bg-overlay-scrim (rgba 0,0,0,0.5) backdrop-blur-sm
- Content: max-w-[560px] mx-auto mt-[20vh] rounded-lg shadow-lg border border-zinc-200 bg-white
- Input area: h-11 (44px) border-b border-zinc-200 padding-x 12 flex items-center gap-3
- Search icon: 16px zinc-400 left
- Input: border-0 outline-0 text-md (14px) zinc-900 placeholder-zinc-400 flex-1
- Kbd hint right: "ESC" 11px bg-zinc-100 rounded-sm
- Results list: max-h-[400px] overflow-y-auto padding-y 4
- Section header: text-xs (11px) uppercase tracking-wide zinc-500 padding 8/12
- Result item: h-9 (36px) padding-x 12 flex items-center gap-2 text-base (13px) zinc-700 hover:bg-zinc-100
- Result item highlighted (arrow nav): bg-blue-50 text-blue-700
- Result icon: 14px zinc-500
- Result shortcut: text-xs (11px) font-mono zinc-400 ml-auto
- Footer: h-8 (32px) border-t zinc-100 padding-x 12 flex items-center gap-3 text-xs (11px) zinc-500
- Footer hints: "↑↓ Di chuyen" "↵ Chon" "ESC Dong"

**ASCII render:**
```
+-- 560px mx-auto mt 20vh -------------------------+
| [search 16] Tim kiem...                    [ESC] | h-11 input
+--------------------------------------------------+
| NAV                                              | 11px upper section header
|   [grid 14] Tong quan                           | h-9 result
|   [pkg  14] Items                                |
|   [hand 14] Nha cung cap                         |
| ACTIONS                                          |
|   [+ 14]    Tao item moi              [C I]      | h-9 with kbd shortcut
|   [csv 14]  Import Excel              [C U]      |
| RECENT                                           |
|   [link 14] SO-089 - Cong ty Dien Co...         |
+--------------------------------------------------+
| arrow nav   enter select   ESC close             | h-8 footer
+--------------------------------------------------+
```

**Keyboard:**
- `Ctrl+K` / `Cmd+K` to open (handled globally)
- Type to search (fuzzy match command label + keywords)
- `ArrowUp/Down` navigate
- `Enter` execute selected
- `Esc` close
- `Tab` also navigates (accessibility)

**ARIA:** Role `combobox`, `aria-expanded`, results `role="listbox"`, item `role="option" aria-selected`.

**Delta V1:** Width 640→560px, result item 40→36, hint footer new, overall padding giảm 20%.

---

### 3.2 UI primitives (15)

#### 3.2.1 Button

**File:** `components/ui/button.tsx`

**Props (extended V1):**
```ts
interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost" | "danger" | "link";
  size?: "xs" | "sm" | "default" | "lg" | "icon" | "icon-sm";
  loading?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
  fullWidth?: boolean;
}
```

**Visual spec — variants:**

| Variant | Default | Hover | Press | Disabled |
|---|---|---|---|---|
| `primary` | `bg-blue-500 text-white` | `bg-blue-600` | `bg-blue-700 scale-[0.98]` | `bg-blue-300 text-white cursor-not-allowed` |
| `secondary` | `bg-zinc-100 text-zinc-900 border border-zinc-200` | `bg-zinc-200` | `bg-zinc-300` | `bg-zinc-50 text-zinc-400 border-zinc-200` |
| `outline` | `bg-white text-zinc-900 border border-zinc-300` | `bg-zinc-50 border-zinc-400` | `bg-zinc-100` | `text-zinc-400 border-zinc-200` |
| `ghost` | `bg-transparent text-zinc-700` | `bg-zinc-100 text-zinc-900` | `bg-zinc-200` | `text-zinc-400` |
| `danger` | `bg-red-500 text-white` | `bg-red-600` | `bg-red-700 scale-[0.98]` | `bg-red-300 text-white` |
| `link` | `bg-transparent text-blue-600 underline-offset-2` | `text-blue-700 underline` | `text-blue-800` | `text-blue-300` |

**Visual spec — sizes:**

| Size | Height | Padding-x | Font | Icon |
|---|---|---|---|---|
| `xs` | 24px (h-6) | 8 (px-2) | 11px (text-xs) | 12 |
| `sm` | 28px (h-7) | 10 (px-2.5) | 12px (text-sm) | 14 |
| `default` | 32px (h-8) | 12 (px-3) | 13px (text-base) | 14 |
| `lg` | 44px (h-11) | 16 (px-4) | 14px (text-md) | 18 |
| `icon` | 32×32 (h-8 w-8) | 0 | — | 16 |
| `icon-sm` | 28×28 (h-7 w-7) | 0 | — | 14 |

**ASCII render (variant primary, size default, loading state):**
```
+-------------------------+
|    [spin] Dang luu...   |  h-8 32px bg-blue-500 text-white
+-------------------------+
```

**ASCII render (variant outline, size sm, icon-left):**
```
+----------------------+
| [icon 14] Lam moi    |  h-7 28px border zinc-300
+----------------------+
```

**States transitions:**
- Hover: 100ms ease-out bg-color
- Press: 100ms ease-out scale-[0.98] + bg darken
- Disabled: opacity 0.6 + cursor-not-allowed
- Focus-visible: outline 2px blue-500 offset 2px

**ARIA:** Native `<button>` type="button" default. `aria-busy={loading}`, `aria-disabled={disabled}`. Icon-only button phải có `aria-label`.

**Delta V1:** Height default 40→32px, variant "danger" replace "destructive" rename, add "link" variant, bỏ `bg-cta` orange variants (CTA = blue primary).

---

#### 3.2.2 Input

**File:** `components/ui/input.tsx`

**Props (unchanged V1):**
```ts
interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  size?: "sm" | "default" | "lg";
  error?: boolean;
  iconLeft?: React.ReactNode;
  iconRight?: React.ReactNode;
}
```

**Visual spec:**
- Base: w-full rounded-md border border-zinc-200 bg-white text-base (13px) zinc-900 placeholder:text-zinc-400 transition-[border-color,outline-color] 150ms
- Focus-visible: border-blue-500 outline: 2px solid #3B82F6 outline-offset: 0 (outline overlaps border thành 1 glow mảnh)
- Error: border-red-500 focus outline-red-500
- Disabled: bg-zinc-50 text-zinc-400 cursor-not-allowed

| Size | Height | Padding-x | Font |
|---|---|---|---|
| `sm` (filter) | 32 (h-8) | 10 | 13px |
| `default` (form) | 36 (h-9) | 12 | 13px |
| `lg` (PWA) | 44 (h-11) | 14 | 14px |

**ASCII render (default):**
```
+------------------------+
| admin                  |  h-9 36px border zinc-200
+------------------------+
```

**ASCII render (focus):**
```
+------------------------+
| admin|                 |  border-blue-500 + outline 2px blue
+------------------------+
```

**ASCII render (error):**
```
+------------------------+
|                        |  border-red-500
+------------------------+
[!] Khong duoc de trong    12px red-700
```

**ASCII render (icon-left search):**
```
+------------------------+
| [search 14] Tim...     |  h-8 padding-l 28 icon absolute left 10
+------------------------+
```

**ARIA:** `aria-invalid={error}`, `aria-describedby` pair với helper/error text id.

**Delta V1:** Height default 40→36px, font 14→13px, focus dùng CSS outline thay box-shadow ring.

---

#### 3.2.3 Label

**File:** `components/ui/label.tsx`

**Props:**
```ts
interface LabelProps extends React.LabelHTMLAttributes<HTMLLabelElement> {
  required?: boolean;
  uppercase?: boolean; // variant uppercase section label
}
```

**Visual spec:**
- Default: text-base (13px) weight 500 zinc-900 margin-b 6px display block
- Uppercase variant: text-xs (11px) weight 500 uppercase tracking-wider zinc-500
- Required asterisk: text-red-500 margin-l 2px inline

**ASCII render:**
```
SKU *                  <- label 13px weight 500 + red * asterisk
+--------------+
| M6-20        |
+--------------+
```

Uppercase variant:
```
THONG TIN CO BAN       <- 11px uppercase tracking-wider zinc-500
```

**ARIA:** `<label htmlFor={inputId}>`, required via `aria-required` trên input.

**Delta V1:** Font 14→13, asterisk màu red-500 (V1 danger-500 old token, same hex nhưng token rename).

---

#### 3.2.4 Checkbox

**File:** `components/ui/checkbox.tsx`

**Props (Radix-based):**
```ts
interface CheckboxProps extends Radix.CheckboxProps {
  size?: "sm" | "default";
}
```

**Visual spec:**
- Size default: h-4 w-4 (16px box) border-[1.5px] border-zinc-300 rounded-sm bg-white transition-all 100ms
- Size sm (for inline text): h-3.5 w-3.5 (14px)
- Hover: border-zinc-400 bg-zinc-50
- Checked: bg-blue-500 border-blue-500
- Checked indicator: 12px CheckIcon stroke 2.5 text-white
- Indeterminate: 10px horizontal bar (2px) centered text-white
- Focus-visible: outline 2px blue-500 offset 1px
- Disabled: opacity 0.5 cursor-not-allowed

**ASCII render (states):**
```
Default:   [ ]   <- 16x16 border zinc-300
Hover:     [ ]   <- border zinc-400 bg zinc-50
Checked:   [v]   <- bg-blue-500 tick white
Indeterm:  [-]   <- bg-blue-500 dash white
Disabled:  [ ]   <- opacity 0.5
```

**ARIA:** Radix primitive `<Checkbox>`, built-in `role="checkbox"` + `aria-checked`.

**Delta V1:** Box 20→16px, border 2→1.5px, tick 14→12px.

---

#### 3.2.5 Select

**File:** `components/ui/select.tsx`

**Props (Radix-based):**
```ts
interface SelectProps {
  size?: "sm" | "default";
  placeholder?: string;
  // Radix native props pass-through
}
```

**Visual spec — Trigger:**
- Same as Input (border zinc-200, h-8 sm / h-9 default)
- Chevron: 14px lucide ChevronDown zinc-500 right
- Padding-right: 32px (padding icon + space)
- Placeholder: zinc-400

**Visual spec — Content (dropdown):**
- bg-white border border-zinc-200 rounded-md shadow-sm
- Padding-y 4
- Max-height 320px overflow-y-auto
- Min-width match trigger width

**Visual spec — Item:**
- h-8 (32px) padding-x 10 text-base (13px) zinc-700
- Hover / keyboard focus: bg-zinc-100 text-zinc-900
- Selected: bg-blue-50 text-blue-700 + CheckIcon 14px right

**ASCII render (open):**
```
+----------------------+
| Raw material      v  |  h-9 trigger
+----+-----------------+
     | Raw material  v |  bg-blue-50 selected
     | Finished good   |
     | Assembly        |
     | Sub-assembly    |
     | Service part    |
     +-----------------+
```

**ARIA:** Radix `<Select>` built-in role combobox listbox.

**Delta V1:** Trigger h-10→h-9, item h-10→h-8, text 14→13.

---

#### 3.2.6 Textarea

**File:** `components/ui/textarea.tsx`

**Props:**
```ts
interface TextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
  resize?: "none" | "vertical" | "horizontal" | "both";
}
```

**Visual spec:**
- Base: w-full min-h-[72px] padding 12 rounded-md border border-zinc-200 bg-white text-base (13px) zinc-900 leading-[1.4] resize-vertical
- Focus: border-blue-500 outline 2 blue-500
- Error: border-red-500

**ASCII render:**
```
+-----------------------------------+
| Mo ta dai cho item, hien thi      |
| multiline. Min-height 72px cho    |
| breathing room.                    |
+-----------------------------------+
                                  [=] <- resize handle bottom-right
```

**Delta V1:** Min-h 80→72, font 14→13, padding 16→12.

---

#### 3.2.7 Dialog

**File:** `components/ui/dialog.tsx`

**Props (Radix-based):**
```ts
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  size?: "sm" | "md" | "lg";
}
```

**Visual spec:**
- Overlay: fixed inset-0 bg-black/50 z-dialog animate-fade-in 150ms
- Content: max-w-md (448px) mx-auto mt-[15vh] rounded-lg shadow-lg border border-zinc-200 bg-white animate-dialog-in 200ms
- Sizes: sm = max-w-sm (384), md = max-w-md (448), lg = max-w-lg (512)
- Header: padding 20 padding-b 16 border-b border-zinc-100
- Title: text-lg (15px) weight 600 zinc-900
- Description: text-base (13px) zinc-500 margin-t 4
- Close button: absolute top-4 right-4 icon-button h-7 w-7 ghost
- Body: padding 20
- Footer: padding 20 padding-t 16 border-t border-zinc-100 flex justify-end gap-2
- Footer buttons: right-align, primary right, secondary left

**ASCII render:**
```
+-- Dialog overlay bg-black/50 --------+
|                                      |
|    +-- Dialog content 448px -----+   |
|    | Xac nhan xoa             [x]|   |  header 15px weight 600
|    | Ban co chac muon xoa M6-20? |   |  desc 13px zinc-500
|    +-----------------------------+   |
|    |                             |   |
|    | Hanh dong nay khong the huy |   |  body 13px
|    | va se xoa tat ca BOM ref.   |   |
|    |                             |   |
|    +-----------------------------+   |
|    |            [Huy] [Xoa]      |   |  footer right-align gap 8
|    +-----------------------------+   |
|                                      |
+--------------------------------------+
```

**ARIA:** Radix `Dialog.Root` built-in role dialog aria-modal aria-labelledby aria-describedby.

**Delta V1:** Padding 24→20, title 20→15, shadow double-drop → single layer.

---

#### 3.2.8 Sheet

**File:** `components/ui/sheet.tsx`

**Props (Radix-based, side default "right"):**
```ts
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side?: "left" | "right" | "top" | "bottom";
  size?: "default" | "lg";
}
```

**Visual spec:**
- Overlay: fixed inset-0 bg-black/40 z-dialog animate-fade-in 150ms
- Content right: fixed top-0 right-0 h-full w-[480px] rounded-l-lg border-l border-zinc-200 bg-white shadow-lg animate-slide-in-right 200ms
- Content size lg: w-[640px]
- Mobile (< 768px): w-full rounded-none
- Header: h-12 (48px) padding-x 20 border-b border-zinc-100 flex items-center justify-between
- Header title: text-lg (15px) weight 600 zinc-900
- Close button: h-7 w-7 ghost (icon X 14px)
- Body: padding 20 overflow-y-auto flex-1
- Footer: h-14 (56px) padding-x 20 border-t border-zinc-100 flex justify-end gap-2 items-center

**ASCII render (right side):**
```
                          +-- Sheet 480px right ----+
                          | Chinh sua M6-20      [x]|  h-12 header
                          +-------------------------+
                          |                         |
                          | [form body padding 20]  |  body
                          |                         |
                          | SKU  [input h-9]        |
                          | Ten  [input h-9]        |
                          | ...                     |
                          |                         |
                          +-------------------------+
                          |         [Huy] [Luu]     |  h-14 footer
                          +-------------------------+
```

**ARIA:** Radix `Dialog.Root` `role="dialog"` `aria-modal="true"`.

**Delta V1:** Width 520→480, header h-14→h-12, padding 24→20.

---

#### 3.2.9 Popover

**File:** `components/ui/popover.tsx`

**Visual spec:**
- Content: shadow-sm border border-zinc-200 rounded-md bg-white padding 12 max-w-[320px] animate-fade-in 150ms
- Arrow: KHÔNG có (Linear không dùng arrow, chỉ offset 4px từ trigger)
- Offset side: 4px

**ASCII render:**
```
[trigger button]
 v  (offset 4)
+-- popover max-w 320 ----+
| Content bat ky          |
+-------------------------+
```

**Delta V1:** Padding 16→12, bỏ arrow, shadow-pop → shadow-sm.

---

#### 3.2.10 Dropdown

**File:** `components/ui/dropdown.tsx`

**Visual spec:** Giống Select content. Item h-8 text-base (13px) padding-x 10, icon leading 14 zinc-500, shortcut right text-xs (11px) font-mono zinc-400.

**ASCII render:**
```
+-- dropdown ---------------+
| [edit] Chinh sua      E   | h-8 icon + label + shortcut
| [copy] Nhan ban           |
| [exp]  Xuat Excel     X   |
+---------------------------+
| [del]  Xoa           Del  | text-red-700
+---------------------------+
```

**Delta V1:** Item h-10→h-8, text 14→13.

---

#### 3.2.11 Tabs

**File:** `components/ui/tabs.tsx`

**Visual spec (underline style):**
- List container: h-9 (36px) border-b border-zinc-200 flex items-center gap-1
- Trigger: h-8 (32px) padding-x 12 text-base (13px) weight 500 text-zinc-500 hover:text-zinc-700 transition-colors 100ms
- Active: text-zinc-900 border-b-2 border-zinc-900 margin-b-[-2px] (overlap border-b container)
- Disabled: text-zinc-300 cursor-not-allowed

**Active color note:** V2 dùng **zinc-900 border** (neutral) thay vì blue-500 để giữ tabs "quiet" — chỉ blue-500 khi tab mang action hoặc trong CommandPalette.

**ASCII render:**
```
+-- h-9 border-b zinc-200 --------------------------+
| Thong tin | BOM | Lich su | Don hang | NCC        |
| ====      |                                       |  active: border-b-2 zinc-900
+---------------------------------------------------+
```

**Delta V1:** Height 40→36, active color blue→zinc-900, bỏ pill/filled variant.

---

#### 3.2.12 Tooltip (NEW)

**File:** `components/ui/tooltip.tsx` (new component V2)

**Props (Radix-based):**
```ts
interface TooltipProps {
  content: string | React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delay?: number; // default 300ms
}
```

**Visual spec:**
- Content: bg-zinc-900 text-white text-sm (12px) padding 6/10 rounded-md shadow-sm max-w-[240px] animate-fade-in 150ms
- Arrow: KHÔNG (offset 4px từ trigger)
- Delay open: 300ms, close: 0ms

**ASCII render:**
```
[icon-only button]
     v  (offset 4)
+-- tooltip zinc-900 ---+
| Xem chi tiet          |  text-sm 12 white
+-----------------------+
```

**Use cases:**
- Icon-only button explain action
- Truncated table cell text full view
- KPI delta explanation
- Form helper persistent info

**ARIA:** Radix `Tooltip.Root` role="tooltip" aria-describedby trigger.

**Delta V1:** NEW — V1 không có Tooltip component.

---

#### 3.2.13 Skeleton

**File:** `components/ui/skeleton.tsx`

**Visual spec:**
- Base: bg-zinc-100 rounded-md relative overflow-hidden
- Shimmer overlay: gradient white 50% 1200ms linear infinite
- Variants predefined: `text-sm`, `text-lg`, `h-9 w-32`, `h-9 w-full`, etc.

**ASCII render:**
```
+-----+-------------+---------+-----+
|     |             |         |     |  skeleton row 36px w=full
+-----+-------------+---------+-----+
 shimmer →→→ moves left to right 1200ms linear
```

**Delta V1:** Giữ 90% logic V1, chỉ đổi bg zinc-200→zinc-100 (nhẹ hơn).

---

#### 3.2.14 Badge

**File:** `components/ui/badge.tsx`

**Props:**
```ts
interface BadgeProps {
  variant?: "default" | "success" | "warning" | "danger" | "info" | "shortage";
  size?: "sm" | "default";
  icon?: React.ReactNode;
}
```

**Visual spec:**
- Base: inline-flex items-center gap-1 h-5 (20px) padding-x 8 text-xs (11px) weight 500 uppercase tracking-wide rounded-sm
- Icon: 10-12px leading

| Variant | Bg | Text | Border |
|---|---|---|---|
| `default` | zinc-100 | zinc-700 | — |
| `success` | emerald-50 | emerald-700 | — |
| `warning` | amber-50 | amber-700 | — |
| `danger` | red-50 | red-700 | — |
| `info` | sky-50 | sky-700 | — |
| `shortage` | orange-50 | orange-700 | — |

**Size sm:** h-[18px] text-[10px] padding-x 6.

**ASCII render:**
```
[v OK]       emerald-50 bg, emerald-700 text, check icon 10
[! SHORTAGE] orange-50 bg, orange-700 text
[x FAIL]     red-50 bg, red-700 text
```

**ARIA:** Badge thường decorative, nếu convey status phải wrap trong text context hoặc thêm `aria-label`.

**Delta V1:** Weight 500 (V1 600), rounded-sm (V1 rounded), add `shortage` variant explicit.

---

#### 3.2.15 StatusBadge

**File:** `components/ui/status-badge.tsx` (domain-spec badge)

**Props:**
```ts
interface StatusBadgeProps {
  status: "ready" | "partial" | "shortage" | "fail" | "draft" | "released" | "cancelled";
  showLabel?: boolean; // default true
  size?: "sm" | "default";
}
```

**3-channel mandatory (icon + label + color):**

| Status | Icon | Label | Variant |
|---|---|---|---|
| `ready` | CheckCircle 12 | READY / SẴN SÀNG | success emerald |
| `partial` | Clock 12 | PARTIAL / 1 PHẦN | warning amber |
| `shortage` | AlertTriangle 12 | SHORTAGE / THIẾU | shortage orange |
| `fail` | XCircle 12 | FAIL / LỖI | danger red |
| `draft` | Circle 12 | DRAFT / NHÁP | default zinc |
| `released` | Send 12 | RELEASED / PHÁT HÀNH | info blue |
| `cancelled` | Ban 12 | CANCELLED / HỦY | default zinc (muted) |

**ASCII render:**
```
[v] READY        emerald icon + label
[!] SHORTAGE     orange icon + label
[x] FAIL         red icon + label
[-] DRAFT        zinc icon + label
```

**ARIA:** Status badge MUST have `aria-label` hoặc visible label — không icon-only.

**Delta V1:** Preserve 3-channel rule. Variant map updated sang zinc+blue+emerald+amber+red+orange palette. Size 24→20px.

---

### 3.3 Domain components (6)

#### 3.3.1 KpiCard

**File:** `components/domain/kpi-card.tsx`

**Props:**
```ts
interface KpiCardProps {
  label: string;              // "DON MO"
  value: number | string;     // 42
  delta?: string;             // "+3 tuan"
  status?: "default" | "success" | "warning" | "critical";
  icon?: React.ReactNode;
  href?: string;              // nếu click drilldown
}
```

**Visual spec:**
- Container: padding 16 border border-zinc-200 rounded-md bg-white min-h-[72px] flex flex-col gap-1 relative
- Label: text-xs (11px) weight 500 uppercase tracking-wide zinc-500
- Value: text-[22px] weight 500 tabular-nums text-zinc-900 (default) / text-red-600 (critical) / text-emerald-600 (success) / text-amber-600 (warning)
- Delta: text-sm (12px) font-mono zinc-500 (default) / emerald-600 (positive) / red-600 (negative)
- Icon: 16px lucide zinc-400 absolute top-4 right-4
- Interactive (href): card-interactive hover class — border-zinc-300 shadow-xs translate-y-[-1px]

**ASCII render:**
```
+-- KpiCard padding 16 --+
| DON MO           [icon]|  label 11px upper + icon top-right
|                        |
| 42                     |  value 22px weight 500
| +3 tuan                |  delta 12px mono
+------------------------+
height 72px min
```

Critical variant:
```
| SHORTAGE         [!]   |
| 3                      |  text-red-600
| critical               |  text-red-600 weight 500
```

**ARIA:** Nếu href → `<a>` wrapping; nếu interactive → `role="link"`. Screen reader: "DON MO, 42, +3 tuan".

**Delta V1:** **BỎ border-l-4 color stripe hoàn toàn.** Padding 24→16, min-h 112→72, value 36 bold → 22 medium, label 14→11.

---

#### 3.3.2 OrdersReadinessTable

**File:** `components/domain/orders-readiness-table.tsx`

**Visual spec:**
- Card container: bg-white border border-zinc-200 rounded-md padding 16
- Section header: h-6 flex items-center justify-between margin-b 12
- Title: text-lg (15px) weight 600 zinc-900
- Action link: text-sm (12px) text-blue-600 "Xem tat ca →"
- Table: w-full
- Header row: h-9 border-b border-zinc-200 text-sm (12px) uppercase tracking-wide weight 500 zinc-500 text-left
- Body row: h-9 border-b border-zinc-100 text-base (13px) zinc-900
- SKU/SO# cell: font-mono text-sm (12px) zinc-700
- Name cell: truncate with Tooltip on overflow
- %Ready cell: progress bar inline h-1 (4px) + percent text-sm (12px) font-mono right
- Status cell: StatusBadge sm
- Shortage row: bg-orange-50 border-l-2 border-orange-500 padding-l [10px] (bù 2px border)

**ASCII render:**
```
+-- Card padding 16 bg-white border zinc-200 --------+
| Don hang san sang                    Xem tat ca -> |  h-6 header 15px + link
+----------------------------------------------------+
| SO    | KHACH HANG    | %READY | STT               |  h-9 header 12 upper
+-------+---------------+--------+-------------------+
| SO-089| Dien Co       | ▓▓▓▓▓▓ 100%| [v READY]    |  h-9 row
| SO-090| Tan Tien      | ▓▓▓▓▓  85% | [! PART]     |
| SO-091| Cam Pha       | ▓▓    40%  | [! SHORT]    |  bg-orange-50 border-l
| SO-092| Dong Hai      | ▓▓▓▓▓▓ 100%| [v READY]    |
+-------+---------------+------------+---------------+
```

**ARIA:** `<table role="table">`, `<th scope="col">`, row với shortage `aria-label` hoặc `role="row"` + live region cho changes.

**Delta V1:** Row 48→36, no zebra, padding card 24→16.

---

#### 3.3.3 AlertsList

**File:** `components/domain/alerts-list.tsx`

**Visual spec:**
- Card: padding 16 border zinc-200 rounded-md bg-white
- Header: h-6 title + "Xem tat ca" link
- List: divide-y zinc-100
- Item: h-12 (48px) padding-x 0 padding-y 12 flex items-start gap-3 hover:bg-zinc-50 transition 100ms cursor-pointer
- Icon leading: 16px (AlertTriangle amber / XCircle red / Package orange shortage / Bell zinc info)
- Title: text-base (13px) weight 500 zinc-900 truncate
- Meta: text-xs (11px) zinc-500 mono (timestamp "2 phut truoc")
- Action link (optional): text-xs (11px) text-blue-600

**ASCII render:**
```
+-- Card padding 16 ------------------------------+
| Canh bao                          Xem tat ca -> |
+-------------------------------------------------+
| [!] PO-024 tre 2 ngay                           |  h-12 item
|     2 phut truoc                                |  meta 11px
+-------------------------------------------------+
| [x] BOM-315 xung dot                            |
|     5 phut truoc               [Giai quyet]     |  action link right
+-------------------------------------------------+
| [!] SKU M6-20 thieu 30 (orange)                 |  orange icon shortage
|     8 phut truoc                                |
+-------------------------------------------------+
```

**Delta V1:** Item h-14→h-12, padding-y 16→12, title 14→13, meta 12→11.

---

#### 3.3.4 SystemHealthCard

**File:** `components/domain/system-health-card.tsx`

**Visual spec:**
- Card: padding 16 border zinc-200 rounded-md bg-white
- Layout: flex gap-6 items-center (desktop) / stack (mobile)
- Metric row: flex items-center gap-2
- Status dot: h-2 w-2 rounded-full (success emerald-500, warning amber-500, danger red-500, idle zinc-300)
- Metric label: text-xs (11px) uppercase tracking-wide zinc-500
- Metric value: text-base (13px) font-mono tabular-nums zinc-900
- Separator between: text-zinc-300 "·" padding-x 4

**ASCII render:**
```
+-- Card padding 16 -----------------------------------+
| * DB 12ms  * Redis 2ms  * Worker 0 job  Last 18s ago |
+------------------------------------------------------+
```

**Delta V1:** Padding 24→16, dot 10→8, text 14→13.

---

#### 3.3.5 EmptyState

**File:** `components/ui/empty-state.tsx`

**Props:**
```ts
interface EmptyStateProps {
  icon: React.ReactNode;       // Lucide icon 32px stroke 1.5
  title: string;
  description?: string;
  action?: { label: string; onClick: () => void };
  secondaryAction?: { label: string; onClick: () => void };
}
```

**Visual spec:**
- Container: flex flex-col items-center justify-center padding-y 48 padding-x 24 gap-2 text-center max-w-[400px] mx-auto
- Icon wrap: h-12 w-12 (48px) rounded-full bg-zinc-50 flex items-center justify-center margin-b 4
- Icon: 32px stroke 1.5 zinc-400
- Title: text-md (14px) weight 500 zinc-900
- Description: text-sm (12px) zinc-500 max-w-[320px] leading-normal
- Action buttons row: flex gap-2 margin-t 12
- Button primary: size sm (h-7) variant outline (NOT primary để subtle)
- Secondary button: size sm ghost

**ASCII render:**
```
+------------------------------+
|                              |
|       [Icon 32 zinc-400]     |  icon wrap 48px rounded-full
|                              |
|    Khong tim thay item nao   |  14px weight 500
|                              |
|    Thu xoa bo loc hoac       |  12px zinc-500 max-w 320
|    tim tu khoa khac          |
|                              |
|    [Xoa bo loc]  [Item moi]  |  h-7 ghost + outline
|                              |
+------------------------------+
total height ~160px padding-y 48
```

**Delta V1:** **Xóa hoàn toàn folder `components/ui/illustrations/`** (18 SVG), dùng Lucide icon 32px thay illustration 120-144px V1. Action button size default→sm ghost.

---

#### 3.3.6 StatusBadge

Đã spec ở §3.2.15 (primitive wrapper với 3-channel). Domain version reuse component.

---

### 3.4 Items components (5)

#### 3.4.1 ItemListTable

**File:** `components/items/item-list-table.tsx`

**Props:**
```ts
interface ItemListTableProps {
  items: Item[];
  selected: Set<string>;
  onSelect: (id: string, checked: boolean) => void;
  onSelectAll: (checked: boolean) => void;
  sortBy?: { field: string; direction: "asc" | "desc" };
  onSort?: (field: string) => void;
}
```

**Visual spec:**
- Container: w-full border border-zinc-200 rounded-md bg-white overflow-hidden
- Header row: h-9 sticky top-[calc(44px+48px)] bg-white border-b-2 border-zinc-200 z-sticky
- Header cell: padding-x 12 text-sm (12px) weight 500 uppercase tracking-wide zinc-500 text-left
- Header sortable: cursor-pointer hover:text-zinc-700 + chevron icon 12 right nếu sort active
- Body row: h-9 border-b border-zinc-100 text-base (13px) zinc-900 hover:bg-zinc-50 transition 100ms
- Selected row: bg-blue-50 border-l-2 border-blue-500 padding-l-[10px]
- Shortage row (stock < min): bg-orange-50 border-l-2 border-orange-500
- Checkbox cell: w-8 padding-x 12 (checkbox h-4 w-4)
- SKU cell: w-32 font-mono text-sm (12px) zinc-700
- Name cell: flex-1 text-base (13px) truncate
- Type cell: w-24 text-sm (12px) zinc-500
- Stock cell: w-20 text-right font-mono text-sm (12px) tabular-nums zinc-700 (or red-600 nếu shortage)
- Status cell: w-24 (StatusBadge sm)
- Actions cell: w-8 icon-button h-7 w-7 ghost (MoreHorizontal 14px)

**Column widths summary (desktop 1172px inner):**
| Col | Width | Total so far |
|---|---|---|
| [checkbox] | 32 | 32 |
| SKU | 128 | 160 |
| Name | flex | ~700 |
| Type | 96 | 796 |
| Stock | 80 | 876 |
| Status | 96 | 972 |
| Actions | 32 | 1004 |
| + padding | — | 1172 |

**ARIA:** `<table role="table" aria-label="Danh sach items">`, header `<th scope="col" aria-sort>`, row `<tr aria-selected>`.

**Delta V1:** Row 48→36, no zebra, status badge sm 18→20, checkbox 20→16.

---

#### 3.4.2 ItemForm

**File:** `components/items/item-form.tsx`

**Visual spec:**
- Form container: space-y-4 (16px gap between sections)
- Section card: padding 20 border border-zinc-200 rounded-md bg-white
- Section header: margin-b 16, text-xs (11px) weight 500 uppercase tracking-wider zinc-500
- Field grid: grid-cols-2 gap-4 desktop, grid-cols-1 mobile
- Field colSpan 2: col-span-2 (Mô tả textarea)
- Field: label + input + helper/error
- Footer sticky: h-14 padding-x 20 border-t border-zinc-100 bg-white flex justify-end gap-2 sticky bottom-0

**ASCII (xem §2.5 đã vẽ đầy đủ).**

**Delta V1:** Section padding 24→20, grid gap 6→4, footer h-16→14.

---

#### 3.4.3 FilterBar

**File:** `components/items/filter-bar.tsx`

**Visual spec:**
- Container: h-9 padding 8 bg-white border border-zinc-200 rounded-md sticky top-11 z-sticky flex items-center gap-2
- Search input: h-8 w-64 text-base (13px) padding-l 28 icon Search 14 absolute left 10
- Filter select: h-8 padding-x 10 border zinc-200 rounded-md text-base (13px)
- Filter chip (when active): Badge h-6 padding-x 8 with close icon 10px text-xs
- Clear button: text-sm (12px) text-blue-600 margin-l auto hover:text-blue-700

**ASCII render (với active filters):**
```
+-- FilterBar h-9 bg-white border zinc-200 ---------------------+
| [search 14] Tim SKU/Ten     | Loai:Raw [x] | NCC:Song Chau [x] |  Clear -> |
+---------------------------------------------------------------+
```

**Delta V1:** Container h-12→h-9, input h-10→h-8, chip h-7→h-6.

---

#### 3.4.4 BulkActionBar

**File:** `components/items/bulk-action-bar.tsx`

**Visual spec:**
- Container: h-12 (48px) sticky bottom-4 mx-auto max-w-[960px] rounded-lg shadow-lg border border-zinc-800 bg-zinc-950 text-white padding-x 16 flex items-center gap-4 animate-slide-up 200ms
- Count: text-base (13px) weight 500 tabular-nums ("3 muc da chon")
- Action buttons: Ghost-on-dark h-7 (28px) padding-x 10 text-sm (12px) text-white hover:bg-white/10
- Primary action on dark: bg-white text-zinc-950 hover:bg-zinc-100 h-7
- Close button: icon-button h-7 w-7 ghost-on-dark (X 14)

**ASCII render:**
```
+-- floating bottom max-w 960 bg-zinc-950 ----------------+
| 3 muc da chon  [Xuat Excel] [Xoa]  [Bo chon]        [x] |  h-12 48px
+---------------------------------------------------------+
```

**Delta V1:** Height 56→48, width full→max-w 960 floating, rounded-none→rounded-lg elevated.

---

#### 3.4.5 ItemQuickEditSheet

**File:** `components/items/item-quick-edit-sheet.tsx`

**Visual spec:** Extend Sheet (§3.2.8) right side w-[480px] với ItemForm trong body. Header "Chỉnh sửa {sku}" 15px weight 600. Footer 2 button "Hủy" outline + "Lưu" primary h-8 default.

**ASCII (xem §3.2.8 Sheet).**

**Delta V1:** Inherit Sheet V2 changes.

---

### 3.5 Import components (2)

#### 3.5.1 ColumnMapperStep

**File:** `components/items/import/column-mapper-step.tsx`

**Visual spec:**
- Layout: 2-column grid grid-cols-[1fr_auto_1fr] gap-4 max-w-[960px] mx-auto
- Source col (Excel header): bg-zinc-50 border zinc-200 rounded-md padding 16
- Arrow col: flex items-center justify-center text-zinc-400 (14px →)
- Target col: bg-white border zinc-200 rounded-md padding 16
- Row item: h-9 flex items-center gap-2 text-base (13px)
- Auto-suggest hint: text-xs (11px) italic text-blue-600 (inline below source)
- Skip button: inline text-xs text-zinc-500 strikethrough "Bỏ qua" hover:text-red-600

**ASCII (xem §2.6 Step 2).**

**Delta V1:** Row h-10→h-9, hint 12→11.

---

#### 3.5.2 ImportWizard

**File:** `components/items/import/import-wizard.tsx`

**Visual spec stepper:**
- Container: h-12 (48px) border-b border-zinc-200 bg-white sticky top-11 z-sticky flex items-center justify-center gap-2 padding-x 24
- Step circle: h-8 w-8 (32px) rounded-full flex items-center justify-center text-sm (12px) weight 600
  - Active: bg-blue-500 text-white
  - Done: bg-emerald-500 text-white + CheckIcon 14px
  - Todo: border border-zinc-300 bg-white text-zinc-500
- Step label: text-base (13px) weight 500 margin-l 8 (active: zinc-900, done: emerald-700, todo: zinc-500)
- Connector: w-16 h-0.5 bg-zinc-200 (todo) / bg-emerald-500 (done) margin-x 12

**ASCII render (step 2 active):**
```
+-- h-12 border-b zinc-200 sticky --------------------------+
| [v1 Tai]===[●2 Mapping]---[o3 Preview]---[o4 Ket qua]     |
+-----------------------------------------------------------+

[v] = emerald-500 + white check icon 14 + label "Tai" emerald-700
[●] = blue-500 + white "2" + label "Mapping" zinc-900 weight 500
[o] = white border zinc-300 + zinc-500 "3" + label "Preview" zinc-500
connector === = emerald (done), --- = zinc-200 (todo)
```

**Delta V1:** Stepper h-16→h-12, circle 40→32, connector gap smaller.

---

### 3.6 Suppliers components (1)

#### 3.6.1 SupplierForm

**File:** `components/suppliers/supplier-form.tsx`

**Visual spec:** Extend ItemForm spec §3.4.2. Sections:
1. THÔNG TIN CƠ BẢN: code* / name* / tax_code (font-mono) / website
2. LIÊN HỆ: contact_name / phone (mono-num) / email / address (textarea min-h 72)
3. GIAO DỊCH: payment_terms / lead_time_days / rating (star 1-5)

**Delta V1:** Section structure unchanged, chỉ token style inherit V2.

---

### 3.7 PWA components (3)

#### 3.7.1 ReceivingConsole

**File:** `components/receiving/receiving-console.tsx`

**Visual spec (xem §2.8 đầy đủ).** Key: current item card border-l-2 orange-500, list row h-14, action bar h-18.

---

#### 3.7.2 BarcodeScanner

**File:** `components/scan/barcode-scanner.tsx`

**Visual spec:**
- Modal full-screen fixed inset-0 z-dialog bg-black
- Camera viewport: w-full aspect-4/3 object-cover
- Guide rectangle: absolute center, w-[64%] h-[32%] border-2 border-dashed border-white/80 rounded-md
- Close button: absolute top-4 right-4 icon-button h-11 w-11 (PWA touch) bg-white/10 text-white
- Scan indicator: bottom h-16 bg-black/50 padding 16 flex items-center gap-3
- Indicator text: text-white text-md (14px) weight 500 "Di chuyen ma vach vao khung"
- Beep: audio context play pure tone
  - Success: 1000Hz 60ms
  - Error: 400Hz 200ms

**ASCII render:**
```
+-- full-screen black --------------------+
|                                     [x] |  close top-right
|                                         |
|     +- camera viewport w 64% -+         |
|     |                         |         |  guide dashed border
|     |   [camera live feed]    |         |
|     |                         |         |
|     +-------------------------+         |
|                                         |
|                                         |
+--- bottom indicator h-16 bg-black/50 ---+
| Di chuyen ma vach vao khung              |
+------------------------------------------+
```

**Delta V1:** Giữ logic V1 100%, chỉ rename token scan-success/danger keyframe sang V2 400ms.

---

#### 3.7.3 ScanQueueBadge

**File:** `components/scan/scan-queue-badge.tsx`

**Visual spec:**
- Position: absolute top-2 right-2 (relative to scan card)
- Badge: h-6 (24px) padding-x 8 text-xs (11px) font-mono tabular-nums weight 600 bg-zinc-950 text-white rounded-full
- Pulse (when queue > 0): animate-pulse (Tailwind default, 2s ease-in-out infinite)
- Offline state: bg-amber-500 text-zinc-950

**ASCII render:**
```
+-- current item card ----+
|                     [3] |  badge top-right, pulse when > 0
| SKU M6-20               |
| ...                     |
+-------------------------+
```

**Delta V1:** Bg slate-900→zinc-950, size unchanged.

---

### 3.8 Login components (2)

#### 3.8.1 LoginHero

**File:** `components/login/login-hero.tsx`

**Visual spec:**
- Container: hidden md:flex md:w-1/2 lg:w-1/2 bg-gradient-to-br from-zinc-50 to-blue-50 padding-16 flex-col justify-between
- Logo top-left: 32px SVG + "MES Xưởng" text-base (13px) weight 600
- Content middle: tagline 20px weight 600 zinc-900 max-w-md line-height 28 + supporting 15px zinc-600 leading-normal max-w-md margin-t 12
- Illustration SVG: max-w-[320px] margin-t 48 stroke 1.5 zinc-400 line-art CNC (refined, không solid fill)
- Footer bottom: BuildInfo right-align text-xs (11px) font-mono zinc-400

**SVG line-art CNC spec:**
- Size viewBox: 320x240
- Stroke: 1.5px zinc-400 (#A1A1AA)
- Elements: machine bed outline, spindle axis, tool holder, BOM tree lines (stylized)
- No solid fills, line-art only
- Export từ Figma/Illustrator → SVG optimized (svgo) < 4KB

**ASCII render:**
```
+-- Hero 50% bg-gradient zinc-50 to blue-50 padding 64 -+
| [LOGO] MES Xuong                                       |  top
|                                                        |
|                                                        |
| Quan ly BOM - Theo doi                                 |  tagline 20px
| ton kho - Thu mua                                      |  weight 600
|                                                        |
| Toi uu workflow xuong co khi 2-10                      |  15px zinc-600
| nguoi tu don hang den giao hang.                       |
|                                                        |
| [SVG line-art CNC stroke 1.5 zinc-400                  |
|  max-w 320px]                                          |
|                                                        |
|                                                        |
| v1.0.0 - build a3f2b [11px mono]                       |  bottom
+--------------------------------------------------------+
```

**Delta V1:** Gradient zinc-50→blue-50 (subtle, not bold slate→blue V1), tagline 36→20px, line-art stroke 1.5 zinc-400 (V1 stroke 2 với fill zinc-900).

---

#### 3.8.2 BuildInfo

**File:** `components/login/build-info.tsx`

**Visual spec:**
- Text: text-xs (11px) font-mono zinc-400 zinc-500 (mobile)
- Content: "v{version} · build {gitSha.slice(0,7)} · {buildDate}"
- Example: "v1.0.0 · build a3f2b · 2026-04-17"
- Truncate on mobile

**ASCII render:**
```
v1.0.0 - build a3f2b - 2026-04-17
```

**Delta V1:** Keep identical (V1 đã OK format).

---

## §4. Font size comparison V1 vs V2

Bảng đầy đủ 35+ row so sánh element-by-element:

| Element | V1 px | V2 px | Delta % | Reason |
|---|---|---|---|---|
| Body default (text-base) | 14 | 13 | -7% | Linear body 13px chuẩn dev-tool SaaS |
| Small text (text-sm) | 13 | 12 | -8% | Meta, helper, timestamp nhẹ hơn |
| Extra small (text-xs) | 12 | 11 | -8% | Label uppercase, kbd, badge |
| Table header uppercase | 13 | 12 | -8% | Subtle hơn, weight 500 tracking-wide |
| Table body cell | 13 | 13 | 0% | Đã OK V1 |
| SKU mono cell | 13 | 12 | -8% | JetBrains Mono smaller legible |
| Button label (default) | 14 | 13 | -7% | |
| Button label (sm) | 13 | 12 | -8% | |
| Button label (xs) | 12 | 11 | -8% | Inline chip button |
| Button label (lg PWA) | 16 | 14 | -13% | Vẫn đủ touch readable |
| Input text (form) | 14 | 13 | -7% | |
| Input text (PWA) | 16 | 14 | -13% | |
| Input placeholder | 14 | 13 | -7% | zinc-400 muted |
| Form label | 14 | 13 | -7% | weight 500 (V1 600) |
| Form section header | 14 | 11 | -21% | Uppercase tracking-wider |
| Helper text | 13 | 12 | -8% | zinc-500 |
| Error text | 13 | 12 | -8% | red-700 + icon 12 |
| H1 page title | 24-30 | 20 | -33% | text-2xl weight 600 tracking-tight |
| H2 section | 20 | 17 | -15% | text-xl weight 600 |
| H3 subsection | 16 | 15 | -6% | text-lg weight 600 |
| H4 subheading | 14 | 14 | 0% | text-md weight 600 |
| H5-H6 | 13-12 | 13-11 | — | Minor |
| Card title | 16-20 | 15 | -25% | text-lg weight 600 |
| Dialog title | 20 | 15 | -25% | text-lg weight 600 |
| Sheet header title | 18 | 15 | -17% | |
| Command palette input | 16 | 14 | -13% | text-md placeholder-zinc-400 |
| Command palette item | 14 | 13 | -7% | |
| KPI label | 14 | 11 | -21% | Uppercase tracking-wide |
| KPI value | 36 | 22 | -39% | weight 500 (NOT bold) tabular-nums |
| KPI delta | 13 | 12 | -8% | font-mono |
| Badge text | 12 | 11 | -8% | uppercase tracking-wide weight 500 |
| StatusBadge label | 11 | 11 | 0% | OK V1 |
| Tab label | 14 | 13 | -7% | weight 500 |
| Sidebar nav item | 14 | 13 | -7% | |
| Sidebar section header | 11 | 11 | 0% | uppercase |
| TopBar breadcrumb | 14 | 13 | -7% | |
| TopBar cmdk hint | 13 | 12 | -8% | zinc-500 |
| Kbd chip | 12 | 11 | -8% | font-mono |
| Avatar text (initial) | 14 | 12 | -14% | font-semibold white bg zinc-700 |
| Empty state title | 16 | 14 | -13% | weight 500 |
| Empty state desc | 14 | 12 | -14% | zinc-500 max-w 320 |
| Tooltip content | — | 12 | NEW | white text on zinc-900 bg |
| Toast title | 14 | 13 | -7% | weight 500 |
| Toast description | 13 | 12 | -8% | |
| Pagination text | 14 | 13 | -7% | |
| Login hero tagline | 36 | 20 | -44% | weight 600 tracking-tight |
| Login hero supporting | 16 | 15 | -6% | zinc-600 leading-normal |
| Login form header | 20 | 20 | 0% | text-2xl weight 600 |
| BuildInfo footer | 12 | 11 | -8% | font-mono zinc-400 |

**Phân bố delta:**
- Average giảm: **-13%** font-size UI toàn app
- KPI hero: -39% (36→22px)
- Heading H1 page: -33% (30→20px)
- Login hero tagline: -44% (36→20px)
- Body / input / button: -7 to -13%
- Labels uppercase: -21%
- Card title / Dialog title: -25%

**Impact:**
- Density tăng ~18% vertical (fit 18 items thay 15 items cùng viewport)
- Hierarchy visual rõ hơn nhờ scale ratio tighter (1.125 → 1.125 nhưng base thấp hơn)
- Cảm giác "ít ERP quê, nhiều modern dev-tool"

---

## §5. Motion specs V2

### 5.1 Hover micro-interactions

| Target | CSS | Duration | Easing |
|---|---|---|---|
| Button bg-color hover | `hover:bg-blue-600` | 100ms | ease-out |
| Button press scale | `active:scale-[0.98]` | 100ms | ease-out |
| Card interactive hover | `hover:translate-y-[-1px] hover:shadow-xs hover:border-zinc-300` | 150ms | ease-out-quart |
| Row hover bg | `hover:bg-zinc-50` | 100ms | ease-out |
| Link hover underline | `hover:underline` (instant) | — | — |
| Input focus glow | border + outline transition | 150ms | ease-out |
| Nav item hover | `hover:bg-zinc-100` | 100ms | ease-out |

**CSS implementation:**
```css
.card-interactive {
  transition:
    transform 150ms cubic-bezier(0.25, 1, 0.5, 1),
    box-shadow 150ms cubic-bezier(0.25, 1, 0.5, 1),
    border-color 100ms ease-out;
}
.card-interactive:hover {
  transform: translateY(-1px);
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.05);
  border-color: #D4D4D8;
}

button.btn-primary {
  transition:
    background-color 100ms ease-out,
    transform 100ms ease-out;
}
button.btn-primary:hover {
  background-color: #2563EB;
}
button.btn-primary:active {
  transform: scale(0.98);
  background-color: #1D4ED8;
}

input {
  transition:
    border-color 150ms ease-out,
    outline-color 150ms ease-out;
}
input:focus-visible {
  border-color: #3B82F6;
  outline: 2px solid #3B82F6;
  outline-offset: 0;
}
```

### 5.2 Dialog / Sheet / Popover open-close

| Component | Open animation | Close animation |
|---|---|---|
| Dialog | fade-in overlay 150ms + dialog-in content 200ms (scale 0.96→1 + opacity 0→1) | fade-out overlay 150ms + dialog-out content 150ms (scale 1→0.98 + opacity 1→0) |
| Sheet (right) | fade-in overlay 150ms + slide-in-right content 200ms | fade-out overlay 150ms + slide-out-right content 200ms |
| Popover | fade-in content 150ms (no transform) | fade-out content 100ms |
| Tooltip | fade-in content 150ms delay 300ms | fade-out content 100ms delay 0 |
| Dropdown | fade-in content 150ms + translate-y-[-4px] → 0 | fade-out content 100ms |
| Toast | slide-up 200ms + fade-in | slide-down 150ms + fade-out |

**Keyframes (global):**
```css
@keyframes fade-in { from { opacity: 0; } to { opacity: 1; } }
@keyframes fade-out { from { opacity: 1; } to { opacity: 0; } }

@keyframes dialog-in {
  from { transform: scale(0.96); opacity: 0; }
  to   { transform: scale(1);    opacity: 1; }
}
@keyframes dialog-out {
  from { transform: scale(1);    opacity: 1; }
  to   { transform: scale(0.98); opacity: 0; }
}

@keyframes slide-in-right {
  from { transform: translateX(100%); opacity: 0; }
  to   { transform: translateX(0);    opacity: 1; }
}
@keyframes slide-out-right {
  from { transform: translateX(0);    opacity: 1; }
  to   { transform: translateX(100%); opacity: 0; }
}

@keyframes toast-slide-up {
  from { transform: translateY(100%); opacity: 0; }
  to   { transform: translateY(0);    opacity: 1; }
}
```

### 5.3 Skeleton shimmer

```css
@keyframes shimmer-sm {
  from { background-position: -200% 0; }
  to   { background-position:  200% 0; }
}

.skeleton {
  background: linear-gradient(
    90deg,
    #F4F4F5 0%,
    rgba(255, 255, 255, 0.5) 50%,
    #F4F4F5 100%
  );
  background-size: 200% 100%;
  animation: shimmer-sm 1200ms linear infinite;
}
```
Duration 1200ms linear infinite. Cấm tăng lên 2000ms (quá chậm) hoặc giảm xuống 800ms (gây dizzy).

### 5.4 Scan feedback (PWA)

| Feedback | Keyframe | Duration | Easing |
|---|---|---|---|
| Scan success | scan-flash-success (outline emerald + bg emerald-50) | 400ms | ease-out-quart |
| Scan danger | scan-flash-danger (outline red + bg red-50) | 400ms | ease-out-quart |
| Scan shake | scan-shake-sm (translateX ±4px, 4 steps) | 300ms | ease-in-out |

```css
@keyframes scan-flash-success {
  0%   { outline: 0 solid rgba(16, 185, 129, 0);     background-color: transparent; }
  30%  { outline: 3px solid rgba(16, 185, 129, 0.5); background-color: #ECFDF5; }
  100% { outline: 0 solid rgba(16, 185, 129, 0);     background-color: transparent; }
}

@keyframes scan-shake-sm {
  0%, 100% { transform: translateX(0); }
  25%      { transform: translateX(-4px); }
  50%      { transform: translateX(4px); }
  75%      { transform: translateX(-2px); }
}
```

Delta V1: 600ms→400ms flash (faster response), shake ±6→±4px (subtler), 4-step shake thay 2-step V1.

### 5.5 Page transition (optional V2.1)

V2.0 không cook page transition (Next.js App Router native). V2.1 có thể thêm:
- Route change: fade-out 150ms → fade-in 200ms
- Skeleton show during loading state

### 5.6 Reduced motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 1ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 1ms !important;
    scroll-behavior: auto !important;
  }

  .skeleton {
    animation: none !important;
    background: #F4F4F5 !important;
  }

  .scan-flash-success,
  .scan-flash-danger,
  .scan-shake {
    animation: none !important;
  }
}
```
Giữ fade 150ms (không gây dizzy) nhưng disable scale/translate/shake.

---

## §6. Accessibility contract V2

### 6.1 Contrast (WCAG 2.1)

| Text pair | Ratio | Standard |
|---|---|---|
| zinc-900 (#18181B) trên zinc-50 (#FAFAFA) | 17.1:1 | AAA body |
| zinc-700 (#3F3F46) trên zinc-50 | 9.2:1 | AAA body |
| zinc-500 (#71717A) trên zinc-50 | 4.9:1 | AA body, AAA large |
| zinc-400 (#A1A1AA) trên zinc-50 | 3.1:1 | AA large/non-text only |
| blue-500 (#3B82F6) trên white | 4.52:1 | AA body pass |
| blue-600 (#2563EB) trên white | 5.17:1 | AA body pass |
| blue-700 (#1D4ED8) trên zinc-50 | 7.01:1 | AAA body |
| emerald-700 trên emerald-50 | 9.8:1 | AAA |
| amber-700 trên amber-50 | 8.9:1 | AAA |
| red-700 trên red-50 | 9.1:1 | AAA |
| orange-700 trên orange-50 | 9.8:1 | AAA |
| white trên blue-500 (primary button) | 4.52:1 | AA |
| white trên red-500 (danger button) | 4.54:1 | AA |
| white trên zinc-950 (BulkActionBar) | 19.8:1 | AAA |

**Forbidden pairs (below AA):**
- zinc-400 trên white for text (< 3:1 for normal text) → chỉ dùng placeholder/icon non-essential
- blue-300 trên white (< 2:1) → decorative only

### 6.2 Focus visible

- Desktop: `outline: 2px solid #3B82F6; outline-offset: 2px;` on `:focus-visible`
- PWA: `outline: 3px solid #2563EB; outline-offset: 2px;` (outdoor 600-900 lux visibility)
- Inverted (on dark bg like BulkActionBar): `outline: 2px solid #FFFFFF; outline-offset: 2px;`
- Mouse `:focus` (no `-visible`): không hiển thị ring (avoid annoying click rings)

### 6.3 3-channel status (icon + label + color)

**Mandatory for all status conveyance:**
- Badge: luôn có icon 10-12px + label uppercase + color variant
- Row highlight: color + border-l-2 + optional icon inline
- Scan feedback: color flash + outline ring + beep sound
- Alert: icon + title + color semantic

**Forbidden:**
- Icon-only status (không label)
- Color-only row (không border/icon differentiator)
- Sound-only feedback (không visual cue)

### 6.4 Keyboard shortcuts (preserve V1)

| Shortcut | Action | Scope |
|---|---|---|
| `Ctrl+K` / `Cmd+K` | Open CommandPalette | Global |
| `/` | Focus search input | Items list, Suppliers list |
| `j` / `k` | Next / Prev row | Table body (focused) |
| `Space` | Toggle select row | Table row focused |
| `e` | Edit focused row | Items list |
| `Enter` | Open detail | Table row focused |
| `Esc` | Close dialog/sheet/dropdown/palette, clear selection | Global contextual |
| `Tab` / `Shift+Tab` | Nav focus order | Form, all interactive |
| `Ctrl+S` | Save form | Form pages |
| `Ctrl+A` | Select all visible | Table (when focus in table) |
| `Shift+click` | Range select | Checkbox column |
| `F2` | Edit in place (future V2.1) | Table cell |

### 6.5 Screen reader

**Live regions:**
- Toast notifications: `<div role="status" aria-live="polite">` cho success/info, `aria-live="assertive"` cho error
- Scan feedback: `<div role="status" aria-live="polite">` text "Da scan M6-20 thanh cong. Da nhan 4/10."
- Loading state: `aria-busy="true"` trên container
- Skeleton: `role="progressbar" aria-label="Dang tai..."`

**Semantic roles:**
- `<nav>`: Sidebar, Breadcrumb
- `<main>`: Main content wrapper with `id="main"` for skip-link
- `<header>`: TopBar
- `<table>`: List tables với `<caption class="sr-only">` hoặc `aria-label`
- `<form>`: Wrap all form sections
- `<dialog>`: Radix Dialog primitive (aria-modal, aria-labelledby)

### 6.6 Reduced motion

Detect via `@media (prefers-reduced-motion: reduce)` + JS `matchMedia` for conditional animation disable. See §5.6.

### 6.7 Touch target (PWA)

- Min 44×44px for touch interactive (WCAG AA)
- Button lg h-11 = 44px
- Input PWA h-11
- List row PWA h-14 = 56px (extra breathing)
- Icon-button PWA h-11 w-11 (44×44)

### 6.8 Vietnamese diacritics

- Font: Inter với subset `['latin', 'latin-ext', 'vietnamese']` qua `next/font/google`
- Test glyphs: `ư ơ đ ươ ướng ưỡng ỷ ỵ ặ ẵ ề ệ ỉ ị ọ ỏ ộ ổ ỡ ụ ủ ý ỳ`
- Font-display: swap (fallback system-ui)
- Preload WOFF2 critical (hero + body weight 400/500/600)

### 6.9 Skip link

```html
<a href="#main" class="skip-link">Bỏ qua menu, đến nội dung chính</a>
```
Focus-visible: translate-y-0 (slide down from top-[-80px]). Z-index 80 (trên topbar 30). Wcag 2.4.1.

### 6.10 Form validation

- Required fields: visible `*` asterisk red-500 + `aria-required="true"`
- Error state: red border + red-700 message + `aria-invalid="true"` + `aria-describedby={errorId}`
- Success state: emerald check icon + optional `aria-describedby={successId}`
- Submit button disabled during async: `aria-busy="true"` + spinner
- Focus management: on validation error, focus-move to first invalid field

---

## §7. Iconography + Illustrations V2

### 7.1 Icon library

- **Lucide React** giữ nguyên V1 (`lucide-react`)
- Sizes standard: 12 (inline xs), 14 (button/icon-button), 16 (nav/default), 18 (PWA), 20 (hero decorative)
- Stroke width: 1.5 default, 2 cho bold emphasis (KPI critical, error icon)
- Color: inherit từ parent text-color (không hardcode)

### 7.2 Empty state icons (replace V1 illustrations)

| Context | Icon | Size |
|---|---|---|
| No items | `Package` | 32 |
| No search results | `Search` | 32 |
| No suppliers | `Handshake` | 32 |
| No PO/receive | `Inbox` | 32 |
| No scan data | `Scan` | 32 |
| Offline | `WifiOff` | 32 |
| No alerts | `Bell` | 32 |
| Import success | `CheckCircle` | 48 |
| Generic error | `AlertCircle` | 32 |

**Icon style:** stroke 1.5, color zinc-400 (on bg-white) hoặc zinc-500 (on bg-zinc-50).

### 7.3 Login hero illustration

- Format: SVG inline (không import external file)
- viewBox: 320×240
- Stroke: 1.5px zinc-400 (#A1A1AA)
- Style: **line-art only** (no solid fills, outline only)
- Content: CNC machine bed stylized + spindle + BOM tree lines + gears subtle
- Refined từ V1 dày/solid → V2 mảnh/outline
- Export: Figma → SVG optimize svgo → inline React component

### 7.4 Delete từ V1

- **Folder `apps/web/src/components/ui/illustrations/`** (18 SVG files V1) — XÓA sạch commit 11
- Các SVG cụ thể: empty-items.svg, empty-suppliers.svg, empty-orders.svg, empty-scan.svg, empty-dashboard.svg, error-404.svg, error-500.svg, login-hero-cnc.svg (replace với refined version inline)

### 7.5 Logo

- Logo MES 32px: SVG inline (giản lược từ V1, chỉ 2 màu — zinc-900 + blue-500 accent dot)
- Favicon: 32x32, 16x16, 180x180 (apple-touch) — generate từ logo SVG qua ImageMagick script

---

## §8. Asset checklist V2

### 8.1 Token files

| File | Action | Note |
|---|---|---|
| `apps/web/tailwind.config.ts` | REPLACE | V2 zinc+blue palette (xem §1.7) |
| `apps/web/src/app/globals.css` | REPLACE | V2 CSS vars + keyframes (xem §1.8) |
| `docs/design-guidelines.md` | ARCHIVE V1, ADD V2 section | Giữ V1 history + append V2 tokens full |
| `docs/design-guidelines-v2.md` | CREATE new | Full V2 spec 200-300 lines, cho dev reference |

### 8.2 Font loading

- `apps/web/src/app/layout.tsx`:
  - REMOVE: `import { Be_Vietnam_Pro } from 'next/font/google'`
  - KEEP: `import { Inter } from 'next/font/google'`
  - ADD options: `subsets: ['latin', 'latin-ext', 'vietnamese'], display: 'swap', weight: ['400', '500', '600']`
  - REMOVE heading className variable (giờ heading = Inter weight 600)

### 8.3 Images / SVG

| Asset | Action | Detail |
|---|---|---|
| PWA icons (192, 384, 512) | KEEP V1 | Đã generate, color zinc-950 + blue-500 dot (cập nhật palette V2 compatible) |
| OG image dynamic | TUNE | `apps/web/src/app/opengraph-image.tsx` update color bg zinc-50 + heading 20px + subtitle 13px zinc-600 (V1 bg slate-50) |
| Favicon | KEEP V1 | 32/16/180 PNG |
| Logo SVG | TUNE | 32px inline, 2 màu zinc-900 + blue-500 dot |
| Login hero SVG | REPLACE | Line-art refined 320x240 stroke 1.5 zinc-400 |
| Illustrations folder | DELETE | 18 files SVG V1 không dùng — xóa commit 11 |

### 8.4 Component files — action matrix

| File | Action | Commit |
|---|---|---|
| `components/ui/button.tsx` | REPLACE full | 2 |
| `components/ui/input.tsx` | REPLACE full | 2 |
| `components/ui/label.tsx` | TUNE class | 2 |
| `components/ui/checkbox.tsx` | REPLACE full | 2 |
| `components/ui/select.tsx` | TUNE size | 2 |
| `components/ui/textarea.tsx` | TUNE class | 2 |
| `components/ui/dialog.tsx` | REPLACE (padding/shadow) | 3 |
| `components/ui/sheet.tsx` | REPLACE (width/animation) | 3 |
| `components/ui/popover.tsx` | TUNE (no arrow) | 3 |
| `components/ui/dropdown.tsx` | TUNE size | 3 |
| `components/ui/tabs.tsx` | REPLACE (underline style) | 3 |
| `components/ui/tooltip.tsx` | CREATE NEW | 3 |
| `components/ui/skeleton.tsx` | TUNE bg color | 3 |
| `components/ui/badge.tsx` | REPLACE (variants + size) | 3 |
| `components/ui/empty-state.tsx` | REPLACE (icon thay illustration) | 5 |
| `components/layout/app-shell.tsx` | TUNE (grid dimensions) | 4 |
| `components/layout/sidebar.tsx` | REPLACE (width, nav style) | 4 |
| `components/layout/top-bar.tsx` | REPLACE (height, cmdk hint) | 4 |
| `components/layout/user-menu.tsx` | TUNE | 4 |
| `components/layout/breadcrumb.tsx` | TUNE font | 4 |
| `components/command/command-palette.tsx` | TUNE (width, item size) | 4 |
| `components/domain/kpi-card.tsx` | REPLACE (NO border-l-4) | 5 |
| `components/domain/orders-readiness-table.tsx` | REPLACE (row 36, no zebra) | 5 |
| `components/domain/alerts-list.tsx` | TUNE | 5 |
| `components/domain/system-health-card.tsx` | TUNE | 5 |
| `components/ui/status-badge.tsx` | TUNE (variants palette V2) | 5 |
| `components/items/item-list-table.tsx` | REPLACE (row 36, no zebra) | 6 |
| `components/items/item-form.tsx` | TUNE (padding/font) | 6 |
| `components/items/filter-bar.tsx` | TUNE (h-9) | 6 |
| `components/items/bulk-action-bar.tsx` | REPLACE (h-12 floating) | 6 |
| `components/items/item-quick-edit-sheet.tsx` | TUNE (inherit sheet V2) | 6 |
| `components/items/import/column-mapper-step.tsx` | TUNE | 7 |
| `components/items/import/import-wizard.tsx` | TUNE (stepper h-12) | 7 |
| `components/suppliers/supplier-form.tsx` | TUNE (inherit ItemForm V2) | 8 |
| `components/receiving/receiving-console.tsx` | TUNE (font PWA override) | 9 |
| `components/scan/barcode-scanner.tsx` | KEEP | 9 |
| `components/scan/scan-queue-badge.tsx` | TUNE (bg zinc-950) | 9 |
| `components/login/login-hero.tsx` | REPLACE (gradient + SVG) | 10 |
| `components/login/build-info.tsx` | KEEP | 10 |

---

## §9. Migration strategy

### 9.1 Branch

- Nguồn: `redesign/direction-b` HEAD (30 commit V1 base)
- Branch mới: `redesign/direction-b-v2` (checkout từ V1 HEAD)
- Không merge V1 → V2 cho đến khi V2 duyệt final

### 9.2 Commit order (12 commits)

| # | Commit | Files | Expected LOC |
|---|---|---|---|
| 1 | `chore(redesign-v2): tokens refactor — tailwind.config zinc+blue, typography scale, spacing 9-value` | tailwind.config.ts, globals.css, docs/design-guidelines-v2.md | +500 / -100 |
| 2 | `refactor(redesign-v2): UI primitives — Button/Input/Label/Checkbox/Select/Textarea` | 6 files | +400 / -250 |
| 3 | `refactor(redesign-v2): UI primitives — Dialog/Sheet/Popover/Dropdown/Tabs/Skeleton/Badge + add Tooltip` | 8 files | +500 / -200 |
| 4 | `refactor(redesign-v2): layout — AppShell/Sidebar/TopBar/UserMenu/Breadcrumb/CommandPalette` | 6 files | +450 / -300 |
| 5 | `refactor(redesign-v2): domain — KpiCard/OrdersReadinessTable/AlertsList/SystemHealthCard/StatusBadge/EmptyState` | 6 files + delete illustrations folder | +350 / -800 (net -450 nhờ xóa SVG) |
| 6 | `refactor(redesign-v2): items — ItemListTable/ItemForm/FilterBar/BulkActionBar/ItemQuickEditSheet` | 5 files | +300 / -250 |
| 7 | `refactor(redesign-v2): import — ColumnMapperStep/ImportWizard` | 2 files | +150 / -120 |
| 8 | `refactor(redesign-v2): suppliers — SupplierForm + routes kế thừa ItemForm` | 2 files | +80 / -60 |
| 9 | `refactor(redesign-v2): pwa — ReceivingConsole/BarcodeScanner/ScanQueueBadge + density override` | 3 files | +150 / -100 |
| 10 | `refactor(redesign-v2): login — LoginHero/BuildInfo + page layout gradient` | 3 files | +200 / -150 |
| 11 | `chore(redesign-v2): cleanup — remove Be Vietnam Pro, slate-* alias legacy, dead illustrations` | cleanup + package.json | +20 / -400 |
| 12 | `docs(redesign-v2): update PROGRESS.md + plans/redesign-v2/260417-v2-design-spec.md` | docs | +300 / -50 |

**Total expected:** ~3400 lines added, ~2780 lines removed. Net +620 (mostly token spec + new Tooltip + design-guidelines-v2.md).

### 9.3 Build local Windows ONLY

Do V1 Direction B build trên VPS mất 13 phút/vòng, V2 tuyệt đối không touch VPS. Workflow:

1. `pnpm install` (first run khoảng 3 phút cache warm)
2. `pnpm -F @iot/web build` local trước mỗi commit (expect 60-120s)
3. `pnpm -F @iot/web dev` → `http://localhost:3000` browser review
4. Iterate: fix class/spec → save → Next.js HMR instant → verify trong browser
5. Commit khi 1 milestone complete (commit 2, 3, 4, 6, 10 là milestone lớn cho review)

### 9.4 User review loop

Mỗi milestone commit, user review browser local:

| Commit | Review target |
|---|---|
| 1 | Skip review (token only, không UI visible change) |
| 2 | Demo page `/v2-preview` hoặc Storybook mini (nếu cook) — show Button/Input/Checkbox/Select mới |
| 3 | Review Dialog/Sheet/Tabs/Tooltip mới — open/close animation |
| 4 | Review shell: login → dashboard → sidebar nav → topbar → cmdk flow |
| 5 | Review dashboard: KPI cards + OrdersReadinessTable + AlertsList |
| 6 | Review /items list → /items/new → /items/[id]/edit |
| 7 | Review /items/import full 4-step wizard flow |
| 8 | Review /suppliers list + detail + form |
| 9 | Review /pwa/receive tablet emulate DevTools (iPad portrait) |
| 10 | Review /login final + overall polish |
| 11 | Post-cleanup smoke test all routes |
| 12 | Docs review + PROGRESS.md |

**Expected:** 5-10 iteration vòng, mỗi vòng user feedback → Claude tune class/spec → rebuild 60-120s → user re-review.

### 9.5 VPS deploy (sau duyệt final)

1. User ping "V2 duyệt OK final"
2. Branch V2 merge vào main HOẶC tạo tag `v2.0.0`
3. Deploy lên VPS MỚI (chưa setup, user prep SSD spec sau)
4. DNS cutover khi V2 LIVE stable 24h
5. VPS cũ (V1 Direction B LIVE) giữ 7 ngày làm fallback rollback

### 9.6 Cửa thoát

Nếu V2 flop sau review loop:
- Rollback về branch `redesign/direction-b` (V1 LIVE, xấu nhưng functional)
- Không merge V2 vào main
- VPS cũ giữ nguyên, DNS không cutover
- Lessons learned → V3 brainstorm (future)

---

## §10. Acceptance criteria merge V2

Trước khi merge V2 → main, verify tất cả:

### 10.1 Design criteria (must-pass)

1. Body font 13px (text-base) — verify `html { font-size: 16px; body { @apply text-base } }` + no text-base class render 14px
2. Row height 36px (h-9) trên list pages — verify items, suppliers, orders readiness table
3. H1 page title 20px weight 600 tracking-tight — verify all page headers
4. KPI value 22px weight 500 tabular-nums — verify dashboard KPI
5. Card padding 16px (list/dashboard) / 20px (form section) — verify via DevTools
6. Button primary h-8 (32px) với bg-blue-500 (không orange) — verify all CTA
7. Focus ring CSS outline 2px blue-500 offset 2px — verify tab navigation
8. No zebra stripe trên table — verify via DOM search no `bg-zebra`
9. Sidebar 220px fixed width (không 240px, no rail-56) — verify viewport DevTools
10. TopBar 44px height (không 56px) desktop — verify

### 10.2 Performance criteria

1. Lighthouse Performance ≥ 90 (mobile)
2. Lighthouse Accessibility ≥ 95
3. Lighthouse Best Practices ≥ 95
4. Lighthouse SEO ≥ 90
5. First Contentful Paint ≤ 1.5s (3G Slow)
6. Largest Contentful Paint ≤ 2.5s
7. Cumulative Layout Shift ≤ 0.05
8. Total Blocking Time ≤ 200ms
9. Bundle size JS ≤ 300KB (gzipped)
10. Font file preload WOFF2 ≤ 80KB total

### 10.3 Accessibility criteria

1. axe-core scan: 0 serious issues, ≤ 3 moderate, ≤ 5 minor
2. Keyboard navigation: all interactive reachable via Tab without mouse
3. Screen reader: NVDA/VoiceOver test critical flows (login → dashboard → item create → item edit) pass
4. Color contrast: all body text ≥ 4.5:1, large text ≥ 3:1
5. Focus visible: every interactive shows outline on focus-visible
6. Touch target: PWA routes ≥ 44×44px
7. Reduced motion: `prefers-reduced-motion: reduce` disables animations except fade
8. Form errors: aria-invalid + aria-describedby paired

### 10.4 Compatibility criteria

1. Chrome 120+, Firefox 120+, Safari 17+, Edge 120+ — no visual regression
2. Mobile Chrome Android 10+, Safari iOS 15+ — no broken layout
3. Resolution test: 375×667 (iPhone SE), 768×1024 (iPad), 1280×720 (laptop), 1440×900 (Mac), 1920×1080 (desktop)
4. Tablet PWA test: iPad portrait + landscape receiving flow

### 10.5 User approval

- User duyệt visual qua screenshot review ≥ 5 màn (login, dashboard, items list, items form, pwa receive)
- User duyệt interaction qua screencast ≥ 3 flow (login → dashboard, items create, items list bulk select)
- User ping final "V2 OK" via chat/GitHub

### 10.6 Build criteria

1. `pnpm -F @iot/web build` pass local Windows (không error, 0 warning treat-as-error)
2. `pnpm -F @iot/web typecheck` pass (0 TS error)
3. `pnpm -F @iot/web lint` pass (0 eslint error)
4. Next.js `/api/health` endpoint 200 OK
5. Smoke test POST `/api/auth/login` → set-cookie → GET `/items` với cookie trả 200

---

## §11. Out of scope V2.0

Những thứ KHÔNG cook trong V2.0, defer V2.1+:

- **Dark mode UI toggle** — reserve CSS var `[data-theme="dark"]`, nhưng không ThemeProvider, không toggle button
- **Diff merge conflict UI** — khi 2 user edit 1 item cùng lúc → V2.0 last-write-wins, V2.1 show diff
- **BOM editor tree view** — planned V1.1 sprint, không động V2.0
- **Mass update tool** — bulk edit 100+ items với field selector → V2.1+
- **Work Orders route** — chưa cook V1, chờ V1.1
- **Orders detail route** — V1 chỉ có stub, giữ nguyên
- **TV dashboard `/tv` mode** — V1.2 với font scale 2x
- **i18n English toggle** — VN-only V2.0
- **Worker container recover** — bug disabled V1, không liên quan visual
- **Dashboard 500 bug root cause debug** — nếu tiện tay fix trong commit 4-5 thì fix, không block V2
- **A11y audit automated (axe-core CI)** — manual test V2.0, CI integration V2.1
- **Unit/integration test UI primitives** — V2.1 sprint
- **Storybook / Component gallery** — optional demo page `/v2-preview`, full Storybook V2.1
- **Custom font fallback stack optimization** — Inter next/font OK V2, custom swap tune V2.1
- **RTL support** (Arabic/Hebrew) — không cần cho MES tiếng Việt
- **Print stylesheet** — có V1, giữ nguyên nhưng không tune token V2
- **Email template redesign** — V2.1 sprint riêng
- **PDF report redesign** — V2.1 sprint riêng

---

## §12. Reuse từ V1 (KHÔNG đổi)

Những thứ tuyệt đối KEEP trong V2, chỉ redesign visual layer:

### 12.1 Business logic

- State machines tất cả (useSelection, useFilterState, useSort, useScanQueue, usePagination)
- URL state (nuqs search params): `?q=`, `?type=`, `?supplier=`, `?status=`, `?page=`, `?per=`, `?sort=`
- Query keys (tanstack-query): `['items', filters]`, `['suppliers']`, `['orders']`, `['scan-queue', poId]`
- Fetch client (`@iot/sdk` package) — không touch
- API routes (`/api/auth`, `/api/items`, `/api/suppliers`, `/api/orders`, `/api/import`, `/api/scan`) — không đổi
- Middleware auth check (cookie-based)
- RBAC logic (role matrix, permission check)
- Database schema (Postgres 16) — không migration structural
- Worker/jobs (currently disabled V1) — không cook V2

### 12.2 Infrastructure

- Next.js 14 App Router structure (folders `(app)/`, `login/`, `pwa/`, `api/`)
- Middleware `middleware.ts`
- Server components + client components boundary
- `next/font/google` Inter loading (chỉ thay đổi subset params)
- Caddy reverse proxy config
- Let's Encrypt cert setup
- Docker compose stack (postgres, redis, web, worker)
- Environment variables (`.env.production`) — không đổi structure

### 12.3 Component logic (keep, chỉ re-style class)

- Keyboard shortcut hooks (`useKeyboardShortcut`)
- CommandPalette fuzzy match logic (cmdk)
- Scan queue offline sync (localStorage + IndexedDB)
- Skeleton render logic (loading state)
- Skip link behavior
- Accessibility focus trap (Radix primitive built-in)
- Pagination URL state binding

### 12.4 Copy / Content

- Tất cả tiếng Việt label, placeholder, error message, tooltip content — không đổi
- Toast messages (success/error/info)
- Button labels ("Lưu", "Hủy", "Xóa", "Tạo mới", "Import")
- Nav items ("Tổng quan", "Items", "Nhà cung cấp", "Nhập kho", "Cài đặt")

### 12.5 Storage keys

- `localStorage['sidebar-collapsed']` → V2 không dùng (bỏ rail) nhưng giữ key để không break V1 users (ignore value)
- `localStorage['theme']` → reserve V2.1 dark toggle
- `localStorage['scan-queue-{poId}']` → keep
- `localStorage['recent-items']` → keep (CommandPalette recent)

### 12.6 PWA

- `manifest.json` — keep (chỉ update theme_color từ orange V1 → blue-500 V2)
- `sw.js` service worker — keep logic
- PWA icons 192/384/512 — keep (palette compatible với V2)

### 12.7 Telemetry / Logging

- Sentry/log client (nếu có) — keep
- GA/analytics (nếu có) — keep
- Error boundary fallback — keep logic, chỉ re-style visual

### 12.8 Safety-orange semantic

- Badge "Shortage" → keep orange-500 icon + orange-700 text
- OrdersReadinessTable shortage row → keep border-l-2 orange-500
- PWA ReceivingConsole current-item → keep border-l-2 orange-500
- Critical stock alert banner → keep bg-orange-50 + text-orange-700

Chỉ **hạ cấp** orange khỏi button/CTA/link — preserve semantic shortage.

---

## Tổng kết V2 design spec

**Tóm tắt 7 quyết định trọng yếu:**

1. **Palette zinc+blue replace slate+orange** — CTA = blue-500, safety-orange = shortage ONLY
2. **Font scale giảm 13% average** — body 13px, H1 20px, KPI value 22px weight 500
3. **Density D3 hybrid** — list row 36px, form padding 20px, dashboard card padding 16px
4. **Bỏ border-l-4 stripe KPI + zebra table + double-drop shadow** — Linear clean aesthetic
5. **1 font Inter thay 2 font V1 (Inter+BeVietnamPro)** — Vietnamese subset đủ
6. **Focus ring CSS outline 2px blue-500** thay box-shadow ring V1
7. **Reserve dark mode CSS var, không cook toggle V2.0** — YAGNI

**Timeline dự kiến cook:** 10-14 ngày, 12 commits, 5-10 vòng iterate review qua browser local.

**Output sau V2:** Branch `redesign/direction-b-v2` sẵn sàng merge main hoặc deploy VPS mới. V1 Direction B giữ làm fallback.

---

*— End of V2 design spec · Claude Opus 4.7 · 2026-04-17*

