# Redesign V3 — Implementation Plan (Phương án C — Hybrid lean)

**Ngày:** 2026-04-25
**Tác giả:** planner agent
**Phương án chốt:** C — Hybrid lean (xem `plans/redesign-v3/brainstorm.md` §3)
**Base branch:** `main` (V1.4 LIVE, V1.5 đang build)
**Target release:** **V2.0** sau 8 tuần (Phase 1 = 3 tuần + Phase 2 = 5 tuần)
**Tham chiếu:** `brainstorm.md` (chốt 10 quyết định Q1-Q10), `PROGRESS.md` convention, `plans/v1.7/v1.7-beta-plan.md` style.

---

## 1. Tóm tắt 1 trang

### 1.1. Mục tiêu cuối — V2.0 (sau 8 tuần)
Trạng thái production sau khi merge V2.0:
- Sidebar gom theo **4 bộ phận** (Kho / Mua bán / Kỹ thuật / Kế toán) thay vì 3 group function-based hiện tại.
- Trang Tổng quan `/` thay redirect — 6 progress bar drilldown + reuse `KpiCard` + `OrdersReadinessTable`.
- **Tickbox receiving per-line** trong PO detail tự cập nhật `bom_snapshot_line.received_qty`.
- **Excel BOM importer V2** đọc đúng file thực tế 58 line (3 sheet + master vật liệu/quy trình).
- **Schema delta** cho `material_master`, `process_master`, `item.dimensions/weight/material_code`, `bom_line.position_code`, `bom_line_note`, `wo.delayed_until`, `payment_log`.
- **WO approval workflow** copy pattern PO V1.9 (`metadata.approvalStatus`).
- **Bộ phận Kế toán phase 1**: payment log + báo cáo công nợ NCC.

### 1.2. 4 deliverable Phase 1 (Quick wins, 3 tuần, KHÔNG đụng schema)

1. **D1** — Sidebar regroup 5 section (4 bộ phận + Khác). Item Kế toán "Coming soon" disabled.
2. **D2** — Trang Tổng quan `/` với 6 progress bar + 4 KPI card + bảng Orders Readiness + Alerts + drilldown qua route filter.
3. **D3** — Tickbox receiving per-line trong `/procurement/purchase-orders/[id]` → tạo `inbound_receipt` + `inbound_receipt_line` + cập nhật `bom_snapshot_line.received_qty` trong 1 transaction.
4. **D4** — Excel BOM importer V1 (wizard 3 bước) đọc file mẫu thực tế `Bản chính thức 20260324_*.xlsx`, lưu cột thiếu vào `item.specJson` tạm chờ Phase 2 migrate.

### 1.3. 6 deliverable Phase 2 (Schema + module mới, 5 tuần)

1. **D5** — Migration `0017_material_process_master.sql` + admin UI CRUD `/admin/materials` + `/admin/processes` (seed 25 record từ Excel sheet 3).
2. **D6** — Migration `0018_item_dimensions_weight.sql` + `0019_bom_line_position_code.sql` + backfill scripts từ `specJson` → cột mới.
3. **D7** — Excel BOM importer V2 (đầy đủ): map material_code, dimensions, weight_g, position_code, notes, auto-link master.
4. **D8** — Migration `0020_bom_line_note.sql` (audit trail) + UI note timeline + PR-from-BOM bulk-create từ BOM grid.
5. **D9** — Migration `0021_wo_approval_delay.sql` + UI WO approval workflow (`metadata.approvalStatus`) + nút "Trì hoãn" + due-date mới.
6. **D10** — Migration `0022_payment_log.sql` + workspace `/accounting` (PO payment status, payment log form, báo cáo công nợ NCC aging).

### 1.4. Yêu cầu input từ user — 5 câu §8 brainstorm

| # | Câu hỏi | Default đề xuất | Trạng thái |
|---|---|---|---|
| Q1 | Multi-level approval PR/PO/WO? | 1 cấp (admin) phase 1, mở multi-level phase 2 nếu cần | **BLOCKER nhẹ** (default OK ship được) |
| Q2 | Kế toán phase 1 scope (VAT/MISA)? | Chỉ payment log + công nợ NCC. Không VAT/MISA | **BLOCKER cứng D10** — cần xác nhận scope trước Sprint 8 |
| Q3 | Migrate file Excel BOM cũ? | Chỉ áp dụng file mới từ Phase 2. File cũ giữ `specJson` | **Default OK** |
| Q4 | Note 1/2/3 ngữ cảnh ai ghi? | Mọi role ghi, append-only, không mention | **Default OK** |
| Q5 | Mobile/PWA priority + scan barcode? | PWA web-only, không offline, không scan barcode | **Default OK** |

**Quy tắc xử lý BLOCKER:** nếu user không trả lời Q2 trước Sprint 8 (tuần 8), `project-manager` agent escalate qua chat user. Trong khi chờ, vẫn build payment_log + aging report theo default — đây là việc tối thiểu chắc chắn cần.

---

## 2. Phase 1 — Quick wins (3 tuần)

### Sprint 1 (Tuần 1) — Sidebar regroup + Dashboard skeleton

**Goal:** User login → thấy sidebar 5 section (4 bộ phận + Khác), trang Tổng quan `/` load với 6 progress bar real data từ `bom_snapshot_line`.

**Owner agent chính:** `ui-ux-developer`. Hỗ trợ: `ui-ux-designer` (T2 design tokens dashboard), `tester` (smoke).

#### Task P1-S1-T1 — Refactor `nav-items.ts` thành 5 section

- **Title:** Đổi `NavSection` enum + map item theo bộ phận.
- **Description:** Thay `NavSection = production | inventory | other` thành `dashboard | warehouse | purchasing | engineering | accounting | other`. Map lại tất cả item theo bảng §9.2 brainstorm. Thêm item "Tổng quan" (`/`) icon `LayoutDashboard` ở section `dashboard`. Thêm item "Bộ phận Kế toán" (`/accounting`, disabled, comingSoon "Sắp ra mắt phase 2") ở section `accounting`. Update `NAV_SECTION_LABEL` + `NAV_SECTION_ORDER`. Bảo toàn `filterNavByRoles()` + `groupNavBySection()` API hiện có.
- **File paths:**
  - `apps/web/src/lib/nav-items.ts` (MODIFY toàn bộ file ~210 dòng)
  - `apps/web/src/components/layout/Sidebar.tsx` (verify không cần đổi — đã group dynamic theo `groupNavBySection()`)
  - `apps/web/src/lib/__tests__/nav-items.test.ts` (NEW nếu chưa có — kiểm tra `groupNavBySection()` trả 5 group đúng order)
- **DoD:**
  - `pnpm typecheck` + `pnpm lint` 0 error trong `apps/web`.
  - `pnpm build` PASS local.
  - Login admin → sidebar render 5 group: Tổng quan / Bộ phận Kho / Bộ phận Mua bán / Bộ phận Kỹ thuật / Bộ phận Kế toán (disabled mờ) / Khác.
  - Click 12 item active → không 404, không console error. Click "Bộ phận Kế toán" → cursor not-allowed + tooltip "Sắp ra mắt phase 2".
  - Filter role: login warehouse-only → chỉ thấy section Kho + Khác (không thấy section Kế toán/Kỹ thuật trừ item public).
- **Estimate:** 6h.
- **Owner agent:** `ui-ux-developer`.
- **Dependencies:** none.
- **Risk:** Sidebar render lỗi khi 0 item match role → giải quyết bằng `groupNavBySection()` filter empty group (đã có).

#### Task P1-S1-T2 — Trang Tổng quan `/` thay redirect

- **Title:** Build dashboard tổng quan với 6 progress bar + reuse KpiCard + OrdersReadinessTable + drilldown route filter.
- **Description:** Thay redirect `/` → `/bom` bằng dashboard page mới. Tái dùng `KpiCard`, `OrdersReadinessTable`, `AlertsList`, `SystemHealthCard` từ `components/domain/`. Build 2 component mới: `ProgressBarStack` (6 thanh ngang) và `ProgressBarCard` (1 card chứa 1 thanh). 6 thanh: Linh kiện / Lắp ráp / Mua bán / Đặt hàng / Nhận hàng / Báo giá. Click thanh → Next.js Link sang module gốc với query filter pre-applied (vd "Mua bán 75%" → `/procurement/purchase-orders?status=PENDING`). API mới `/api/dashboard/overview-v2` aggregate `bom_snapshot_line.state` per-state. Cache Redis 30s qua `cacheGetJson`/`cacheSetJson` trong `apps/web/src/server/services/redis.ts`.
- **File paths:**
  - `apps/web/src/app/(app)/page.tsx` (MODIFY — replace `redirect('/bom')` thành React component render dashboard)
  - `apps/web/src/components/dashboard/ProgressBarStack.tsx` (NEW ~100 dòng)
  - `apps/web/src/components/dashboard/ProgressBarCard.tsx` (NEW ~60 dòng)
  - `apps/web/src/app/api/dashboard/overview-v2/route.ts` (NEW ~250 dòng — aggregate query 6 thanh + reuse cache pattern v1)
  - `apps/web/src/hooks/useDashboardOverviewV2.ts` (NEW — TanStack Query hook)
  - `apps/web/src/components/domain/KpiCard.tsx` (REUSE, không đổi)
  - `apps/web/src/components/domain/OrdersReadinessTable.tsx` (REUSE, không đổi)
  - `apps/web/src/components/domain/AlertsList.tsx` (REUSE, không đổi)
  - `apps/web/src/server/services/redis.ts` (REUSE, không đổi)
