# Đợt 1 — Kho: QC HOLD + phiếu xuất (DOT1_PLAN)

> Lập 2026-09-26 bởi agent Planner, đã đối chiếu code thật. Path tương đối `apps/web/src/` trừ khi ghi khác.
> Quyết định đã chốt: D2 bảng `goods_issue` · D3 lô cũ giữ nguyên (coi là đạt) · D4 kiểm kê rồi điều chỉnh, KHÔNG tự trừ ·
> D5 nhận trùng mã lô → tách lô `-N` · D6 menu "Yêu cầu vật tư" cho planner/operator/warehouse/admin.

## 0. Ghi chú kiểm chứng

1. **Migration không có journal**: `packages/db/migrations/*.sql` apply tay bằng `deploy/scripts/apply-sql-migrations.sh` (psql, thứ tự lexical, user `hethong_app`). Bảng mới = SQL idempotent (mẫu `0057_delivery_note.sql`) + khai Drizzle TS khớp tay. KHÔNG `drizzle-kit push/generate`. Đợt này: `0059_qc_hold.sql` (1a), `0060_goods_issue.sql` (1b).
2. `finance.test.ts` KHÔNG chạm DB thật (FakeDb in-memory + mock drizzle-orm). Test Đợt 1 = hàm thuần + FakeDb. SQL (view/trigger) kiểm bằng smoke script tay.
3. Enum `qc_flag` có thể nằm ở `public` → cột mới dùng `VARCHAR + CHECK`, không `ALTER TYPE`. `audit_action` đã có `QC_CHECK`, `ISSUE`, `RECEIVE`.
4. Trừ tồn hiện có = insert `app.inventory_txn` `tx_type='OUT_ISSUE'` + `from_bin_id` + `lot_serial_id`; view `app.bin_inventory` (0034) tự trừ; lô hết → `inventory_lot_serial.status='CONSUMED'`. Mẫu: `api/warehouse/issue/route.ts:85-145`, `issue-request/[id]/approve/route.ts:136-190`.
5. Số chứng từ race-safe có sẵn: `server/repos/_docNumber.ts` `genDocNo()` + `currentYymm()` (+07). Dùng cho `PX-YYMM-NNNN`. ISR vẫn COUNT+1 (KHO-20) → sửa kèm.
6. Khoá giữ chỗ: `app.reservation_lock(item_id)` (0006c). Đường xuất dùng `hashtext('lot:'||id)`, lắp ráp `'scan:'||id` (KHO-06) → thống nhất.
7. KHO-14: `issue-request/[id]/approve` ĐÃ hard-check admin cho `reason IN ('sales','return')`; chỉ `/api/warehouse/issue` chưa chặn.
8. Wizard nhận hàng đã gửi `metadata.poLineId` nhưng server bỏ qua (KHO-09). Nút "Điền tất cả" set `qcStatus:"OK"` (`receiving/[poId]/wizard/page.tsx:~163`) → phải chặn ở server.
9. `/material-requests` guard = `["admin","planner","warehouse"]`; `POST /api/material-requests` dùng `requireSession(req,"admin","planner")` (role cứng).
10. Hold/Release lô dùng `requireCan("update","reservation")` (admin+planner). Role qc không có entity kho nào.

## 1. Thiết kế

### 1.1 Trạng thái lô & QC nhập
- Giữ enum status lô; thêm `hold_code VARCHAR(24)` ∈ `QC_PENDING | QC_FAIL | MANUAL | NULL`.
- Nhận hàng: mọi lô mới `HOLD` + `hold_code='QC_PENDING'`, trừ khi người nhận có `approve:qcInspection` và chọn OK → AVAILABLE.
- Client gửi `OK` mà không có quyền QC → hạ về PENDING (không lỗi), `metadata.qcDowngraded=true`. `NG` → HOLD/`QC_FAIL`, dòng `qc_status='FAIL'`.
- Mỗi dòng phiếu nhập ↔ 1 lô (nhờ D5): cột mới `inbound_receipt_line.lot_serial_id`. QC quyết theo dòng.
- PASS: lô HOLD(QC_PENDING|QC_FAIL) → AVAILABLE, `hold_code=NULL`. FAIL: HOLD/`QC_FAIL`. Cho FAIL→PASS; không PASS→FAIL (dùng HOLD thủ công).
- `inbound_receipt.qc_flag` tính lại sau mỗi quyết định (KHO-15): có FAIL → FAIL; còn PENDING → PENDING; còn lại PASS. `qc_status NULL` (dòng cũ) = đạt.
- D3: lô cũ giữ nguyên, dòng cũ `qc_status NULL` không hiện ở "Chờ QC".

