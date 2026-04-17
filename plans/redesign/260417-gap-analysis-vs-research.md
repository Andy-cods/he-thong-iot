# Gap Analysis: Direction B vs Deep Research Reports (luồng & quy trình)

Ngày: 2026-04-17
Phạm vi: CHỈ so sánh **luồng nghiệp vụ, quy trình, state machine, discipline, scope** — KHÔNG so sánh tech stack (Next.js/Postgres/Redis/Compose/Docker/Caddy).

Tài liệu đối chiếu:
- Báo cáo phần 1 (R1) — `deep-research-report cho hệ thốngg phần 1.md` (850 dòng).
- Báo cáo phần 2 (R2) — `deep-research-report cho hệ thống phần 2.md` (522 dòng).
- Direction B: `plans/redesign/260417-brainstorm.md` (273d), `260417-brainstorm-deep.md` (640d), `260417-design-spec.md` (2955d), `260417-implementation-plan.md` (1603d), `260417-p0-bugs-fix-plan.md`.
- Bối cảnh: `CLAUDE.md`, `PROGRESS.md` (tuần 2 đã cook Item Master + Barcode + Supplier + Import Excel).

---

## Tóm tắt điều hành

**Direction B (scope 10 ngày) chủ yếu là sprint UI/UX cho 8 màn hình**: `/login`, `/`, AppShell, `/items`, `/items/[id]`, `/items/import`, `/suppliers`, `/pwa/receive/[poId]`. So với 14 luồng nghiệp vụ R1/R2 khuyến nghị, Direction B **chỉ đang chạm được 3–4 luồng ở mức surface** (Item master, Supplier + lead time cơ bản, Receiving PWA scan cho PO đã tồn tại, Import Excel). Các luồng còn lại (BOM template/revision/snapshot, MRP-lite shortage, WO, Assembly, FG serial, shipping, reservation, QC 3 luồng, traceability log, ECO, 15 điểm dễ bỏ sót, migration 10 bước Excel) **chưa có screen, chưa có entity UX, phần lớn nằm trong danh sách "defer V1.1/V1.2"** của `implementation-plan.md §12`.

**Điều này không sai nếu mục tiêu sprint là FE polish cho phần đã cook xong (Item Master + Import)**. Nhưng nếu coi Direction B là "V1 go-live sẵn sàng UAT với xưởng Song Châu", thì **đang thiếu cả xương sống BOM-centric** mà R1/R2 gọi là "lõi điều phối". 3 báo cáo đều nhấn mạnh một câu giống nhau: *"đơn hàng phải chạy trên BOM snapshot bất biến, mọi biến động kho/sản xuất/lắp ráp phải là transaction có actor+timestamp"* (R1 dòng 19, R2 dòng 34, R2 dòng 243). Cả 3 discipline này hiện chưa hiện diện trong Direction B scope.