- **DoD:**
  - Login → thấy dashboard render <1s tại VPS production (cache hit).
  - 6 progress bar hiển thị đúng % so với count thủ công SQL trong staging DB (`SELECT state, count(*) FROM app.bom_snapshot_line GROUP BY state`).
  - Click thanh "Mua bán 75%" → navigate sang `/procurement/purchase-orders?status=PENDING` filter pre-applied.
  - Cache Redis hit rate ≥ 80% sau 5 phút warm-up (verify bằng `redis-cli MONITOR | grep dashboard:overview:v2`).
  - Empty state OK khi DB chưa có `bom_snapshot_line` (return 0% mọi thanh, không crash).
- **Estimate:** 18h (thiết kế 4h + API 6h + component 5h + test/polish 3h).
- **Owner agent:** `ui-ux-developer` (lead) + `ui-ux-designer` (review tokens).
- **Dependencies:** P1-S1-T1 (nav order — dashboard ở top).
- **Risk:** Aggregate query chậm khi `bom_snapshot_line` >50k row. Mitigate: index `idx_snapshot_line_state` đã có trong `0005e_indexes_mv.sql`, cache 30s.

#### Task P1-S1-T3 — Smoke test + commit + tag `v2.0-p1-w1`

- **Title:** Test E2E sprint 1 + viết smoke script + tag git.
- **Description:** Viết smoke shell script `tests/smoke/v2-p1-w1.sh` test 8 case: login → GET `/` 200 → GET `/api/dashboard/overview-v2` 200 → 6 thanh có data → click thanh navigate đúng → sidebar 5 group → role filter warehouse OK → role filter admin OK → cache hit 2nd request. `git-manager` agent commit + tag.
- **File paths:**
  - `tests/smoke/v2-p1-w1.sh` (NEW)
  - `PROGRESS.md` (MODIFY — thêm dòng `[x] 2026-XX-XX · Sprint 1 V2.0-Phase1-W1 · ...`)
- **DoD:**
  - Smoke 8/8 PASS local + staging.
  - Tag `v2.0-p1-w1` push origin.
  - PROGRESS.md updated.
- **Estimate:** 4h.
- **Owner agent:** `tester` + `git-manager`.
- **Dependencies:** P1-S1-T1, P1-S1-T2.
- **Risk:** Smoke script flaky do cache TTL → mitigate: gọi `redis-cli DEL dashboard:overview:v2` trước test cold-path.

**Test plan Sprint 1:**
- Unit: `nav-items.test.ts` test `groupNavBySection()` trả 5 group đúng order.
- E2E manual: 1 admin + 1 warehouse-only login → screenshot đối chiếu.
- API: curl `/api/dashboard/overview-v2` 200 với data đúng schema.
- Performance: dashboard load <1s p95 (5 lần đo) trên VPS.

**Release criteria Sprint 1 (tag `v2.0-p1-w1`):**
- All 3 task DoD pass.
- `pnpm test` baseline coverage không giảm.
- CI green tại GitHub Actions.
- Smoke 8/8 PASS staging clone.
- Backup `pg_dump iot > backup-pre-w1.sql` trước deploy.

**Sprint 1 effort:** 28h ≈ 3.5 ngày.

---

### Sprint 2 (Tuần 2) — Tickbox receiving + Excel BOM importer V1

**Goal:** Operator kho tick checkbox per-line trong PO detail → DB tự tạo `inbound_receipt_line` + cập nhật `received_qty`. Engineer upload file Excel BOM thật → tạo BOM template với 58 line.

**Owner agent chính:** `ui-ux-developer` + `planner` (review service layer).

#### Task P1-S2-T1 — Tickbox receiving per-line trong PO detail

- **Title:** Component `PoLineReceivingTickbox` + service `receiveLines()` tạo inbound_receipt + line trong 1 transaction.
- **Description:** Trong trang `/procurement/purchase-orders/[id]`, mỗi `purchase_order_line` thêm cột "Đã nhận?" tickbox + input số lượng (default = `orderedQty - receivedQty`). User tick N line + bấm "Lưu nhận hàng" → POST batch endpoint. Service layer mở 1 transaction:
  1. Tạo 1 row `inbound_receipt` (receipt_no auto `RC-YYYYMMDD-XXXX`, qcFlag default `PASS`).
  2. Loop tick line → tạo `inbound_receipt_line` (poLineId, receivedQty, lotCode optional null, locationBinId optional default `WH-01.PENDING.A1`).
  3. Update `purchase_order_line.receivedQty += N` per line.
  4. Update `bom_snapshot_line.received_qty += N` qua join `purchase_order_line.snapshot_line_id`.
  5. Audit log entry `RECEIVE_BATCH` với metadata {poId, lineCount, totalQty}.
  Nếu PO toàn bộ line đã nhận → update `purchase_order.status` thành `RECEIVED`, partial → `PARTIAL`.
- **File paths:**
  - `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx` (MODIFY — thêm cột tickbox + nút save)
  - `apps/web/src/components/procurement/PoLineReceivingTickbox.tsx` (NEW ~150 dòng)
  - `apps/web/src/app/api/procurement/purchase-orders/[id]/receive/route.ts` (NEW POST batch ~80 dòng)
  - `apps/web/src/server/services/receiving.ts` (NEW ~180 dòng — function `receiveLines(poId, lines[], userId)` trong transaction)
  - `apps/web/src/hooks/useReceivePoLines.ts` (NEW — TanStack mutation + invalidate query)
  - `packages/shared/src/schemas/receiving.ts` (MODIFY — thêm `ReceiveLinesRequestSchema` zod)
- **DoD:**
  - Tạo PO 5 line → tick 3 line + save → DB có:
    - 1 row `inbound_receipt` mới với receipt_no đúng format.
    - 3 row `inbound_receipt_line` với `receivedQty` đúng.
    - `purchase_order_line.receivedQty` 3/5 line cập nhật.
    - `bom_snapshot_line.received_qty` cộng dồn đúng (verify: `SELECT received_qty FROM bom_snapshot_line WHERE id IN (...)` so trước/sau).
    - `purchase_order.status` chuyển `PARTIAL`.
    - `audit_event` có 1 row action=`RECEIVE_BATCH`.
  - Tick toàn bộ 5 line → status `RECEIVED`.
  - Idempotent: gọi 2 lần với cùng payload → lần 2 không tạo thêm receipt (check `If-Match` header hoặc body có `idempotencyKey` UUIDv7).
  - Rollback nếu 1 line fail (vd snapshotLineId không tồn tại) → toàn bộ transaction rollback, FE hiện toast lỗi rõ ràng.
- **Estimate:** 16h (service 6h + API 3h + UI component 4h + test 3h).
- **Owner agent:** `ui-ux-developer` + `tester`.
- **Dependencies:** none (Sprint 1 đã ship).
- **Risk:** PO không có `snapshot_line_id` (PO manual không qua PR) → service phải skip update snapshot, chỉ update PO line. Test case riêng.

#### Task P1-S2-T2 — Excel BOM importer V1 wizard 3 bước

- **Title:** Wizard 3 bước (upload → preview → confirm) + worker BullMQ parse multi-sheet.
- **Description:** Folder mới `apps/web/src/app/(app)/import/bom/` chứa page wizard. Step 1: drop file `.xlsx`. Step 2: preview 3 sheet (sheet 1+2 BOM lines, sheet 3 master vật liệu/quy trình lưu tạm vào `specJson` Phase 1). Step 3: chốt mapping cột → POST commit → enqueue BullMQ job `bom-import-v2`. Worker `bomImport.ts` đã tồn tại — extend pattern V1.1, thêm support multi-sheet auto-detect header row 1/2 (đã có một phần) + fallback tạo item mới khi SKU chưa có (`item.itemType=PURCHASED`). Material/process sheet 3 lưu vào `bom_template.metadata.materialMaster` và `metadata.processMaster` mảng JSON tạm. Cột "Visible Part Size" → `item.specJson` (text format giữ nguyên). Cột "Sub Category" → `item.specJson` field `subCategory`. Cột "Note 1/2/3" → `bom_line.metadata.notes` mảng 3 phần tử.
- **File paths:**
  - `apps/web/src/app/(app)/import/bom/page.tsx` (NEW)
  - `apps/web/src/components/bom-import/v2/BomImportWizardV2.tsx` (NEW kế thừa pattern `BomImportWizard.tsx` cũ ~250 dòng)
  - `apps/web/src/components/bom-import/v2/SheetSelectorStepV2.tsx` (NEW)
  - `apps/web/src/components/bom-import/v2/BomColumnMapperStepV2.tsx` (NEW)
  - `apps/web/src/server/services/bomExcelParser.ts` (NEW ~200 dòng — đọc `.xlsx` qua thư viện `xlsx` (sheetjs), detect header row, parse 3 sheet, return preview structure)
  - `apps/web/src/app/api/imports/bom/parse/route.ts` (NEW POST file → preview)
  - `apps/web/src/app/api/imports/bom/commit/route.ts` (NEW POST mapping + line data → BullMQ enqueue)
  - `apps/worker/src/jobs/bomImport.ts` (MODIFY — extend support v2, lookup supplier theo NCC shorthand, auto-create item nếu chưa có)
  - `apps/web/src/lib/import-mapping.ts` (MODIFY — extend synonym dict thêm "Standard Number" → componentSku, "ID Number" → positionCode-tạm-lưu-metadata, "Visible Part Size" → specJson, "NCC" → supplierCode, "Note 1/2/3" → metadata.notes[])
  - `package.json` (MODIFY apps/web — thêm dep `xlsx@^0.18.5` đã có hoặc thêm mới, lock chính xác version)
