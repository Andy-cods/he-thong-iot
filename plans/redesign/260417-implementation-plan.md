# Implementation Plan — UI/UX Redesign Direction B

- **Ngày:** 2026-04-17
- **Tác giả:** planner (Opus 4.7 1M)
- **Trạng thái:** Ready to cook
- **Sprint:** 10 ngày làm việc (T1 → T10), 1.5 FTE
- **Direction chốt:** B — Refresh trung bình, giữ palette Industrial Slate
- **Nguồn tham chiếu (đọc trước khi cook):**
  - [260417-brainstorm.md](./260417-brainstorm.md) — 10 issue + 3 direction + scope 8 screens
  - [260417-brainstorm-deep.md](./260417-brainstorm-deep.md) — data flow, edge case, VN-specific, 30 quyết định
  - [260417-design-spec.md](./260417-design-spec.md) — tokens, ASCII, 18 component props, a11y
  - [260417-p0-bugs-fix-plan.md](./260417-p0-bugs-fix-plan.md) — env.ts, migration 0002, worker Dockerfile

> **Ràng buộc bất di bất dịch:** Tiếng Việt UI + code comment. YAGNI/KISS/DRY. Build local trước khi push VPS (CLAUDE.md điều 3). Không dark mode V1. Không over-engineer.

---

## §1 Tổng quan sprint

### 1.1 Timeline 10 ngày + milestone cuối ngày

| Ngày | Focus chính | Milestone kết thúc ngày (artifact commit được) |
|---|---|---|
| **T1** | Fix 3 P0 bugs | PR `fix/p0-bugs` merge; search không dấu chạy VPS; worker container UP; login 5 password edge case PASS |
| **T2** | Foundation tokens + primitives shadcn | PR `redesign/foundation-tokens`: tailwind + globals patched; shadcn primitives `dialog/sheet/checkbox/skeleton/command/dropdown-menu/tooltip/breadcrumb/progress/tabs` wired; `pnpm typecheck` green |
| **T3** | Layout shell + providers | PR `redesign/app-shell`: `AppShell` + `Sidebar` (collapsible) + `TopBar` + `CommandPalette` (cmdk) + `UserMenu` + `Breadcrumb` render vào `(app)/layout.tsx`; nuqs provider + query-client config |
| **T4** | `/login` rewrite + `/` Dashboard skeleton | PR `redesign/login-dashboard`: login split 50/50 hero; dashboard shell KPI + OrdersReadiness (mock data) + SystemHealth |
| **T5** | Items list phase 1 (filter URL + density + bulk select) | PR `redesign/items-list-a`: `FilterBar` nuqs; `DataTable` 9 cột responsive; selection state machine |
| **T6** | Items list phase 2 (Sheet quick-edit + actions dropdown + empty/loading states) | PR `redesign/items-list-b`: `ItemQuickEditSheet`; `BulkActionBar`; skeleton + empty preset |
| **T7** | Item detail Tabs + ItemForm polish + Dialog confirm | PR `redesign/item-detail`: 4 tabs (Thông tin/Kho/Tracking/Ảnh placeholder); Ctrl+S; delete Dialog type "XOA" |
| **T8** | Import Wizard v2 (palette fix + ColumnMapper step) | PR `redesign/import-v2`: 4 steps + auto-mapping + save preset + sync fallback banner |
| **T9** | `/suppliers` stub + `/pwa/receive/[poId]` min viable | PR `redesign/suppliers-pwa`: nav không 404 + PWA route với Dexie queue + camera fallback |
| **T10** | Assets + a11y + Lighthouse CI + Deploy | Tag `v1.1.0`; deploy VPS; post-deploy smoke pass; PROGRESS.md update |

### 1.2 Dependency graph (text)

```
T1 (P0 bugs)
 └─> T2 (foundation) ──> T3 (shell) ──> T4 (login + dashboard)
                                  │
                                  ├─> T5 (items-a) ──> T6 (items-b) ──> T7 (item-detail)
                                  │                                       │
                                  ├─> T8 (import) ────────────────────────┤ (reuse Dialog/Sheet)
                                  │                                       │
                                  └─> T9 (suppliers + pwa) <──────────────┘ (reuse DataTable + Sheet)
                                                                          │
                                                                          └─> T10 (deploy)

Parallel track (T1-T3):
 · Assets SVG (logo, login hero, illustrations) — designer hoặc inline SVG cook
 · PWA icons sinh từ logo-mark.svg bằng pwa-asset-generator
 · OG image @vercel/og route
 · Template Excel items_template.xlsx (SheetJS generate script, commit binary)
```

**Critical path:** T1 → T2 → T3 → (T5 → T6 → T7) // (T8) // (T9) → T10. Bottleneck: **T3 AppShell** (block mọi screen redesign). Ưu tiên T2-T3 xong trước thứ ngày 4.

### 1.3 Tiêu chí merge Direction B (ghép §5.5 brainstorm + §8 design-spec)

- [ ] Lighthouse ≥ 90 Perf / ≥ 95 A11y / 100 Best Practices trên `/login`, `/`, `/items`, `/pwa/receive/[poId]`.
- [ ] axe-core 0 serious/critical trên 4 route trên × 4 state (loaded / loading / empty / error) = 16 scan.
- [ ] Tablet 1024×768 KHÔNG horizontal scroll trên `/items` (column pinning Mã SKU + Actions).
- [ ] Tap target ≥ 48×48px trên mọi element trong `/pwa/receive/*`.
- [ ] Search tiếng Việt không dấu: `banh rang` → match `bánh răng` sau khi migration 0002 apply. Feature flag `FEATURE_UNACCENT` default `true` sau T1.
- [ ] `pnpm -r typecheck` + `pnpm -r test` pass 100%.
- [ ] PWA install prompt hiển thị Chrome Android (manifest hợp lệ + SW hợp lệ + icons đủ 192/256/384/512 + maskable).
- [ ] Dashboard TTI < 1s với mock, < 2s với API thật (`/api/dashboard/overview` có thể trả mock qua feature flag `DASHBOARD_USE_MOCK=true`).
- [ ] Keyboard-only path: Login → Dashboard → Items → Item detail → Back → Logout (ghi video acceptance).
- [ ] Mọi empty/loading/error state có design riêng (không plaintext "Đang tải...").
- [ ] PWA offline queue Dexie persist qua refresh; scan offline → online sync success.
- [ ] Reduced motion: shimmer/shake/flash tắt hoàn toàn khi `prefers-reduced-motion: reduce`.
- [ ] Vietnamese diacritics render đúng 100 từ phức tạp trong test corpus `lib/vn-normalize.test.ts`.

### 1.4 Risk register

| # | Risk | Mức độ | Mitigation |
|---|------|--------|------------|
| R1 | Worker Dockerfile fix (T1 Bug 3) fail vì `pnpm deploy --legacy` behavior khác môi trường | **Cao** | Có sẵn fallback Option B (bundle tsup) trong p0 plan §3.3. Nếu T1 chiều vẫn fail, tạm disable worker trong compose, dùng endpoint `commit-sync` (D14) cho import — không block các task T2+ |
| R2 | Migration 0002 apply làm rollback phức tạp (CREATE EXTENSION cần superuser) | Trung bình | Backup DB trước apply (`backup.sh`). Tách thành 0002a (superuser) + 0002b (owner) như p0 plan §2.3. Verify qua `0002_verify.sql` |
| R3 | `cmdk` + `html5-qrcode` + `dexie` + `nuqs` add 4 deps mới → bundle size tăng | Thấp | Verify bundle sau T3: baseline vs after-foundation. Budget Lighthouse Perf vẫn ≥ 90. Lazy-load `html5-qrcode` và `dexie` chỉ trong `/pwa/*` route |
| R4 | Sidebar width animation (`@property --sidebar-width`) không support Safari cũ | Thấp | Fallback: animate `width` property thông thường + `content-visibility: auto` cho main. Test Safari 15+ trong T3 |
| R5 | Tablet Surface Go 2 (Pentium 4425Y) không đủ FPS khi scroll 10k row | Trung bình | TanStack Virtual fixed `estimateSize`, overscan 5. Giảm cột mobile (ẩn UoM, Supplier md). Bench target FPS ≥ 50. Nếu fail → giảm density mặc định về 56, render ít column hơn |
| R6 | Dashboard mock data "cứng" không match API contract khi order module ready V1.2 | Thấp | Mock sau feature flag `DASHBOARD_USE_MOCK=true`. Type `OrderReadinessRow` export từ `@iot/shared` để server implement cùng contract |

---

## §2 Quyết định chốt (30 checklist brainstorm-deep §8)

