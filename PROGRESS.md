# PROGRESS — Hệ thống xưởng IoT (BOM-centric)

> File này ghi lại tiến độ thực tế của dự án. Cập nhật sau mỗi milestone / sau mỗi lần agent hoàn thành công việc.
> **Cách dùng:** khi Claude/agent hoàn thành 1 đầu việc → đánh dấu `[x]`, ghi ngày + file/agent ra output ở cột *Artifact*.

---

## 📌 Bối cảnh nhanh

- **Repo:** `Andy-cods/he-thong-iot` (private)
- **VPS dùng chung với Song Châu ERP:** `103.56.158.129` (Ubuntu 4vCPU/8GB)
  - Song Châu expose: **80, 443** qua Nginx (reverse proxy → frontend:3000, api:8000)
  - Song Châu internal: 5432 (Postgres), 6379 (Redis)
  - **NGUYÊN TẮC:** KHÔNG được động vào bất cứ container/port/volume nào của Song Châu. he-thong-iot phải cô lập hoàn toàn.
- **Boilerplate:** Claude-Kit (13 agents + slash commands) đã được copy vào `.claude/`
- **UI skill:** ui-ux-pro-max (161 reasoning rules, auto-activate)

---

## 🗺 Roadmap 3 pha (từ context doc)

| Pha | Mục tiêu | Trạng thái |
|---|---|---|
| **V1** | Core vận hành: item master, BOM revision, BOM snapshot theo đơn, PR/PO/ETA, inbound + QC, work order thủ công, inventory + reservation, barcode scan, assembly, audit, dashboard | ⏳ Chưa bắt đầu |
| **V2** | Edge gateway + machine telemetry (Brother SPEEDIO S500X1 / CNC-C00) | 📦 Đặt chỗ |
| **V3** | Analytics + OEE + lead-time learning + forecasting | 📦 Đặt chỗ |

---

## ✅ Checklist khởi động

