# WORKLOG V1.7 — Design Refresh + Cleanup + Perf

> Append-only log cho multi-agent handoff (Codex + Claude + future agents).
> **Rule:** KHÔNG edit block cũ, chỉ append block mới ở cuối file.
>
> Mỗi session phải để lại 1 block format chuẩn (xem template đầu tiên).
> Agent tiếp theo chỉ cần đọc 3 file để pick up: WORKLOG này + PROGRESS.md + CLAUDE.md.

---

## 2026-04-21 · Claude · V1.6 baseline complete + handoff Codex V1.7

**Goal:** V1.6 BOM-Centric Workspace LIVE tại https://mes.songchau.vn · handoff context cho Codex bắt đầu V1.7 (design refresh + cleanup + perf).

**Changed:** Xem PROGRESS.md section V1.6 (40 file, 11 commit từ `8173853` merge → `ef7d712` tag `v1.6.0`).

**Decisions (quan trọng cho agent sau):**
- **BOM-centric Pattern B** (Contextual Sidebar) — khi vào `/bom/[id]/*` thì global sidebar thu 56px icon-only, ContextualSidebar 220px hiển thị context BOM. Detect qua `matchBomWorkspace(pathname)` trong `lib/contextual-nav.ts`.
- **10-state snapshot color V1.6** — xem `StatusBadge.tsx` variants `snapshot-{planned|purchasing|inbound-qc|available|reserved|in-production|prod-qc|issued|assembled|closed}`. Mỗi state distinct icon + hue cho color-blind safety.
- **Deploy CI/CD** qua GitHub Actions → GHCR → SSH VPS (KHÔNG build VPS nữa). Workflow `.github/workflows/deploy.yml` trigger push main.
- **Argon2 native binary** COPY explicit trong Dockerfile runtime stage (Next standalone skip `.node` prebuilds cho native module qua pnpm symlink). Line 66-68 Dockerfile — nên fix đúng ở `next.config.js` `experimental.outputFileTracingIncludes` V1.7.
- **Summary query** dùng negative filter `wo.status NOT IN ('COMPLETED','CANCELLED')` thay positive filter (tương thích cả enum V1.2 cũ VPS lẫn V1.3 mới code). Xem `apps/web/src/app/api/bom/templates/[id]/summary/route.ts`.

**Skipped (defer V1.6.1):**
- Procurement (PR/PO) filter `?bomTemplateId` — cần JOIN chain `pr_line → bom_snapshot_line → sales_order`. Complex, impact index cần migration 0009.
- Mobile drawer cho ContextualSidebar (`<md` breakpoint).
- Migration 0006a ALTER `work_order_status` +QUEUED/PAUSED trên VPS (cần superuser, risk rewrite table).

**Verify:**
- `pnpm -r typecheck` — 0 new error (4 pre-existing `purchaseOrders.ts` preserved)
- `pnpm -r build` — PASS exit 0 (9 sub-route V1.6 bundle 2.8-8.9 kB)
- `pnpm --filter @iot/shared test` — 235/236 PASS (fix RBAC 13→14 entity test)
- `bash tests/smoke/v1.6-smoke.sh` — **39/39 PASS** 🎉
- Image size: 1.85GB → 678MB (giảm 63% nhờ BuildKit cache mode=max + stage 4 cleanup)

**Next cho Codex V1.7 (xem prompt step-by-step anh Hoạt đã nhận):**
1. **Step 1: UI/UX Audit** → `plans/v1.7/ui-ux-audit.md` — top 15 issue theo priority, không code
2. **Step 2: Duplication Audit** → `plans/v1.7/duplication-report.md` — 10 cluster trùng lặp, đề xuất extract primitive
3. **Step 3: Performance Audit** → `plans/v1.7/perf-audit.md` — bundle size + slow query + Lighthouse
4. **Step 4: Design Spec** → `plans/v1.7/design-spec.md` — based on step 1+2
5. **Step 5: Refactor + Cleanup** — extract CompactListTable / BomWorkspacePageHeader / getStatusBadgeMeta / apiFetch wrapper
6. **Step 6: Perf Optimization** — migration 0009 indexes, React.memo, dynamic import
7. **Step 7: UI Implementation** — redesign 5 page chính theo spec
8. **Step 8: Test + Deploy + Tag v1.7.0**

**Commits:** `8173853` (merge V1.6) → `c6766c3` (RBAC fix + PROGRESS) → `266658b` (smoke script) → `e6c5168` (Dockerfile lockfile) → `dfc7525` (ci.yml pnpm ver) → `350f70c` (OOM heap 4096) → `0490342` (argon2 prebuilds) → `1989d7c` (summary enum) → `ef7d712` (PROGRESS LIVE + tag `v1.6.0`)

**Blockers & nợ kỹ thuật:**
- Migration 0006a chưa apply VPS → summary query hiện workaround negative filter. V1.7 nên: hoặc apply migration (downtime ~30s) hoặc giữ workaround.
- next.config.js `outputFileTracingIncludes` chưa config cho argon2 prebuilds → Dockerfile COPY workaround. V1.7 nên config đúng để giảm fragility.
- 2 pre-existing test fail `excelImport.test.ts` trên Node 24 local (OK Node 20 Docker) — không critical.
- 4 pre-existing typecheck error `purchaseOrders.ts` (receivedAt/updatedAt/unit/lineTotal không tồn tại trên schema) — cần align schema Drizzle vs repo code.

**Environment snapshot:**
- VPS: `45.124.94.13` · Ubuntu 24.04 · 4 vCPU Xeon E5-2630 v4 · 8GB RAM · 60GB SATA SSD · `/opt/hethong-iot/`
- Image LIVE: `31db30384c2d` (post-tag build) — xác nhận qua smoke 39/39 PASS lần nữa
- Containers healthy: iot_caddy / iot_app / iot_worker / iot_postgres / iot_redis
- Postgres: user `hethong_app` · db `hethong_iot` · enum `public.work_order_status` = `{DRAFT,RELEASED,IN_PROGRESS,COMPLETED,CANCELLED}`

---

<!-- Codex V1.7 Step 1 block sẽ bắt đầu từ đây -->