- **DoD:**
  - Upload file mẫu thực tế `Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx` → preview hiển thị 3 sheet (40+58+1) → click confirm → BullMQ job complete trong <30s → DB có 2 BOM template (1 per sheet) với tổng 58 line + 1 BOM template metadata chứa 25 record material/process.
  - Cột Note 1/2/3 lưu vào `bom_line.metadata.notes` mảng đúng.
  - SKU chưa có trong DB → auto tạo `item` mới với `itemType=PURCHASED`, `uom=PCS`, `status=ACTIVE`, `specJson` chứa Visible Part Size + Sub Category.
  - File limit 200 line → upload file >200 line trả 400 với message "File quá lớn, hỗ trợ tối đa 200 line/sheet".
  - Idempotent: re-upload cùng file → lần 2 update existing BOM template, không tạo duplicate.
- **Estimate:** 24h (parser 8h + wizard UI 8h + worker 4h + test với file thật 4h).
- **Owner agent:** `planner` (review service architecture) + `ui-ux-developer` (build wizard UI).
- **Dependencies:** P1-S2-T1 (không direct, nhưng cần cùng deploy window).
- **Risk:** sheetjs library nặng (~3MB) tăng bundle FE. Mitigate: server-side parse qua API route (đã design đúng), FE chỉ upload multipart. Risk 2: file Excel thực tế có cell merge / formula → parser fail. Mitigate: test với file thật trước, fallback skip cell merge với warning.

#### Task P1-S2-T3 — Sprint 2 commit + tag `v2.0-p1-w2`

- **Title:** Smoke test sprint 2 + tag.
- **File paths:**
  - `tests/smoke/v2-p1-w2.sh` (NEW)
  - `PROGRESS.md` (MODIFY)
- **DoD:** Smoke 12/12 PASS (bao gồm 8 cũ + 4 mới: receive batch endpoint, idempotency, BOM upload, BOM commit). Tag `v2.0-p1-w2`.
- **Estimate:** 4h.
- **Owner agent:** `tester` + `git-manager`.

**Test plan Sprint 2:**
- Unit: `receiving.ts` service test transaction rollback. `bomExcelParser.ts` test với file mẫu fixture.
- Integration: API `/receive` test với PO 5 line → check DB state trước/sau qua psql.
- E2E manual: 1 user role warehouse tick PO + 1 user role planner upload Excel.
- Performance: BOM 200-line upload + commit <30s.

**Release criteria Sprint 2 (tag `v2.0-p1-w2`):**
- 3 task DoD pass.
- Backup `pg_dump iot > backup-pre-w2.sql`.
- Smoke 12/12 PASS staging.
- 1 round UAT manual với operator kho thật (10 line tick) — verify DB cập nhật đúng.

**Sprint 2 effort:** 44h ≈ 5.5 ngày.

---

### Sprint 3 (Tuần 3) — Polish + UAT + release V2.0-Phase1

**Goal:** Mobile responsive dashboard, UAT 2 ngày với operator kho thật, release V2.0-Phase1 production, monitor 72h không có P0 bug.

**Owner agent chính:** `ui-ux-designer` + `tester` + `project-manager`.

#### Task P1-S3-T1 — Polish dashboard mobile + tickbox PWA

- **Title:** Tăng tap target, viewport responsive, PWA layout cho receiving.
- **Description:** `ProgressBarStack` mobile <md xếp dọc thay vì ngang. Tickbox tap target 44px+ (mobile). Confirm dialog "Xác nhận đã nhận N cái?" rõ ràng VN. Test trên Chrome DevTools device toolbar (iPhone 12, Pixel 5, iPad). Fix flicker khi cache miss → dùng `Skeleton` placeholder 6 thanh + bảng. Apply CSS `min-h-[2.75rem]` cho tickbox cell.
- **File paths:**
  - `apps/web/src/components/dashboard/ProgressBarStack.tsx` (MODIFY responsive)
  - `apps/web/src/components/procurement/PoLineReceivingTickbox.tsx` (MODIFY tap target)
  - `apps/web/src/app/(app)/page.tsx` (MODIFY — thêm Suspense + Skeleton)
- **DoD:**
  - DevTools iPhone 12 → dashboard 6 thanh xếp dọc, không tràn viewport.
  - Tickbox tap accuracy 100% trên mobile (test 10 lần liên tiếp).
  - Lighthouse mobile score ≥80 trên `/`.
- **Estimate:** 8h.
- **Owner agent:** `ui-ux-designer` (lead) + `ui-ux-developer`.
- **Dependencies:** Sprint 1+2 done.
- **Risk:** Lighthouse bundle size warning do thêm xlsx. Mitigate: confirmed server-side parse → bundle FE không tăng.

#### Task P1-S3-T2 — UAT 2 ngày + collect feedback

- **Title:** UAT với 1 operator kho + 1 engineer thật trong 2 ngày làm việc.
- **Description:** `project-manager` agent chuẩn bị checklist UAT 12 case (4 nav, 3 dashboard, 2 receiving, 2 import, 1 admin). Tạo Google Form thu feedback. Hold Loom video 5 phút giới thiệu UI mới gửi user trước UAT.
- **File paths:**
  - `tests/uat/v2-phase1-checklist.md` (NEW)
  - `docs/release-notes/v2.0-phase1.md` (NEW)
- **DoD:**
  - 12/12 UAT case PASS hoặc có ticket follow-up rõ ràng (max 3 ticket P1, 0 ticket P0).
  - Feedback survey ≥ 7/10 trên thang Likert "UI mới dễ dùng".
  - Video record + screenshot lưu vào `docs/release-notes/v2.0-phase1.md`.
- **Estimate:** 12h (chuẩn bị 4h + UAT 6h + tổng hợp feedback 2h).
- **Owner agent:** `project-manager` (lead) + `tester`.
- **Dependencies:** P1-S3-T1.
- **Risk:** Operator phản ứng tiêu cực với UI mới. Mitigate: giữ alias route `/items` `/receiving` cũ → operator cảm thấy "vẫn quen". Toggle "UI cũ" KHÔNG làm vì over-engineer.

#### Task P1-S3-T3 — Release V2.0-Phase1 production + monitor 72h

- **Title:** Deploy V2.0-Phase1 lên production + dashboard giám sát 72h.
- **Description:** Backup pg_dump, push tag `v2.0-phase1`, GitHub Actions build image `ghcr.io/andy-cods/hethong-iot:v2.0-phase1`, SSH VPS pull + recreate container app+worker, smoke 12/12 production. Monitor 72h: log error rate, dashboard latency p95, BullMQ queue depth.
- **File paths:**
  - `.github/workflows/deploy.yml` (REUSE — tag-triggered build)
  - `tests/smoke/v2-phase1-production.sh` (NEW)
  - `PROGRESS.md` (MODIFY)
- **DoD:**
  - Tag `v2.0-phase1` push origin.
  - Image `ghcr.io/andy-cods/hethong-iot:v2.0-phase1` pulled + run trên VPS.
  - Smoke production 12/12 PASS.
  - 72h monitor: 0 P0 bug, <5 P1 bug, dashboard p95 <2s.
  - PROGRESS.md ghi `[x] Sprint 3 V2.0-Phase1 LIVE` với ngày + commit hash.
- **Estimate:** 8h (deploy 2h + monitor 6h chia nhiều slot 30 phút).
- **Owner agent:** `git-manager` (lead deploy) + `tester` (smoke) + `project-manager` (monitor).
- **Dependencies:** P1-S3-T1, P1-S3-T2.
- **Risk:** Deploy fail do migration không có thực tế nhưng env biến đổi. Mitigate: backup full + rollback script `docker compose pull :v1.5 && up -d` đã chuẩn bị.

**Test plan Sprint 3:**
- E2E manual: 12 UAT case + 12 smoke production.
- Performance: Lighthouse mobile + desktop trên 3 page chính (`/`, `/procurement/purchase-orders/[id]`, `/import/bom`).
- Regression: 5 page V1.4 cũ (`/items`, `/suppliers`, `/bom`, `/orders`, `/work-orders`) vẫn hoạt động.

**Release criteria Sprint 3 (tag `v2.0-phase1`):**
- 3 task DoD pass.
- UAT survey ≥7/10.
- Smoke production 12/12 PASS.
- 72h monitor 0 P0.
- Backup pre-release đã upload off-site.

**Sprint 3 effort:** 28h ≈ 3.5 ngày.

---

**Phase 1 tổng effort:** 100h ≈ 12.5 ngày dev (≤120h budget — OK).
**Phase 1 deliverable:** 4 (D1+D2+D3+D4 ship + tag `v2.0-phase1`).

---

## 3. Phase 2 — Schema + module mới (5 tuần)

### Sprint 4-5 (Tuần 4-5) — Schema delta + admin UI material/process master

**Goal:** Migration `0017`+`0018`+`0019` apply production thành công + admin UI CRUD `material_master` + `process_master` + UI item form thêm field dimensions/weight/material_code + backfill từ specJson.

**Owner agent chính:** `planner` (review schema + migration) + `ui-ux-developer`.

#### Task P2-S4-T1 — Migration `0017_material_process_master.sql` + seed

