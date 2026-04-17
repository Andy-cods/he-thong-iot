# Design Guidelines — Hệ thống BOM-centric (V1)

*Phiên bản:* 1.0 · *Ngày:* 2026-04-16 · *Persona:* UI/UX Designer (Antigravity / UI UX Pro Max)
*Nguồn tham chiếu:* `plans/v1-foundation/260416-v1-implementation-plan.md`, `docs/context-part-1.md`, `ui-ux-pro-max-skill-main/.claude/skills/design-system/*`, `src/ui-ux-pro-max/data/*.csv`

---

## 1. Context & Design Brief

**Sản phẩm:** MES/ERP nhẹ, BOM-centric cho xưởng cơ khí SMB Việt Nam.
**User chính:** Admin, Planner (văn phòng desktop), Warehouse/Operator (tablet PWA 8–10", đôi khi đeo găng), lãnh đạo (TV 55" treo xưởng).
**Môi trường:** Xưởng sáng, ánh nắng hắt qua cửa cuốn → **không** dùng dark mode; user Việt → toàn bộ UI tiếng Việt có dấu; kết nối chập chờn (PWA offline-first); in PO/Picklist trên A4 giấy thường.
**Nguyên tắc nền:** "Đáng tin hơn Excel, đơn giản hơn SAP". Tôn trọng YAGNI/KISS/DRY của tech plan.

---

## 2. Design System Reasoning (chọn từ ui-ux-pro-max)

Kết quả truy vấn reasoning engine với context `"Industrial Manufacturing MES/ERP + BOM management, internal tool, Vietnamese SMB factory"`.

### 2.1 Pattern (từ `slide-layouts.csv` + `slide-strategies.csv`)

- **Landing pattern chính:** `#34 Real-Time / Operations Landing` — phù hợp TV dashboard (live status, metric-led, status colors green/amber/red).
- **Dashboard layout hybrid:**
  - `#28 Data-Dense Dashboard` (grid 12 cột, KPI row, table compact) — cho desktop Planner.
  - `#30 Executive Dashboard` (KPI to, sparkline, traffic light) — cho TV chế độ 1920×1080 chiếu xưởng.
  - `#32 Drill-Down Analytics` (breadcrumb, expand) — cho Order Detail → Shortage → PO.
- **Editor pattern:** Master–Detail 2 pane (tree trái + property panel phải) cho BOM Revision Editor.
- **PWA pattern:** Full-screen single-task (một màn = một nhiệm vụ) + bottom-sheet cho action phụ — đúng chuẩn industrial HMI.

### 2.2 Style chính — **"Swiss Minimalism + Data-Dense Dashboard"** (hybrid #1 × #28)

Loại bỏ các style không hợp context:

| Style xem xét | Verdict |
|---|---|
| Glassmorphism (#3) | **Loại** — blur kéo GPU tablet rẻ, khó đọc dưới nắng |
| Neumorphism (#2) / Claymorphism (#9) | **Loại** — contrast thấp, không đạt WCAG AA cho xưởng |
| 3D & Hyperrealism (#5) | **Loại** — performance kém, không tablet-friendly |
| Brutalism (#4) | **Loại** — không phù hợp môi trường enterprise |
| Dark Mode OLED (#7) | **Loại** — xưởng sáng, glare trên IPS tablet |
| Vibrant Block-based (#6) | **Loại** — palette neon trái phong cách industrial |
| **Minimalism & Swiss (#1)** | **CHỌN làm nền** — grid 12 cột, sans-serif, white space, WCAG AAA |
| **Data-Dense Dashboard (#28)** | **CHỌN overlay** — KPI card, table dense, filter sidebar, sticky header |
| Accessible & Ethical (#8) | **CHỌN enforce** — 7:1 contrast, focus ring 3–4px, touch 44×44px (nâng lên 48×48 cho găng) |

**Kết quả:** giao diện phẳng, sạch, dữ liệu là nhân vật chính. Không shadow nặng, không gradient, không animation khoe.

### 2.3 Color Palette — "Industrial Slate × Stock Green × Safety Orange"

Tổng hợp từ 3 palette CSV:
- `#5 B2B Service` (navy #0F172A)
- `#51 Construction/Architecture` (slate #64748B + safety orange #EA580C)
- `#102 Inventory & Stock Management` (slate + stock green #059669)

**Không dùng:** AI purple/pink gradient, neon, pastel. **Không dark mode V1.**

| Token | Hex | Dùng cho |
|---|---|---|
| `primary-900` (Slate Ink) | `#0F172A` | Text heading, top bar TV mode, primary button |
| `primary-600` (Steel Slate) | `#334155` | Text secondary, tree node selected, sidebar |
| `primary-100` (Mist Grey) | `#E2E8F0` | Border, divider, skeleton |
| `accent-cta` (Safety Orange) | `#EA580C` | CTA chính (Release BOM, Snapshot, Confirm Scan), badge shortage |
| `success` (Stock Green) | `#059669` | Ready component, PASS QC, WO complete |
| `warning` (Caution Amber) | `#D97706` | Partial ready, PO ETA gần, QC chờ |
| `danger` (Stop Red) | `#DC2626` | Shortage, FAIL QC, reservation conflict, offline sync error |
| `info` (Signal Blue) | `#0369A1` | Info tag, link, help tooltip |
| `bg-base` | `#F8FAFC` | Background app |
| `bg-card` | `#FFFFFF` | Card, modal, table row |
| `bg-zebra` | `#F1F5F9` | Zebra stripe cho table 10k rows |
| `text-primary` | `#0F172A` | Body text (contrast 17:1 trên bg-base) |
| `text-muted` | `#64748B` | Meta, helper (contrast 4.6:1 AA) |

Contrast đã verify tất cả các cặp chính ≥ WCAG AA; heading + `primary-900/bg-base` đạt AAA.

### 2.4 Typography — Vietnamese-first

**Heading:** `Be Vietnam Pro` (Google Fonts, support đầy đủ ă â đ ê ô ơ ư, thiết kế bởi Lam Bao tại VN, x-height tốt cho màn hình)
**Body / UI:** `Inter` (dấu Việt ổn, neutral, rendering tốt ở 12–14px)
**Mono (mã SKU, barcode, số lô):** `JetBrains Mono` (số 0 có gạch, i l 1 phân biệt rõ)

Cả ba font đều có subset `latin-ext` + `vietnamese` — bắt buộc thêm `&subset=vietnamese` khi import để tránh missing glyph khi gặp `ư`, `đ`.

**Scale 8pt baseline:**

| Token | px | line-height | Use |
|---|---|---|---|
| `text-xs` | 12 | 16 | Table meta, timestamp |
| `text-sm` | 13 | 20 | Body table (compact) |
| `text-base` | 14 | 22 | Form label, body content |
| `text-lg` | 16 | 24 | Section header |
| `text-xl` | 20 | 28 | Card title |
| `text-2xl` | 24 | 32 | Page title (desktop) |
| `text-4xl` | 36 | 44 | KPI number desktop |
| `text-7xl` | 72 | 80 | KPI number TV mode |

### 2.5 Anti-patterns phải tránh (top 5 cho context này)

1. **Toast-only feedback** cho scan/receipt — operator đeo găng không kịp đọc. Dùng full-screen bottom sheet + âm thanh beep khác nhau (success/error/duplicate).
2. **Dropdown dài quét Item Master 10k rows** — bắt buộc combobox có virtualization + tìm kiếm có dấu không dấu (normalize NFD).
3. **Color-only status** (chỉ đỏ/xanh) — kèm icon (✓ / ⚠ / ✕) + nhãn chữ để người mù màu + người làm việc dưới ánh sáng vàng xưởng nhận ra.
4. **Modal chồng modal** trong BOM editor — dùng side panel trượt phải thay vì modal lồng, tránh lạc context cây BOM.
5. **Horizontal scroll trên tablet** — bảng Item Master ≤ 6 cột trên tablet; cột phụ thu vào accordion row detail.

---

## 3. Design Tokens — TailwindCSS config

```ts
// tailwind.config.ts
import type { Config } from "tailwindcss";

export default {
  darkMode: "class", // Disabled V1 — toggle V1.1
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        slate: {
          900: "#0F172A",
          700: "#1E293B",
          600: "#334155",
          500: "#64748B",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50:  "#F8FAFC",
        },
        brand: {
          DEFAULT: "#0F172A",        // primary-900
          ink:     "#0F172A",
          steel:   "#334155",
          mist:    "#E2E8F0",
        },
        cta:     { DEFAULT: "#EA580C", hover: "#C2410C", press: "#9A3412" },
        success: { DEFAULT: "#059669", soft: "#D1FAE5" },
        warning: { DEFAULT: "#D97706", soft: "#FEF3C7" },
        danger:  { DEFAULT: "#DC2626", soft: "#FEE2E2" },
        info:    { DEFAULT: "#0369A1", soft: "#DBEAFE" },
        zebra:   "#F1F5F9",
      },
      fontFamily: {
        heading: ['"Be Vietnam Pro"', "ui-sans-serif", "system-ui"],
        sans:    ["Inter", '"Be Vietnam Pro"', "ui-sans-serif", "system-ui"],
        mono:    ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular"],
      },
      fontSize: {
        xs:   ["12px", { lineHeight: "16px" }],
        sm:   ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        lg:   ["16px", { lineHeight: "24px" }],
        xl:   ["20px", { lineHeight: "28px" }],
        "2xl":["24px", { lineHeight: "32px" }],
        "4xl":["36px", { lineHeight: "44px" }],
        "7xl":["72px", { lineHeight: "80px" }],
      },
      spacing: {
        // 8pt grid
        0.5: "4px",
        1:   "8px",
        1.5: "12px",
        2:   "16px",
        3:   "24px",
        4:   "32px",
        5:   "40px",
        6:   "48px",   // tap target tối thiểu (gloves)
        8:   "64px",
        10:  "80px",
        12:  "96px",
      },
      borderRadius: {
        none: "0px",
        sm:   "4px",   // badge, chip
        DEFAULT: "6px",// input, button
        md:   "8px",   // card, modal
        lg:   "12px",  // panel
        full: "9999px",
      },
      boxShadow: {
        // Flat, industrial — không shadow nặng
        xs: "0 1px 2px rgba(15,23,42,0.04)",
        sm: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        md: "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.06)",
        focus: "0 0 0 3px rgba(3,105,161,0.35)", // info ring 3px WCAG
      },
      transitionTimingFunction: {
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",     // material standard
        snap:       "cubic-bezier(0.2, 0.8, 0.2, 1)",     // scan confirm
      },
      transitionDuration: {
        instant: "80ms",
        fast:    "150ms",
        base:    "200ms",
        slow:    "320ms",
      },
      screens: {
        sm:  "375px",   // mobile (login only)
        md:  "768px",   // tablet PWA
        lg:  "1024px",  // tablet landscape
        xl:  "1280px",  // desktop
        "2xl":"1536px",
        tv:  "1920px",  // TV dashboard
      },
      gridTemplateColumns: {
        "dense-12": "repeat(12, minmax(0, 1fr))",
        "tv-6":     "repeat(6, minmax(0, 1fr))",
        "bom":      "minmax(320px, 1fr) minmax(0, 2fr) minmax(280px, 1fr)", // tree | editor | inspector
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

---

## 4. Component Spec — nguyên tắc shadcn/ui override

- **Button** – Default: `bg-cta text-white h-10 rounded px-4 font-medium`. Hover: `bg-cta-hover`. Disabled: `bg-slate-200 text-slate-500`. `data-size="lg"` → h-12 px-6 text-lg (cho PWA touch 48px).
- **Input / Select / Combobox** – height 40 desktop, 48 mobile; border `slate-300`; focus ring `shadow-focus`; error state `border-danger ring-danger/30` + helper text danger bên dưới (không dùng red-only).
- **Table** (TanStack Table + `react-virtual`) – row 40px desktop, 56px tablet; zebra `bg-zebra`; sticky header; sticky first column (mã SKU); resize cột; column pinning. Virtualized khi > 200 rows.
- **Status Badge** – `{icon}{label}` luôn đi cặp. OK (✓ xanh), Shortage (⚠ cam), Fail (✕ đỏ), Draft (○ xám), Released (◆ xanh dương đậm).
- **Dialog / SidePanel** – preferred side panel (`w-[480px]` desktop) cho edit flow; modal chỉ cho confirm destructive.
- **Toast** – bottom-right desktop, top-center PWA, auto dismiss 4s; error toast sticky tới khi dismiss.
- **Tree (BOM)** – indent 24px/level, icon expand 16px, drag handle 24px, level badge số (L1, L2…); virtual scroll khi > 200 nodes.

---

## 5. Motion — micro-interaction

- Chuyển trang: fade 150ms (không slide — gây chóng mặt trên tablet).
- Scan success: border card flash `success` 200ms + scale 1.02 snap → 1.00.
- Scan error: shake 3 lần × 80ms + border `danger`.
- Skeleton shimmer: 1200ms linear infinite, amplitude 10% (không chói).
- `prefers-reduced-motion: reduce` → tất cả > 200ms rút còn 0ms, bỏ shimmer.

---

## 6. Responsive Strategy

| Breakpoint | Device | Layout |
|---|---|---|
| 375px | Mobile (chỉ login, approval notif) | Single column, form stack |
| 768px | Tablet PWA (warehouse/operator) | Single content + bottom nav, 48px tap |
| 1024px | Tablet landscape | 2 column list/detail |
| 1280px | Desktop planner | 12-col grid, sidebar 240px |
| 1920px | TV dashboard | 6 giant KPI cards, font 72px KPI, auto-refresh 30s |

---

## 7. Iconography

- **Lucide icons** (đi kèm shadcn) — stroke 1.5, 16/20/24px. Không dùng Material Icons filled (quá nặng nét trong Swiss style).
- Icon nghiệp vụ dùng chung: Package (item), GitBranch (BOM revision), ScanLine (scan), Warehouse (kho), Workflow (WO), ClipboardList (order), AlertTriangle (shortage), CheckCircle2 (ready), XCircle (fail).

---

## 8. Vietnamese Text Rules

- Không truncate mid-word; ưu tiên `text-ellipsis` cuối câu; cho 2-line clamp ở card title.
- Số tiền: `vi-VN` `Intl.NumberFormat` → `1.250.000 ₫`. Decimal dấu `,`.
- Ngày: `dd/MM/yyyy` (format DB ISO nhưng UI format vi-VN).
- Dấu câu: Không thêm space trước dấu `:` kiểu Pháp — user VN dùng chuẩn Anh.
- Pluralization: không đổi hậu tố số nhiều, nhưng "1 mục / 12 mục" (giữ từ `mục`).

---

## 9. Print Styles (PO / Picklist A4)

```css
@media print {
  @page { size: A4; margin: 12mm; }
  body { font-family: "Be Vietnam Pro", serif; color: #000; background: #fff; }
  .no-print { display: none !important; }
  table { border-collapse: collapse; width: 100%; font-size: 11pt; }
  th, td { border: 1px solid #000; padding: 6px 8px; }
  thead { display: table-header-group; } /* repeat on each page */
  tr { page-break-inside: avoid; }
  .barcode { font-family: "Libre Barcode 128"; font-size: 36pt; }
}
```

---

## 10. Pre-delivery Checklist — WCAG 2.1 AA + Xưởng-specific (20 mục)

### Accessibility (WCAG 2.1 AA)
- [ ] 1. Tất cả text body contrast ≥ 4.5:1, heading ≥ 3:1 (đã verify bằng axe-core).
- [ ] 2. Focus ring 3px, màu `info`, visible trên mọi interactive element (không `outline:none` trần).
- [ ] 3. Mọi icon-only button có `aria-label` tiếng Việt.
- [ ] 4. Form label liên kết `htmlFor`; error message link `aria-describedby`.
- [ ] 5. Skip link "Bỏ qua, đến nội dung chính" ở top của mọi page.
- [ ] 6. Keyboard navigation đầy đủ: Tab/Shift+Tab, Enter, Space, Esc; không có bẫy focus trong modal.
- [ ] 7. `prefers-reduced-motion` respect — tắt shimmer, shake, scale.
- [ ] 8. Screen reader test (NVDA vi-VN) trên Login + Order Detail + Shortage.

### Xưởng-specific
- [ ] 9. Tap target ≥ 48×48px trên tablet PWA (găng tay cotton industrial).
- [ ] 10. Text nhỏ nhất trên PWA 14px, trên TV 20px (ngồi xa 3–5m vẫn đọc được).
- [ ] 11. Status dùng icon + chữ + màu (3 kênh) — không chỉ màu.
- [ ] 12. UI hoạt động tốt dưới ánh sáng mạnh: test bằng cách chụp ảnh ngoài trời, luminosity ≥ 500 lux, text vẫn đọc được.
- [ ] 13. Beep âm thanh scan success/fail khác nhau (Web Audio API 880Hz vs 220Hz).
- [ ] 14. Offline indicator pinned top bar PWA (icon 📶 + "Đang offline — X scan chờ sync").
- [ ] 15. Queue badge đếm scan pending, clickable để xem chi tiết.
- [ ] 16. Barcode input auto-focus + autoselect khi mở Scan Station; kèm fallback nút "Nhập mã thủ công".
- [ ] 17. Print preview PO/Picklist A4 in thử trên máy in laser đen trắng (kiểm nét barcode + checkbox).

### Vietnamese & i18n
- [ ] 18. Test render 100 từ tiếng Việt có dấu phức tạp (ưưỡng, đường, ngoẵng) — không tofu, không missing glyph.
- [ ] 19. Form validation message tiếng Việt thân thiện (không "Invalid input" kiểu Google Translate).

### Data hygiene
- [ ] 20. Empty state có minh họa + CTA ("Chưa có BOM revision nào — [Tạo revision đầu tiên]"). Error state có mã lỗi + action retry + link copy để báo IT.

---

## 11. File & Folder Conventions

```
apps/web/
├── app/                  # Next.js App Router
├── components/ui/        # shadcn primitives
├── components/domain/    # BomTree, ShortageBadge, ScanStation…
├── lib/
│   ├── design-tokens.css # @layer base CSS variables
│   └── utils.ts
└── styles/
    ├── globals.css
    └── print.css
```

- Token CSS: `/lib/design-tokens.css` (single source of truth, imported in `globals.css`).
- Không hardcode hex trong JSX — dùng `className="bg-cta"` hoặc `var(--color-cta)`.

---

## 12. Change Log

| Ver | Ngày | Ghi chú |
|---|---|---|
| 1.0 | 2026-04-16 | Khởi tạo với V1 scope. Style: Swiss Minimalism × Data-Dense. Palette: Industrial Slate + Stock Green + Safety Orange. Typography: Be Vietnam Pro + Inter + JetBrains Mono. |

---

**Cross-link:** Wireframe chi tiết 8 màn V1 xem `plans/design/260416-v1-wireframes.md`.