### 1.2 D5 — mã lô trùng
- `LOT-A` đã có (cùng item) → `LOT-A-2`, `-3`… Advisory lock `hashtext('lotcode:'||item_id||':'||base)`; unique `inventory_lot_uk (item_id, lot_code)` chốt cuối.
- `receivingEventSchema.lotNo` `max(128)` → `max(56)` (KHO-30).

### 1.3 Guard chung `server/repos/stockGuard.ts`
1. Khoá `app.reservation_lock(item)` từng item distinct, **sắp xếp theo id**.
2. `SELECT id,item_id,status,hold_code FROM app.inventory_lot_serial WHERE id = ANY($lots) ORDER BY id FOR UPDATE`.
3. `evaluateIssuable()` thuần: lô tồn tại + đúng item; status ∈ `allowStatuses` (mặc định `['AVAILABLE']`); mỗi (bin,lô) tổng pick ≤ `bin_inventory.qty_on_hand`; mỗi lô tổng pick ≤ `on_hand − reserved_active + ownReservationAllowance`.
4. Lỗi `StockGuardError(code, msg tiếng Việt, 409)`: `LOT_NOT_FOUND | ITEM_MISMATCH | LOT_NOT_AVAILABLE | INSUFFICIENT_BIN | INSUFFICIENT_FREE`.

```ts
export interface IssuePick { itemId: string; lotSerialId: string; binId: string; qty: number }
export class StockGuardError extends Error { constructor(public code: StockGuardCode, msg: string, public status = 409) }
export async function assertIssuable(tx: Tx, picks: IssuePick[], opts?: {
  allowStatuses?: LotStatus[];                                   // ADJUST_MINUS admin: ['AVAILABLE','HOLD']
  ownReservations?: Array<{ lotSerialId: string; qty: number }>; // lắp ráp tiêu hao giữ chỗ của chính nó
}): Promise<void>
export function evaluateIssuable(input: {...}): StockGuardError | null   // thuần
export async function postOutboundTxns(tx: Tx, picks: IssuePick[], meta: {
  txType: "OUT_ISSUE" | "ASSEMBLY_CONSUME" | "ADJUST_MINUS"; refTable: string; refId: string; postedBy: string; notes?: string | null;
}): Promise<string[]>   // insert inventory_txn rồi markLotsConsumedIfEmpty
export async function markLotsConsumedIfEmpty(tx: Tx, lotIds: string[]): Promise<number>
export function mapDbGuardError(err: unknown): StockGuardError | null // 'LOT_NOT_ISSUABLE…' → LOT_NOT_AVAILABLE
```
- Bỏ advisory lock `'lot:'`/`'scan:'`. Thứ tự khoá: item (sorted) → lô (sorted). `SET LOCAL lock_timeout='5s'`; 55P03 → 409 "Đang có thao tác khác, thử lại".
- Lưới an toàn DB: trigger `BEFORE INSERT ON app.inventory_txn` chặn `OUT_ISSUE|ASSEMBLY_CONSUME|PROD_OUT` vào lô ≠ AVAILABLE (`ADJUST_MINUS` không chặn — admin huỷ hàng HOLD; chặn ở code). Giữ thứ tự insert txn TRƯỚC rồi mới set CONSUMED.

### 1.4 Công thức tồn chuẩn (KHO-16)
- `app.v_lot_stock`: `lot_serial_id, item_id, status, hold_code, lot_code, exp_date, created_at, on_hand, reserved, issuable_qty`; `on_hand` = IN_RECEIPT+ADJUST_PLUS+PROD_IN − OUT_ISSUE−ADJUST_MINUS−PROD_OUT−ASSEMBLY_CONSUME; `issuable_qty = AVAILABLE ? GREATEST(on_hand−reserved,0) : 0`. Index mới `inventory_txn_lot_idx`.
- `app.v_item_stock`: `item_id, on_hand_total, on_hand_available, hold_qty, reserved, issuable_qty`.
- UI: "Khả dụng" = `issuable_qty` (không bao giờ tính HOLD); "Tồn" = `on_hand_total`.

