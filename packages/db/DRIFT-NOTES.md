# DB Drift Notes — schema TS ↔ migration SQL ↔ prod

> V3.11.4 (audit W.9/W.10/W.11). Ghi lại các điểm lệch giữa Drizzle schema (TS),
> file migration SQL, và DB thực trên VPS prod (45.124.94.13). **Chưa thao tác
> ghi prod nào ở đợt này** — file này để verify + lên kế hoạch apply có kiểm soát.

## 1. Enum khai `public` (TS) vs tạo trong `app` (SQL) — W.10

Drizzle `pgEnum(name, [...])` tạo enum ở schema mặc định (`public`) khi push, nhưng
nhiều migration SQL `CREATE TYPE app.<name>`. Nếu prod có cả `app.X` lẫn `public.X`
với giá trị lệch → lỗi khó lần. Đã gây 2 sự cố thực tế:
- `audit_action`: thiếu 15 value → fix migration `0052_audit_action_catchup.sql` (đã apply).
- `item_type`: nghi thiếu TOOL/PACKAGING → `0053_item_type_catchup.sql` (CHƯA apply).

**Verify 1 lần trên prod** (chỉ đọc, an toàn):

```sql
SELECT n.nspname AS schema, t.typname AS enum, e.enumlabel AS value
FROM pg_type t
JOIN pg_namespace n ON n.oid = t.typnamespace
JOIN pg_enum e ON e.enumtypid = t.oid
WHERE t.typtype = 'e'
ORDER BY n.nspname, t.typname, e.enumsortorder;
```

Nếu thấy enum tồn tại ở CẢ `app` và `public` với cùng tên → cần hợp nhất về 1 schema
(khuyến nghị `app`, đổi TS sang `pgSchema("app").enum(...)`). Danh sách enum SQL tạo
trong `app.*`: barcode_type, barcode_source, import_kind, import_status,
import_duplicate_mode, bom_status, bom_snapshot_line_state, bom_revision_status,
purchase_request_status, lot_status, reservation_status, reservation_reason,
eco_status, eco_action_type, qc_check_result, qc_checkpoint, bom_sheet_kind,
material_row_status.

## 2. process_master.pricing_unit — W.9 (ĐÃ SỬA TS)

- **DB thực (migration 0017):** `pricing_unit VARCHAR(32) DEFAULT 'HOUR'`.
- **TS (cũ):** `pgEnum("process_pricing_unit", ["HOUR","CM2","OTHER"])` — enum KHÔNG
  tồn tại trên prod.
- **Đã sửa:** TS đổi về `varchar(32).$type<ProcessPricingUnit>()` + `PROCESS_PRICING_UNITS`
  union literal (khớp DB thực; tránh `drizzle-kit push` sinh ALTER convert cột→enum).
- **Không cần thao tác prod** — chỉ chỉnh TS cho khớp.

## 3. work_order_status — thứ tự enum lệch (W.10, chấp nhận)

TS: `DRAFT, QUEUED, RELEASED, IN_PROGRESS, ...`; prod (0016 ADD QUEUED BEFORE
IN_PROGRESS): `DRAFT, RELEASED, QUEUED, IN_PROGRESS, ...`. Giá trị đủ, chỉ THỨ TỰ
khác → tránh `ORDER BY` trực tiếp trên cột enum này (dùng CASE map nếu cần sort).

## 4. Bootstrap order khi fresh deploy — W.11

23 bảng chỉ được tạo bằng `drizzle-kit push` (không có `CREATE TABLE` trong file
migration nào): item, item_barcode, item_supplier, supplier, location_bin, session,
user_account, role, user_role, audit_event, sales_order, order_bom_snapshot,
work_order, work_order_progress, purchase_order, purchase_order_line,
inbound_receipt, inbound_receipt_line, inventory_lot_serial, inventory_txn,
assembly_order, assembly_scan, fg_serial.

→ **Fresh deploy** phải chạy `drizzle-kit push` (tạo baseline bảng + enum) TRƯỚC,
rồi mới `apply-sql-migrations.sh` (các migration bổ sung cột/index/function). Chạy
riêng `apply-sql-migrations.sh` trên DB trống sẽ fail ở migration đầu tiên có FK tới
bảng chưa tồn tại (vd 0034 → `app.inbound_receipt`).

## 5. Thứ tự apply file SQL — lexical gotcha (W.16, P2)

`apply-sql-migrations.sh` sort lexical: `0003b2_*` sort TRƯỚC `0003b_*` (ASCII '2' <
'_'). Với fresh deploy điều này đảo thứ tự ý đồ. Numbering còn gap 0009, 0020–0024,
0039–0041. Không ảnh hưởng DB đã migrate; ghi chú để tránh nhầm khi audit lịch sử.
