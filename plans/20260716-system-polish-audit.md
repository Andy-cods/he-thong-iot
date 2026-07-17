# 🔍 System Polish Audit — Rà soát toàn diện đưa hệ thống lên "chính thức hoàn thiện"

- **Ngày:** 2026-07-16
- **Phạm vi:** apps/web, apps/worker, packages/db, packages/shared (đọc-only, KHÔNG sửa code)
- **Phương pháp:** 6 researcher agent quét song song 7 trục (bug server · worker+migration drift · design system · light/dark · dở dang+dead code · UX+tiếng Việt · production-readiness)
- **Tham chiếu codexdo:** task V3.11.1 (codexdo.md ~dòng 153) ghi nhận việc user yêu cầu plan này; audit_action enum đã fix ở migration 0052 (không lặp lại ở đây). Không có task trùng.
- **Quy ước:** `P0` = mất/sai dữ liệu, lỗ hổng bảo mật, chữ không đọc được · `P1` = cần trước khi tuyên bố hoàn thiện · `P2` = nice-to-have. Công: `S` ≈ ≤0.5 ngày · `M` ≈ 1–2 ngày · `L` ≈ 3–5 ngày.

---

## (a) Tóm tắt điều hành

Hệ thống **chạy được và nghiệp vụ chính hoạt động**, nhưng chưa đạt mức "chính thức hoàn thiện" vì 4 nhóm vấn đề:

1. **An toàn dữ liệu & bảo mật (nghiêm trọng nhất):** mật khẩu 6 user production hardcode trong git; seed script chạy lại sẽ reset mật khẩu admin; 1 điểm SQL injection; luồng nhận hàng PWA có thể **mất dữ liệu scan vĩnh viễn**; BOM/Item import còn 2 con đường mất/nhân đôi dữ liệu (transaction poison + retry không idempotent — sự cố của Đức V3.11.2 chỉ là 1 triệu chứng); nghi thiếu enum `public.item_type` TOOL/PACKAGING trên prod (đúng pattern đã gây sự cố audit_action).
2. **Race condition có hệ thống:** pattern check-then-act không lock lặp ở ~10 chỗ (double-issue kho, over-reserve, sinh số chứng từ COUNT+1 trùng ở 5 nơi: PO/receipt/MR/WO/paper_form_no) — nên fix 1 lần bằng helper chung (advisory lock / sequence).
3. **Dark mode mới phủ ~30% trang:** dark mode bật thật từ V3.7.67 nhưng ~70% trang viết trước đó chưa migrate → heading đen-trên-đen, card trắng chói; kể cả 2 component global (NotificationBell, CommandPalette). Đã có checklist từng trang ở mục (d).
4. **Nợ dọn dẹp & nhất quán:** ~10 cụm dead code xoá an toàn (mục c); tên công ty trên PO PDF **thiếu "TOÀN CẦU"** (chính là "lỗi chính tả" user báo); nhãn không nhất quán (3 tên cho 1 trang Đề xuất vật tư, NCC vs Nhà cung cấp, VNĐ vs VND…).

**Lộ trình đề xuất:** 3 sprint ≈ **5–6 tuần** (1 dev) — Sprint 1 chặn mất dữ liệu/bảo mật (P0), Sprint 2 race + RBAC + dark mode màn hình chính (P1), Sprint 3 dọn dẹp + đồng bộ design + a11y (P2). Chi tiết mục (e).

---

## (b) Bảng phát hiện theo 7 trục

### Trục 1 — Đúng đắn & lỗi (server apps/web)

#### Warehouse / Tồn kho

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| 1.1 | `apps/web/src/server/repos/inventory.ts:69` + `api/inventory/balance/route.ts:26-36` | **SQL injection**: `itemIds` nội suy raw vào `sql.raw(ARRAY['${x}'::uuid])`, route chỉ split CSV không validate UUID | **P0** | Validate `z.string().uuid()` từng phần tử + đổi sang `= ANY(${itemIds})` bind param | S |
| 1.2 | `apps/web/src/app/api/receiving/events/route.ts:71-76` | **Mất dữ liệu nhận hàng vĩnh viễn**: ack + insert `receiving_event` (tiêu scanId) TRƯỚC `postReceivingAtomic`; nếu post fail thì retry cùng scanId bị coi duplicate → skip mãi mãi | **P0** | Chỉ ack sau khi post thành công; duplicate mà metadata chưa có `inventoryTxnId` → re-post | M |
| 1.3 | `apps/web/src/app/api/warehouse/issue-request/[id]/approve/route.ts:48-61,133-142` | Double-issue: check `PENDING` ngoài tx, UPDATE cuối không `WHERE status='PENDING'` → 2 duyệt đồng thời xuất kho 2 lần | P1 | Check trong tx + UPDATE điều kiện returning, 0 row → 409 | S |
| 1.4 | `apps/web/src/app/api/warehouse/issue/route.ts:73-89` | Race tồn âm: đọc `bin_inventory` rồi insert OUT_ISSUE không lock | P1 | `pg_advisory_xact_lock` theo lot (như reservations) | M |
| 1.5 | `apps/web/src/server/repos/receivingEvents.ts:140-149,299-304` | Guard over-delivery 120% đọc poLine không FOR UPDATE → nhiều scan song song vượt trần | P1 | `SELECT ... FOR UPDATE` PO line đầu tx | S |
| 1.6 | `apps/web/src/server/repos/receivingEvents.ts:386-391` | QC OK khi nhận một phần → snapshot line `AVAILABLE` toàn bộ dù `received < gross_required` | P2 | Chỉ set AVAILABLE khi đủ qty, còn lại giữ INBOUND_QC | S |
| 1.7 | `apps/web/src/app/api/receiving/events/route.ts:101-110` | PO có 2 line cùng item → `limit(1)` cộng `received_qty` nhầm line | P2 | Ưu tiên line còn thiếu, order by lineNo | S |
| 1.8 | `apps/web/src/server/repos/receivingEvents.ts:169-174` | `receipt_no` sinh `COUNT(*)+1` → race trùng số (cùng lỗi WO đã fix V3.7.73) | P2 | Gộp vào fix chung sinh số chứng từ (xem 1.21) | S |
| 1.9 | `apps/web/src/app/api/warehouse/bins/[id]/adjust/route.ts:148-175` | MINUS chỉ pick 1 lot lớn nhất → bin đủ tổng nhưng nhiều lot vẫn báo INSUFFICIENT; kèm race check-then-act | P2 | Loop trừ dần nhiều lot hoặc báo "cần chọn lot" | M |
| 1.10 | `apps/web/src/app/api/warehouse/bins/[id]/transfer/route.ts:74-91` | Check tồn rồi insert TRANSFER ngoài tx/lock → chuyển quá tồn khi concurrent | P2 | Gộp vào tx + advisory lock lot | S |