### 1.5 Phiếu xuất (Q3/D2)
- `app.goods_issue` + `app.goods_issue_line`, số `PX-YYMM-NNNN` bằng `genDocNo`. Mọi đường xuất tạo phiếu cùng transaction với `inventory_txn` (`ref_table='goods_issue'`).
- `source_type`: `MATERIAL_REQUEST` (giao từng phần) · `QUICK_ISSUE` · `ISSUE_REQUEST` (1–1 ISR). Bán/trả NCC = `reason` sales/return.
- Tiêu hao lắp ráp KHÔNG tạo PX, chỉ sửa bin (KHO-02).

## 2. Migrations

### 2.1 `packages/db/migrations/0059_qc_hold.sql` (1a)
```sql
-- V4.1 Đợt 1a — QC HOLD hàng nhận + guard xuất kho + công thức tồn chuẩn.
SET search_path TO app, public;

ALTER TABLE app.inventory_lot_serial ADD COLUMN IF NOT EXISTS hold_code VARCHAR(24);
DO $$ BEGIN
  ALTER TABLE app.inventory_lot_serial ADD CONSTRAINT inventory_lot_serial_hold_code_ck
    CHECK (hold_code IS NULL OR hold_code IN ('QC_PENDING','QC_FAIL','MANUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
UPDATE app.inventory_lot_serial
   SET hold_code = CASE WHEN hold_reason ILIKE 'QC NG%' THEN 'QC_FAIL' ELSE 'MANUAL' END
 WHERE status = 'HOLD' AND hold_code IS NULL;

ALTER TABLE app.inbound_receipt_line
  ADD COLUMN IF NOT EXISTS lot_serial_id UUID REFERENCES app.inventory_lot_serial(id),
  ADD COLUMN IF NOT EXISTS qc_status     VARCHAR(8),
  ADD COLUMN IF NOT EXISTS qc_checked_by UUID REFERENCES app.user_account(id),
  ADD COLUMN IF NOT EXISTS qc_checked_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS qc_notes      TEXT;
DO $$ BEGIN
  ALTER TABLE app.inbound_receipt_line ADD CONSTRAINT inbound_receipt_line_qc_status_ck
    CHECK (qc_status IS NULL OR qc_status IN ('PENDING','PASS','FAIL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS inbound_receipt_line_qc_pending_idx
  ON app.inbound_receipt_line (qc_status) WHERE qc_status = 'PENDING';
CREATE INDEX IF NOT EXISTS inbound_receipt_line_lot_idx ON app.inbound_receipt_line (lot_serial_id);

CREATE INDEX IF NOT EXISTS inventory_txn_lot_idx ON app.inventory_txn (lot_serial_id);

CREATE OR REPLACE VIEW app.v_lot_stock AS
SELECT l.id AS lot_serial_id, l.item_id, l.status, l.hold_code, l.lot_code, l.exp_date, l.created_at,
       s.on_hand, r.reserved,
       CASE WHEN l.status = 'AVAILABLE' THEN GREATEST(s.on_hand - r.reserved, 0) ELSE 0 END AS issuable_qty
FROM app.inventory_lot_serial l
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(CASE
           WHEN t.tx_type IN ('IN_RECEIPT','ADJUST_PLUS','PROD_IN') THEN t.qty
           WHEN t.tx_type IN ('OUT_ISSUE','ADJUST_MINUS','PROD_OUT','ASSEMBLY_CONSUME') THEN -t.qty
           ELSE 0 END), 0)::numeric(18,4) AS on_hand
  FROM app.inventory_txn t WHERE t.lot_serial_id = l.id) s
CROSS JOIN LATERAL (
  SELECT COALESCE(SUM(rv.reserved_qty), 0)::numeric(18,4) AS reserved
  FROM app.reservation rv WHERE rv.lot_serial_id = l.id AND rv.status = 'ACTIVE') r;

CREATE OR REPLACE VIEW app.v_item_stock AS
SELECT item_id,
       SUM(on_hand)                                     AS on_hand_total,
       SUM(on_hand) FILTER (WHERE status = 'AVAILABLE') AS on_hand_available,
       SUM(on_hand) FILTER (WHERE status = 'HOLD')      AS hold_qty,
       SUM(reserved)                                    AS reserved,
       SUM(issuable_qty)                                AS issuable_qty
FROM app.v_lot_stock GROUP BY item_id;

COMMENT ON VIEW app.v_lot_stock IS 'V4.1 Đợt 1 — công thức tồn DUY NHẤT theo lô. issuable_qty = khả dụng xuất (chỉ AVAILABLE, trừ giữ chỗ ACTIVE).';

CREATE OR REPLACE FUNCTION app.trg_inventory_txn_lot_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_status TEXT;
BEGIN
  IF NEW.lot_serial_id IS NOT NULL AND NEW.tx_type IN ('OUT_ISSUE','ASSEMBLY_CONSUME','PROD_OUT') THEN
    SELECT status::text INTO v_status FROM app.inventory_lot_serial WHERE id = NEW.lot_serial_id;
    IF v_status IS DISTINCT FROM 'AVAILABLE' THEN
      RAISE EXCEPTION 'LOT_NOT_ISSUABLE: lô % đang %, không được xuất', NEW.lot_serial_id, v_status;
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS inventory_txn_lot_guard ON app.inventory_txn;
CREATE TRIGGER inventory_txn_lot_guard BEFORE INSERT ON app.inventory_txn
  FOR EACH ROW EXECUTE FUNCTION app.trg_inventory_txn_lot_guard();
```

