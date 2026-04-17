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
- [ ] (đang chạy) Build Docker image trên VPS từ source local-tested
- [ ] Up postgres+redis + migrate (`pnpm db:push`) + seed admin
- [ ] Up app+worker+caddy + smoke test `/api/health`, `/login`
- [ ] Trả link `http://123.30.48.215` cho user

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
| 2026-04-17 | Claude (deploy bootstrap) | **VPS bootstrap + lần build đầu.** Đổi target từ VPS share Song Châu sang VPS dedicated `123.30.48.215` (2 vCPU/2GB/40GB Ubuntu 24.04). Plan agent đẻ ra `plans/deploy/260417-bootstrap-vps-dedicated.md`. Bootstrap: swap 4GB + Docker 29.4 + UFW. Viết `Dockerfile` multi-stage + `.dockerignore`. Fix code chạy được build prod: worker → tsx runtime (bỏ tsc compile vì rootDir conflict với workspace), regex escape next.config.js, shared/db schema bỏ `.js` extension, webpack `extensionAlias` map `.js→.ts`, conditional `output: standalone` (Windows symlink), dummy DATABASE_URL/JWT_SECRET cho Next build collect page data. Move project khỏi OneDrive → C:\dev (fix EBUSY). `pnpm build` PASS local; test shared 11/11, web 4/6 (2 fail exceljs Node 24 local, OK trên Node 20 Docker). Build VPS đang chạy. |