| # | Quyết định | Chốt | Ghi chú |
|---|------------|------|---------|
| D01 | URL state lib: `nuqs` vs tự viết | **nuqs** | `nuqs@2.x`, ~4KB, giải quyết SSR hydration + race + type coerce. Install T2 |
| D02 | Server cache: TanStack Query v5 vs SWR | **TanStack Query v5** (đã có sẵn) | Prefix invalidation + optimistic mature hơn, đã install trong deps |
| D03 | Global store (Redux/Zustand) | **KHÔNG** | Đã có `zustand` trong deps nhưng không dùng mới cho V1 redesign. 5 tầng state brainstorm-deep §1.1 là đủ. Zustand giữ cho feature nào thực cần (placeholder) |
| D04 | Auth cookie: tên + flags | **`iot_session`** — HttpOnly + Secure + SameSite=Lax + Path=/ + Max-Age=604800 (7d remember) hoặc session | Single source of truth: `@iot/shared/constants.ts` export `AUTH_COOKIE_NAME`. Fix P1 bug §4.4 brainstorm cũ trong T1 (cùng PR p0-bugs) |
| D05 | CSRF double-submit cookie + header | **Có** | `iot_csrf` cookie + header `X-CSRF-Token` cho POST/PUT/DELETE. Implement trong `providers/csrf-provider.tsx` + middleware check. Hoãn full audit tới T10 |
| D06 | Shortcut Ctrl+K vs Cmd+K | **Cả hai, detect OS** | `navigator.platform.includes("Mac")` → Cmd+K display. Fallback Ctrl+J nếu user báo conflict — KHÔNG implement toggle V1 |
| D07 | CommandPalette server-search | **Query ≥ 2 char, debounce 200ms** | < 2 char → chỉ Navigation + Recents + Actions local |
| D08 | Recent items lưu đâu | **localStorage `iot:cmdk:recents`** 10 entries FIFO, expire 30d lazy | Implement trong `hooks/use-cmdk-recents.ts` |
| D09 | Items bulk select: 3 mode | **`none` / `visible` / `all-matching` + snapshot filter** | State machine trong `hooks/use-selection.ts`. Đổi filter → auto-reset về `none` |
| D10 | Delete undo toast | **Single delete: Undo 5s. Bulk: KHÔNG undo, chỉ Dialog type "XOA"** | Sonner action button + AbortController |
| D11 | Concurrent edit detect | **409 + prompt "Tải lại bản mới"** | Diff merge view → defer V1.1. Server include `expected_version` check (If-Unmodified-Since). Sheet form include hidden `baseUpdatedAt` |
| D12 | Import auto-mapping | **Dict synonym + Levenshtein ≥ 0.7** | KHÔNG dùng AI/LLM. File `lib/import-mapping.ts` với synonymDict hard-code |
| D13 | Import file guard | **Max 10MB + 50k rows, preview 100 rows client-side SheetJS** | Reject client-side trước upload. Upload full file server chỉ ở Step 3 commit |
| D14 | Worker down fallback | **Endpoint `POST /api/items/import/commit-sync` giới hạn 500 rows** | Tạm thời tới khi worker fix xong T1. Nếu T1 Bug 3 PASS → vẫn giữ endpoint, chỉ dùng khi 503 |
| D15 | Barcode USB wedge detect | **Buffer timing < 30ms/char, ≥ 6 chars, Enter submit** | `lib/barcode-detector.ts` attach window khi route `/pwa/*` active |
| D16 | IME skip trong shortcut | **Bắt buộc check `e.isComposing \|\| e.keyCode === 229`** | Wrapper function `lib/shortcuts.ts` `registerShortcut()` |
| D17 | Locale số | **`vi-VN` display `1.250.000,5`, input accept cả `.` và `,`, DB store raw** | `lib/vn-normalize.ts` `formatVN()` / `parseVN()` |
| D18 | Date format | **Display `dd/MM/yyyy`, DB ISO `yyyy-MM-dd`, timestamp UTC render `Asia/Ho_Chi_Minh`** | `date-fns` locale `vi`. Không cài thêm lib khác |
| D19 | Offline queue replay | **Concurrency=1, FIFO theo uuid v7, backoff expo max 60s, 5 lần fail → failed_queue** | `hooks/use-scan-queue.ts` |
| D20 | PWA conflict 2 devices | **Server append receipt_event (event sourcing), warning over-received** | KHÔNG first/last write wins. Endpoint `POST /api/receipts/:poId/events` idempotent theo UUID v7 client-generated |
| D21 | Camera permission | **Lazy request khi user click "Quét" lần đầu, deny → flag `iot:pwa:camera-denied=1` + fallback manual** | Re-check `permission.state` sau F5 |
| D22 | SW cache strategy | **9 rule theo route pattern §4.3 brainstorm-deep + precache PO trước offline** | Workbox custom `workers/sw.ts`, KHÔNG dùng abstraction `next-pwa` (mặc dù đã install — chỉ giữ làm fallback nếu custom fail) |
| D23 | SW update flow | **Toast "Có phiên bản mới. Tải lại" — user confirm, KHÔNG auto reload** | Scan giữa chừng reload là disaster |
| D24 | Sidebar width animate | **CSS `@property --sidebar-width` với fallback `width`, cookie mirror SSR** | Test Safari 15+ trong T3 |
| D25 | FE fallback migration 0002 chưa apply | **Client normalize NFD + feature flag `FEATURE_UNACCENT`** | Default `true` sau T1 (migration sẽ apply T1). Nếu rollback → flag off, empty state hint "Thử gõ có dấu" |
| D26 | Fix `lib/env.ts` trước cook FE | **Bắt buộc T1** | `new URL()` thay regex. 5 password edge case test |
| D27 | Test plan | **Vitest + Playwright + axe + Lighthouse CI** | Cụ thể §7 plan này |
| D28 | Framer Motion | **KHÔNG install V1** | CSS đủ cho sheet spring + KPI counter. KPI counter dùng CSS `@keyframes` counter-style trick hoặc simple `requestAnimationFrame` < 50 lines. Sidebar collapse cũng CSS |
| D29 | Visual regression test | **Hoãn V1.1** | YAGNI — snapshot 70 component tốn time. Manual QA + axe + Lighthouse đủ cho V1. Defer Chromatic/Percy |
| D30 | Dashboard mock vs real | **Mock với feature flag `DASHBOARD_USE_MOCK=true` V1.0, real khi Order module ready** | Type `OrderReadinessRow` export `@iot/shared`. Mock data generator trong `lib/mock/dashboard.ts` |

**Conflict resolution ghi chú (phát hiện giữa 4 artifact):**

1. **Next-pwa vs Workbox custom:** design-spec §8 install `next-pwa` nhưng brainstorm-deep §4.3 nói "Workbox custom". **Chốt:** dùng Workbox custom cho SW (kiểm soát cache strategy per route). `next-pwa` đã install giữ lại làm fallback — KHÔNG enable trong `next.config.js`. Trong T9 cook manual `workers/sw.ts` + register qua `lib/sw-register.ts`.
2. **Framer Motion:** design-spec §5.1 nói "optional", brainstorm-deep D28 khuyến nghị CSS. **Chốt:** CSS only V1. Nếu T4 dashboard counter animation phức tạp → dùng `requestAnimationFrame` 30-line helper, không cần lib.
3. **Dashboard responsive:** design-spec §2.2 "≤ 767px Redirect `/items`" nhưng brainstorm §5.1 không mention. **Chốt:** theo design-spec — redirect mobile về `/items`. Dashboard chỉ ≥ 768px.
4. **Zustand:** đã có trong deps nhưng D03 chốt không dùng mới. **Chốt:** giữ lại, không xoá (có thể có code cũ dùng); KHÔNG thêm store mới V1.

---

## §3 P0 bugs fix plan (ngày T1)

**Reference đầy đủ:** [260417-p0-bugs-fix-plan.md](./260417-p0-bugs-fix-plan.md).

### 3.1 Thứ tự fix tối ưu (copy từ p0 plan §cuối)

| # | Bug | Ước tính | Blocker |
|---|-----|----------|---------|
| 1 | **Bug 2** — Migration 0002 apply (split 0002a superuser + 0002b owner) | 30-45' | Search không dấu trong `/items` |
| 2 | **Bug 1** — `lib/env.ts` regex → `buildDsn(URL)` + 5 password test | 1.5-2h | Tech-debt workaround DATABASE_URL hard-code |
| 3 | **Bug 3** — Worker Dockerfile `pnpm deploy --filter=@iot/worker` + move `tsx` vào dependencies | 3-4h | Import Excel async commit |
| 4 | **P1 bonus** — Cookie name `iot_session` single-source-of-truth | 30' | Middleware + layout consistent |

### 3.2 Branch + commit order T1

Branch: `fix/p0-bugs` off `main`.

```
Commit 1: fix(db): split migration 0002 → 0002a (extensions) + 0002b (schema)
  - packages/db/migrations/0002a_extensions_superuser.sql (new)
  - packages/db/migrations/0002b_week2_item_master.sql (new, copy of 0002 minus CREATE EXTENSION)
  - packages/db/migrations/0002_verify.sql (new)
  - delete packages/db/migrations/0002_week2_item_master.sql

Commit 2: fix(env): rewrite buildDsn with new URL() + unit tests
  - apps/web/src/lib/env.ts (edit — export buildDsn)
  - apps/web/src/lib/env.test.ts (new — 5 password edge cases)

Commit 3: chore(shared): add AUTH_COOKIE_NAME constant
  - packages/shared/src/constants.ts (edit — export AUTH_COOKIE_NAME = "iot_session")
  - apps/web/src/middleware.ts (edit — import from @iot/shared)
  - apps/web/src/app/(app)/layout.tsx (edit — import from @iot/shared)
  - grep all "iot_session" usage and replace

Commit 4: fix(docker): pnpm deploy worker + move tsx to deps
  - Dockerfile (edit — add worker-deploy stage)
  - apps/worker/package.json (edit — tsx to deps)
  - deploy/docker-compose.yml (edit — working_dir + command)

Commit 5: feat(flags): add FEATURE_UNACCENT env flag
  - apps/web/src/lib/env.ts (edit — add FEATURE_UNACCENT bool, default true)
  - apps/web/src/server/db/items.repo.ts (edit — guard unaccent query behind flag)
```

### 3.3 Acceptance criteria T1

**Bug 2 (Migration 0002):**
```bash
# Sau apply trên VPS:
docker exec iot_postgres psql -U hethong_app -d hethong_iot -c \
  "SELECT indexname FROM pg_indexes WHERE schemaname='app' AND indexname='item_name_unaccent_trgm_idx';"
# Expect: 1 row

# Smoke search:
curl -b /tmp/cookie.txt "https://mes.songchau.vn/api/items?q=banh%20rang"
# Expect: 200, items array có SKU chứa "Bánh răng" (sau khi seed)
```

**Bug 1 (env.ts):**
```bash
# Local
pnpm --filter @iot/web test env.test
# Expect: 5 password edge cases PASS (p@ss!, p:w/d$, p ass, p#ss, P@ssw0rd!Strong)

# VPS: bỏ hard-code DATABASE_URL trong .env
curl -i -c /tmp/cookie.txt -X POST https://mes.songchau.vn/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMe!234"}'
# Expect: HTTP 200 + Set-Cookie iot_session
curl -b /tmp/cookie.txt https://mes.songchau.vn/api/items | head
# Expect: 200 items
```

**Bug 3 (Worker):**
```bash
docker compose up -d worker
docker compose logs worker --tail=50 | grep -E "(iot-worker started|redis ready|worker ready)"
# Expect: 3 log lines present, no MODULE_NOT_FOUND
```

**P1 Cookie name:**
```bash
grep -rn "iot_session\|iot_access\|AUTH_COOKIE" apps/ packages/ --include="*.ts"
# Expect: tất cả dẫn về @iot/shared/constants.ts, không có hardcode string rời rạc
```

### 3.4 Rollback plan T1

| Bug | Rollback |
|-----|----------|
| Bug 2 | `pg_restore -U postgres -d hethong_iot --clean /backups/<timestamp>.dump`. Hoặc drop từng index/type tạo bởi 0002b bằng SQL tay (data chưa dùng, low cost) |
| Bug 1 | `git revert <sha>` + restore dòng `DATABASE_URL=postgres://hethong_app:<pwd>@...` trong `.env` VPS |
| Bug 3 | Comment out `worker` service trong `docker-compose.yml`, `docker compose up -d app` → web vẫn live, chỉ import Excel dùng `commit-sync` fallback |
| Cookie name | `git revert <sha>` — cookie name thay đổi invalidate tất cả session hiện tại (user phải re-login). Thông báo trước khi deploy |

### 3.5 Merge T1 gate

- [ ] `pnpm -r typecheck` PASS
- [ ] `pnpm --filter @iot/web test env.test` 5/5 PASS
- [ ] Local `docker compose build app worker` success
- [ ] Local smoke: login + /api/items + /api/items/import/preview
- [ ] VPS deploy + 5 curl smoke (login, items list, search không dấu, check worker logs, check migration 0002)
- [ ] Merge `fix/p0-bugs` → `main`, tag phụ `v1.0.1-p0-fixes`
- [ ] Update `PROGRESS.md` ngày T1

---

## §4 Component foundation (ngày T2-T3)

### 4.1 T2 — Install deps + tokens + primitives

#### 4.1.1 Install packages

```bash
# T2 Morning
cd c:/dev/he-thong-iot
pnpm --filter @iot/web add \
  cmdk@^1.0.0 \
  nuqs@^2.0.0 \
  dexie@^4.0.0 \
  html5-qrcode@^2.3.8 \
  @radix-ui/react-dropdown-menu@^2.1.1 \
  @radix-ui/react-checkbox@^1.1.1 \
  @radix-ui/react-progress@^1.1.0 \
  @radix-ui/react-separator@^1.1.0 \
  @radix-ui/react-tooltip@^1.1.2 \
  date-fns@^3.6.0 \
  uuid@^10.0.0

pnpm --filter @iot/web add -D \
  @types/uuid@^10.0.0 \
  @axe-core/playwright@^4.9.0 \
  @playwright/test@^1.45.0 \
  @lhci/cli@^0.14.0

# Verify
pnpm --filter @iot/web build
```

