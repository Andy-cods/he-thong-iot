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

## 2026-04-21 · Codex · Step 1 + Step 2 audit

**Goal:** Audit UI/UX hiện tại (Step 1) + Duplication audit (Step 2) — không code, chỉ sinh tài liệu.

**Changed:**
- `plans/v1.7/ui-ux-audit.md` — top 15 issue theo priority + kiểm thử buttons Grid Editor
- `plans/v1.7/duplication-report.md` — 10 cluster trùng lặp + thứ tự refactor đề xuất

**Decisions:**
- Grid Editor là điểm quyết định cảm giác "chuyên nghiệp" — nên làm trung tâm redesign V1.7
- Mobile contextual nav bị mất ở `<md` → xếp P0
- Undo Grid Editor capture snapshot SAU edit → đây là lỗi nghiệp vụ thật sự, không phải polish
- Recursive grid hierarchy: `buildWorkbookFromTemplate` chỉ flatten root + direct children, BOM sâu > 2 level bị mất → P0
- 4 refactor ưu tiên Step 5: `apiFetch<T>()`, `getStatusBadgeMeta`, `BomWorkspacePageHeader`, `ListPaginationFooter`

**Skipped:**
- Không benchmark BOM 500-line FPS vì production chưa có BOM đủ lớn (max ~30 dòng quan sát)
- Không chạy browser automation screenshot vì runtime không expose Playwright ổn định