- **Title:** Tạo bảng `material_master` + `process_master` + seed 25 record từ Excel sheet 3.
- **Description:** Migration 2 bảng đơn giản:
  ```sql
  CREATE TABLE app.material_master (
    code varchar(32) PRIMARY KEY,
    name_en varchar(128) NOT NULL,
    name_vn varchar(128) NOT NULL,
    price_per_kg numeric(18, 2),
    density_kg_m3 numeric(10, 2),
    uom varchar(8) NOT NULL DEFAULT 'KG',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.user_account(id)
  );
  CREATE INDEX material_master_active_idx ON app.material_master(is_active);

  CREATE TABLE app.process_master (
    code varchar(32) PRIMARY KEY,
    name_en varchar(128) NOT NULL,
    name_vn varchar(128) NOT NULL,
    price_per_hour numeric(18, 2),
    uom varchar(8) NOT NULL DEFAULT 'HOUR',
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    created_by uuid REFERENCES app.user_account(id)
  );
  CREATE INDEX process_master_active_idx ON app.process_master(is_active);
  ```
  Rollback file `0017_rollback.sql`: `DROP TABLE IF EXISTS app.material_master CASCADE; DROP TABLE IF EXISTS app.process_master CASCADE;`. Seed file `0017_seed.sql` insert 15 vật liệu (POM, PB108, PVC, AL6061, AL6063, SUS304, SUS316, S45C, S50C, A36, ABS, PEEK, NYLON, BRASS, COPPER) + 10 quy trình (MCT, WIRE_CUTTING, MILLING, TURNING, GRINDING, ANODIZING, HEAT_TREATMENT, BLACK_OXIDE, POWDER_COATING, EDM).
- **File paths:**
  - `packages/db/migrations/0017_material_process_master.sql` (NEW ~50 dòng)
  - `packages/db/migrations/0017_rollback.sql` (NEW)
  - `packages/db/migrations/0017_seed.sql` (NEW ~30 dòng INSERT)
  - `packages/db/src/schema/master.ts` (MODIFY — thêm `materialMaster` + `processMaster` table với FK chuẩn)
  - `packages/db/src/seed.ts` (MODIFY — gọi seed material/process từ file SQL)
- **DoD:**
  - Migration apply staging → `\d app.material_master` + `\d app.process_master` show schema đúng.
  - Seed → `SELECT count(*) FROM app.material_master` = 15, `process_master` = 10.
  - Rollback → `DROP TABLE` thành công, không còn references.
  - Drizzle schema typecheck pass.
- **Estimate:** 6h.
- **Owner agent:** `planner`.
- **Dependencies:** none (đầu Phase 2).
- **Risk:** Seed conflict với existing data — không có vì bảng mới. Risk price_per_kg / price_per_hour user chưa cung cấp giá thực → seed default null, để admin update sau.

#### Task P2-S4-T2 — Admin UI CRUD `/admin/materials` + `/admin/processes`

- **Title:** 2 page list + form CRUD cho material_master + process_master.
- **Description:** Pattern reuse từ `/admin/users`. List virtualized, search, badge active/inactive, form 5 field (code, name_en, name_vn, price, is_active). Sort theo updated_at desc.
- **File paths:**
  - `apps/web/src/app/(app)/admin/materials/page.tsx` (NEW)
  - `apps/web/src/app/(app)/admin/materials/new/page.tsx` (NEW)
  - `apps/web/src/app/(app)/admin/materials/[code]/page.tsx` (NEW)
  - `apps/web/src/app/(app)/admin/processes/page.tsx` (NEW)
  - `apps/web/src/app/(app)/admin/processes/new/page.tsx` (NEW)
  - `apps/web/src/app/(app)/admin/processes/[code]/page.tsx` (NEW)
  - `apps/web/src/components/admin/MaterialForm.tsx` (NEW)
  - `apps/web/src/components/admin/ProcessForm.tsx` (NEW)
  - `apps/web/src/app/api/admin/materials/route.ts` (NEW GET+POST)
  - `apps/web/src/app/api/admin/materials/[code]/route.ts` (NEW GET+PATCH+DELETE)
  - `apps/web/src/app/api/admin/processes/route.ts` (NEW GET+POST)
  - `apps/web/src/app/api/admin/processes/[code]/route.ts` (NEW GET+PATCH+DELETE)
  - `apps/web/src/server/repos/materialMaster.ts` (NEW)
  - `apps/web/src/server/repos/processMaster.ts` (NEW)
  - `apps/web/src/hooks/useMaterials.ts` (NEW)
  - `apps/web/src/hooks/useProcesses.ts` (NEW)
  - `packages/shared/src/schemas/master.ts` (NEW zod schemas)
- **DoD:**
  - Login admin → /admin/materials → 15 row hiển thị.
  - Tạo mới material POM2 (test) → DB có row + UI list refresh.
  - Edit + soft-delete (is_active=false) hoạt động.
  - Role guard: non-admin GET 403.
- **Estimate:** 16h.
- **Owner agent:** `ui-ux-developer`.
- **Dependencies:** P2-S4-T1.
- **Risk:** Pattern admin/users phức tạp có thể không reuse hết. Mitigate: copy file pattern + adjust columns.

#### Task P2-S4-T3 — Migration `0018_item_dimensions_weight.sql` + `0019_bom_line_position_code.sql`

- **Title:** Thêm cột `dimensions/weight_g/material_code` cho `item` + `position_code` cho `bom_line`.
- **Description:** Migration `0018`:
  ```sql
  ALTER TABLE app.item ADD COLUMN dimensions jsonb;
  ALTER TABLE app.item ADD COLUMN weight_g numeric(18, 4);
  ALTER TABLE app.item ADD COLUMN material_code varchar(32);
  ALTER TABLE app.item ADD CONSTRAINT item_material_fk
    FOREIGN KEY (material_code) REFERENCES app.material_master(code) ON DELETE SET NULL;
  CREATE INDEX item_material_idx ON app.item(material_code) WHERE material_code IS NOT NULL;
  ```
  **CRITICAL:** ADD COLUMN không default + nullable → instant ở PG ≥11. KHÔNG add NOT NULL trong migration này.
  Migration `0019`:
  ```sql
  ALTER TABLE app.bom_line ADD COLUMN position_code varchar(16);
  CREATE INDEX bom_line_position_code_idx ON app.bom_line(template_id, position_code) WHERE position_code IS NOT NULL;
  ```
  Backfill scripts riêng (chạy sau migration apply, không trong window):
  - `scripts/backfill-bom-line-position.ts` — UPDATE chunked 1000 row/batch: `UPDATE app.bom_line SET position_code = LPAD(position::text, 3, '0') WHERE position_code IS NULL`.
  - `scripts/backfill-spec-to-dimensions.ts` — parse `item.specJson` text format `"601.0 X 21.0 X 20.0"` → `dimensions = {length: 601, width: 21, height: 20, unit: 'mm'}`. Item không parse được giữ nguyên specJson.
- **File paths:**
  - `packages/db/migrations/0018_item_dimensions_weight.sql` (NEW)
  - `packages/db/migrations/0018_rollback.sql` (NEW)
  - `packages/db/migrations/0019_bom_line_position_code.sql` (NEW)
  - `packages/db/migrations/0019_rollback.sql` (NEW)
  - `packages/db/src/schema/master.ts` (MODIFY — thêm 3 cột vào `item`)
  - `packages/db/src/schema/bom.ts` (MODIFY — thêm `position_code` vào `bomLine`)
  - `scripts/backfill-bom-line-position.ts` (NEW ~80 dòng chunked update)
  - `scripts/backfill-spec-to-dimensions.ts` (NEW ~120 dòng parse + UPDATE)
- **DoD:**
  - Migration apply staging clone production → `\d app.item` show 3 cột mới + FK.
  - Backfill bom_line_position chạy → 100% line có `position_code` không null (verify `SELECT count(*) FROM bom_line WHERE position_code IS NULL` = 0).
  - Backfill spec-to-dimensions chạy → ≥80% item có dimensions parsed (item không parse được skip + log warning).
  - Rollback file test apply OK.
  - Drizzle typecheck pass.
- **Estimate:** 10h.
- **Owner agent:** `planner` (lead migration) + `ui-ux-developer` (script backfill).
- **Dependencies:** P2-S4-T1 (cần `material_master` cho FK).
- **Risk:** specJson format không nhất quán → backfill regex fail. Mitigate: regex flexible + skip + log không reject. Risk 2: ADD COLUMN block table lock ngắn (<1s) trên PG 16. OK.

#### Task P2-S4-T4 — UI item form thêm field dimensions/weight/material_code + commit + tag `v2.0-p2-w4` + `v2.0-p2-w5`

- **Title:** Item form thêm 3 field + smoke test sprint 4-5.
- **File paths:**
  - `apps/web/src/components/items/ItemForm.tsx` (MODIFY — accordion thêm section "Kích thước & vật liệu" với 3 input)
  - `apps/web/src/app/api/items/route.ts` (MODIFY POST/PATCH chấp nhận 3 field mới)
  - `apps/web/src/app/api/items/[id]/route.ts` (MODIFY)
  - `packages/shared/src/schemas/item.ts` (MODIFY zod schema)
  - `tests/smoke/v2-p2-w4.sh` (NEW)
  - `tests/smoke/v2-p2-w5.sh` (NEW)
- **DoD:** Form save 3 field thành công, DB persist đúng. Smoke 18/18 PASS (12 cũ + 6 mới). Tag `v2.0-p2-w4` (cuối tuần 4) + `v2.0-p2-w5` (cuối tuần 5).
- **Estimate:** 8h.
- **Owner agent:** `ui-ux-developer` + `git-manager`.

**Test plan Sprint 4-5:**
- Migration test: clone production DB → apply 3 migration → backfill → diff schema before/after.
- Unit: backfill regex test với 30 sample specJson string.
- E2E: tạo item mới với 3 field → reload → giữ nguyên.
- Performance: backfill 3000 item <2 phút.

**Release criteria Sprint 4-5:**
- 4 task DoD pass.
- Backup pg_dump trước mỗi migration.
- Smoke 18/18 PASS staging.
- Backfill log report ≥80% success rate.

**Sprint 4-5 effort:** 40h ≈ 5 ngày.

---

### Sprint 6 (Tuần 6) — Excel BOM importer V2 đầy đủ