### 2.2 `packages/db/migrations/0060_goods_issue.sql` (1b — apply SAU khi code 1a chạy trên prod)
```sql
SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.goods_issue (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  issue_no            VARCHAR(32) NOT NULL,
  source_type         VARCHAR(24) NOT NULL
                        CHECK (source_type IN ('MATERIAL_REQUEST','QUICK_ISSUE','ISSUE_REQUEST')),
  reason              VARCHAR(16) NOT NULL DEFAULT 'production'
                        CHECK (reason IN ('production','sales','manual','loss','return','other')),
  material_request_id UUID REFERENCES app.material_request(id),
  issue_request_id    UUID REFERENCES app.warehouse_issue_request(id),
  wo_id               UUID REFERENCES app.work_order(id),
  reference           VARCHAR(64),
  notes               TEXT,
  total_qty           NUMERIC(18,4) NOT NULL DEFAULT 0,
  issued_by           UUID NOT NULL REFERENCES app.user_account(id),
  received_by         UUID REFERENCES app.user_account(id),
  issued_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_no_uk ON app.goods_issue (issue_no);
CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_isr_uk ON app.goods_issue (issue_request_id) WHERE issue_request_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS goods_issue_mr_idx ON app.goods_issue (material_request_id);
CREATE INDEX IF NOT EXISTS goods_issue_issued_at_idx ON app.goods_issue (issued_at DESC);
CREATE INDEX IF NOT EXISTS goods_issue_source_idx ON app.goods_issue (source_type, issued_at DESC);

CREATE TABLE IF NOT EXISTS app.goods_issue_line (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goods_issue_id           UUID NOT NULL REFERENCES app.goods_issue(id) ON DELETE CASCADE,
  line_no                  INTEGER NOT NULL,
  item_id                  UUID NOT NULL REFERENCES app.item(id),
  lot_serial_id            UUID NOT NULL REFERENCES app.inventory_lot_serial(id),
  bin_id                   UUID NOT NULL REFERENCES app.location_bin(id),
  qty                      NUMERIC(18,4) NOT NULL CHECK (qty > 0),
  inventory_txn_id         UUID NOT NULL REFERENCES app.inventory_txn(id),
  material_request_line_id UUID REFERENCES app.material_request_line(id),
  notes                    TEXT,
  CONSTRAINT goods_issue_line_uk UNIQUE (goods_issue_id, line_no)
);
CREATE UNIQUE INDEX IF NOT EXISTS goods_issue_line_txn_uk ON app.goods_issue_line (inventory_txn_id);
CREATE INDEX IF NOT EXISTS goods_issue_line_item_idx ON app.goods_issue_line (item_id);
CREATE INDEX IF NOT EXISTS goods_issue_line_mrl_idx ON app.goods_issue_line (material_request_line_id);

DO $$ BEGIN
  ALTER TABLE app.inventory_txn ADD CONSTRAINT inventory_txn_out_requires_bin
    CHECK (tx_type NOT IN ('OUT_ISSUE','ADJUST_MINUS','ASSEMBLY_CONSUME') OR from_bin_id IS NOT NULL) NOT VALID;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
```
`material_request.status` là varchar(16) → thêm `'PARTIAL'` không cần DDL.