**KHÔNG install:** `framer-motion` (D28), `fuse.js` (dùng Levenshtein tự viết), `react-window` (đã có `@tanstack/react-virtual`).

#### 4.1.2 Tailwind + globals patch

**File:** `apps/web/tailwind.config.ts`
- Apply diff design-spec §1.3 (colors thêm `slate-400`, `cta.soft`, `scan.flash-*`, `success/warning/danger/info.strong+soft`; spacing `7/9/14/18/22/60`; shadow `pop/dialog/toast/scan-*/focus-strong`; zIndex scale 0-80; transitionTimingFunction `industrial/snap/in-soft`; transitionDuration `instant/fast/base/slow/shimmer`; keyframes `shimmer/shake/flash-success/flash-danger/slide-in-right/slide-out-right/fade-in/fade-out`; animation ghép).

**File:** `apps/web/src/app/globals.css`
- Append block `@layer components` từ design-spec §1.4: `.scan-row-current`, `.scan-flash-success`, `.scan-flash-danger`, `.scan-shake`, `.skeleton`, `.tabular-nums`.
- Append `@media (prefers-reduced-motion: reduce)` override.
- Thêm CSS custom properties `--sidebar-width`, `--sidebar-width-collapsed`, `--topbar-height`, `--content-max-width` vào `:root`.
- Thêm `@property --sidebar-width { syntax: '<length>'; inherits: true; initial-value: 240px; }` cho animation.

**File:** `apps/web/src/app/layout.tsx`
- Update metadata block từ design-spec §7.3 (title, description, openGraph, twitter).
- Thêm `next/font` block từ design-spec §1.5 (Be_Vietnam_Pro + Inter + JetBrains_Mono với vietnamese subset).

**Test:** `pnpm --filter @iot/web build` + visual diff 3 route hiện có (login, items, import) — class `brand-500/600` dead phải không còn hiển thị sai.

#### 4.1.3 shadcn primitives cook order (file path + props copy từ design-spec)

Cook order phụ thuộc — cook xong 1 thì next mới dùng được.

| Thứ tự | Component | File path | Dep | Design-spec |
|--------|-----------|-----------|-----|-------------|
| 1 | **Dialog** | `apps/web/src/components/ui/dialog.tsx` | `@radix-ui/react-dialog` (đã có) | §3.7 |
| 2 | **Sheet** | `apps/web/src/components/ui/sheet.tsx` | `@radix-ui/react-dialog` (reuse) | §3.8 |
| 3 | **Checkbox** | `apps/web/src/components/ui/checkbox.tsx` | `@radix-ui/react-checkbox` (new) | §3.9 |
| 4 | **Skeleton** | `apps/web/src/components/ui/skeleton.tsx` | CSS only | §3.10 |
| 5 | **Tooltip** | `apps/web/src/components/ui/tooltip.tsx` | `@radix-ui/react-tooltip` (đã có) | — (standard shadcn) |
| 6 | **DropdownMenu** | `apps/web/src/components/ui/dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` (new) | §3.5 UserMenu dùng |
| 7 | **Breadcrumb** | `apps/web/src/components/ui/breadcrumb.tsx` | none (native `<nav>`) | §3.6 |
| 8 | **Progress** | `apps/web/src/components/ui/progress.tsx` | `@radix-ui/react-progress` (new) | Import wizard stepper |
| 9 | **Command** | `apps/web/src/components/ui/command.tsx` | `cmdk` (new) | §3.4 wrapper |
| 10 | **Separator** | `apps/web/src/components/ui/separator.tsx` | `@radix-ui/react-separator` (new) | DropdownMenu divider |
| 11 | **EmptyState** | `apps/web/src/components/ui/empty-state.tsx` | custom | §3.11 |
| 12 | **StatusBadge** | `apps/web/src/components/domain/StatusBadge.tsx` | reuse `badge.tsx` | §3.12 |

**Với mỗi component:**
- File test tương ứng: `apps/web/src/components/**/<name>.test.tsx` (Vitest + @testing-library/react). Tối thiểu 2 test: render + interaction.
- A11y checklist theo design-spec §3 (mỗi component có block "A11y"). Implement `aria-*`, `role`, focus trap, keyboard nav.
- KHÔNG Storybook V1 (D29).

**Test T2 gate:**
```bash
pnpm --filter @iot/web test
# Expect: 12 component × 2 test = 24 test PASS
pnpm --filter @iot/web typecheck
# Expect: 0 error
```

### 4.2 T3 — Layout shell + providers + domain components foundation

Cook order sau khi T2 primitives xong.

| Thứ tự | Component | File path | Design-spec |
|--------|-----------|-----------|-------------|
| 13 | **AppShell** | `apps/web/src/components/layout/AppShell.tsx` | §3.1 |
| 14 | **Sidebar** | `apps/web/src/components/layout/Sidebar.tsx` | §3.2 |
| 15 | **TopBar** | `apps/web/src/components/layout/TopBar.tsx` | §3.3 |
| 16 | **CommandPalette** | `apps/web/src/components/command/CommandPalette.tsx` | §3.4 |
| 17 | **UserMenu** | `apps/web/src/components/layout/UserMenu.tsx` | §3.5 |
| 18 | **KpiCard** | `apps/web/src/components/domain/KpiCard.tsx` | §3.13 (cook T3 ready cho T4) |

#### 4.2.1 Providers (T3 morning)

Tạo `apps/web/src/providers/`:
- `query-provider.tsx` — wrap `QueryClientProvider`. Config brainstorm-deep §1.3: `staleTime: 30_000` list, `5 * 60_000` constants, `retry: 1`, `refetchOnWindowFocus: false` (dev mode), `gcTime: 10 * 60_000`.
- `toast-provider.tsx` — wrap Sonner `<Toaster>`. Config responsive position: `bottom-right` desktop, `top-center` khi `window.matchMedia('(max-width: 1024px)').matches`.
- `csrf-provider.tsx` — read cookie `iot_csrf`, inject `X-CSRF-Token` header vào fetch wrapper `lib/api-client.ts`.
- `nuqs-provider.tsx` — wrap `<NuqsAdapter>` from `nuqs/adapters/next/app`.

Cài provider vào `apps/web/src/app/layout.tsx`:
```tsx
<QueryProvider>
  <NuqsProvider>
    <CsrfProvider>
      <ToastProvider>
        {children}
      </ToastProvider>
    </CsrfProvider>
  </NuqsProvider>
</QueryProvider>
```

#### 4.2.2 lib/ helpers (T3 song song)

Tạo các file theo brainstorm-deep §6:

| File path | Nội dung chính |
|-----------|---------------|
| `apps/web/src/lib/query-keys.ts` | Factory `qk` đủ 7 nhóm từ brainstorm-deep §1.2 |
| `apps/web/src/lib/query-client.ts` | QueryClient instance + defaults |
| `apps/web/src/lib/storage.ts` | `storage.get/set/remove` wrapper namespace `iot:` với cookie mirror cho `sidebar-collapsed` + `density` |
| `apps/web/src/lib/shortcuts.ts` | `registerShortcut(key, handler, scope)` với IME skip (`e.isComposing`) |
| `apps/web/src/lib/vn-normalize.ts` | `normalizeNoAccent(s)`, `parseVN(s)`, `formatVN(n, opts)`, `formatCurrencyVN(amount)` |
| `apps/web/src/lib/barcode-detector.ts` | Keyboard wedge timing detect (brainstorm-deep §3.1). KHÔNG attach window ở T3 — chỉ export `createDetector()` |
| `apps/web/src/lib/dexie-db.ts` | Dexie instance schema placeholder (chỉ table `scan_queue`, `failed_queue`, `po_cache`). Migration v1 |
| `apps/web/src/lib/sw-register.ts` | Stub T3, implement full T9 |
| `apps/web/src/lib/import-mapping.ts` | synonymDict + `autoMap(sourceHeaders, targetFields)` (Levenshtein impl 20 lines) |
| `apps/web/src/lib/api-client.ts` | fetch wrapper `api.get/post/put/delete` với CSRF header + error normalization |

#### 4.2.3 hooks/ (T3 song song)

| File path | Nội dung |
|-----------|---------|
| `apps/web/src/hooks/use-debounced-value.ts` | Standard debounce hook |
| `apps/web/src/hooks/use-sidebar-state.ts` | Cookie + ls sync, SSR-safe |
| `apps/web/src/hooks/use-selection.ts` | 3-mode state machine (design-spec §3.15 + brainstorm-deep §2.2) |
| `apps/web/src/hooks/use-unsaved-warn.ts` | `beforeunload` + route change guard |
| `apps/web/src/hooks/use-online-status.ts` | `navigator.onLine` + fetch heartbeat 30s |
| `apps/web/src/hooks/use-cmdk-recents.ts` | localStorage `iot:cmdk:recents` |
| `apps/web/src/hooks/use-scan-audio.ts` | Web Audio API 880/220/660 Hz (stub T3) |
| `apps/web/src/hooks/use-scan-queue.ts` | Stub T3, implement full T9 |

#### 4.2.4 Layout shell components spec

**AppShell** (`components/layout/AppShell.tsx`):
- Props interface đúng design-spec §3.1.
- Server component đọc cookie `iot-sidebar-collapsed` để SSR đúng width.
- Render `<aside>` + `<div className="flex-1">` với TopBar + Breadcrumb slot + `<main>`.
- Skip link `<a href="#main-content" className="skip-link">Bỏ qua, đến nội dung chính</a>` (visible on focus only).

**Sidebar** (`components/layout/Sidebar.tsx`):
- Client component. Nav items hard-code tạm thời trong `lib/nav-items.ts`:
  ```ts
  [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, roles: ["admin","planner"] },
    { href: "/items", label: "Vật tư", icon: Package, roles: ["admin","planner"] },
    { href: "/suppliers", label: "Nhà cung cấp", icon: ShoppingCart, roles: ["admin","planner"] },
    { divider: true },
    { href: "/work-orders", label: "Work Order", icon: Factory, disabled: true }, // V1.1
    { href: "/pwa/receive", label: "Nhận hàng", icon: Truck, roles: ["warehouse","admin"] },
    { divider: true },
    { href: "/admin", label: "Admin", icon: Settings, roles: ["admin"] },
  ]
  ```
- Filter theo `user.role` client-side.
- Active state match `usePathname()` với nested (`/items/*` active Vật tư).
- Collapse button bottom, animate `--sidebar-width` var 320ms.

**TopBar** (`components/layout/TopBar.tsx`):
- Center `CommandPaletteTrigger` — button hiển thị "🔍 Tìm... Ctrl+K" (macOS: ⌘K).
- Right: NotificationBell (placeholder badge count=0, click open Sheet placeholder "Tính năng V1.1") + UserMenu.
- NOTES: NotificationBell là placeholder V1, KHÔNG wire real notification.

**CommandPalette** (`components/command/CommandPalette.tsx`):
- Dùng `cmdk` + wrap qua `components/ui/command.tsx`.
- Groups: Điều hướng (nav items), Gần đây (recents), Hành động (contextual), Vật tư (server search khi query ≥ 2 char).
- Server search endpoint: `GET /api/search?q={q}&types=items` (cần tạo — placeholder T3, full T5).
- Shortcut trigger: Ctrl+K / Cmd+K global, bypass input focus (preventDefault).
- Shortcuts hiển thị OS-aware: `navigator.platform.includes("Mac")` → "⌘K" else "Ctrl+K".