**Goal:** Importer V2 đọc đầy đủ tất cả cột Excel, auto-link material/process master, lưu vào cột mới (không còn `specJson` workaround).

#### Task P2-S6-T1 — Importer V2 mapping đầy đủ + auto-link master

- **Title:** Refactor `bomExcelParser.ts` + `bomImport.ts` worker map đầy đủ field mới.
- **Description:** Mapping cập nhật:
  - "Sub Category" → `item.material_code` (lookup `material_master.code`, fuzzy match qua name_vn/name_en, fallback null + warning).
  - "Visible Part Size" → parse → `item.dimensions` jsonb.
  - "Weight" (nếu có) → `item.weight_g`.
  - "ID Number" (R01..R41) → `bom_line.position_code` varchar.
  - "Note 1/2/3" → vẫn lưu `bom_line.metadata.notes` mảng (chờ Sprint 7 migrate sang `bom_line_note` table).
  - Sheet 3 master → upsert vào `material_master` + `process_master` (skip nếu code đã tồn tại + log info).
- **File paths:**
  - `apps/web/src/server/services/bomExcelParser.ts` (MODIFY major)
  - `apps/worker/src/jobs/bomImport.ts` (MODIFY major — thêm logic lookup master + parse dimensions + position_code)
  - `apps/web/src/lib/import-mapping.ts` (MODIFY — extend synonym dict cho "Sub Category" → materialCode etc.)
  - `apps/web/src/components/bom-import/v2/BomColumnMapperStepV2.tsx` (MODIFY — UI thêm option mapping mới)
- **DoD:**
  - Re-import file mẫu → so với importer V1 sprint 2, tất cả field nhập đúng vào cột schema (verify SQL):
    - 58 line có `position_code` đúng format "R01"..."R41".
    - ≥80% item có `material_code` non-null (link material_master).
    - ≥80% item có `dimensions` jsonb parsed.
    - 25 record material/process upsert vào master không trùng.
  - Idempotent: re-import lần 2 không crash, update existing.
- **Estimate:** 16h (parser refactor 6h + worker 6h + UI 2h + test 2h).
- **Owner agent:** `ui-ux-developer` + `tester`.
- **Dependencies:** P2-S4-T1, P2-S4-T3.
- **Risk:** Fuzzy match material name VN sai → log warning + cho user manual fix sau (admin UI). Không hard fail.

#### Task P2-S6-T2 — Smoke test sprint 6 + tag `v2.0-p2-w6`

- **File paths:** `tests/smoke/v2-p2-w6.sh` (NEW), `PROGRESS.md`.
- **Estimate:** 4h.

**Sprint 6 effort:** 20h ≈ 2.5 ngày.

---

### Sprint 7 (Tuần 7) — PR-from-BOM + WO approval/delay + bom_line_note

**Goal:** Engineer chọn BOM line → tạo PR bulk. WO có workflow approval + delay. Note timeline có audit trail.

#### Task P2-S7-T1 — Migration `0020_bom_line_note.sql` + UI note timeline

- **Title:** Tạo bảng `bom_line_note` + UI hiển thị note với audit trail.
- **Description:** Migration:
  ```sql
  CREATE TABLE app.bom_line_note (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    bom_line_id uuid NOT NULL REFERENCES app.bom_line(id) ON DELETE CASCADE,
    idx integer NOT NULL DEFAULT 0,
    text text NOT NULL,
    created_by uuid REFERENCES app.user_account(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX bom_line_note_line_idx ON app.bom_line_note(bom_line_id, created_at DESC);
  ```
  Backfill: scan `bom_line.metadata.notes` mảng → insert vào `bom_line_note` table với `idx` = vị trí trong mảng.
  UI: trong BOM line inspector sheet, tab "Ghi chú" hiển thị timeline reverse-chronological. Form thêm note mới (textarea + save). Không xoá/sửa note (append-only).
- **File paths:**
  - `packages/db/migrations/0020_bom_line_note.sql` (NEW)
  - `packages/db/migrations/0020_rollback.sql` (NEW)
  - `packages/db/src/schema/bom.ts` (MODIFY — thêm `bomLineNote` table)
  - `scripts/backfill-bom-line-note.ts` (NEW)
  - `apps/web/src/components/bom-grid/BomLineNoteTimeline.tsx` (NEW)
  - `apps/web/src/app/api/bom/lines/[id]/notes/route.ts` (NEW GET+POST)
  - `apps/web/src/server/repos/bomLineNotes.ts` (NEW)
  - `apps/web/src/hooks/useBomLineNotes.ts` (NEW)
- **DoD:**
  - Migration apply OK + rollback OK.
  - Backfill chạy: nếu phase 1 có 30 line có metadata.notes → 90 row note table.
  - UI tạo note mới → DB có row + timeline render.
  - Audit: created_by, created_at đúng.
- **Estimate:** 10h.
- **Owner agent:** `planner` + `ui-ux-developer`.

#### Task P2-S7-T2 — Migration `0021_wo_approval_delay.sql` + UI WO approval workflow

- **Title:** Thêm `delayed_until` + `delay_reason` cột WO + UI approval pattern PO.
- **Description:** Migration:
  ```sql
  ALTER TABLE app.work_order ADD COLUMN delayed_until timestamptz;
  ALTER TABLE app.work_order ADD COLUMN delay_reason text;
  CREATE INDEX work_order_delayed_idx ON app.work_order(delayed_until) WHERE delayed_until IS NOT NULL;
  ```
  Approval pattern reuse từ PO V1.9: dùng `work_order.metadata.approvalStatus` (PENDING/APPROVED/REJECTED) + `approvedBy/approvedAt/rejectedReason` trong metadata jsonb có sẵn — KHÔNG cần migration cho approval. Logic: WO mới tạo `metadata.approvalStatus=PENDING`, admin click "Duyệt" → set APPROVED + approvedBy/At, click "Từ chối" → REJECTED + rejectedReason. WO chỉ chuyển từ DRAFT → QUEUED khi approvalStatus=APPROVED. Nút "Trì hoãn" → modal nhập due date mới + reason → set `delayed_until` + `delay_reason`. Status hiển thị badge "Trì hoãn đến dd/mm".
- **File paths:**
  - `packages/db/migrations/0021_wo_approval_delay.sql` (NEW)
  - `packages/db/migrations/0021_rollback.sql` (NEW)
  - `packages/db/src/schema/production.ts` (MODIFY — thêm `delayedUntil` + `delayReason`)
  - `apps/web/src/components/wo/WoApprovalActions.tsx` (NEW)
  - `apps/web/src/components/wo/WoDelayDialog.tsx` (NEW)
  - `apps/web/src/app/api/wo/[id]/approve/route.ts` (NEW)
  - `apps/web/src/app/api/wo/[id]/reject/route.ts` (NEW)
  - `apps/web/src/app/api/wo/[id]/delay/route.ts` (NEW)
  - `apps/web/src/app/(app)/work-orders/[id]/page.tsx` (MODIFY — thêm 2 nút Duyệt/Trì hoãn + badge)
- **DoD:**
  - Tạo WO → metadata.approvalStatus=PENDING.
  - Admin click Duyệt → metadata.approvalStatus=APPROVED + DB row có approvedBy/At.
  - Click Trì hoãn → set delayed_until + delay_reason.
  - Non-admin role: nút Duyệt/Từ chối ẩn (RBAC `wo:approve`).
- **Estimate:** 12h.
- **Owner agent:** `ui-ux-developer`.

#### Task P2-S7-T3 — PR-from-BOM bulk-create modal

- **Title:** Trong `/bom/[id]/grid`, thêm checkbox per-line + nút "Tạo PR cho line đã chọn".
- **Description:** BOM grid bottom panel "Mua sắm" tab thêm column checkbox + bulk action "Tạo PR" → mở modal:
  - Step 1: chọn NCC (default = `item_supplier.preferred=true`).
  - Step 2: nhập `neededBy` date.
  - Step 3: confirm → POST `/api/procurement/purchase-requests/bulk-create` với body `{lineIds: uuid[], supplierId, neededBy}`.
  Server: tạo 1 row `purchase_request` (status=DRAFT) + N row `purchase_request_line` với `snapshotLineId` (nếu có) + `linkedOrderId` (nếu có). Redirect FE sang `/procurement/purchase-requests/[new-id]`.
- **File paths:**
  - `apps/web/src/components/bom-workspace/PrFromBomDialog.tsx` (NEW)
  - `apps/web/src/components/bom-workspace/panels/ProcurementPanel.tsx` (MODIFY — thêm checkbox column)
  - `apps/web/src/app/api/procurement/purchase-requests/bulk-create/route.ts` (NEW)
  - `apps/web/src/server/services/prBulkCreate.ts` (NEW transaction)
- **DoD:**
  - Tick 5 line → modal NCC → confirm → DB có 1 PR + 5 PR line + redirect đúng URL.
  - PR line `snapshot_line_id` đúng (FK).
- **Estimate:** 12h.
- **Owner agent:** `ui-ux-developer`.

**Sprint 7 effort:** 38h ≈ 4.5 ngày.

---

### Sprint 8 (Tuần 8) — Bộ phận Kế toán + Release V2.0

**Goal:** Migration `0022` + workspace `/accounting` + release V2.0 final + UAT toàn hệ thống 4 role.

#### Task P2-S8-T1 — Migration `0022_payment_log.sql` + workspace `/accounting`