### 2.3 Drizzle TS (khớp tay)
- `packages/db/src/schema/inventory.ts`: `holdCode` vào `inventoryLotSerial`; index `inventory_txn_lot_idx`.
- `packages/db/src/schema/procurement.ts` `inboundReceiptLine`: `lotSerialId` (uuid, không `.references()` để tránh import vòng), `qcStatus`, `qcCheckedBy`, `qcCheckedAt`, `qcNotes`.
- Mới `packages/db/src/schema/goods-issue.ts` (mẫu `delivery-note.ts`) + export trong `index.ts`. View không khai Drizzle (dùng `sql`).
- Cập nhật `packages/db/migrations/README.md`.

## 3. RBAC — `packages/shared/src/rbac/matrix.ts` (19 → 22 entity)

| Entity | admin | planner | operator | warehouse | qc | purchaser |
|---|---|---|---|---|---|---|
| `materialRequest` | CRUD+transition | create, read, update | create, read | read, update, transition | – | – |
| `goodsIssue` | create, read, delete, approve | read | read | create, read | – | – |
| `qcInspection` | read, update, approve | – | – | read, update | read, update, approve | – |

- `approve:qcInspection` = PASS/FAIL. `update:qcInspection` = HOLD/nhả HOLD thủ công (chỉ `hold_code` MANUAL/NULL). `approve:goodsIssue` = xuất bán/trả NCC (admin). Planner mất hold/release (vẫn giữ `reservation:update`).
- `can.test.ts`: 19→22 + case: qc approve qcInspection ✓; planner/warehouse approve qcInspection ✗; operator create materialRequest ✓; qc read materialRequest ✗; warehouse create goodsIssue ✓; purchaser create goodsIssue ✗; warehouse approve goodsIssue ✗; admin approve goodsIssue ✓.

## 4. Thay đổi theo file