**UserMenu** (`components/layout/UserMenu.tsx`):
- Props: `user` + `onLogout`.
- Menu items theo design-spec §3.5 ASCII: Hồ sơ (placeholder V1.1), Cài đặt (placeholder), "Đang chạy chế độ sáng" (readonly info), Trợ giúp, Phiên bản, Đăng xuất.
- Logout: `await api.post("/api/auth/logout")` → `queryClient.clear()` → `router.push("/login")`.

**KpiCard** (`components/domain/KpiCard.tsx`):
- Cook T3 ready cho T4 Dashboard.
- Props interface design-spec §3.13.
- Loading variant: skeleton 112×full.
- Sparkline: KHÔNG dùng Recharts (thêm deps). Render SVG polyline inline (20 lines) với `<path d="M...">` — V1 đủ.

### 4.3 Test T3 gate

- [ ] `pnpm --filter @iot/web test` 24 + 6 = 30 test PASS (12 primitives + 6 foundation).
- [ ] `pnpm --filter @iot/web typecheck` 0 error.
- [ ] `pnpm --filter @iot/web build` success, bundle size budget Δ ≤ +80KB (vì thêm cmdk/dexie/nuqs).
- [ ] Storybook stub (nếu có) KHÔNG cook — D29 defer.
- [ ] Visual smoke: `/items` route hiện tại render được trong `(app)/layout.tsx` mới (AppShell) không break.
- [ ] Ctrl+K mở CommandPalette (empty state + navigation group).
- [ ] Sidebar collapse/expand animate mượt (FPS ≥ 55).
- [ ] UserMenu Logout flow: click → POST `/api/auth/logout` 200 → redirect `/login`.

### 4.4 A11y checklist foundation

Mỗi component cook xong phải tick:
- [ ] Keyboard: Tab reach all interactive, Enter/Space activate, Esc close modals.
- [ ] Focus visible: `shadow-focus` (pair với outline solid không rely ring only).
- [ ] `aria-label` cho icon-only button.
- [ ] Focus trap Dialog + Sheet + CommandPalette.
- [ ] Restore focus to trigger on close.
- [ ] `role` semantic đúng (banner / navigation / main / dialog / menu / combobox).
- [ ] 3 kênh (icon + label + color) cho StatusBadge.
- [ ] Reduced motion respect (skeleton shimmer off, shake off).

---

## §5 Screens cook order (ngày T4-T9)

### 5.1 T4 — `/login` rewrite + `/` Dashboard skeleton

#### 5.1.1 `/login`

**Route path:** `apps/web/src/app/login/page.tsx` (rewrite).

**Server vs Client:**
- `page.tsx` server component wrap. Render `<LoginPage />` client component.
- Hero + form card chia 2 component riêng `LoginHero.tsx` (server, static SVG) + `LoginForm.tsx` (client, react-hook-form).

**Component tree** (design-spec §2.1):
```
apps/web/src/app/login/
  page.tsx                  (server wrap, metadata)
  loading.tsx               (skeleton)
  components/
    LoginPage.tsx           (client shell, responsive)
    LoginHero.tsx           (server, hero SVG + brand + build footer)
    LoginForm.tsx           (client, form + CAPTCHA dialog)
    CaptchaDialog.tsx       (conditional attempts ≥ 5)
```

**Data fetching:**
- `GET /api/build-info` → render footer. Server component, no cache (build version).
- `POST /api/auth/login` → existing endpoint.
- `POST /api/auth/captcha` → V1 stub (verify captcha text input), defer full implement V1.1.

**State:**
- Form state: react-hook-form + zod (`@iot/shared/validators/loginSchema.ts` — create).
- Local: `attempts` count in `sessionStorage` (reset on tab close).
- URL: `?redirect=/items` → pass through to redirect after login.

**API endpoints:**
- Existing: `POST /api/auth/login`.
- New stub: `GET /api/build-info` return `{ version, commit, builtAt }` từ env `NEXT_PUBLIC_BUILD_*`.
- New stub: `POST /api/auth/captcha` (V1.1 placeholder — return 200 always).

**Test plan:**
- Unit: `LoginForm.test.tsx` — render, validation empty username, validation empty password, submit success, submit 401, 429 lock, 5-fail captcha trigger.
- Integration: `playwright/login.spec.ts` — 5 password edge cases (`ChangeMe!234`, `p@ssw0rd`, `P:ssword`, `pass/word`, `hello world`) — NEEDS T1 Bug 1 fix.
- A11y: `axe(page)` 4 state (idle, loading, error, captcha-required).
- Lighthouse: budget Perf ≥ 95 vì page tĩnh (hero SVG inline).

**Acceptance criteria** (design-spec §2.1):
- [ ] Split 50/50 xl, centered form md, mobile stack.
- [ ] Hero SVG inline < 50KB, stroke slate-300 1.5px.
- [ ] Input `focus:shadow-focus` + outline, KHÔNG `focus:ring-0`.
- [ ] Tap target button submit ≥ 48×48 mobile.
- [ ] Password toggle `aria-label` động ("Hiện"/"Ẩn").
- [ ] Remember checkbox shadcn (không native).
- [ ] Build footer hiển thị version + commit + time.
- [ ] Redirect sau login `/` (Dashboard), không `/app`.
- [ ] CAPTCHA dialog sau 5 fail (stub OK V1).
- [ ] Rate limit 429 show banner countdown (5 phút).

#### 5.1.2 `/` Dashboard skeleton

**Route path:** `apps/web/src/app/(app)/page.tsx` (new file — hiện `/` là login redirect, sau middleware redirect auth `/` → dashboard, unauth `/` → `/login`).

**Middleware update:** `apps/web/src/middleware.ts` thêm rule:
```ts
// Root path logic
if (pathname === "/") {
  if (isAuthenticated) return NextResponse.rewrite(new URL("/(app)/", request.url));
  return NextResponse.redirect(new URL("/login", request.url));
}
```

Hoặc đơn giản hơn: để route group `(app)` handle, thêm `app/(app)/page.tsx`.

**Server vs Client:**
- `page.tsx` server component — fetch dashboard data.
- Dùng React Query prefetch trên server + hydrate client.

**Component tree** (design-spec §2.2):
```
apps/web/src/app/(app)/
  page.tsx                             (server, prefetch + render Dashboard)
  loading.tsx                          (skeleton)
  error.tsx                            (error boundary + banner)
apps/web/src/components/dashboard/
  Dashboard.tsx                        (client shell)
  DashboardHeader.tsx                  (title + lastUpdated + refreshBtn)
  KpiRow.tsx                           (4 KpiCard grid)
  OrdersReadinessTable.tsx             (design-spec §3.14)
  AlertsSidebar.tsx                    (2 alert groups)
  SystemHealthStrip.tsx                (API/DB/Redis/Worker/Backup/Disk)
  SparklineSvg.tsx                     (helper inline SVG polyline)
```

**Data fetching:**
- `GET /api/dashboard/overview` — new endpoint. Return KPI + orders (≤10) + alerts + systemHealth.
- Feature flag `DASHBOARD_USE_MOCK=true` → return mock từ `lib/mock/dashboard.ts` (D30).
- React Query: `useQuery({ queryKey: qk.dashboard.overview, staleTime: 30_000, refetchInterval: 30_000, refetchIntervalInBackground: false })`.

**State:**
- Server: React Query cache.
- URL: none.
- Local: `iot:dashboard:auto-refresh` (boolean toggle).

**API endpoints mới:**
- `GET /api/dashboard/overview` — create.
- Types export `@iot/shared`: `DashboardOverview`, `OrderReadinessRow`, `DashboardAlert`, `SystemHealth`.

**Test plan:**
- Unit: `KpiCard.test.tsx` (render + delta + loading), `OrdersReadinessTable.test.tsx` (row click + progress bar semantics).
- Component: `Dashboard.test.tsx` (empty state, error state, loading state).
- Integration: `playwright/dashboard.spec.ts` — login → redirect `/` → KPI render → click KPI → navigate.
- Lighthouse: Perf ≥ 90, A11y ≥ 95.

**Acceptance criteria** (design-spec §2.2):
- [ ] Mobile ≤ 767px redirect `/items`.
- [ ] md: KPI 2×2, lg: 4×1, xl: max-w 1440.
- [ ] Skeleton shimmer 1200ms.
- [ ] Auto-refresh 30s, không khi tab inactive.
- [ ] KPI border-l 4px theo status.
- [ ] Orders table virtualized khi > 50 rows.
- [ ] Empty state SVG inline < 20KB.
- [ ] Lighthouse A11y ≥ 95.
- [ ] Keyboard: Tab qua all interactive.

### 5.2 T5 — Items list phase 1 (filter URL + density + bulk select)

**Route path:** `apps/web/src/app/(app)/items/page.tsx` (rewrite, giữ logic fetch hiện có, đổi UI).

**Server vs Client:**
- `page.tsx` server component — render shell + suspense ItemsList.
- `ItemsList.tsx` client component — nuqs + React Query.

**Component tree:**
```
apps/web/src/app/(app)/items/
  page.tsx                              (server)
  loading.tsx                           (skeleton)
apps/web/src/components/items/
  ItemsList.tsx                         (client shell)
  PageHeader.tsx                        (title + subtitle + actions)
  FilterBar.tsx                         (nuqs URL-state)
  DataTable.tsx                         (generic wrap TanStack Virtual)
  ItemListRow.tsx                       (render 1 row)
  BulkActionBar.tsx                     (sticky bottom, conditional)
  DensityToggle.tsx                     (40/56)
  Pagination.tsx                        (prev/next + page size)
```

**Data fetching:**
- `GET /api/items?q=&type=&uom=&tracking=&active=&sort=&page=&size=` — existing. Update server repo để hỗ trợ tất cả filter mới.
- React Query: `qk.items.list(filters)` với `keepPreviousData: true` (giữ data cũ khi filter đổi, tránh flash).

**State:**
- URL (nuqs): `q`, `type`, `uom`, `tracking`, `active`, `sort`, `page`, `size` (brainstorm-deep §1.5).
- Local: `selection` (mode + ids/excluded), `density` (40|56 localStorage), `columnsVisible` (array), `columnsWidths` (record).
- Server: React Query cache.

**API endpoint changes:**
- `GET /api/items` — thêm filter `uom`, `tracking`, `active`. Server repo `items.repo.ts` add WHERE clauses.
- `POST /api/items/bulk` — new endpoint: `{ ids: string[], action: "activate"|"deactivate"|"delete"|"export" }`. Returns `{ success: number, failed: {id, reason}[] }`.

**Test plan:**
- Unit: `use-selection.test.tsx` (transitions + filter reset).
- Component: `FilterBar.test.tsx` (nuqs URL sync + debounce), `DataTable.test.tsx` (virtual scroll + keyboard nav j/k).
- Integration: `playwright/items-list.spec.ts` — URL state refresh giữ filter; select all-across bulk; density toggle; search Việt không dấu.
- Lighthouse: Perf ≥ 90, A11y ≥ 95.

