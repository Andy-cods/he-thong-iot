# Implementation Plan V2 — Redesign toàn bộ UI/UX (Linear-inspired · zinc + electric blue)

*Phiên bản:* 2.0-plan · *Ngày:* 2026-04-17 · *Persona:* planner (strategic)
*Tác giả:* Claude (Opus 4.7, 1M context) — theo yêu cầu user sau brainstorm V2 đã duyệt
*Branch:* `redesign/direction-b-v2` (từ `redesign/direction-b` HEAD, 30 commit V1 base)
*Input:* `plans/redesign-v2/260417-v2-brainstorm.md` (774 dòng), `plans/redesign/260417-design-spec.md` (V1 spec để biết REPLACE cái gì)
*Pending:* `plans/redesign-v2/260417-v2-design-spec.md` (ui-ux-designer tạo song song — nếu có conflict, design spec V2 thắng; plan này adjust sau)
*Output cook:* 11 commit tuần tự build local Windows → user review browser → duyệt → deploy VPS mới

**Nguyên tắc cook:**
- YAGNI / KISS / DRY — REPLACE tokens + redesign visual layer, GIỮ 100% logic backend (hooks, state machine, repos, URL state, RBAC)
- Build local trước khi cook commit tiếp (pnpm `--filter @iot/web build` PASS bắt buộc)
- Tiếng Việt mọi label UI + comment
- KHÔNG touch VPS cũ trong suốt V2 cook (VPS cũ giữ V1 LIVE làm fallback)
- Mỗi commit mô tả theo conventional commits + sign-off Co-Authored-By

---

## §1. Tổng quan sprint V2

### 1.1 Timeline 10-12 ngày

| Ngày | Task | Output | User review |
|---|---|---|---|
| **D1** | T1 — Tokens refactor (tailwind.config + globals.css + docs/design-guidelines-v2.md) | Commit 1 | Skip (không UI thay đổi) |
| **D2** | T2 — UI primitives wave 1 (Button, Input, Label, Checkbox, Select, Textarea) | Commit 2 | Preview page `/v2-preview` (optional) |
| **D3** | T3 — UI primitives wave 2 (Dialog, Sheet, Popover, Dropdown, Tabs, Skeleton, Badge + Tooltip NEW) | Commit 3 | Preview page primitives |
| **D4** | T4 — Layout (AppShell, Sidebar 220px, TopBar 44px, UserMenu, Breadcrumb, CommandPalette) | Commit 4 | Shell + nav + topbar flow |
| **D5** | T5 — Domain components (KpiCard, OrdersReadinessTable, AlertsList, SystemHealthCard, StatusBadge, EmptyState + xóa illustrations) | Commit 5 | Skip (chờ dashboard T6) |
| **D6** | T6 — Screens `/login` + `/` Dashboard | Commit 6 + 10 (login) merged order | Review browser login → dashboard |
| **D7** | T7 — Screen `/items` list + ItemListTable/FilterBar/BulkActionBar | Commit 7 (items list portion) | Review `/items` browser |
| **D8** | T8 — Screens `/items/[id]` + `/items/new` + ItemForm + ItemQuickEditSheet | Commit 7 (items form portion) | Review form create/edit |
| **D9** | T9 — Screen `/suppliers` + `/items/import` wizard | Commit 8 + 7 (import portion) | Review suppliers + import |
| **D10** | T10 — Screen `/pwa/receive` + final polish | Commit 9 + 11 cleanup | Review PWA tablet emulate |
| **D11-D12** | Iteration loop với user feedback | Tune tokens/class | 3-5 vòng/màn |

Timeline giảm 30% so với V1 (V1 cook 14 ngày include logic; V2 chỉ visual layer).

### 1.2 Dependency graph

```
T1 tokens ─┬─> T2 primitives wave 1 ─┬─> T4 layout ─┬─> T6 login + dashboard ─┬─> iter loop
           └─> T3 primitives wave 2 ─┘              ├─> T7 items list          │
                                                   ├─> T8 items form          │
T1 ───────────────────────────> T5 domain ─────────┼─> T6 dashboard           │
                                                   ├─> T7 items list          │
                                                   └─> T9 suppliers + import  │
T1 ───────────────────────────────────────────────> T10 pwa ───────────────────┤
                                                                              └─> T11 cleanup → deploy
```

**Critical path:** T1 → T2/T3 → T4 → T6-T10 → T11.
**Parallel:** T5 domain components có thể cook song song T3 primitives wave 2 (không dependency).

### 1.3 Tiêu chí merge V2 → main (sau user duyệt)

- [ ] 11 commit đầy đủ trên branch `redesign/direction-b-v2`, mỗi commit build PASS local
- [ ] `pnpm --filter @iot/web typecheck` không regress (baseline ≤ V1 count errors)
- [ ] `pnpm --filter @iot/web build` PASS với exit code 0
- [ ] 8 màn render browser local `http://localhost:3000` không lỗi console blocking
- [ ] User ping "V2 OK" sau tổng cộng ≥ 3 vòng iterate từng màn
- [ ] PROGRESS.md cập nhật V2 milestone + link commit
- [ ] Tag `v2.0.0` tạo sau khi duyệt
- [ ] Rollback path sẵn: branch `redesign/direction-b` V1 giữ nguyên

### 1.4 Risk register 5 risk + mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **R1: User feedback loop > 10 vòng/màn** | Med | High | Chốt cứng design spec V2 (file `260417-v2-design-spec.md`) trước khi cook T6; feedback chỉ tune class/value, không rewrite spec. Nếu > 5 vòng/màn → pause, đào sâu root cause (spec sai hay execution sai). |
| **R2: Inter font Vietnamese diacritics tofu fallback** | Low | High | Preload `next/font/google` Inter subset `['latin','latin-ext','vietnamese']` với `display: 'swap'`. Test glyphs `ư ơ đ ệ ướng ưỡng` trên Dashboard H1 + body. Fallback `system-ui` giữ trong font-family stack. |
| **R3: Build local Windows pnpm symlink fail (worker bug V1 chưa fix)** | Med | Med | Chỉ cook `@iot/web`, KHÔNG touch `@iot/worker` V2. Worker giữ V1 state disabled. Commit 1 verify `pnpm --filter @iot/web build` PASS standalone không phụ thuộc worker. |
| **R4: Dashboard 500 bug V1 blend vào V2** | Low | Low | Branch V2 inherit bug V1 (redesign visual không fix data layer bug). Commit debug riêng nếu tiện tay fix được trong T6 dashboard. Ghi chú PROGRESS.md. Không block merge V2 vì bug này. |
| **R5: Safety-orange shortage semantic nhầm chỗ (button/link hover bị orange)** | Low | Med | Sau T11 cleanup: Grep audit `bg-cta\|bg-orange\|border-orange\|text-orange` toàn `apps/web/src/` → chỉ còn các node: (1) shortage badge, (2) OrdersReadinessTable shortage row, (3) PWA current item border-l. Các nơi khác phải là blue-500 (CTA) hoặc zinc/emerald/amber/red. |

---

## §2. 25 quyết định chốt từ brainstorm §9

Copy Q&A từ `260417-v2-brainstorm.md` §9, đánh dấu `[CONFIRMED]` mỗi mục. Nếu design spec V2 (pending) có conflict, planner cập nhật commit patch bổ sung.