### 1a — QC HOLD + guard + tồn chuẩn
- **`server/repos/stockGuard.ts` (mới)** như 1.3.
- **`server/repos/receivingEvents.ts`**: thuần `nextSplitLotCode(base, existing)` (regex `^base-\d+$` escape); `resolveReceiptLotCode(tx,itemId,base)`; thuần `resolveReceiveQc(requested, canApproveQc) → {qc, downgraded}`; `PostReceivingInput.canApproveQc`. `postReceivingAtomic`: (a) khoá PO `FOR UPDATE`, status ∉ `SENT|PARTIAL|RECEIVED` → `PO_NOT_RECEIVABLE` (KHO-08); (b) set RECEIVED chỉ khi `status IN ('SENT','PARTIAL')`; (c) LUÔN tạo lô mới (D5), status/hold_code theo qc, `hold_reason` tiếng Việt "Chờ QC nhập kho (RCV-…)", bỏ nhánh `existingLot`; (d) dòng phiếu nhập `qcStatus` PASS/FAIL/PENDING + `lot_serial_id`; (e) `recomputeReceiptQcFlag`; (f) snapshot giữ logic theo qc đã hạ cấp; (g) trả `lotCode` thực tế.
- **`app/api/receiving/events/route.ts`**: `canApproveQc = can(roles,"approve","qcInspection")`; KHO-09 chọn PO line theo `poLineId` (khớp poId+itemId) hoặc fallback `ORDER BY (ordered_qty-received_qty)>0 DESC, line_no`; notify `notifyReceiptQcPending` 1 lần.
- **`packages/shared/src/schemas/receiving.ts`**: `poLineId` optional; `lotNo max(56)`.
- **Wizard nhận hàng**: gửi `poLineId`; "Điền tất cả" → PENDING; ẩn "OK" nếu không có quyền QC; toast lô đã tách. **`PoQuickReceiveTable.tsx`**: gửi `poLineId`.
- **`server/repos/inboundQc.ts` (mới)**: `listPendingQc`, `decideReceiptLineQc` (khoá dòng + lô; chỉ PENDING/FAIL; PASS/FAIL như 1.1; `applySnapshotQc` dùng chung với receiving; `recomputeReceiptQcFlag`), thuần `computeReceiptQcFlag`.
- **API mới**: `GET /api/receiving/qc-pending` (`read:qcInspection`, hỗ trợ `countOnly=1`); `POST /api/receiving/receipt-lines/[id]/qc` `{result, notes}` (FAIL bắt buộc notes; `approve:qcInspection`; audit `QC_CHECK`; FAIL → notify warehouse+purchaser).
- **`api/lot-serial/[id]/hold`**: `update:qcInspection`, `hold_code='MANUAL'`, nhả mọi reservation ACTIVE của lô (KHO-06). **`release`**: `update:qcInspection`; `hold_code` QC_* → 409 "xử lý ở màn Chờ QC" (KHO-12); nhả thì `hold_code=NULL`.
- **`api/snapshot-lines/[id]/transition`**: INBOUND_QC→AVAILABLE cần `approve:qcInspection`.
- **`api/warehouse/issue`**: `create:goodsIssue` (KHO-13); sales/return không có `approve:goodsIssue` → 403 hướng dẫn lập ISR (KHO-14); `assertIssuable` + `postOutboundTxns` (KHO-05/10).
- **`issue-request/[id]/approve`**: `assertIssuable` + `postOutboundTxns`. **`issue-request` POST**: `genDocNo` (KHO-20).
- **`bins/[id]/adjust`**: MINUS bắt buộc `lotSerialId`, guard (admin cho phép HOLD), `ADJUST_MINUS`; PLUS vào lô HOLD → 409. **`BinActions.tsx`** gửi `lotSerialId` (KHO-11).
- **`bins/[id]/transfer`**: `update:inventory`, bọc transaction + khoá lô (KHO-13/19). Cho chuyển lô HOLD.
- **`server/repos/assemblies.ts` `recordAssemblyScanAtomic`**: bỏ khoá `scan:`; lấy bin của lô; thuần `allocateAcrossBins`; `assertIssuable(…, {ownReservations})`; `postOutboundTxns ASSEMBLY_CONSUME` có `from_bin_id` (KHO-02/06).
- **Tồn chuẩn**: `items.ts` dùng `v_item_stock` (`availableQty = issuable_qty`, thêm `holdQty`); `inventory.ts getInventoryBalance` dùng `v_lot_stock`; `api/items/[id]/inventory-summary`; `warehouseLocation.ts suggestFifoPicks` chỉ lô AVAILABLE `issuable_qty>0`, không vượt issuable theo lô, ORDER BY `exp_date NULLS LAST, created_at`; `IssueMovementView.tsx` hiện "Khả dụng", ẩn sales/return với non-admin, hiện message 409.
- **Notifications**: `notifyReceiptQcPending` (role qc, link `/qc-inbound`), `notifyReceiptQcFailed` (warehouse+purchaser).
- **UI**: `movement-mode.ts` thêm `"qc"`; `MovementTab.tsx` segment "Chờ QC" + badge; `QcPendingView.tsx` (mới, bảng + lọc Chờ kiểm/Không đạt, nút Đạt/Không đạt theo quyền, Dialog lý do); trang `(app)/qc-inbound/page.tsx`; guard `/qc-inbound` = admin,qc,warehouse; nav "QC nhập kho" chỉ role qc.