**Acceptance criteria** (design-spec §2.4):
- [ ] URL refresh giữ filter; share URL hoạt động.
- [ ] Search không dấu hoạt động (sau T1 migration apply).
- [ ] Virtualized > 200 rows, FPS > 55.
- [ ] Row 40 desktop / 56 tablet toggle.
- [ ] Sticky filter + header đúng z-index.
- [ ] Tablet 1024 KHÔNG horizontal scroll (pin Mã SKU + Actions).
- [ ] Bulk select 3 mode + snapshot filter.
- [ ] Keyboard: `/`, `j/k`, `Space`, `Enter`, `e`, `Esc`, `Ctrl+A`, `Delete`.
- [ ] axe: `<caption>` hidden, `<th scope="col">`.

### 5.3 T6 — Items list phase 2 (Sheet quick-edit + actions + states)

**Component tree thêm:**
```
apps/web/src/components/items/
  ItemQuickEditSheet.tsx                (design-spec §3.15)
  ItemQuickPreviewSheet.tsx             (read-only, click 👁)
  ItemActionsDropdown.tsx               (⋯ more: Duplicate, Archive, Delete)
  DeleteConfirmDialog.tsx               (type "XOA")
  BulkDeleteDialog.tsx                  (count + sample 3 SKU + warn all-matching N > 500)
  ItemsEmptyState.tsx                   (2 preset: no-data, no-filter-match)
  ItemsErrorState.tsx                   (banner + retry)
  ItemsLoadingSkeleton.tsx              (20 rows × 9 skeleton blocks)
```

**Data fetching:**
- `ItemQuickEditSheet` fetch `GET /api/items/:id` trên open.
- Optimistic update: React Query `onMutate` + snapshot + rollback (brainstorm-deep §1.4 Flow A).
- Delete single: Undo toast Sonner 5s + AbortController (D10 Flow C).

**State:**
- Sheet open: local state trong `ItemsList.tsx`, lifted up (`editingItemId: string | null`).
- Unsaved changes: `hooks/use-unsaved-warn.ts` hook integrated với `isDirty` từ react-hook-form.
- Concurrent edit: form include `baseUpdatedAt`. 409 → AlertDialog "Tải lại bản mới" (D11).

**API endpoint changes:**
- `PUT /api/items/:id` — server check `If-Unmodified-Since` header, return 409 với body `{ current: Item }` nếu conflict.
- `DELETE /api/items/:id` — idempotent, return 200 nếu đã xoá, 409 nếu FK constraint (BOM reference).

**Test plan:**
- Component: `ItemQuickEditSheet.test.tsx` — unsaved warning, 409 conflict dialog, optimistic rollback on error (brainstorm-deep §2.3).
- Integration: `playwright/items-quick-edit.spec.ts` — open sheet → edit → save → toast → list update. Flow delete Undo 5s.
- A11y: axe 4 state.

**Acceptance criteria:**
- [ ] Sheet slide-in 200ms, focus first input, trap focus.
- [ ] Unsaved changes → AlertDialog khi close/Esc/click outside/route change.
- [ ] 409 conflict → dialog "Tải lại bản mới" (không diff merge V1).
- [ ] Delete single → Dialog type "XOA" → Undo toast 5s → AbortController cancel nếu click Undo.
- [ ] Bulk delete → Dialog với count + 3 sample SKU + warn nếu N > 500.
- [ ] Empty state (no-data) CTA "Import Excel" + "Tạo mới".
- [ ] Empty state (no-filter-match) hiển thị filter hiện tại + CTA "Xoá lọc".
- [ ] Loading skeleton render ngay lập tức (trước data).
- [ ] Error banner + retry.

### 5.4 T7 — Item detail Tabs + ItemForm polish + Dialog confirm

**Route path:** `apps/web/src/app/(app)/items/[id]/page.tsx` + `apps/web/src/app/(app)/items/new/page.tsx` (rewrite).

**Server vs Client:**
- `page.tsx` server component — fetch item by id (edit) hoặc render empty (new).
- `ItemDetailPage.tsx` client component — Tabs + form state.

**Component tree** (design-spec §2.5):
```
apps/web/src/app/(app)/items/[id]/
  page.tsx                              (server, fetch + hydrate)
  loading.tsx
  error.tsx
apps/web/src/app/(app)/items/new/
  page.tsx                              (server, empty form)
  loading.tsx
apps/web/src/components/items/detail/
  ItemDetailPage.tsx                    (client shell)
  PageHeaderDetail.tsx                  (breadcrumb + title + actions)
  ItemTabs.tsx                          (4 tab)
  ItemBasicInfoForm.tsx                 (tab 1)
  ItemInventoryForm.tsx                 (tab 2)
  ItemTrackingForm.tsx                  (tab 3, conditional fields)
  ItemMediaPlaceholder.tsx              (tab 4, V1.1 placeholder)
  FormActionBar.tsx                     (sticky bottom, [Huỷ][Lưu][Lưu & Tạo tiếp])
  TabErrorBadge.tsx                     (⚠ cạnh tab label nếu có error)
```

**Data fetching:**
- `GET /api/items/:id` — existing.
- `GET /api/items/check-sku?sku=XXX` — debounce 400ms, React Query với staleTime `Infinity` (manual invalidate).
- `POST /api/items` (new) / `PUT /api/items/:id` (edit) — existing, update trả 409 conflict body.

**State:**
- Form: react-hook-form root ở `ItemDetailPage`, tabs share form state (useFormContext).
- URL: `?tab=1|2|3|4` để deep-link + Ctrl+1..4 shortcut.
- Unsaved: `useUnsavedWarn(isDirty)` + `window.beforeunload`.

**API changes:**
- `GET /api/items/check-sku` — existing, verify response shape.
- `DELETE /api/items/:id` — trả body `{ referenced_in: { bom: number, orders: number } }` để dialog delete hiển thị.

**Test plan:**
- Unit: `ItemBasicInfoForm.test.tsx`, `ItemTrackingForm.test.tsx` (conditional fields), validation.
- Component: SKU debounce check không nháy khi gõ.
- Integration: `playwright/item-detail.spec.ts` — create → save → redirect; edit → dirty → navigate away confirm; delete → type "XOA".
- A11y: Tab switch preserve focus; tab error badge announce.

**Acceptance criteria** (design-spec §2.5):
- [ ] Tab switch không mất data (form state persist).
- [ ] SKU check debounce 400ms, không nháy.
- [ ] Delete dùng Dialog (KHÔNG native `confirm()`).
- [ ] Dirty form → confirm navigate away.
- [ ] "Lưu" disable khi invalid hoặc submitting.
- [ ] Tab error show badge `⚠` visible từ TabList.
- [ ] Checkbox shadcn (không native).
- [ ] Ctrl+S global save.
- [ ] Ctrl+1..4 switch tab.

### 5.5 T8 — Import Wizard v2 (palette fix + ColumnMapper)

**Route path:** `apps/web/src/app/(app)/items/import/page.tsx` (rewrite).

**Component tree** (design-spec §2.6):
```
apps/web/src/components/items/import/
  ImportWizardPage.tsx                  (client shell)
  Stepper.tsx                           (horizontal, 4 steps)
  Step1UploadStep.tsx                   (Dropzone + FilePreview + TemplateLink)
  Step2ColumnMapperStep.tsx             (design-spec §3.16)
  Step3PreviewStep.tsx                  (SummaryStats + PreviewTable invalid highlight)
  Step4ResultStep.tsx                   (ResultIcon + ResultStats + ResultActions)
  WizardNav.tsx                         ([← Back] [Cancel] [Next →])
  ColumnMapperTable.tsx                 (source × target × sample)
  SaveMappingCheckbox.tsx               (localStorage iot:import:mapping-preset:items)
  PreviewTable.tsx                      (virtualized, invalid row bg-danger-soft)
  ImportProgressBar.tsx                 (SSE / polling)
```

**Data fetching:**
- Client-side parse (SheetJS `xlsx`): `fileHash` via `SubtleCrypto.digest` → cache với `qk.import.preview(fileHash)`.
- `POST /api/items/import/preview` — body: `{ fileBase64, mapping }` → return `{ headers, sample, totalRows, validCount, errorCount, errors: [{row, reason}] }`.
- `POST /api/items/import/commit` — return `{ jobId }`.
- `GET /api/items/import/jobs/:jobId` — polling 500ms.
- `POST /api/items/import/commit-sync` — D14 fallback khi 503 worker down. Limit 500 rows.

**State:**
- Form: `useForm` zod schema `ImportSchema` (step data).
- Step: `currentStep` local state.
- Mapping: local state + save to localStorage on checkbox.
- Progress: React Query polling.

**API endpoint changes:**
- `POST /api/items/import/preview` — create (mới) or update existing.
- `POST /api/items/import/commit` — check worker health, return 503 `{ code: "WORKER_UNAVAILABLE", fallback: "sync" }` nếu worker down.
- `POST /api/items/import/commit-sync` — NEW endpoint fallback.
- Endpoint types export `@iot/shared`.

**Test plan:**
- Unit: `lib/import-mapping.test.ts` — auto-match synonymDict + Levenshtein.
- Component: `Step2ColumnMapperStep.test.tsx` — auto-match, duplicate headers, save preset.
- Integration: `playwright/import-wizard.spec.ts` — 4 step end-to-end; worker down fallback sync.
- A11y: invalid row announce.

**Acceptance criteria** (design-spec §2.6):
- [ ] Palette dead `brand-500/600` thay bằng `cta` + `slate`.
- [ ] Dropzone active `border-cta bg-cta-soft`.
- [ ] Step indicator done/active/idle đúng màu.
- [ ] Auto-mapping fuzzy cosine/Levenshtein.
- [ ] Preview virtualized > 100 rows.
- [ ] Invalid bg-danger-soft + reason text-danger-strong.
- [ ] File log download `.xlsx`.
- [ ] Progress SSE hoặc polling 500ms.
- [ ] TypeScript: `ImportPreviewRow` type từ Zod (xoá `any`).
- [ ] Save mapping preset localStorage.
- [ ] File size guard 10MB + 50k rows client-side reject.

### 5.6 T9 — `/suppliers` stub + `/pwa/receive/[poId]` min viable

#### 5.6.1 `/suppliers` stub

**Route path:** `apps/web/src/app/(app)/suppliers/page.tsx` + `/new` + `/[id]/page.tsx`.

**Component tree** (design-spec §2.7):
```
apps/web/src/app/(app)/suppliers/
  page.tsx
  new/page.tsx
  [id]/page.tsx
apps/web/src/components/suppliers/
  SuppliersList.tsx                     (reuse DataTable pattern)
  SupplierForm.tsx                      (reuse ItemForm pattern)
  SuppliersEmptyState.tsx
```

**Data fetching:**
- `GET /api/suppliers?q=&active=` — existing hoặc new. Verify `apps/web/src/server/db/suppliers.repo.ts` có.

**API endpoints:** reuse suppliers REST đã có (đã có `SupplierList.tsx` trong code).

**Test plan:** minimal — smoke render, CTA empty state, nav từ Sidebar.

**Acceptance** (design-spec §2.7):
- [ ] Route không 404.
- [ ] List + new + edit CRUD.
- [ ] Empty state CTA.
- [ ] Integration dropdown `/items/[id]` pull từ đây (V1.1 nếu thời gian — stub V1.0).

#### 5.6.2 `/pwa/receive/[poId]`