| # | Câu hỏi | Đáp án | Status |
|---|---|---|---|
| Q1 | Font | **Inter** với feature-settings `"cv11" 1, "ss01" 1, "cv02" 1`, subset `['latin','latin-ext','vietnamese']`. Bỏ `Be Vietnam Pro`. | CONFIRMED |
| Q2 | Dark mode V2.0 | **Reserve token** `[data-theme="dark"]` CSS var + `--bg-page/--bg-card/--text-primary/--accent-default`. KHÔNG cook toggle UI. | CONFIRMED |
| Q3 | Border color default | **zinc-200 (#E4E4E7)**. Replace slate-200 (#E2E8F0). | CONFIRMED |
| Q4 | Primary CTA hex | **blue-500 (#3B82F6)** default, blue-600 (#2563EB) hover, blue-700 (#1D4ED8) press. Tailwind blue scale, AA 4.52:1 trên white. | CONFIRMED |
| Q5 | Safety-orange dùng ở đâu | **CHỈ 3 chỗ semantic shortage**: (a) Badge "Thiếu hàng" bg-orange-50 + text-orange-700 + AlertTriangle 12px; (b) OrdersReadinessTable row shortage `bg-orange-50 + border-l-2 border-orange-500`; (c) PWA ReceivingConsole current item card border-l 2px orange-500. KHÔNG cho button/CTA/link. | CONFIRMED |
| Q6 | Font body px | **13px (0.8125rem)** line-height 18px. `text-sm` map 13/18. | CONFIRMED |
| Q7 | H1 page title | **20px (1.25rem) weight 600** line-height 28px tracking-tight (-0.01em). Inter. | CONFIRMED |
| Q8 | KPI value px + weight | **22px (1.375rem) weight 500 tabular-nums** (KHÔNG bold). text-zinc-900 default, text-red-600 critical, text-orange-600 shortage. | CONFIRMED |
| Q9 | Button default size | **h-8 (32px) px-3 text-sm (13px) weight 500 rounded-md**. PWA override h-11 (44px) text-base (14px). | CONFIRMED |
| Q10 | Input default size form | **h-9 (36px) px-3 text-sm (13px) rounded-md border-zinc-200**. Filter bar h-8 (32px). PWA h-11 (44px). | CONFIRMED |
| Q11 | Table row list pages | **h-9 (36px)**. No zebra. border-b zinc-100. | CONFIRMED |
| Q12 | Row hover bg | **bg-zinc-50 (#FAFAFA)** transition 100ms ease-out. | CONFIRMED |
| Q13 | Row selected | **bg-blue-50 (#EFF6FF) + border-l-2 border-blue-500**. Cell đầu padding-left giảm 2px bù. Checkbox sync. | CONFIRMED |
| Q14 | Sidebar width | **220px fixed desktop** (`--sidebar-width: 13.75rem`). Mobile drawer 280px overlay. Bỏ rail-collapsed 56px. | CONFIRMED |
| Q15 | Topbar height | **44px (h-11) desktop**. Mobile 56px (h-14) cho tap target. | CONFIRMED |
| Q16 | Card padding | **list/dashboard card p-4 (16px)**; **form section card p-5 (20px)**; Dialog/Sheet body 20px. | CONFIRMED |
| Q17 | Focus ring | **CSS outline** không box-shadow. `outline: 2px solid #3B82F6; outline-offset: 2px` trên `:focus-visible`. PWA override 3px #2563EB. | CONFIRMED |
| Q18 | Border radius | **3 tokens**: sm=4px (badge/chip), md=6px (button/input/card/popover/dropdown/tab), lg=8px (dialog/sheet/cmdk). Bỏ 12px. | CONFIRMED |
| Q19 | Shadow default card | **shadow-none + border border-zinc-200 bg-white**. Interactive hover: shadow-xs + border-zinc-300. | CONFIRMED |
| Q20 | Dialog shadow | **0 16px 48px rgba(0,0,0,0.12)** single-layer. Bỏ double-drop V1. | CONFIRMED |
| Q21 | Motion hover duration | **100ms (duration-100) ease-out** cho bg-color + border-color. Button press scale 100ms. Card hover lift 150ms. | CONFIRMED |
| Q22 | Sheet slide duration | **200ms ease-out-quart** `cubic-bezier(0.25, 1, 0.5, 1)`. | CONFIRMED |
| Q23 | Font size label uppercase | **11px (0.6875rem) weight 500 uppercase tracking-wide** letter-spacing 0.02em text-zinc-500. | CONFIRMED |
| Q24 | Empty state style | **Lucide icon 32px stroke 1.5 zinc-400** + title 14px weight 500 + desc 12px zinc-500 + CTA sm ghost. **XÓA `components/ui/illustrations/` folder**. | CONFIRMED |
| Q25 | Tailwind slate alias cho migration | **Commit 1 giữ tạm slate alias** (không break code cũ); **Commit 11 cleanup xóa slate-* hoàn toàn + remap còn lại sang zinc-**. Tránh big-bang conflict. | CONFIRMED |

**Pending override:** Nếu `260417-v2-design-spec.md` (ui-ux-designer tạo song song) return hex/size khác → planner cập nhật section này trước khi cook T1. Hiện plan lock theo brainstorm §9.

---

## §3. Git flow

### 3.1 Branch strategy

```bash
# Tạo branch V2 từ V1 HEAD (giữ 30 commit V1 base)
git checkout redesign/direction-b
git pull  # (local thôi, không remote vì VPS cũ đang LIVE V1)
git checkout -b redesign/direction-b-v2
```

**Base:** `redesign/direction-b` HEAD commit `90cf125` (hoặc HEAD hiện tại nếu có thêm).
**KHÔNG** rebase V1 khi cook V2 (tránh conflict với LIVE VPS).

### 3.2 Commit convention

Mỗi commit theo format:
```
<type>(redesign-v2): <subject lowercase>

- bullet 1 cụ thể file
- bullet 2 cụ thể token/value
- bullet 3 acceptance đã verify

🤖 Generated with Claude Code
Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

Types: `chore`, `refactor`, `feat` (không dùng cho V2 vì không add logic), `fix`, `docs`.

### 3.3 Tag sau merge

```bash
# Sau user duyệt + merge vào main
git checkout main
git merge --no-ff redesign/direction-b-v2
git tag -a v2.0.0 -m "UI/UX Redesign V2 — Linear-inspired zinc+blue"
# push main + tag khi setup VPS mới xong (không push trước)
```

### 3.4 Rollback path

Nếu V2 flop trong iteration:
```bash
git checkout redesign/direction-b  # V1 LIVE, UI xấu nhưng functional
# VPS cũ tiếp tục serve, DNS không đổi
```
Không force-push, không delete branch V2 (giữ artifact).

---

## §4. Tokens refactor (T1)

**Dependency:** None. Commit đầu tiên, base cho tất cả commit sau.
**Estimate:** 4-6 giờ (edit 2 file + tạo 1 doc).

### 4.1 Files change

| File | Action | Ghi chú |
|---|---|---|
| `apps/web/tailwind.config.ts` | Modify | Replace color palette, fontSize scale, spacing scale, borderRadius map, boxShadow map, animation/keyframes |
| `apps/web/src/app/globals.css` | Modify | Replace CSS custom properties, load Inter next/font, remove Be Vietnam Pro, update keyframes |
| `docs/design-guidelines-v2.md` | **NEW (create)** | 150-200 dòng — replicate structure V1 `docs/design-guidelines.md` nhưng tokens V2 zinc+blue. Include §Palette §Typography §Spacing §Radius §Shadow §Motion §Density D3 §A11y |
| `apps/web/src/app/layout.tsx` | Modify | Replace font import (Be Vietnam Pro → Inter), update className cho html |

### 4.2 Detail patch tailwind.config.ts

**Thay toàn bộ `colors` section:**
```ts
colors: {
  // Neutral zinc scale (replace slate)
  zinc: require('tailwindcss/colors').zinc,
  // Keep slate alias (CHỈ Commit 1, cleanup Commit 11)
  slate: require('tailwindcss/colors').zinc, // TEMP alias, remove Commit 11
  // Accent blue
  blue: require('tailwindcss/colors').blue,
  // Status
  emerald: require('tailwindcss/colors').emerald,
  amber: require('tailwindcss/colors').amber,
  red: require('tailwindcss/colors').red,
  sky: require('tailwindcss/colors').sky,
  orange: require('tailwindcss/colors').orange, // shortage semantic only
  // Semantic tokens (CSS var pointing)
  'bg-page': 'var(--bg-page)',
  'bg-card': 'var(--bg-card)',
  'bg-muted': 'var(--bg-muted)',
  'bg-hover': 'var(--bg-hover)',
  'border-subtle': 'var(--border-subtle)',
  'border-strong': 'var(--border-strong)',
  'text-primary': 'var(--text-primary)',
  'text-secondary': 'var(--text-secondary)',
  'text-muted': 'var(--text-muted)',
  'text-placeholder': 'var(--text-placeholder)',
  'text-inverse': 'var(--text-inverse)',
  'accent-default': 'var(--accent-default)',
  'accent-hover': 'var(--accent-hover)',
  'accent-press': 'var(--accent-press)',
  'accent-soft': 'var(--accent-soft)',
  'accent-border': 'var(--accent-border)',
  'shortage-default': 'var(--shortage-default)',
  'shortage-soft': 'var(--shortage-soft)',
  'shortage-strong': 'var(--shortage-strong)',
},
```

**Replace `fontSize` scale:**
```ts
fontSize: {
  '11': ['0.6875rem', { lineHeight: '0.875rem' }],    // 11/14 — label uppercase
  xs:   ['0.75rem',   { lineHeight: '1rem' }],         // 12/16 — meta
  sm:   ['0.8125rem', { lineHeight: '1.25rem' }],      // 13/20 — BODY DEFAULT
  '15': ['0.9375rem', { lineHeight: '1.25rem' }],      // 15/20 — H3
  lg:   ['1.125rem',  { lineHeight: '1.5rem' }],       // 18/24 — H2
  xl:   ['1.25rem',   { lineHeight: '1.75rem' }],      // 20/28 — H1
  '2xl':['1.375rem',  { lineHeight: '1.75rem' }],      // 22/28 — KPI value
  '3xl':['1.75rem',   { lineHeight: '2rem' }],         // 28/32 — KPI hero login
  '5xl':['3rem',      { lineHeight: '3.25rem' }],      // 48/52 — TV dashboard
},
```

**Replace `spacing` extend:**
```ts
spacing: {
  // 9-value scale
  '1': '0.25rem',   // 4
  '2': '0.5rem',    // 8
  '3': '0.75rem',   // 12
  '4': '1rem',      // 16
  '5': '1.25rem',   // 20
  '6': '1.5rem',    // 24
  '8': '2rem',      // 32
  '12': '3rem',     // 48
  '16': '4rem',     // 64
  // Sidebar width override
  '55': '13.75rem', // 220px sidebar V2
  '70': '17.5rem',  // 280px sidebar mobile drawer
  // Topbar
  '11': '2.75rem',  // 44px topbar V2
},
```

**Replace `borderRadius`:**
```ts
borderRadius: {
  sm: '0.25rem',  // 4px — badge/chip
  DEFAULT: '0.375rem', // 6px
  md: '0.375rem', // 6px — button/input/card/popover
  lg: '0.5rem',   // 8px — dialog/sheet/cmdk
  full: '9999px',
},
```

**Replace `boxShadow`:**
```ts
boxShadow: {
  none: 'none',
  xs: '0 1px 2px rgba(0,0,0,0.04)',
  sm: '0 2px 4px rgba(0,0,0,0.05), 0 1px 2px rgba(0,0,0,0.04)',
  md: '0 4px 12px rgba(0,0,0,0.06)',
  lg: '0 16px 48px rgba(0,0,0,0.12)',
  toast: '0 8px 24px rgba(0,0,0,0.10)',
},
```

**Replace `transitionTimingFunction` + `transitionDuration`:**
```ts
transitionTimingFunction: {
  'ease-out': 'cubic-bezier(0.16, 1, 0.3, 1)',
  'ease-out-quart': 'cubic-bezier(0.25, 1, 0.5, 1)',
  'ease-industrial': 'cubic-bezier(0.4, 0, 0.2, 1)', // V1 back-compat
},
transitionDuration: {
  '100': '100ms',  // micro
  '150': '150ms',  // fast
  '200': '200ms',  // standard
  '320': '320ms',  // large
},
```

**Bỏ font `Be Vietnam Pro`:**
```ts
fontFamily: {
  sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  mono: ['var(--font-jetbrains)', 'ui-monospace', 'monospace'],
  // heading: removed, use sans weight 600 only
},
```

### 4.3 Detail patch globals.css

**Replace toàn bộ `:root` block:**
```css
:root {
  /* Neutral */
  --bg-page: #FAFAFA;
  --bg-card: #FFFFFF;
  --bg-muted: #F4F4F5;
  --bg-hover: #F4F4F5;
  --border-subtle: #E4E4E7;
  --border-strong: #D4D4D8;
  --text-primary: #18181B;
  --text-secondary: #3F3F46;
  --text-muted: #71717A;
  --text-placeholder: #A1A1AA;
  --text-inverse: #FAFAFA;

  /* Accent */
  --accent-default: #3B82F6;
  --accent-hover: #2563EB;
  --accent-press: #1D4ED8;
  --accent-soft: #EFF6FF;
  --accent-border: #93C5FD;
  --accent-ring: rgba(59, 130, 246, 0.35);

  /* Shortage semantic */
  --shortage-default: #F97316;
  --shortage-soft: #FFF7ED;
  --shortage-strong: #C2410C;

  /* Layout */
  --sidebar-width: 13.75rem;       /* 220px */
  --sidebar-width-mobile: 17.5rem; /* 280px drawer */
  --topbar-height: 2.75rem;        /* 44px */
  --content-max-width: 1440px;
}

/* Dark mode reserve — không toggle V2.0 */
[data-theme="dark"] {
  --bg-page: #09090B;
  --bg-card: #18181B;
  --bg-muted: #27272A;
  --border-subtle: #27272A;
  --text-primary: #FAFAFA;
  --text-muted: #A1A1AA;
  --accent-default: #60A5FA;
}

/* Base */
html {
  font-size: 13px; /* default body */
  -webkit-text-size-adjust: 100%;
}
body {
  background: var(--bg-page);
  color: var(--text-primary);
  font-family: var(--font-inter), system-ui, sans-serif;
  font-feature-settings: "cv11" 1, "ss01" 1, "cv02" 1;
  font-size: 0.8125rem; /* 13px */
  line-height: 1.25rem; /* 20px */
}

/* Focus visible — CSS outline not box-shadow */
*:focus-visible {
  outline: 2px solid var(--accent-default);
  outline-offset: 2px;
  border-radius: inherit;
}

/* PWA override */
[data-scope="pwa"] *:focus-visible {
  outline: 3px solid var(--accent-hover);
  outline-offset: 2px;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0ms !important;
  }
}
```

**Remove:** Be Vietnam Pro import, slate-* CSS vars, old shadows vars (`--shadow-dialog`, `--shadow-pop`, `--ring-focus`).

### 4.4 Detail patch layout.tsx

Replace font import:
```tsx
import { Inter, JetBrains_Mono } from 'next/font/google';

const inter = Inter({
  subsets: ['latin', 'latin-ext', 'vietnamese'],
  display: 'swap',
  variable: '--font-inter',
});

const jetbrains = JetBrains_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jetbrains',
});

// <html lang="vi" className={`${inter.variable} ${jetbrains.variable}`}>
```

**Remove:** `Be_Vietnam_Pro` import + variable.

### 4.5 Commit message T1

```
refactor(redesign-v2): replace V1 Industrial Slate with V2 zinc+blue palette

- tailwind.config.ts: replace color/fontSize/spacing/borderRadius/boxShadow tokens
- globals.css: new CSS var scale (bg-page/bg-card/accent-*/shortage-*/dark reserve)
- layout.tsx: replace Be Vietnam Pro with Inter next/font (vietnamese subset)
- docs/design-guidelines-v2.md: new 180-line spec (palette/typo/spacing/radius/shadow/motion/density/a11y)
- keep slate-* alias temp (will cleanup Commit 11)
- keep ease-industrial alias for V1 back-compat

Acceptance:
- pnpm --filter @iot/web typecheck: no regress (baseline = V1 count)
- pnpm --filter @iot/web build: PASS
- No UI component changed yet (defer T2-T10)
```

### 4.6 Acceptance T1

- [ ] `pnpm --filter @iot/web typecheck` exit 0 hoặc regress ≤ 0
- [ ] `pnpm --filter @iot/web build` exit 0
- [ ] `pnpm --filter @iot/web dev` start OK, `http://localhost:3000` render (visual chưa đổi vì component chưa cook)
- [ ] File `docs/design-guidelines-v2.md` tồn tại và ≥ 150 dòng
- [ ] Inter font load thành công (DevTools Network tab `fonts.gstatic.com` return 200)
- [ ] Vietnamese diacritics test: load `http://localhost:3000/login` quan sát headline có ư/ơ/đ render đúng

---

## §5. UI primitives refactor (T2-T3)

**Dependency:** T1 (tokens).
**Estimate T2:** 6-8 giờ (6 primitives).
**Estimate T3:** 6-8 giờ (7 primitives + new Tooltip).

### 5.1 T2 — Primitives wave 1

Thứ tự cook (dependency-aware):

#### 5.1.1 Button (`apps/web/src/components/ui/button.tsx`)

**Replace full file.** Variants + sizes theo brainstorm §3:
- Variants: `default` (bg-blue-500 text-white hover:bg-blue-600 active:bg-blue-700), `secondary` (bg-zinc-100 text-zinc-900 hover:bg-zinc-200), `outline` (border border-zinc-300 hover:bg-zinc-50), `ghost` (hover:bg-zinc-100), `danger` (bg-red-500 text-white hover:bg-red-600), `link` (text-blue-600 underline-offset-2 hover:underline)
- Sizes:
  - `xs`: `h-6 px-2 text-xs` (24px)
  - `sm`: `h-7 px-2.5 text-sm` (28px)
  - `default`: `h-8 px-3 text-sm` (32px)
  - `lg`: `h-11 px-4 text-sm` (44px) — PWA
  - `icon`: `h-8 w-8` (hoặc `h-7 w-7` cho toolbar)
- Common: `rounded-md font-medium transition-colors duration-100 active:scale-[0.98] transition-transform disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-none` (focus ring handled globally via `*:focus-visible`)

**Acceptance:** Props API giữ nguyên V1 (`variant`, `size`, `asChild`, `className`). Visual diff per brainstorm §3 Button row.

#### 5.1.2 Input (`apps/web/src/components/ui/input.tsx`)

Replace:
- Default `h-9 px-3 text-sm rounded-md border border-zinc-200 bg-white` (form)
- Filter variant via className override `h-8`
- PWA scope via `[data-scope="pwa"]` selector: `h-11 text-base`
- Focus: handled by global `*:focus-visible` (CSS outline)
- Error state: `aria-invalid` → `border-red-500`
- Placeholder: `text-placeholder` (zinc-400)

#### 5.1.3 Label (`apps/web/src/components/ui/label.tsx`)

- Default 13px weight 500 text-zinc-900 margin-bottom 6px
- Uppercase variant `data-variant="uppercase"`: 11px weight 500 uppercase tracking-wide text-zinc-500
- Required asterisk red-500

#### 5.1.4 Checkbox (`apps/web/src/components/ui/checkbox.tsx`)

Replace Radix size:
- `h-4 w-4` (16px) border 1.5px zinc-300
- Checked: bg-blue-500 border-blue-500 + tick SVG stroke 2.5 size 12px
- Indeterminate: dash center 2px wide
- Focus outline 2px blue-500 offset 1px

#### 5.1.5 Select (`apps/web/src/components/ui/select.tsx`)

- Trigger: default `h-9` (form), class override `h-8` cho filter
- Chevron 14px zinc-500
- Content: `shadow-sm border border-zinc-200 rounded-md bg-white`
- Item: `h-8 px-2.5 text-sm`, selected `bg-blue-50 text-blue-700 + CheckIcon 14px right`
- Animation: fade 150ms

#### 5.1.6 Textarea (`apps/web/src/components/ui/textarea.tsx`)

- `border border-zinc-200 rounded-md min-h-[72px] p-3 text-sm bg-white resize-vertical`
- Focus handled global
- Error `aria-invalid` → border-red-500

**Commit T2 message:**
```
refactor(redesign-v2): primitives wave 1 — button/input/label/checkbox/select/textarea

- button: 6 variants × 5 sizes, rounded-md, active:scale-[0.98]
- input: h-9 form, h-8 filter, h-11 pwa scope
- label: default 13px/500, uppercase variant 11px
- checkbox: 16px box, blue-500 checked, stroke 2.5 tick
- select: trigger h-9/h-8, content shadow-sm border zinc-200
- textarea: border zinc-200 min-h 72px resize-vertical
- preserve props API V1 (variant/size/className/asChild)

Acceptance: typecheck PASS, build PASS, visual match brainstorm §3
```

### 5.2 T3 — Primitives wave 2

#### 5.2.1 Dialog (`apps/web/src/components/ui/dialog.tsx`)

- Overlay `bg-black/50` fade 150ms
- Content `max-w-md rounded-lg shadow-lg border border-zinc-200 bg-white p-5`
- Header `pb-4 border-b border-zinc-100`
- Footer `pt-4 border-t border-zinc-100 flex justify-end gap-2`
- Animation: fade 150ms + `data-[state=open]:animate-in data-[state=closed]:animate-out` scale 96→100 200ms
- Title 15px weight 600, description 13px zinc-500

#### 5.2.2 Sheet (`apps/web/src/components/ui/sheet.tsx`)

- Slide right 200ms ease-out-quart
- Width `w-[480px]` desktop, `w-full` mobile
- Header/body/footer padding 20px
- `rounded-l-lg` (8px trái)
- Backdrop `bg-black/40`

#### 5.2.3 Popover (`apps/web/src/components/ui/popover.tsx`)

- `max-w-80 p-3 shadow-sm border border-zinc-200 bg-white rounded-md`
- No arrow (Linear-style, offset 4px từ trigger)
- Animation fade 150ms

#### 5.2.4 Dropdown (`apps/web/src/components/ui/dropdown-menu.tsx`)

- Content giống Select: `shadow-sm border border-zinc-200 bg-white rounded-md`
- Item `h-8 px-2.5 text-sm`
- Icon leading 14px zinc-500
- Shortcut hint right 11px zinc-400 font-mono
- Separator `border-t border-zinc-100 my-1`

#### 5.2.5 Tabs (`apps/web/src/components/ui/tabs.tsx`)

- TabsList: `border-b border-zinc-200 flex gap-1`
- TabsTrigger: `h-8 px-3 text-sm font-medium text-zinc-500 hover:text-zinc-700 data-[state=active]:text-zinc-900 data-[state=active]:border-b-2 data-[state=active]:border-zinc-900 transition-colors 100ms`
- **Remove:** pill/filled variant V1

#### 5.2.6 Skeleton (`apps/web/src/components/ui/skeleton.tsx`)

- `bg-zinc-100 rounded-md relative overflow-hidden`
- Shimmer overlay `bg-gradient-to-r from-transparent via-white/40 to-transparent` animate 1200ms linear infinite
- Keep V1 keyframe

#### 5.2.7 Badge (`apps/web/src/components/ui/badge.tsx`)

Replace variants:
- `h-5 px-2 text-xs font-medium rounded-sm inline-flex items-center gap-1`
- Variants: default (bg-zinc-100 text-zinc-700), success (bg-emerald-50 text-emerald-700), warning (bg-amber-50 text-amber-700), danger (bg-red-50 text-red-700), info (bg-sky-50 text-sky-700), **shortage (bg-orange-50 text-orange-700)**

#### 5.2.8 Tooltip NEW (`apps/web/src/components/ui/tooltip.tsx`)

**Create new.** Radix Tooltip wrapper:
- Provider: `delayDuration={300} skipDelayDuration={0}`
- Content: `bg-zinc-900 text-white text-xs px-2.5 py-1.5 rounded-md shadow-sm max-w-60`
- Arrow optional (off default)
- Usage: icon-only button + truncate cell

**Install deps check:** `@radix-ui/react-tooltip` đã có trong package.json V1 hay chưa. Nếu chưa, thêm `pnpm --filter @iot/web add @radix-ui/react-tooltip`.

**Commit T3 message:**
```
refactor(redesign-v2): primitives wave 2 — dialog/sheet/popover/dropdown/tabs/skeleton/badge + Tooltip (new)

- dialog: max-w-md shadow-lg rounded-lg p-5, fade 150ms + scale 96→100 200ms
- sheet: 480px right-side slide 200ms ease-out-quart
- popover: max-w-80 shadow-sm, no arrow
- dropdown: h-8 item, leading icon 14px, shortcut kbd right
- tabs: neutral zinc-900 underline (no blue), remove pill variant
- skeleton: shimmer 1200ms preserve V1 keyframe
- badge: h-5 rounded-sm, 6 variants (add shortage)
- NEW Tooltip: Radix wrapper, bg zinc-900 text-xs
```

### 5.3 Acceptance T2 + T3

- [ ] 13 file primitives replaced/created (6 T2 + 7 T3)
- [ ] `typecheck` PASS, `build` PASS
- [ ] Optional: tạo `apps/web/src/app/v2-preview/page.tsx` demo all primitives cho user review nhanh
- [ ] No runtime error console khi mount primitives trong dev

---

## §6. Layout refactor (T4)

**Dependency:** T1 + T2 + T3.
**Estimate:** 6-8 giờ.

### 6.1 Files change

| File | Action | Key changes |
|---|---|---|
| `apps/web/src/components/layout/AppShell.tsx` | Modify | Grid 2-col `[220px_1fr]`, topbar 44px sticky, mobile drawer |
| `apps/web/src/components/layout/Sidebar.tsx` | Replace | 220px fixed, bỏ rail 56px, nav item h-7, active blue-50 + border-l blue-500 |
| `apps/web/src/components/layout/TopBar.tsx` | Replace | h-11 (44px), breadcrumb left, ⌘K hint + notif + avatar right |
| `apps/web/src/components/layout/UserMenu.tsx` | Tune | Dropdown shadow-sm, item h-8 |
| `apps/web/src/components/ui/breadcrumb.tsx` | Tune | Font 13px zinc-500, last zinc-900, sep `/` zinc-300 |
| `apps/web/src/components/command/CommandPalette.tsx` | Tune | `max-w-[560px] rounded-lg shadow-lg`, input h-11, item h-9 |

### 6.2 AppShell spec

```tsx
// Grid layout
<div className="grid grid-cols-[var(--sidebar-width)_1fr] min-h-screen bg-page">
  <Sidebar />
  <main className="flex flex-col">
    <TopBar />
    <div className="flex-1 px-6 py-5 max-w-[1440px]">{children}</div>
  </main>
</div>
```

Mobile (< 1024px): sidebar `fixed inset-y-0 left-0 w-[var(--sidebar-width-mobile)] translate-x-[-100%] data-[open=true]:translate-x-0 transition-transform 200ms z-20` + backdrop.

### 6.3 Sidebar spec

- Container `w-[var(--sidebar-width)] h-screen bg-white border-r border-zinc-200 flex flex-col`
- Logo area `h-12 px-4 flex items-center gap-2` (logo 20px + wordmark 15px weight 600)
- Nav list `px-2 py-3 space-y-0.5`
- Nav item: `h-7 px-2 rounded-md flex items-center gap-2 text-sm font-medium text-zinc-700 hover:bg-zinc-100 transition-colors 100ms`
- Active item: `bg-blue-50 text-blue-700 border-l-2 border-blue-500` (offset padding-left 10px bù border)
- Icon `h-4 w-4` (16px) zinc-500 hoặc blue-500 khi active
- Section group label: `px-2 py-1 text-[11px] uppercase tracking-wide weight 500 text-zinc-500`

### 6.4 TopBar spec

- `h-[var(--topbar-height)] px-6 border-b border-zinc-200 bg-white flex items-center sticky top-0 z-30`
- Left: Breadcrumb flex-1
- Right: Cmd+K hint kbd chip + NotifBell icon 16px + Avatar 28px
- **Remove V1:** inline search input + help button

### 6.5 CommandPalette spec

- Dialog overlay bg-black/50, content `max-w-[560px] rounded-lg shadow-lg bg-white`
- Input: `h-11 text-sm border-0 border-b border-zinc-200 px-4`
- Item: `h-9 px-4 text-sm flex items-center gap-3 data-[selected=true]:bg-zinc-100`
- Kbd hint: `px-1.5 py-0.5 text-[11px] font-mono bg-zinc-100 rounded-sm border border-zinc-200`
- Max 8 results, preserve V1 fuzzy match logic

### 6.6 Commit T4

```
refactor(redesign-v2): layout — AppShell 2-col grid + Sidebar 220px + TopBar 44px + UserMenu + Breadcrumb + CommandPalette

- AppShell: grid [220px_1fr] desktop, mobile drawer 280px overlay z-20
- Sidebar: 220px fixed, bỏ rail-collapsed 56px, nav item h-7 active blue-50+border-l
- TopBar: h-11 (44px), breadcrumb + ⌘K hint + notif + avatar, bỏ search inline + help
- UserMenu: dropdown shadow-sm, item h-8
- Breadcrumb: 13px zinc-500, last zinc-900
- CommandPalette: max-w 560px rounded-lg, input h-11, item h-9
- preserve all nav logic + sidebar storage pattern V1

Acceptance: navigate /login → / → /items, sidebar active state correct, topbar ⌘K opens palette
```

### 6.7 Acceptance T4

- [ ] `pnpm build` PASS
- [ ] Login → dashboard navigate: sidebar active `/` highlight blue
- [ ] Click `/items`: sidebar active chuyển đúng
- [ ] Topbar ⌘K mở CommandPalette, `Esc` đóng
- [ ] Mobile viewport (DevTools 375px): sidebar drawer slide từ trái
- [ ] Keyboard Tab qua sidebar nav items: focus outline visible

---

## §7. Domain components refactor (T5)

**Dependency:** T1 + T2 + T3 (có thể song song T4).
**Estimate:** 6-8 giờ.

### 7.1 Files change

| File | Action | Key changes |
|---|---|---|
| `apps/web/src/components/domain/StatusBadge.tsx` | Tune | Height 20px, icon 12px, text 11px uppercase, remap palette V2 |
| `apps/web/src/components/ui/empty-state.tsx` | Replace | Lucide icon 32px zinc-400, title 14px/500, desc 12px/zinc-500, total height 120-160px |
| `apps/web/src/components/domain/KpiCard.tsx` | Replace | p-4, min-h 72px, value 22px weight 500, label 11px uppercase, **bỏ border-l-4** |
| `apps/web/src/components/domain/OrdersReadinessTable.tsx` | Replace | Row h-9, no zebra, shortage row bg-orange-50 + border-l-2 orange-500 |
| `apps/web/src/components/domain/AlertsList.tsx` | Tune | Item h-12 padding-x 16 py-3, icon 16px leading, title 13px/500, meta 11px |
| `apps/web/src/components/domain/SystemHealthCard.tsx` | Tune | p-4, status dot h-2 w-2, metric row h-6 |
| `apps/web/src/components/ui/illustrations/` (folder) | **DELETE** | Xóa 6 file: EmptyAlert, EmptyBox, EmptyInbox, EmptySearch, OfflineCloud, ScanReady + `index.ts` |
| Import refs cho illustrations | Modify | Grep all `from '@/components/ui/illustrations/*'` → replace icon Lucide |

### 7.2 KpiCard spec detail

```tsx
<div className="p-4 min-h-[72px] bg-white border border-zinc-200 rounded-md flex flex-col gap-1">
  <div className="flex items-center justify-between">
    <span className="text-[11px] uppercase tracking-wide font-medium text-zinc-500">{label}</span>
    {Icon && <Icon className="h-4 w-4 text-zinc-400" />}
  </div>
  <div className="flex items-baseline gap-2">
    <span className={cn("text-2xl font-medium tabular-nums", {
      "text-red-600": critical,
      "text-orange-600": shortage,
      "text-zinc-900": !critical && !shortage,
    })}>{value}</span>
    {delta && <span className="text-xs font-mono text-zinc-500">{delta}</span>}
  </div>
</div>
```

**Bỏ `border-l-4` theo status — status chỉ qua màu text value.**

### 7.3 OrdersReadinessTable spec detail

- Sticky header h-9 `bg-white border-b border-zinc-200 text-[11px] uppercase tracking-wide font-medium text-zinc-500 px-3`
- Row h-9 `border-b border-zinc-100 hover:bg-zinc-50 transition-colors 100ms px-3 text-sm`
- Cell SKU `font-mono text-xs`
- Cell Qty `font-mono text-xs tabular-nums text-right`
- Cell Status: StatusBadge inline
- **Shortage row:** `bg-orange-50 border-l-2 border-orange-500 pl-[10px]` (offset -2)
- Readiness bar: `h-1 bg-zinc-100 rounded-full overflow-hidden` + fill `bg-emerald-500` width %

### 7.4 EmptyState spec detail

```tsx
<div className="flex flex-col items-center justify-center py-12 px-6 text-center gap-3">
  <Icon className="h-8 w-8 text-zinc-400 stroke-[1.5]" />
  <div className="space-y-1">
    <p className="text-[14px] font-medium text-zinc-900">{title}</p>
    <p className="text-xs text-zinc-500 max-w-[320px]">{description}</p>
  </div>
  {action && <Button size="sm" variant="ghost">{action}</Button>}
</div>
```

**Xóa file usage cũ:**
- `empty-state.tsx` props: `illustration: 'EmptyBox' | 'EmptySearch'...` → thay thành `icon: LucideIcon`
- Grep `import { EmptyBox }` etc. → replace `import { Package } from 'lucide-react'` (hoặc icon phù hợp)
- Grep call sites: `<EmptyState illustration="EmptyBox" ... />` → `<EmptyState icon={Package} ... />`

**Icon mapping suggestion:**
- EmptyBox → `Package` (Lucide)
- EmptySearch → `SearchX`
- EmptyAlert → `BellOff`
- EmptyInbox → `Inbox`
- OfflineCloud → `CloudOff`
- ScanReady → `ScanLine`

### 7.5 Commit T5

```
refactor(redesign-v2): domain — KpiCard + OrdersReadinessTable + AlertsList + SystemHealthCard + StatusBadge + EmptyState

- KpiCard: p-4 min-h 72px, value 22px/500 tabular-nums, label 11px uppercase, BỎ border-l-4
- OrdersReadinessTable: row h-9 no zebra, shortage bg-orange-50+border-l-2 orange-500
- AlertsList: item h-12, icon 16px, title 13px, meta 11px
- SystemHealthCard: p-4, status dot 2x2, metric row h-6
- StatusBadge: h-5, icon 12px, 11px uppercase, palette V2 remap
- EmptyState: Lucide icon 32px (thay SVG illustration), title 14px desc 12px
- DELETE apps/web/src/components/ui/illustrations/ folder (6 SVG files + index.ts)
- remap empty state call sites: illustration prop → icon Lucide component

Acceptance: Dashboard render 4 KPI không border-l-4, OrdersReadinessTable shortage row orange, no broken imports
```

### 7.6 Acceptance T5

- [ ] `pnpm build` PASS
- [ ] Grep `from '@/components/ui/illustrations` return 0 matches (all replaced)
- [ ] Dashboard `/` mount: 4 KPI card không có stripe trái, value 22px
- [ ] `/items?status=empty` (simulate): EmptyState icon 32px Lucide thay illustration SVG

---

## §8. Screens redesign (T6-T10)

### 8.1 T6 — `/login` + `/` Dashboard (ngày 6)

#### 8.1.1 `/login` — `apps/web/src/app/login/page.tsx` + `components/login/LoginHero.tsx` + `BuildInfo.tsx`

**File paths:**
- `apps/web/src/app/login/page.tsx`
- `apps/web/src/components/login/LoginHero.tsx`
- `apps/web/src/components/login/BuildInfo.tsx`

**Layout:**
- Desktop: 2-column grid `grid-cols-2`
  - Left 50%: LoginHero `bg-gradient-to-br from-zinc-50 to-blue-50`, padding 64px, tagline 28px weight 600 zinc-900 max-w-md, supporting text 15px zinc-600, logo top-left 32px
  - Right 50%: Form panel `bg-white` flex center
    - `max-w-sm` card (no border, no shadow)
    - Title 20px weight 600 margin-bottom 24px
    - Input h-9 username + password
    - Checkbox "Ghi nhớ" + Link "Quên mật khẩu?" text-xs blue-600
    - Button primary blue-500 h-9 full-width text-sm
    - BuildInfo footer text-xs font-mono zinc-400 right-aligned "v2.0.0 · build xxx · 2026-04-17"
- Mobile: single column, form 100% width padding-x 24px
- **Refine SVG hero:** stroke color đổi `#0F172A` → `#18181B` (zinc-900)

**Acceptance criteria cụ thể:**
- Tagline "Hệ thống quản lý BOM & vật tư" render Inter weight 600 28px
- Input username/password h-9 (36px), focus blue-500 outline
- Button login blue-500 h-9 full-width, click active:scale-[0.98]
- Submit POST `/api/auth/login` thành công → redirect `/`
- Font-size body 13px, heading 20px

**Review checkpoint:** User chụp screenshot `/login`, so sánh brainstorm §4.1 spec. Feedback tune color/size.

#### 8.1.2 `/` Dashboard — `apps/web/src/app/(app)/page.tsx`

**File paths:**
- `apps/web/src/app/(app)/page.tsx`

**Layout:**
- Page padding `px-6 py-5` (24/20)
- Header `flex items-center justify-between mb-4`
  - H1 "Tổng quan vận hành" 20px weight 600
  - Action button "Tạo đơn mới" primary blue-500 h-8
- KPI grid `grid grid-cols-12 gap-4`
  - 4 KpiCard `col-span-3`: Đơn hôm nay / Đơn sẵn sàng / Thiếu hàng / Sắp thiếu
  - Value 22px, label 11px uppercase
- Main section `grid grid-cols-12 gap-4 mt-4`
  - OrdersReadinessTable card `col-span-8` padding 16px
  - Right sidebar `col-span-4`:
    - AlertsList card padding 16px
    - SystemHealthCard padding 16px
- Above-fold target: 720px (fit 1080p minus topbar 44px + browser chrome)

**Acceptance criteria cụ thể:**
- 4 KPI cards line top, height 72px, no stripe trái
- OrdersReadinessTable row 36px no zebra, shortage row orange-50
- AlertsList item 48px, icon 16px
- Section gap 16px
- Page body above fold ≤ 720px ở 1080p

**Review checkpoint:** User review `/` sau T6 merged. Feedback: KPI value size, table row density, alert readability.

**Commit T6 message:**
```
refactor(redesign-v2): screen /login + /dashboard — V2 visual

- /login: 2-col layout, hero gradient zinc-50→blue-50, form max-w-sm, button blue-500 h-9
- /: page px-6 py-5, H1 20px/600, 4 KPI grid-cols-3 span-3
- OrdersReadinessTable span-8, AlertsList + SystemHealthCard span-4
- section gap 16px, above-fold 720px target
- BuildInfo footer text-xs font-mono zinc-400 right

Acceptance: login flow end-to-end OK, dashboard render 4 KPI compact + table 36px row
```

### 8.2 T7 — `/items` list + table components (ngày 7)

#### 8.2.1 `/items` — `apps/web/src/app/(app)/items/page.tsx`

**File paths:**
- `apps/web/src/app/(app)/items/page.tsx`
- `apps/web/src/components/items/ItemListTable.tsx`
- `apps/web/src/components/items/FilterBar.tsx`
- `apps/web/src/components/items/BulkActionBar.tsx`

**Layout:**
- Page padding `px-6 py-5`
- Header: H1 "Danh mục vật tư" 20px + action "Nhập Excel" + "Tạo mới" blue-500 h-8
- FilterBar sticky top-11 (topbar 44px), h-9 bg-white border zinc-200 rounded-md px-2
  - Search input h-8 w-64 icon leading 14px `Search` Lucide
  - Select status h-8, Select category h-8
  - Filter chips badge h-6
  - "Xóa hết" link right text-xs blue-600
- ItemListTable:
  - Sticky header h-9 bg-white border-b zinc-200
  - Row h-9 no zebra border-b zinc-100 hover:bg-zinc-50
  - Selected row: bg-blue-50 + border-l-2 blue-500 pl-[10px]
  - Checkbox cell w-8
  - SKU cell font-mono text-xs w-32
  - Name cell text-sm truncate + Tooltip
  - Qty cell font-mono text-xs tabular-nums right-aligned
  - Actions cell icon-button h-7 w-7 ghost
- BulkActionBar: sticky bottom slide-up 200ms
  - h-12 bg-zinc-900 text-white px-4
  - "3 mục đã chọn" text-sm
  - Action buttons ghost-on-dark h-7 text-sm
  - Close icon-button right
- Pagination bottom h-9

**Acceptance criteria cụ thể:**
- Row 36px, no zebra
- Filter bar sticky đúng top 44px (không che topbar)
- Select 3 rows → BulkActionBar slide up từ bottom
- Deselect all → BulkActionBar slide down
- Keyboard `j`/`k` chuyển row, Space toggle select
- Search text "ALU" → list filter đúng

**Review checkpoint:** User review `/items`. Feedback: row density, selected row visibility, bulk bar contrast.

### 8.3 T8 — `/items/[id]` + `/items/new` + ItemForm (ngày 8)

#### 8.3.1 `/items/new` + `/items/[id]/edit`

**File paths:**
- `apps/web/src/app/(app)/items/new/page.tsx`
- `apps/web/src/app/(app)/items/[id]/page.tsx` (detail + edit mode)
- `apps/web/src/components/items/ItemForm.tsx`
- `apps/web/src/components/items/ItemQuickEditSheet.tsx`

**ItemForm layout:**
- Breadcrumb top: Vật tư > Chi tiết > {name}
- H1 20px weight 600
- Card section `bg-white border border-zinc-200 rounded-md p-5`
  - Section header 15px weight 600 margin-bottom 16px
  - Field label 13px weight 500 zinc-900 margin-bottom 6px
  - Input h-9
  - Helper text 12px zinc-500 margin-top 4px
  - Error text 12px red-600 margin-top 4px
  - Field gap vertical 16px (gap-4)
- Section divider `border-t border-zinc-100 my-5`
- Footer sticky bottom h-14 bg-white border-t zinc-200
  - Button "Hủy" outline h-8 + "Lưu" primary blue-500 h-8 right-aligned

**ItemQuickEditSheet:** Sheet 480px right
- Header h-12 px-5 border-b
- Body p-5 gap-4
- Footer h-14 px-5 border-t, "Hủy" outline + "Lưu" primary

**Acceptance:**
- Form field label 13px (not 14px), input h-9 (not h-10)
- Section card padding 20px (p-5), gap 16px
- Save button h-8 (not h-10), blue-500
- Validation error text-12px red-600
- QuickEditSheet slide-in right 200ms

**Review checkpoint:** User review form. Feedback: label weight, input height, save button size.

### 8.4 T9 — `/suppliers` + `/items/import` wizard (ngày 9)

#### 8.4.1 `/suppliers` list + new

**File paths:**
- `apps/web/src/app/(app)/suppliers/page.tsx`
- `apps/web/src/app/(app)/suppliers/new/page.tsx`
- `apps/web/src/app/(app)/suppliers/[id]/page.tsx`
- `apps/web/src/components/suppliers/SupplierList.tsx`
- `apps/web/src/components/suppliers/SupplierForm.tsx`

**Kế thừa /items V2 spec:**
- SupplierList: same ItemListTable structure, row h-9, no zebra, filter bar h-9
- SupplierForm: same ItemForm structure, p-5 section card, input h-9
- Address field textarea min-h 72px
- VAT/tax field `font-mono text-sm`
- `/suppliers/[id]` detail: tabs (Thông tin / Lịch sử PO / Ghi chú)
  - Tabs V2 spec: h-8 underline neutral zinc-900

#### 8.4.2 `/items/import` wizard

**File paths:**
- `apps/web/src/app/(app)/items/import/page.tsx`
- `apps/web/src/components/items/ImportWizard.tsx`
- `apps/web/src/components/items/ColumnMapperStep.tsx`

**ImportWizard layout:**
- Stepper top h-12 bg-white border-b zinc-200
  - Step circle h-8 w-8 rounded-full border-2
    - Active: blue-500 bg + text-white
    - Done: emerald-500 bg + check icon white
    - Todo: zinc-300 border + zinc-500 number
  - Step label 13px weight 500
  - Connector line h-0.5 bg-zinc-200, active bg-blue-500
- Content area padding 24px
- Footer sticky bottom h-14 bg-white border-t zinc-200
  - "Quay lại" outline h-8 + "Tiếp" primary blue-500 h-8

**ColumnMapperStep:**
- 2-col layout: source cols left + target fields right
- Row h-9 connect with dashed line SVG
- Auto-suggest hint 11px zinc-500
- Error inline 12px red-600

**Acceptance:**
- Stepper step circle 32px (not 40px)
- Content padding 24px (not 48px)
- Button h-8 (not h-12)
- ColumnMapperStep 2-col clean dashed connection

**Review checkpoint:** User review import flow step 1 → step 4. Feedback: stepper size, column mapping UX.

### 8.5 T10 — `/pwa/receive` + final polish (ngày 10)

#### 8.5.1 `/pwa/receive/[poId]`

**File paths:**
- `apps/web/src/app/pwa/receive/[poId]/page.tsx`
- `apps/web/src/components/receiving/ReceivingConsole.tsx`
- `apps/web/src/components/scan/BarcodeScanner.tsx`
- `apps/web/src/components/scan/ScanQueueBadge.tsx`

**Layout PWA (data-scope="pwa" wrapper cho override):**
- Container padding 16px, font base 14px (override desktop 13px)
- Scan input h-11 (44px) autofocus text-base
- Current-item card:
  - Padding 16px bg-white border border-zinc-200 rounded-md
  - **border-l 2px orange-500** (shortage semantic preserved)
  - Item name 15px weight 600
  - SKU 12px font-mono zinc-500
  - Qty badge top-right
- List row h-14 (56px) touch-friendly px-4 border-b zinc-100
- Action bar sticky bottom h-18 (72px) px-4 bg-white border-t zinc-200
  - 2 button h-11 text-base full-width split
  - "Bỏ qua" outline + "Xác nhận" primary blue-500
- BarcodeScanner modal full-screen
  - Camera viewport 100% w aspect-[4/3]
  - Guide rectangle border-2 dashed white 64% width center
  - Beep logic preserve V1
- ScanQueueBadge top-right corner fixed h-6 px-2 bg-zinc-900 text-white text-xs tabular-nums rounded-full
  - `animate-pulse` khi queue > 0

**Scan flash keyframes (retune):**
- `flash-success`: 400ms ease-out, ring 3px emerald-500/30 → 0, bg emerald-50 → transparent
- `flash-danger`: 400ms ease-out, ring 3px red-500/30 → 0, bg red-50 → transparent
- `shake`: 3 × 60ms (tổng 180ms), translate-x ±4px

**Acceptance:**
- PWA viewport tablet 1024×768 DevTools emulate: tap targets 44px visible
- Scan input h-11 autofocus on mount
- Scan OK → ring emerald pulse 400ms + beep
- Scan FAIL → ring red + shake 180ms + beep error
- Current item card border-l 2px orange (semantic preserved)
- Font base 14px (nhỉnh hơn desktop 13px)

**Review checkpoint:** User emulate tablet, test scan flow. Feedback: tap target size, flash visibility, current item highlight.

### 8.6 Commit sequence T6-T10

Commit 6 (T6): `refactor(redesign-v2): screen /login + /dashboard`
Commit 7 (T7+T8): `refactor(redesign-v2): items — list + form + quickedit`
Commit 8 (T9 partial): `refactor(redesign-v2): suppliers — list + form + detail tabs`
Commit 9 (T10): `refactor(redesign-v2): pwa receive — touch density + scan flash retune`
Commit 10 (T9 partial): `refactor(redesign-v2): items import wizard`

---

## §9. Asset cleanup

### 9.1 SVG illustrations V1 — DELETE

**Xóa 6 file trong `apps/web/src/components/ui/illustrations/`:**
- `EmptyAlert.tsx`
- `EmptyBox.tsx`
- `EmptyInbox.tsx`
- `EmptySearch.tsx`
- `OfflineCloud.tsx`
- `ScanReady.tsx`
- `index.ts` (nếu có export aggregate)

**Thay thế bằng Lucide icon 32px stroke 1.5 trong EmptyState (đã spec T5).**

### 9.2 Font assets V1 — REMOVE

- Remove Be Vietnam Pro import trong `layout.tsx`
- Không cần xóa file vì dùng next/font/google (runtime fetch)
- Remove any `font-heading` Tailwind class còn sót lại

### 9.3 PWA icons — KEEP

`apps/web/public/icons/` V1 giữ nguyên (đủ ổn, không phải trọng tâm V2 visual).

### 9.4 Login hero SVG — REFINE

- Stroke color `#0F172A` (slate-900) → `#18181B` (zinc-900)
- Background gradient hex update nếu SVG embed

### 9.5 Commit cleanup T11

```
chore(redesign-v2): cleanup — remove Be Vietnam Pro font + old illustrations + dead slate-* tokens

- layout.tsx: remove Be Vietnam Pro import
- tailwind.config.ts: remove slate-* alias (replaced by zinc)
- globals.css: remove --shadow-dialog/--shadow-pop/--ring-focus V1 vars
- components/ui/illustrations/: DELETE folder (6 SVG files)
- grep audit: bg-cta|bg-orange|border-orange still only shortage semantic nodes (3 places)
- grep audit: slate-* removed from all component files

Acceptance: build PASS, pnpm --filter @iot/web build bundle size decrease (font + illustrations removed)
```

---

## §10. Test + build local

### 10.1 Local test commands

Mỗi commit cook xong chạy:
```bash
# Windows bash
pnpm --filter @iot/web typecheck   # expect 0 error regress
pnpm --filter @iot/web lint         # expect 0 error
pnpm --filter @iot/web build        # expect exit 0
pnpm --filter @iot/web dev          # port 3000, manual browser verify
```

### 10.2 Typecheck baseline

V1 current typecheck count error = X (verify trước T1). V2 cook không làm tăng X. Nếu tăng → block commit.

### 10.3 Build success criteria

- `.next/` generate OK
- Bundle analyzer (optional): web first-load JS không tăng > 10% so với V1 baseline
- Route prerender: `/login`, `/` (app shell), `/items`, `/suppliers`, `/pwa` render OK

### 10.4 Dev smoke test 8 màn

Sau commit 10 (T10), user manual:
1. `/login` — form render, submit login
2. `/` dashboard — 4 KPI, table, alerts
3. `/items` — list, filter, bulk select
4. `/items/new` — form create
5. `/items/[id]` — form edit
6. `/items/import` — wizard 4 steps
7. `/suppliers` + `/suppliers/new` + `/suppliers/[id]` — list + CRUD + tabs
8. `/pwa/receive/[poId]` — scan flow tablet emulate

---

## §11. User iteration loop

### 11.1 Cycle

```
cook milestone (T1/T2/.../T10)
  → pnpm build local PASS
  → user open http://localhost:3000 browser
  → user screenshot + comment cụ thể (font/size/color/spacing)
  → Claude tune class/token (không rewrite spec)
  → pnpm build PASS lại
  → user verify
  → approve → next milestone
```

### 11.2 Iteration budget

- Expected 3-5 vòng/màn (trung bình)
- > 5 vòng → pause → đào sâu root cause: spec sai hay execution sai
- > 10 vòng → escalate → review lại brainstorm §1 hoặc palette choice

### 11.3 Feedback format đề xuất user

```
Màn: /items
Vấn đề: SKU column quá hẹp, truncate sớm
File: ItemListTable.tsx
Đề xuất: w-32 → w-40 (128px → 160px)
Screenshot: [đính kèm]
```

Claude tune theo feedback, commit bổ sung nếu cần (`fix(redesign-v2): items table SKU col width 128→160`).

### 11.4 Sign-off user

Mỗi màn user duyệt cần ping cụ thể: `"/items OK, next"` hoặc `"/login OK next dashboard"`. Không "OK" chung chung.

---

## §12. Deploy sau khi duyệt

### 12.1 VPS mới setup (SSD spec — chưa define)

Chờ user cung cấp:
- IP VPS mới
- SSH key setup
- Domain DNS cutover (mes.songchau.vn → VPS mới)

### 12.2 CI/CD GitHub Actions

**Thay build trên VPS bằng build GHCR:**
- Workflow `.github/workflows/build-web.yml`:
  - On push `main` tag `v2.*`
  - Build Docker image `@iot/web` dockerfile optimized
  - Push GHCR `ghcr.io/andy-cods/he-thong-iot/web:v2.0.0`
- VPS mới chỉ `docker pull + docker compose up -d`, KHÔNG build local VPS (tiết kiệm 13 phút/vòng V1)

### 12.3 Data migration

- Export Postgres V1 VPS cũ: `pg_dump`
- Import VPS mới: `pg_restore`
- Redis: nếu stateless (cache only) → skip migrate; nếu có session → migrate dump
- Sync `.env` từ VPS cũ qua VPS mới

### 12.4 DNS cutover

- VPS mới LIVE stable ≥ 24h test
- Update DNS A record `mes.songchau.vn` → IP mới
- TTL 300s để rollback nhanh nếu cần
- VPS cũ giữ running 48h failsafe, sau đó decommission

### 12.5 PROGRESS.md update

Cuối V2 deploy:
```
## V2 Redesign — 2026-04-XX
- [x] 11 commit branch redesign/direction-b-v2 merged main, tag v2.0.0
- [x] VPS mới setup SSD, CI/CD GHCR pull image
- [x] DNS cutover mes.songchau.vn → VPS mới
- [x] VPS cũ decommission
- [x] 8 màn LIVE, font 13px, palette zinc+blue
```

---

## §13. Defer V2.1

**Not in scope V2.0, defer V2.1+:**

| Feature | Lý do defer |
|---|---|
| Dark mode toggle UI | Token đã reserve, chờ user request. V2.0 không cần. |
| BOM editor tree | V1.1 sprint riêng (đã có plan pack). Không overlap V2 visual. |
| Mass update tool | Advanced feature, chờ user flow real. |
| Diff merge viewer | BOM-related, V1.1+ |
| `/tv` dashboard mode | V1.2, scale font ×2 |
| i18n English toggle | VN-only V2.0 |
| Worker container recover | Bug V1 khác layer (pnpm symlink), không liên quan visual |
| Dashboard 500 bug debug | Root cause data layer, không block V2. Fix tiện tay khi cook T6 nếu dễ. |
| A11y axe-core CI | V2.1 automated audit |
| Unit/integration test UI primitives | V2.1 test infrastructure |
| Storybook full | V2.1 (V2.0 chỉ optional `/v2-preview` page) |

---

## §14. Next action

### 14.1 Trước cook

- [ ] User approve brainstorm V2 (`260417-v2-brainstorm.md`)
- [ ] User approve implementation plan V2 (file này)
- [ ] Chờ design spec V2 (`260417-v2-design-spec.md`) từ ui-ux-designer
- [ ] Nếu design spec conflict với plan §2 25 Q&A → planner patch commit update
- [ ] User confirm VPS mới spec (IP + SSH key) — dùng cho §12 deploy step

### 14.2 Cook sequence

```
Spawn cook agents tuần tự:
1. T1 tokens → commit 1
2. T2 primitives wave 1 → commit 2
3. T3 primitives wave 2 → commit 3 (có thể parallel T4 prep)
4. T4 layout → commit 4
5. T5 domain (parallel T4) → commit 5
6. T6 login + dashboard → commit 6 → USER REVIEW
7. T7 items list → commit 7 → USER REVIEW
8. T8 items form → commit 7 (amend hoặc follow-up) → USER REVIEW
9. T9 suppliers + import → commit 8 + 10 → USER REVIEW
10. T10 pwa → commit 9 → USER REVIEW
11. T11 cleanup → commit 11
12. Tag v2.0.0 → deploy VPS mới
```

### 14.3 Exit

Sau T11 cleanup + user final approve:
- Merge `redesign/direction-b-v2` → `main`
- Tag `v2.0.0`
- Setup VPS mới (out of scope plan này — user trigger separate)

---

## §15. File map tổng kết

### 15.1 Files MODIFY (22 file)

```
apps/web/tailwind.config.ts
apps/web/src/app/globals.css
apps/web/src/app/layout.tsx
apps/web/src/app/login/page.tsx
apps/web/src/app/(app)/page.tsx
apps/web/src/app/(app)/items/page.tsx
apps/web/src/app/(app)/items/new/page.tsx
apps/web/src/app/(app)/items/[id]/page.tsx
apps/web/src/app/(app)/items/import/page.tsx
apps/web/src/app/(app)/suppliers/page.tsx
apps/web/src/app/(app)/suppliers/new/page.tsx
apps/web/src/app/(app)/suppliers/[id]/page.tsx
apps/web/src/app/pwa/receive/[poId]/page.tsx
apps/web/src/components/ui/button.tsx
apps/web/src/components/ui/input.tsx
apps/web/src/components/ui/label.tsx
apps/web/src/components/ui/checkbox.tsx
apps/web/src/components/ui/select.tsx
apps/web/src/components/ui/textarea.tsx
apps/web/src/components/ui/dialog.tsx
apps/web/src/components/ui/sheet.tsx
apps/web/src/components/ui/popover.tsx
apps/web/src/components/ui/dropdown-menu.tsx
apps/web/src/components/ui/tabs.tsx
apps/web/src/components/ui/skeleton.tsx
apps/web/src/components/ui/badge.tsx
apps/web/src/components/ui/breadcrumb.tsx
apps/web/src/components/ui/empty-state.tsx
apps/web/src/components/layout/AppShell.tsx
apps/web/src/components/layout/Sidebar.tsx
apps/web/src/components/layout/TopBar.tsx
apps/web/src/components/layout/UserMenu.tsx
apps/web/src/components/command/CommandPalette.tsx
apps/web/src/components/domain/KpiCard.tsx
apps/web/src/components/domain/OrdersReadinessTable.tsx
apps/web/src/components/domain/AlertsList.tsx
apps/web/src/components/domain/SystemHealthCard.tsx
apps/web/src/components/domain/StatusBadge.tsx
apps/web/src/components/items/ItemListTable.tsx
apps/web/src/components/items/FilterBar.tsx
apps/web/src/components/items/BulkActionBar.tsx
apps/web/src/components/items/ItemForm.tsx
apps/web/src/components/items/ItemQuickEditSheet.tsx
apps/web/src/components/items/ImportWizard.tsx
apps/web/src/components/items/ColumnMapperStep.tsx
apps/web/src/components/suppliers/SupplierList.tsx
apps/web/src/components/suppliers/SupplierForm.tsx
apps/web/src/components/login/LoginHero.tsx
apps/web/src/components/login/BuildInfo.tsx
apps/web/src/components/receiving/ReceivingConsole.tsx
apps/web/src/components/scan/BarcodeScanner.tsx
apps/web/src/components/scan/ScanQueueBadge.tsx
```

(Lưu ý: có thể file không đổi nhiều nếu chỉ import component đã tune; list trên exhaustive.)

### 15.2 Files CREATE (2 file)

```
apps/web/src/components/ui/tooltip.tsx     # NEW — Radix Tooltip wrapper
docs/design-guidelines-v2.md               # NEW — 180-line V2 spec
```

### 15.3 Files DELETE (6-7 file)

```
apps/web/src/components/ui/illustrations/EmptyAlert.tsx
apps/web/src/components/ui/illustrations/EmptyBox.tsx
apps/web/src/components/ui/illustrations/EmptyInbox.tsx
apps/web/src/components/ui/illustrations/EmptySearch.tsx
apps/web/src/components/ui/illustrations/OfflineCloud.tsx
apps/web/src/components/ui/illustrations/ScanReady.tsx
apps/web/src/components/ui/illustrations/index.ts   # nếu tồn tại
```

**Total file delta V2:** ~52 modify + 2 create + 7 delete = 61 file change.

---

## §16. TODO checklist tổng

### 16.1 Pre-cook

- [ ] User approve brainstorm V2
- [ ] User approve implementation plan V2 (file này)
- [ ] Design spec V2 từ ui-ux-designer (pending parallel)
- [ ] Planner resolve conflict nếu có (adjust §2 25 Q&A)
- [ ] Verify typecheck baseline V1 (count error hiện tại)
- [ ] Verify pnpm install cache warm local

### 16.2 Cook sequence

- [ ] T1 tokens — commit 1
- [ ] T2 primitives wave 1 — commit 2
- [ ] T3 primitives wave 2 — commit 3
- [ ] T4 layout — commit 4
- [ ] T5 domain — commit 5
- [ ] T6 login + dashboard — commit 6 + user review
- [ ] T7 items list — commit 7 + user review
- [ ] T8 items form — amend/follow-up commit 7 + user review
- [ ] T9 suppliers + import — commit 8 + 10 + user review
- [ ] T10 pwa — commit 9 + user review
- [ ] T11 cleanup — commit 11

### 16.3 Merge + deploy

- [ ] User final approve V2
- [ ] Merge `redesign/direction-b-v2` → `main`
- [ ] Tag `v2.0.0`
- [ ] PROGRESS.md update V2 milestone
- [ ] VPS mới setup (user trigger)
- [ ] GHCR image build workflow
- [ ] DNS cutover
- [ ] VPS cũ decommission 48h sau

---

*— End of implementation plan V2 · Claude Opus 4.7 · 2026-04-17*
*Input bắt buộc cho `/cook` sau khi user duyệt brainstorm + plan.*