**Kết quả bao phủ:**
- Bao phủ tốt (>= 70%): **4/14 luồng** — Barcode/scan flow (#7), Item master gốc + barcode (thuộc #2 phần master-data), Import Excel (phần đầu của #13), một phần RBAC lite (#10).
- Bao phủ một phần (30–70%): **2/14** — Receiving PWA + incoming QC radio PASS/FAIL (phần 1/3 của #6), Lead time cơ bản (phần đầu của #11).
- Chưa bao phủ (< 30%): **8/14** — Order end-to-end (#1), BOM template/revision/snapshot discipline (#2), State machine 4 đối tượng (#3), Partial qty model (#4), Reservation rules (#5), Traceability log-first (#8), Lot/Serial tracking mode full flow (#9), ETA learning rolling (#11 phần p90), 15 điểm dễ bỏ sót (#12), Migration 10 bước (#13), Roadmap 3 phase discipline (#14).

### Gap P0 (block V1 go-live thật với nghiệp vụ đầy đủ — phải bổ sung trước khi code thêm sau sprint Direction B)

1. **BOM Template → Revision → Snapshot (3 entity tách biệt)** — không có màn, không có tab, không có flow UX. Đây là hạt nhân của hệ (R1:5–11, R1:19, R2:245, R2:32). Không có cái này thì mọi thứ downstream (PR/PO/WO/Assembly) không biết lấy số lượng từ đâu.
2. **Order → Snapshot → Explode → Shortage → MRP-lite** — R1:478–497 và R2:93–127 vẽ luồng end-to-end 10 bước. Direction B không có screen Order Entry, Snapshot Board, Shortage Board.
3. **Partial qty model (required/received/reserved/issued/assembled/remaining_short)** — R2:247 nêu rõ "không phải yes/no mà là số lượng". Direction B receiving chỉ có `status: pending|partial|received` ở mức string + `qty` scalar (design-spec:2557–2566). Chưa có entity-level tách 6 trường qty.
4. **State machine 4 đối tượng** — R1:501–507 liệt kê rõ: BOM snapshot line, PO line, Work order, Assembly order. Direction B chỉ có state cho Receiving line (pending/partial/received) + item active/inactive. Không có state machine discipline tầng nghiệp vụ.
5. **Traceability log-first (stock_transaction + assembly_scan_log là xương sống)** — R1:34, R1:142, R2:34 đều nhấn "mọi biến động là transaction có actor+timestamp+reference, không dựa vào số tồn hiện tại". Direction B mới có scan log cho receiving PWA (append receipt_event) nhưng chưa có mô hình `stock_transaction` thống nhất cho receipt/putaway/transfer/issue/reserve/unreserve/prod_in/prod_out/asm_issue/asm_return.

### Gap P1 (V1 chạy được nhưng lỏng lẻo — sprint kế tiếp sau Direction B)

6. QC 3 luồng (incoming/in-process/final + nonconformance + rework).
7. Lot/Serial tracking mode đầy đủ (FG serial link về part/lot/operator/order — warranty traceability).
8. Reservation rules (FIFO/FEFO/serial-reserve/no-negative-stock/chỉ reserve QC-pass).
9. RBAC 12 roles × 12 quyền + data scope theo warehouse/order/cost (hiện PROGRESS:50 mới seed 4 role).
10. ETA learning rolling (lead_time_current vs p90 + on-time rate).
11. Offline queue idempotent full spec (Direction B đã có D20 đúng hướng, nhưng chưa có `offline_queue_id` server-side dedup chuẩn + 3 kênh feedback 880/220Hz + haptic).

### Gap P2 (V2/V3 backlog dài hạn)

12. 15 điểm R2:488–501 (ECO approval, substitute parts, quarantine/hold bin, calendar/shift/holiday, label templates, cycle count, training matrix, rework flow, warranty, API-first integration).
13. Migration 10 bước từ Excel (R1:755–766 + R2:424–444).
14. Roadmap V2 edge gateway / V3 analytics OEE.

---

## Ma trận đối chiếu 14 luồng

| # | Luồng nghiệp vụ | Research khuyến nghị | Direction B hiện có | Gap | Ưu tiên |
|---|---|---|---|---|---|
| 1 | Đơn hàng end-to-end (Sales → BOM template+rev → snapshot → explode → MRP → PR/PO → GRN+QC → putaway+reserve → WO Make → prod QC → pick → scan lắp → FG serial → ship partial/full) | R1:478–497, R2:93–127 (sequence diagram 10 bước) | Chưa có screen Order / Snapshot Board / Shortage Board; Dashboard KPI là mock (design-spec §2.2:518); sidebar có NavItem "Work Order" **disabled V1** (plan.md:775) | Thiếu toàn bộ backbone luồng đơn hàng; chỉ có master-data entry | **P0** |
| 2 | BOM discipline (Template / Revision / Snapshot-per-order — 3 entity tách biệt, snapshot bất biến, ECO cho change) | R1:19, R1:501, R2:32 ("BOM Template, BOM Revision, BOM Snapshot per Order là ba thực thể khác nhau"), R2:245 | Chưa có BOM Editor; brainstorm §5.1:196 ghi BOM editor cho "tuần 5"; plan §12:1474 defer | Thiếu UX cho author BOM template + release revision + snapshot; chưa có ECO lite | **P0** |
| 3 | State machine 4 đối tượng (BOM snapshot line / PO line / Work order / Assembly order) | R1:501–507 liệt kê đủ 4 bảng trạng thái với 7–11 state mỗi cái | Direction B có state cho: item active/inactive, receipt line pending/partial/received, bulk-select 3 mode. Không có state cho PO line, WO, AO, snapshot line | Thiếu 4 state machine nghiệp vụ cốt lõi; badge StatusBadge (§3.12:2169) mới có preset `active/inactive/shortage/ready/draft/released` nhưng chưa map vào entity thật | **P0** |
| 4 | Partial delivery/receipt qua số lượng (required/received/reserved/issued/assembled/remaining_short) — KHÔNG boolean | R2:247 "phải mô hình hóa bằng số lượng, không phải trạng thái yes/no", R1:301–311 (snapshot DDL có 7 cột qty) | PWA line card dùng `status: pending \| partial \| received` (design-spec:2557) + qty scalar. Chưa có 6 trường số lượng song song trên snapshot line | Cần dựng entity `bom_snapshot_line` với 7 trường qty chuẩn; receiving chỉ là input, downstream (reserve/issue/assemble) chưa kéo qty | **P0** |
| 5 | Reservation rules (FIFO/FEFO, chỉ reserve QC-pass, pick tạo task chưa trừ issued, issue chỉ xác nhận khi scan, no-negative-stock, shortage ghi ở snapshot line) | R2:252–261 (bảng 8 dòng rule), R1:514–519 | Không có — chưa có bảng `stock_reservation`, chưa có nghiệp vụ reserve trong Direction B scope | Thiếu toàn bộ cơ chế reservation; khi có WO/Assembly sẽ không có cách biết "đã khoá hàng cho đơn nào" | **P0** |
| 6 | QC 3 luồng (incoming QC PASS/HOLD/REJECT + in-process + final + nonconformance + rework) | R1:23, R1:159 (`qc_plan, qc_inspection, qc_result, qc_nonconformance`), R2:262–263 | Receiving PWA có QC radio PASS/FAIL (design-spec:1609, 2565). Không có HOLD, nonconformance, rework flow, không có QC screen cho in-process/final | Thêm trạng thái HOLD bên cạnh PASS/FAIL; thêm entity nonconformance + rework; trong V1 tối thiểu đủ incoming QC fully, in-process/final có thể P1 | **P1** |
| 7 | Barcode/scan flow (PWA offline queue IndexedDB, idempotent `offline_queue_id`, Background Sync, 3 kênh feedback: visual flash + audio 880/220Hz + haptic) | R1:510–519 (bảng 6 bước), R1:397–426 (assembly_scan_log DDL với `offline_queue_id`, `sync_status`) | Brainstorm-deep §2.5:287–319 + design-spec §5.3:2677 có cover: Dexie queue FIFO concurrency=1, backoff expo max 60s, D20 event-append server-side, camera deny fallback, scan feedback spec (visual/audio/haptic). ĐÂY LÀ ĐIỂM MẠNH NHẤT | Gần đủ; cần thêm `offline_queue_id` persist vào server `stock_transaction` + `assembly_scan_log` để dedup cross-device; hiện mới ở tầng UI event | **Gần đủ — P1 polish** |
| 8 | Traceability log-first (mọi receipt/putaway/transfer/reserve/issue/scan/QC là transaction có timestamp + actor + reference) | R1:34, R1:142, R1:365–395 (`stock_transaction` với tx_type 10 loại), R2:34 | Không có mô hình `stock_transaction` thống nhất trong Direction B; chỉ có audit log cho item edit (đã có từ tuần 2, PROGRESS:76). Receipt event của PWA là bước đầu nhưng chưa join vào bảng transaction chung | Trước khi thêm WO/Assembly, phải có bảng `inventory.stock_transaction` partitioned + tx_type enum 10 giá trị; mọi UI action phải post vào đây | **P0** |
| 9 | Lot/Serial tracking (`tracking_type` NONE/LOT/SERIAL; FG serial link về part/lot/operator/order — warranty) | R1:212 (`tracking_type` column), R1:398–426 (assembly_scan_log + fg_serial), R2:500 "warranty traceability" | Item master đã có `trackingMode: 'none' \| 'lot' \| 'serial'` (design-spec:2556, PROGRESS:85). Receiving PWA có LotInput + ExpDate conditional. Chưa có màn FG Serial, chưa có `fg_serial` entity | Có nền. Thiếu: flow tạo FG serial khi assembly complete + screen lookup warranty ("serial này lắp từ lot/part/operator/order nào") | **P1** |
| 10 | RBAC 12 roles × 12 quyền (A/E/P/V) + data scope warehouse/order/cost | R2:313–326 bảng ma trận đầy đủ 12×12, R1:526–537 mô tả role + data scope | PROGRESS:50 seed 4 role; brainstorm-deep §2.1:192 chỉ filter CommandPalette theo `user.role` "admin/planner/warehouse/viewer". Không có 12 role, không có ma trận quyền, không có data scope warehouse | Mở rộng role seed lên đúng 12; viết ma trận quyền cụ thể; thêm data scope (session context `current_warehouse_id`, `can_view_cost`, `order_scope_ids` như R1:566–618) | **P1** |
| 11 | ETA learning (lead_time_current vs p90, rolling update sau mỗi receipt) | R2:264–278 (công thức + pseudo-code), R1:46 | Supplier master có `leadTimeDays` nhưng chưa có `lead_time_days_current` vs `lead_time_days_p90`; chưa có job rolling update sau receipt | Thêm 2 cột; thêm worker job `eta_rollup` cập nhật sau mỗi GRN hoàn tất; dashboard ETA board (design-spec:615 mock "5 PO ETA > 3 ngày" — cần API thật) | **P1** |
| 12 | 15 điểm dễ bỏ sót (ECO approval, substitute parts, quarantine/hold bin, calendar/shift/holiday, label templates, cycle count, training matrix, rework, warranty, API-first) | R2:488–501 bảng 10 dòng | Implementation plan §12:1474 defer WO, Assembly, BOM editor, Order detail. Brainstorm §4.P3:11 có audit log UI nhưng P3. 15 điểm này gần như **không xuất hiện** trong Direction B | V1 tối thiểu cần: ECO lite (có stub `plans/v1-foundation/week-2` đã nhắc), substitute_group_code trong BOM line, quarantine bin flag (`is_qc_hold` R2:207), label print template. Những cái còn lại V2/V3 | **P2** (trừ ECO stub = P1) |
| 13 | Migration 10 bước từ Excel | R1:755–766 (10 bước), R2:424–444 (pipeline bảng) | Có Import Wizard Excel 3-step cho Item Master (đã cook tuần 2); Direction B thêm bước ColumnMapper (v2 + synonym dict, design-spec §2.6 + §3.16, brainstorm-deep §2.4) — ĐÂY LÀ ĐIỂM TỐT. Nhưng mới cover bước 3 (item master) của 10 bước | Thêm pipeline cho: BOM template import (bước 5), vendor + lead time (bước 4), open stock (bước 7), open PO (bước 8), open WO — cùng pattern wizard + validator + reconciliation | **P1** (import Item đã có, mở rộng sang entity khác theo thứ tự R1:767–782) |
| 14 | Roadmap 3 phase (V1 BOM-PR-PO-GRN-QC-WO-Asm-Ship → V2 edge gateway CNC → V3 analytics/OEE) | R2:446–472 (Gantt), R1:790–796 | PROGRESS:20 có bảng 3 phase nhưng V1 "chưa bắt đầu" (thực ra tuần 2 đã xong Item+Import). Plan defer §12:1474 ghi WO, Assembly, FG serial là V1.2 | Direction B đang gộp "V1 polish UI" với "V1 nghiệp vụ đầy đủ" thành một scope 10 ngày — không đủ. Nên explicitly tách: Direction B = V1.0 UI foundation; V1.1 = BOM editor + Order entry + Snapshot; V1.2 = PO + GRN full + WO; V1.3 = Assembly + Shipping | **P0 chiến lược** (không phải P0 code, P0 planning) |

---

## Chi tiết từng luồng

### 1. Đơn hàng end-to-end

**Research nói gì:**
- R1:478–497 (mermaid flowchart 16 node từ "Nhận đơn hàng" → "Giao từng đợt").
- R2:93–127 (sequenceDiagram 9 actor: Sales/Eng/Plan/Buy/WH/QC/Prod/Asm/Ship).
- R2:129 "BOM nhiều cấp, hàng mua ngoài và hàng gia công cùng xuất hiện trong cùng one source of truth, giao từng phần".

**Direction B có gì:**
- Dashboard `/` (design-spec §2.2:518) có mock KPI + "Orders Readiness" table nhưng data mock, API thật chưa tồn tại.
- Sidebar có NavItem "Work Order" **disabled V1** (plan.md:401, 775).
- Không có route `/orders`, `/orders/[id]`, `/orders/[id]/snapshot`, `/work-orders`, `/assembly`, `/shipments`.

**Gap:**
- [ ] Thiếu module Order Entry + Order Detail.
- [ ] Thiếu Snapshot Board (màn hình cả planning/purchasing/warehouse/assembly đều nhìn được — R2:305 gợi ý "wireframe BOM snapshot").
- [ ] Thiếu Shortage Board (R2:146 "Shortage board" là 1 trong 13 dashboard MVP).
- [ ] Thiếu flow "release order → create snapshot" bất biến.
- [ ] Dashboard KPI hiện là mock; khi nghiệp vụ thật sẵn sàng cần API `/api/dashboard/overview` trả dữ liệu từ state machine thật.

**Đề xuất bổ sung (không cho sprint Direction B 10 ngày — cho sprint V1.1 kế tiếp):**
- Thiết kế entity: `sales.customer_order`, `sales.order_bom_snapshot`, `sales.shipment_plan` (theo R1:157, R1:287–327).
- Thêm 5 màn: `/orders` list, `/orders/new`, `/orders/[id]` detail (3 tab: Thông tin / Snapshot / Shipment), `/snapshot-board`, `/shortage-board`.
- Dashboard API `/api/dashboard/overview` kéo từ `order_bom_snapshot.line_status` aggregate.

---

### 2. BOM discipline (Template / Revision / Snapshot-per-order)

**Research nói gì:**
- R1:19 "khi đơn hàng được phát hành, BOM của đơn phải được snapshot và khóa revision, mọi thay đổi sau đó đi qua ECO/change request".
- R2:32 "BOM Template, BOM Revision và BOM Snapshot theo Order phải là ba thực thể khác nhau".
- R2:245 "Nếu kỹ thuật ra revision mới, revision mới chỉ áp dụng cho order mới hoặc qua quy trình change order có kiểm soát".

**Direction B có gì:**
- Không có screen BOM author/edit trong scope sprint 10 ngày.
- `brainstorm.md §6:5` ghi "Tuần 5 cho BOM editor" — **ngoài** sprint Direction B.
- `implementation-plan.md §12:1474` liệt kê "BOM editor/revision" là V1.1 defer.
- Schema DB có sẵn 20 bảng (PROGRESS:49) nhưng chưa có UI nào chạm BOM.

**Gap:**
- [ ] Không có UI entity-level cho BOM Template (`engineering.bom_revision`, `engineering.bom_line` trong R1:242–283).
- [ ] Không có flow "DRAFT → RELEASED → OBSOLETE" cho revision (R1:248).
- [ ] Không có "Copy to snapshot on order release" (R1:19).
- [ ] Không có ECO/change request stub (R2:492).

**Đề xuất bổ sung:**
- Sprint V1.1 (sau Direction B): thiết kế màn `/bom-templates`, `/bom-templates/[id]/revisions`, `/bom-templates/[id]/revisions/[rev]/editor` với recursive tree edit.
- State machine cho `bom_revision.revision_status`: DRAFT → RELEASED (button "Release", lock edit) → OBSOLETE.
- Trên Order Detail có button "Tạo snapshot từ BOM [picker] rev [R02]" → insert vào `sales.order_bom_snapshot` với `source_bom_revision_id` tham chiếu và cột bất biến.
- Màn ECO-lite: form `engineering.eco_request` với workflow submit → approve → apply (R1:156).

---

### 3. State machine 4 đối tượng

**Research nói gì:**
- R1:501–507 bảng đầy đủ:
  - BOM snapshot line: `PLANNED → PURCHASING/IN_PRODUCTION → INBOUND_QC/PROD_QC → AVAILABLE → RESERVED → ISSUED → ASSEMBLED → CLOSED`
  - PO line: `DRAFT → SENT → CONFIRMED → PARTIAL_RECEIVED → RECEIVED → QC_HOLD/QC_PASS/QC_FAIL → CLOSED`
  - Work order: `DRAFT → RELEASED → READY → RUNNING → PAUSED → QC_PENDING → DONE/CANCELLED`
  - Assembly order: `PLANNED → PICKING → READY_TO_ASSEMBLE → ASSEMBLING → VERIFYING → COMPLETED/PARTIAL_SHIPPED/CLOSED`

**Direction B có gì:**
- `StatusBadge` component (design-spec §3.12:2169) có preset: `active/inactive/shortage/ready/draft/released/partial`. Gần 6/nhiều trạng thái trên.
- Không có state machine code (state transition rules) ở đâu trong brainstorm-deep hoặc implementation-plan.
- Chỉ có state cho: item active/inactive, receipt line pending/partial/received, bulk-select 3 mode.

**Gap:**
- [ ] Không có file `lib/state-machines/bom-snapshot-line.ts`, `po-line.ts`, `work-order.ts`, `assembly-order.ts` để chuẩn hoá transition.
- [ ] Không có validation "PO line đang SENT → không được skip thẳng sang RECEIVED bỏ qua CONFIRMED".
- [ ] Không có history log cho mỗi transition (actor + timestamp + reason).

**Đề xuất bổ sung:**
- Khi cook entity Order/PO/WO/Assembly, mỗi cái phải có:
  1. Column `status` với CHECK constraint (R1:314–320 đã ví dụ cho snapshot line).
  2. Function `transition(entityId, fromStatus, toStatus, actor)` server-side validate transition.
  3. Bảng `*_status_history` partition theo tháng hoặc chèn vào `audit.audit_event`.
- Dùng thư viện `xstate` hay tự viết switch table (ưu tiên switch table vì đơn giản).
- UI: mỗi entity detail hiển thị timeline state transition + button chỉ enable transition hợp lệ.

---

### 4. Partial qty model

**Research nói gì:**
- R2:247 "Partial delivery và partial receipt phải được mô hình hóa bằng số lượng, không phải trạng thái yes/no. Mỗi `bom_snapshot_line` nên có ít nhất: `required_qty`, `gross_required_qty`, `open_purchase_qty`, `received_qty`, `qc_pass_qty`, `reserved_qty`, `issued_qty`, `assembled_qty`, `remaining_short_qty`."
- R1:301–311 DDL có 7 cột: `net_required_qty, gross_required_qty, reserved_qty, issued_qty, received_qty, completed_qty, qty_per_parent`.

**Direction B có gì:**
- `design-spec.md:2557` type cho PWA line: `status: "pending" | "partial" | "received"` + scalar `qty`.
- Không có mô hình 7–9 cột qty song song.
- `brainstorm-deep §2.5 Conflict:` xử lý event append đúng hướng ("PO line tổng = SUM(events.qty) với QC pass") nhưng chỉ ở mức tổng receipt, chưa phân rã reserved/issued/assembled.

**Gap:**
- [ ] Snapshot line entity chưa có `reserved_qty`, `issued_qty`, `assembled_qty`, `remaining_short_qty`.
- [ ] Không có UI hiển thị progress "Đã nhận 400/500 · Đã reserve 300/400 · Đã lắp 200/300".
- [ ] Khi V1 tới module WO/Assembly, nếu thiếu 4 trường qty này sẽ phải migrate ngược.

**Đề xuất bổ sung:**
- Khi thiết kế `sales.order_bom_snapshot` schema (V1.1 sprint), copy đúng 9 trường qty R2:247.
- Wireframe Snapshot Line card: progress bar 5 tầng (required → received → qc-pass → reserved → issued → assembled).
- Computed column `remaining_short_qty = required - (received * qc_pass_ratio)` (generated column hoặc view).

---

### 5. Reservation rules

**Research nói gì:**
- R2:252–261 bảng 8 dòng: chỉ reserve hàng QC pass, FEFO/FIFO/serial-reserve, pick tạo task chưa trừ issued, issue chỉ khi scan, no-negative-stock, shortage ghi ở snapshot line + dashboard.
- R1:514–520 (pick/scan flow): "Pick tạo task, chưa giảm issued ngay; Issue chỉ được xác nhận khi scan".

**Direction B có gì:**
- Không có — chưa có bảng `inventory.stock_reservation`, chưa có business logic reserve.

**Gap:**
- [ ] Thiếu toàn bộ.
- [ ] Receiving PWA hiện chỉ tạo receipt_event, chưa trigger reserve cho order đang cần.
- [ ] Khi V1 có assembly thật (V1.3 defer), không có cơ chế biết "hàng nào đã khoá cho đơn nào".

**Đề xuất bổ sung:**
- Entity `inventory.stock_reservation` (order_id, snapshot_line_id, item_id, lot_serial_id, qty, policy {FIFO|FEFO|SERIAL}, reserved_at, released_at).
- Stored procedure `reserve(order_id, line_id, qty)` với transaction + CHECK no-negative-stock.
- Business rule: khi `qc_inspection.result = PASS` trên GRN line, auto-call `reserve` cho snapshot line đang chờ.
- UI: Pick List screen hiển thị "Đã reserve 300 lot LOT-2604 tại bin A01" trước khi scan.

---

### 6. QC 3 luồng

**Research nói gì:**
- R1:23 "QC ở hàng mua ngoài và hàng gia công, đồng thời scan khi lấy hàng và xác nhận lắp ráp".
- R1:159 `qc_plan, qc_inspection, qc_result, qc_nonconformance`.
- R2:262 "QC workflows nên có ba luồng: incoming QC, process QC, final QC".
- R2:499 "Rework flow: xử lý part fail QC mà không phá traceability".

**Direction B có gì:**
- PWA Receiving QC radio `PASS / FAIL` (design-spec §2.8:1609, 2565).
- Không có HOLD state.
- Không có In-process QC (sau WO operation).
- Không có Final QC (trước ship).
- Không có Nonconformance/Rework.

**Gap:**
- [ ] Thiếu trạng thái HOLD → bin quarantine (R2:492 "Quarantine / hold stock").
- [ ] Thiếu màn QC Console (operator quan sát inspection_lot + làm quyết định disposition).
- [ ] Thiếu entity `nonconformance` + `rework_order`.

**Đề xuất bổ sung:**
- Receiving PWA thêm 3-way radio: `PASS / HOLD / FAIL` thay vì 2-way.
- HOLD routes hàng sang bin `is_qc_hold=true` (R2:207) thay vì available bin.
- Màn `/qc/incoming` list các lot đang HOLD, QC inspector re-inspect → decision `RELEASE_TO_AVAILABLE` / `REJECT_TO_VENDOR`.
- Entity nonconformance + rework là V1.2/V1.3 scope.

---

### 7. Barcode/scan flow (PWA + offline queue + 3 kênh feedback)

**Research nói gì:**
- R1:510–519 bảng 6 bước: nạp master data min, mỗi scan sinh `offline_queue_id` vào IndexedDB, xác thực cục bộ (barcode format, item trong pick list, stage hợp lệ, không duplicate session), Background Sync FIFO, API idempotent theo `offline_queue_id`, PWA phản hồi `SYNCED/FAILED/REQUIRES_REVIEW`.
- R1:397–426 DDL `assembly_scan_log` có `offline_queue_id`, `sync_status`, `validation_result`.

**Direction B có gì:**
- brainstorm-deep §2.5:287 Dexie queue `QueueEntry` schema với `id: uuid v7`, `createdAt`, `syncAttempts`, `lastError`.
- concurrency=1 FIFO, backoff expo max 60s, 5 lần fail → failed_queue.
- D20 (decisions §8:110): server append receipt_event, idempotent theo UUID v7 client-generate.
- design-spec §5.3:2677 scan feedback: visual flash + audio 880Hz (OK) / 220Hz (error) + haptic.
- BarcodeScanner (design-spec §3.17:2449) html5-qrcode + camera deny fallback + manual input + USB keyboard wedge detect (brainstorm-deep §3.1:332).

**Đánh giá:** Đây là **điểm mạnh nhất** của Direction B. Cover 5/6 điểm R1:510. Chỉ thiếu một chút:

**Gap:**
- [ ] Xác nhận `offline_queue_id` (tức `event_id` trong D20) được lưu **persist** vào `stock_transaction.offline_queue_id` + `assembly_scan_log.offline_queue_id` server-side (R1:414). Hiện mới có ở UI-side.
- [ ] Thiếu validation cục bộ "item có nằm trong pick list không" (R1:514 bước 3) — trong Receiving PWA đỡ cần vì PO đã precache line, nhưng khi Assembly PWA làm sau, phải có.
- [ ] "REQUIRES_REVIEW" state trong PWA UI — hiện mới có SYNCED/FAILED (brainstorm-deep §2.5:304), chưa có review queue khi warning ("over-received 140%").

**Đề xuất bổ sung (nhẹ):**
- Thêm column `offline_queue_id uuid` (nullable) vào mọi bảng transaction server-side.
- Khi server thấy duplicate `offline_queue_id`, trả 200 với kết quả cũ thay vì tạo thêm row.
- PWA thêm badge "N events cần review" khi server trả warning.

---

### 8. Traceability log-first

**Research nói gì:**
- R1:34 "traceability phải dựa trên transaction log chứ không dựa trên 'con số tồn hiện tại'".
- R1:365–395 `inventory.stock_transaction` với 10 tx_type: RECEIPT/ISSUE/TRANSFER/ADJUST/RESERVE/UNRESERVE/PROD_IN/PROD_OUT/ASM_ISSUE/ASM_RETURN. Partition theo `posted_at` RANGE.
- R2:34 "hệ của bạn phải lưu từng receipt, putaway, transfer, reserve, issue, assembly scan, QC result và shipment như các giao dịch có dấu thời gian, actor và object liên quan".

**Direction B có gì:**
- `audit.audit_event` đã có cho item edit (tuần 2, PROGRESS:76).
- Receipt event trong PWA là bước đầu của mô hình event-append (brainstorm-deep §2.5:311).
- KHÔNG có bảng `inventory.stock_transaction` hợp nhất cho mọi biến động kho.

**Gap:**
- [ ] Khi có receiving PO, sau "QC pass" → putaway → bin, Direction B chưa định nghĩa 3 transaction riêng (RECEIPT, QC_PASS, PUTAWAY).
- [ ] Khi sau này có WO → PROD_IN, không có home cho sự kiện đó.
- [ ] Không có view "Lịch sử di chuyển của item X trong 30 ngày" — đây là kỳ vọng chính của audit.

**Đề xuất bổ sung (P0 trước khi cook module tiếp theo):**
- Tạo migration `0004_inventory_stock_transaction.sql` theo DDL R1:365–395 (partition RANGE theo `posted_at`).
- Mọi endpoint write (`POST /api/receipts`, `POST /api/putaway`, `POST /api/transfers`, `POST /api/reserves`) phải insert vào `stock_transaction` thay vì chỉ update `stock_balance`.
- Worker job nightly: `stock_balance` = `SUM(qty_in - qty_out) FROM stock_transaction WHERE item_id=X`.
- UI: Item Detail thêm Tab "Lịch sử di chuyển" paginated theo `posted_at DESC`.

---

### 9. Lot/Serial tracking mode

**Research nói gì:**
- R1:212 `tracking_type` NONE/LOT/SERIAL ở item master.
- R1:398–426 `assembly_scan_log` + `fg_serial` link về part/lot/operator/order.
- R2:500 "Warranty traceability: truy ngược FG serial → part/lot/operator/order".

**Direction B có gì:**
- Item master đã có `trackingMode: 'none' | 'lot' | 'serial'` trong zod schema (PROGRESS:74 Zod schemas tuần 2).
- Receiving PWA có LotInput + ExpDate conditional khi item lot-tracked.
- Chưa có entity `fg_serial`, chưa có màn FG Serial.

**Gap:**
- [ ] Khi Assembly complete, chưa có flow "tạo FG serial và link với các component lot/serial đã consume".
- [ ] Không có màn Warranty Lookup ("nhập serial FG → trả về cây part/lot/operator/order").

**Đề xuất bổ sung:**
- V1.3 (khi cook Assembly): entity `assembly.finished_goods_serial` (id, item_id, serial_no, assembly_order_id, fg_created_at, operator_user_id).
- Link bảng `fg_serial_component (fg_serial_id, component_item_id, component_lot_serial_id, qty)` — cho phép query ngược.
- UI: `/warranty/lookup?serial=SN-...` trả cây traceability (recursive CTE trên fg_serial_component).

---

### 10. RBAC 12 roles × 12 quyền + data scope

**Research nói gì:**
- R2:313–326 bảng 12 role × 12 quyền (A/E/P/V):
  - Roles: admin, system_engineer, security_officer, design_engineer, material_planner, purchasing, accountant, qc_inspector, warehouse_staff, machine_operator, assembly_staff, manager.
  - Columns: Master data, BOM/Revision, Snapshot order, Planning, Purchasing, Warehouse, QC, Production report, Assembly, Cost/price, Audit logs, User/RBAC.
- R1:526–537 mô tả chức năng + data scope mặc định mỗi role.
- R1:539–546 data scope rules (warehouse / order / cost / assembly / QC).

**Direction B có gì:**
- PROGRESS:50 seed 4 role.
- CommandPalette filter theo `user.role === 'admin' | 'planner' | 'warehouse' | 'viewer'` (brainstorm-deep §2.1:192).
- Thiếu 8/12 role. Không có data scope warehouse.

**Gap:**
- [ ] Chưa có entity `role`, `permission`, `role_permission`, `user_role` đầy đủ (R1:154 liệt kê).
- [ ] Không có session context `app.current_warehouse_id`, `app.can_view_cost`, `app.order_scope_ids` như R1:566–618.
- [ ] Không có Admin UI quản role + permission matrix.

**Đề xuất bổ sung:**
- Mở rộng seed lên 12 role theo R2:313.
- Bảng `permission` (code string PK) + `role_permission` (role_id, permission_id, scope_type{NONE|WAREHOUSE|ORDER|COST}).
- Middleware Next.js: sau khi verify JWT, load user → set session context variables (cho RLS sau này, hoặc check ở service layer).
- Admin UI `/admin/roles` với ma trận checkbox (dùng lại pattern `data-scope-matrix-test` của brainstorm-deep §7:570).

---

### 11. ETA learning rolling

**Research nói gì:**
- R2:264–278 formula:
  ```
  eta_baseline = po_order_date + lead_time_days_current + transport_buffer_days
  eta_safe     = po_order_date + lead_time_days_p90 + transport_buffer_days

  -- Sau mỗi receipt:
  actual_lead_time = receipt_date - po_order_date
  on_time_flag     = receipt_date <= expected_date

  -- Rolling update per item_vendor: avg, median, p90, on-time rate
  ```
- R2:206 `item_vendor.lead_time_days_current, lead_time_days_p90, std_price, moq`.

**Direction B có gì:**
- Supplier master có `leadTimeDays` (PROGRESS:74).
- Không có `lead_time_days_current` vs `lead_time_days_p90` tách đôi.
- Không có worker job rolling update.
- Dashboard có mock "5 PO ETA > 3 ngày" (design-spec:619).

**Gap:**
- [ ] Schema chưa tách current vs p90.
- [ ] Không có job rolling update.
- [ ] ETA board chỉ là mock.

**Đề xuất bổ sung:**
- Migration thêm cột `lead_time_days_current, lead_time_days_p90, on_time_rate_30d, on_time_rate_90d` vào `master.item_supplier`.
- BullMQ worker job `eta-rollup` chạy sau mỗi GRN complete: cập nhật rolling metrics cho cặp (item_id, vendor_id).
- Dashboard `/` + Supplier detail page hiển thị 2 số: ETA safe vs baseline + sparkline 90 ngày.

---

### 12. 15 điểm dễ bỏ sót

**Research nói gì:** R2:488–501 bảng 10 hạng mục: ECO approval, Substitute parts, Quarantine/hold stock, Calendar/shift/holiday, Label templates, Cycle counting, Training matrix, Rework flow, Warranty traceability, API-first integration.

**Direction B có gì:** Không cover trực tiếp. Gián tiếp:
- ECO stub có nhắc trong brainstorm §4.P3:11 nhưng P3.
- Substitute_group_code có trong DDL R1:271 nhưng không có UI.
- Quarantine bin không có flag trong Direction B.
- Label templates không có.

**Gap:** 10/10 hạng mục chưa có trong Direction B scope.

**Đề xuất bổ sung (xếp ưu tiên):**
- **V1.1 P1:** ECO lite form (submit/approve/apply), Substitute parts trong BOM editor (substitute_group_code dropdown), Quarantine bin flag (`location_bin.is_qc_hold boolean` + routing QC HOLD → bin này).
- **V1.2 P2:** Label template designer (Zebra ZPL cho lot/serial/bin/FG).
- **V1.3 P2:** Cycle count screen (warehouse đếm bin định kỳ), Rework order (khi FAIL QC production).
- **V2 P3:** Calendar/shift/holiday cho WO scheduling.
- **V2 P3:** Training matrix + operator certification (machine_operator chỉ vận hành machine đã được certify).
- **V2/V3:** Warranty lookup (đã đề cập ở luồng 9), API-first integration (webhook export, public REST API cho accounting/e-invoice).

---

### 13. Migration 10 bước từ Excel

**Research nói gì:**
- R1:755–766 (10 bước): Inventory profiling → Chuẩn hóa master → Import item → Import vendor → Import BOM templates/revisions → Import open orders → Import tồn kho đầu kỳ → Import open PO/WO → Reconciliation → Cutover.
- R2:424–444 pipeline bảng 6 pipeline + 4 lớp validation (cú pháp / nghiệp vụ / BOM structure / vận hành).

**Direction B có gì:**
- Import Wizard 3-step cho Item Master đã cook tuần 2 (PROGRESS:84).
- Direction B thêm bước ColumnMapper (design-spec §2.6:1196 + §3.16:2393) + synonym dict + save preset + duplicate headers handle + file size guard (brainstorm-deep §2.4:248) — **rất tốt, đúng hướng**.
- Mới cover bước 3/10 (Import item master).

**Gap:**
- [ ] Chưa có import Vendor + lead time (bước 4).
- [ ] Chưa có import BOM template/revision (bước 5) — là bước khó nhất vì có cycle check + parent-child hierarchy.
- [ ] Chưa có import Open Stock (bước 7), Open PO (bước 8), Open WO.
- [ ] Chưa có reconciliation report (bước 9).

**Đề xuất bổ sung:**
- Pattern ColumnMapperStep có sẵn (design-spec §3.16), generalize thành `ColumnMapperStep<TTargetFields>` reusable cho:
  - `/suppliers/import` — bước 4.
  - `/bom-templates/import` — bước 5 (với extra: parent-child resolve, cycle check, phantom flag).
  - `/stock/opening-balance/import` — bước 7.
  - `/purchase-orders/import-open` — bước 8.
- Thêm screen `/migration/reconciliation` chạy 4 lớp validation R2:437 (cú pháp/nghiệp vụ/BOM structure/vận hành) → diff với Excel cũ.
- Mỗi import pipeline kèm 1 Excel template download endpoint (đã có cho items, nhân bản cho 4 entity còn lại).

---

### 14. Roadmap 3 phase

**Research nói gì:**
- R2:446–472 Gantt:
  - Phase đầu (8–10 tuần): V1 end-to-end BOM-PR-PO-GRN-QC-WO-Asm-Ship-Audit-Backup.
  - Phase tiếp (4–6 tuần): Edge gateway PoC + Machine board + OEE-lite.
  - Phase sau (6–8 tuần): Lead-time learning + supplier scorecards + forecasting + variance analytics.
- R1:790–796 tương tự 3 phase.

**Direction B có gì:**
- PROGRESS:20 bảng roadmap có V1/V2/V3.
- Direction B đang gộp "V1 polish UI 8 screens" với "V1 nghiệp vụ đầy đủ 10 module" thành 1 sprint 10 ngày.
- Plan §12:1474 defer BOM editor, Order, WO, Assembly, FG serial, Shipping sang V1.1/V1.2/V1.3 nhưng không có timeline.

**Gap:**
- [ ] Direction B gắn nhãn "Refresh trung bình 10-14 ngày" nhưng thực chất chỉ cover ~30% V1 scope R2:446 (8–10 tuần). Có risk communication với stakeholder ("V1 chạy được"="UAT xưởng thực").
- [ ] Thiếu timeline cho V1.1, V1.2, V1.3.

**Đề xuất bổ sung (chiến lược, không phải code):**
- Rename "Direction B" thành "V1.0 — UI foundation & Item Master polish" để rõ scope.
- Viết `plans/redesign/260417-v1-roadmap-expanded.md`:
  - V1.0 (10 ngày, hiện tại): UI 8 screen + P0 bugs fix.
  - V1.1 (3 tuần): Order Entry + BOM Template/Revision/Snapshot editor + ECO lite.
  - V1.2 (2 tuần): PO full (create/send/receive/QC 3-way) + `stock_transaction` unified + putaway + reserve.
  - V1.3 (3 tuần): WO + Assembly (pick/scan/consume/complete) + FG serial + Shipping partial/full.
  - V1.4 (1 tuần): RBAC 12 role + Migration 10-bước wizard + Reconciliation.
- Khi nói "V1 LIVE mes.songchau.vn" như trong CLAUDE.md, cần phân biệt rõ "V1.0 LIVE" vs "V1 nghiệp vụ LIVE".

---

## Khuyến nghị tiếp theo (next steps)

Không phải todo list — là thứ tự logic để đưa Direction B + backlog vào V1 go-live thật.

1. [ ] **P0 — Trong 10 ngày sprint hiện tại (không đổi scope):**
   - Cook Direction B y nguyên 8 screens (brainstorm-deep §8 checklist 27 quyết định + design-spec + implementation-plan).
   - Chỉ thêm 1 điều chỉnh: đổi QC radio trong Receiving PWA từ `PASS/FAIL` thành `PASS/HOLD/FAIL` (mỗi lựa chọn stub nhưng có entity đúng — 30 phút work, tránh migration lớn sau).
   - Thêm column `offline_queue_id uuid` vào `stock_transaction` schema khi tạo — design-spec không đụng nhưng migration sẽ rẻ hơn sau.

2. [ ] **P0 — Trước khi cook V1.1:**
   - Viết `plans/redesign/260417-v1-roadmap-expanded.md` như §14 đề xuất.
   - Thiết kế migration `0004_inventory_stock_transaction.sql` (partition theo tháng) — tiền đề cho mọi module sau.
   - Thiết kế entity `sales.customer_order`, `sales.order_bom_snapshot` với 9 trường qty (§4).
   - Mở rộng role seed lên 12 (§10).

3. [ ] **P1 — V1.1 sprint (3 tuần sau):**
   - BOM Template/Revision/Snapshot editor (§2).
   - Order Entry + Snapshot Board (§1).
   - 4 state machine chuẩn hoá (§3).
   - ETA learning rolling worker (§11).
   - ECO lite (§12).

4. [ ] **P1 — V1.2 sprint:**
   - PO full flow 3-way QC + putaway + reserve rules (§5, §6).
   - Traceability log-first unified (§8).
   - Warehouse data scope RLS (§10).

5. [ ] **P1 — V1.3 sprint:**
   - WO + Assembly + FG serial + Warranty lookup (§9).
   - Shipping partial/full.

6. [ ] **P2 — V1.4 + V2 backlog:**
   - 15 điểm dễ bỏ sót còn lại (§12).
   - Migration 10 bước wizard đầy đủ (§13).
   - V2 edge gateway (§14).

---

## Tham chiếu chéo

### Báo cáo phần 1 — sections cần đọc thêm khi mở rộng scope
- Dòng 19: Nguyên tắc snapshot bất biến.
- Dòng 34: Traceability log-first.
- Dòng 146–165: Schema nghiệp vụ chia 11 schema (`auth/master/engineering/sales/procurement/production/inventory/assembly/quality/costing/audit`).
- Dòng 242–327: DDL BOM revision/line + order_bom_snapshot (copy nguyên vào V1.1 migration).
- Dòng 365–395: DDL `stock_transaction` partitioned (copy vào V1.2).
- Dòng 397–426: DDL `assembly_scan_log` (copy vào V1.3).
- Dòng 434–470: Recursive CTE BOM explosion — reference SQL cho MRP-lite service.
- Dòng 478–497: Mermaid flowchart end-to-end.
- Dòng 501–507: 4 state machine.
- Dòng 510–519: Offline queue 6 bước.
- Dòng 566–618: GRANT + RLS mẫu.
- Dòng 755–766: Migration 10 bước.

### Báo cáo phần 2 — sections cần đọc thêm
- Dòng 32: 3 entity BOM tách biệt.
- Dòng 34: Transaction log thay "số tồn hiện tại".
- Dòng 93–127: Sequence diagram end-to-end 9 actor.
- Dòng 154–198: Tables chính V1 (mapping sang tên tiếng Việt dễ hiểu).
- Dòng 247–278: Partial qty model + reservation rules + ETA formula.
- Dòng 313–326: Ma trận RBAC 12×12.
- Dòng 446–472: Gantt roadmap 3 phase.
- Dòng 488–501: 15 điểm dễ bỏ sót.

### Design spec sections cần sửa/bổ sung (không đụng scope 10 ngày, chuẩn bị V1.1+)
- §2.8 Receiving PWA: thêm HOLD vào QC radio (3-way thay 2-way).
- §3.12 StatusBadge: mở rộng preset từ 7 hiện tại lên đủ các state của 4 entity R1:501–507 (≥ 35 preset).
- §2.x (V1.1): thêm screen specs cho `/orders`, `/orders/[id]`, `/bom-templates`, `/bom-templates/[id]/editor`, `/snapshot-board`, `/shortage-board`.
- §7 Asset checklist: thêm illustration empty state cho các màn mới V1.1–V1.3.

### Implementation plan sections cần sửa
- §1.2 Dependency graph: thêm branch V1.1 follow-up.
- §12 Defer list: đưa timeline V1.1/V1.2/V1.3 cụ thể thay vì "defer V1.1/V1.2" generic.

---

*End of gap analysis. Version 1.0 — 2026-04-17.*