### 1b — Phiếu xuất + giao phiếu yêu cầu
- **`server/repos/goodsIssues.ts` (mới)**: `createGoodsIssueTx` (guard → genDocNo → header → txn OUT_ISSUE `ref_table='goods_issue'` + line → consumed), `createGoodsIssue`, `listGoodsIssues`, `getGoodsIssue`, `issueMaterialRequest` (khoá MR; status ∈ PENDING|PICKING|READY|PARTIAL; dòng phải thuộc MR, item lấy từ dòng MR; thuần `validateMrIssue` không giao vượt; cộng `delivered_qty`; thuần `computeMrStatusAfterIssue` → DELIVERED/PARTIAL; `pickedBy` không ghi đè).
- **`materialRequests.ts`**: status `PARTIAL`; detail trả `remainingQty`, `issuableQty`, `goodsIssues`; `updateMaterialRequestStatus` claim có điều kiện, bỏ tham số `lines` (KHO-17).
- **transition**: PENDING→[PICKING,READY,CANCELLED], PICKING→[READY,CANCELLED], READY→[PICKING,CANCELLED], PARTIAL→[CANCELLED], không còn tay sang DELIVERED (409 "Phải lập phiếu xuất kho").
- **`POST /api/material-requests/[id]/goods-issue`** (mới, `create:goodsIssue`), audit + notify (DELIVERED / PARTIAL `MATERIAL_REQUEST_ISSUED`).
- `material-requests` GET/POST theo matrix (operator tạo được).
- Xuất nhanh + duyệt ISR chuyển sang `createGoodsIssue(Tx)`; `goods_issue_isr_uk` chặn duyệt 2 lần.
- `GET /api/goods-issues`, `GET /api/goods-issues/[id]`.
- UI: `GoodsIssuePanel.tsx` (Lập phiếu xuất, gợi ý FIFO, giao từng phần); trang chi tiết MR (PARTIAL, bỏ "Xác nhận đã nhận", danh sách PX, nút đóng phiếu); list MR (bỏ nút "Đã giao", khối lỗi); tab Kho "Phiếu xuất kho" + `GoodsIssuesTab.tsx`; `useReceivingEvents` invalidate thêm (KHO-24).

### 1c — Menu + báo cáo đối soát
- Nav "Yêu cầu vật tư" roles admin/planner/operator/warehouse; guard `/material-requests` thêm operator; form MR chọn WO (`?woId=`); nút từ trang WO (tuỳ chọn); cập nhật `nav-items.test.ts`.
- D4: `server/repos/stockReports.ts` `listMrDeliveredWithoutIssue()` + tổng theo SKU, `listAssemblyConsumeWithoutBin()`; `GET /api/warehouse/reports/reconciliation`; `ReportTab.tsx` mục "Đối soát trước kiểm kê" + CSV client; SQL gốc `plans/v4.1-audit-hoan-thien/sql/d4_reconciliation.sql`.

## 5. Test (vitest, không DB)
- `stockGuard.test.ts` (evaluateIssuable: HOLD, sai item, cộng dồn vượt bin, vượt free, ownReservations, allowStatuses HOLD, không tồn tại)
- `receivingEvents.test.ts` (nextSplitLotCode các case + ký tự regex; resolveReceiveQc)
- `inboundQc.test.ts` (computeReceiptQcFlag)
- `goodsIssues.test.ts` (validateMrIssue, computeMrStatusAfterIssue, FakeDb giao 2 lần)
- `assemblies.test.ts` (allocateAcrossBins)
- `can.test.ts`, `nav-items.test.ts`
- Smoke SQL tay `plans/v4.1-audit-hoan-thien/sql/dot1_smoke.sql`.

## 6. Triển khai
- **1a**: backup VPS → apply 0059 (trước khi up code) → push code 1a.
- **1b**: apply 0060 SAU khi 1a chạy trên prod → push 1b.
- **1c**: nav/guard/báo cáo. 1b+1c gộp được; KHÔNG gộp 1a+1b.

## 7. Rủi ro chính
Xưởng tắc vì hàng chờ QC (notify qc + badge + admin PASS được); số "Khả dụng" giảm (ghi changelog, cột HOLD); deadlock (thứ tự khoá cố định + lock_timeout); hiệu năng view (index lot, EXPLAIN sau apply); ISR cũ vào lô nay HOLD (409 rõ); trigger lỗi thô (`mapDbGuardError`); code lên trước migration (apply migration trước).

## 8. E2E prod (tóm tắt)
Nhận hàng lô trùng → `-2` HOLD/QC_PENDING, không có nút OK · PO CANCELLED bị từ chối · xuất lô HOLD 409 · QC Đạt → AVAILABLE, qc_flag PASS · QC Không đạt → notify · planner release 403, release QC_FAIL 409 · operator tạo MR · xuất từng phần → PARTIAL + PX · xuất đủ → DELIVERED · `to=DELIVERED` 409 · tab Phiếu xuất · xuất nhanh Bán bởi warehouse 403 · purchaser issue/transfer 403 · Rút hàng đúng lô · báo cáo đối soát · số Khả dụng khớp giữa các trang · SQL txn OUT không bin sau deploy = 0.