**Route path:** `apps/web/src/app/pwa/receive/[poId]/page.tsx` + `apps/web/src/app/pwa/layout.tsx` (separate PWA layout, no sidebar).

**PWA layout:**
- KHÔNG dùng AppShell. Dùng riêng `PwaLayout` với PwaTopBar + ScanQueueBadge + content.
- `manifest.webmanifest` scope `/pwa/*`.

**Component tree** (design-spec §2.8):
```
apps/web/src/app/pwa/
  layout.tsx                            (PwaLayout)
  receive/
    page.tsx                            (list PO pending — V1.1 stub, V1 redirect /pwa/receive/demo)
    [poId]/
      page.tsx                          (ReceivingConsolePage)
      loading.tsx
apps/web/src/components/pwa/
  PwaLayout.tsx
  PwaTopBar.tsx
  StatusStrip.tsx                       (offline + queue)
apps/web/src/components/receiving/
  ReceivingConsolePage.tsx
  POLinesPanel.tsx
  POLineCard.tsx
  ScannerPanel.tsx
  BarcodeScanner.tsx                    (design-spec §3.17)
  ManualInput.tsx
  ScanStatus.tsx
  ScanQueueBadge.tsx                    (§3.18.1)
  ScanQueueSheet.tsx                    (§3.18.2 subcomponent)
  ConfirmReceiveDialog.tsx
apps/web/src/lib/
  barcode-detector.ts                   (full impl — attach window khi route /pwa/*)
  dexie-db.ts                           (full schema scan_queue + po_cache + failed_queue)
  sw-register.ts                        (full impl)
apps/web/src/workers/
  sw.ts                                 (Workbox custom — 9 rules §4.3 brainstorm-deep)
apps/web/src/hooks/
  use-scan-audio.ts                     (full Web Audio)
  use-scan-queue.ts                     (full Dexie + replay)
```

**Data fetching:**
- `GET /api/receiving/po/:poId` — return PO + lines. Precache qua SW.
- `POST /api/receipts/:poId/events` — append receipt_event (D20). Idempotent với `event_id` UUID v7 client-generate.
- `GET /api/receipts/:poId/summary` — aggregate sau sync.

**State:**
- Dexie: `scan_queue` table (brainstorm-deep §2.5), `po_cache`, `failed_queue`.
- Form: per-line react-hook-form (lot, exp, qty, qc, notes).
- Online status: `useOnlineStatus()`.

**API endpoint changes:**
- `GET /api/receiving/po/:poId` — NEW.
- `POST /api/receipts/:poId/events` — NEW. Body: `{ event_id, line_id, qty, lot_no?, exp_date?, qc_status, qc_note? }`. Response: `{ accepted: true, warning?: "over_received" }`.
- `POST /api/scans/batch` — NEW (SW background sync). Batch multiple events.

**Test plan:**
- Unit: `barcode-detector.test.ts` (timing threshold, reset buffer).
- Unit: `use-scan-queue.test.tsx` (replay FIFO, backoff).
- Component: `BarcodeScanner.test.tsx` (camera deny fallback), `POLineCard.test.tsx` (conditional lot field).
- Integration: `playwright/receiving.spec.ts` mobile emulation — scan offline → online → commit. Camera denied fallback.
- A11y: aria-live scan announce; tap target ≥ 48.
- Lighthouse: PWA installable ≥ 90 score.

**Acceptance criteria** (design-spec §2.8):
- [ ] Tap target ≥ 48×48 tất cả interactive.
- [ ] Camera permission lazy khi click Quét lần đầu.
- [ ] Deny → flag localStorage + fallback manual (h-14 text-xl).
- [ ] Dexie queue persist F5.
- [ ] Idempotent event_id UUID v7.
- [ ] Audio 880/220 Hz + haptic.
- [ ] 3 kênh feedback (visual + audio + haptic).
- [ ] aria-live scan announce.
- [ ] Reduced motion disable flash/shake, giữ audio + haptic.
- [ ] PWA installable (manifest + SW + icons).
- [ ] Background sync `/api/scans/batch`.

### 5.7 T4-T9 per-day merge gates

Mỗi ngày T cuối buổi:
1. `pnpm -r typecheck` + `pnpm -r test` PASS.
2. Local build `pnpm --filter @iot/web build` success.
3. Visual smoke 3 route chính mới ngày đó (manual click).
4. axe-core scan route mới — 0 serious/critical.
5. Commit + push branch `redesign/<scope>`.
6. Update `PROGRESS.md` checkbox.

---

## §6 Assets & resources (song song T1-T3)

### 6.1 Timeline assets

| Asset | Owner | Ngày | Format |
|-------|-------|------|--------|
| Logo mark SVG 64×64 | Cook inline SVG | T2 | `apps/web/public/logo-mark.svg` + outline variant |
| Logo CNC hero SVG 480×360 | Cook inline SVG (design brief §4.3 design-spec) | T3 morning | `apps/web/public/illustrations/login-hero-cnc.svg` |
| 7 empty state illustrations | Cook inline React SVG | T3-T4 (parallel) | `apps/web/src/components/icons/illustrations/*.tsx` |
| PWA icons (192/256/384/512 + maskable) | `pwa-asset-generator` from logo-mark | T2 (sau logo xong) | `apps/web/public/icons/*.png` |
| favicon.ico | `pwa-asset-generator` | T2 | `apps/web/public/favicon.ico` |
| apple-touch-icon 180×180 | `pwa-asset-generator` | T2 | `apps/web/public/apple-touch-icon.png` |
| manifest.webmanifest | Cook | T2 | `apps/web/public/manifest.webmanifest` |
| OG image 1200×630 | `@vercel/og` route | T3 | `apps/web/src/app/opengraph-image.tsx` dynamic route |
| Template Excel items_template.xlsx | SheetJS script | T8 (trước import cook) | `apps/web/public/templates/items_template.xlsx` |

### 6.2 Commands

**PWA asset generator:**
```bash
# T2, sau khi logo-mark.svg ready
cd c:/dev/he-thong-iot/apps/web
pnpm dlx pwa-asset-generator public/logo-mark.svg public/icons \
  --manifest public/manifest.webmanifest \
  --background "#0F172A" \
  --opaque true \
  --padding "15%" \
  --type png \
  --favicon
# Verify: 192/256/384/512 + maskable-512 + favicon.ico + apple-touch-icon
ls -la public/icons public/favicon.ico public/apple-touch-icon.png
```

**Manifest template** (copy từ design-spec §7.2):
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
  "icons": [ /* 5 icons */ ],
  "shortcuts": [
    { "name": "Nhận hàng", "short_name": "Receive", "url": "/pwa/receive" }
  ]
}
```

**OG image** (T3, dynamic via `@vercel/og`):
```tsx
// apps/web/src/app/opengraph-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OgImage() {
  return new ImageResponse(
    (/* JSX từ design-spec §7.3 */),
    { ...size }
  );
}
```

**Template Excel** (T8 morning, script sinh):
```ts
// apps/web/scripts/generate-items-template.ts
// Run: pnpm tsx apps/web/scripts/generate-items-template.ts
// Generate → apps/web/public/templates/items_template.xlsx
// Sheet "Hướng dẫn" + Sheet "Dữ liệu" với data validation dropdown
```

### 6.3 Empty state illustration list (7 SVG inline React component)

File: `apps/web/src/components/icons/illustrations/`

1. `EmptyBox.tsx` 144×144 — hộp carton mở + gear cluster, slate-400 stroke 1.5.
2. `EmptyMagnifier.tsx` 96×96 — kính lúp + dấu `?`.
3. `EmptyClipboard.tsx` 144×144 — clipboard với dấu `+`.
4. `EmptyTruck.tsx` 144×144 — xe tải line-art chở thùng.
5. `EmptyError.tsx` 96×96 — tam giác cảnh báo + đèn đỏ.
6. `EmptySuccess.tsx` 96×96 — dấu check + confetti.
7. `EmptyOffline.tsx` 96×96 — wifi gạch chéo.

**Spec chung:** stroke `#94A3B8` (slate-400) 1.5px, fill none, rounded linecap/linejoin. Size ≤ 5KB mỗi file. Inline React SVG (không external request). `aria-hidden="true"` trên `<svg>`.

### 6.4 Build info injection

**File:** `apps/web/next.config.js`
```js
const { execSync } = require("child_process");
const buildCommit = process.env.BUILD_COMMIT ?? execSync("git rev-parse --short HEAD").toString().trim();
const buildTime = new Date().toISOString();
const buildVersion = require("./package.json").version;

module.exports = {
  env: {
    NEXT_PUBLIC_BUILD_VERSION: buildVersion,
    NEXT_PUBLIC_BUILD_COMMIT: buildCommit,
    NEXT_PUBLIC_BUILD_TIME: buildTime,
  },
  // ... existing config
};
```

Login footer đọc 3 env này.

---

## §7 Test strategy

### 7.1 Test pyramid cho sprint

| Level | Tool | Scope | File location |
|-------|------|-------|---------------|
| Unit | Vitest | Pure functions, schemas, repo queries | `**/*.test.ts` cạnh source |
| Component | Vitest + @testing-library/react + jsdom | UI components, hooks | `**/*.test.tsx` cạnh source |
| Integration (E2E) | Playwright | 3 critical flow | `tests/e2e/*.spec.ts` |
| A11y | `@axe-core/playwright` | 32 scan (8 route × 4 state) | `tests/a11y/*.spec.ts` |
| Perf | Lighthouse CI | 4 route | `.lighthouserc.json` |

### 7.2 Unit test priority

Theo brainstorm-deep §7 table:

| File | Cover | Ngày cook |
|------|-------|-----------|
| `lib/env.test.ts` | buildDsn 5 password edge | T1 |
| `lib/vn-normalize.test.ts` | parseVN/formatVN + NFD normalize + edge decimal | T3 |
| `lib/barcode-detector.test.ts` | timing threshold + buffer reset + preventDefault | T9 |
| `lib/import-mapping.test.ts` | synonym + Levenshtein | T8 |
| `hooks/use-selection.test.tsx` | 3-mode transition + filter reset | T5 |
| `hooks/use-scan-queue.test.tsx` | FIFO replay + backoff | T9 |
| Component test mỗi shadcn primitive | render + interaction + a11y | T2-T3 |

### 7.3 Integration (Playwright) 3 critical flow

File: `tests/e2e/` (tạo mới dir).

```
tests/e2e/
  playwright.config.ts
  fixtures/
    auth.ts                             (login helper)
    mock-dashboard.ts                   (DASHBOARD_USE_MOCK=true)
  login.spec.ts                         (T4 — 5 password edge cases, 429 lock, captcha)
  dashboard.spec.ts                     (T4 — KPI render + auto-refresh + click navigate)
  items-list.spec.ts                    (T5-T6 — URL filter persist + bulk select all-across + density + keyboard nav)
  items-quick-edit.spec.ts              (T6 — unsaved warn, 409 conflict, optimistic rollback, delete Undo 5s)
  item-detail.spec.ts                   (T7 — create/edit flow, dirty navigation, delete type "XOA")
  import-wizard.spec.ts                 (T8 — 4 step end-to-end, worker down → sync fallback)
  receiving-pwa.spec.ts                 (T9 mobile emulation — scan offline → online → commit, camera deny fallback)
```

### 7.4 A11y plan

File: `tests/a11y/axe.spec.ts`.