### Giai đoạn 0 — Workspace & Tooling
- [x] 2026-04-16 · Đọc 4 folder: Claude-Kit, ui-ux-pro-max-skill-main, hệ thống xưởng IOT, New folder
- [x] 2026-04-16 · Copy 13 Claude-Kit agents vào `.claude/agents/` — *13 agents, `ls .claude/agents/`*
- [x] 2026-04-16 · Copy Claude-Kit commands vào `.claude/commands/` — *cook, plan, test, debug, watzup, design/*, docs/*, fix/*, git/*, plan/*)*
- [x] 2026-04-16 · Copy 2 file context vào `docs/context-part-1.md` & `docs/context-part-2.md`
- [x] 2026-04-16 · Tạo `PROGRESS.md` này
- [ ] Khởi tạo git repo local + link về `Andy-cods/he-thong-iot`
- [ ] Cài `ui-ux-pro-max` skill (local hoặc global `~/.claude/skills/`)

### Giai đoạn 1 — Phân tích bài toán (agents)
- [x] 2026-04-16 · **solution-brainstormer** · Top 5 điểm mạnh + 7 điểm yếu + 3 phương án kiến trúc (khuyến nghị **Lean Monolith B**) + scope V1 10 feature · *`plans/analysis/brainstorm.md`*
- [x] 2026-04-16 · **researcher** · Đối chiếu 7 topic 2025 (BOM snapshot, PWA barcode, RLS, Compose, Brother CNC, MVP scope, alternatives) — V1 phù hợp, điều chỉnh barcode lib & ECO workflow · *`plans/analysis/research-v1-feature-fit.md`*
- [x] 2026-04-16 · **planner** · Plan V1 10 tuần với 10 module IN, 10 feature OUT, 20 bảng DB, ~45 API, deploy strategy cô lập Song Châu · *`plans/v1-foundation/260416-v1-implementation-plan.md`*
- [x] 2026-04-16 · **ui-ux-designer + ui-ux-pro-max** · Industrial Slate × Stock Green × Safety Orange palette + Be Vietnam Pro/Inter/JetBrains Mono + 8 wireframe ASCII + Tailwind tokens · *`docs/design-guidelines.md`, `plans/design/260416-v1-wireframes.md`*

### Giai đoạn 2 — Implementation (V1 foundation)
- [x] 2026-04-16 · `deploy/docker-compose.yml` cô lập hoàn toàn với Song Châu (prefix `iot_`, network `iot_net`, Caddy bind 127.0.0.1:8443) — *`deploy/docker-compose.yml`, `deploy/Caddyfile`*
- [x] 2026-04-16 · Drizzle schema `app` đủ 20 bảng V1 (auth, master, bom, order, procurement, inventory, production, assembly, audit + eco stub) — *`packages/db/src/schema/*.ts`*
- [x] 2026-04-16 · Seed 4 role + 1 admin user — *`packages/db/src/seed.ts`*
- [ ] RLS policies (defer tuần 10)
- [x] 2026-04-16 · Backend API stub auth (login/logout/me) + health/ready — *`apps/web/src/app/api/*`*
- [ ] Backend API item master + BOM CRUD (tuần 2-3)
- [x] 2026-04-16 · Frontend PWA skeleton (landing + login + design tokens Industrial Slate) — *`apps/web/src/app/*`, `apps/web/tailwind.config.ts`*
- [ ] Frontend item master + BOM editor (tuần 2-3)
- [x] 2026-04-16 · Reverse proxy riêng (Caddy :8443) + Cloudflare Tunnel config — *`deploy/Caddyfile`, `deploy/cloudflared-config.yml.example`*
- [x] 2026-04-16 · Backup script `pg_dump | gpg` + rsync off-site placeholder — *`deploy/scripts/backup.sh`*
- [ ] Monitoring V1: pino + UptimeRobot free + Telegram alert (Prometheus/Grafana defer V1.1)
- [x] 2026-04-16 · Health-check cron + Telegram alert skeleton — *`deploy/scripts/health-check.sh`*

### Tuần 1 — Foundation (đồng bộ với plan V1 Section 14)
- [x] 2026-04-16 · Repo + TS + ESLint skeleton — *`package.json`, `tsconfig.base.json`, `pnpm-workspace.yaml`*
- [x] 2026-04-16 · Docker Compose skeleton — *`deploy/docker-compose.yml`*
- [x] 2026-04-16 · Caddy + Cloudflare Tunnel config — *`deploy/Caddyfile`, `deploy/cloudflared-config.yml.example`*
- [x] 2026-04-16 · Quyết định TÁCH Postgres/Redis riêng (user confirm) — docker-compose.yml + Caddyfile + deploy/README cập nhật
- [x] 2026-04-16 · Drizzle schema `app` đủ 20 bảng (push 1 lần tuần 1, populate tuần 2+) — *`packages/db/src/schema/*`*
- [x] 2026-04-16 · Auth module + JWT argon2 + 4 role seed — *`apps/web/src/lib/auth.ts`, `apps/web/src/app/api/auth/login/route.ts`, `packages/db/src/seed.ts`*
- [x] 2026-04-16 · Health check + Telegram alert skeleton — *`apps/web/src/app/api/health/route.ts`, `deploy/scripts/health-check.sh`*

### Tuần 2 — Item Master + Barcode + Supplier + Excel Import
- [x] 2026-04-16 · Brainstorm tuần 2 (3 quyết định chốt: TOOL+PACKAGING enum, SKU manual, import idempotency) — *`plans/v1-foundation/week-2/brainstorm.md`*
- [x] 2026-04-16 · Plan chi tiết tuần 2 (5 ngày × 2 dev, 20+ endpoints, schema + UI + worker) — *`plans/v1-foundation/week-2/260416-week2-plan.md`*
- [x] 2026-04-16 · Migration 0002 — thêm TOOL/PACKAGING, cột category/isActive/source/moq/packSize/vendorItemCode, bảng `import_batch`, pg_trgm + unaccent extension — *`packages/db/migrations/0002_week2_item_master.sql`*
- [x] 2026-04-16 · Zod schemas shared (item/barcode/supplier/import) với SKU_REGEX — *`packages/shared/src/schemas/*.ts`*
- [x] 2026-04-16 · Server repos (items/barcodes/suppliers/itemSuppliers/importBatch) với pg_trgm search — *`apps/web/src/server/repos/*`*
- [x] 2026-04-16 · Audit service + session guard + http utils — *`apps/web/src/server/services/audit.ts`, `session.ts`, `http.ts`*
- [x] 2026-04-16 · API Items CRUD + check-sku + restore + soft-delete — *`apps/web/src/app/api/items/**`*
- [x] 2026-04-16 · API Barcodes CRUD + set-primary — *`apps/web/src/app/api/items/[id]/barcodes/**`*
- [x] 2026-04-16 · API Suppliers + item-suppliers + preferred — *`apps/web/src/app/api/suppliers/**`, `items/[id]/suppliers/**`*
- [x] 2026-04-16 · API Import (check/upload/status/commit/errors.xlsx/template) — *`apps/web/src/app/api/imports/**`*
- [x] 2026-04-16 · Excel service (parseItemImport stream, buildErrorWorkbook, buildImportTemplate) — *`apps/web/src/server/services/excelImport.ts`*
- [x] 2026-04-16 · BullMQ queue client + idempotent enqueue (jobId=batchId) — *`apps/web/src/server/services/importQueue.ts`*
- [x] 2026-04-16 · BullMQ worker job `item-import-commit` (chunk 500, txn per chunk, skip/upsert/error modes) — *`apps/worker/src/jobs/itemImport.ts`*
- [x] 2026-04-16 · UI: List virtualized 10k rows, Edit Sheet 3 tab, New form — *`apps/web/src/app/(app)/items/**`, `components/items/*`*
- [x] 2026-04-16 · UI: Import Wizard 3-step (upload → preview → result) với polling 2s — *`apps/web/src/app/(app)/items/import/page.tsx`, `components/items/ImportWizard.tsx`*
- [x] 2026-04-16 · Hooks TanStack Query (useItems, useBarcodes, useSuppliers, useImports) — *`apps/web/src/hooks/*.ts`*
- [x] 2026-04-16 · UI primitives shadcn (badge, dialog, input, label, select, tabs, textarea) — *`apps/web/src/components/ui/*`*
- [x] 2026-04-16 · Unit tests cơ bản (SKU regex, zod schemas, excelImport parse/template) — *`packages/shared/src/schemas/item.test.ts`, `apps/web/src/server/services/excelImport.test.ts`*
- [ ] UAT import 3.000 SKU thật (cần Phase 0 cleansing Excel xong)

### Giai đoạn 3 — Deploy lên VPS (đổi sang VPS dedicated 2026-04-17)
- [x] 2026-04-17 · Khảo sát VPS cũ `103.56.158.129` (share Song Châu): disk 93%, có stack cũ `he-thong-xuong-iot` (kill được nhưng skip vì user mua VPS mới)
- [x] 2026-04-17 · Đổi sang VPS dedicated `123.30.48.215` (Ubuntu 24.04, 2 vCPU/2GB RAM/40GB HDD, hostname `he-thong-iot`) — **Song Châu KHÔNG còn share**, ràng buộc cô lập nới lỏng
- [x] 2026-04-17 · Plan đầy đủ: `plans/deploy/260417-bootstrap-vps-dedicated.md` (Plan agent thiết kế: swap 4GB, build trên VPS, port 80, 1 image multi-stage)
- [x] 2026-04-17 · Bootstrap VPS: swap 4GB swapfile + Docker 29.4.0 + compose v5.1.3 + UFW (22/80/443) + dirs `/opt/hethong-iot/{secrets,logs,backups}`
- [x] 2026-04-17 · Tạo `Dockerfile` multi-stage Next standalone + worker tsx runtime; `.dockerignore`; sửa Caddyfile bind `:80`; sửa compose port `80:80` + `443:443`
- [x] 2026-04-17 · Move project khỏi OneDrive sang `C:\dev\he-thong-iot\` (fix ERR_PNPM_EBUSY do OneDrive lock)
- [x] 2026-04-17 · `pnpm install` (35s, argon2 native build OK), `pnpm build` PASS local sau 5 fix: worker tsc → tsx runtime, regex escape next.config.js, shared/db schema/index bỏ `.js` extension, webpack `extensionAlias` map `.js→.ts`, conditional `output: standalone` (Windows symlink), set dummy DATABASE_URL/JWT_SECRET cho build-time (env.ts crash khi Next collect API routes)
- [x] 2026-04-17 · `pnpm test` shared 11/11 PASS, web 4/6 PASS (2 fail exceljs stream trên Node 24 local — sẽ pass trên Node 20 Docker)
- [x] 2026-04-17 · Build Docker image VPS thành công (273MB, 13 phút trên 2 vCPU, multi-stage Next standalone + worker tsx)
- [x] 2026-04-17 · Up postgres+redis healthy, migrate qua `drizzle-kit generate` + `psql` (28 tables app schema), seed admin `admin/ChangeMe!234`
- [x] 2026-04-17 · Up app+caddy, smoke test `/api/health` 200, login `/api/auth/login` 200 với JWT cookie
- [x] 2026-04-17 · Setup domain `mes.songchau.vn` + Caddy auto Let's Encrypt cert (HTTP/2 + HTTP/3, 80→443 redirect)
- [x] 2026-04-17 · Fix middleware Edge runtime đọc `process.env.JWT_SECRET` (compose chỉ set `_FILE`) → thêm `JWT_SECRET: ${JWT_SECRET}` inline → login redirect loop hết
- [x] 2026-04-17 · Fix CSP wildcard `https://files.iot.*` invalid + thiếu `media-src` → đổi CSP gọn hơn trong Caddyfile
- [x] 2026-04-17 · Push code lên GitHub `Andy-cods/he-thong-iot` (private, branch main)
- [x] **🚀 LIVE: https://mes.songchau.vn** — login admin/ChangeMe!234 hoạt động đầy đủ
- [ ] Worker container disabled (pnpm symlinks missing trong runtime image) — fix trong sprint redesign
- [ ] Migration 0002 (pg_trgm + unaccent) — search VN không dấu chưa hoạt động
- [ ] PWA icons 404, lib/env.ts regex root-cause fix, R2 placeholder
- [ ] Đổi password admin

### Giai đoạn 4 — UI/UX Redesign (Direction B, 2026-04-17 quyết định)
- [x] 2026-04-17 · Brainstorm agent tổng hợp 10 vấn đề UI/UX + 3 direction + bug full-stack — *`plans/redesign/260417-brainstorm.md`*
- [x] 2026-04-17 · User chốt **Direction B (Refresh trung bình)**: giữ palette Industrial Slate, thêm Dashboard + AppShell + CommandPalette + Receiving + PWA min, fix 3 P0 bug
- [x] 2026-04-17 · **Brainstorm deep** (data flow 5 tầng + 30 quyết định execution) — *`plans/redesign/260417-brainstorm-deep.md`*
- [x] 2026-04-17 · **Design spec** (tokens diff + 8 screen ASCII + 18 component TS props + motion + a11y + assets) — *`plans/redesign/260417-design-spec.md`*
- [x] 2026-04-17 · **P0 bugs audit + fix plan** (env.ts regex root-cause, migration 0002 split superuser, worker pnpm deploy) — *`plans/redesign/260417-p0-bugs-fix-plan.md`*
- [x] 2026-04-17 · **Implementation plan** 10 ngày T1-T10 + 30 quyết định resolved — *`plans/redesign/260417-implementation-plan.md`*
- [x] 2026-04-17 · **T1 P0 bug fixes:** `buildDsn` dùng `new URL()` + 9/9 test, migration 0002 split 0002a (superuser) + 0002b (app user) + script `apply-sql-migrations.sh`, worker Dockerfile `pnpm deploy` stage + `tsx` sang deps, cookie name centralized — *commits e504b36, 3763f87, 748a2ff, 680104b*
- [x] 2026-04-17 · **T2-T3 Foundation:** design tokens diff (colors `*-strong` AAA, spacing, elevation, motion, z-index scale), globals.css keyframes, 12 shadcn primitives (Sheet/DropdownMenu/Popover/Checkbox/Skeleton/Breadcrumb/EmptyState... + Dialog/Button/Input patched), 6 layout/domain components (Sidebar collapsible / TopBar / UserMenu / CommandPalette cmdk / StatusBadge / EmptyState), utility libs (cn, format vi-VN, shortcuts IME-safe, storage), providers (QueryProvider staleTime 30s, SonnerProvider position mobile/desktop) — *commits 453853b, 9cd0fb2, 7e87f19, 17c0e5b*
- [x] 2026-04-17 · **T4 AppShell + Login + Dashboard:** AppShell wiring `(app)/layout.tsx` + nav-items registry role-filtered, `/login` split 50/50 + CNC hero SVG + build info footer + focus ring fixed, `/` Dashboard skeleton (4 KPI cards + Orders Readiness table mock 5 rows + Alerts 3 stub + SystemHealthCard auto-refresh 30s), middleware protect `/`, useSession + useHealth hooks — *commits 858393b, 8d8b7a0, ca3c251*
- [x] 2026-04-17 · **T5-T7 Items redesign:** query-keys factory + optimistic mutations (useUpdateItem + useDeleteItem + useBulkDelete), URL-state filter nuqs (q/type/active/category/supplier/lotTracked/minStockViolation), density 40/56px responsive, 3-mode bulk select (none/visible/all-matching), virtualized table + skeleton rows + EmptyState, keyboard shortcuts (/jkeSpace), ItemQuickEditSheet 480px slide-in + unsaved warning + 409 conflict dialog, detail Tabs 4 section (Thông tin/Kho/Tracking/Ảnh), DialogConfirm "XOA" thay confirm(), ItemForm Accordion 4 section + shadcn Checkbox + SKU debounce 400ms + required label — *commits 60be916, bed94e0, ea3808a, 89ded0a*
- [x] 2026-04-17 · **T8-T9 Import v2 + Suppliers + PWA:** ColumnMapperStep 60+ synonyms VN/EN + Levenshtein + duplicate badge + preset localStorage, ImportWizard 4 step (Upload→Map→Preview→Result) palette cta/slate thay brand-* dead, Suppliers list+new+detail stub, `/pwa` layout tách (no sidebar), Dexie scanQueue + uuidv7 FIFO, BarcodeScanner 3-source (camera/USB wedge <80ms/manual) + IME safe + beep 880/220Hz + haptic, ScanQueueBadge floating + retry sheet, ReceivingConsole 2-col tablet + optimistic enqueue + online banner + replay fake 600ms — *commits d241633, 3981b17, c8cf494, 894cd2c, b769e36*
- [x] 2026-04-17 · **T1-T3 Assets:** icon source SVG gear cluster + hex bolt (slate-900 + safety-orange), 4 PNG maskable 192/256/384/512 via sharp, favicon.ico + apple-touch-icon 180, opengraph-image.tsx dynamic 1200x630 @vercel/og, 6 line-art illustrations (EmptyBox/EmptySearch/EmptyAlert/EmptyInbox/ScanReady/OfflineCloud), LoginHero refine 3 gears + tool-path arc + spindle marker, manifest.webmanifest Vietnamese + maskable, BUILD_SHA/DATE/VERSION env injection — *commits 2821b26, 38434c2, db60d16*
- [ ] Local `pnpm build` verify (đang chạy) + dev server smoke test
- [ ] Apply migration 0002a+0002b trên VPS (CẦN USER xác nhận)
- [ ] Rebuild Docker image VPS + deploy + smoke login flow + verify từng screen

### Giai đoạn 5 — UI/UX V2 Redesign (Linear-inspired, 2026-04-17 start)
- [x] 2026-04-17 · **Plan pack V2** (brainstorm 774 dòng + design-spec 4191 dòng + implementation-plan 1400 dòng, zinc+electric-blue + font scale nhỏ hơn + density D3) — *commit e0b416b* · `plans/redesign-v2/*.md`
- [x] 2026-04-17 · **T1 Tokens refactor:** replace tailwind.config (palette zinc+blue+semantic + back-compat slate/brand/cta alias, typography 10 tokens, spacing 9+back-compat, radius sm/md=6/lg=8, shadow minimal, motion 100/150/200/300ms + ease-out-quart, keyframes V2), globals.css (CSS vars --bg/--text/--accent/--shortage + reserve dark mode, Inter cv11/ss01/cv02, :focus-visible CSS outline 2px blue-500), layout.tsx bỏ Be Vietnam Pro giữ Inter, `docs/design-guidelines-v2.md` NEW ~180 dòng — *commit 9e0e782*
- [x] 2026-04-17 · **T2-T3 13 UI primitives refactor:**
  - Commit A (6f0df10) — Button (size xs/sm/md=default h-8/lg/icon + blue-500 primary), Input (size sm h-8 / default h-9 / lg h-11 PWA + CSS outline focus), Label (13px weight 500 + uppercase variant + required red-500), Badge (rounded-full→rounded-sm + shortage variant orange-50/700)
  - Commit B (e701ffd) — Checkbox (20px→14px h-3.5 border 1.5px blue-500), Select (trigger sm h-8 / default h-9, item h-8 selected blue-50), Textarea (min-h 72px 13px padding 12/8), Skeleton (bg zinc-100 shimmer-sm 1200ms)
  - Commit C (0b43c48) — Dialog (rounded-lg 8px shadow-lg overlay 0.5 padding 20 close 28px), Sheet (md 420px/lg 560px ease-out-quart header h-12 body p-20 footer h-14), Popover (padding 12 shadow-sm offset 4 no arrow), Dropdown (item h-8 text-base padding-x 8 danger red-700), Tabs (list h-9 border-b trigger h-8 active zinc-900 underline neutral)
  - Commit D (c5a89a2) — Tooltip NEW (Radix + SimpleTooltip helper, bg zinc-900 text-12px rounded-md max-w-240 delay 300), Breadcrumb (separator chevron→"/" zinc-400 font 13px), EmptyState refactor icon-based (BỎ illustrations folder 6 SVG + giữ `illustration` @deprecated alias)
- [x] 2026-04-17 · **T4 6 layout components refactor:**
  - Commit E (064ac0d) — Sidebar (220px FIXED bỏ collapsible V1, nav item h-7 font 13 active blue-50/border-l-blue-500), TopBar (desktop h-14→h-11 44px, CmdK button h-8 bg zinc-50, buttons h-8 icons 16px, badge tabular-nums), UserMenu (trigger h-8 avatar 24px, items h-8 text-base, logout danger)
  - Commit F (d1fb0f3) — CommandPalette (560px rounded-lg shadow-lg input h-11, item h-8 aria-selected blue-50 + footer hints), AppShell (grid 220/44 CSS vars, padding 24/20 md+, mobile drawer 280px)
- [x] 2026-04-17 · **T5 6 Domain components refactor:**
  - Commit G (c752469) — StatusBadge V2 (size sm h-5 / md h-6, variants neutral/info/success/warning/danger/shortage safety-orange, 3-channel icon+label+color, border 1px), KpiCard V2 (**FIX RSC→Client bug**: icon prop = React.ReactNode JSX element, BỎ border-l-4 stripe V1, h-20 compact, value 22px font-medium tabular-nums, label 12px uppercase zinc-500, status dot 6px bên trái label)
  - Commit H (2b8ca2c) — OrdersReadinessTable V2 (row h-9 36px no zebra, padding-x 12, text 13px, progress bar h-1.5 zinc-200 fill emerald/amber/red 80/40 threshold, shortage row bg-orange-50/60), AlertsList V2 (item padding 12, icon leading 14px shortage safety-orange override, title 13px + desc 12px zinc-500, divide-y zinc-100 hover bg-zinc-50), SystemHealthCard V2 (header "HỆ THỐNG" uppercase 11px + timestamp mono, status row h-8 dot 8px + label 13px + value mono 12px divide-y), EmptyState thêm preset `no-alerts` (BellOff icon)
- [x] 2026-04-17 · **T6 /login + / Dashboard V2 refactor:**
  - Commit I (e1dced1) — /login V2 (hero bg slate-900 → zinc-900 + SVG Linear-minimal 1 spindle + 2 gears stroke 1px zinc-400 40% width, form card max-w-[400px] padding 24 border zinc-200 rounded-lg shadow-none, title "Đăng nhập" text-xl 20px semibold, label text-xs uppercase tracking-wide zinc-700, input h-9, button primary blue-500 h-9 full-width, error alert border red-200 bg red-50 + AlertCircle icon 14px, BuildInfo format `v{VER} · {SHA7} · {DATE}` mono 11px zinc-400, giữ Suspense boundary)
  - Commit J (d65574c) — / Dashboard V2 (greeting h1 text-xl 20px semibold + subtitle text-xs zinc-500 "mock V1", KPI row gap-3 với icon JSX element `<Icon className="h-3.5 w-3.5" />` cross RSC→Client boundary safe, content grid lg:3 col OrdersReadinessTable col-span-2 + AlertsList/SystemHealthCard stack, section header uppercase tracking-wide text-xs zinc-500 "Xem tất cả (V1.1) →" CTA blue-600, quick links h-12 card icon 14px + title 13px + desc 11px, mock disclaimer footer zinc-400)
- [x] 2026-04-17 · **T7 FilterBar + BulkActionBar + ItemListTable V2 (row 36px no zebra):** FilterBar search 280px + segmented 3-mode active + Type multi-Popover + Advanced 320px Popover + chips dismiss row + Xoá tất cả link blue-600, BulkActionBar h-12 white shadow-sm text-13 slide-up 150ms, ItemListTable row h-9 36px no zebra header h-8 bg-zinc-50 11px upper, SKU sticky border-r mono 12px, actions Eye/Pencil/Copy icon 14px h-7 w-7 ghost, selected bg-blue-50, focused ring blue-500 outline — *commits L 84f7802 + M 696e468 + N b704326*
- [x] 2026-04-17 · **T8 ItemForm + QuickEditSheet + detail/new pages V2:** ItemForm max-w-720 p-6 Accordion 4 section, label uppercase 11px tracking-wider zinc-500 + required red-500, input h-9 form default, SKU indicator inline 14px (Loading/Taken/Available), submit primary blue-500 h-8; ItemQuickEditSheet 400px custom override title 'Chỉnh sửa · SKU' mono + V2 Dialog unsaved/409 conflict với amber warning box; /items page V2 h1 xl + Tạo mới primary sm + pagination h-9 ghost buttons; /items/[id] Breadcrumb 'Dashboard/Vật tư/SKU' + Name xl + Status + DropdownMenu Nhân bản/Khôi phục/Xoá destructive + Tabs V2 4 section underline neutral; /items/new max-w-4xl Breadcrumb + H1 xl + form card zinc-200 — *commits O 2e04900 + P 17e85b0 + Q 9604c43*
- [x] 2026-04-17 · **T9 Suppliers + Import Wizard V2:**
  - Commit S (6e920fd) — /suppliers list header H1 xl + Tạo mới sm, filter bar h-11 search + segmented 3-mode, table row h-9 no zebra, Eye/Pencil hover-reveal, EmptyState no-data/no-filter-match, pagination h-9; /suppliers/new Breadcrumb + H1 xl max-w-4xl; /suppliers/[id] Breadcrumb + header H1 xl + StatusBadge + Ngưng sm + Tabs V2 underline; SupplierForm max-w-[720px] p-6 rounded-lg, 2 section (Thông tin cơ bản + Liên hệ) divider uppercase 11px, input h-9 grid 2-col md, label uppercase variant + required red-500, tax_code font-mono, phone tabular-nums, address textarea min-h-72px, submit primary blue-500 + Cancel ghost. Props API SupplierFormProps GIỮ.
  - Commit T (87a0792) — ColumnMapperStep table row h-10 Select target h-8 (sm), badge Trùng #N amber-50/700 sm, synonym hint italic text-xs zinc-500, required/success banner red/emerald V2 tokens; ImportWizard 4-step stepper h-12 dot h-8 w-8 rounded-full active blue-500/done emerald-500 + check 14px/pending zinc-300 + connector line 2px, dropzone border-2 dashed active border-blue-500 bg-blue-50/30 (thay cta dead V1), preview table sticky header invalid row bg-red-50 border-l-2 cell bg-red-100, stats card emerald-700/red-700, Result CheckCircle2 48px emerald + H1 xl. /items/import page Breadcrumb + H1 xl card p-6.
  - Logic V1: BullMQ hooks useUploadItemImport/useCommitImport/useImportBatch + parseExcelPreview ExcelJS + mapping preset localStorage + synonym+Levenshtein autoMapHeaders intact.
- [x] 2026-04-17 · **T10 PWA Receiving V2:**
  - Commit V (44d582d) — BarcodeScanner card p-4 border zinc-200 rounded-md, camera aspect-[4/3] bg-zinc-900 rounded-sm (thay slate-900), scan feedback ring 3px emerald/red/amber 400ms (success/danger/dup) + shake 300ms danger, beep 880/220/660Hz, permission denied fallback amber-50/200/800 + Input h-11 tap target. GIỮ html5-qrcode lazy, USB wedge < 80ms/char pause 100ms, IME safe, CAMERA_DENIED_KEY, reduced-motion check, vibrate haptic. ScanQueueBadge bg-white border zinc-200 rounded-md shadow-sm px-3 py-2, count h-5 font-mono tabular-nums, offline tone amber-50/200/800 + WifiOff, Sheet md retry/delete events.
  - Commit W (3cb4f8c) — ReceivingConsole header h-12 border-b zinc-200 PO mono 13 + supplier + done/total, offline banner sticky top amber-50/200/800, 2-col tablet grid scanner+lines trái + aside Hướng dẫn nhanh phải (sticky top-16). PO lines row 36px hover bg-zinc-50 active bg-blue-50 done bg-emerald-50/40 badge Lô blue-50/700 sm. ConfirmDialog max-w-[400px] qty h-12 +/- buttons h-12 tablet friendly, lot conditional size lg, QC pill h-11 emerald/red OK/NG, footer Button size lg ≥44px. GIỮ Dexie FIFO, uuid-v7, hydrate qty, replay online, handleScan match SKU.
  - Commit X (b11447c) — /pwa/layout h-12 border zinc-200 Factory logo + "MES Xưởng" + user name xs + Thoát ghost h-8 (thay slate-200/50). /pwa home grid 1-col mobile / sm:grid-cols-2 Card Truck blue-50/600 link /pwa/receive/demo + Card History disabled V1.1. Auth JWT RSC redirect giữ.
  - Commit Y (pending) — audit slate/brand: BarcodeList + SupplierList migrate slate-200/50/100/500/600/700/900 → zinc-\*, hover:text-cta → hover:text-blue-600, hover:text-danger → hover:text-red-600. items/suppliers/import/pwa/scan/receiving CLEAN zero slate class.
- [x] 2026-04-17 · **T11 Final build local PASS + dashboard RSC fix** (move generateMockOrders/generateMockAlerts sang `apps/web/src/lib/dashboard-mocks.ts` server-safe, revert middleware DEMO_MODE bypass, pnpm build PASS exit 0, 22 routes) — *commit ccecea6*
- [x] 2026-04-17 · **Deploy V2 lên VPS hiện tại (123.30.48.215)** — backup pg_dump, tag v1-backup, prune build cache 9.5GB, SCP source V2 (1.2MB tar), rebuild image `hethong-iot:v2` (5fda721bcd3f, 1.65GB, **build 44 phút** trên HDD 2 vCPU), tag :v2 → :local, compose up --force-recreate app+worker, 12/12 smoke test PASS (health/login/me/dashboard 200 + render "Xin chào"/"SKU hoạt động"/"PO chờ nhận"/"Cảnh báo tồn kho" V2 content, items "Danh mục vật tư", suppliers "Nhà cung cấp", import/pwa/receive/login 200, worker ready, app no errors, HTTPS 307→/login expected + HTTP/3 Alt-Svc + CSP)
- [x] **🚀 V2 LIVE:** https://mes.songchau.vn — Dashboard hoạt động (fix RSC boundary bug V1), UI Linear-inspired zinc+blue font compact, image backup v1-backup (1da06320df69) sẵn sàng rollback nếu cần

- [x] **🚀 V1.1-alpha LIVE:** 2026-04-18 — BOM (list/new/tree editor dnd-kit/import wizard 5-step) + Admin (users/audit/settings change-password) + Receiving PWA real API. Image `hethong-iot:v1.1-alpha` (6463794488f7). Backup v2-backup sẵn sàng rollback.
  - Migration 0003 applied 4 file + 2 fix (0003b2 drop V1 bom_line, 0003b3 drop V1 bom_template với schema cũ product_item_id → recreate V1.1-alpha parent_item_id)
  - Docker build 7 phút (cache warm từ V2 build)
  - 10/10 smoke test PASS: health/login/dashboard với "Tạo BOM mới" quick link + BOM KPI card, /bom list "BOM Templates", /bom/new, /bom/import, /admin index + users + audit all 200, /api/bom/templates 200 (empty list OK), /api/admin/users 200 (admin user seeded), /api/po/demo-001 stub return 3 PO lines demo
  - Worker BullMQ 3 queue ready: item-import + **bom-import** + assembly-scan
  - 28 commits Phase A (DB+API) + Phase B1 (BOM UI) + Phase B2 (Admin+Receiving) + 2 migration fix

### Giai đoạn 6 — V1.1-alpha (2026-04-18) · BOM + Admin + Receiving

- [x] 2026-04-18 · **Phase A — DB + API backend** (branch `feat/v1.1-alpha-bom-admin-receiving`)
  - [x] A1 · Rewrite Drizzle schema `packages/db/src/schema/bom.ts`: bom_template (status enum, parentItemId, targetQty, metadata) + bom_line self-ref tree (parentLineId, level CHECK 1..5) + receiving_event (scan_id unique idempotent). Xoá bomRevision, sync FK order.ts + audit.ts. Typecheck PASS. *(commit a58d7bb)*
  - [x] A2 · Migration 0003 split 4 file:
    - `0003a_bom_enums.sql` (superuser) — CREATE TYPE app.bom_status + GRANT USAGE
    - `0003b_bom_tables.sql` — bom_template + bom_line self-ref + receiving_event với CHECK + UNIQUE scan_id
    - `0003c_bom_indexes.sql` — GIN trgm dùng `public.f_unaccent` (reuse 0002c) + trigger `fn_touch_updated_at`
    - `0003d_seed_demo.sql` — 4 role upsert + BOM `CNC-ABC-DEMO` 3 lines (idempotent)
    - `apply-sql-migrations.sh` pick_user recognize 0002c + 0003a as superuser
    - README.md document flow 0003 *(commit a5b74d2)*
  - [x] A3 · Repos TypeScript: `bomTemplates.ts` (list trgm, CRUD, loadTree CTE depth 5, cloneTemplate UUID map, softDelete→OBSOLETE), `bomLines.ts` (addLine cycle+level check, deleteLine cascade opt-in 409 HAS_CHILDREN, moveLine shift subtree level, countDescendants), `receivingEvents.ts` (insertEvent ON CONFLICT scan_id), `userAccounts.ts` (list+role filter, CRUD txn, changePassword argon2, resetPassword), `auditEvents.ts` (listAudit filter) *(commit 3868655)*
  - [x] A4 · Zod schemas shared: `schemas/bom.ts` (BOM_MAX_LEVEL=5, create/update/line CRUD/move/import commit), `schemas/receiving.ts` (batch ≤ 50 uuidv7 scan_id), `schemas/user.ts` (strong password + match confirm + diff old), index.ts + QUEUE_NAMES.BOM_IMPORT_COMMIT *(commit 89bf1d8)*
  - [x] A5 Commit E1 · 12 BOM endpoints: GET/POST /api/bom/templates, GET/PATCH/DELETE /[id], /check-code, /[id]/tree, /[id]/clone, /[id]/lines (POST), /[id]/lines/[lid] (PATCH/DELETE ?cascade=), /[id]/lines/[lid]/move. Role: any logged-in create, DELETE admin|planner, transition ACTIVE→OBSOLETE admin only *(commit b7d4c03)*
  - [x] A5 Commit E2 · 4 BOM import endpoints + worker: /upload (parse multi-sheet auto-detect header row 1/2 + auto-mapping synonym dict), /[id]/status, /[id]/commit (enqueue BullMQ), /[id]/errors.xlsx; worker `apps/worker/src/jobs/bomImport.ts` chunk 100/TX, tạo template per sheet, lookup item SKU, auto-create nếu autoCreateMissingItems *(commit ca854f0)*
  - [x] A5 Commit E3 · 7 Admin+Receiving+PO endpoints: /api/admin/users GET+POST + /[id] GET+PATCH (block self-deactivate), /api/auth/change-password, /api/admin/audit filter, /api/receiving/events batch 50 idempotent, /api/po/[id] stub 3 scenario demo/-small/-large else 404 *(commit 79380d6)*
  - Typecheck baseline 16 errors preserved (không regress). Tests baseline flaky ExcelJS stream (unrelated, reproducible trước commit).
- [x] 2026-04-18 · **Phase B1 — BOM UI (4 màn)**: list + new + detail tree dnd-kit + import wizard 5-step
  - [x] B1.1 · `useBom.ts` + `useBomImport.ts` hooks TanStack Query với optimistic move, debounced code check 300ms; `qk.bom.*` factory; install `@dnd-kit/core @dnd-kit/sortable @dnd-kit/modifiers @dnd-kit/utilities` *(commit fda93db)*
  - [x] B1.2 · Nav thêm "BOM" (Network icon, all users) + "Nhập BOM Excel" (admin/planner); EmptyState preset `no-bom` *(commit f272389)*
  - [x] B1.3 · `/bom` list page compact virtualize 36px row + `BomListTable` + `BomFilterBar` 3-mode segmented status + URL nuqs (q, statusMode, page, sort, sortDir) + keyboard `/jke Space Enter` + BulkActionBar + DialogConfirm "XOA" *(commit f7bda58)*
  - [x] B1.4 · `/bom/new` page + `BomForm` accordion 2-section (basic + parent/target) + `ItemPicker` Popover search SKU (dùng chung cho parent item + component) *(commit cc90f3f)*
  - [x] B1.5 Commit 1 · `BomTreeView` + `BomTreeNode` dnd-kit restrictToVerticalAxis + virtualize threshold 50 nodes + ancestorIds guard drop-vào-descendant + level icon + level badge + hover actions (add/edit/delete) *(commit 6a0eb1c)*
  - [x] B1.5 Commit 2 · `/bom/[id]` detail Tabs V2 2-tab (Linh kiện default / Metadata) + `BomLineInspector` Sheet right md (readonly + Sửa form) + `AddBomLineDialog` với ItemPicker + scrap default 0 + UoM auto-inherit + `DeleteBomLineDialog` cascade DialogConfirm "XOA" + Clone/Xoá BOM dropdown *(commit 5b568f1)*
  - [x] B1.6 Commit 1 · `BomImportWizard` 5-step (Upload → Select sheet → Map cột → Preview → Result) + `SheetSelectorStep` multi-select preview 3 rows + `BomColumnMapperStep` synonym BOM riêng (Standard Number→componentSku, ID Number→componentSeq, NCC→supplierItemCode, Quantity→qtyPerParent, Sub Category→description, Visible Part Size→size, note→notes) + tab switcher per-sheet mapping *(commit 1439212)*
  - [x] B1.6 Commit 2 · `/bom/import` page Breadcrumb + title + BomImportWizard *(commit 23261a0)*
  - [x] B1.7 · Dashboard KPI row lên 5 cột thêm `BomKpiCard` client wrapper (count ACTIVE từ useBomList meta.total); Quick links grid 5 actions bổ sung "Tạo BOM mới" + "Nhập BOM Excel" *(commit 05ffc31)*
  - Typecheck baseline 16 errors preserved; tests 15/15 PASS local.
- [x] 2026-04-18 · **Phase B2 — Admin (5 screens) + PWA Receiving wire-in real API**
  - [x] B2.1 · `hooks/useAdmin.ts` (useUsersList/useUserDetail/useCreateUser/useUpdateUser optimistic/useDeactivateUser/useAuditList) + `hooks/useChangePassword.ts` + qk factory extend `admin.users/audit/po.detail` *(commit fd55e65)*
  - [x] B2.2 · Nav item "Quản trị" icon Shield admin-only + `lib/role-guard.ts` (hasRole/isAdmin/parseRolesString) *(commit ab73274)*
  - [x] B2.3 · `/admin/layout.tsx` server-side check JWT+role admin else redirect('/') + `/admin/page.tsx` index 4 QuickLink card compact (Users count thật / Audit / Settings / Build info inline) *(commit 72b96f0)*
  - [x] B2.4 Commit 1 · `/admin/users` list (search/role/active filters nuqs) + table 36px compact với roles pill badges + `/admin/users/new` Accordion 2 section + TempPasswordDisplay 12-char crypto random + copy tooltip + UserForm reusable *(commit 408e0af)*
  - [x] B2.4 Commit 2 · `/admin/users/[id]` detail Tabs 2 (Thông tin edit + Nhật ký hoạt động reuse useAuditList({userId})) + DropdownMenu actions (Reset pass V1.2 stub + Vô hiệu hoá DialogConfirm "XOA") + optimistic cache update *(commit 9e3b76a)*
  - [x] B2.5 · `/admin/audit` filter bar (date range + entity multi-toggle + action multi-toggle + user search) + AuditRow với diff popover (before red / after emerald) + virtualize @tanstack/react-virtual khi >50 rows + Export CSV V1.2 stub *(commit 2bb337f)*
  - [x] B2.6 · `/admin/settings` ChangePasswordForm (show/hide eye + inline 3 rules validation + confirm match + auto logout redirect) + Build info section + Session V1.2 stub *(commit 3d09fad)*
  - [x] B2.7 Commit 1 · `/pwa/receive/[poId]` server component fetch `/api/po/[id]` thật + forward auth cookie + demo banner + error page khi PO not found + `hooks/useReceivingEvents.ts` (useReplayQueue + useReceivingHistory stub) *(commit f38a533)*
  - [x] B2.7 Commit 2 · `ReceivingConsole` replace setTimeout(600ms) fake replay bằng real POST `/api/receiving/events` sequential FIFO 500ms delay + idempotent handling (200 acked + 409 duplicate đều delete Dexie) + mutex replayingRef + sync progress sticky banner + toast success/warning/error + `ScanQueueBadge` retry-all button + badge color amber/red/emerald *(commit c549a67)*
  - Typecheck baseline 16 errors preserved (0 regression from new files); tests 14/15 PASS (1 pre-existing excelImport failure).
- [x] 2026-04-18 · **Phase C — Deploy V1.1-alpha VPS + smoke + tag `v1.1.0-alpha`** — SCP source V1.1-alpha (1.2MB), docker build runtime 7 phút (cache warm từ V2), migration 0003+0003b2+0003b3 apply VPS (drop V1 bom_template/bom_line flat schema + recreate V1.1-alpha tree self-ref), tag v2-backup rollback sẵn, compose up --force-recreate app+worker, 10/10 smoke PASS (/bom list + /bom/new + /bom/import + /admin + /admin/users + /admin/audit + /api/bom/templates + /api/admin/users + /api/po/demo-001 return 3 lines), worker 3 queue ready (item + bom + assembly), image `hethong-iot:v1.1-alpha` (6463794488f7), tag v1.1.0-alpha pushed
- [x] 2026-04-18 · **Phase D — Bug fix V1.1-alpha.1 (4 bugs user report LIVE)**
  - [x] D1 · BOM import smart header detection: scan 5 row đầu, pick row có keyword match cao nhất + nonEmpty ≥ 3; trả `headerRow` + `headerWarning` + `topTitle` về wizard UI hiển thị "Header đọc từ row N" + warning banner + preview positional array (fix mismatch `firstRows` dict vs `previewRows` array)
  - [x] D2 · Sidebar active state fix parent-child highlight trùng: `matchActive(pathname, href, allHrefs)` loại nested route dài hơn → chỉ item nested sâu nhất active
  - [x] D3 · `/receiving` hub trong (app) layout list 3 demo PO + CTA → `/pwa/receive/{poId}`; nav "Nhận hàng" chuyển `/pwa/receive` → `/receiving`
  - [x] D4 · `/orders/[code]` stub reuse `getMockOrderByCode` + info cards + V1.2 roadmap; `OrdersReadinessTable` row mặc định Link `/orders/{code}` với keyboard navigation
  - [x] D5 · Script `scripts/seed-bom-sample.mjs` + `scripts/generate-bom-seed-sql.mjs` (SQL pipe psql workaround Next standalone không include exceljs) idempotent parse sample xlsx → upsert 30 item stub DRAFT + upsert bom_template `CNC-238846-DEMO` (ACTIVE, target_qty 6) + reinsert 30 bom_line level=1 với metadata size + seq + NCC supplier_item_code
  - [x] D6 · Deploy V1.1-alpha.1 VPS: SCP 1.2MB source, tag v1.1-alpha-prev backup, docker build 7 phút (cache warm) image `hethong-iot:v1.1-alpha.1` (9290570b0f65), restart app+worker, 6/6 smoke PASS (/receiving NEW 200 + "Nhận hàng" + "PO-DEMO" content, /orders/SO-103 NEW 200 + "SO-103" content, /pwa/receive/demo-001 200, /bom + /bom/import 200), seed BOM `CNC-238846-DEMO` 30 linh kiện applied psql, BOM list API trả 2 BOM (seed + user-created "EWRWER")
  - Build local PASS (16 TS errors baseline preserved, 0 regression). Routes mới: `/receiving` (94 kB), `/orders/[code]` (103 kB). Tag **`v1.1.0-alpha.1`** pushed.

---

## 🚧 Các phase tiếp theo (roadmap từ 2026-04-18)

### V1.1-beta (1-2 tuần) — hoàn thiện BOM + Import stability + UX polish
- [x] 2026-04-17 · **M3 · Import BOM E2E + worker race fix** — `onConflictDoUpdate(target: item.sku)` trong `bomImport.ts` processChunk (tránh unique_violation khi 2 sheet cùng SKU mới). Worker `lockDuration: 60_000` (default 30s quá ngắn). Step 5 ResultPanel hiển thị error preview table 10 lỗi đầu + nút "Tải errors.xlsx" + nút "Thử lại" khi failed + EmptyState `no-data` khi rowTotal=0. `/api/bom/imports/[id]/status` trả thêm `errorPreview[]`. Synonym dict mở rộng (VN/EN: partnumber, materialcode, vendorcode, productname, spec, dimension, remark, ...) + 2-pass autoMapHeaders (exact/substring → Levenshtein fuzzy ≤ 2 với token ≥ 4 chars) để bắt typo "Describtion"→description. — *`apps/worker/src/jobs/bomImport.ts`, `apps/worker/src/index.ts`, `apps/web/src/components/bom-import/BomImportWizard.tsx`, `apps/web/src/hooks/useBomImport.ts`, `apps/web/src/app/api/bom/imports/[id]/status/route.ts`, `apps/web/src/server/services/bomImportParser.ts`*
- [x] 2026-04-17 · **M4 · BOM tree drag cross-parent 3-zone** — `BomTreeView.tsx` onDragOver capture pointerY vs over.rect: TOP 30% → insert-before (sibling trước cùng parent), MIDDLE 40% → drop-into (thành child, position = children+1), BOTTOM 30% → insert-after (sibling sau). Visual feedback: into=bg-blue-50+border-left-blue, before/after=bar absolute 0.5px blue. `DragOverlay` floating card SKU+name+level. Client guard cyclic (ancestorIds.includes) + depth (projectedLevel + subtreeDepth - 1 > BOM_MAX_LEVEL → toast). useMoveBomLine optimistic update parent+position, refetch level từ server onSettled. — *`apps/web/src/components/bom/BomTreeView.tsx`, `apps/web/src/hooks/useBom.ts`*
- [ ] BOM compare 2 templates side-by-side (diff viewer) — defer V1.2
- [ ] BOM export Excel ngược (xuất lại từ tree → .xlsx) — defer V1.2
- [x] 2026-04-17 · **M2 · Dashboard KPI → real data** qua `/api/dashboard/overview` (aggregate 3 COUNT + Redis cache 60s + React Query 60s stale + invalidate hooks trên items/bom/suppliers mutations). Fallback mock orders/alerts khi API lỗi. KPI placeholder `lowStockCount: null` chờ V1.2. — *`apps/web/src/app/api/dashboard/overview/route.ts`, `apps/web/src/server/services/redis.ts`, `apps/web/src/hooks/useDashboardOverview.ts`, `apps/web/src/app/(app)/page.tsx`*
- [x] 2026-04-17 · **M1 · Fix 16 TS baseline errors → 0** trong `/api/imports`, `/api/items`, `/api/suppliers`. Root-cause: `parseJson/parseSearchParams<T>` unify sai Input thay vì Output zod → đổi generic `<S extends z.ZodTypeAny>` với `z.output<S>`. + runtime guard `!row`/`!batch` cho `noUncheckedIndexedAccess`. + migration 0004 enum `audit_action` thêm UPLOAD + COMMIT. — *`apps/web/src/server/http.ts`, 5 route files, `packages/db/migrations/0004_audit_action_upload_commit.sql`*
- [x] 2026-04-17 · **M5 · Mobile responsive polish** — `useMediaQuery` hook SSR-safe qua `useSyncExternalStore` (default false, client hydrate tick đầu không mismatch) + `useIsMobile` / `useIsTablet` / `useIsBelowDesktop`. Tables `/bom`, `/items`, `/admin/users`, `/admin/audit` dùng CSS-first `hidden md:block` + grid-cols responsive (tránh hydration flicker). Mobile còn 3-4 col primary (code/name/status), md+ full cols. BomLineInspector mobile `side="bottom" size="lg"` (85vh drawer), desktop giữ side="right" size="md" (420px). AppShell hamburger drawer 280px + PWA receive h-12/size="lg" đã có từ V1.1-alpha (≥ 44px tap target verified). — *`apps/web/src/hooks/useMediaQuery.ts`, `apps/web/src/components/bom/{BomListTable,BomLineInspector,BomTreeView}.tsx`, `apps/web/src/components/items/ItemListTable.tsx`, `apps/web/src/components/admin/AuditRow.tsx`, `apps/web/src/app/(app)/admin/{users,audit}/page.tsx`*
- [ ] Unit test BOM state machine + tree mutation (target coverage 70%) — defer V1.2

**Deploy note 0004:** migration `0004_audit_action_upload_commit.sql` chưa apply local (không có docker dev) — cần chạy trên VPS lần deploy kế: `docker exec -i iot_postgres psql -U iot -d iot -f - < packages/db/migrations/0004_audit_action_upload_commit.sql`

### V1.2 (3-4 tuần) — Order + Procurement + Snapshot
- [ ] Order Entry: CRUD /orders module thật thay stub mock (schema app.sales_order đã có V1 foundation)
- [ ] PO tạo từ Order + link BOM snapshot
- [ ] Procurement module: PR (Purchase Request) → PO (Purchase Order) → ETA → receipt
- [ ] BOM Revision immutable RELEASE flow (DRAFT → RELEASED lock + new revision number)
- [ ] BOM Snapshot recursive CTE explode (1 order → N snapshot line với 9 cột qty)
- [ ] 10-state machine snapshot line: PLANNED → PURCHASING → INBOUND_QC → PROD_QC → AVAILABLE → RESERVED → ISSUED → ASSEMBLED → CLOSED
- [ ] Shortage Board aggregate by item (rollup multi-level)
- [ ] Nhận hàng real: link PO → receiving_event → inventory update (not just audit stub)

### V1.3 (3-4 tuần) — Production + WO + Assembly
- [ ] WO (Work Order) tạo từ snapshot release
- [ ] Assembly UI: scan component → confirm → advance state
- [ ] ECO (Engineering Change Order) apply flow: ECO approve → new BOM revision auto-create
- [ ] Reservation FIFO/FEFO policy per order priority
- [ ] Kho lot tracking + serial tracking end-to-end
- [ ] QC in-process checkpoint (chuẩn bị V1.4 QC plans)

### V1.4 (2-3 tuần) — Security + Audit UI + Polish
- [ ] RLS (Row-Level Security) policies Postgres theo role + entity ownership
- [ ] RBAC 12×12 matrix hoàn chỉnh (action × entity)
- [ ] Full audit UI: filter + diff + rollback stub + export Excel
- [ ] Session management UI (`/admin/settings` - xem sessions + revoke)
- [ ] Reset password workflow (admin reset + user via email)
- [ ] Rate limit login 5 lần/phút/IP
- [ ] Monitoring stack: Prometheus + Grafana + Loki (nếu scope cho phép)
- [ ] Backup cron automation + S3/R2 off-site
- [ ] Load test với 10k SKU + 100 concurrent user

### V2.0 (2-3 tháng) — Edge + Telemetry + Analytics
- [ ] Edge gateway Brother SPEEDIO S500X1 / CNC-C00 integration
- [ ] Machine telemetry real-time (OPC UA / MTConnect)
- [ ] OEE (Overall Equipment Effectiveness) tracking
- [ ] Lead-time learning từ history data
- [ ] Forecasting demand + material

### Infra optimization (song song)
- [ ] Migrate sang VPS SSD NVMe (Hetzner CX22 €4.51/tháng) — build time 30 phút → 8 phút
- [ ] GitHub Actions CI/CD build + push GHCR → VPS docker pull (2 phút thay 30 phút)
- [ ] Prune Docker cache định kỳ (currently 9.5GB)
- [ ] Backup schedule cron automation

---

## 🧱 Ràng buộc kỹ thuật (từ discussion)

| Hạng mục | Giá trị |
|---|---|
| Postgres internal port | ≠ 5432 (Song Châu đang dùng) → **dùng port nội bộ Docker network riêng**, không bind ra host |
| Redis internal port | ≠ 6379 (tương tự) |
| API port internal | ≠ 8000 |
| Frontend port internal | ≠ 3000 |
| Reverse proxy | **KHÔNG** dùng chung Nginx của Song Châu; dùng Caddy/Traefik riêng bind port khác HOẶC thêm vhost vào Nginx hiện tại theo cách **read-only include** |
| Subdomain | TBD — cần bạn cung cấp |
| Container name prefix | `iot_*` |
| Volume name prefix | `iot_*` |
| Docker network | `iot_app_net`, `iot_db_net` (không attach Song Châu) |
| Mount path trên host | `/opt/hethong-iot/` (không đụng `/opt/songchau*` hay vùng khác) |

---

## 📝 Changelog

| Ngày | Người/Agent | Tóm tắt |
|---|---|---|
| 2026-04-16 | Claude (main) | Khởi tạo workspace, copy 13 agents + commands, copy 2 file context, tạo PROGRESS.md |
| 2026-04-16 | Claude (full-stack cook) | **Foundation V1 (tuần 0-1):** pnpm monorepo (apps/web, apps/worker, packages/db, packages/shared) + Drizzle schema 20 bảng + seed role/admin + auth API (login/logout/me) + health/ready + Next.js 14 PWA skeleton với design tokens Industrial Slate + docker-compose + Caddyfile + Cloudflare Tunnel example + backup/health-check/migrate scripts + CI GitHub Actions. Còn lại: business module tuần 2+. |
| 2026-04-16 | Claude (infra update) | User confirm: **Postgres/Redis tách riêng** trong stack IoT (không share Song Châu), **chưa có domain** (truy cập qua `http://<VPS_IP>:8443`). Update `deploy/docker-compose.yml` thêm `iot_postgres` + `iot_redis` có healthcheck + mem_limit, siết `shared_buffers=256MB max_connections=25`. Update `deploy/.env.example`, `deploy/README.md`, `deploy/scripts/backup.sh` dùng `docker exec iot_postgres pg_dump`. |
| 2026-04-16 | Claude (brainstorm + plan + cook tuần 2) | **Tuần 2 — Item Master + Barcode + Supplier + Excel Import hoàn chỉnh.** Brainstorm 12 câu hỏi brutal honesty → 3 quyết định (TOOL+PACKAGING enum, SKU manual regex, import idempotency SHA-256). Plan 5 ngày × 2 dev. Cook: migration 0002 (pg_trgm+unaccent+import_batch), 20+ API endpoints (items CRUD + barcodes + suppliers + item-suppliers + imports wizard), BullMQ worker `item-import-commit` (chunk 500, skip/upsert/error), UI List virtualized + Edit Sheet + Import Wizard 3-step polling 2s, unit tests. 63 file mới tổng cộng. |
| 2026-04-17 | Claude (deploy bootstrap) | **VPS bootstrap + lần build đầu.** Đổi target từ VPS share Song Châu sang VPS dedicated `123.30.48.215` (2 vCPU/2GB/40GB Ubuntu 24.04). Plan agent đẻ ra `plans/deploy/260417-bootstrap-vps-dedicated.md`. Bootstrap: swap 4GB + Docker 29.4 + UFW. Viết `Dockerfile` multi-stage + `.dockerignore`. Fix code chạy được build prod: worker → tsx runtime (bỏ tsc compile vì rootDir conflict với workspace), regex escape next.config.js, shared/db schema bỏ `.js` extension, webpack `extensionAlias` map `.js→.ts`, conditional `output: standalone` (Windows symlink), dummy DATABASE_URL/JWT_SECRET cho Next build collect page data. Move project khỏi OneDrive → C:\dev (fix EBUSY). `pnpm build` PASS local; test shared 11/11, web 4/6 (2 fail exceljs Node 24 local, OK trên Node 20 Docker). |
| 2026-04-17 | Claude (go-live) | **🚀 LIVE: https://mes.songchau.vn**. Build VPS image v8 (273MB, 13 phút). Migrate qua `drizzle-kit generate` + psql (28 tables, do strict TUI prompt block tx mode). Seed admin `admin/ChangeMe!234`. Fix runtime: `lib/env.ts` regex bug DATABASE_URL workaround bằng hard-code .env, middleware Edge runtime cần `JWT_SECRET` inline (không qua _FILE), CSP gọn hơn trong Caddyfile. Setup domain `mes.songchau.vn` + Caddy auto Let's Encrypt cert (HTTP/2 + HTTP/3). Push code GitHub Andy-cods/he-thong-iot. Worker container tạm disable (pnpm symlinks). |
| 2026-04-17 | Claude (brainstorm UI/UX) | Spawn brainstorm agent đánh giá UI/UX hiện tại + 10 issue brutal honesty + 3 direction. User chốt **Direction B Refresh trung bình** (10-14 ngày): giữ palette Industrial Slate, thêm Dashboard + AppShell + CommandPalette + Receiving + PWA min, fix 3 P0 bug full-stack (env.ts regex, migration 0002, worker Dockerfile). Output `plans/redesign/260417-brainstorm.md`. Tiếp theo: plan + cook agents trong session mới (cwd = C:\dev\he-thong-iot). |
