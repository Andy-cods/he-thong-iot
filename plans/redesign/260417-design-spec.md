# Design Spec chi tiết — UI/UX Redesign Direction B

*Phiên bản:* 1.0 · *Ngày:* 2026-04-17 · *Persona:* UI/UX Designer (ui-ux-pro-max)
*Nguồn tham chiếu:* `plans/redesign/260417-brainstorm.md` §5, `docs/design-guidelines.md`, `plans/design/260416-v1-wireframes.md`, `apps/web/tailwind.config.ts`, `apps/web/src/app/globals.css`
*Mục tiêu:* Blueprint cấp implementation — dev có thể cook trực tiếp theo từng section, không cần hỏi lại.

**Ràng buộc bất di bất dịch:**
- Palette giữ nguyên Industrial Slate × Stock Green × Safety Orange (không đổi).
- Không dark mode V1 (design-guidelines.md §2.2 cấm).
- Không over-engineer — mọi component phải justify theo 1 trong 8 screens.
- Tiếng Việt toàn bộ UI + code comment.

---

## §1. Design system updates

### 1.1 Tokens thêm / đổi

#### 1.1.1 Color — bổ sung

| Token | Hex | RGB | Contrast (trên `#F8FAFC`) | Dùng cho |
|---|---|---|---|---|
| `success-strong` | `#047857` | 4 120 87 | 7.4:1 (AAA) | Scan confirm label, Ready 100% text |
| `warning-strong` | `#B45309` | 180 83 9 | 7.2:1 (AAA) | Partial ready label trên light bg |
| `danger-strong` | `#B91C1C` | 185 28 28 | 7.1:1 (AAA) | Shortage critical text, error dialog title |
| `info-strong` | `#0C4A6E` | 12 74 110 | 10.1:1 (AAA) | Link body, help text link |
| `slate-400` | `#94A3B8` | 148 163 184 | 4.6:1 (AA) | Icon muted, placeholder text |
| `border-focus` | `#0369A1` | 3 105 161 | — | `outline` solid cho focus-visible (pair với shadow) |
| `scan-flash-success` | `#D1FAE5` | 209 250 229 | — | Overlay flash khi scan OK (80% opacity) |
| `scan-flash-danger` | `#FEE2E2` | 254 226 226 | — | Overlay flash khi scan FAIL |
| `overlay-scrim` | `rgba(15, 23, 42, 0.48)` | — | — | Dialog backdrop, Sheet overlay |