32 scan matrix:
| Route | State loaded | State loading | State empty | State error |
|-------|--------------|---------------|-------------|-------------|
| `/login` | ✓ | ✓ | ✓ | ✓ |
| `/` | ✓ | ✓ | ✓ | ✓ |
| `/items` | ✓ | ✓ | ✓ | ✓ |
| `/items/[id]` | ✓ | ✓ | ✓ | ✓ |
| `/items/import` | ✓ | ✓ | ✓ | ✓ |
| `/suppliers` | ✓ | ✓ | ✓ | ✓ |
| `/pwa/receive/[poId]` | ✓ | ✓ | ✓ | ✓ |
| AppShell (CommandPalette, Sheet, Dialog open) | ✓ | — | — | — |

Fail condition: **ANY** serious/critical violation → CI fail.

### 7.5 Lighthouse CI

File: `.lighthouserc.json`.

```json
{
  "ci": {
    "collect": {
      "url": [
        "http://localhost:3001/login",
        "http://localhost:3001/",
        "http://localhost:3001/items",
        "http://localhost:3001/pwa/receive/demo"
      ],
      "numberOfRuns": 3,
      "settings": { "preset": "desktop" }
    },
    "assert": {
      "assertions": {
        "categories:performance": ["error", { "minScore": 0.9 }],
        "categories:accessibility": ["error", { "minScore": 0.95 }],
        "categories:best-practices": ["error", { "minScore": 1.0 }],
        "largest-contentful-paint": ["error", { "maxNumericValue": 2000 }],
        "cumulative-layout-shift": ["error", { "maxNumericValue": 0.1 }],
        "total-blocking-time": ["error", { "maxNumericValue": 200 }]
      }
    },
    "upload": { "target": "temporary-public-storage" }
  }
}
```

Chạy trong CI GitHub Actions (T10 setup).

### 7.6 GitHub Actions workflow

File: `.github/workflows/test.yml` (tạo T10).

```yaml
name: Test
on: [pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with: { node-version: 20, cache: pnpm }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -r typecheck
      - run: pnpm -r test
      - run: pnpm --filter @iot/web build
      - name: Playwright
        run: pnpm --filter @iot/web exec playwright test
      - name: Lighthouse CI
        run: pnpm dlx @lhci/cli autorun
```

---

## §8 Deploy strategy (ngày T10)

### 8.1 Pre-deploy checklist (morning T10)

- [ ] `pnpm -r typecheck` PASS local.
- [ ] `pnpm -r test` PASS local (unit + component).
- [ ] `pnpm --filter @iot/web build` success local (standalone output).
- [ ] Playwright E2E 8 spec PASS local.
- [ ] axe-core 32 scan 0 serious/critical.
- [ ] Lighthouse 4 route pass budget.
- [ ] Bundle size check: `pnpm --filter @iot/web exec next build --profile` — delta vs main ≤ +150KB gzipped.
- [ ] Manual smoke 8 screen trên local `pnpm --filter @iot/web start` port 3001.
- [ ] PWA installable check (Chrome DevTools → Application → Manifest).
- [ ] Tablet emulation 1024×768 Chrome DevTools no horizontal scroll.
- [ ] Reduced motion simulation (Chrome DevTools → Rendering) — shimmer/shake off.

### 8.2 Git flow

```bash
# Local
cd c:/dev/he-thong-iot
git checkout main
git pull origin main

# Merge branches tuần trước (nếu chưa merge vào main — mỗi ngày đã merge thì step này skip)
# Tất cả PR đã merge lên main qua workflow per-day

# Create release branch
git checkout -b release/v1.1.0
git log --oneline main..HEAD   # review changes từ v1.0.1
# Update version
cd apps/web && npm version 1.1.0 --no-git-tag-version
cd ../..
git add .
git commit -m "chore: bump to v1.1.0"

# Tag
git tag -a v1.1.0 -m "Redesign Direction B: Dashboard + AppShell v2 + Items list polish + Import v2 + PWA Receiving"
git push origin release/v1.1.0
git push origin v1.1.0

# Merge to main via PR
gh pr create --base main --head release/v1.1.0 --title "Release v1.1.0 - UI/UX Redesign Direction B" --body "..."
gh pr merge --squash --delete-branch
```

### 8.3 VPS deploy

```bash
# Local: build + save image
cd c:/dev/he-thong-iot
docker build -t registry.local/hethong-iot:v1.1.0 -t registry.local/hethong-iot:latest .
docker save registry.local/hethong-iot:v1.1.0 | gzip > /tmp/iot-v1.1.0.tar.gz
scp -i ~/.ssh/iot_vps /tmp/iot-v1.1.0.tar.gz root@123.30.48.215:/tmp/

# VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215
cd /opt/he-thong-iot/deploy

# Backup current state
bash scripts/backup.sh                 # DB backup
docker tag registry.local/hethong-iot:latest registry.local/hethong-iot:v1.0.1-backup

# Load new image
gunzip -c /tmp/iot-v1.1.0.tar.gz | docker load

# Pull latest code (git) — docker-compose.yml có thể thay đổi
git fetch origin
git checkout v1.1.0

# Apply any new migrations (T1 đã apply 0002a/b — T10 có thể có migrations mới, kiểm tra)
ls packages/db/migrations/
# Nếu có migration mới: apply như p0 plan §2.5

# Restart stack (zero-downtime: stop worker → web → redis → postgres giữ nguyên)
docker compose pull                    # nếu có image khác
docker compose up -d app worker        # rolling restart

# Verify
docker compose ps
docker compose logs -f app --tail=100
docker compose logs -f worker --tail=100
```

### 8.4 Post-deploy smoke suite

**Curl smoke test** (chạy trên VPS hoặc local với mes.songchau.vn):
```bash
# 1. Health
curl -sf https://mes.songchau.vn/api/health | jq
# Expect: { status: "ok", version: "1.1.0" }

# 2. Build info
curl -sf https://mes.songchau.vn/api/build-info | jq
# Expect: { version: "1.1.0", commit: "...", builtAt: "..." }

# 3. Login flow E2E
curl -i -c /tmp/cookie.txt -X POST https://mes.songchau.vn/api/auth/login \
  -H 'content-type: application/json' \
  -d '{"username":"admin","password":"ChangeMe!234"}'
# Expect: HTTP 200, Set-Cookie iot_session

# 4. Dashboard API
curl -b /tmp/cookie.txt https://mes.songchau.vn/api/dashboard/overview | jq
# Expect: 200 { kpi, orders, alerts, systemHealth }

# 5. Items list
curl -b /tmp/cookie.txt "https://mes.songchau.vn/api/items?page=1&size=10" | jq '.items | length'
# Expect: >= 0

# 6. Search không dấu
curl -b /tmp/cookie.txt "https://mes.songchau.vn/api/items?q=banh%20rang" | jq '.items | length'
# Expect: >= 1 nếu có seed, 0 nếu DB trống (OK)

# 7. Suppliers
curl -b /tmp/cookie.txt https://mes.songchau.vn/api/suppliers | jq '.suppliers | length'
# Expect: >= 0

# 8. Worker queue
curl -b /tmp/cookie.txt https://mes.songchau.vn/api/admin/queue-stats | jq
# Expect: { workers: 2, waiting: 0, active: 0 }

# 9. PWA manifest
curl -sf https://mes.songchau.vn/manifest.webmanifest | jq '.name'
# Expect: "Xưởng IoT — BOM MES"

# 10. Service worker
curl -sf https://mes.songchau.vn/sw.js -I
# Expect: 200 + content-type: application/javascript

# 11. Logout
curl -b /tmp/cookie.txt -X POST https://mes.songchau.vn/api/auth/logout
# Expect: 200, Set-Cookie clear
```

### 8.5 Mobile PWA install test

1. Chrome Android → truy cập https://mes.songchau.vn/login → login.
2. Menu → "Add to Home screen" → prompt hiển thị icon + name "Xưởng IoT".
3. Confirm install → icon trên home screen.
4. Launch từ home → standalone mode (no browser chrome).
5. Navigate `/pwa/receive/demo` → camera permission prompt (lazy, trên click "Quét" lần đầu).
6. Offline test: airplane mode → scan 1 line → flush queue badge hiển thị 1.
7. Online lại → queue auto sync → badge → 0.

### 8.6 Rollback plan T10

**Kịch bản 1 — Bug nhỏ, fix forward:** commit fix, build image mới `v1.1.1`, deploy lại qua step §8.3. Không rollback.

**Kịch bản 2 — Bug lớn, rollback:**
```bash
# VPS
ssh -i ~/.ssh/iot_vps root@123.30.48.215
cd /opt/he-thong-iot/deploy

# Rollback image
docker tag registry.local/hethong-iot:v1.0.1-backup registry.local/hethong-iot:latest
docker compose up -d app worker

# Verify
docker compose logs -f app --tail=50
curl -sf https://mes.songchau.vn/api/health

# Git
cd /opt/he-thong-iot
git checkout v1.0.1
```

**Kịch bản 3 — Migration rollback (nếu T10 có migration mới):**
```bash
# Restore DB backup
bash scripts/restore.sh /backups/<pre-v1.1.0-timestamp>.dump
docker compose restart app worker
```

**Kịch bản 4 — Frontend only rollback (keep DB):**
```bash
# Frontend rollback qua image tag previous, DB schema backward compat
docker tag registry.local/hethong-iot:v1.0.1-backup registry.local/hethong-iot:latest
docker compose up -d app
# Worker có thể giữ v1.1.0 nếu compat — hoặc rollback cả nếu breaking
```

### 8.7 Post-deploy monitoring (24h sau)

- [ ] Watch logs: `docker compose logs -f app worker --tail=100` (SSH session open 1h).
- [ ] Monitor disk: `df -h` hourly (PWA icons + OG image có thể pump size).
- [ ] Monitor Redis queue: `docker exec iot_redis redis-cli llen bull:import:wait` — 0 nếu idle.
- [ ] Sentry-like log aggregation: grep `ERROR` trong logs.
- [ ] Request browser test với real user (admin Song Châu) qua Zalo.

---

## §9 Progress tracking

### 9.1 PROGRESS.md update format

Sau mỗi ngày T1-T10, append vào `PROGRESS.md` section "Sprint Redesign Direction B":

```markdown
### Ngày T{N} ({YYYY-MM-DD})
- [x] **Task:** <tên task>
  - Branch: `<branch-name>`
  - PR: #{number} (link)
  - Commits: <list 3-5 commits highlight>
  - Artifact: <path file changed / route URL>
  - Blocker: <none | description>
  - Test: unit {N} PASS, component {M} PASS, E2E {K} PASS
```

### 9.2 Git commit message convention

Theo pattern Conventional Commits:

```
<type>(<scope>): <short description>

<optional body>

<optional footer>
```

**Types:** `feat`, `fix`, `chore`, `refactor`, `docs`, `test`, `style`, `perf`.

**Scopes:** `db`, `env`, `docker`, `shared`, `web`, `worker`, `ui`, `items`, `dashboard`, `pwa`, `deploy`.

**Examples:**
```
feat(ui): add CommandPalette with cmdk
fix(env): rewrite buildDsn with new URL()
chore(shared): add AUTH_COOKIE_NAME constant
refactor(items): extract FilterBar with nuqs URL state
test(e2e): add login 5-password Playwright spec
```

### 9.3 Changelog entry format (cuối T10)