- **Title:** Tạo bảng `payment_log` + UI workspace Kế toán.
- **Description:** Migration:
  ```sql
  CREATE TYPE app.payment_method AS ENUM ('BANK', 'CASH', 'OTHER');

  CREATE TABLE app.payment_log (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    po_id uuid NOT NULL REFERENCES app.purchase_order(id),
    amount numeric(18, 2) NOT NULL,
    method app.payment_method NOT NULL DEFAULT 'BANK',
    paid_at timestamptz NOT NULL,
    notes text,
    attachment_url text,
    created_by uuid REFERENCES app.user_account(id),
    created_at timestamptz NOT NULL DEFAULT now()
  );
  CREATE INDEX payment_log_po_idx ON app.payment_log(po_id, paid_at DESC);
  CREATE INDEX payment_log_paid_idx ON app.payment_log(paid_at DESC);
  ```
  Workspace `/accounting`:
  - `/accounting` index — 4 KPI card (Tổng PO chờ thanh toán, Tổng công nợ NCC, Đã thanh toán tháng này, Quá hạn).
  - `/accounting/payments` — list payment_log filter NCC + period.
  - `/accounting/payments/new` — form tạo payment (chọn PO, amount, method, paid_at, attachment).
  - `/accounting/reports/aging` — báo cáo tuổi nợ NCC (current/30d/60d/90d+ buckets).
  Auto-update `purchase_order.metadata.paymentStatus` khi sum(payment_log.amount per po) >= po.totalAmount → set PAID, else PARTIAL, else UNPAID.
- **File paths:**
  - `packages/db/migrations/0022_payment_log.sql` (NEW)
  - `packages/db/migrations/0022_rollback.sql` (NEW)
  - `packages/db/src/schema/accounting.ts` (NEW file — `paymentLog` table)
  - `packages/db/src/schema/index.ts` (MODIFY — export accounting schema)
  - `apps/web/src/app/(app)/accounting/page.tsx` (NEW index)
  - `apps/web/src/app/(app)/accounting/payments/page.tsx` (NEW list)
  - `apps/web/src/app/(app)/accounting/payments/new/page.tsx` (NEW form)
  - `apps/web/src/app/(app)/accounting/reports/aging/page.tsx` (NEW report)
  - `apps/web/src/components/accounting/PaymentForm.tsx` (NEW)
  - `apps/web/src/components/accounting/AgingReport.tsx` (NEW)
  - `apps/web/src/app/api/accounting/payments/route.ts` (NEW GET+POST)
  - `apps/web/src/app/api/accounting/reports/aging/route.ts` (NEW GET aggregated query)
  - `apps/web/src/server/services/payment.ts` (NEW — service tạo payment + sync paymentStatus)
  - `apps/web/src/server/repos/paymentLog.ts` (NEW)
  - `apps/web/src/hooks/usePayments.ts` (NEW)
  - `packages/shared/src/schemas/accounting.ts` (NEW zod)
  - `apps/web/src/lib/nav-items.ts` (MODIFY — enable item Kế toán, thêm sub-item /accounting/payments)
- **DoD:**
  - Migration apply staging → bảng `payment_log` + enum `payment_method` tồn tại.
  - Tạo payment 1 PO partial (50% amount) → PO `metadata.paymentStatus=PARTIAL`.
  - Aging report query trả 4 bucket count đúng so với manual SQL.
  - Role guard: chỉ admin + accountant role thấy /accounting (cần thêm role `accountant` vào seed nếu chưa có hoặc reuse admin).
  - Sidebar item "Bộ phận Kế toán" enable + active.
- **Estimate:** 24h (migration 2h + service 4h + 4 page UI 12h + report 4h + test 2h).
- **Owner agent:** `planner` (lead schema) + `ui-ux-developer` (UI).
- **Dependencies:** P2-S4-T1.
- **Risk:** Q2 user chưa trả lời (BLOCKER nhẹ) → nếu user yêu cầu VAT/MISA thì scope x3. Mitigate: build default scope trước (payment log + aging) — đó là tối thiểu chắc chắn cần. Nếu user yêu cầu VAT sau 8 tuần → roll thành Phase 3.

#### Task P2-S8-T2 — UAT toàn hệ thống 4 role + viết docs

- **Title:** UAT 1 ngày với 4 user thật role warehouse/purchasing/engineering/accounting + viết user docs.
- **Description:** Mỗi role thực hiện 1 task end-to-end thực tế:
  - Warehouse: nhận 1 PO + tick 5 line.
  - Purchasing: tạo PO mới từ PR + duyệt.
  - Engineering: upload BOM Excel + tạo PR-from-BOM 5 line + tạo WO + duyệt.
  - Accounting: ghi 3 payment + xem aging report.
  Viết `docs/user-guide-v2.md` với screenshot từng step. Loom video tổng kết 10 phút.
- **File paths:**
  - `docs/user-guide-v2.md` (NEW)
  - `docs/release-notes/v2.0.md` (NEW)
  - `tests/uat/v2-final-checklist.md` (NEW)
- **DoD:**
  - 4/4 role pass UAT task end-to-end.
  - Survey ≥8/10 (cao hơn baseline phase 1).
  - Docs + video ready.
- **Estimate:** 12h.
- **Owner agent:** `docs-manager` + `project-manager` + `tester`.

#### Task P2-S8-T3 — Release V2.0 production + tag

- **Title:** Deploy V2.0 final lên production + monitor 1 tuần.
- **File paths:**
  - `tests/smoke/v2-final-production.sh` (NEW ~30 case)
  - `PROGRESS.md` (MODIFY)
- **DoD:**
  - Backup pg_dump full.
  - Apply migration 0017→0022 production.
  - Backfill scripts chạy thành công.
  - Tag `v2.0` push origin.
  - Smoke 30/30 PASS production.
  - Monitor 1 tuần: 0 P0, <10 P1.
  - PROGRESS.md ghi `[x] V2.0 LIVE` với ngày + commit hash.
- **Estimate:** 12h (deploy 4h + monitor 8h chia slot).
- **Owner agent:** `git-manager` + `tester` + `project-manager`.

**Sprint 8 effort:** 48h ≈ 6 ngày.

---

**Phase 2 tổng effort:** 40 + 20 + 38 + 48 = 146h ≈ 18 ngày dev (≤200h budget — OK).
**Phase 2 deliverable:** 6 (D5+D6+D7+D8+D9+D10 ship + tag `v2.0`).

**Tổng V2.0 effort:** 100 + 146 = **246h ≈ 31 ngày dev fulltime** (~6.2 tuần làm 5 ngày/tuần). Buffer 8 tuần lịch = ~80h overhead (32%) — OK cho 1 dev solo có meeting + UAT.

---

## 4. Risk register

| # | Risk | Probability | Impact | Mitigation | Owner | Trigger (khi nào hiện thực) |
|---|---|---|---|---|---|---|
| R1 | User reject UI thay đổi sau Sprint 1 | Med | High | Release từng tuần thay big bang. Giữ alias route `/items` `/receiving` (nav đổi nhưng URL giữ). Onboarding video Loom 5 phút trước UAT. | project-manager | UAT survey <6/10 sau Sprint 1 |
| R2 | Operator kho không quen tickbox PWA mobile | Med | High | UAT 2 ngày Sprint 3 với operator thật. Tap target 44px+. Confirm dialog rõ ràng VN. Giữ flow `/receiving` cũ làm fallback (không xoá). Training 30 phút + screen-record. | tester | Operator phàn nàn ≥3 lần trong UAT |
| R3 | Migration `0018` (ALTER TABLE item) lock table production | Low | Med | ADD COLUMN không default + nullable → instant ở PG ≥11 (verified PG 16 production). KHÔNG add NOT NULL trong migration này. Backfill chunked qua script riêng sau migration. | planner | Lock table >5s detected qua `pg_stat_activity` |
| R4 | Backfill spec-to-dimensions parse fail tỷ lệ cao | Med | Low | Regex flexible + skip + log warning. Item không parse được giữ nguyên specJson. Acceptance ≥80%. Manual fix qua admin UI sau. | ui-ux-developer | Tỷ lệ parse <80% sau backfill |
| R5 | sheetjs (xlsx) library nặng tăng bundle FE | Low | Low | Server-side parse qua API route (đã design). FE chỉ upload multipart file. Bundle FE không tăng. Lock version `xlsx@^0.18.5`. | ui-ux-developer | Lighthouse bundle warning |
| R6 | BullMQ worker overload khi import file lớn | Low | Med | Phase 1 limit 200 line/file. Job timeout 60s. Retry 1 lần. Phase 2 nâng lên 500 line. Monitor queue depth. | planner | Queue depth >50 hoặc job timeout >5%/ngày |
| R7 | Redis cache stale dashboard → user xem số sai | Low | Low | TTL 30s. Nút "Làm mới" manual. Cache invalidate khi POST receive/payment. Monitor cache hit rate. | ui-ux-developer | User báo "số không khớp" >2 lần |
| R8 | pnpm install fail trên CI khi thêm `xlsx` dep | Low | Med | Lock version chính xác. Test CI staging trước push main. Verify `pnpm-lock.yaml` commit kèm `package.json`. | git-manager | CI build fail tại step `pnpm install` |
| R9 | Q2 user (Kế toán scope) không trả lời trước Sprint 8 | Med | Med | Build default scope (payment log + aging) — đó là tối thiểu chắc chắn cần. Escalate qua `project-manager` nếu user im 48h. VAT/MISA defer Phase 3 nếu user yêu cầu thêm. | project-manager | Sprint 7 end user vẫn chưa trả lời |
| R10 | Migration `0020_bom_line_note` backfill conflict với phase 1 metadata.notes | Low | Low | Backfill script chỉ INSERT, không DELETE metadata.notes (giữ deprecated 1 tháng). Verify count(notes from metadata) = count(rows in bom_line_note). | planner | Tổng count không khớp sau backfill |
| R11 | Performance dashboard query khi `bom_snapshot_line` >50k row | Low | Med | Cache Redis 30s. Index `idx_snapshot_line_state` đã có. Materialized view fallback nếu >100k. Pagination drilldown 50 row/page. | planner | Dashboard p95 >2s |
| R12 | Deploy production Phase 2 fail do migration cascade | Low | High | Backup pg_dump full trước mỗi migration. Test trên staging clone production trước. Rollback script `_rollback.sql` chuẩn bị sẵn. Window deploy ngoài giờ làm việc. | git-manager | Migration apply fail hoặc smoke <100% |