#### Reservation / Assembly / WO

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| 1.11 | `apps/web/src/server/repos/reservations.ts:209-231` | Over-reserve: load snapshot line TRƯỚC advisory lock; ghi `String(reserved + qty)` từ giá trị cũ → lost update | P1 | Re-select sau lock hoặc `SET reserved_qty = reserved_qty + qty` kèm guard SQL | S |
| 1.12 | `apps/web/src/server/repos/reservations.ts:373-429` | `releaseReservation` cùng pattern đọc-trước-lock → lost update | P2 | SQL decrement | S |
| 1.13 | `apps/web/src/server/repos/assemblies.ts:139-183` | Idempotency check `offlineQueueId` trước lock → 2 request trùng đồng thời: cái sau vỡ unique → 500 thay vì 200 idempotent | P2 | Catch unique violation trả idempotent | S |
| 1.14 | `apps/web/src/server/repos/assemblies.ts:306-334` | Lock theo LOT nhưng update snapshot line read-modify-write → 2 scan cùng line khác lot mất update | P2 | SQL increment như versionLock | S |
| 1.15 | `apps/web/src/server/repos/workOrders.ts:233-242,341-350` | `wo_no` MAX+1 không lock → unique violation 500 | P2 | Gộp fix chung sinh số (1.21) | S |
| 1.16 | `apps/web/src/server/repos/orders.ts:229-241` | `closeOrder` không guard status: CANCELLED/DRAFT vẫn CLOSED được | P2 | Thêm WHERE status hợp lệ | S |
| 1.17 | `apps/web/src/server/repos/materialRequests.ts:213-217` | `if (!update.pickedBy)` check object in-memory thay vì DB → ghi đè người pick gốc | P2 | `pickedBy = COALESCE(picked_by, ${actor})` | S |
| 1.18 | `apps/web/src/server/repos/materialRequests.ts:226-245` + `api/material-requests/[id]/transition/route.ts:65-78` | Transition check-then-act + update line không check thuộc request | P2 | UPDATE điều kiện status + `AND request_id=` | S |

#### PR / PO (tính tiền)

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| 1.19 | `apps/web/src/server/repos/purchaseOrders.ts:263-273` | `replacePOLines` **không làm tròn tiền**: float thô `"1234.56000...02"` vào numeric, khác `computeLineTotal` (round 2) ở createPO → tổng tiền lệch giữa 2 đường tạo/sửa | P1 | Dùng `computeLineTotal` thống nhất + cộng tổng từ giá trị đã round | S |
| 1.20 | `apps/web/src/app/api/purchase-orders/[id]/route.ts:116` | PATCH cho set `status` bất kỳ khi DRAFT → bypass sendPO/receiving guard, không set sentAt → thống kê spend sai | P1 | Whitelist transition hoặc bỏ status khỏi PATCH | S |
| 1.21 | `apps/web/src/server/repos/purchaseOrders.ts:727-732` (+ 1.8, 1.15, 1.28, 1.29) | `poNo` COUNT+1 race trùng số — **pattern lặp 5 nơi**: PO, receipt, MR, WO, paper_form_no | P1 | Helper chung `genDocNo(prefix)` dùng advisory lock/sequence, áp cho cả 5 | M |
| 1.22 | `apps/web/src/server/repos/purchaseOrders.ts:634-636` | `poNo` từ PR: 2 PR trùng 4 ký tự cuối cùng tháng → collision rollback cả convert | P2 | Retry/discriminator (gộp 1.21) | S |
| 1.23 | `apps/web/src/app/api/purchase-orders/[id]/route.ts:127-155` | Update header + `replacePOLines` không cùng tx → fail giữa chừng lệch header/lines | P2 | Bọc chung db.transaction | M |
| 1.24 | `apps/web/src/server/repos/purchaseOrders.ts:813-895` | submit/approve/rejectPO read-modify-write metadata không tx → approve+reject đồng thời mất record | P2 | `jsonb_set` 1 câu SQL có điều kiện | M |
| 1.25 | `apps/web/src/server/repos/purchaseOrders.ts:652-664` | PO từ PR không set giá → header 0đ → KPI totalSpend/pendingSpend thiếu tiền | P2 | Copy `estimatedUnitPrice` từ PR line làm giá tạm | M |
| 1.26 | `apps/web/src/app/api/purchase-orders/from-pr/[prId]/route.ts:45-54` | `catch {}` nuốt lỗi parse body → convert dùng NCC khác lựa chọn user | P2 | Trả 422 khi body có nội dung nhưng parse fail | S |
| 1.27 | `apps/web/src/app/api/purchase-orders/from-bom-line/[lineId]/route.ts:37,94-96` | `expectedEta` string tự do → Invalid Date → `toISOString()` throw 500 | P2 | Schema `dateStringOrDate` | S |
| 1.28 | `apps/web/src/app/api/purchase-orders/[id]/pdf/route.ts:64-69,88` | PDF: `taxRate ?? 0` với line cũ null → in VAT=0 dù DB lineTotal có 8%; định nghĩa lineTotal (trước/sau thuế) lệch giữa PDF và DB | P2 | Chuẩn hoá 1 định nghĩa lineTotal + backfill taxRate null | M |
| 1.29 | `packages/db/migrations/0046` + `purchaseRequests.ts:353-380` | `gen_pr_paper_form_no` MAX+1 không lock/unique → trùng số phiếu giấy | P2 | Unique index + retry (gộp 1.21) | S |
| 1.30 | `apps/web/src/app/api/purchase-requests/[id]/route.ts:91-135` | PATCH không check ownership (GET có) → sửa được phiếu người khác; header+lines không cùng tx | P2 | Ownership check + tx + WHERE status DRAFT/SUBMITTED | M |