**Lý do:** scale `slate` hiện thiếu 400; 3 màu status trong guidelines chưa có biến -strong để đạt AAA khi đặt trên `bg-card` (#FFFFFF). Scan flash cần màu pastel riêng để tránh chói khi làm overlay 200ms.

#### 1.1.2 Spacing — bổ sung

| Token | Px | Dùng cho |
|---|---|---|
| `7` | `56px` | Top bar height, sticky filter bar, scan row tablet |
| `9` | `72px` | Action bar bottom (PWA), page header height |
| `14` | `112px` | KPI card min-height desktop |
| `18` | `144px` | Empty state illustration width |
| `22` | `176px` | Sidebar collapsed → expanded gap animate từ 56→240 |
| `60` | `240px` | Sidebar expanded |
| `sidebar-collapsed` | `56px` | Sidebar icon-only |

**CSS custom property thêm:**
```css
--sidebar-width: 240px;
--sidebar-width-collapsed: 56px;
--topbar-height: 56px;
--content-max-width: 1440px;
```

#### 1.1.3 Elevation — bổ sung

| Token | Value | Dùng cho |
|---|---|---|
| `shadow-pop` | `0 10px 15px -3px rgba(15,23,42,0.10), 0 4px 6px -4px rgba(15,23,42,0.08)` | Popover, command palette, sheet |
| `shadow-dialog` | `0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.08)` | Dialog (destructive confirm) |
| `shadow-toast` | `0 8px 24px rgba(15,23,42,0.14)` | Sonner toast |
| `shadow-scan-success` | `0 0 0 4px rgba(5, 150, 105, 0.35)` | Outer ring quanh row khi scan OK |
| `shadow-scan-error` | `0 0 0 4px rgba(220, 38, 38, 0.35)` | Outer ring quanh row khi scan FAIL |
| `shadow-focus-strong` | `0 0 0 3px rgba(3,105,161,0.55)` | Focus ring contrast cao cho PWA (outdoor) |

#### 1.1.4 Motion — bổ sung

| Token | Value | Dùng cho |
|---|---|---|
| `duration-instant` | `80ms` | Hover state |
| `duration-fast` | `150ms` | Fade in/out, tooltip, skeleton step |
| `duration-base` | `200ms` | Sheet slide, dialog fade, scan flash |
| `duration-slow` | `320ms` | Sidebar collapse/expand |
| `duration-shimmer` | `1200ms` | Skeleton shimmer cycle |
| `duration-shake` | `80ms × 3` | Scan error shake (3 lần × 80ms) |
| `ease-industrial` | `cubic-bezier(0.4, 0, 0.2, 1)` | Material standard — default |
| `ease-snap` | `cubic-bezier(0.2, 0.8, 0.2, 1)` | Scan confirm, sheet spring |
| `ease-in-soft` | `cubic-bezier(0.4, 0, 1, 1)` | Sheet exit |

### 1.2 Z-index scale (chính thức)

```css
--z-base: 0;
--z-sticky: 10;        /* Sticky filter bar, sticky table header */
--z-sidebar: 20;       /* Sidebar overlay trên mobile drawer */
--z-topbar: 30;        /* Top bar (trên sidebar khi mobile) */
--z-dropdown: 40;      /* UserMenu, combobox */
--z-command-palette: 50; /* Cmd+K */
--z-dialog: 60;        /* Destructive confirm */
--z-toast: 70;         /* Sonner (trên cùng) */
--z-skip-link: 80;     /* Skip to content (focus first) */
```

**Lý do gap 10:** cho phép insert layer trung gian (VD: banner offline z-25) mà không phải rebalance toàn bộ.

### 1.3 `tailwind.config.ts` diff đề xuất

Patch cụ thể — apply trên file hiện tại (`apps/web/tailwind.config.ts`):

```ts
// ... giữ nguyên slate/brand/cta tới dòng 44

      colors: {
        slate: {
          900: "#0F172A",
          700: "#1E293B",
          600: "#334155",
          500: "#64748B",
          400: "#94A3B8",   // ← THÊM
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50:  "#F8FAFC",
        },
        brand: {
          DEFAULT: "#0F172A",
          ink:     "#0F172A",
          steel:   "#334155",
          mist:    "#E2E8F0",
        },
        cta: {
          DEFAULT: "#EA580C",
          hover:   "#C2410C",
          press:   "#9A3412",
          soft:    "#FFEDD5",   // ← THÊM (cho highlight current row PWA picklist)
        },
        success: { DEFAULT: "#059669", strong: "#047857", soft: "#D1FAE5" },
        warning: { DEFAULT: "#D97706", strong: "#B45309", soft: "#FEF3C7" },
        danger:  { DEFAULT: "#DC2626", strong: "#B91C1C", soft: "#FEE2E2" },
        info:    { DEFAULT: "#0369A1", strong: "#0C4A6E", soft: "#DBEAFE" },
        scan: {
          "flash-success": "#D1FAE5",
          "flash-danger":  "#FEE2E2",
        },
        zebra:   "#F1F5F9",
        overlay: "rgba(15, 23, 42, 0.48)",
      },

      // ... fontFamily + fontSize giữ nguyên

      spacing: {
        0.5: "4px",
        1:   "8px",
        1.5: "12px",
        2:   "16px",
        3:   "24px",
        4:   "32px",
        5:   "40px",
        6:   "48px",
        7:   "56px",   // ← THÊM (top bar, sticky filter)
        8:   "64px",
        9:   "72px",   // ← THÊM (PWA action bar)
        10:  "80px",
        12:  "96px",
        14:  "112px",  // ← THÊM (KPI card)
        18:  "144px",  // ← THÊM (empty state illustration)
        22:  "176px",
        60:  "240px",  // ← THÊM (sidebar expanded)
      },

      // ... borderRadius giữ nguyên

      boxShadow: {
        xs:    "0 1px 2px rgba(15,23,42,0.04)",
        sm:    "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        md:    "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.06)",
        pop:   "0 10px 15px -3px rgba(15,23,42,0.10), 0 4px 6px -4px rgba(15,23,42,0.08)",
        dialog:"0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.08)",
        toast: "0 8px 24px rgba(15,23,42,0.14)",
        focus: "0 0 0 3px rgba(3,105,161,0.35)",
        "focus-strong": "0 0 0 3px rgba(3,105,161,0.55)",
        "scan-success": "0 0 0 4px rgba(5,150,105,0.35)",
        "scan-error":   "0 0 0 4px rgba(220,38,38,0.35)",
      },

      zIndex: {
        base: "0",
        sticky: "10",
        sidebar: "20",
        topbar: "30",
        dropdown: "40",
        "command-palette": "50",
        dialog: "60",
        toast: "70",
        "skip-link": "80",
      },

      transitionTimingFunction: {
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        snap:       "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "in-soft":  "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        instant: "80ms",
        fast:    "150ms",
        base:    "200ms",
        slow:    "320ms",
        shimmer: "1200ms",
      },

      keyframes: {
        "shimmer": {
          "0%":   { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "shake": {
          "0%,100%": { transform: "translateX(0)" },
          "25%":     { transform: "translateX(-6px)" },
          "75%":     { transform: "translateX(6px)" },
        },
        "flash-success": {
          "0%":   { boxShadow: "0 0 0 0 rgba(5,150,105,0)", backgroundColor: "transparent" },
          "30%":  { boxShadow: "0 0 0 4px rgba(5,150,105,0.35)", backgroundColor: "#D1FAE5" },
          "100%": { boxShadow: "0 0 0 0 rgba(5,150,105,0)", backgroundColor: "transparent" },
        },
        "flash-danger": {
          "0%":   { boxShadow: "0 0 0 0 rgba(220,38,38,0)", backgroundColor: "transparent" },
          "30%":  { boxShadow: "0 0 0 4px rgba(220,38,38,0.35)", backgroundColor: "#FEE2E2" },
          "100%": { boxShadow: "0 0 0 0 rgba(220,38,38,0)", backgroundColor: "transparent" },
        },
        "slide-in-right": {
          "0%":   { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-right": {
          "0%":   { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
        "fade-in": {
          "0%":   { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%":   { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        "shimmer":       "shimmer 1200ms linear infinite",
        "shake":         "shake 240ms ease-industrial 1",          // 80ms × 3
        "flash-success": "flash-success 600ms ease-snap 1",
        "flash-danger":  "flash-danger 600ms ease-snap 1",
        "slide-in-right":  "slide-in-right 200ms ease-snap",
        "slide-out-right": "slide-out-right 200ms ease-in-soft",
        "fade-in":       "fade-in 150ms ease-industrial",
        "fade-out":      "fade-out 150ms ease-industrial",
      },

      // ... screens + gridTemplateColumns giữ nguyên
```

### 1.4 `globals.css` keyframe + utility mới

Append vào `apps/web/src/app/globals.css` sau block `@layer base`:

```css
/* ===========================================================
 * Scan feedback utilities (PWA Receiving / Picklist)
 * =========================================================== */
@layer components {
  .scan-row-current {
    @apply border-l-4 border-cta bg-cta-soft/60;
  }

  .scan-flash-success {
    animation: flash-success 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 1;
  }

  .scan-flash-danger {
    animation: flash-danger 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 1;
  }

  .scan-shake {
    animation: shake 240ms cubic-bezier(0.4, 0, 0.2, 1) 1;
  }

  .skeleton {
    @apply relative overflow-hidden bg-slate-200;
    background-image: linear-gradient(
      90deg,
      transparent 0%,
      rgba(255, 255, 255, 0.55) 50%,
      transparent 100%
    );
    background-size: 200% 100%;
    animation: shimmer 1200ms linear infinite;
  }

  .tabular-nums {
    font-variant-numeric: tabular-nums;
    font-feature-settings: "tnum" 1;
  }
}

/* ===========================================================
 * Reduced motion override — tắt shimmer + shake + flash
 * =========================================================== */
@media (prefers-reduced-motion: reduce) {
  .skeleton {
    animation: none !important;
    background: var(--color-brand-mist) !important;
  }
  .scan-flash-success,
  .scan-flash-danger,
  .scan-shake {
    animation: none !important;
  }
}

/* ===========================================================
 * Print — đè print.css (đã có trong guidelines §9)
 * Giữ nguyên, không thay đổi V1.
 * =========================================================== */
```

### 1.5 Typography fine-tuning

| Element | Font | Weight | Size | Tracking | Áp dụng |
|---|---|---|---|---|---|
| Page title | Be Vietnam Pro | 600 | 24px / lh 32px | -0.01em | `h1` page header |
| Section header | Be Vietnam Pro | 600 | 16px / lh 24px | 0 | Tabs label, form section |
| KPI number (desktop) | Be Vietnam Pro | 700 | 36px / lh 44px | -0.02em | KpiCard `.value` |
| KPI number (TV) | Be Vietnam Pro | 700 | 72px / lh 80px | -0.03em | TV kiosk (V1.1) |
| Body table | Inter | 400 | 13px / lh 20px | 0 | `td` compact |
| Body form | Inter | 400 | 14px / lh 22px | 0 | `input`, `label` |
| Helper text | Inter | 400 | 12px / lh 16px | 0 | Form helper, caption |
| Mono SKU / barcode | JetBrains Mono | 500 | 13px / lh 20px | 0 | `.font-mono.tabular-nums` |
| Mono KPI delta | JetBrains Mono | 500 | 13px / lh 20px | 0 | `+12%`, `-3` |

**Font loading strategy:** `next/font/google` với `preload: true` cho Be Vietnam Pro + Inter, `preload: false` cho JetBrains Mono (chỉ dùng table/badge). Subset bắt buộc: `latin`, `latin-ext`, `vietnamese`.

```ts
// apps/web/src/app/layout.tsx
import { Be_Vietnam_Pro, Inter, JetBrains_Mono } from "next/font/google";

const beVietnamPro = Be_Vietnam_Pro({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-heading",
  display: "swap",
  preload: true,
});
const inter = Inter({
  subsets: ["latin", "latin-ext", "vietnamese"],
  weight: ["400", "500", "600"],
  variable: "--font-sans",
  display: "swap",
  preload: true,
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
  preload: false,
});
```

---

## §2. Screen specs (8 screens)

### 2.1 `/login` — Auth split 50/50

**Route:** `/login` · **Role:** tất cả · **Priority:** P0

#### Layout grid

| Breakpoint | Grid | Notes |
|---|---|---|
| mobile ≤ 767px | 1 col, padding 16px horizontal | Logo + form stack, hero ẩn |
| md 768–1023px | 1 col centered, max-w 480px, padding 32px | Hero ẩn (saving space) |
| lg 1024–1279px | 2 col 50/50, hero fade-in | Hero SVG height 360px |
| xl ≥ 1280px | 2 col 50/50, hero full | Hero SVG height 480px |

Card form: `max-w-[420px]`, padding `32px`, border-radius `8px`, shadow `sm`.

#### ASCII wireframe — state variants

**Populated (xl 1440×900):**
```
╔════════════════════════════════════════════════════════════════════╗
║ ┌─ Left 50% (hero) ──────────────┐ ┌─ Right 50% (form) ──────────┐ ║
║ │ bg: slate-900 gradient         │ │ bg: bg-base (F8FAFC)        │ ║
║ │                                 │ │                              │ ║
║ │   [LOGO 64×64]                 │ │ ┌─ Card (max-w 420) ──────┐  │ ║
║ │   Xưởng IoT                    │ │ │                          │  │ ║
║ │   BOM-centric MES              │ │ │  Đăng nhập               │  │ ║
║ │                                 │ │ │  Quản lý xưởng cơ khí    │  │ ║
║ │   [SVG CNC line-art            │ │ │                          │  │ ║
║ │    480×360 monochrome          │ │ │  Tài khoản *             │  │ ║
║ │    stroke slate-300 1.5px]     │ │ │  [admin________________] │  │ ║
║ │                                 │ │ │                          │  │ ║
║ │                                 │ │ │  Mật khẩu *              │  │ ║
║ │                                 │ │ │  [••••••••••] [👁]       │  │ ║
║ │                                 │ │ │                          │  │ ║
║ │                                 │ │ │  ☐ Ghi nhớ 7 ngày        │  │ ║
║ │                                 │ │ │                          │  │ ║
║ │                                 │ │ │  [   Đăng nhập        ]  │  │ ║
║ │                                 │ │ │                          │  │ ║
║ │                                 │ │ │  Quên mật khẩu?          │  │ ║
║ │                                 │ │ │  Liên hệ IT nội bộ       │  │ ║
║ │                                 │ │ └──────────────────────────┘  │ ║
║ │                                 │ │                              │ ║
║ │ v1.0.0 · build abc123 · 14:23  │ │                              │ ║
║ └─────────────────────────────────┘ └──────────────────────────────┘ ║
╚════════════════════════════════════════════════════════════════════╝
```

**Loading (submit):**
```
┌─ Card ──────────────────┐
│ Đăng nhập               │
│ ...                     │
│ [ ⟳ Đang xác thực... ] │  ← button disabled, spinner 16px, bg-slate-400
│                         │
│ Inputs disabled         │
└─────────────────────────┘
```

**Error (sai password):**
```
┌─ Card ──────────────────┐
│ Đăng nhập               │
│                         │
│ Tài khoản *             │
│ [admin_______________]  │  ← border slate-300
│                         │
│ Mật khẩu *              │
│ [••••••••]  [👁]        │  ← border danger (#DC2626), ring danger/30
│ ✕ Sai tài khoản hoặc    │  ← text-danger-strong (#B91C1C), 12px
│    mật khẩu             │
│                         │
│ [   Đăng nhập        ]  │
└─────────────────────────┘
```

**Error (sau 5 lần sai — CAPTCHA Dialog z-60):**
```
Dialog (modal, w-400)
┌──────────────────────────────────┐
│  Xác minh bảo mật             ✕ │
├──────────────────────────────────┤
│  Đã sai 5 lần. Nhập captcha:    │
│  ┌──────────────────┐            │
│  │  [captcha img]   │            │
│  └──────────────────┘            │
│  [____________________________] │
│                                  │
│  [Huỷ]  [Xác minh]              │
└──────────────────────────────────┘
```

#### Component tree

```
LoginPage
├── LoginHero (desktop only, lg+)
│   ├── LogoMark (SVG 64×64)
│   ├── BrandLockup (heading + tagline)
│   ├── HeroIllustration (CNC line-art SVG 480×360)
│   └── BuildFooter (version + commit + time)
└── LoginForm
    ├── Card
    │   ├── CardHeader (title + subtitle)
    │   ├── Form (react-hook-form + zod)
    │   │   ├── FormField (username)
    │   │   ├── FormField (password) + PasswordToggle
    │   │   ├── Checkbox (remember-me)
    │   │   └── Button (submit)
    │   └── CardFooter (forgot + contact links)
    └── CaptchaDialog (conditional, attempts ≥ 5)
```

#### Interactions state machine

| Event | From state | To state | Side effect |
|---|---|---|---|
| mount | — | idle | focus `#username`, load captcha if `attempts ≥ 5` from localStorage |
| input blur (invalid format) | idle | field-error | show inline error, shake field 240ms |
| submit (valid) | idle | loading | disable form, swap button text "Đang xác thực...", spinner |
| response 200 | loading | success | redirect `/`, toast "Xin chào, {{fullName}}" (bottom-right) |
| response 401 | loading | form-error | increment attempts, focus `#password`, clear password field, show banner |
| response 401 + attempts ≥ 5 | form-error | captcha-required | open CaptchaDialog (z-60) |
| response 429 (rate limit) | loading | locked | banner sticky "Đã khoá 5 phút — thử lại sau", disable form, countdown timer |
| response 500 | loading | form-error | banner danger + button "Thử lại" |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `Tab` | navigate fields (username → password → remember → submit → forgot link) |
| `Enter` (in any input) | submit form |
| `Space` (on toggle) | toggle password visibility |
| `Esc` (in CaptchaDialog) | close dialog (restore form state) |

#### Responsive rules

- **md (768–1023px):** hide `.login-hero`, center form card, show logo top-center above card.
- **lg (1024px+):** show hero left 50%, form right 50%; form card vertically centered.
- **xl (1280px+):** hero SVG scale up to 480×360; brand typography from 20px → 24px.

#### Acceptance criteria

- [ ] Hero SVG load dưới 50KB, inline SVG (không request riêng).
- [ ] Input focus-visible có `shadow-focus` (3px info ring) — không `focus:ring-0`.
- [ ] Tap target button ≥ 48×48px (h-12 mobile, h-10 desktop OK vì mouse).
- [ ] Password toggle icon-button có `aria-label="Hiện mật khẩu"` / `"Ẩn mật khẩu"`.
- [ ] Remember checkbox dùng shadcn `Checkbox` (không native).
- [ ] Build footer hiển thị `NEXT_PUBLIC_BUILD_VERSION` + `NEXT_PUBLIC_BUILD_COMMIT_SHORT`.
- [ ] Redirect sau login: `/` (Dashboard), không `/app`.
- [ ] Lighthouse: Performance ≥ 95, A11y ≥ 95, Best Practices = 100.
- [ ] axe-core: 0 serious/critical.
- [ ] Vietnamese diacritics render đúng trong tất cả label + toast.

---

### 2.2 `/` — Dashboard tổng Readiness

**Route:** `/` · **Role:** admin, planner · **Priority:** P0

#### Layout grid

| Breakpoint | Layout | Notes |
|---|---|---|
| ≤ 767px | Redirect `/items` (không hỗ trợ dashboard mobile V1) | — |
| md 768–1023px | Sidebar collapsed (56px) + content full | 2-col KPI |
| lg 1024–1279px | Sidebar 240px + content | 4-col KPI row |
| xl ≥ 1280px | Sidebar 240px + content max-w 1440px | 4-col KPI + 2-col sub-grid |

Padding content: `p-3 xl:p-4` (24px/32px). Gap giữa sections: `gap-3` (24px).

#### ASCII wireframe — state variants

**Populated (xl 1440×900):**
```
╔═══════════════════════════════════════════════════════════════════════════╗
║ [≡] Xưởng IoT / Dashboard     [🔍 Tìm (Ctrl+K)]       [🔔][Avatar TN ▼]  ║  ← TopBar 56
╠════╤══════════════════════════════════════════════════════════════════════╣
║    │ Dashboard                              Cập nhật 14:23 · Auto 30s [⟳] ║
║ SB │ ┌─ KPI row (4 cards, grid-cols-4 gap-3) ───────────────────────────┐║
║    │ │ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐            ║
║    │ │ │ Đơn đang │ │ Shortage │ │ PO trễ   │ │ WO chạy  │            ║
║    │ │ │   12     │ │   8 SKU  │ │   3      │ │   7      │            ║
║    │ │ │ ↑ 2 tuần │ │ ⚠ Cam    │ │ ✕ Đỏ    │ │ ✓ Xanh   │            ║
║    │ │ │ ▂▅█▇▆    │ │          │ │          │ │          │            ║
║    │ │ └──────────┘ └──────────┘ └──────────┘ └──────────┘            ║
║    │ └──────────────────────────────────────────────────────────────────┘║
║    │                                                                      ║
║    │ ┌─ Content grid (lg:grid-cols-3 gap-3) ────────────────────────────┐║
║    │ │ ┌─ Orders Readiness (col-span-2) ────┐ ┌─ Alerts side (col-1) ─┐ ║
║    │ │ │ Đơn sắp giao (7 ngày tới)  [Xem »] │ │ 3 đơn shortage > 20% │ ║
║    │ │ │                                    │ │ ├── SO-103 (9 SKU)    │ ║
║    │ │ │ Mã │SP  │Deadline│Ready   │Short  │ │ ├── SO-101 (4 SKU)    │ ║
║    │ │ │ 101│CNC │20/04   │78%◐████│4 SKU  │ │ └── SO-098 (1 SKU)    │ ║
║    │ │ │ 102│Jig │22/04   │95%●████│1 SKU  │ │                        │ ║
║    │ │ │ 103│Fix │25/04   │40%○██░░│9 SKU  │ │ 5 PO ETA > 3 ngày     │ ║
║    │ │ │ ... 10 rows                        │ │ ├── PO-022 (NCC1)     │ ║
║    │ │ │ [Xem tất cả (12) »]               │ │ ├── PO-025 (NCC3)     │ ║
║    │ │ └────────────────────────────────────┘ │ └── ... 3 nữa          │ ║
║    │ │                                        │                          │ ║
║    │ │ ┌─ System health (col-span-3) ─────────────────────────────────┐ ║
║    │ │ │ API: ● 120ms   DB: ● pg_trgm on   Redis: ● queue 0           │ ║
║    │ │ │ Worker: ● 2/2  Last backup: 14:00  Disk: 34% (14GB / 40GB)   │ ║
║    │ │ └───────────────────────────────────────────────────────────────┘ ║
║    │ └──────────────────────────────────────────────────────────────────┘║
╚════╧══════════════════════════════════════════════════════════════════════╝
```

**Loading (SSR shell + skeleton):**
```
KPI row: 4 cards với `.skeleton` (width 100%, height 112px)
Orders table: 10 skeleton rows height 40px với shimmer 1200ms
Alerts: 3 skeleton blocks
System health: 1 skeleton bar
```

**Empty (tenant mới chưa có order):**
```
┌─ KPI row ────────────────────────────────────────┐
│ KPI cards hiển thị "0" với delta "—"            │
└──────────────────────────────────────────────────┘

┌─ EmptyState card (full-width) ───────────────────┐
│                                                   │
│    [SVG illustration: empty clipboard, 144×144]   │
│                                                   │
│    Chưa có đơn hàng nào                          │
│    Tạo đơn hàng đầu tiên hoặc import danh mục    │
│    vật tư để bắt đầu.                             │
│                                                   │
│    [+ Tạo đơn hàng]  [⤓ Import vật tư]           │
│                                                   │
└───────────────────────────────────────────────────┘
```

**Error (API fail):**
```
┌─ Banner danger (full-width, sticky top content) ┐
│ ✕ Không tải được dashboard. Mã lỗi: E_API_500   │
│   [Thử lại] [Sao chép mã lỗi] [Liên hệ IT]      │
└──────────────────────────────────────────────────┘
```

#### Component tree

```
DashboardPage
├── DashboardHeader (title + lastUpdated + autoRefreshToggle)
├── KpiRow
│   ├── KpiCard "Đơn đang" (value + deltaSparkline + status)
│   ├── KpiCard "Shortage" (value + label + iconWarning)
│   ├── KpiCard "PO trễ" (value + iconDanger)
│   └── KpiCard "WO chạy" (value + iconSuccess)
├── ContentGrid
│   ├── OrdersReadinessTable (lg:col-span-2)
│   ├── AlertsSidebar (lg:col-span-1)
│   │   ├── AlertGroup "Shortage > 20%"
│   │   └── AlertGroup "PO ETA > 3d"
│   └── SystemHealthStrip (lg:col-span-3)
└── EmptyState | ErrorBanner (conditional)
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount | fetch `/api/dashboard/overview` (stale 30s), SSR shell với skeleton |
| auto-refresh tick (30s) | silent refetch, update KPI inline (no skeleton re-show) |
| manual refresh button | force refetch, show spinner trong button, toast "Đã cập nhật" |
| click KPI card | navigate `/shortages` hoặc `/orders?filter=<kpi>` |
| click row trong OrdersReadinessTable | navigate `/orders/:id` |
| click alert item | navigate tương ứng |
| prefers-reduced-motion | disable sparkline animation, show static min/max |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+K` | Open CommandPalette |
| `R` | Refresh dashboard |
| `G + I` | Goto Items |
| `G + O` | Goto Orders (V1.1) |
| `?` | Show keyboard shortcut overlay |

#### Responsive rules

- **md (768–1023px):** KPI row `grid-cols-2` (2 rows × 2 cols), orders table horizontal scroll disabled (column pinning stead).
- **lg (1024px+):** KPI row `grid-cols-4`, content `grid-cols-3` (orders col-span-2 + alerts col-span-1).
- **xl (1280px+):** max-w 1440px, padding 32px.

#### Acceptance criteria

- [ ] TTI < 1s với data mock, < 2s với API thật.
- [ ] Skeleton shimmer chạy 1200ms linear infinite, tắt khi `prefers-reduced-motion`.
- [ ] Auto-refresh 30s qua SWR `refreshInterval: 30000`, không poll khi tab inactive (`refreshWhenHidden: false`).
- [ ] KPI card có status color mapping: `success` / `warning` / `danger` — icon + label + border-left 4px.
- [ ] Orders table virtualized khi > 50 rows.
- [ ] Empty state illustration inline SVG < 20KB.
- [ ] Lighthouse A11y ≥ 95, axe-core 0 serious.
- [ ] Keyboard-only: Tab đi qua tất cả interactive element, Enter trigger action.

---

### 2.3 `(app)/layout.tsx` — AppShell

**Scope:** layout wrapper cho `(app)/*` routes (Dashboard, Items, Suppliers...).

#### Layout grid

```
xl (1280+):
┌──────────────┬─────────────────────────────────────────┐
│ Sidebar 240  │ TopBar 56 (sticky)                     │
│   (fixed)    ├─────────────────────────────────────────┤
│              │ Breadcrumb 40                          │
│              ├─────────────────────────────────────────┤
│              │ Content (padding 24, max-w 1440)       │
│              │                                         │
│              │ ...                                     │
│              │                                         │
└──────────────┴─────────────────────────────────────────┘

Collapsed (user toggle):
┌──┬────────────────────────────────────────────────────┐
│SB│ TopBar 56                                           │
│56├─────────────────────────────────────────────────────┤
│  │ Breadcrumb 40                                       │
│  ├─────────────────────────────────────────────────────┤
│  │ Content                                             │
└──┴────────────────────────────────────────────────────┘

md (768–1023):
┌──┬────────────────────────────────────────────────────┐
│SB│ TopBar (sidebar luôn 56, không expand trừ khi      │
│56│  user click hamburger mở drawer overlay)           │
└──┴────────────────────────────────────────────────────┘

Mobile (< 768): sidebar drawer (hidden, slide-in từ trái khi hamburger)
```

#### ASCII wireframe — populated

```
╔══════════════════════════════════════════════════════════════════════════╗
║ ┌──────────┐ ┌────────────────────────────────────────────────────────┐ ║
║ │ [LOGO]   │ │ Xưởng IoT / Items                [🔍 Ctrl+K]  [🔔][TN▼]│ ║  TopBar 56
║ │ BOM MES  │ └────────────────────────────────────────────────────────┘ ║
║ ├──────────┤ ┌────────────────────────────────────────────────────────┐ ║
║ │          │ │ Home › Danh mục vật tư                                 │ ║  Breadcrumb 40
║ │ 📊 Dash  │ ├────────────────────────────────────────────────────────┤ ║
║ │ 📦 Items │ │                                                         │ ║
║ │ 🛒 NCC   │ │                                                         │ ║
║ │          │ │   Content                                               │ ║
║ │ ──────── │ │                                                         │ ║
║ │ 🏭 WO    │ │                                                         │ ║
║ │ 📥 Nhận  │ │                                                         │ ║
║ │ 📤 Xuất  │ │                                                         │ ║
║ │          │ │                                                         │ ║
║ │ ──────── │ │                                                         │ ║
║ │ ⚙️ Admin  │ │                                                         │ ║
║ │          │ │                                                         │ ║
║ │ [≪]      │ │                                                         │ ║  collapse toggle bottom
║ └──────────┘ └────────────────────────────────────────────────────────┘ ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Sidebar collapsed (56px):**
```
┌────┐
│ L  │
├────┤
│ 📊 │  ← tooltip "Dashboard" khi hover (delay 300ms)
│ 📦 │
│ 🛒 │
│ ── │
│ 🏭 │
│ 📥 │
│ 📤 │
│ ── │
│ ⚙️  │
│    │
│ [≫]│
└────┘
```

**Sidebar mobile drawer (< 768px, open):**
```
Overlay scrim (z-sidebar = 20)
┌──────────────┐
│ [LOGO]   [✕] │
├──────────────┤
│ 📊 Dashboard │
│ 📦 Items     │
│ 🛒 NCC       │
│ ──────────── │
│ 🏭 WO        │
│ ──────────── │
│ 👤 Tài khoản │
│ [Đăng xuất]  │
└──────────────┘
```

#### Component tree

```
AppShell (RSC)
├── Sidebar (client component, collapsible)
│   ├── SidebarHeader (logo + brand)
│   ├── SidebarNav
│   │   ├── NavItem "Dashboard" (/)
│   │   ├── NavItem "Vật tư" (/items)
│   │   ├── NavItem "Nhà cung cấp" (/suppliers)
│   │   ├── NavDivider
│   │   ├── NavItem "Work Order" (/work-orders) — disabled V1
│   │   ├── NavItem "Nhập hàng" (/receiving) — V1.1
│   │   ├── NavDivider
│   │   └── NavItem "Admin" (/admin) — role-gated
│   └── SidebarFooter (collapse toggle)
├── TopBar (sticky)
│   ├── HamburgerButton (mobile only)
│   ├── BrandLockup (mobile only)
│   ├── BreadcrumbSlot (placeholder cho Breadcrumb)
│   ├── CommandPaletteTrigger ("🔍 Tìm... Ctrl+K")
│   ├── NotificationBell (badge count)
│   └── UserMenu (avatar + dropdown)
├── Breadcrumb (below TopBar, sticky)
├── <main> { children }
├── CommandPalette (portal, z-50)
└── Toaster (Sonner, bottom-right desktop / top-center PWA)
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount | read `localStorage['sidebar-collapsed']` → set sidebar state SSR-safe |
| sidebar toggle | persist `localStorage`, animate width 320ms ease-industrial |
| hover NavItem khi collapsed | show tooltip right, delay 300ms |
| click NavItem | navigate, active state `bg-slate-100 border-l-2 border-cta text-slate-900` |
| `Ctrl+K` | open CommandPalette (z-50) |
| `Esc` khi palette open | close palette, restore focus trigger |
| notification click | open NotificationSheet (V1.1 placeholder badge "0") |
| UserMenu open | dropdown z-40 |
| click "Đăng xuất" | POST `/api/auth/logout`, redirect `/login` |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+K` | CommandPalette |
| `Ctrl+/` | Sidebar toggle |
| `Alt+M` | Skip to main content |
| `Esc` (palette open) | Close palette |
| `↑ ↓` (trong palette) | Navigate items |
| `Enter` (trong palette) | Execute selected |

#### Responsive rules

- **< 768px:** sidebar hidden by default, hamburger button trong TopBar opens drawer (z-sidebar 20, overlay scrim).
- **768–1279px:** sidebar collapsed default (56px), user toggle expand.
- **1280px+:** sidebar expanded default (240px), user có thể collapse.

#### Acceptance criteria

- [ ] Sidebar width persist qua refresh (localStorage, SSR-safe via cookie fallback).
- [ ] NavItem active state match `usePathname()` (handle nested routes: `/items/*` active "Vật tư").
- [ ] Ctrl+K mở CommandPalette instant (< 50ms perceived), tắt khi click outside/Esc.
- [ ] Mobile drawer có focus trap (Tab loop trong drawer khi open).
- [ ] Skip link visible khi focus (hidden mặc định).
- [ ] Breadcrumb auto-generate từ pathname, tối đa 3 level, "..." collapse giữa.
- [ ] axe-core: `aside` có `aria-label="Menu chính"`, `nav` có `role="navigation"`.

---

### 2.4 `(app)/items` — Item Master list

**Route:** `/items` · **Role:** admin, planner · **Priority:** P0

#### Layout grid

```
┌──────────────────────────────────────────────────────────────────────┐
│ Page header 72                                                        │
│  "Danh mục vật tư" + subtitle counts + action buttons                │
├──────────────────────────────────────────────────────────────────────┤
│ FilterBar 56 (sticky top 40, z-sticky 10)                            │
│  search + 4 selects + reset + density toggle                         │
├──────────────────────────────────────────────────────────────────────┤
│ TableHeader 40 (sticky top 96, z-sticky 10)                          │
├──────────────────────────────────────────────────────────────────────┤
│ Virtualized rows 40/56 (grid-cols-items-desktop / -tablet)           │
│                                                                       │
│ ...                                                                   │
├──────────────────────────────────────────────────────────────────────┤
│ Pagination 56                                                         │
│ "Hiển thị 1–50 / 3.124" + prev/next                                  │
├──────────────────────────────────────────────────────────────────────┤
│ BulkActionBar 64 (sticky bottom, conditional khi selectedRows > 0)   │
└──────────────────────────────────────────────────────────────────────┘
```

#### ASCII wireframe

**Populated desktop xl:**
```
╔════════════════════════════════════════════════════════════════════════╗
║ Danh mục vật tư · 3.124 active / 10.247 total    [+ Thêm] [⤓ Import]  ║  h-18
╠════════════════════════════════════════════════════════════════════════╣
║ [🔍 Tìm SKU/tên/barcode...]  Loại▼  UoM▼  Tracking▼  Active▼ [Xoá lọc]║  h-7
║                                                      Mật độ: [40|56]   ║
╠═══╤═════════╤════╤════╤════╤═════════╤═══════╤═══════════╤════════════╣
║☐  │Mã SKU ↓ │Tên │Loại│UoM │On-hand  │Đơn vị │Trạng thái │Thao tác    ║  h-10 header
║   │60 mono  │flex│60  │50  │90 right │50     │120        │96          ║
╠═══╪═════════╪════╪════╪════╪═════════╪═══════╪═══════════╪════════════╣
║ ☐ │RM-0001  │Thép│RAW │ kg │  1.240,5│NCC1   │● Active   │[👁][✏][⋯] ║  h-10, zebra odd
║ ☐ │RM-0002  │Nhôm│RAW │ kg │    320,0│NCC2   │● Active   │[👁][✏][⋯] ║
║ ☐ │FB-0045  │Bệ  │FAB │pcs │     12  │—      │○ Draft    │[👁][✏][⋯] ║
║ ☐ │SA-0102  │Cụm │SUB │pcs │      8  │—      │● Active   │[👁][✏][⋯] ║
║   │ ... virtualized overscan 5, rows render-on-scroll ...             ║
╠═══╧═════════╧════╧════╧════╧═════════╧═══════╧═══════════╧════════════╣
║ Hiển thị 1–50 / 3.124   [« Trước]  Trang 1/63  [Sau »]  Kích thước▼   ║  h-7
╚════════════════════════════════════════════════════════════════════════╝

Khi selectedRows > 0:
╠════════════════════════════════════════════════════════════════════════╣
║ Đã chọn 3 / 3.124  [Đổi trạng thái ▼] [⤓ Xuất Excel] [🗑 Xoá]  [✕]   ║  h-8 sticky bottom
╚════════════════════════════════════════════════════════════════════════╝
```

**Loading:**
```
Skeleton 20 rows height 40px
Each row: 9 skeleton blocks với shimmer, không text
Filter bar hiển thị bình thường (không skeleton, đã render SSR)
```

**Empty (chưa có item):**
```
┌──────────────────────────────────────────────────────┐
│                                                      │
│    [SVG illustration: empty warehouse box 144×144]  │
│                                                      │
│    Chưa có vật tư nào                               │
│    Nhập danh mục từ Excel hoặc tạo thủ công để     │
│    bắt đầu quản lý kho.                             │
│                                                      │
│    [⤓ Import Excel]  [+ Tạo thủ công]              │
│                                                      │
│    Tải file mẫu items_template.xlsx                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Empty sau filter (no match):**
```
┌──────────────────────────────────────────────────────┐
│    [SVG illustration: magnifier 96×96]              │
│    Không tìm thấy SKU nào khớp                      │
│    Bộ lọc hiện tại: q="banh rang", Loại=RAW         │
│    [Xoá tất cả bộ lọc]                              │
└──────────────────────────────────────────────────────┘
```

**Error (API fail):**
```
┌─ Banner danger (full-width) ────────────────────────┐
│ ✕ Không tải được danh sách. Mã lỗi: E_DB_TIMEOUT   │
│   [Thử lại] [Báo lỗi]                               │
└──────────────────────────────────────────────────────┘
```

#### Component tree

```
ItemsListPage
├── PageHeader (title + subtitle + [+ Thêm] + [⤓ Import])
├── FilterBar (sticky, URL-state sync)
│   ├── SearchInput (q, debounce 250)
│   ├── Select (type: RAW/FAB/SUB/FG)
│   ├── Select (uom: kg/pcs/L/m)
│   ├── Select (tracking: lot/serial/none)
│   ├── Select (active: true/false/all)
│   ├── Button "Xoá lọc"
│   └── DensityToggle (40/56)
├── DataTable
│   ├── TableHeader (sticky, resizable, sortable)
│   ├── TableBody (virtualized TanStack)
│   └── TableRow × N
│       ├── CheckboxCell
│       ├── SkuCell (mono + copy-on-hover)
│       ├── NameCell
│       ├── TypeBadge
│       ├── UomCell
│       ├── OnHandCell (tabular-nums, right align)
│       ├── SupplierCell
│       ├── StatusBadge
│       └── ActionsCell ([👁 preview] [✏ edit] [⋯ more])
├── Pagination
├── BulkActionBar (sticky bottom, conditional)
├── ItemQuickEditSheet (portal, on edit click)
└── DeleteConfirmDialog (portal, on bulk delete)
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount | read URL params → hydrate FilterBar state, fetch `/api/items?...` |
| search input | debounce 250ms → update URL (`router.replace`) → refetch |
| select change | update URL → refetch |
| click "Xoá lọc" | reset all params, push URL `/items` |
| sort header click | toggle `sort=sku:asc|desc` in URL → refetch |
| checkbox row click | toggle selection state (local, not URL) |
| checkbox header click | select all visible (or all matching filter with confirm if > 100) |
| 👁 eye click | open Sheet quick-preview (read-only) |
| ✏ edit click | open ItemQuickEditSheet (form Sheet) |
| ⋯ more click | open ActionsDropdown (Duplicate, Archive, Delete) |
| row click (not action cell) | navigate `/items/:id` |
| density toggle | update localStorage, update row height |
| bulk delete | open DeleteConfirmDialog with type-to-confirm "XOA" |
| selectedRows > 0 | BulkActionBar slide-up 200ms |
| drop ↓ scroll fast | virtualize keep 20 rows rendered, overscan 5 |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `/` | focus SearchInput |
| `j` / `↓` | next row (highlight) |
| `k` / `↑` | prev row |
| `Space` | toggle checkbox current row |
| `Enter` | open current row detail |
| `e` | open quick-edit Sheet current row |
| `Esc` | close any open Sheet/Dialog, clear selection |
| `Ctrl+A` | select all visible |
| `Delete` (khi có selection) | open bulk delete dialog |

#### Responsive rules

- **md (768–1023px):**
  - Ẩn cột: `UoM`, `Supplier`.
  - Row height 56px (tablet friendly).
  - Filter bar stack 2 rows (search full-width row 1, filters row 2).
  - Action column: gộp thành dropdown menu (1 button `⋯`) tiết kiệm space.
- **lg (1024–1279px):** hiển thị đủ 9 cột, row 40px.
- **xl (1280+):** max-w content 1440, padding 32.

#### Acceptance criteria

- [ ] URL-state filter: refresh giữ nguyên filter, share URL hoạt động.
- [ ] Search tiếng Việt không dấu match có dấu (sau khi migration 0002 apply).
- [ ] Virtualized khi > 200 rows, FPS > 55 khi scroll.
- [ ] Row height 40px desktop, 56px tablet — user toggle được.
- [ ] Sticky filter bar + table header không đè lên nhau (z-sticky 10 đúng thứ tự).
- [ ] Tablet 1024×768 KHÔNG có horizontal scroll (column pinning Mã SKU + Actions).
- [ ] BulkActionBar slide-up 200ms khi select, slide-down khi deselect all.
- [ ] axe-core: `<table>` có `<caption>` hidden "Danh mục vật tư", `<th scope="col">` đúng.

---

### 2.5 `(app)/items/[id]` + `/items/new` — Detail/Edit với Tabs

**Route:** `/items/:id`, `/items/new` · **Role:** admin, planner · **Priority:** P1

#### Layout grid

```
┌──────────────────────────────────────────────────────────────────────┐
│ Page header 72                                                        │
│  Breadcrumb · Title "Sửa vật tư: RM-0001" · [Xoá] [Lưu]             │
├──────────────────────────────────────────────────────────────────────┤
│ TabBar 48 (sticky, z-sticky 10)                                      │
│ [Thông tin cơ bản] [Kho & tồn] [Tracking] [Ảnh & tài liệu]          │
├──────────────────────────────────────────────────────────────────────┤
│ Tab content (grid-cols-12 gap-3, padding 32)                         │
│                                                                       │
│  Tab "Thông tin" → 2-col grid fields                                 │
│  Tab "Kho"       → 2-col grid fields                                 │
│  Tab "Tracking"  → 1-col switches + nested conditional fields        │
│  Tab "Ảnh"       → upload dropzone + gallery                         │
│                                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ FormActionBar 72 (sticky bottom z-sticky 10)                         │
│ [Huỷ]                                              [Lưu] [Lưu & Mới] │
└──────────────────────────────────────────────────────────────────────┘
```

#### ASCII wireframe — populated

**Tab "Thông tin cơ bản":**
```
╔══════════════════════════════════════════════════════════════════════╗
║ Home › Vật tư › RM-0001     Sửa vật tư: RM-0001      [🗑][Lưu]     ║
╠══════════════════════════════════════════════════════════════════════╣
║ [Thông tin cơ bản *]  [Kho & tồn]  [Tracking]  [Ảnh & tài liệu]    ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║ ┌─ Nhóm: Định danh ───────────────────────────────────────────────┐ ║
║ │ Mã SKU *                        Barcode                         │ ║
║ │ [RM-0001_________________]      [8935123456789__________] [📷] │ ║
║ │ ✓ Mã khả dụng                   Optional                        │ ║
║ │                                                                  │ ║
║ │ Tên vật tư *                                                    │ ║
║ │ [Thép hợp kim C45 φ30____________________________________]     │ ║
║ │                                                                  │ ║
║ │ Loại *           Đơn vị tính *         Nhóm (V1.1)              │ ║
║ │ [RAW     ▼]     [kg         ▼]         [Chưa hỗ trợ     ▼]    │ ║
║ └──────────────────────────────────────────────────────────────────┘ ║
║                                                                      ║
║ ┌─ Nhóm: Mô tả ───────────────────────────────────────────────────┐ ║
║ │ Mô tả                                                           │ ║
║ │ [                                                              ] │ ║
║ │ [                                                              ] │ ║
║ │ 0/500 ký tự                                                     │ ║
║ └──────────────────────────────────────────────────────────────────┘ ║
╠══════════════════════════════════════════════════════════════════════╣
║ [Huỷ]                                       [Lưu] [Lưu & Tạo tiếp]  ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Tab "Tracking":**
```
┌─ Nhóm: Chế độ theo dõi ────────────────────────────────────────────┐
│                                                                    │
│ ○ Không theo dõi  (mặc định, vật tư phổ thông)                    │
│ ● Theo lô         (ghi nhận lot_no khi nhập/xuất)                  │
│ ○ Theo serial     (ghi nhận serial từng pcs — FG, jig chuyên dụng)│
│                                                                    │
│ [nếu chọn "Theo lô"]                                              │
│ ┌──────────────────────────────────────────────────────────────┐ │
│ │ ☐ Yêu cầu hạn sử dụng (exp_date) khi nhập                    │ │
│ │ ☐ Cảnh báo khi còn < [30] ngày                               │ │
│ └──────────────────────────────────────────────────────────────┘ │
│                                                                    │
│ ☐ Cho phép tồn kho âm (chỉ admin)                                 │
│                                                                    │
└────────────────────────────────────────────────────────────────────┘
```

**Loading:**
```
Skeleton: 1 TabBar + 4 field groups × 3 inputs each height 40
```

**Error (validation on save):**
```
Tab "Thông tin cơ bản" badge icon ⚠ (có lỗi)
Field "Tên vật tư": border-danger + helper text-danger-strong
"Tên là bắt buộc"
```

**Delete confirm (Dialog, z-60):**
```
┌──────────────────────────────────────────────────┐
│ Xoá vật tư RM-0001?                           ✕ │
├──────────────────────────────────────────────────┤
│ Vật tư này đang được tham chiếu trong:          │
│  · 3 BOM revision                                │
│  · 2 đơn hàng đang chạy                          │
│                                                  │
│ Xoá sẽ làm các đơn hàng đó mất dữ liệu tham     │
│ chiếu. Nhập "XOA" để xác nhận.                  │
│                                                  │
│ [____________]                                   │
│                                                  │
│ [Huỷ]                           [Xoá vĩnh viễn] │
└──────────────────────────────────────────────────┘
```

#### Component tree

```
ItemDetailPage
├── PageHeader (breadcrumb + title + [Xoá] + [Lưu] actions)
├── Tabs (shadcn Tabs, sticky)
│   ├── TabList
│   └── TabPanel × 4
│       ├── Tab "Thông tin cơ bản" → ItemBasicInfoForm
│       ├── Tab "Kho & tồn" → ItemInventoryForm
│       ├── Tab "Tracking" → ItemTrackingForm
│       └── Tab "Ảnh & tài liệu" → ItemMediaUploader (V1.1 placeholder)
├── FormActionBar (sticky bottom)
│   ├── Button "Huỷ"
│   ├── Button "Lưu" (primary)
│   └── Button "Lưu & Tạo tiếp" (ghost, new route only)
└── DeleteConfirmDialog (portal)
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount `/items/new` | empty form, focus Mã SKU input |
| mount `/items/:id` | fetch `/api/items/:id`, hydrate form, focus Tab 1 first input |
| SKU input debounce | `GET /api/items/check-sku?sku=XXX` → show ✓ hoặc ✕ với debounce 400ms, tránh nháy |
| tab switch | preserve form state (react-hook-form root), validate current tab trước khi switch |
| tab có error | badge `⚠` cạnh tab label (tab-error indicator) |
| save click | validate all tabs, POST/PUT, redirect `/items/:id`, toast "Đã lưu" |
| save success tạo mới | toast + navigate back `/items` hoặc reset form nếu click "Lưu & Tạo tiếp" |
| save fail server | toast error + highlight tab có conflict (409 duplicate SKU) |
| delete click | open DeleteConfirmDialog, require type "XOA" |
| cancel click | if form dirty → confirm "Huỷ thay đổi?" dialog, else navigate back |
| Ctrl+S | save |
| Esc | nếu dialog open → close, nếu form dirty → nothing |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `Ctrl+S` | save |
| `Ctrl+Shift+S` | save & create new |
| `Ctrl+1..4` | switch tab 1–4 |
| `Esc` | close dialog |
| `Alt+Backspace` (in field) | clear field |

#### Responsive rules

- **md (768+):** Form 1-column (field stack), action bar fixed bottom.
- **lg (1024+):** Form 2-column grid.
- **xl (1280+):** content max-w 1024, centered.

#### Acceptance criteria

- [ ] Tab switch không mất data (form state persist).
- [ ] SKU check debounce 400ms, không nháy khi gõ liên tục.
- [ ] Delete dùng Dialog, KHÔNG dùng native `confirm()`.
- [ ] Form dirty detection — confirm khi user navigate away.
- [ ] "Lưu" button disable khi form invalid hoặc đang submit.
- [ ] Tab có error show badge `⚠` visible từ TabList.
- [ ] Checkbox dùng shadcn `Checkbox` (không native).
- [ ] Ctrl+S shortcut global, preventDefault.

---

### 2.6 `(app)/items/import` — Import Wizard v2

**Route:** `/items/import` · **Role:** admin, planner · **Priority:** P1

#### Layout grid

```
┌──────────────────────────────────────────────────────────────────────┐
│ Page header 72 · "Import vật tư từ Excel"                            │
├──────────────────────────────────────────────────────────────────────┤
│ Stepper 80 (horizontal, 4 steps)                                     │
│  ① Tải file → ② Mapping cột → ③ Xem trước → ④ Kết quả              │
├──────────────────────────────────────────────────────────────────────┤
│ Step content (padding 32, max-w 1024)                                │
│                                                                       │
│ ...                                                                   │
│                                                                       │
├──────────────────────────────────────────────────────────────────────┤
│ Wizard nav 72                                                        │
│ [← Quay lại]                                [Huỷ]      [Tiếp →]     │
└──────────────────────────────────────────────────────────────────────┘
```

#### ASCII wireframe — 4 steps

**Step 1: Upload**
```
╔══════════════════════════════════════════════════════════════════════╗
║ Import vật tư từ Excel                                               ║
╠══════════════════════════════════════════════════════════════════════╣
║ [●1 Tải file]─[○2 Mapping]─[○3 Xem trước]─[○4 Kết quả]              ║
╠══════════════════════════════════════════════════════════════════════╣
║                                                                      ║
║  ┌─ Dropzone (border-dashed slate-300, hover cta) ────────────────┐ ║
║  │                                                                  │ ║
║  │           [📤 icon 48px]                                         │ ║
║  │                                                                  │ ║
║  │     Kéo file .xlsx / .csv vào đây                               │ ║
║  │     Hoặc [chọn file từ máy]                                     │ ║
║  │                                                                  │ ║
║  │     Tối đa 10MB, 50.000 rows                                    │ ║
║  │                                                                  │ ║
║  └──────────────────────────────────────────────────────────────────┘ ║
║                                                                      ║
║  Chưa có file mẫu? [⤓ Tải items_template.xlsx]                      ║
║                                                                      ║
║  Hướng dẫn:                                                         ║
║  · Dòng đầu tiên là tên cột (header).                               ║
║  · Cột bắt buộc: mã SKU, tên, loại, đơn vị.                         ║
║  · Cột tuỳ chọn: mô tả, barcode, supplier, on-hand.                 ║
║                                                                      ║
╠══════════════════════════════════════════════════════════════════════╣
║ [← Quay lại]                             [Huỷ]            [Tiếp →]  ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Step 2: Mapping cột (MỚI)**
```
╔══════════════════════════════════════════════════════════════════════╗
║ [✓1 Tải]─[●2 Mapping]─[○3 Xem trước]─[○4 Kết quả]                   ║
╠══════════════════════════════════════════════════════════════════════╣
║ File đã nhận: items_songchau_0417.xlsx  (248 rows)                  ║
║                                                                      ║
║ Khớp cột Excel với trường trong hệ thống:                           ║
║                                                                      ║
║ ┌────────────────────────────────────────────────────────────────┐ ║
║ │ Cột Excel          │ Trường DB            │ Sample (3 rows)    │ ║
║ ├────────────────────┼──────────────────────┼────────────────────┤ ║
║ │ "Mã sản phẩm"      │ [sku (bắt buộc) ▼]  │ RM-0001, RM-0002...│ ║
║ │ "Tên"              │ [name (bắt buộc) ▼] │ Thép C45, Nhôm...  │ ║
║ │ "Loại"             │ [type (bắt buộc) ▼] │ RAW, RAW, FAB      │ ║
║ │ "ĐVT"              │ [uom (bắt buộc) ▼]  │ kg, kg, pcs        │ ║
║ │ "Mô tả sản phẩm"   │ [description   ▼]   │ Thép hợp kim...    │ ║
║ │ "Mã vạch"          │ [barcode       ▼]   │ 8935123..., —      │ ║
║ │ "Tồn đầu kỳ"       │ [-- bỏ qua --  ▼]   │ 1240, 320, 12      │ ║
║ └────────────────────────────────────────────────────────────────┘ ║
║                                                                      ║
║ ✓ Tất cả trường bắt buộc đã được map.                               ║
║ ⓘ "Tồn đầu kỳ" sẽ import qua module Inventory (V1.1).              ║
║                                                                      ║
║ [💾 Lưu mapping này làm mặc định lần sau]                           ║
╠══════════════════════════════════════════════════════════════════════╣
║ [← Quay lại]                             [Huỷ]            [Tiếp →]  ║
╚══════════════════════════════════════════════════════════════════════╝
```

**Step 3: Preview**
```
Preview 100 rows đầu với highlight invalid:
┌─ Summary ────────────────────────────────────────────┐
│ Tổng: 248 rows · Hợp lệ: 243 · Lỗi: 5 · Trùng: 0    │
└──────────────────────────────────────────────────────┘

┌─ Table (sticky header, invalid rows bg-danger-soft) ─┐
│ # │Mã    │Tên     │Loại│ĐVT│Status  │Lý do lỗi     │
├───┼──────┼────────┼────┼───┼────────┼──────────────┤
│ 1 │RM-001│Thép    │RAW │kg │✓ OK    │              │
│ 2 │RM-002│Nhôm    │RAW │kg │✓ OK    │              │
│ 3 │FB-045│Bệ      │XXX │pcs│✕ Lỗi   │Loại không hợp│  ← bg-danger-soft
│ 4 │      │Cụm A   │SUB │pcs│✕ Lỗi   │Mã SKU rỗng   │
│ ...                                                  │
└──────────────────────────────────────────────────────┘

[⤓ Tải file lỗi (.xlsx)]  [Chỉ import rows hợp lệ]
```

**Step 4: Result**
```
┌──────────────────────────────────────────────────────┐
│            [✓ icon 72px success]                     │
│                                                      │
│         Import hoàn tất                              │
│                                                      │
│  ┌────────────────────────────────────────────────┐ │
│  │ Thành công │ Lỗi       │ Bỏ qua (trùng)       │ │
│  │    243     │     5     │       0               │ │
│  └────────────────────────────────────────────────┘ │
│                                                      │
│  Thời gian xử lý: 4.2 giây                          │
│  Job ID: imp_01HXYZABC123                           │
│                                                      │
│  [⤓ Tải file log]  [Xem danh sách vật tư mới]      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

**Loading (Step 3 → Step 4):**
```
Progress bar linear-indeterminate
"Đang xử lý... 1.240 / 3.124 rows (40%)"
ETA: ~2 giây
```

#### Component tree

```
ImportWizardPage
├── PageHeader
├── Stepper (horizontal, active highlight cta, done success)
├── StepContent (conditional render)
│   ├── Step1UploadStep
│   │   ├── Dropzone (react-dropzone)
│   │   ├── FilePreview (name + size + removeBtn)
│   │   └── TemplateDownloadLink
│   ├── Step2ColumnMapperStep ← MỚI
│   │   ├── ColumnMapperTable
│   │   └── SaveMappingCheckbox
│   ├── Step3PreviewStep
│   │   ├── SummaryStats (success/error/duplicate counts)
│   │   └── PreviewTable (100 rows, invalid highlight)
│   └── Step4ResultStep
│       ├── ResultIcon (success/partial/error)
│       ├── ResultStats
│       └── ResultActions (download log + navigate)
└── WizardNav ([← Back] [Cancel] [Next →])
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount | Step 1, upload area active |
| file drop | parse headers client-side (SheetJS), auto-match mapping cột (fuzzy match tên cột), advance to Step 2 |
| Step 2 mapping change | validate required fields mapped, disable "Tiếp →" nếu thiếu |
| Step 2 "Tiếp →" | send file + mapping → POST `/api/items/import/preview`, wait response, advance Step 3 |
| Step 3 preview error rows > 0 | show banner warning + option "Chỉ import rows hợp lệ" |
| Step 3 "Import" click | POST `/api/items/import/commit` async, stream progress via SSE or poll |
| Step 4 success | show stats, CTA "Xem danh sách" navigate `/items?created_after=timestamp` |
| cancel any time | confirm dialog "Huỷ import? Dữ liệu chưa lưu." |
| back button | preserve state từng step (file cached trong memory, mapping trong state) |

#### Keyboard shortcuts

| Key | Action |
|---|---|
| `Enter` (in Step 1 focused button) | chọn file |
| `Ctrl+→` / `Ctrl+←` | next/back step (when enabled) |
| `Esc` | cancel (confirm) |

#### Responsive rules

- **md+:** wizard content max-w 1024, padding 32, stepper horizontal.
- **< md:** stepper vertical, content full-width padding 16.

#### Acceptance criteria

- [ ] Palette `brand-500/600` dead classes đã thay bằng `cta` + `slate` (theo guidelines).
- [ ] Dropzone active state dùng `border-cta bg-cta-soft`.
- [ ] Step indicator: done = `bg-success text-white`, active = `bg-cta text-white`, idle = `bg-slate-200 text-slate-500`.
- [ ] Mapping tự động fuzzy match (cosine similarity header name) — user chỉ confirm, không map từ đầu.
- [ ] Preview table virtualized nếu > 100 rows.
- [ ] Invalid rows highlight `bg-danger-soft`, error reason column `text-danger-strong`.
- [ ] File log download format `.xlsx` với cột "Lý do lỗi" tiếng Việt.
- [ ] Progress SSE hoặc polling interval 500ms.
- [ ] TypeScript: `ImportPreviewRow` type generated từ Zod schema (xoá `any`).

---

### 2.7 `/suppliers` — Suppliers list stub

**Route:** `/suppliers` · **Role:** admin, planner · **Priority:** P1

#### Layout grid

Giống `/items` — reuse `DataTable` pattern.

#### ASCII wireframe

**Populated:**
```
╔══════════════════════════════════════════════════════════════════════╗
║ Nhà cung cấp · 24 nhà cung cấp              [+ Thêm NCC]            ║
╠══════════════════════════════════════════════════════════════════════╣
║ [🔍 Tìm...]  Trạng thái▼ [Xoá lọc]                                   ║
╠═══╤═════════╤══════════════╤═════════════╤═══════╤════════╤══════════╣
║ ☐ │Mã NCC   │Tên          │Liên hệ     │Điện th│Lead time│Trạng thái║
╠═══╪═════════╪══════════════╪═════════════╪═══════╪════════╪══════════╣
║ ☐ │NCC001   │Thép Hoà Phát│Anh Tuấn    │0903...│ 7d     │● Active  ║
║ ☐ │NCC002   │Nhôm Nam Sung│Chị Hoa     │0987...│ 5d     │● Active  ║
║ ☐ │NCC003   │Vít ốc Hồng  │Anh Minh    │0912...│ 3d     │○ Pending ║
║ ...                                                                  ║
╚═══╧═════════╧══════════════╧═════════════╧═══════╧════════╧══════════╝
```

**Empty (V1 — chưa có NCC):**
```
┌─ EmptyState ────────────────────────────────────────┐
│  [SVG illustration: handshake / truck 144×144]     │
│  Chưa có nhà cung cấp                               │
│  Thêm NCC để gán vào vật tư và tạo PO sau này.    │
│  [+ Thêm NCC đầu tiên]                              │
└─────────────────────────────────────────────────────┘
```

#### Component tree

```
SuppliersListPage
├── PageHeader (title + [+ Thêm])
├── FilterBar (search + active filter)
├── DataTable (7 columns)
│   ├── CheckboxCell
│   ├── SupplierCodeCell (mono)
│   ├── NameCell
│   ├── ContactPersonCell
│   ├── PhoneCell
│   ├── LeadTimeCell (tabular-nums, "7d")
│   └── StatusBadge
├── Pagination
└── EmptyState (conditional)
```

#### Interactions state machine

Same as Items list (simplified — không cần bulk delete/import V1 cho stub).

#### Responsive rules

Same as Items list (hide `ContactPerson`, `Phone` trên md; keep Mã + Tên + LT + Status).

#### Acceptance criteria

- [ ] Route `/suppliers` hoạt động, không 404.
- [ ] Nav link từ Sidebar dẫn đúng.
- [ ] V1 stub: CRUD tối thiểu (list + new + edit — reuse ItemForm pattern).
- [ ] Empty state có CTA rõ ràng.
- [ ] Integration future: dropdown Supplier trong `/items/[id]` form pulls từ đây.

---

### 2.8 `/pwa/receive/[poId]` — Receiving Console (PWA)

**Route:** `/pwa/receive/:poId` · **Role:** warehouse · **Priority:** P1 (hot path)

#### Layout grid

```
Tablet landscape 1024×768:
┌──────────────────────────────────────────────────────────────────────┐
│ PWA TopBar 56 · brand-ink bg, white text                             │
│  [← ] PO-045 · NCC1 · 14:23            [📶 Offline] [●3] [× Thoát]  │
├──────────────────────────────────────────────────────────────────────┤
│ StatusStrip 40 (conditional, khi offline hoặc có queue)              │
│  ⚠ Offline · 3 scan chờ sync [Sync ngay]                             │
├──────────────────────────────────────────────────────────────────────┤
│ ┌─ PO Lines 60% (left, scroll) ──┐ ┌─ Scanner 40% (right, sticky) ─┐ │
│ │                                 │ │                               │ │
│ │ Line cards (56px touch)         │ │ Camera preview 400×400        │ │
│ │                                 │ │ Manual input fallback         │ │
│ │                                 │ │ Queue badge                   │ │
│ │                                 │ │ Scan status                   │ │
│ └─────────────────────────────────┘ └───────────────────────────────┘ │
├──────────────────────────────────────────────────────────────────────┤
│ ActionBar 72 (sticky bottom)                                         │
│  [Huỷ]                           [Xác nhận nhận 3/8 lines]          │
└──────────────────────────────────────────────────────────────────────┘
```

#### ASCII wireframe — populated

```
╔══════════════════════════════════════════════════════════════════════════╗
║ [←] PO-045 · NCC1 · 14:23               [📶][●3 queue][× Thoát]         ║
╠══════════════════════════════════════════════════════════════════════════╣
║ ⚠ Offline · 3 scan chờ sync                            [Sync ngay]       ║
╠════════════════════════════════════════╤═════════════════════════════════╣
║ PO Lines (60%)                         │ Scanner (40%, sticky)           ║
║                                        │                                 ║
║ ┌─ Line 1 (scanned, current) ────┐   │ ┌─────────────────────────────┐ ║
║ │ ✓ RM-0001 Thép C45     [OK]   │   │ │                             │ ║
║ │   Đặt: 500 kg  Nhận: [400___] │   │ │   📷 CAMERA FEED             │ ║
║ │   Lô: [LOT-2604______________]│   │ │   400×400                    │ ║
║ │   HSD: [04/2027______________]│   │ │   reticle 320×320            │ ║
║ │   QC:  ● PASS  ○ FAIL          │   │ │                             │ ║
║ │   [Ghi chú...                 ]│   │ │                             │ ║
║ └────────────────────────────────┘   │ └─────────────────────────────┘ ║
║                                        │                                 ║
║ ┌─ Line 2 (pending) ──────────────┐   │ Nhập thủ công:                  ║
║ │ ○ RM-0002 Nhôm 6061             │   │ [________________________]     ║
║ │   Đặt: 200 kg  Nhận: [______]  │   │ [ Áp dụng ]                     ║
║ │   Scan mã vạch để bắt đầu →    │   │                                 ║
║ └────────────────────────────────┘   │ Trạng thái: Scanned 1 / 3       ║
║                                        │ Lần cuối: RM-0001 ✓ 14:22:10   ║
║ ┌─ Line 3 ... 8 (pending) ────────┐   │                                 ║
║ │ ...                             │   │ [🔇 Tắt âm] [💡 Đèn]           ║
║ └─────────────────────────────────┘   │                                 ║
╠════════════════════════════════════════╧═════════════════════════════════╣
║ [Huỷ]                          [✓ Xác nhận nhận 3 / 8 lines]             ║
╚══════════════════════════════════════════════════════════════════════════╝
```

**Scan success feedback (overlay trên Line card, 600ms):**
```
┌─ Line 1 (just scanned) ────────┐
│ ✓ RM-0001 Thép C45     [OK]   │  ← animate: flash-success 600ms
│   Đặt: 500 kg  Nhận: [400___] │     bg changes D1FAE5 → transparent
│   ...                          │     ring-scan-success 4px rgba(5,150,105,0.35)
└────────────────────────────────┘
```

**Scan fail (SKU không thuộc PO, 240ms shake + flash):**
```
Toast top-center sticky danger:
┌──────────────────────────────────────────┐
│ ✕ SKU "XY-999" không có trong PO-045.   │
│   [Bỏ qua] [Ghi nhận thừa]              │
└──────────────────────────────────────────┘

+ Scanner panel shake animation
+ Audio beep 220Hz 200ms
+ Haptic vibrate [50ms, 100ms, 50ms]
```

**Empty (PO chưa có lines):**
```
┌─ EmptyState ────────────────────────┐
│  [SVG truck 96×96]                  │
│  PO-045 chưa có dòng hàng           │
│  Kiểm tra lại với bộ phận mua hàng. │
│  [← Về danh sách PO]                │
└─────────────────────────────────────┘
```

**Offline queue badge click (Sheet):**
```
Sheet right w-80:
┌──────────────────────────────────┐
│ Scan chờ sync (3)             ✕ │
├──────────────────────────────────┤
│ ┌──────────────────────────────┐│
│ │ RM-0001  400kg · 14:20       ││
│ │ Lô LOT-2604 · PASS           ││
│ └──────────────────────────────┘│
│ ┌──────────────────────────────┐│
│ │ RM-0002  200kg · 14:21       ││
│ │ Lô LOT-2604 · PASS           ││
│ └──────────────────────────────┘│
│ ┌──────────────────────────────┐│
│ │ BO-0012  1000pcs · 14:22     ││
│ │ PASS                         ││
│ └──────────────────────────────┘│
│                                  │
│ [Retry sync ngay]                │
│ [Xoá queue (chỉ test)]           │
└──────────────────────────────────┘
```

#### Component tree

```
ReceivingConsolePage
├── PwaTopBar (brand-ink, title + queue badge + exit)
├── StatusStrip (conditional offline)
├── SplitPanel (60/40)
│   ├── POLinesPanel
│   │   └── POLineCard × N
│   │       ├── StatusIcon (pending/current/done)
│   │       ├── ItemInfo (SKU + name)
│   │       ├── QtyInput (touch-48)
│   │       ├── LotInput (conditional lot-tracked)
│   │       ├── ExpDateInput (conditional)
│   │       ├── QcRadio (PASS/FAIL)
│   │       └── NotesTextarea (optional)
│   └── ScannerPanel (sticky)
│       ├── BarcodeScanner (camera + reticle)
│       ├── ManualInput
│       ├── ScanStatus (count + last)
│       └── ToggleButtons (sound + flashlight)
├── ActionBar ([Huỷ] [Xác nhận])
├── ScanQueueSheet (portal, on queue badge click)
└── ConfirmReceiveDialog (portal, on final confirm)
```

#### Interactions state machine

| Event | Behavior |
|---|---|
| mount | check online/offline, load PO from IndexedDB cache nếu offline |
| scan detect | match SKU vs PO lines → scroll line into view, flash success, focus QtyInput |
| scan no match | shake + beep 220Hz + vibrate pattern + toast sticky |
| manual input Enter | same as scan detect |
| QC radio FAIL | force notes textarea visible, required |
| qty input blur | validate vs ordered qty, warning nếu > ordered 120% |
| line card save | add to `scanQueue` Dexie table, optimistic UI update |
| online → offline | show StatusStrip, pause sync worker |
| offline → online | resume sync worker, toast "Online lại, đang sync..." |
| sync complete | toast success, decrement queue badge |
| sync error | toast danger với retry, keep in queue |
| confirm receive click | aggregate all queue entries → POST `/api/receipts/:poId/commit` → dialog confirm |
| exit click | warn if queue has unsaved entries |

#### Keyboard shortcuts

(PWA chủ yếu touch, nhưng USB scanner = keyboard wedge input)

| Key | Action |
|---|---|
| `Enter` (in manual input) | submit scan |
| `Esc` | close sheet/dialog |
| `F1` | toggle flashlight (if device supports) |
| `F2` | toggle sound |
| `Ctrl+S` | final confirm receive |

#### Responsive rules

- **768px portrait:** stack vertically (PO lines top scroll, scanner bottom sticky 50%).
- **1024×768 landscape (chính):** split 60/40 như spec.
- **< 768px:** fallback view "Vui lòng dùng tablet để nhận hàng" + nút back.

#### Acceptance criteria

- [ ] Tap target ≥ 48×48px tất cả interactive (qty input h-12, radio h-12, button h-12).
- [ ] Camera permission prompt chỉ khi route active, release khi unmount.
- [ ] Fallback manual input nếu deny camera / no camera.
- [ ] Offline queue Dexie persist qua refresh.
- [ ] Sync worker idempotent (offline_queue_id UUID).
- [ ] Audio beep tần số khác nhau (880Hz OK, 220Hz FAIL).
- [ ] Haptic: `navigator.vibrate([50])` OK, `[50,100,50]` FAIL.
- [ ] Visual feedback (flash animation) + audio + haptic — 3 kênh cho user đeo găng.
- [ ] Screen reader announce scan result qua `aria-live="polite"`.
- [ ] `prefers-reduced-motion` disable flash + shake (giữ audio + haptic).
- [ ] PWA installable (manifest + SW + icons).
- [ ] Background sync: gọi `/api/scans/batch` với queue khi online trở lại.

---

## §3. Component library (18 components)

### 3.1 AppShell

**Vị trí:** `apps/web/src/components/layout/AppShell.tsx`

```ts
interface AppShellProps {
  children: React.ReactNode;
  user: {
    id: string;
    username: string;
    fullName: string;
    role: "admin" | "planner" | "warehouse" | "viewer";
    avatarUrl?: string;
  };
  sidebarDefaultCollapsed?: boolean; // SSR cookie read
}
```

**Visual spec:**
- Wrapper: `flex h-screen bg-bg-base`
- Main area: `flex-1 flex flex-col overflow-hidden`
- Grid: sidebar + [topbar | breadcrumb | main scroll]

**ASCII render:** Xem §2.3.

**A11y:**
- `<aside aria-label="Menu chính">`
- `<header role="banner">` cho TopBar
- `<main id="main-content" tabIndex={-1}>` cho skip link target
- Skip link: "Bỏ qua, đến nội dung chính" (`.skip-link`)

---

### 3.2 Sidebar

**Vị trí:** `apps/web/src/components/layout/Sidebar.tsx`

```ts
interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  navItems: NavItem[];
  className?: string;
}

interface NavItem {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
  disabled?: boolean;
  roles?: Role[];
  divider?: boolean; // render divider above this item
}
```

**Visual spec:**
- Expanded width: `240px`, collapsed: `56px`.
- Background: `bg-white border-r border-slate-200`.
- Nav item: `h-10 px-3 rounded mx-2 flex items-center gap-2`.
- Active: `bg-slate-100 border-l-2 border-cta text-slate-900 font-medium`.
- Hover: `bg-slate-50`.
- Icon: `w-5 h-5 text-slate-500`, active → `text-slate-900`.
- Collapsed: icon-only 20×20 centered, tooltip right delay 300ms.
- Transition width: `320ms ease-industrial`.

**ASCII:**
```
Expanded:
┌─────────────────┐
│ [LOGO] Xưởng IoT│  h-14 padding
│─────────────────│
│ 📊 Dashboard    │  h-10 mx-2
│ 📦 Vật tư   [12]│  badge right
│ 🛒 NCC          │
│─────────────────│  divider 1px slate-200
│ 🏭 WO (V1.1)    │  disabled: text-slate-400, cursor-not-allowed
│─────────────────│
│ [≪ Thu gọn]     │  bottom, h-10
└─────────────────┘
```

**A11y:**
- `<nav aria-label="Điều hướng chính">`
- Active item `aria-current="page"`
- Disabled item `aria-disabled="true"` + `tabIndex={-1}`
- Tooltip collapsed: Radix Tooltip với delay 300ms

**Variants:**
- `mobile-drawer` (< 768px): fixed overlay, slide từ left 320ms, backdrop scrim.
- `desktop-sticky` (≥ 768px): fixed left, full height.

---

### 3.3 TopBar

**Vị trí:** `apps/web/src/components/layout/TopBar.tsx`

```ts
interface TopBarProps {
  onSidebarToggle: () => void; // mobile hamburger
  breadcrumb?: BreadcrumbItem[];
  user: User;
  notificationCount?: number;
}
```

**Visual spec:**
- Height `56px`, `bg-white border-b border-slate-200`.
- Padding: `px-4 xl:px-6`.
- Layout: `flex items-center justify-between`.
- Left: Hamburger (mobile only, h-10 w-10) + Breadcrumb.
- Center (xl only): `max-w-md w-full` — CommandPaletteTrigger.
- Right: NotificationBell + UserMenu.

**ASCII:**
```
┌────────────────────────────────────────────────────────────────────────┐
│ [≡] Home › Items             [🔍 Tìm... Ctrl+K]            [🔔][A ▼] │
└────────────────────────────────────────────────────────────────────────┘
```

**A11y:**
- `<header role="banner">`
- CommandPaletteTrigger là `<button>` có `aria-label="Mở tìm kiếm và lệnh (Ctrl+K)"`.
- NotificationBell `aria-label="Thông báo · {count} mới"`.

---

### 3.4 CommandPalette

**Vị trí:** `apps/web/src/components/command/CommandPalette.tsx`

```ts
interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface CommandGroup {
  heading: string;
  items: CommandItem[];
}

interface CommandItem {
  id: string;
  label: string;
  icon?: React.ComponentType;
  shortcut?: string;
  action: () => void;
}
```

**Dùng lib:** `cmdk` (Radix-style, shadcn wrap).

**Visual spec:**
- Overlay: `fixed inset-0 bg-overlay z-command-palette`.
- Dialog: `max-w-xl w-full mx-auto mt-[15vh] bg-white rounded-md shadow-pop`.
- Input: `h-12 border-b border-slate-200 px-4 text-base`.
- Results: `max-h-96 overflow-y-auto py-2`.
- Item: `h-9 px-4 flex items-center justify-between rounded cursor-pointer`.
- Item active: `bg-slate-100`.
- Shortcut: `text-xs text-slate-500 font-mono`.

**ASCII:**
```
Overlay (z-50)
┌──────────────────────────────────────────┐
│ 🔍 [Gõ lệnh hoặc tìm...]              │ ✕│
├──────────────────────────────────────────┤
│ Điều hướng                               │
│   📊 Dashboard                    G I    │
│   📦 Vật tư                       G V    │
│   🛒 Nhà cung cấp                 G S    │
│ Hành động                                │
│   + Thêm vật tư mới              N I    │
│   + Tạo đơn hàng (V1.1)          N O    │
│ Vật tư                                   │
│   RM-0001  Thép C45                      │
│   RM-0002  Nhôm 6061                     │
│   ... (fuzzy search)                     │
└──────────────────────────────────────────┘
```

**A11y:**
- Trap focus inside palette.
- `role="combobox"` on input, `aria-expanded`, `aria-controls`.
- Announce via live region khi hover item.

**Variants:**
- none (single).

---

### 3.5 UserMenu

**Vị trí:** `apps/web/src/components/layout/UserMenu.tsx`

```ts
interface UserMenuProps {
  user: User;
  onLogout: () => Promise<void>;
}
```

**Visual spec:**
- Trigger button: `h-10 px-2 rounded flex items-center gap-2`.
- Avatar: `w-8 h-8 rounded-full bg-slate-200 text-slate-700 font-medium text-sm` (initials nếu no avatar).
- Chevron: `w-4 h-4 text-slate-500`.
- Dropdown: `w-56 bg-white rounded-md shadow-pop border border-slate-200 z-dropdown`.
- MenuItem: `h-9 px-3 flex items-center gap-2 text-sm hover:bg-slate-50`.
- Divider: `h-px bg-slate-200 my-1`.
- Logout: `text-danger-strong` last item.

**ASCII:**
```
Trigger (TopBar):
[Avatar] Thắng Nguyễn ▼

Dropdown (z-40):
┌──────────────────────────────┐
│ Thắng Nguyễn                 │
│ admin@songchau.vn            │
│ Vai trò: Admin               │
├──────────────────────────────┤
│ 👤 Hồ sơ                     │
│ ⚙️  Cài đặt                  │
│ 🌓 Đang chạy chế độ sáng     │  (V1: readonly)
├──────────────────────────────┤
│ ❓ Trợ giúp                  │
│ 📜 Phiên bản v1.0.0          │
├──────────────────────────────┤
│ 🚪 Đăng xuất                 │
└──────────────────────────────┘
```

**A11y:**
- Radix `DropdownMenu` (focus trap, arrow key navigation).
- `aria-haspopup="menu"`, `aria-expanded`.

---

### 3.6 Breadcrumb

**Vị trí:** `apps/web/src/components/ui/breadcrumb.tsx`

```ts
interface BreadcrumbProps {
  items: BreadcrumbItem[];
  maxItems?: number; // default 3, collapse middle
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}
```

**Visual spec:**
- Height `40px`, `bg-white border-b border-slate-200 px-4`.
- Items: `text-sm text-slate-600`, last item `text-slate-900 font-medium`.
- Separator: `›` (U+203A) `text-slate-400 mx-2`.
- Collapse middle: `Home › ... › Current` khi items > maxItems.

**ASCII:**
```
┌──────────────────────────────────────────────┐
│ Home › Vật tư › RM-0001                      │
└──────────────────────────────────────────────┘
```

**A11y:**
- `<nav aria-label="Breadcrumb">`.
- `<ol>` với `<li>`, last item `aria-current="page"`.
- Separator `aria-hidden="true"`.

---

### 3.7 Dialog

**Vị trí:** `apps/web/src/components/ui/dialog.tsx` (shadcn)

```ts
interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  variant?: "default" | "destructive";
  children: React.ReactNode;
  actions: React.ReactNode; // footer buttons
  size?: "sm" | "md" | "lg"; // 400 / 480 / 640
}
```

**Visual spec:**
- Overlay: `fixed inset-0 bg-overlay z-dialog animate-fade-in`.
- Content: `bg-white rounded-md shadow-dialog max-w-{sm|md|lg} w-full mx-auto mt-[20vh] p-6`.
- Title: `text-lg font-semibold text-slate-900`.
- Description: `text-sm text-slate-600 mt-1`.
- Destructive title: `text-danger-strong`.
- Close button: top-right `w-8 h-8`.
- Footer: `flex justify-end gap-2 mt-6`.

**ASCII:**
```
Backdrop
┌──────────────────────────────────┐
│ Xoá vật tư RM-0001?          ✕ │  title 18 + close
├──────────────────────────────────┤
│ Vật tư này đang được tham chiếu │  description
│ trong 3 BOM revision.            │
│                                  │
│ Nhập "XOA" để xác nhận:          │  content
│ [_________________]              │
├──────────────────────────────────┤
│                [Huỷ] [Xoá]      │  actions right
└──────────────────────────────────┘
```

**A11y:**
- Radix `Dialog` (focus trap, Esc close, return focus to trigger).
- `aria-labelledby`, `aria-describedby` auto wire.
- Destructive action button `bg-danger text-white hover:bg-danger-strong`.

**Variants:**
- `default` (informational confirm)
- `destructive` (type-to-confirm required)

---

### 3.8 Sheet

**Vị trí:** `apps/web/src/components/ui/sheet.tsx` (shadcn)

```ts
interface SheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  side: "right" | "left" | "bottom" | "top";
  title: string;
  description?: string;
  size?: "sm" | "md" | "lg"; // 360 / 480 / 640
  children: React.ReactNode;
  footer?: React.ReactNode;
}
```

**Visual spec:**
- Overlay: `bg-overlay z-dialog`.
- Content right: `fixed inset-y-0 right-0 w-{sm|md|lg} bg-white shadow-pop border-l border-slate-200`.
- Animation: slide-in-right 200ms ease-snap.
- Header: `h-14 px-6 border-b border-slate-200 flex items-center justify-between`.
- Body: `flex-1 overflow-y-auto p-6`.
- Footer: `h-18 px-6 border-t border-slate-200 flex items-center justify-end gap-2`.

**ASCII:**
```
┌───────── (main content dim) ──┐┌─ Sheet w-480 ─────────────┐
│                               ││ Sửa vật tư: RM-0001    ✕ │
│ ...                           │├───────────────────────────┤
│                               ││ Body content              │
│                               ││ (form fields)             │
│                               ││                           │
│                               │├───────────────────────────┤
│                               ││ [Huỷ]          [Lưu]     │
└───────────────────────────────┘└───────────────────────────┘
```

**A11y:**
- Radix `Dialog` based, focus trap, Esc close.
- `role="dialog"`, `aria-modal="true"`.

**Variants:**
- Side: right (default - edit), left (filter side panel), bottom (mobile action sheet), top (scan queue).

---

### 3.9 Checkbox

**Vị trí:** `apps/web/src/components/ui/checkbox.tsx` (shadcn + Radix)

```ts
interface CheckboxProps {
  checked?: boolean | "indeterminate";
  onCheckedChange?: (checked: boolean) => void;
  disabled?: boolean;
  label?: string;
  description?: string;
  id?: string;
  name?: string;
}
```

**Visual spec:**
- Size: `w-5 h-5` (20×20) default, `w-6 h-6` (24×24) PWA touch.
- Unchecked: `bg-white border border-slate-300 rounded-sm`.
- Checked: `bg-cta border-cta text-white`.
- Indeterminate: `bg-cta/50 border-cta` với `─` icon.
- Focus: `shadow-focus`.
- Disabled: `bg-slate-100 border-slate-200 cursor-not-allowed opacity-60`.
- Check icon: `w-4 h-4` Lucide `Check`.

**ASCII:**
```
☐ Unchecked  (bg white, border slate-300)
☑ Checked    (bg cta, white check icon)
⊟ Indeterminate (bg cta/50, dash icon)
```

**A11y:**
- Radix `Checkbox` primitive — native semantics.
- Label linked via `htmlFor={id}`.
- `aria-checked="true|false|mixed"`.

---

### 3.10 Skeleton

**Vị trí:** `apps/web/src/components/ui/skeleton.tsx`

```ts
interface SkeletonProps {
  className?: string;
  variant?: "rect" | "circle" | "text";
  width?: string | number;
  height?: string | number;
  count?: number;
}
```

**Visual spec:**
- Base class: `.skeleton` (defined §1.4) — bg-slate-200 + shimmer gradient.
- Variants:
  - `rect`: `rounded-sm`.
  - `circle`: `rounded-full`.
  - `text`: `h-4 rounded-sm` (matches text-sm lh).
- Animation: shimmer 1200ms linear infinite.
- Reduced motion: static `bg-brand-mist`.

**ASCII:**
```
[██████████████████] ← shimmer wave slides left to right
       → wave
```

**A11y:**
- Role: `role="status"`, `aria-busy="true"`, `aria-label="Đang tải nội dung"`.
- Screen reader: announce "Đang tải" once when appear.

**Variants:**
- TableRowSkeleton (10 rows × N cols, preset cho DataTable).
- CardSkeleton (KpiCard loading preset).
- FormSkeleton (6 fields × 40px).

---

### 3.11 EmptyState

**Vị trí:** `apps/web/src/components/ui/empty-state.tsx`

```ts
interface EmptyStateProps {
  icon?: React.ComponentType | string; // component or SVG path
  illustration?: React.ReactNode; // custom SVG
  title: string;
  description?: string;
  actions?: React.ReactNode; // buttons
  preset?: "no-data" | "no-filter-match" | "error" | "empty-success";
  className?: string;
}
```

**Visual spec:**
- Container: `flex flex-col items-center text-center py-12 px-6 max-w-md mx-auto`.
- Illustration: `w-18 h-18` (144×144) or preset.
- Title: `text-lg font-semibold text-slate-900 mt-4`.
- Description: `text-sm text-slate-600 mt-2`.
- Actions: `flex gap-2 mt-6`.

**Presets:**
- `no-data`: illustration empty box, CTA "Tạo mới / Import".
- `no-filter-match`: illustration magnifier, CTA "Xoá bộ lọc".
- `error`: illustration alert triangle, CTA "Thử lại".
- `empty-success`: illustration checkmark, text "Tất cả đã hoàn tất! 🎉".

**ASCII:**
```
      ┌────────┐
      │ [SVG]  │   144×144
      │        │
      └────────┘
      
      Chưa có dữ liệu
      Bắt đầu bằng cách thêm mới
      
      [+ Thêm]  [⤓ Import]
```

**A11y:**
- `role="region"` `aria-label={title}`.
- Illustration `aria-hidden="true"`.

---

### 3.12 StatusBadge

**Vị trí:** `apps/web/src/components/domain/StatusBadge.tsx`

```ts
interface StatusBadgeProps {
  status: BadgeStatus;
  label?: string; // override default
  size?: "sm" | "md";
  showIcon?: boolean; // default true — WCAG requirement
}

type BadgeStatus =
  | "active"       // ● success  "Đang hoạt động"
  | "inactive"     // ○ slate    "Ngưng hoạt động"
  | "draft"        // ○ slate    "Nháp"
  | "released"     // ◆ info     "Đã phát hành"
  | "shortage"     // ⚠ warning  "Thiếu"
  | "critical"     // ✕ danger   "Nghiêm trọng"
  | "ready"        // ✓ success  "Sẵn sàng"
  | "partial"      // ◐ warning  "Một phần"
  | "pending"      // ⏳ info     "Chờ xử lý"
  | "pass"         // ✓ success  "PASS"
  | "fail";        // ✕ danger   "FAIL"
```

**Visual spec:**
- Size sm: `h-5 px-2 text-xs rounded-sm gap-1`.
- Size md: `h-6 px-2 text-sm rounded-sm gap-1`.
- Icon: `w-3 h-3` (sm) or `w-4 h-4` (md), stroke 1.5 Lucide.
- Colors (bg + text):
  - success: `bg-success-soft text-success-strong`
  - warning: `bg-warning-soft text-warning-strong`
  - danger: `bg-danger-soft text-danger-strong`
  - info: `bg-info-soft text-info-strong`
  - slate: `bg-slate-100 text-slate-600`

**ASCII:**
```
[● Active ]   ← green soft bg, green strong text, dot icon
[⚠ Thiếu]    ← amber
[✕ Fail  ]   ← red
[◐ Một phần] ← amber, circle-half icon
[◆ Released] ← blue, diamond icon
[○ Nháp   ]  ← slate, empty circle
```

**A11y:**
- Icon luôn có (mandatory 3-channel: icon + label + color).
- Icon `aria-hidden="true"` (label đã cover).
- Container: `<span role="status">` nếu standalone, hoặc inline span nếu trong row.

**Variants:**
- Badge có `showIcon={false}` CHỈ khi đặt cạnh StatusIcon riêng (tránh double icon).

---

### 3.13 KpiCard

**Vị trí:** `apps/web/src/components/domain/KpiCard.tsx`

```ts
interface KpiCardProps {
  label: string;
  value: number | string;
  delta?: {
    value: number; // percentage or absolute
    direction: "up" | "down" | "flat";
    label?: string; // "vs tuần trước"
  };
  status?: "success" | "warning" | "danger" | "info" | "neutral";
  sparkline?: number[]; // optional mini chart data
  icon?: React.ComponentType;
  onClick?: () => void; // navigate
  loading?: boolean;
}
```

**Visual spec:**
- Container: `bg-white border border-slate-200 rounded-md p-4 min-h-14`.
- Hover (when clickable): `hover:border-slate-300 cursor-pointer transition-fast`.
- Status indicator: border-left 4px theo status color (success/warning/danger).
- Label: `text-sm text-slate-600 mb-1`.
- Value: `text-4xl font-bold text-slate-900 tabular-nums` (36px).
- Delta: `text-sm font-mono text-success/danger mt-1 flex items-center gap-1`.
- Sparkline: `h-8 mt-2` — Recharts LineChart mini (no axis, no legend).
- Icon: top-right `w-5 h-5 text-slate-400`.

**ASCII:**
```
┌───────────────────────┐
│ Đơn đang          [📦]│  label + icon
│                       │
│ 12                    │  value 36px
│                       │
│ ↑ 2 (17%)             │  delta success, arrow up
│ vs tuần trước         │
│                       │
│ ▂▅█▇▆  (sparkline)   │  optional
└───────────────────────┘
  border-l-4 border-success (conditional status)
```

**A11y:**
- Clickable version: `<button role="link">` or wrap `<Link>`.
- `aria-label="Đơn đang: 12, tăng 2 so với tuần trước"`.
- Delta icon `aria-hidden`, info trong aria-label.

**Variants:**
- `interactive` (with onClick, hover state).
- `static` (no hover).
- `loading` (skeleton 112×full).
- `tv` (font 72px — V1.1).

---

### 3.14 OrdersReadinessTable

**Vị trí:** `apps/web/src/components/domain/OrdersReadinessTable.tsx`

```ts
interface OrdersReadinessTableProps {
  orders: OrderReadinessRow[];
  loading?: boolean;
  onRowClick?: (order: OrderReadinessRow) => void;
  limit?: number; // default 10
}

interface OrderReadinessRow {
  id: string;
  orderCode: string;      // "SO-101"
  productName: string;    // "CNC-200"
  productQty: number;     // 2
  deadline: Date;
  daysLeft: number;       // computed
  readinessPercent: number; // 0-100
  shortageSkus: number;
  status: BadgeStatus;
}
```

**Visual spec:**
- Table compact: row h-10, zebra `odd:bg-zebra`.
- Column Ready%: progress bar inline + label right.
  - Progress bar: `h-1.5 w-16 rounded-full bg-slate-200`.
  - Fill: `bg-success` nếu ≥ 80, `bg-warning` nếu 40–79, `bg-danger` nếu < 40.
- Daysleft: `text-xs text-slate-500` suffix `(còn {n}d)` hoặc `(quá hạn)` đỏ.
- Footer: "[Xem tất cả (N) »]" link.

**ASCII:**
```
┌────┬──────────┬─────────┬──────────┬──────────────┬────────┬──────────┐
│Mã  │SP        │Qty      │Deadline  │Ready         │Short  │Status    │
├────┼──────────┼─────────┼──────────┼──────────────┼────────┼──────────┤
│101 │CNC-200   │ 2       │20/04(2d) │78% ███████░░ │4 SKU  │◐ Partial │
│102 │Jig-X     │ 3       │22/04(4d) │95% █████████▌│1 SKU  │● Ready   │
│103 │Fix-A     │ 1       │25/04(7d) │40% ████░░░░░░│9 SKU  │⚡ Shortage│
└────┴──────────┴─────────┴──────────┴──────────────┴────────┴──────────┘
[Xem tất cả (12) »]
```

**A11y:**
- `<table>` semantic với `<caption>` "Đơn hàng sắp giao, sắp xếp theo deadline".
- Progress bar: `role="progressbar"` `aria-valuenow={percent}` `aria-valuemin=0` `aria-valuemax=100`.

**Variants:**
- Full variant (`/orders` route V1.1) vs Compact dashboard variant.

---

### 3.15 ItemQuickEditSheet

**Vị trí:** `apps/web/src/components/items/ItemQuickEditSheet.tsx`

```ts
interface ItemQuickEditSheetProps {
  itemId: string | null; // null = closed
  onClose: () => void;
  onSaved?: (item: Item) => void;
}
```

**Visual spec:**
- Sheet right size `md` (480px).
- Header: "Sửa nhanh: {sku}" + close.
- Body: ItemForm compact (no tabs — all fields stacked with section dividers).
- Footer: [Huỷ] [Lưu] [Mở full-page →].

**ASCII:**
```
Sheet right w-480:
┌──────────────────────────────┐
│ Sửa nhanh: RM-0001        ✕ │
├──────────────────────────────┤
│ Mã SKU                       │
│ [RM-0001_________] (disabled)│
│                              │
│ Tên *                        │
│ [Thép hợp kim C45__________] │
│                              │
│ Loại          UoM            │
│ [RAW   ▼]    [kg   ▼]        │
│                              │
│ Trạng thái                   │
│ ● Active  ○ Inactive         │
│                              │
│ ─── Tracking ───             │
│ ☐ Theo lô                    │
│                              │
├──────────────────────────────┤
│ [Huỷ] [Mở full] [Lưu]       │
└──────────────────────────────┘
```

**A11y:**
- Uses Sheet primitive (§3.8) a11y.
- Focus first input on open, restore focus to trigger on close.

**Variants:**
- `create` mode: sheet with empty form + "Tạo mới".
- `edit` mode: prefilled.

---

### 3.16 ColumnMapperStep

**Vị trí:** `apps/web/src/components/items/ColumnMapperStep.tsx`

```ts
interface ColumnMapperStepProps {
  sourceHeaders: string[];        // from Excel file
  sampleRows: string[][];         // first 3 data rows
  targetFields: TargetField[];    // DB fields
  initialMapping?: Record<string, string | null>; // source → target
  onChange: (mapping: Record<string, string | null>) => void;
  saveAsDefault?: boolean;
  onSaveAsDefaultChange?: (checked: boolean) => void;
}

interface TargetField {
  key: string;
  label: string;
  required: boolean;
  type: "string" | "number" | "enum";
  enumValues?: string[];
}
```

**Visual spec:**
- Table: `border-collapse` 3 cols: Source | Target select | Sample.
- Row h-12 (compact), zebra.
- Target select dropdown với "-- Bỏ qua --" + required fields bold + non-required gray.
- Required field bắt buộc map → validation banner.
- Sample: `text-slate-500 text-xs font-mono truncate max-w-xs`.

**ASCII:**
```
┌────────────────────┬──────────────────────┬────────────────────┐
│ Cột Excel          │ Trường DB            │ Sample (3 rows)    │
├────────────────────┼──────────────────────┼────────────────────┤
│ "Mã sản phẩm"      │ [sku (bắt buộc) ▼] │ RM-001, RM-002...  │
│ "Tên"              │ [name *          ▼] │ Thép C45, Nhôm...  │
│ "ĐVT"              │ [uom *           ▼] │ kg, kg, pcs        │
│ "Loại"             │ [type *          ▼] │ RAW, RAW, FAB      │
│ "Ghi chú"          │ [description     ▼] │ Thép hợp kim...    │
│ "Tồn đầu"          │ [-- Bỏ qua --    ▼] │ 1240, 320, 12      │
└────────────────────┴──────────────────────┴────────────────────┘

✓ Tất cả trường bắt buộc đã map.
ⓘ Bỏ qua 1 cột không map.

☐ Lưu mapping này làm mặc định
```

**A11y:**
- `<table>` với `<caption>` "Khớp cột Excel với trường hệ thống".
- Select: `<label htmlFor>` cho source header.

---

### 3.17 BarcodeScanner

**Vị trí:** `apps/web/src/components/scan/BarcodeScanner.tsx`

```ts
interface BarcodeScannerProps {
  onDetect: (value: string) => void;
  onError?: (error: Error) => void;
  enableFlashlight?: boolean;
  enableSound?: boolean; // default true
  enableHaptic?: boolean; // default true
  disabled?: boolean;
}
```

**Lib:** `html5-qrcode` wrap.

**Visual spec:**
- Container: `relative w-full aspect-square max-w-md mx-auto bg-slate-900 rounded-md overflow-hidden`.
- Video: `absolute inset-0 w-full h-full object-cover`.
- Reticle overlay: `absolute inset-1/2 -translate-1/2 w-80 h-80 border-2 border-cta rounded-md pointer-events-none`.
- Corners: 4 corner brackets `w-6 h-6 border-cta` at reticle corners.
- Flash overlay (success): `bg-scan-flash-success animate-flash-success`.
- Flash overlay (error): `bg-scan-flash-danger animate-flash-danger`.
- Controls bottom-right: flashlight toggle, sound toggle (icon buttons 48×48).
- Status line below: "Hướng mã vạch vào khung quét".

**ASCII:**
```
┌──────────────────────────────────┐
│ ╔══╗                        ╔══╗ │  corner brackets (cta)
│ ║                              ║ │
│ ║                              ║ │
│ ║   [camera feed]              ║ │  video
│ ║                              ║ │
│ ║                              ║ │
│ ╚══╝                        ╚══╝ │
│                                  │
│                       [💡][🔇]  │  controls
└──────────────────────────────────┘
Hướng mã vạch vào khung quét
```

**A11y:**
- Live region announce scan result: `aria-live="polite"` text "Đã quét {sku}".
- Permission denial fallback: manual input fallback visible prominently.
- Keyboard: Enter submit manual input.
- Respect `prefers-reduced-motion` (no flash animation).

**Variants:**
- `camera` (default).
- `keyboard-wedge` (hidden input for USB scanner — desktop).
- `manual-only` (no camera, just input).

---

### 3.18 ScanQueueBadge + ScanQueueSheet + ReceivingConsole

#### 3.18.1 ScanQueueBadge

**Vị trí:** `apps/web/src/components/scan/ScanQueueBadge.tsx`

```ts
interface ScanQueueBadgeProps {
  count: number;
  status: "idle" | "syncing" | "error";
  onClick: () => void; // open ScanQueueSheet
}
```

**Visual spec:**
- Size `h-8 px-2 rounded-full flex items-center gap-1`.
- Idle (count=0): `bg-slate-100 text-slate-600` "●0".
- Idle (count>0): `bg-warning-soft text-warning-strong` "●{count}".
- Syncing: `bg-info-soft text-info-strong` với spinner "⟳{count}".
- Error: `bg-danger-soft text-danger-strong` "⚠{count}".

**ASCII:**
```
[● 3]          ← warning
[⟳ 2 syncing]  ← info
[⚠ 1 error]   ← danger
```

**A11y:**
- `<button aria-label="Scan chờ sync: {count}, {status}">`.

#### 3.18.2 ReceivingConsole

**Vị trí:** `apps/web/src/components/receiving/ReceivingConsole.tsx`

```ts
interface ReceivingConsoleProps {
  poId: string;
  poCode: string;
  supplierName: string;
  lines: POLine[];
  onCommit: (receipts: LineReceipt[]) => Promise<void>;
  onCancel: () => void;
}

interface POLine {
  id: string;
  sku: string;
  name: string;
  orderedQty: number;
  uom: string;
  trackingMode: "none" | "lot" | "serial";
  status: "pending" | "partial" | "received";
}

interface LineReceipt {
  lineId: string;
  receivedQty: number;
  lotNo?: string;
  expDate?: string;
  qcStatus: "pass" | "fail";
  qcNote?: string;
}
```

**Visual spec:** (composition của sub-components đã spec ở §2.8)

**A11y:**
- Split panel: each side `<section aria-label>`.
- Live region cho scan feedback (polite).
- Action bar `role="toolbar"`.

**Variants:**
- `online` (default).
- `offline` (disable commit button, queue only).

---

## §4. Iconography & Illustration

### 4.1 Icon set

**Library:** `lucide-react` (current, đã dùng).
**Style:** stroke 1.5px, rounded corners, 16/20/24px.

**Icon list cho mỗi screen:**

| Screen | Icons (Lucide names) |
|---|---|
| Login | `Package` (logo fallback), `Eye`, `EyeOff`, `CheckSquare`, `Loader2` |
| Dashboard | `LayoutDashboard`, `TrendingUp`, `TrendingDown`, `AlertTriangle`, `Package`, `ShoppingCart`, `Factory`, `RefreshCw`, `Activity` |
| AppShell | `Menu`, `X`, `Search`, `Bell`, `User`, `ChevronDown`, `ChevronLeft`, `ChevronRight`, `LogOut`, `Settings` |
| Items | `Plus`, `Upload`, `Filter`, `X`, `Eye`, `Edit`, `MoreHorizontal`, `Trash2`, `Download`, `Check`, `Copy`, `ArrowUpDown` |
| Item Detail | `ArrowLeft`, `Save`, `Trash2`, `Image`, `Paperclip`, `Info`, `AlertCircle` |
| Import Wizard | `UploadCloud`, `FileSpreadsheet`, `Check`, `AlertCircle`, `XCircle`, `Download`, `ArrowRight`, `ArrowLeft` |
| Suppliers | `Building2`, `Phone`, `Mail`, `Truck`, `Clock` |
| PWA Receive | `ScanLine`, `Flashlight`, `Volume2`, `VolumeX`, `Wifi`, `WifiOff`, `QrCode`, `Package`, `CheckCircle2`, `XCircle` |

**Custom icons (NOT in Lucide):** none cho V1. Nếu cần, tạo SVG riêng trong `apps/web/src/components/icons/`.

### 4.2 Empty state illustration strategy

**Approach:** tự vẽ line-art SVG inline (không dùng unDraw — màu không match palette).

**Format:** inline React component, stroke `#334155` (brand.steel) 1.5px, fill none, size 144×144 (desktop), 96×96 (compact sheet).

**Bộ illustration cần:**
| Name | Dùng cho | Style |
|---|---|---|
| `EmptyBoxIllustration` | No items, no suppliers | Hộp carton mở, gear cụm bên cạnh, line-art |
| `EmptyMagnifierIllustration` | No filter match | Kính lúp + dấu `?` |
| `EmptyClipboardIllustration` | No orders | Clipboard với dấu `+` cạnh |
| `EmptyTruckIllustration` | No shipments / PO | Xe tải line-art chở thùng |
| `EmptyErrorIllustration` | Error | Tam giác cảnh báo + đèn đỏ xoay (static) |
| `EmptySuccessIllustration` | All done | Dấu check + confetti stylized |
| `EmptyOfflineIllustration` | PWA offline | Wifi bị gạch chéo, spinner nhỏ |

**File path:** `apps/web/src/components/icons/illustrations/*.tsx`

**Benchmark:** mỗi SVG < 5KB, không external fonts, không image embed.

### 4.3 Logo SVG cho Login Hero

**Brief:** Line-art CNC milling machine nhìn nghiêng 3/4, stylized geometric, monochrome `#334155` stroke 1.5px trên transparent bg.

**Thành phần:**
- Base column (máy đứng) với gear cluster cạnh đáy.
- Spindle đầu máy với end mill stylized.
- Workpiece block trên bàn máy với đường cắt subtle.
- Digital readout panel nhỏ phía trước.
- Dimension: 480×360 (xl), 360×270 (lg), ẩn (md).

**File:** `apps/web/public/illustrations/login-hero-cnc.svg` (inline trong component, không external request).

**Lý do chọn line-art:** đạt industrial minimalism, không license issue, không pixelate khi zoom, dễ animate subtle (gear slow rotate 60s linear infinite — optional).

**Logo mark:**
- File: `apps/web/public/logo-mark.svg` (32×32, 64×64 variants).
- Concept: Gear `⚙` cách điệu với hexagon nut center và "M" letterform (MES) subtle.
- Color: `brand.ink` (#0F172A) solid fill, hoặc outline variant cho dark bg.
- File: cũng export 512×512 PNG cho favicon sinh tự động.

---

## §5. Motion guidelines

### 5.1 Technology choice

- **CSS transitions/keyframes** cho: hover, focus, skeleton shimmer, scan flash, sheet/dialog fade — **default**.
- **Framer Motion** (lib `framer-motion`) chỉ cho: sidebar collapse (width + opacity coordinated), sheet spring, KPI delta counter animation — **optional, chỉ khi cần orchestration phức tạp**.
- **Lottie:** KHÔNG dùng V1 (bundle size + animation weight không đáng).

**Rule:** nếu CSS đủ, không import framer-motion.

### 5.2 Duration tokens

| Use case | Duration | Easing |
|---|---|---|
| Hover (bg, border) | 80ms | ease-industrial |
| Focus ring appear | 80ms | ease-industrial |
| Tooltip fade | 150ms | ease-industrial |
| Fade in/out (dialog overlay, toast) | 150ms | ease-industrial |
| Sheet slide-in from right | 200ms | ease-snap |
| Sheet slide-out | 200ms | ease-in-soft |
| Dialog content fade+scale | 200ms | ease-snap (scale 0.96→1, opacity 0→1) |
| Scan success flash | 600ms | ease-snap (opacity peak 30%, fade out) |
| Scan error shake | 240ms (80×3) | ease-industrial |
| Skeleton shimmer | 1200ms | linear (infinite) |
| Sidebar collapse | 320ms | ease-industrial |
| Page transition | 150ms fade (no slide) | ease-industrial |
| KPI counter roll-up | 600ms | ease-out-quart (one-time on mount) |

### 5.3 Scan feedback spec (chi tiết)

**Success sequence (600ms total):**
1. t=0ms: audio beep 880Hz sine 200ms.
2. t=0ms: haptic `vibrate([50])`.
3. t=0–300ms: row background fade to `#D1FAE5` + ring `scan-success`.
4. t=300–600ms: fade back to transparent, ring disappears.
5. t=300ms: auto-scroll next pending row into view (smooth).
6. t=350ms: focus QtyInput của line vừa scan (nếu chưa điền).

**Error sequence (240ms shake + 600ms flash):**
1. t=0ms: audio beep 220Hz sawtooth 300ms.
2. t=0ms: haptic `vibrate([50, 100, 50])` (pattern 3 pulse).
3. t=0–240ms: scanner panel shake (translate ±6px × 3).
4. t=0–600ms: overlay background flash to `#FEE2E2`.
5. t=0ms: toast top-center sticky danger "SKU không khớp".

**Duplicate sequence (no shake, just warning):**
1. t=0ms: audio 660Hz 100ms (tone giữa success/error).
2. t=0ms: haptic `vibrate([30, 30])`.
3. toast warning "Đã scan SKU này — cộng dồn qty?".

### 5.4 Reduced motion

Khi `prefers-reduced-motion: reduce`:
- Tất cả duration > 200ms → 0ms.
- Shimmer skeleton → static `bg-brand-mist`.
- Shake → skip animation (giữ audio + haptic + toast).
- Flash → instant color change (no fade).
- Sidebar collapse → instant (no width animate).
- Page transitions → instant.

---

## §6. Accessibility contract

### 6.1 WCAG levels

- **AA target:** all interactive elements, icon contrast, focus indicators.
- **AAA target:** body text on white bg (`#0F172A` trên `#FFFFFF` = 17.3:1), heading.
- **AAA exceeded:** status strong variants (success-strong, warning-strong, danger-strong, info-strong) — tất cả > 7:1.

### 6.2 Color-blind mandatory format

**Rule:** MỌI status indicator phải có 3 kênh đồng thời:
- Icon (w-3..5 Lucide, stroke 1.5).
- Label text (tiếng Việt, ngắn).
- Color (từ token success/warning/danger/info).

**Ví dụ sai:** `<span className="text-danger">Thiếu</span>` (chỉ màu).
**Ví dụ đúng:** `<StatusBadge status="shortage" />` render `[⚠ Thiếu]` icon+text+bg.

### 6.3 Screen reader

**Live regions:**
- `<div aria-live="polite" aria-atomic="true">` cho scan feedback.
- `<div role="status">` cho skeleton loading "Đang tải".
- Sonner toast tự wire `role="status"` (đã có lib).

**Announcements:**
- Scan success: "Đã quét RM-0001, số lượng 400 kg, đánh dấu PASS".
- Scan error: "Mã XY-999 không có trong đơn. Vui lòng quét lại".
- Save success: "Đã lưu vật tư RM-0001".
- Navigation: breadcrumb announce current page.

**Skip link:**
- Visible chỉ khi focus (translate từ -20 → 0).
- Target: `<main id="main-content" tabIndex={-1}>`.

### 6.4 Keyboard-only path

**Critical flow (phải test):**
Dashboard → Ctrl+K → gõ "vật tư" → Enter → Items list → Tab sang row 1 → Space chọn → j di chuyển → e quick-edit → Tab through fields → Ctrl+S → Sheet close → Tab Logout → Enter.

**Focus management:**
- Dialog/Sheet open: focus first tab-stop inside, trap focus.
- Dialog/Sheet close: restore focus to trigger.
- Route change: focus `<main>` (skip link target).
- Toast: no focus steal (aria-live polite only).

### 6.5 Reduced motion

Đã spec §5.4.

### 6.6 Touch target

- Desktop: min 32×32 (WCAG) — nhưng đẩy lên 40×40 default cho comfort.
- Tablet/PWA: min 48×48 mandatory (WCAG 2.5.5 AAA + glove requirement).

### 6.7 Form a11y

- Mọi `<input>` có `<label htmlFor>` visible hoặc `aria-label`.
- Error: `aria-invalid="true"` + `aria-describedby={helperTextId}`.
- Required: `aria-required="true"` + visual `*`.
- Helper text: `<p id={helperTextId} className="text-xs text-slate-600">`.
- Error helper text: `text-danger-strong` + icon `AlertCircle` inline.

---

## §7. Asset checklist cho cook agent

### 7.1 SVG files cần tạo

| File path | Size | Dùng cho | Spec |
|---|---|---|---|
| `apps/web/public/logo-mark.svg` | 64×64 | Logo brand (sidebar, login) | Gear + hex nut + "M", brand.ink fill |
| `apps/web/public/logo-mark-outline.svg` | 64×64 | Logo dark bg variant (PWA top bar) | Stroke white, fill none |
| `apps/web/public/illustrations/login-hero-cnc.svg` | 480×360 | Login hero | Line-art CNC machine, slate-300 stroke |
| `apps/web/src/components/icons/illustrations/EmptyBox.tsx` | 144×144 | Items empty | Inline React SVG, slate-400 stroke |
| `apps/web/src/components/icons/illustrations/EmptyMagnifier.tsx` | 96×96 | No filter match | Inline |
| `apps/web/src/components/icons/illustrations/EmptyClipboard.tsx` | 144×144 | No orders (Dashboard) | Inline |
| `apps/web/src/components/icons/illustrations/EmptyTruck.tsx` | 144×144 | No suppliers, no PO | Inline |
| `apps/web/src/components/icons/illustrations/EmptyError.tsx` | 96×96 | Error fallback | Inline |
| `apps/web/src/components/icons/illustrations/EmptySuccess.tsx` | 96×96 | All done | Inline |
| `apps/web/src/components/icons/illustrations/EmptyOffline.tsx` | 96×96 | PWA offline | Inline |

**Tất cả SVG:**
- `viewBox="0 0 {w} {h}"`, `xmlns="http://www.w3.org/2000/svg"`.
- Stroke 1.5px, stroke-linecap round, stroke-linejoin round.
- Không `fill` bên trong path (trừ logo solid).
- Không external font, không image embed.
- Gzipped < 5KB mỗi file (inline sẽ compressed trong bundle).

### 7.2 PWA icons

**Tool:** `pwa-asset-generator` (npm) chạy từ `logo-mark.svg`.

```bash
pnpm dlx pwa-asset-generator apps/web/public/logo-mark.svg apps/web/public/icons \
  --manifest apps/web/public/manifest.webmanifest \
  --background "#0F172A" \
  --opaque true \
  --padding "15%" \
  --type png \
  --favicon
```

**Output files:**
| File | Size | Dùng cho |
|---|---|---|
| `apps/web/public/favicon.ico` | multi-res (16, 32, 48) | Browser tab |
| `apps/web/public/icons/icon-192.png` | 192×192 | PWA home screen Android low-dpi |
| `apps/web/public/icons/icon-256.png` | 256×256 | PWA mid-dpi |
| `apps/web/public/icons/icon-384.png` | 384×384 | PWA high-dpi |
| `apps/web/public/icons/icon-512.png` | 512×512 | PWA splash screen, maskable |
| `apps/web/public/icons/icon-maskable-512.png` | 512×512 (safe zone padding) | Android adaptive icon |
| `apps/web/public/apple-touch-icon.png` | 180×180 | iOS Safari add to home screen |

**`manifest.webmanifest` template:**
```json
{
  "name": "Xưởng IoT — BOM MES",
  "short_name": "Xưởng IoT",
  "description": "Hệ thống quản lý BOM-centric cho xưởng cơ khí",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#F8FAFC",
  "theme_color": "#0F172A",
  "orientation": "any",
  "lang": "vi",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-256.png", "sizes": "256x256", "type": "image/png" },
    { "src": "/icons/icon-384.png", "sizes": "384x384", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "shortcuts": [
    {
      "name": "Nhận hàng",
      "short_name": "Receive",
      "url": "/pwa/receive",
      "icons": [{ "src": "/icons/icon-192.png", "sizes": "192x192" }]
    }
  ]
}
```

### 7.3 Open Graph image

**File:** `apps/web/public/og-image.png` (1200×630).

**Design:**
- Background: `#0F172A` (brand.ink) với subtle grid pattern `#1E293B` 1px lines, 48px spacing.
- Left 40%: logo-mark 200×200 + "Xưởng IoT" (Be Vietnam Pro 700 56px white) + "BOM-centric MES" (Inter 400 24px slate-400).
- Right 60%: CNC hero illustration (từ login-hero-cnc.svg) stroke slate-500.
- Bottom bar: "mes.songchau.vn" font-mono 20px slate-400.

**Tool generate:** dùng `@vercel/og` (Edge function) hoặc Figma export. Ưu tiên `@vercel/og` vì dynamic render được build version.

**Metadata:**
```ts
// apps/web/src/app/layout.tsx
export const metadata: Metadata = {
  title: "Xưởng IoT — BOM-centric MES",
  description: "Hệ thống quản lý BOM, đơn hàng và kho cho xưởng cơ khí Việt Nam",
  openGraph: {
    title: "Xưởng IoT",
    description: "BOM-centric MES cho xưởng cơ khí",
    url: "https://mes.songchau.vn",
    siteName: "Xưởng IoT",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    locale: "vi_VN",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Xưởng IoT — BOM MES",
    description: "Quản lý xưởng cơ khí BOM-centric",
    images: ["/og-image.png"],
  },
};
```

### 7.4 Fonts

Đã spec §1.5. Cook agent chỉ cần copy block `next/font` vào `app/layout.tsx`.

### 7.5 Template Excel

**File:** `apps/web/public/templates/items_template.xlsx` (đã có placeholder trong brainstorm, cần verify).

**Sheet 1 "Hướng dẫn":** text tiếng Việt về cột bắt buộc.
**Sheet 2 "Dữ liệu":** header row: `Mã SKU | Tên | Loại | Đơn vị | Mô tả | Mã vạch | Theo lô | Theo serial`.
- 3 rows ví dụ filled.
- Data validation cột Loại: dropdown RAW/FAB/SUB/FG.
- Data validation cột Đơn vị: dropdown kg/pcs/L/m/roll/set.

**Tool:** dùng `SheetJS` (xlsx) hoặc Python `openpyxl` sinh lần đầu, commit file.

---

## §8. Summary checklist cho cook agent

### Pre-cook
- [ ] Fix §4 P0 bugs (env.ts, migration 0002, worker Dockerfile) — xem brainstorm §4.
- [ ] Install shadcn components: `dialog`, `sheet`, `checkbox`, `skeleton`, `command`, `dropdown-menu`, `tabs`, `tooltip`, `breadcrumb`, `progress`.
- [ ] Install libs: `cmdk`, `html5-qrcode`, `dexie`, `react-dropzone`, `xlsx`, `@tanstack/react-table`, `@tanstack/react-virtual`, `next-pwa` (or Workbox custom).

### Cook order (theo brainstorm §6)
1. Tailwind + globals.css patches (§1.3 + §1.4).
2. Foundation components (§3.7–3.12): Dialog, Sheet, Checkbox, Skeleton, EmptyState, StatusBadge.
3. Layout shell (§3.1–3.6): AppShell, Sidebar, TopBar, CommandPalette, UserMenu, Breadcrumb.
4. Screen 1: Login (§2.1).
5. Screen 2: Dashboard (§2.2) + KpiCard + OrdersReadinessTable (§3.13, §3.14).
6. Screen 4: Items list redesign (§2.4) + ItemQuickEditSheet (§3.15).
7. Screen 5: Item detail tabs (§2.5).
8. Screen 6: Import wizard v2 (§2.6) + ColumnMapperStep (§3.16).
9. Screen 7: Suppliers stub (§2.7).
10. Screen 8: PWA Receiving (§2.8) + BarcodeScanner + ScanQueueBadge + ReceivingConsole (§3.17, §3.18).
11. Asset generation (§7) + manifest + OG image.
12. Accessibility audit + Lighthouse + manual QA.
13. Merge.

### Merge acceptance (đã copy từ brainstorm §5.5, thêm spec-specific)
- [ ] Tất cả spec trong §2 acceptance criteria pass.
- [ ] `pnpm typecheck` + `pnpm test` pass 100%.
- [ ] Lighthouse ≥ 90 Performance / 95 A11y / 100 Best Practices trên `/login`, `/`, `/items`, `/pwa/receive/*`.
- [ ] axe-core 0 serious/critical.
- [ ] Tablet 1024×768 không horizontal scroll.
- [ ] Tap target ≥ 48px trên PWA.
- [ ] Search tiếng Việt không dấu hoạt động.
- [ ] PWA install prompt hiển thị Chrome Android.
- [ ] Reduced motion respect 100%.
- [ ] Keyboard-only navigate end-to-end.
- [ ] Empty/loading/error states có design riêng cho mọi screen.
- [ ] Vietnamese diacritics render đúng 100 từ complex.

---

## §9. Change log

| Ver | Ngày | Ghi chú |
|---|---|---|
| 1.0 | 2026-04-17 | Initial design spec Direction B. Cover 8 screens + 18 components + tokens + motion + a11y + assets. Blueprint cho sprint 10 ngày. |

---

*End of design spec. Next action: ui-ux-developer agent cook theo §8 Pre-cook + Cook order.*