**Risk-decision matrix tóm tắt (xếp probability × impact):**

| | Low Impact | Med Impact | High Impact |
|---|---|---|---|
| **High Prob** | — | — | — |
| **Med Prob** | R4 | R9 | R1, R2 |
| **Low Prob** | R5, R7 | R3, R6, R8, R10, R11 | R12 |

Top 3 cần plan riêng: R1 (UX adoption), R2 (operator UAT), R12 (migration deploy).

---

## 5. Quality gates (mỗi sprint phải pass)

### 5.1. Code quality

- `pnpm typecheck` — 0 new error (baseline 16 errors `purchaseOrders.ts` giữ nguyên).
- `pnpm lint` — 0 error trong file mới (warning OK nếu không break).
- `pnpm test` — coverage không giảm (>60% tổng).
- E2E happy-path manual checklist ≥10 case per sprint.

### 5.2. CI/CD

- GitHub Actions build green tại `.github/workflows/deploy.yml`.
- Image `ghcr.io/andy-cods/hethong-iot:vX.Y` push thành công.
- Smoke script bash 100% PASS.

### 5.3. Database

- Migration test trên staging clone production (pg_dump → restore vào staging).
- Rollback script test apply OK.
- Backup pre-deploy upload off-site (rsync hoặc S3).

### 5.4. Smoke test sau deploy

Mỗi sprint phải pass smoke production tối thiểu 12 case:
1. POST `/api/auth/login` 200 + cookie.
2. GET `/api/health` 200.
3. GET `/` 200 (dashboard render).
4. GET `/api/dashboard/overview-v2` 200 (Phase 1 trở đi).
5. GET sidebar 5 group (Phase 1 trở đi).
6. POST `/procurement/purchase-orders/[id]/receive` 200 (Sprint 2 trở đi).
7. POST `/api/imports/bom/parse` 200 (Sprint 2 trở đi).
8. GET `/admin/materials` 200 (Sprint 4 trở đi).
9. POST `/api/wo/[id]/approve` 200 (Sprint 7 trở đi).
10. POST `/api/accounting/payments` 200 (Sprint 8).
11. GET `/accounting/reports/aging` 200 (Sprint 8).
12. GET 5 nav item click không 404.

---

## 6. Rollback strategy

### 6.1. Phase 1 rollback

KHÔNG có schema change → rollback = git revert + redeploy:
1. `git revert <commit-range>` push origin main.
2. CI build image new tag.
3. SSH VPS `docker compose pull && up -d`.
4. Smoke production 12/12 PASS.
Thời gian rollback: ≤15 phút.

### 6.2. Phase 2 rollback per migration

Mỗi migration có file `_rollback.sql` đi kèm. Backup `pg_dump` trước mỗi migration.

| Migration | Rollback statement |
|---|---|
| `0017_material_process_master.sql` | `DROP TABLE app.material_master CASCADE; DROP TABLE app.process_master CASCADE;` |
| `0018_item_dimensions_weight.sql` | `ALTER TABLE app.item DROP COLUMN dimensions; DROP COLUMN weight_g; DROP COLUMN material_code;` |
| `0019_bom_line_position_code.sql` | `ALTER TABLE app.bom_line DROP COLUMN position_code;` |
| `0020_bom_line_note.sql` | `DROP TABLE app.bom_line_note CASCADE;` |
| `0021_wo_approval_delay.sql` | `ALTER TABLE app.work_order DROP COLUMN delayed_until; DROP COLUMN delay_reason;` |
| `0022_payment_log.sql` | `DROP TABLE app.payment_log CASCADE; DROP TYPE app.payment_method;` |

Sau rollback migration: revert code Drizzle schema + redeploy app.

Trường hợp nặng nhất (cascade nhiều bảng) → restore full backup `pg_dump`. RTO 30 phút.

### 6.3. Disaster recovery

- Backup hằng ngày qua `deploy/scripts/backup.sh` (đã có) → `/opt/hethong-iot/backups/`.
- Pre-deploy backup upload S3/off-site (manual qua scp).
- Document recovery runbook: `docs/runbook-restore.md` (Sprint 8 viết).

---

## 7. Communication plan

### 7.1. Daily

- 1 dev solo → không cần daily standup.
- Dev tự cập nhật `PROGRESS.md` mỗi cuối ngày qua dòng checklist.

### 7.2. Weekly

- Cuối mỗi sprint: gửi user 1 email + Loom video 5 phút demo deliverable + screenshot.
- Tag git release `v2.0-p1-w1`, `v2.0-p1-w2`, ..., `v2.0-p2-w7`, `v2.0`.
- User feedback qua Zalo trong 24h sau weekly demo.

### 7.3. Escalation

- BLOCKER user không trả lời >48h → `project-manager` agent escalate qua chat user trực tiếp.
- Bug P0 production → SSH VPS rollback ngay + báo user trong 30 phút.
- Migration fail → STOP deploy, restore backup, post-mortem viết trong 24h.

---

## 8. Success criteria — V2.0 release

### 8.1. Phải đạt (must-have)

- 4 bộ phận trong sidebar hoạt động cho 4 role tương ứng (warehouse / purchasing / engineering / accounting).
- Trang Tổng quan `/` load <2s p95, 6 progress bar đúng phần trăm so với manual count DB SQL.
- Tickbox receiving UAT thành công với 1 operator thật ≥10 line tick → DB cập nhật `received_qty` chính xác.
- Excel BOM importer V2 nhập file mẫu 58-line trong <30s, 0 lỗi mapping ngoài cảnh báo intentional (Sub Category fuzzy match).
- WO approval workflow giống PO V1.9 (`metadata.approvalStatus` = PENDING/APPROVED/REJECTED).
- Trang Kế toán payment log + báo cáo công nợ NCC sums chính xác (verify SQL aggregate match).
- Migration 0017→0022 apply production + backfill ≥80% success.
- Zero data loss qua 8 tuần (verify `pg_dump` diff before/after).

### 8.2. Nice to have

- Mobile responsive 100% trang Tổng quan + tickbox.
- PWA offline basic cho receiving (defer Phase 3 nếu user xác nhận cần).
- Multi-level approval cho PO ≥50M VND (defer Phase 3).

### 8.3. KPI đo sau 1 tháng go-live V2.0

- Material/process master có >25 record seed + 5 record user thêm.
- WO approvalStatus dùng đủ: 100% WO mới có approvalStatus.
- Payment_log >80% PO có ≥1 payment entry.
- Survey toàn hệ thống ≥8/10 trên thang Likert.
- Dashboard cache hit rate >80%.
- Zero P0 bug trong tháng đầu.

---

## 9. Phụ lục

### 9.1. Bảng tổng task ID × file path × LOC ước tính

| Task ID | Title ngắn | File MODIFY | File NEW | LOC ước tính |
|---|---|---|---|---|
| P1-S1-T1 | Refactor nav-items.ts | 1 | 1 (test) | 250 |
| P1-S1-T2 | Trang Tổng quan / | 1 | 5 | 600 |
| P1-S1-T3 | Smoke + tag w1 | 1 | 1 | 80 |
| P1-S2-T1 | Tickbox receiving | 1 | 5 | 600 |
| P1-S2-T2 | BOM importer V1 | 2 | 7 | 900 |
| P1-S2-T3 | Smoke + tag w2 | 1 | 1 | 80 |
| P1-S3-T1 | Polish mobile | 3 | 0 | 200 |
| P1-S3-T2 | UAT | 0 | 2 | 200 |
| P1-S3-T3 | Release Phase1 | 1 | 1 | 100 |
| P2-S4-T1 | Migration 0017 | 2 | 3 | 200 |
| P2-S4-T2 | Admin UI material/process | 0 | 17 | 1500 |
| P2-S4-T3 | Migration 0018+0019 | 2 | 4 | 350 |
| P2-S4-T4 | Item form + smoke w4-5 | 4 | 2 | 250 |
| P2-S6-T1 | Importer V2 đầy đủ | 4 | 0 | 700 |
| P2-S6-T2 | Smoke w6 | 1 | 1 | 80 |
| P2-S7-T1 | Migration 0020 + UI note | 2 | 6 | 600 |
| P2-S7-T2 | Migration 0021 + WO approval | 2 | 5 | 700 |
| P2-S7-T3 | PR-from-BOM bulk | 1 | 3 | 500 |
| P2-S8-T1 | Migration 0022 + accounting | 1 | 16 | 1600 |
| P2-S8-T2 | UAT toàn hệ thống + docs | 0 | 3 | 400 |
| P2-S8-T3 | Release V2.0 final | 1 | 1 | 150 |
| **Tổng** | | **31 modify** | **84 new** | **~10000 LOC** |

10000 LOC trong 8 tuần = 1250 LOC/tuần ≈ 250 LOC/ngày — phù hợp tốc độ 1 dev senior.

### 9.2. Diagram dataflow tickbox receiving → snapshot line