File: `CHANGELOG.md` (tạo nếu chưa có).

```markdown
# Changelog

## [1.1.0] — 2026-04-{end-of-sprint}

### Added
- AppShell v2 với sidebar collapsible, top bar, Ctrl+K Command palette (cmdk).
- Dashboard `/` với 4 KPI + Orders Readiness table + alerts + system health.
- URL-state filter `/items` với nuqs, bulk selection 3 mode, Sheet quick-edit.
- Item detail Tabs (Thông tin/Kho/Tracking/Ảnh).
- Import Wizard v2 với step ColumnMapper + auto-match synonym + save preset.
- `/suppliers` stub (list + CRUD basic).
- `/pwa/receive/[poId]` PWA với BarcodeScanner, Dexie offline queue, camera fallback.
- PWA icons + manifest + service worker (Workbox custom 9 cache rules).
- OG image 1200×630 dynamic via @vercel/og.
- 7 empty state illustrations inline SVG React.
- A11y: focus ring fix, 3-channel status (icon+label+color), reduced motion respect.

### Changed
- Palette `brand-500/600` dead → `cta` + `slate` tokens (Import Wizard fix).
- Login split 50/50 hero + card 420px (was cramped max-w-md).
- `/items` row height 40/56 toggle (was hardcoded 48).
- Delete flow native `confirm()` → shadcn Dialog type-to-confirm "XOA".
- Auth cookie name unified `iot_session` (single source `@iot/shared`).

### Fixed
- `lib/env.ts` regex DSN injection → `new URL()` handle 5 password edge cases.
- Migration 0002 `pg_trgm + unaccent` apply (search không dấu chạy).
- Worker container Dockerfile `pnpm deploy` (symlink @iot/shared resolved).
- Sonner toast position responsive (bottom-right desktop, top-center PWA).

### Security
- CSRF double-submit cookie + header `X-CSRF-Token` cho non-GET API.
- PWA service worker `NetworkOnly` cho `/api/auth/*`.

### Performance
- Virtualized table > 200 rows, FPS ≥ 55 tablet Surface Go 2.
- Font preload Be Vietnam Pro + Inter (vietnamese subset).
- Bundle size Δ +~140KB gzipped (cmdk + dexie + nuqs + html5-qrcode lazy).

### Deprecated
- `brand-500`, `brand-600`, `brand-50` tailwind classes (không tồn tại, dead code đã remove).

### Known Issues (defer V1.1)
- Diff merge view cho concurrent edit 409 (hiện chỉ "Tải lại bản mới").
- Item media upload (R2 bucket chưa setup).
- Work Orders module (nav disabled).
- NotificationBell real-time (hiện placeholder badge 0).
- TV kiosk mode Dashboard.
- Storybook + Visual regression (Chromatic/Percy).

[1.1.0]: https://github.com/Andy-cods/he-thong-iot/releases/tag/v1.1.0
```

### 9.4 Daily standup template (optional — cook agent tự report)

```markdown
## T{N} ({date}) — Standup

**Hôm qua:** <done>
**Hôm nay:** <plan>
**Blocker:** <none | description>
**Help needed:** <none | description>
```

---

## §10 Defer sang V1.1 (YAGNI list)

Phát hiện trong brainstorm/design-spec nhưng KHÔNG cook V1 để giữ scope 10 ngày:

| Item | Nguồn | Lý do defer |
|------|-------|-------------|
| Diff merge view cho 409 conflict | D11 | Phức tạp, user V1 chỉ 1-2 người chỉnh sửa song song, hiếm |
| Item media upload (ảnh item) | Brainstorm §5.1 `/items/[id]/page.tsx` Tab 4 | R2 bucket chưa setup, upload flow 4h riêng |
| Work Orders module | Sidebar nav disabled | V1.2 scope |
| TV kiosk mode Dashboard | Design-spec §1.5 KPI 72px | V1.1, không phải hot path |
| Notification real-time + Sheet | TopBar NotificationBell | V1.1, hiện placeholder badge 0 |
| Storybook + Chromatic visual regression | D29 | Manual QA đủ cho V1 |
| Framer Motion orchestration | D28 | CSS đủ |
| Full PWA picklist (Work Order pick) | Brainstorm §2 wireframe #8 | V1.2 khi có WO |
| Audit log UI | Brainstorm §4 P3 #11 | V1.1 |
| Rate limit login UI countdown | Brainstorm §4 P3 #10 | Có trong design-spec §2.1 nhưng backend chưa implement rate limit — cook banner stub UI OK, backend V1.1 |
| CSP strict mode (nonce, hash) | Brainstorm §4 P2 #8 | Siết CSP là full audit → V1.1. V1 giữ hiện tại |
| Saved filter preset | Brainstorm §5.1 Items | Users hiện chưa yêu cầu, V1.1 |
| Keyboard shortcut "?" help overlay | Design-spec §2.2 Dashboard | Nice-to-have, V1.1 |
| Advanced Dashboard draggable tiles | Direction C | Không áp dụng Direction B |

---

## §11 Quick reference — path cheatsheet

Cook agent dùng nhanh mà không phải grep lại:

```
# Tokens + base
apps/web/tailwind.config.ts
apps/web/src/app/globals.css
apps/web/src/app/layout.tsx

# Providers
apps/web/src/providers/{query,toast,csrf,nuqs}-provider.tsx

# Primitives (shadcn)
apps/web/src/components/ui/{dialog,sheet,checkbox,skeleton,tooltip,dropdown-menu,breadcrumb,progress,command,separator,empty-state}.tsx

# Layout
apps/web/src/components/layout/{AppShell,Sidebar,TopBar,UserMenu}.tsx
apps/web/src/components/command/CommandPalette.tsx

# Domain
apps/web/src/components/domain/{StatusBadge,KpiCard,OrdersReadinessTable}.tsx

# Items
apps/web/src/components/items/{ItemsList,FilterBar,DataTable,ItemListRow,BulkActionBar,DensityToggle,Pagination,ItemQuickEditSheet,ItemQuickPreviewSheet,ItemActionsDropdown,DeleteConfirmDialog,BulkDeleteDialog,ItemsEmptyState,ItemsErrorState,ItemsLoadingSkeleton}.tsx
apps/web/src/components/items/detail/{ItemDetailPage,PageHeaderDetail,ItemTabs,ItemBasicInfoForm,ItemInventoryForm,ItemTrackingForm,ItemMediaPlaceholder,FormActionBar,TabErrorBadge}.tsx
apps/web/src/components/items/import/{ImportWizardPage,Stepper,Step1UploadStep,Step2ColumnMapperStep,Step3PreviewStep,Step4ResultStep,WizardNav,ColumnMapperTable,SaveMappingCheckbox,PreviewTable,ImportProgressBar}.tsx

# Dashboard
apps/web/src/components/dashboard/{Dashboard,DashboardHeader,KpiRow,OrdersReadinessTable,AlertsSidebar,SystemHealthStrip,SparklineSvg}.tsx

# PWA
apps/web/src/components/pwa/{PwaLayout,PwaTopBar,StatusStrip}.tsx
apps/web/src/components/receiving/{ReceivingConsolePage,POLinesPanel,POLineCard,ScannerPanel,BarcodeScanner,ManualInput,ScanStatus,ScanQueueBadge,ScanQueueSheet,ConfirmReceiveDialog}.tsx
apps/web/src/workers/sw.ts

# Lib
apps/web/src/lib/{env,query-keys,query-client,storage,shortcuts,vn-normalize,barcode-detector,dexie-db,sw-register,import-mapping,api-client,nav-items}.ts
apps/web/src/lib/mock/dashboard.ts

# Hooks
apps/web/src/hooks/{use-debounced-value,use-sidebar-state,use-selection,use-unsaved-warn,use-online-status,use-cmdk-recents,use-scan-audio,use-scan-queue}.ts[x]

# Illustrations
apps/web/src/components/icons/illustrations/{EmptyBox,EmptyMagnifier,EmptyClipboard,EmptyTruck,EmptyError,EmptySuccess,EmptyOffline}.tsx

# Public assets
apps/web/public/logo-mark.svg
apps/web/public/logo-mark-outline.svg
apps/web/public/illustrations/login-hero-cnc.svg
apps/web/public/icons/{icon-192,icon-256,icon-384,icon-512,icon-maskable-512}.png
apps/web/public/apple-touch-icon.png
apps/web/public/favicon.ico
apps/web/public/manifest.webmanifest
apps/web/public/templates/items_template.xlsx

# Routes
apps/web/src/app/login/page.tsx
apps/web/src/app/(app)/page.tsx (Dashboard)
apps/web/src/app/(app)/layout.tsx
apps/web/src/app/(app)/items/page.tsx
apps/web/src/app/(app)/items/new/page.tsx
apps/web/src/app/(app)/items/[id]/page.tsx
apps/web/src/app/(app)/items/import/page.tsx
apps/web/src/app/(app)/suppliers/page.tsx
apps/web/src/app/(app)/suppliers/new/page.tsx
apps/web/src/app/(app)/suppliers/[id]/page.tsx
apps/web/src/app/pwa/layout.tsx
apps/web/src/app/pwa/receive/page.tsx
apps/web/src/app/pwa/receive/[poId]/page.tsx
apps/web/src/app/opengraph-image.tsx

# API routes (new)
apps/web/src/app/api/build-info/route.ts
apps/web/src/app/api/dashboard/overview/route.ts
apps/web/src/app/api/items/bulk/route.ts
apps/web/src/app/api/items/import/preview/route.ts
apps/web/src/app/api/items/import/commit/route.ts
apps/web/src/app/api/items/import/commit-sync/route.ts
apps/web/src/app/api/items/import/jobs/[jobId]/route.ts
apps/web/src/app/api/receiving/po/[poId]/route.ts
apps/web/src/app/api/receipts/[poId]/events/route.ts
apps/web/src/app/api/scans/batch/route.ts
apps/web/src/app/api/search/route.ts

# Tests
apps/web/src/lib/*.test.ts
apps/web/src/hooks/*.test.tsx
apps/web/src/components/**/*.test.tsx
tests/e2e/{login,dashboard,items-list,items-quick-edit,item-detail,import-wizard,receiving-pwa,suppliers}.spec.ts
tests/a11y/axe.spec.ts
.lighthouserc.json
.github/workflows/test.yml
```

---

## §12 Kết

Plan này có **1 tuần build local + 2 ngày deploy/QA + 1 ngày buffer** trong 10 ngày làm việc. Mỗi ngày cuối có PR merge + PROGRESS update — user Song Châu review daily.

Cook agent đọc plan theo thứ tự §3 → §4 → §5 → §6 → §7 → §8. Không cần hỏi lại nếu 4 artifact nguồn đã copy đủ vào ngữ cảnh. Mọi conflict/gap giữa artifact đã flag ở §2.

**Next action:** Spawn cook agent với 5 input:
1. `plans/redesign/260417-implementation-plan.md` (file này)
2. `plans/redesign/260417-design-spec.md`
3. `plans/redesign/260417-brainstorm-deep.md`
4. `plans/redesign/260417-p0-bugs-fix-plan.md`
5. `CLAUDE.md`

Start: **T1 = fix 3 P0 bugs** theo `plans/redesign/260417-p0-bugs-fix-plan.md`.

---

*End of implementation plan. Version 1.0 — 2026-04-17.*