#### BOM / ECO / Snapshot / Production

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| 1.31 | `apps/web/src/server/repos/ecoChanges.ts:361-388` vs `snapshots.ts:125-137` | ECO ADD_LINE push node thiếu `level`/`parentLineId` mà explode yêu cầu → explode revision sau ECO vỡ NOT NULL hoặc tính sai; REMOVE_LINE để orphan children bị drop im lặng | P1 | Chuẩn hoá 1 format frozen_snapshot (flat + parentLineId + level), REMOVE_LINE xoá subtree | M |
| 1.32 | `apps/web/src/server/repos/snapshots.ts:95-108` | Guard chống explode đôi không có unique constraint → 2 explode đồng thời nhân đôi required/shortage | P2 | Unique partial index (order_id, revision_id) | S |
| 1.33 | `apps/web/src/server/repos/bomLines.ts:285-404` | `moveLine` không validate newPosition; `isDescendantOf` dùng `db` ngoài tx | P2 | Clamp position + truyền tx | S |
| 1.34 | `apps/web/src/server/services/derivedStatus.ts:138` | `recv_qty = SUM(received + qc_pass)` **đếm đôi** → milestone purchased đạt sớm | P2 | `GREATEST(received, qc_pass)` hoặc chỉ received | S |
| 1.35 | `apps/web/src/server/services/derivedStatus.ts:86-96` | `req_per_unit` không nhân cây cha → required sai cho BOM đa cấp | P2 | Nhân cumulative theo parent chain | M |
| 1.36 | `apps/web/src/server/services/derivedStatus.ts:313-321` | `syncDerivedStatusToLines` UPDATE loop N+1 | P2 | 1 câu UPDATE...FROM VALUES | S |
| 1.37 | Nhiều route (`purchase-orders/[id]/pdf:28`, `receiving/[poId]/approve:53`, `purchase-requests/[id]:37,98`, eco/*) | `params.id` không validate UUID → Postgres 22P02 → 500 thô thay vì 400 | P2 | Helper `assertUuid` dùng thống nhất | M |
| 1.38 | `apps/web/src/server/repos/materialRequests.ts:166-172` | `request_no` COUNT+1 race | P2 | Gộp 1.21 | S |
| 1.39 | `apps/web/src/app/api/receiving/events/route.ts:163-182` | `await writeAudit` trong loop: audit fail → event bị reject dù inventory ĐÃ commit → FE hiểu nhầm | P2 | Fire-and-forget audit | S |
| 1.40 | `apps/web/src/server/repos/purchaseOrders.ts:521-609` | `createPOFromPR` N+1 trong tx (find-or-create từng dòng + 3 lần re-select) → giữ lock lâu | P2 | Batch lookup in-array | M |

### Trục 1B — Worker + DB drift (apps/worker, packages/db, packages/shared)

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| W.1 | `apps/worker/src/jobs/bomImport.ts:383-574` | **Transaction poison chưa fix triệt để**: lỗi DB bất kỳ (FK, enum thiếu, numeric overflow, unique) abort cả tx; row trước đó đếm success nhưng bị rollback im lặng → batch "done" mà bom_line không tồn tại. Guard SKU>64 (V3.11.2) chỉ chặn 1 nguyên nhân | **P0** | Savepoint per-row (`tx.transaction(...)` lồng của Drizzle) hoặc validate hết rồi bulk-insert | M |
| W.2 | `apps/worker/src/jobs/itemImport.ts:143-159` | Cùng pattern poison với chunk 500 rows | **P0** | Savepoint per-row | M |
| W.3 | `apps/worker/src/jobs/bomImport.ts:547` + `bomImportQueue.ts:27` | **Retry không idempotent**: attempts=3, attempt 2 sau crash/stall insert lại toàn bộ bom_line → **nhân đôi BOM** | **P0** | Đầu job xoá line cũ theo `importedFromBatch` metadata, hoặc unique index | M |
| W.4 | `packages/db/migrations/0002b_item_master.sql:19-20` | `TOOL`/`PACKAGING` chỉ ADD VALUE vào `app.item_type` — đúng pattern 0005a/0006a từng làm mất 15 giá trị audit_action → **nghi `public.item_type` trên prod thiếu 2 giá trị** → tạo/import item loại này fail (và poison chunk theo W.1) | **P0 (verify)** | Verify enum trên prod; thiếu → migration 0053 catch-up `ALTER TYPE public.item_type ADD VALUE IF NOT EXISTS` | S |
| W.5 | `apps/worker/src/jobs/bomImport.ts:26,60` | `duplicateMode` nhận từ payload nhưng KHÔNG dùng → re-import cùng file append trùng line | P1 | Implement skip/error hoặc bỏ field | M |
| W.6 | `apps/worker/src/index.ts:142-161` | Handler failed (V3.11.2) set batch="failed" ngay attempt 1 dù còn retry → UI nhấp nháy failed↔committing + race ghi đè | P1 | Chỉ set failed khi `job.attemptsMade >= attempts` | S |
| W.7 | `apps/worker/src/index.ts:189-200` + `deploy/docker-compose.yml` (worker) | Docker grace mặc định 10s < job import >60s → SIGKILL giữa tx → batch kẹt committing + kích hoạt W.3 | P1 | `stop_grace_period: 120s` + đóng pg client | S |
| W.8 | `apps/worker/src/jobs/bomImport.ts:504-511` | PIC lookup ILIKE substring không ORDER BY → "Anh" khớp cả "Vương Anh"/"Tuấn Anh", gán sai người | P1 | Exact match trước, >1 match → NULL giữ assignedToName | S |
| W.9 | `packages/db/src/schema/master-data.ts:28,88` vs `migrations/0017:63` | `process_master.pricing_unit`: TS = pgEnum, SQL = VARCHAR(32) — drift thật, drizzle-kit push tương lai sinh ALTER nguy hiểm | P1 | Đổi TS về varchar(32) (khớp bom_sheet_process_row) hoặc migration convert | M |
| W.10 | 18 enum SQL tạo trong `app.*` vs Drizzle khai `public` (barcode_type, bom_status, purchase_request_status, lot_status, eco_*, qc_*, bom_sheet_kind…) | Nguy cơ tồn tại đôi app.X + public.X lệch giá trị | P1 | Audit 1 lần `pg_type`/`pg_namespace` trên prod, hợp nhất 1 schema | M |
| W.11 | 23 bảng TS không có CREATE TABLE ở migration nào (item, supplier, purchase_order, work_order, session…) | Fresh deploy bằng apply-sql-migrations.sh một mình sẽ fail | P1 | Ghi bootstrap order (drizzle push → SQL) vào deploy/README hoặc generate baseline | M |
| W.12 | `apps/worker/src/index.ts:10-27` | OTel start sau static import (hoist) + postgres.js không có instrumentation → DB span không bao giờ có; comment sai | P2 | Dynamic-import module job sau SDK, hoặc sửa kỳ vọng | S |
| W.13 | `apps/worker/src/jobs/bomImport.ts:107,186` | Fallback `BOM-${sheetName}` không sanitize (fail BOM_CODE_REGEX phía web); biểu thức chết `+ (i===0?0:0)` | P2 | Sanitize + xoá dead expr | S |
| W.14 | `apps/worker/src/jobs/itemImport.ts:105-115` | Retry merge errorJson attempt trước → error trùng lặp | P2 | Reset errorJson khi set committing | S |
| W.15 | `apps/worker/src/telemetry.ts:105-106` + `index.ts:202-203` | 2 bộ handler SIGTERM song song; `process.exit(0)` có thể chạy trước `sdk.shutdown()` | P2 | Gộp shutdown chung | S |
| W.16 | `deploy/scripts/apply-sql-migrations.sh:67` + numbering | Sort lexical: `0003b2` chạy TRƯỚC `0003b_`; gap 0009/0020-0024/0039-0041 gây nhiễu audit | P2 | Rename/ghi chú README migrations | S |
| W.17 | `packages/db/migrations/0028:22` | Guard `'app.bom_sheet_kind'::regtype` throw nếu type không tồn tại — không idempotent | P2 | `to_regtype(...) IS NOT NULL` | S |
| W.18 | `packages/db/src/schema/production.ts` vs `0016:9-10` | Thứ tự enum work_order_status TS ≠ prod → ORDER BY theo enum khác kỳ vọng | P2 | Tránh ORDER BY cột enum này + ghi chú | S |
| W.19 | `packages/shared/src/constants.ts:97-106` | `ROLE_LABELS` stale (4/8 role, 0 importer); `QUEUE_NAMES.ITEM_IMPORT` không dùng | P2 | Đồng bộ 8 role cho profile dùng chung / xoá key | S |

### Trục 2 — Đồng bộ Design System

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| D.1 | `RoutingPlanEditor.tsx:304`, `ProgressReportForm.tsx:122,138`, `BomProductionPanel.tsx:113,118`, `CreateOrderDialog.tsx:227`, `BomSnapshotPanel.tsx:465`, `BomAuditPanel.tsx:132,141`, `ShortagePanel.tsx:91`, `MaterialProcessSheetView.tsx:317,607`, `QcChecklistEnriched.tsx:328` | Input/textarea viết tay thay vì `ui/input` (kèm hệ quả thiếu dark:) | P1 | Thay bằng component chung | M |
| D.2 | ~208 `<button>` viết tay (BomGridPro 12, WarehouseLayoutTab 11, BomLineSheet 8, FilterBar 7, BomListTable 7…) — vd `bom/BomCardGrid.tsx:205-245` 4 icon-button tự chế giống hệt `Button variant="ghost" size="icon"` | Không dùng Button chung | P1 | Migrate dần theo module khi sửa dark mode (cùng lượt) | L |
| D.3 | `WarehouseLayoutTab.tsx:229`, `WarehouseLayout3D.tsx:366`, `scan/BarcodeScanner.tsx:13`, `ProductionBoardWidget.tsx:20` | Vết `slate-*` sót ngoài palette zinc (`/board` dùng slate cố ý — hợp lệ) | P2 | Đổi về zinc | S |
| D.4 | `login/page.tsx:34-51` (bg-[#020617], gradient hex), `purchase-requests/[id]` (13 hex), `new-mrf` (12), `new-dnvt` (7), `DnvtDetailBody.tsx` (6 — phần lớn phục vụ print) | Hex trong className | P2 | Token hoá (login giữ dark-navy cố ý nhưng đặt tên biến) | M |
| D.5 | `NotificationBell.tsx:151` rounded-2xl vs dropdown chuẩn rounded-md; input rounded-lg/sm lẫn md; card md/xl/2xl cùng ngữ cảnh (thống kê: md 276 · sm 106 · lg 87 · xl 85 · 2xl 42) | Radius lệch chuẩn | P2 | Quy ước: card=xl, input/dropdown=md, badge=full → sửa dần | M |
| D.6 | `BomLineSheet.tsx:567` (🟠), `WOQuickDialog.tsx:159,194` (ℹ️), `AccountingTab.tsx:531` (⚠️), `IssueTab.tsx:95,298` (⚠), `ConvertPRToPODialog.tsx:308` (⚠) | Emoji trộn lucide icon | P2 | Thay bằng lucide (AlertTriangle, Info) | S |
| D.7 | `components/layout/Sidebar.tsx`, `components/qc/QcChecklist.tsx`, `components/work-orders/QcChecklistEnriched.tsx`, `components/login/LoginHero.tsx` (bản mồ côi — bản thật ở `components/auth/`) | Dead code gây nhiễu audit design | P2 | Xoá (xem mục c) | S |

### Trục 3 — Light + Dark mode

> Bối cảnh: dark mode kích hoạt thật từ V3.7.67 (`ThemeProvider` + `body dark:bg-zinc-950` globals.css:194). 267 file .tsx, chỉ 46 có `dark:` → lỗi có hệ thống. PWA lock light + `/board`, `/login` dark cố ý = hợp lệ. Checklist từng trang ở mục (d).

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| T.1 | `components/layout/NotificationBell.tsx:151` | Dropdown thông báo `bg-white` 0 dark: — **global mọi trang** | **P0** | Thêm dark: theo mẫu dropdown-menu | S |
| T.2 | `components/command/CommandPalette.tsx:206` | Cmd+K palette `bg-white` 0 dark: — global | **P0** | Thêm dark: | S |
| T.3 | ~30 trang: `material-requests/page.tsx:117-121`, `me/profile:99-105`, `receiving/*`, `admin/page.tsx:320`, admin/users, admin/audit… | PATTERN LỚN: heading `text-zinc-900` trên nền trang → **đen-trên-đen ở dark** | **P0** | Tìm-thay có hệ thống: thêm `dark:text-zinc-50` hoặc bỏ class kế thừa body | L |
| T.4 | `components/sales/AccountingTab.tsx` (43 chỗ), `POTab.tsx` (17), `SuppliersTab.tsx` (14) | Toàn hub `/sales` 0 dark: | **P0** | Migrate theo mẫu BomTab | L |
| T.5 | `components/bom-workspace/**` 0/15 file có dark: (TopTabBar:32, BomWorkspaceTopbar:179, panels/*) | Toàn BOM workspace `/bom/[id]` light-only | **P0** | Migrate | L |
| T.6 | `components/warehouse/` OverviewTab (17), ReceivingTab (11), IssueTab (7), ReportTab (6), LotSerialTab (6), ReceivingHistoryDrawer (7) | 6/7 tab kho light-only (ItemsTab ✅) | **P0** | Migrate theo mẫu ItemsTab | L |
| T.7 | `engineering/WorkOrdersTab.tsx` (12), `PRTab.tsx` (6) | 2/3 tab engineering light-only | **P0** | Migrate theo BomTab | M |
| T.8 | `procurement/purchase-orders/[id]/page.tsx` (18 bg-white) | Trang chi tiết PO light-only (PR [id] đã ✅ 63 dark: — dùng làm mẫu) | **P0** | Migrate | M |
| T.9 | `assembly/[woId]/page.tsx` (10) + `AssemblyConsole.tsx:418` | Console lắp ráp light-only | **P0** | Migrate | M |
| T.10 | Toàn khu `admin/**`: page (13), users (8), users/[id], audit (8), settings (3), reports/* (13+7+6) | Admin light-only (me/settings chứa ThemeToggle lại ✅) | **P0** | Migrate | L |
| T.11 | `receiving/*` (6+13), `material-requests/*` (9+6), `notifications`, `me/profile` (7), `me/productivity` (11), `suppliers/[id]` (6), `items/[id]:127-314`, `items/new`, `lot-serial/*` | Các trang còn lại 0 dark: | **P0** | Migrate | L |
| T.12 | `items/ImportWizard.tsx` (12), `bom-import/BomImportWizard.tsx` (12), `bom/BomCardGrid.tsx:121-336`, `MaterialProcessSheetView.tsx` (6), `BomTreeView.tsx:446`, `QcChecklistEnriched.tsx:377-557` | Component nghiệp vụ light-only | **P0** | Migrate | L |
| T.13 | `admin/AuditDiffViewer.tsx:92-94` | Hard-code `diffViewerBackground: "#ffffff"` + 24 hex light | P1 | Map theme → 2 bảng màu theo `data-theme` | M |
| T.14 | `warehouse/WarehouseLayout3D.tsx` (123 hex + style inline) + `WarehouseLayoutTab.tsx:728,789` | Sơ đồ kho 3D bảng màu riêng không theo theme | P1 | Theme-aware palette hoặc chấp nhận light-only có nền riêng | L |
| T.15 | `dashboard/Sparkline.tsx:36-48` | 9 hex light trong dashboard vốn dark-ready | P2 | Đổi sang CSS var/prop theo theme | S |

### Trục 4 — Tính năng dở dang

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| F.1 | `apps/web/src/app/pwa/receive/[poId]/page.tsx:127` | `trackingMode: "none"` hardcode cho mọi PO thật → PWA receive bỏ qua lot/serial tracking | P1 | Join `item.tracking_mode` từ API /api/po/[id] | M |
| F.2 | `pwa/receive/[poId]/page.tsx:101-111` + `ReceivingTab.tsx:272` + `pwa/page.tsx:29` | Link `/pwa/receive/demo` + banner "stub V1.1-alpha" vẫn ship prod | P2 | Gỡ link demo + banner lỗi thời | S |
| F.3 | `api/po/[id]/route.ts:14-15` | Fallback demo stub `demo|demo-small|demo-large` trong route prod | P2 | Gate NODE_ENV hoặc xoá | S |
| F.4 | `app/login/page.tsx:98,101` | 2 link footer `href="#"` (Chính sách/Điều khoản) — nút chết | P2 | Trỏ trang thật hoặc bỏ | S |
| F.5 | `hooks/useItems.ts:322-336` | Bulk delete = loop DELETE tuần tự (TODO V1.1 endpoint bulk chưa có) | P2 | Endpoint `/api/items/bulk` | M |
| F.6 | `api/purchase-orders/[id]/send/route.ts:15,47` | "Gửi PO" chỉ mark SENT, không gửi email | P2 | Quyết định: email thật hoặc đổi label "Đánh dấu đã gửi" | M |
| F.7 | `admin/RollbackPreviewDialog.tsx:4,116` | Rollback đa số action trả "chưa hỗ trợ" | P2 | Ẩn nút với action không hỗ trợ | M |
| F.8 | `server/repos/qcChecks.ts:11` | QC hardcode 3 checkpoint (stub V1.3) đang phục vụ flow thật | P2 | Chuyển checkpoint sang config/DB | M |
| F.9 | `apps/worker/src/index.ts:97-111` | assemblyScanWorker stub "tuần 8" — KHÔNG có producer nào enqueue → hạ tầng chết | P2 | Xoá worker+queue (scan đã xử lý sync qua API) | S |
| F.10 | `engineering/BomTab.tsx:66,188` | Filter dateRange/minComponents chạy client-side → sai khi phân trang | P2 | Đẩy filter xuống API | M |
| F.11 | `server/services/poPdf.tsx:98` | Thông tin công ty hardcode (TODO admin settings) | P2 | Làm ở V-next như comment | M |
| F.12 | `orders/[code]/page.tsx:104-107` (comment stale "stub Phase B2+B3"), `snapshot.test.ts:266-274` (test stub return true) | Comment/test giả gây nhiễu | P2 | Sửa comment, viết test thật hoặc xoá | S |

### Trục 5 — Dọn dẹp: xem mục (c) riêng bên dưới

### Trục 6 — UX & tiếng Việt

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| U.1 | `server/services/poPdf.tsx:101` | **Tên pháp nhân sai trên Đơn đặt hàng gửi NCC**: "CÔNG TY CP SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ" → thiếu "TOÀN CẦU", "CP" ≠ "CỔ PHẦN" như 2 PDF kia. **Đây chính là "lỗi chính tả" user báo** | **P0** | Sửa thành "CÔNG TY CỔ PHẦN SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU" | S |
| U.2 | `server/services/ycvtPdf.tsx:617` + `ycvtExportExcel.ts:257` | "Director approved" tiếng Anh thô trong PDF/Excel tiếng Việt | P1 | → "Giám đốc đã duyệt" (web đã đúng tại purchase-requests/[id]:792) | S |
| U.3 | `procurement/purchase-requests/new-dnvt/page.tsx:101` | "Bộ Phận Mua Hàng" viết hoa sai quy tắc | P1 | → "Bộ phận Mua hàng" | S |
| U.4 | `work-orders/new-lsx/page.tsx:374→635` | Phiếu LSX in đánh số mục I, II, III, **V**, VI, VII — thiếu IV; comment 632 ghi "VIII" nhưng heading "VII" | P1 | Đánh lại số liên tục | S |
| U.5 | `lib/nav-items.ts:124` "Đề xuất vật tư" vs breadcrumb "Yêu cầu mua hàng" (`new-mrf:253`, `[id]:295`) vs h1 "Phiếu Yêu cầu Vật tư (YCVT)" (`new-mrf:262`) | **3 tên cho 1 trang** (tiêu đề in là "PHIẾU ĐỀ XUẤT VẬT TƯ — NPL") | P1 | Chốt 1 tên "Đề xuất vật tư" toàn hệ | M |
| U.6 | `dnvtPdf.tsx:486` + `new-dnvt:607` "Mẫu No:"; `poPdf.tsx:324` "P.O. Number" | Anh-Việt lẫn trong phiếu | P2 | "Mẫu số:" / "Số P.O." | S |
| U.7 | `ycvtPdf.tsx:455` "SL" vs `dnvtPdf.tsx:365` "SL YC" vs `poPdf.tsx:426` "Số lượng"; `ycvtPdf.tsx:461` "Đơn giá DK"; VNĐ (`ycvtPdf:524`) vs VND (`poPdf:482`) | Nhãn cột phiếu không nhất quán | P2 | Thống nhất: "SL YC", "Đơn giá dự kiến", "VND" | S |
| U.8 | ~60 chỗ "Xoá/Huỷ/tuỳ" vs 19 chỗ (12 file) "Xóa/Hủy/tùy" (vd `QcChecklist.tsx:99`, `admin/page.tsx:239`) | Biến thể oà/òa không thống nhất | P2 | Chọn chuẩn "oá" + tìm-thay | M |
| U.9 | "Mã hàng" (board) vs "Mã VT" (YCVT/LSX) vs "Mã vật tư" (export) vs "SKU" (kho) | Cùng khái niệm 4 tên | P2 | Quy ước: UI kho = SKU, phiếu in = "Mã VT" | M |
| U.10 | `hooks/useInventory.ts:49` (pattern ~15 hooks) fallback `HTTP ${status}`; `purchase-requests/[id]:450,473,1003` toast `e.message` thô; `LoginForm.tsx:94` hiển thị message server trực tiếp | Thông báo lỗi kỹ thuật/mơ hồ hiển thị cho user | P2 | Helper map status → câu tiếng Việt | M |
| U.11 | `procurement/purchase-requests/page.tsx:15` `<Suspense fallback={null}>`; `new-dnvt:209`/`new-mrf:237` preview số phiếu lỗi → im lặng "—/PRD-MRF/—" | Thiếu loading/error state | P2 | Skeleton + toast lỗi preview | S |
| U.12 | `purchase-orders/[id]:671-677` button Trash2 không aria-label; new-dnvt/mrf label là div không htmlFor; `outline-none` không focus style thay thế; `placeholder:text-zinc-300` (22 chỗ, contrast ~1.5:1); header bảng `text-zinc-400` trên `bg-zinc-50` (~2.9:1 < AA 4.5:1) | A11y cơ bản | P2 | aria-label, label htmlFor, focus-visible ring, zinc-400→500 placeholder | M |

### Trục 7 — Production-readiness

| # | Vị trí | Mô tả | Mức | Đề xuất | Công |
|---|--------|-------|-----|---------|------|
| S.1 | `apps/web/scripts/seed-prod-users-v3.7.50.ts:41-76` | **Mật khẩu 6 user PRODUCTION hardcode commit vào git** (Tien@4729, Cuong@8351, Duc@2057, Son@6184, Hoa@9023, Ketoan@5476) | **P0** | Rotate toàn bộ + xoá file khỏi repo & history (git filter-repo), chuyển env/CSV ngoài repo | M |
| S.2 | `packages/db/src/seed.ts:58-80` | Seed admin `ChangeMe!234` với `onConflictDoUpdate` set lại passwordHash — **chạy lại seed trên prod = reset mật khẩu admin**; không guard NODE_ENV | **P0** | Guard chặn prod + onConflictDoNothing; đổi mật khẩu admin prod ngay | S |
| S.3 | `server/session.ts:23-34` | getSession chỉ verify JWT không đối chiếu DB → đổi role không hiệu lực + **revoke session không thực sự chặn** (kiosk 24h) | P1 | Check sid với bảng session (cache Redis 30-60s) trong requireCan | M |
| S.4 | `api/auth/login/route.ts:118-128` | `failedLoginCount` tăng nhưng `lockedUntil` KHÔNG bao giờ set → **cơ chế khoá tài khoản không tồn tại** | P1 | Set lockedUntil sau 10 lần sai → khoá 15' | S |
| S.5 | `server/middlewares/rateLimit.ts:95-99` | Rate-limit fail-open khi Redis lỗi → Redis down = mất hoàn toàn chống brute-force login | P1 | Fail-closed riêng bucket login, hoặc fallback in-memory | S |
| S.6 | `api/health/route.ts:6-12` + `ready/route.ts:25-43` + `deploy/docker-compose.yml:124` | /health 200 tĩnh; /ready check Redis chỉ bằng `new URL()`; worker healthcheck `node -e "process.exit(0)"` — không phát hiện chết thật | P1 | /ready PING Redis thật; worker check BullMQ connection | S |
| S.7 | `deploy/scripts/install-cron.sh:35-41` | Backup ĐÃ CÓ script đầy đủ nhưng cài cron là bước THỦ CÔNG — **không có gì chứng minh cron đã cài lại trên VPS mới 45.124.94.13** (migrate 2026-04-20) | P1 | SSH verify `/etc/cron.d/hethong-iot` + backups tồn tại; thêm bước verify vào deploy.yml | S |
| S.8 | `api/warehouse/issue-request/route.ts:51,116` + warehouse/lookup·layout·fifo-pick, dashboard/* (6 routes), purchase-requests/preview-form-no:18 | Route chỉ `requireSession()` không role → role `display` (kiosk TV mật khẩu chia sẻ, phiên 24h) **POST tạo được phiếu xuất kho** + đọc dữ liệu kho/dashboard | P1 | Chuyển requireCan; tối thiểu chặn display khỏi mọi route ngoài productionBoard | M |
| S.9 | `middleware.ts:43-44` vs matcher:92-122 | `/board` + `/production-board` có PROTECTED_PREFIXES nhưng thiếu trong matcher → middleware không chạy (page shell không cần login; data API vẫn có guard) | P2 | Thêm 2 entry matcher | S |
| S.10 | `lib/env.ts:58-59` vs `.env.example:32-33` | Env drift: code đọc `R2_ACCESS_KEY` ≠ example `R2_ACCESS_KEY_ID`; example thiếu JWT_KIOSK_TTL, REDIS_CACHE_DB; lẫn 5 dòng `export CLAUDE_CODE_*` | P2 | Đồng bộ example, xoá dòng rác | S |
| S.11 | `lib/env.ts:54-60` | R2 config dead code (không có S3 client); file .xlsx gốc BOM không được lưu đâu cả (chỉ previewJson) | P2 | Bỏ R2 config hoặc lưu file gốc lên R2 | M |
| S.12 | `api/bom/imports/upload/route.ts:33` | Upload có limit 20MB nhưng không whitelist MIME/extension | P2 | Whitelist .xlsx trước khi parse | S |
| S.13 | `rateLimit.ts:98`, `services/redis.ts:37`, `poPdf.tsx:86-90` | console.warn/error thay vì pino logger — mất structured log | P2 | Thay logger.warn | S |
| S.14 | `app/(app)/layout.tsx:88` | mustChangePassword chỉ enforce ở layout — API vẫn gọi được khi chưa đổi | P2 | Check flag trong requireCan (trừ change-password) | S |
| S.15 | `scripts/seed-test-users.ts:56,95` | Seed 4 user Test@1234, không guard prod | P2 | Guard NODE_ENV | S |
| S.16 | `rbac/matrix.ts:161-172` vs `qc-checks/route.ts:58` | Role qc không có `wo:transition` nhưng POST qc-checks đòi nó → QC không tự tạo được QC check | P2 | Thêm action hoặc đổi entity check | S |

**Điểm ĐẠT (không cần sửa):** 190/193 route có guard (3 route không guard đều chủ ý: login/health/ready); login rate-limit 2 lớp + argon2id + timing-attack mitigation; JWT_SECRET qua docker secret không fallback; Postgres/Redis có volume + healthcheck thật; không hardcode secret trong src/ (ngoài scripts seed nêu trên); không catch rỗng nuốt lỗi ở server core.

---

## (c) CÓ THỂ XÓA AN TOÀN (đã grep toàn repo, 0 importer)

| Đường dẫn | Lý do |
|-----------|-------|
| `apps/web/src/components/bom-workspace/panels/ShortagePanel.tsx` | DEPRECATED TASK-016, bỏ khỏi barrel index.ts, grep chỉ match chính nó |
| `apps/web/src/components/bom-workspace/panels/EcoPanel.tsx` | DEPRECATED TASK-016, trang /bom/[id]/eco dùng component khác |
| `apps/web/src/components/bom-workspace/panels/BomSnapshotPanel.tsx` | DEPRECATED TASK-016, không importer |
| `apps/web/src/components/bom-workspace/BottomPanel.tsx` + `useBottomPanelState.ts` | Retired TASK-015, chỉ được nhắc trong comment |
| `apps/web/src/components/procurement/PoApprovalWorkflow.tsx` | 0 importer; chứa toast stub "Đã gửi PO tới NCC (stub)" |
| **Cụm dashboard V1 (7 file):** `hooks/useDashboardOverview.ts` · `api/dashboard/overview/route.ts` · `lib/dashboard-mocks.ts` · `components/domain/OrdersReadinessTable.tsx` · `AlertsList.tsx` · `SystemHealthCard.tsx` · `hooks/useHealth.ts` | Trang chủ đã dùng overview-v2; cụm này chỉ import lẫn nhau |
| `apps/web/src/components/layout/Sidebar.tsx` | AppShell dùng TopBar nav, không import Sidebar |
| `apps/web/src/components/qc/QcChecklist.tsx` + `components/work-orders/QcChecklistEnriched.tsx` | 0 importer |
| `apps/web/src/components/login/LoginHero.tsx` | Bản mồ côi (bản thật ở components/auth/) |
| `apps/web/src/hooks/useReceivingEvents.ts:139-145` export `useReceivingHistory` | Stub trả [], 0 importer |
| `apps/web/public/*.html` (homepage, trang danh mục, trang chi tiết sản phẩm, Sub-category, Yêu cầu báo giá) | Mockup tĩnh 0 reference — **đang nằm trong public/ = serve công khai trên mes.songchau.vn** → di dời `docs/mockups/` |
| `apps/web/package.json` deps `rxjs`, `zustand` | Grep toàn apps/** + packages/** 0 import |
| `.env.example:64-68` | 5 dòng `export CLAUDE_CODE_*`/DISABLE_TELEMETRY lạc vào template |
| `packages/shared/src/constants.ts` key `QUEUE_NAMES.ITEM_IMPORT` | 0 usage (chỉ ITEM_IMPORT_COMMIT dùng) |
| Worker `ASSEMBLY_SCAN_SYNC` queue + `assemblyScanWorker` (index.ts:97-111) | Stub không có producer (F.9) |

**Rác repo root (KHÔNG xoá — gitignore/di dời):** `Danh sách thống kê.xlsx`, `YCVT Z0000002-262422.xlsx` (pattern gitignore không match vì prefix "YCVT "), thư mục `po 2112520763, 2112522933 roller.../` (PDF/bản vẽ đơn hàng thật → di dời ra ngoài repo), `.claude/scheduled_tasks.lock` (đã gitignore nhưng vẫn tracked → `git rm --cached`).

**Nghi ngờ, cần user xác nhận trước khi xoá:** `packages/db/src/seed-demo.ts`, `seed-demo-po.ts`, `migrations/seed-demo-po.sql`, `seed-test-users.sql`, `seed-ketoan-user.sql`, `apps/web/scripts/seed-test-users.ts` (hữu ích dev — cần xác nhận user demo/test không còn trong DB prod); `api/purchase-requests/[id]/approve` (410 GONE chủ đích V3.9 — xoá sau 1-2 version); env `SESSION_SECRET` (khai báo nhưng chưa xác minh nơi dùng).

---

## (d) Checklist Light/Dark theo trang

| Trang | Light | Dark | Ghi chú / vị trí thiếu |
|---|:-:|:-:|---|
| Dashboard `/` | ✅ | ✅ | Chỉ Sparkline hex (P2) |
| Items list (warehouse tab) | ✅ | ✅ | ItemsTab + ItemListTable chuẩn |
| Items `[id]`, `new`, ImportWizard | ✅ | ❌ | items/[id]:127,253,295,308,314; ImportWizard 12 chỗ |
| BOM list (engineering tab) | ✅ | ✅* | BomTab ✅; *grid view BomCardGrid ❌ |
| BOM workspace `/bom/[id]` | ✅ | ❌ | 0/15 file bom-workspace có dark: |
| PR list (PRTab) | ✅ | ❌ | PRTab 6 chỗ light-only |
| PR `[id]`, `new-mrf`, `new-dnvt` | ✅ | ✅ | 63/48/36 dark: — **mẫu chuẩn để copy** |
| PO list (POTab /sales) | ✅ | ❌ | POTab 17 chỗ; cả AccountingTab (43), SuppliersTab (14) |
| PO chi tiết `[id]` | ✅ | ❌ | 18 bg-white không dark: |
| Warehouse hub | ✅ | ⚠️ | Shell + ItemsTab ✅; 6 tab còn lại ❌; Layout3D ❌ (123 hex) |
| WO chi tiết `[id]` | ✅ | ✅ | 127 dark: + print:bg-white chuẩn |
| WO list (WorkOrdersTab) | ✅ | ❌ | 12 chỗ |
| Production board | ✅ | ✅ | 33 dark: |
| Assembly `[woId]` | ✅ | ❌ | 10 chỗ + AssemblyConsole:418 |
| Receiving (list/[poId]/wizard) | ✅ | ❌ | 6+13 chỗ |
| Material requests | ✅ | ❌ | 9+6 chỗ + heading đen-trên-đen |
| Board `/board` (TV) | ➖ | ✅ | Dark-only navy **cố ý** — hợp lệ |
| Admin (tất cả trang con) | ✅ | ❌ | Toàn khu 0 dark: + AuditDiffViewer hex trắng |
| Me/settings (có ThemeToggle) | ✅ | ✅ | 37 dark: |
| Me/profile, me/productivity | ✅ | ❌ | 7 + 11 chỗ |
| Login | ✅ | ✅ | Fixed dark-navy **cố ý** (hex nên token hoá) |
| PWA `/pwa/*` | ✅ | ➖ | Lock light **cố ý** qua `[data-route="pwa"]` globals.css:177 — hợp lệ |
| Shell: TopBar | ✅ | ✅ | 14 dark: |
| Shell: NotificationBell, CommandPalette | ✅ | ❌ | **P0 global** |

---

## (e) Lộ trình sửa theo sprint

### Sprint 1 — P0: chặn mất dữ liệu + bảo mật (≈ 1 tuần)
| Việc | Findings | Công |
|------|----------|------|
| Rotate mật khẩu 6 user prod + xoá seed-prod-users khỏi git history; đổi admin password; guard prod cho seed.ts | S.1, S.2 | M |
| Fix SQL injection inventory balance | 1.1 | S |
| Fix receiving ack-trước-post (mất scan) | 1.2 | M |
| Worker: savepoint per-row (bom+item import) + idempotent retry (xoá line theo batch trước insert) | W.1, W.2, W.3 | M+M |
| Verify `public.item_type` trên prod → migration 0053 catch-up nếu thiếu | W.4 | S |
| Sửa tên công ty poPdf + "Director approved" + "Bộ Phận Mua Hàng" + nhảy số mục IV LSX | U.1–U.4 | S |
| Dark mode 2 component global: NotificationBell + CommandPalette | T.1, T.2 | S |
| SSH verify cron backup trên VPS mới | S.7 | S |

### Sprint 2 — P1: race + RBAC + dark mode màn hình chính (≈ 2 tuần)
| Việc | Findings | Công |
|------|----------|------|
| Helper chung sinh số chứng từ (advisory lock/sequence) áp 5 nơi | 1.21, 1.8, 1.15, 1.29, 1.38 | M |
| Race tồn kho: double-issue approve, issue lock, over-delivery FOR UPDATE, over-reserve | 1.3, 1.4, 1.5, 1.11 | M |
| Tiền: replacePOLines làm tròn + PATCH status whitelist | 1.19, 1.20 | S+S |
| ECO frozen_snapshot format chuẩn hoá | 1.31 | M |
| RBAC: chặn role display, session revoke hiệu lực, lockout, rate-limit fail-closed, health/ready thật | S.3–S.6, S.8 | M+S+S+S+M |
| Worker: failed-handler theo attempts, stop_grace_period, PIC lookup, duplicateMode | W.5–W.8 | M+S+S+S |
| DB drift: pricing_unit, audit enum app-vs-public 1 lần, bootstrap doc | W.9–W.11 | M+M+M |
| Dark mode đợt 1: pattern heading text-zinc-900 (tìm-thay hệ thống) + /sales hub + PO detail + warehouse tabs | T.3, T.4, T.6, T.8 | L+L |
| PWA trackingMode thật | F.1 | M |
| Thống nhất tên trang "Đề xuất vật tư" | U.5 | M |

### Sprint 3 — P2: dọn dẹp + đồng bộ + a11y (≈ 2 tuần)
| Việc | Findings | Công |
|------|----------|------|
| Xoá toàn bộ mục (c) + gitignore rác root + gỡ demo link/banner PWA | Trục 5, F.2–F.4, F.9 | M |
| Dark mode đợt 2: bom-workspace, engineering tabs, assembly, admin, receiving, material-requests, me/*, wizards | T.5, T.7, T.9–T.12 | L+L |
| AuditDiffViewer + Layout3D theme-aware (hoặc chấp nhận light có nền riêng) | T.13, T.14 | M+L |
| Design system: migrate input/button viết tay theo module, radius/emoji/slate | D.1–D.6 | L |
| Chuẩn hoá thông báo lỗi tiếng Việt + loading/empty state + a11y | U.10–U.12 | M+M |
| Nhãn nhất quán: oà/òa, SL YC, VNĐ→VND, Mã VT/SKU | U.7–U.9 | M |
| P2 còn lại theo bảng (số phiếu PDF VAT null backfill, N+1, assertUuid helper, env.example…) | 1.6–1.40 (P2), W.12–W.19, S.9–S.16 | M rải rác |

**Tổng ước lượng:** ≈ 5–6 tuần cho 1 dev full-time (Sprint 1 có thể nén còn 3–4 ngày nếu ưu tiên tuyệt đối). Sau Sprint 1, hệ thống hết rủi ro mất dữ liệu/bảo mật; sau Sprint 2 đạt mức "production-ready"; Sprint 3 là mức "chính thức hoàn thiện, đồng bộ design + light/dark 100%".