```
┌───────────────────────────────────────────────────────────────────┐
│  UI: /procurement/purchase-orders/[id]/page.tsx                   │
│  ┌──────────────────────────────────────┐                         │
│  │ PoLineReceivingTickbox component     │                         │
│  │   [✓] Line 1 — qty 100/100          │  ← user tick + qty       │
│  │   [✓] Line 2 — qty  50/200          │                         │
│  │   [ ] Line 3                          │                         │
│  │   [Lưu nhận hàng]  → POST            │                         │
│  └──────────────────────────────────────┘                         │
└───────────────────────────────────────────────────────────────────┘
                            │
                            ▼ POST /api/procurement/purchase-orders/[id]/receive
                            │  body: { lines: [{poLineId, qty}, ...], idempotencyKey }
                            │
┌───────────────────────────────────────────────────────────────────┐
│  Server: receiveLines(poId, lines, userId)  [TRANSACTION]         │
│                                                                   │
│  1. INSERT inbound_receipt (receipt_no, po_id, received_by, ...)  │
│  2. FOR each line:                                                │
│       INSERT inbound_receipt_line (receipt_id, po_line_id, qty)  │
│       UPDATE purchase_order_line SET received_qty += qty          │
│       IF po_line.snapshot_line_id IS NOT NULL:                   │
│         UPDATE bom_snapshot_line SET received_qty += qty          │
│           WHERE id = po_line.snapshot_line_id                     │
│  3. RECOMPUTE purchase_order.status:                              │
│       all lines done → RECEIVED                                   │
│       partial         → PARTIAL                                   │
│  4. INSERT audit_event (action=RECEIVE_BATCH, metadata)           │
│  5. INVALIDATE Redis cache "dashboard:overview:v2"                │
└───────────────────────────────────────────────────────────────────┘
                            │
                            ▼ tự động cập nhật
┌───────────────────────────────────────────────────────────────────┐
│  bom_snapshot_line.received_qty +=                                │
│     ↓                                                             │
│  remaining_short_qty (GENERATED) tự tính lại =                   │
│     GREATEST(0, gross_required_qty - received_qty - reserved - issued - assembled) │
│     ↓                                                             │
│  Trang Tổng quan / 6 progress bar refresh sau cache TTL 30s       │
└───────────────────────────────────────────────────────────────────┘
```

### 9.3. Bảng so sánh API mới vs API cũ

| Endpoint | V1 hiện tại | V2 mới | Khác biệt |
|---|---|---|---|
| `GET /api/dashboard/overview` | Trả 4 KPI count + recentOrders + alerts mock | KEEP cho backward compat 1 tháng | unchanged |
| `GET /api/dashboard/overview-v2` | — | Trả 6 progress + 4 KPI + orders + alerts | NEW Sprint 1 |
| `POST /api/procurement/purchase-orders/[id]/receive` | — | Batch receive lines | NEW Sprint 2 |
| `POST /api/imports/bom/parse` | — | Parse Excel multi-sheet trả preview | NEW Sprint 2 |
| `POST /api/imports/bom/commit` | — | Enqueue worker | NEW Sprint 2 |
| `GET /api/admin/materials` | — | List material_master | NEW Sprint 4 |
| `POST /api/admin/materials` | — | Create | NEW Sprint 4 |
| `GET /api/admin/processes` | — | List process_master | NEW Sprint 4 |
| `POST /api/wo/[id]/approve` | — | Approve WO | NEW Sprint 7 |
| `POST /api/wo/[id]/reject` | — | Reject WO | NEW Sprint 7 |
| `POST /api/wo/[id]/delay` | — | Delay WO | NEW Sprint 7 |
| `POST /api/procurement/purchase-requests/bulk-create` | — | Create PR từ BOM lines | NEW Sprint 7 |
| `GET /api/bom/lines/[id]/notes` | — | List notes | NEW Sprint 7 |
| `POST /api/bom/lines/[id]/notes` | — | Append note | NEW Sprint 7 |
| `GET /api/accounting/payments` | — | List payment_log | NEW Sprint 8 |
| `POST /api/accounting/payments` | — | Create payment | NEW Sprint 8 |
| `GET /api/accounting/reports/aging` | — | Aging report 4 bucket | NEW Sprint 8 |

Tổng: 16 endpoint mới + 1 cũ giữ. Không endpoint cũ break.

### 9.4. Risk-decision matrix (xếp probability × impact)

(Xem §4 — đã matrix hoá. Top 3 risk cần plan: R1, R2, R12.)

### 9.5. File path verification

Đã verify thực tế trên repo:
- `apps/web/src/lib/nav-items.ts` — exists (162 dòng).
- `apps/web/src/app/(app)/page.tsx` — exists (redirect).
- `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx` — exists.
- `apps/web/src/components/domain/{KpiCard,OrdersReadinessTable,AlertsList,SystemHealthCard}.tsx` — exists.
- `apps/web/src/server/services/redis.ts` — exists (cacheGetJson/cacheSetJson API).
- `apps/web/src/server/services/excelImport.ts` — exists (pattern reuse).
- `apps/web/src/server/services/bomImportParser.ts` — exists (extend cho V2).
- `apps/worker/src/jobs/bomImport.ts` — exists.
- `apps/web/src/lib/import-mapping.ts` — exists (extend synonym).
- `apps/web/src/components/bom-import/{BomImportWizard,SheetSelectorStep,BomColumnMapperStep}.tsx` — exists (kế thừa V1).
- `packages/db/migrations/0016_wo_status_enum_paused_queued.sql` — last migration. V2.0 bắt đầu từ `0017`.
- `packages/db/src/schema/{master,bom,procurement,production,snapshot,order}.ts` — exists.

Path **TBD verify by ui-ux-developer** (chưa chắc 100%):
- `apps/web/src/app/(app)/admin/users/...` pattern reuse cho `/admin/materials` — verify pattern trước Sprint 4.
- `apps/web/src/components/bom-workspace/panels/ProcurementPanel.tsx` — verify exist trước Sprint 7 (V1.7-beta đã làm).

### 9.6. Out of scope (gap thấy nhưng KHÔNG làm)

Phát hiện trong quá trình lập plan, KHÔNG đưa vào V2.0 vì ngoài brainstorm:

- **Notification system** (email/Zalo/in-app) cho PR/PO/WO approval pending → defer V2.1 nếu user yêu cầu.
- **Multi-level approval** PO >50M VND → đã ghi nice-to-have §8.2, defer Phase 3.
- **PR auto-gen từ BOM shortage** (không phải bulk-create manual) → defer V2.1.
- **AI suggestion note text** (Q10 brainstorm hybrid) → defer Phase 3.
- **Mobile native app** → defer Phase 3+.
- **Barcode/QR scan** → defer Phase 3+ cần test hardware.
- **Multi-warehouse** → V1 1 location duy nhất.
- **Multi-currency** → chỉ VND.
- **Real-time collab BOM** → optimistic lock đủ phase 1+2.
- **Tích hợp MISA/FAST/e-invoice** → defer Phase 3+.

Nếu user xác nhận cần → mở plan riêng V2.1 hoặc Phase 3.

### 9.7. Workflow per-bộ phận (tham chiếu brainstorm §9.5)

Đã chốt trong brainstorm. Plan này không lặp lại — xem `brainstorm.md` §9.5 để hiểu workflow Kho/Mua bán/Kỹ thuật/Kế toán daily.

### 9.8. Decision log tóm tắt (từ brainstorm §9.8)

| Decision | Lựa chọn chốt | Plan section |
|---|---|---|
| Phương án | C - Hybrid 2 phase 8 tuần | §1 |
| Sidebar | 5 section (Tổng quan + 4 bộ phận + Khác) | P1-S1-T1 |
| Items + Receiving | Giữ tách + cùng group warehouse | P1-S1-T1 |
| Dashboard component | Reuse + ProgressBarStack | P1-S1-T2 |
| Tickbox receiving | PO detail page | P1-S2-T1 |
| PR-from-BOM | Bulk modal từ BOM grid | P2-S7-T3 |
| Material/Process | Bảng riêng + admin UI | P2-S4-T1 + T2 |
| Note phase 1 | metadata.notes mảng | P1-S2-T2 (importer V1) |
| Note phase 2 | bom_line_note table | P2-S7-T1 |
| Drilldown | Redirect filter pre-applied | P1-S1-T2 |
| WO approval | Copy pattern PO metadata | P2-S7-T2 |
| Kế toán | Payment log + aging only | P2-S8-T1 |

---

## 10. Kết luận

Plan này triển khai chi tiết Phương án C — Hybrid lean với 2 phase × 8 tuần. Phase 1 (3 tuần) ship 4 quick win không đụng schema. Phase 2 (5 tuần) ship 6 deliverable với 6 migration (`0017`→`0022`).

**Quy trình thực thi tiếp theo:**
1. User trả lời 5 câu §1.4 (đặc biệt Q2 — Kế toán scope).
2. Sau khi user duyệt plan này → `/cook` agent mở branch `feat/v2.0-phase1-w1` bắt đầu P1-S1-T1.
3. Mỗi sprint end: cập nhật `PROGRESS.md`, tag git, gửi user demo Loom.
4. Phase 1 release tag `v2.0-phase1` sau 3 tuần. Phase 2 release tag `v2.0` sau 8 tuần.

**File path tham chiếu:**
- Plan này: `c:/dev/he-thong-iot/plans/redesign-v3/implementation-plan.md`
- Brainstorm gốc: `c:/dev/he-thong-iot/plans/redesign-v3/brainstorm.md`
- Convention plan: `c:/dev/he-thong-iot/CLAUDE.md` + `c:/dev/he-thong-iot/PROGRESS.md`
- Style reference: `c:/dev/he-thong-iot/plans/v1.7/v1.7-beta-plan.md`

---

*Implementation plan by planner agent — 2026-04-25.*