**Verify:**
- Đã đọc: dashboard / BOM workspace layout / 9 sub-route / BomTreeView / ContextualSidebar / StatusBadge / OrderListTable / bom-grid/*
- Xác minh live read-only: health 200 / login admin OK / BOM list OK

**Next cho agent implementation (Step 3-8):**
- Ưu tiên P0 trước: mobile contextual nav, recursive grid flatten, undo logic
- Step 4 `design-spec.md` dựa trên ui-ux-audit.md Grid Editor requirements

**Commits:** (audit docs chưa commit — đợi agent sau gom batch)

**Blockers:**
- Không có BOM 500-line trên live để verify tree UX scale
- Playwright runtime không khả dụng trong session Codex

---

## 2026-04-21 · Claude · V1.7-alpha Grid làm default + recursive + Undo + polish

**Goal:** User feedback "design để bảng grid làm mặc định, đẹp chuyên nghiệp + đủ cột Excel + test buttons". Implement nhanh P0 từ ui-ux-audit.md.

**Changed:**
- `apps/web/src/app/(app)/bom/[id]/page.tsx` — replace tree detail → `redirect('/bom/[id]/grid')` (Next server redirect)
- `apps/web/src/app/(app)/bom/[id]/tree/page.tsx` NEW — copy nguyên nội dung page.tsx cũ để giữ access tree view
- `apps/web/src/lib/contextual-nav.ts` — entry đầu "Bảng Grid" (LayoutGrid icon, href `/bom/[id]/grid`) + "Cây linh kiện" (Network icon, href `/bom/[id]/tree`). Bỏ "Tổng quan" cũ. "Lịch sử" chuyển divider.
- `apps/web/src/lib/bom-grid/build-workbook.ts`:
  - Fix P0 recursive flatten DFS theo childrenMap (mọi depth 1→5)
  - Indent SKU theo depth (3 space × depth) giữ hệ phân cấp trong grid phẳng
  - Polish styles: Inter cho text, JetBrains Mono cho SKU/số/percent/formula
  - Header zinc-50 + border-b zinc-900 đậm (thay nền đen trắng cũ — kiểu Linear/Vercel)
  - Group row indigo-50 + indigo-700 (thay xám — phân biệt với band)
  - Column width expand (2: 240→280, 1: 90→110, 10: 240→260, 8: 85→92)
  - Row height 26→28, title row 36→40, header row 30→32
- `apps/web/src/app/(app)/bom/[id]/grid/page.tsx`:
  - Fix Undo: capture `prevSnapRef` TRƯỚC mutation (thay vì gridRef.save() sau debounce)
  - Seed prevSnapRef từ initialSnapshot khi load
  - Header redesign: code mono + name inline + parent qty font-mono + OBSOLETE badge ring-1 + hint copy "Tổng SL = SL/bộ × parent"
  - Save indicator fallback `updatedAt` template khi chưa save session này (thay "Chưa lưu" mặc định gây hiểu lầm)
  - Replace "Quay lại" button (loop redirect `/bom/[id]` → grid) → "Xem cây" link `/tree`

**Decisions:**
- Grid mặc định, tree giữ làm view phụ truy cập qua sidebar item "Cây linh kiện"
- Recursive DFS giữ order parent→children theo level+position từ server, SKU indent chỉ dùng visually không ảnh hưởng logic
- Font stack Univer dùng `ff` property trong style — inject Inter + JetBrains Mono qua IStyleData, không cần global CSS override
- Undo timing: push `prevSnapRef` vào stack NGAY khi onEdit fire (không chờ debounce), mutate mới update `prevSnapRef.current = snap` sau khi save thành công
- KHÔNG làm 11-cột mới từ scratch — giữ 11 cột canonical cũ (đã khớp audit: Ảnh/Mã/Tên/Loại/Vật liệu/NCC/SL/Kích thước/Tổng/Hao hụt/Ghi chú), chỉ polish style

**Skipped (V1.7-beta defer):**
- Mobile contextual drawer (4h effort, scope riêng)
- Toolbar Univer custom hoá (cần Univer plugin API riêng)
- Ảnh column hiển thị thumbnail (cần upload pipeline riêng)
- Tree view font refresh (tree vẫn V1.6 style vì user chủ yếu dùng grid)

**Verify:**
- `pnpm --filter @iot/web typecheck` — 0 new error (4 pre-existing purchaseOrders preserved)
- `pnpm --filter @iot/web build` — chạy background, pending khi viết block này

**Next:**
- Build OK → commit + push → wait CI deploy → smoke test (target 39/39 + verify `/bom/[id]` redirect 307→/grid → 200, `/bom/[id]/tree` 200, grid render đúng font)
- V1.7-beta: Codex Step 3 (Performance Audit) và/hoặc Step 4 (Design Spec) dựa trên ui-ux-audit + duplication-report
- Mobile contextual drawer (Codex Step 7 UI Implementation)

**Commits:**
- `df0da84` feat(bom/grid): V1.7-alpha Grid default + recursive + Undo + polish
- `fb96de1` fix(bom/redirect): Next 14.2 params sync (không Promise)

**Verify final:**
- Image LIVE: `7ace85add83b` (post-fb96de1)
- `/bom/[id]` → 307 redirect → `/bom/[id]/grid` (correct, follow-redirect final 200)
- `/bom/[id]/tree` → 200 (route mới, build output confirmed)
- `tests/smoke/v1.7-smoke.sh` NEW — 41/41 PASS (+2 assertion vs V1.6: redirect + tree)
- V1.6 smoke 38/39 pass (1 fail vì expect /bom/[id]=200 outdated → V1.7 smoke thay thế)

**Blockers:** none tại thời điểm này

---

## 2026-04-21 · Claude · V1.7-beta integrated workspace brainstorm

**Goal:** Nhận feedback LIVE của anh Hoạt 3 điểm: (1) tự chốt Q1-Q5 kind-routing, (2) gộp 9 sub-routes vào Grid page theo ý "sidebar chỉ phụ theo BOM list", (3) redesign UI/UX toàn diện không chỉ column width. Output brainstorm chốt quyết định thay user.

**Changed:**
- `plans/v1.7/integrated-workspace-brainstorm.md` NEW — 8 section:
  1. Chốt Q1-Q5 (silent override, giữ override, ghi nhận route beta.1 + auto cost GA, snapshot+link PR, prompt xác nhận fab→com)
  2. Unified workspace → Pattern B (Grid + Bottom Panel h-9 tabs) + chip KPI Topbar
  3. Bỏ ContextualSidebar, thêm BomWorkspaceTopbar h-12, global sidebar 220px full-label giữ
  4. Redesign Grid visual polish + Bottom panel + Side Sheet quy trình + typography + motion
  5. 7 module phụ: 6 tab bottom panel + 1 drawer history, effort ~19h
  6. Roadmap 3 phase: beta (3-4d) + beta.1 (3-4d) + GA (5-7d) = 11-15d
  7. 2 open question blocker (scope refactor CompactListTable + permalink sub-routes)
  8. Deliverable + rủi ro Univer dataValidation

**Decisions (quan trọng cho planner pick up):**
- **Pattern B (Bottom Panel) là kiến trúc CHỐT** — Grid chiếm 65-70% viewport luôn visible, bottom panel h-9 tabs + resize drag + collapse persist localStorage
- **BomWorkspaceTopbar h-12** thay thế ContextualSidebar 220px — KPI chips inline click = activate panel tương ứng
- **Global sidebar 220px giữ full-label** cho UX nhất quán toàn app (bỏ thu gọn icon-only 56px khi vào workspace — V1.6 pattern deprecated)
- **Side Sheet quy trình width 480px**, Radix dialog backdrop zinc-900/40, 2 tab shadcn Thương mại/Gia công
- **Kind dropdown** dùng Univer `IDataValidation` list (A approach từ brainstorm cũ), persist `metadata.kind` JSONB
- **Silent override + badge "⚠ override"** — không prompt khi đổi kind (Q1)
- **History → drawer right 480px** mở qua menu ⋯ Topbar, KHÔNG phải tab bottom panel (log dài, timeline vertical)

**Skipped (defer):**
- Sketch mockup UI — auto-mode brainstorm đủ chi tiết, ui-ux-designer optional nếu anh Hoạt tin plan
- Nghiên cứu `react-resizable-panels` library — để planner-researcher verify khi viết implementation plan
- Decision migration 0009 index procurement chain — thuộc Phase 3 GA, chưa urgent

**Verify:**
- Đã đọc: `plans/v1.7/kind-routing-brainstorm.md`, `plans/v1.7/ui-ux-audit.md`, `plans/v1.7/duplication-report.md`, WORKLOG hiện tại, `apps/web/src/lib/contextual-nav.ts`, `apps/web/src/components/layout/ContextualSidebar.tsx`
- Word count: ~2100 từ (trong khoảng 1500-2500 yêu cầu)

**Next:**
1. Anh Hoạt duyệt brainstorm + trả lời 2 blocker question (scope refactor CompactListTable + permalink sub-routes)
2. Hand off `planner` viết implementation plan chi tiết V1.7-beta Phase 1 (layout refactor + column tuning + kind dropdown) với file-level breakdown + test plan
3. `planner-researcher` verify Pattern B resize library (react-resizable-panels vs custom)
4. Cook Phase 1 theo plan — deadline 2026-04-25

**Commits:** (chờ anh Hoạt duyệt trước khi commit — tránh lock-in quyết định quan trọng)

**Blockers:**
- Cần anh Hoạt trả lời 2 blocker question ở section 7 của brainstorm trước khi planner có thể viết implementation plan chi tiết
- Univer `IDataValidation` fill-down 20 dòng chưa verify — cần test thực tế ở Phase 1; có backup Shadcn Select overlay nếu fail

---
