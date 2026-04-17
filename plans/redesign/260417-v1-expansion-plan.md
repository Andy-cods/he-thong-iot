# V1 Expansion Plan — Bổ sung luồng nghiệp vụ (V1.1 → V1.4)

- **Ngày:** 2026-04-17
- **Tác giả:** planner (Opus 4.7 1M)
- **Trạng thái:** Ready for review — chưa start
- **Nguồn chính:** [`260417-gap-analysis-vs-research.md`](./260417-gap-analysis-vs-research.md) (520 dòng)
- **Nguồn tham chiếu:**
  - `deep-research-report cho hệ thốngg phần 1.md` (R1) — DDL mẫu + state machine + offline queue + migration 10 bước
  - `deep-research-report cho hệ thống phần 2.md` (R2) — RBAC 12×12 + reservation rules + 15 điểm dễ bỏ sót + roadmap 3 phase
  - [`260417-implementation-plan.md`](./260417-implementation-plan.md) — plan Direction B (V1.0 UI foundation)
  - [`260417-design-spec.md`](./260417-design-spec.md) — component pattern đã có (StatusBadge, DataTable, Sheet, FilterBar, ColumnMapper, BarcodeScanner, Dexie queue)
  - [`260417-brainstorm-deep.md`](./260417-brainstorm-deep.md) — 30 quyết định đã chốt
  - `CLAUDE.md`, `PROGRESS.md`

> **Ràng buộc bất di bất dịch:** Tiếng Việt UI + comment. YAGNI/KISS/DRY. Không over-engineer. Build local trước push VPS. **Plan này bắt đầu SAU KHI Direction B (V1.0) cook xong tag `v1.1.0`** — trong thời gian Direction B cook, KHÔNG được pre-implement bất kỳ entity/screen nào trong V1.1-V1.4.

---

## §0 Tóm tắt điều hành

### 0.1 Bối cảnh

Direction B (10-14 ngày) là sprint **UI foundation** cho 8 screens (`/login`, `/`, AppShell, `/items`, `/items/[id]`, `/items/import`, `/suppliers`, `/pwa/receive/[poId]`). Sau khi Direction B tag `v1.1.0`, hệ thống có: navigation shell, Item Master polished, Import Wizard mở rộng, Receiving PWA min viable. **Nhưng** `gap-analysis §0 Tóm tắt` chỉ rõ: mới cover **3-4/14 luồng nghiệp vụ** R1/R2 khuyến nghị, toàn bộ xương sống BOM-centric + Order + WO + Assembly + Ship vẫn chưa tồn tại.

### 0.2 Mục tiêu plan này

Đưa hệ thống từ **"V1.0 UI foundation"** → **"V1 nghiệp vụ đầy đủ end-to-end"** trong 9-10 tuần, khớp roadmap R2:446 (phase đầu 8-10 tuần). Mỗi sprint V1.x có mục tiêu độc lập + deliverable rõ + acceptance criteria để stakeholder UAT cuối sprint.

### 0.3 Timeline tổng quan

| Sprint | Thời lượng | Mục tiêu một câu | Output cuối sprint |
|---|---|---|---|
| **V1.1** | 3 tuần | Dựng xương sống BOM-centric: Template → Revision → Snapshot-per-order → Explode → Shortage | Tạo 1 order mẫu, explode ra shortage list, UI 9 cột qty |
| **V1.2** | 2 tuần | Mọi biến động kho đi qua 1 bảng `stock_transaction` unified + reservation rules + QC 3-way + PO full | 1 PO → partial GRN → QC → putaway → reserve cho snapshot line; dashboard thấy số khớp |
| **V1.3** | 3 tuần | Hoàn tất vòng Make → Assembly → Ship + FG serial warranty lookup | 1 đơn từ V1.1 đi hết end-to-end đến ship; lookup serial trả cây part/lot/operator/order |
| **V1.4** | 1-2 tuần | Hardening: RBAC 12 roles × 12 quyền + Migration wizard 5 entity + Polish | Admin phân 12 role data-scope warehouse; import 5 entity cùng pattern; audit viewer hoạt động |
| **Total** | **9-10 tuần** | | Song Châu UAT 1 đơn hàng end-to-end từ BOM → ship + warranty lookup |

### 0.4 Mục tiêu cuối V1 nghiệp vụ LIVE

Xưởng cơ khí Song Châu có thể:
1. Kỹ sư thiết kế tạo BOM template máy CNC với 3 cấp, release revision R01.
2. Sales nhập đơn hàng SO-0001 (3 máy), chọn BOM rev R01 → tạo snapshot bất biến.
3. MRP-lite explode ra 25 component level 3, shortage board hiển thị đúng thiếu/đủ.
4. Planner/purchasing tạo PO cho 18 component thiếu, gửi vendor, nhận hàng partial, QC quyết định PASS/HOLD/FAIL, putaway vào bin, reserve cho snapshot line.
5. Khi đủ component, planner release work order, operator cập nhật tiến độ qua tablet, in-process QC.
6. Assembly team pick list theo FIFO, scan component (offline-capable), tạo FG serial link ngược component lot/serial.
7. Shipping partial/full, in packing slip.
8. Customer service lookup FG serial 3 tháng sau → trả cây part/lot/operator/WO/PO/receipt/vendor (warranty traceability).
9. Admin phân quyền 12 role với data scope warehouse/order/cost.
10. Migration team import BOM/vendor/stock/PO từ Excel cũ cùng pattern wizard.

---

## §1 Prerequisites từ Direction B

Trước khi kick-off V1.1, phải verify **Direction B đã merge và các artifact sau sẵn sàng** (mỗi item block V1.1 tuần 1):

- [ ] Tag `v1.1.0` đã deploy VPS https://mes.songchau.vn, smoke pass 8 screens.
- [ ] `StatusBadge` (design-spec §3.12) deployed — V1.1 sẽ mở rộng preset từ 7 hiện tại lên ≥35 (đủ cho 4 state machine R1:501-507).
- [ ] `DataTable` + `FilterBar` + `ItemQuickEditSheet` + `ColumnMapperStep` pattern đã stable — V1.1-V1.4 sẽ reuse heavy (không cook lại).
- [ ] `BarcodeScanner` + Dexie offline queue + 3 kênh feedback (visual/audio 880/220Hz/haptic) hoạt động trên PWA Receiving — V1.3 Assembly sẽ reuse y chang.
- [ ] `CommandPalette` (Ctrl+K) + AppShell sidebar đã có — V1.1 sẽ thêm 6 nav items (BOM/Orders/PO/WO/Assembly/Shipments) vào sidebar.
- [ ] Migration 0002 (pg_trgm + unaccent) đã apply — search không dấu hoạt động. `FEATURE_UNACCENT=true`.
- [ ] Worker container UP stable (fix xong pnpm symlink) — V1.1 sẽ dùng BullMQ cho BOM explosion + ETA rollup + reservation auto-release.
- [ ] AUTH_COOKIE_NAME = `iot_session` single-source `@iot/shared/constants.ts` — V1.4 RBAC middleware reuse.
- [ ] Audit event entity `audit.audit_event` đã có data từ item edit (PROGRESS:76) — V1.4 audit viewer UI sẽ query bảng này.
- [ ] 1 điều chỉnh đã làm trong sprint Direction B theo gap-analysis khuyến nghị P0:
  - QC radio Receiving PWA đã đổi từ 2-way (PASS/FAIL) sang **3-way (PASS/HOLD/FAIL)** — V1.2 sẽ route HOLD sang quarantine bin (fix 30 phút trong Direction B để tránh migration lớn sau).
  - Column `offline_queue_id uuid` đã reserve sẵn trong schema `stock_transaction` (dù chưa có bảng) — V1.2 sẽ kích hoạt dedup.

**Nếu 1 trong 10 item trên chưa xong**, delay V1.1 kick-off thay vì bắt đầu song song — tránh phải rewrite sau.

---

## §2 Nguyên tắc chung cho 4 sprint

### 2.1 Discipline bắt buộc (R1/R2 đều nhấn)

1. **Snapshot bất biến** (R1:19) — mỗi order release tạo 1 `bom_snapshot` copy toàn bộ BOM lines, KHÔNG tham chiếu live revision. ECO sau đó không tự động vào snapshot.
2. **Log-first transaction** (R1:34, R2:34) — mọi biến động kho (RECEIPT/ISSUE/TRANSFER/ADJUST/RESERVE/UNRESERVE/PROD_IN/PROD_OUT/ASM_ISSUE/ASM_RETURN) append vào `inventory.stock_transaction`. `stock_balance` là view/cache từ SUM transaction, không phải source of truth.
3. **State machine per-entity** (R1:501-507) — mỗi entity có column `status` + function `transition(entityId, fromStatus, toStatus, actor, reason)` validate server-side. Mỗi transition append audit row.
4. **Partial qty model** (R2:247) — không dùng yes/no cho "đã nhận/đã lắp"; dùng 9 cột qty song song trên `bom_snapshot_line`.
5. **Offline idempotent** (R1:510, D20) — client generate UUID v7 `offline_queue_id` cho mọi scan/tx. Server dedup theo key này, duplicate trả kết quả cũ (200 không 409).
6. **Reservation rules** (R2:252) — chỉ reserve QC-pass, FIFO/FEFO, pick tạo task chưa trừ `issued_qty`, issue chỉ khi scan, no-negative-stock.
7. **3 kênh feedback** (R1:510) — mọi scan/action quan trọng: visual flash + audio 880/220Hz + haptic. Respect `prefers-reduced-motion` bỏ flash/haptic nhưng giữ audio.
8. **Traceability đầy đủ** (R2:500) — từ FG serial phải truy ngược được: component lot/serial → receipt → PO → vendor → operator → WO/AO → shipping.

### 2.2 Pattern UI reuse từ Direction B

Mọi screen V1.1-V1.4 KHÔNG cook lại primitive — reuse 18 components đã có:
- **List screen:** `PageHeader + FilterBar (nuqs) + DataTable + BulkActionBar + QuickEditSheet + EmptyState + LoadingSkeleton + Pagination`.
- **Detail screen:** `PageHeaderDetail + ItemTabs + FormActionBar + TabErrorBadge + Dialog type-XOA cho delete`.
- **Import:** `Stepper + Step1Upload + Step2ColumnMapper + Step3Preview + Step4Result + ImportProgressBar`.
- **PWA screen:** `PwaLayout + PwaTopBar + StatusStrip + BarcodeScanner + ManualInput + ScanStatus + ScanQueueBadge + ScanQueueSheet + Dexie queue hook`.

Mỗi sprint chỉ cook component mới khi thực sự cần (BOM tree editor, Snapshot line card 9-col, Assembly scan shelf, etc.).

### 2.3 Naming convention entity (tham chiếu gap-analysis Tham chiếu chéo)

Mỗi entity mới đặt trong schema tương ứng (R1:146-165): `auth/master/engineering/sales/procurement/production/inventory/assembly/quality/costing/audit`. Không để "schema `app` phẳng" như tuần 2 đã làm — V1.1 sẽ là thời điểm migrate hoặc tạo schema mới song song tùy chiến lược migration (quyết định ở §7 sprint V1.4 hoặc trước V1.1 kick-off).

### 2.4 Ràng buộc scope từng sprint

- Không đẩy scope sprint sau sang sprint hiện tại dù thừa thời gian. Nếu xong sớm → polish acceptance test + UAT với Song Châu thực.
- Nếu trễ > 20% → thêm tuần buffer, KHÔNG cắt acceptance criteria.
- Mỗi sprint có 1 ngày cuối cho UAT với PO/BA Song Châu, không skip dù gấp.

---

## §3 Sprint V1.1 — BOM + Order backbone (3 tuần)

### 3.1 Mục tiêu

Đưa "xương sống BOM-centric" vào hệ thống. Sau sprint này, người dùng có thể: tạo BOM template cho 1 máy CNC 3 cấp → release revision R01 → tạo 1 sales order chọn template → snapshot bất biến → MRP-lite explode recursive CTE → shortage board hiển thị thiếu/đủ component.

### 3.2 Gap được giải quyết

- [x] **Gap #2 BOM discipline** (gap-analysis §2, R1:19, R2:32, R2:245) — 3 entity tách biệt Template/Revision/Snapshot.
- [x] **Gap #1 Order end-to-end phần đầu** (gap-analysis §1, R1:478-497, R2:93-127) — Sales → BOM → Snapshot → Explode → Shortage (5 bước đầu của 10 bước MRP).
- [x] **Gap #4 Partial qty model** (gap-analysis §4, R2:247) — 9 cột qty trên `bom_snapshot_line`.
- [x] **Gap #3 State machine 1/4** (gap-analysis §3, R1:501) — BOM snapshot line (10 state).
- [x] **Gap #12 P1 stub** — ECO lite (substitute parts + ECO request stub approval flow).

### 3.3 Breakdown tuần/ngày

#### Tuần 1 — BOM Template + Revision editor

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 1 | Schema design + state machine file | Entity `engineering.bom_template`, `bom_revision`, `bom_component` (parent-child, substitute_group_code, phantom flag, scrap_pct); state machine `bom-revision.ts` (DRAFT → RELEASED → OBSOLETE) |
| Day 2 | Screen `/bom/templates` (list) + `/bom/templates/new` (form) | Reuse `DataTable + FilterBar + PageHeader`. Filter theo code/name/category/status. Button "Tạo template" → form 2-step (metadata → tree editor) |
| Day 3 | Screen `/bom/templates/[id]` + revision tab | Tab 1 Metadata, Tab 2 Revisions (list), Tab 3 Where-used (placeholder). Button "Tạo revision mới" → clone latest → DRAFT |
| Day 4 | Revision editor `/bom/revisions/[id]` (recursive tree) | Component tree với drag/drop add-child, inline edit qty_per_parent + uom + substitute_group + phantom. Button "Release" → Dialog type-to-confirm, lock edit. Button "Obsolete" khi đã có revision mới RELEASED |
| Day 5 | ECO lite stub + UAT tuần 1 | Screen `/eco` list request, form "Change request cho template X từ rev R01 → R02 với lý do Y". Status DRAFT/SUBMITTED/APPROVED/REJECTED/APPLIED. V1.1 KHÔNG auto-apply vào snapshot đã tạo. |

#### Tuần 2 — Sales Order + Snapshot

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 6 | Entity `sales.customer_order`, `sales.customer_order_line` | Fields: so_no, customer_id, status (DRAFT→CONFIRMED→IN_PRODUCTION→PARTIAL_SHIPPED→CLOSED→CANCELLED), due_date, total_amount. Order line: item_or_bom_template_id, qty, uom |
| Day 7 | Screen `/orders` list + `/orders/new` | Reuse DataTable pattern. Filter status + customer + due_date range + readiness status. Form: header + line items (chọn BOM template cho hàng custom, chọn item cho hàng spare) |
| Day 8 | Screen `/orders/[id]` detail — 3 tab (Thông tin / Snapshot / Shipment placeholder) | Tab 1 metadata readonly sau CONFIRMED. Tab 2 Snapshot (empty nếu chưa release). Button "Release đơn → Tạo snapshot" trigger job |
| Day 9 | Entity `sales.bom_snapshot` + `sales.bom_snapshot_line` với 9 cột qty | 9 cột: `required_qty, gross_required_qty, open_purchase_qty, received_qty, qc_pass_qty, reserved_qty, issued_qty, assembled_qty, remaining_short_qty` (R2:247). `remaining_short_qty` là generated column. Status 10 state (R1:501): PLANNED → PURCHASING/IN_PRODUCTION → INBOUND_QC/PROD_QC → AVAILABLE → RESERVED → ISSUED → ASSEMBLED → CLOSED |
| Day 10 | Snapshot board cho 1 order (tab 2 detail) | Reuse DataTable render snapshot lines. Progress bar 5 tầng (required → received → qc-pass → reserved → issued). StatusBadge 10 state. UAT tuần 2: tạo order SO-0001, release → snapshot |

#### Tuần 3 — Explode + Shortage + Dashboard

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 11 | Recursive CTE BOM explosion (R1:434-470) | Worker job BullMQ `bom-explode`: input order_id, output insert snapshot_line cho mọi level. Scrap_pct cộng dồn. Substitute_group cho phép nhiều item ở cùng level. Phantom (dummy parent) skip explode nhưng explode children |
| Day 12 | Screen Shortage Board `/shortage-board` | Aggregate snapshot_line status IN ('PLANNED','PURCHASING') GROUP BY item_id. Cột: item + required_total + covered (received+reserved) + shortage + earliest_due_date. Action "Tạo PR/PO" stub → link V1.2 |
| Day 13 | Dashboard KPI real data (thay mock DASHBOARD_USE_MOCK) | API `/api/dashboard/overview` trả: orders_at_risk (snapshot lines shortage > 0 AND due < 7d), total_orders_in_production, items_available_count, pending_qc (stub V1.1 = 0, V1.2 sẽ real). Orders Readiness table: top 10 order theo due_date + readiness% = SUM(received) / SUM(required) |
| Day 14 | State machine snapshot line transition logic | File `lib/state-machines/bom-snapshot-line.ts`. Function `transitionSnapshotLine(lineId, toStatus, actor, reason)`. Validate allowed transitions. Append row `audit.audit_event` |
| Day 15 | UAT end-to-end + polish + risk mitigation | Scenario: tạo template "Máy CNC ABC" 3 cấp, release R01, tạo SO-0001 3 máy, release → snapshot, explode ra 25 component, shortage board hiển thị đúng 18 component thiếu + 7 đủ |

### 3.4 Deliverables summary

**Screens mới cook (10 screens):**
- `/bom/templates` (list) — role `design_engineer` write, `material_planner` read
- `/bom/templates/new` (form)
- `/bom/templates/[id]` (detail 3 tab)
- `/bom/revisions/[id]` (tree editor)
- `/eco` (list ECO request)
- `/eco/new` (form)
- `/orders` (list) — `sales` write, `material_planner`/`purchasing`/`warehouse_staff` read
- `/orders/new`
- `/orders/[id]` (detail 3 tab, tab snapshot là Snapshot Board cho 1 order)
- `/shortage-board` — `material_planner`/`purchasing` read

**Entity mới (9 bảng):**
- `engineering.bom_template`, `engineering.bom_revision`, `engineering.bom_component`
- `engineering.eco_request`
- `sales.customer_order`, `sales.customer_order_line`
- `sales.bom_snapshot`, `sales.bom_snapshot_line` (9 cột qty + 10 state)
- `audit.state_transition_log` (dùng chung cho 4 state machine V1.1-V1.3)

**Files mới (lib + worker):**
- `apps/web/src/lib/state-machines/bom-revision.ts`
- `apps/web/src/lib/state-machines/bom-snapshot-line.ts`
- `apps/worker/src/jobs/bom-explode.ts` (recursive CTE)
- `apps/web/src/lib/mrp/explode.ts` (server-side function reuse worker logic cho on-demand preview)

**API routes mới:**
- `/api/bom-templates`, `/api/bom-templates/[id]/revisions`
- `/api/bom-revisions/[id]`, `/api/bom-revisions/[id]/release`
- `/api/eco-requests`, `/api/eco-requests/[id]/submit|approve|apply`
- `/api/orders`, `/api/orders/[id]/release-snapshot`, `/api/orders/[id]/snapshot`
- `/api/shortage-board`
- `/api/dashboard/overview` (thay mock)

### 3.5 Acceptance criteria

- [ ] Tạo được template "Máy CNC ABC" với 3 cấp (top → sub-assembly → components), tổng 25 component lines.
- [ ] Release revision R01 (button "Release" hoạt động, DRAFT → RELEASED, lock edit).
- [ ] Tạo ECO request cho template trên, submit → approve (workflow stub).
- [ ] Tạo customer order SO-0001 với 3 máy CNC ABC (qty=3).
- [ ] Release snapshot cho SO-0001. Snapshot lines immutable (test: sửa revision R01 sang R02 sau đó, snapshot vẫn giữ R01).
- [ ] Explode recursive ra đúng 25 × 3 = 75 snapshot_line (có scrap_pct cộng dồn).
- [ ] Shortage board hiển thị 18 component thiếu với shortage_qty > 0, 7 component đủ với shortage_qty = 0.
- [ ] UI snapshot line card hiển thị đủ 9 cột qty + progress bar 5 tầng.
- [ ] StatusBadge 10 preset cho snapshot line hoạt động.
- [ ] Dashboard KPI hiển thị data thật (không mock), feature flag `DASHBOARD_USE_MOCK=false`.
- [ ] Test state machine: không cho phép skip PLANNED → RESERVED bỏ qua AVAILABLE.
- [ ] Axe a11y 0 serious + Lighthouse Perf ≥ 85 trên 10 screens mới.

### 3.6 Risks & mitigation

| # | Risk | Mức độ | Mitigation |
|---|---|---|---|
| R1.1 | Recursive CTE BOM explode chậm khi BOM > 5 cấp hoặc > 1000 component | Trung bình | Test với BOM mẫu 5 cấp × 20 child/cấp (9760 nodes). Nếu > 5s thì batch-insert chunk 500 lines. Fallback: chạy worker BullMQ async, UI polling 2s giống Import Wizard |
| R1.2 | Substitute group logic phức tạp — 1 component có 3 alternate, chọn cái nào khi explode? | Cao | V1.1 explode tất cả substitute vào snapshot_line (cùng group_code), V1.2 khi reserve chỉ chọn 1 theo FIFO stock available. Document rõ trong spec |
| R1.3 | ECO apply vào snapshot đã release — phá discipline bất biến | Cao | V1.1 ECO chỉ affect snapshot **chưa release** hoặc tạo revision mới cho order mới. Không bao giờ auto-modify snapshot live. Thêm warning dialog rõ ràng |
| R1.4 | State machine 10 state × transition rules dễ miss case | Trung bình | Viết unit test `bom-snapshot-line.test.ts` với matrix 10×10 (100 transition), mark valid/invalid. 90% không hợp lệ, chỉ 8-12 transition hợp lệ |
| R1.5 | UAT với PO Song Châu phát hiện item taxonomy + glossary chưa chốt → cần chỉnh mid-sprint | Cao | **Pre-requisite §7**: chốt trước glossary + item taxonomy + BOM model + UoM list trước Day 1 sprint. PO sign-off document |

---

## §4 Sprint V1.2 — Procurement + Warehouse unified transaction (2 tuần)

### 4.1 Mục tiêu

Mọi biến động kho đi qua 1 bảng `inventory.stock_transaction` log-first. Hoàn tất luồng PO: create → send → confirm → receive partial → QC 3-way (PASS/HOLD/FAIL) → putaway → reserve cho snapshot line. Sau sprint này, 1 PO mẫu sẽ được nhận hàng chia 2 đợt, QC quyết định disposition, reserve cho order V1.1, dashboard thấy số khớp (received_qty + reserved_qty = phần đã cover).

### 4.2 Gap được giải quyết

- [x] **Gap #8 Traceability log-first** (gap-analysis §8, R1:34, R1:365-395) — bảng `stock_transaction` partitioned với 10 tx_type.
- [x] **Gap #5 Reservation rules** (gap-analysis §5, R2:252-261) — FIFO/FEFO, chỉ QC-pass, pick tạo task chưa trừ issued, no-negative-stock.
- [x] **Gap #3 State machine 2/4** — PO line (8 state R1:504).
- [x] **Gap #6 QC incoming 3-way** (gap-analysis §6, R1:23) — PASS/HOLD/FAIL + quarantine bin (`is_qc_hold`).
- [x] **Gap #11 ETA learning** (gap-analysis §11, R2:264-278) — `lead_time_days_current` vs `lead_time_days_p90` + on-time rate rolling.
- [x] **Gap #7 polish** (gap-analysis §7) — `offline_queue_id` persist server-side cho dedup cross-device.

### 4.3 Breakdown tuần/ngày

#### Tuần 1 — PO full flow + stock_transaction + QC 3-way

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 1 | Entity `procurement.purchase_order`, `procurement.purchase_order_line` | PO: po_no, vendor_id, status (DRAFT→SENT→CONFIRMED→PARTIAL_RECEIVED→RECEIVED→QC_HOLD/QC_PASS/QC_FAIL→CLOSED), expected_delivery, transport_buffer_days. Line: item_id, ordered_qty, unit_price, linked_snapshot_line_id (nullable, cho PR-from-shortage) |
| Day 2 | Screen `/po` list + `/po/new` | Reuse DataTable pattern. Filter status + vendor + expected_delivery + linked_order. Form PO: header + line table. Button "Tạo PO từ shortage" (từ shortage-board link qua) |
| Day 3 | Screen `/po/[id]` detail 3 tab (Thông tin / Lines / GRN history) | State transitions: Send (DRAFT→SENT), Confirm vendor (SENT→CONFIRMED). Lines hiển thị progress received_qty/ordered_qty |
| Day 4 | Entity `inventory.stock_transaction` partitioned | 10 tx_type enum + `offline_queue_id uuid` (nullable, unique constraint dedup). Partition RANGE theo `posted_at` monthly. Trigger auto-create partition 3 tháng forward |
| Day 5 | Entity `procurement.receipt`, `procurement.receipt_line` + GRN console `/po/[id]/receive` (desktop) | Desktop version của PWA receiving (dùng khi không có scanner). Reuse DataTable edit-in-place. Line status pending/partial/received. Button "Submit GRN" insert `stock_transaction` tx_type=RECEIPT |
| Day 6 | QC console `/qc/incoming` — 3-way decision | Reuse DataTable list lots đang QC_HOLD (status=INBOUND_QC của snapshot line, hoặc receipt line có QC pending). Decision: PASS (receipt_line.qc_status=PASS, snapshot_line status → AVAILABLE) / HOLD (chuyển bin `is_qc_hold=true`) / FAIL (return vendor, tx_type=ADJUST OUT với reason REJECT) |
| Day 7 | Entity `quality.qc_inspection` + `inventory.location_bin.is_qc_hold` | qc_inspection: id, receipt_line_id, inspector_user_id, decision (PASS/HOLD/FAIL), notes, photo_urls (V1.3). `is_qc_hold` trên bin → routing khi HOLD tự động assign bin này |

#### Tuần 2 — Putaway + Reservation + ETA + Polish

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 8 | Entity `inventory.stock_reservation` + reservation rules | Fields: order_id, snapshot_line_id, item_id, lot_serial_id, qty, policy (FIFO/FEFO/SERIAL), reserved_at, released_at. Function `reserve(order_id, snapshot_line_id, qty)` với CHECK no-negative-stock (validate sum available - sum reserved >= qty request) |
| Day 9 | Auto-reserve trigger khi QC PASS | Business rule: sau QC PASS → check snapshot_line nào đang chờ item này (status=INBOUND_QC AND shortage > 0) → auto-call reserve theo FIFO order due_date |
| Day 10 | Screen `/putaway` (desktop + tablet PWA) | List items QC PASS chờ putaway. Scan bin → confirm. Tx_type=TRANSFER (receiving staging bin → warehouse bin). Update `stock_balance` view |
| Day 11 | Screen `/transfer` (warehouse move) + `/cycle-count` stub | Transfer 2 bin form đơn giản (scan item + from_bin + to_bin + qty). Tx_type=TRANSFER. Cycle count stub: screen list bin, nút "Đếm" → form input qty thực tế, diff → tx_type=ADJUST |
| Day 12 | ETA learning worker | BullMQ job `eta-rollup` trigger sau mỗi GRN complete. Cập nhật `master.item_supplier.lead_time_days_current` (avg 90d) + `lead_time_days_p90` + `on_time_rate_30d/90d`. Supplier detail page hiển thị 2 số + sparkline 90d |
| Day 13 | State machine PO line (8 state R1:504) + file `lib/state-machines/po-line.ts` | States: DRAFT → SENT → CONFIRMED → PARTIAL_RECEIVED → RECEIVED → QC_HOLD/QC_PASS/QC_FAIL → CLOSED. Transition test matrix |
| Day 14 | UAT end-to-end V1.2 + polish | Scenario: tạo PO-0001 cho 18 component shortage từ V1.1, gửi vendor, confirm, nhận 2 đợt (partial → received), QC 1 đợt PASS + 1 đợt HOLD, putaway, reserve cho snapshot lines |

### 4.4 Deliverables summary

**Screens mới cook (9 screens):**
- `/po` (list) — `purchasing`/`material_planner` write
- `/po/new`
- `/po/[id]` (detail 3 tab)
- `/po/[id]/receive` (GRN console desktop) — `warehouse_staff`
- `/qc/incoming` — `qc_inspector` write, others read
- `/putaway` — `warehouse_staff`
- `/transfer` — `warehouse_staff`
- `/cycle-count` (stub list) — `warehouse_staff`
- Supplier detail page `/suppliers/[id]` mở rộng (từ Direction B stub) thêm ETA sparkline

**Entity mới (7 bảng):**
- `procurement.purchase_order`, `procurement.purchase_order_line`
- `procurement.receipt`, `procurement.receipt_line`
- `inventory.stock_transaction` (partitioned monthly)
- `inventory.stock_reservation`
- `quality.qc_inspection`

**Entity sửa đổi:**
- `inventory.location_bin` thêm `is_qc_hold boolean`
- `master.item_supplier` thêm `lead_time_days_current`, `lead_time_days_p90`, `on_time_rate_30d`, `on_time_rate_90d`

**Files mới:**
- `apps/web/src/lib/state-machines/po-line.ts`
- `apps/web/src/lib/state-machines/snapshot-line-v1.2.ts` (mở rộng từ V1.1, thêm transition từ RESERVED logic)
- `apps/web/src/lib/reservation/rules.ts` (FIFO/FEFO engine)
- `apps/worker/src/jobs/eta-rollup.ts`
- `apps/worker/src/jobs/auto-reserve.ts` (trigger khi QC PASS)
- `apps/web/src/lib/stock-transaction/post.ts` (helper common cho mọi endpoint write)

**API routes mới:**
- `/api/po`, `/api/po/[id]/send|confirm|close`
- `/api/receipts`, `/api/receipts/[id]/events` (kế thừa Direction B, mở rộng tx_type)
- `/api/qc-inspections`, `/api/qc-inspections/[id]/decision`
- `/api/reservations`, `/api/reservations/[id]/release`
- `/api/putaway`, `/api/transfer`, `/api/cycle-count/[binId]/adjust`
- `/api/stock-transactions` (read-only, filter theo item_id + date range)

### 4.5 Acceptance criteria

- [ ] Tạo PO-0001 cho 18 component từ shortage board V1.1 (link `linked_snapshot_line_id`).
- [ ] State machine PO: Send → SENT, Confirm vendor → CONFIRMED.
- [ ] Nhận hàng đợt 1 (partial): 10/18 line received full, 5 line partial, 3 line chưa. PO status → PARTIAL_RECEIVED.
- [ ] Nhận đợt 2: đủ 18 line. PO status → RECEIVED.
- [ ] QC console: quyết định 15 line PASS, 2 line HOLD (route vào bin quarantine), 1 line FAIL (return vendor, tx_type=ADJUST OUT).
- [ ] Auto-reserve: 15 line PASS tự động reserve cho snapshot_line V1.1 đang shortage theo FIFO due_date.
- [ ] Putaway 15 line PASS từ staging bin → warehouse bin (tx_type=TRANSFER).
- [ ] `inventory.stock_transaction` có 18+15+3 = 36 rows (18 RECEIPT + 15 TRANSFER putaway + 1 ADJUST reject + ... thực tế tính lại theo flow). Mọi row có `offline_queue_id` nếu từ PWA.
- [ ] Dashboard KPI cập nhật: snapshot_line.received_qty + reserved_qty = đúng sum từ stock_transaction. `pending_qc` hiển thị 2 (HOLD).
- [ ] ETA learning: sau 2 GRN complete, supplier detail page hiển thị `lead_time_days_current` khác với initial + sparkline 2 điểm.
- [ ] Reservation no-negative-stock: thử reserve 100 đơn vị khi chỉ có 80 available → server trả 409 CONFLICT + reason rõ ràng.
- [ ] PWA receiving: scan 1 item 2 lần với cùng offline_queue_id → server trả 200 với kết quả cũ (dedup), không tạo 2 tx.
- [ ] Dexie queue sync cross-device: device A scan offline, device B online scan cùng item → server trả đúng 1 tx.

### 4.6 Risks & mitigation

| # | Risk | Mức độ | Mitigation |
|---|---|---|---|
| R2.1 | Partition `stock_transaction` theo posted_at monthly — trigger auto-create partition fail in production | Cao | Test script migration kèm pg_partman hoặc manual trigger. Pre-create 12 partition forward để buffer. Alert nếu < 3 partition forward. Ref pg_partman hoặc self-managed như R1:365 |
| R2.2 | Reservation race condition (2 user cùng reserve 1 item lúc stock = 50, mỗi người xin 30) | Cao | Function `reserve()` dùng `SELECT FOR UPDATE` trên `item_stock_balance` row + advisory lock theo item_id. Unit test concurrent scenario với pg_advisory_lock |
| R2.3 | QC inspector UI không biết lot nào còn HOLD sau 30 ngày → stock tồn quarantine bin vô hạn | Trung bình | QC console thêm filter "Age > 7/14/30d" + email alert tuần. V1.4 thêm dashboard widget "QC Hold > 14d" |
| R2.4 | Offline queue `offline_queue_id` dedup fail khi client tạo UUID trùng (RNG weak) | Thấp | UUID v7 có 62 bit random, xác suất collision < 10^-15 trong 1 năm. Server thêm partial index unique (offline_queue_id) + retry graceful nếu duplicate INSERT |
| R2.5 | ETA learning worker chạy sau mỗi GRN → queue backlog khi nhận 50 PO/ngày | Thấp | Debounce 5 phút (nếu có job cùng item_vendor trong queue → skip). Hoặc batch nightly thay real-time nếu thấy load cao |
| R2.6 | PO line linked_snapshot_line_id → khi snapshot release sau đó phát hiện sai, làm sao update PO? | Trung bình | V1.2 KHÔNG cho phép "reassign PO line sang snapshot line khác" — phải cancel PO cũ, tạo PO mới. Document rõ + UAT với purchasing team |

---

## §5 Sprint V1.3 — Production + Assembly + Shipping (3 tuần)

### 5.1 Mục tiêu

Hoàn tất vòng Make → Assembly → Ship. Sau sprint này, 1 order V1.1 sẽ đi hết end-to-end: planner release WO → operator update progress (tablet) → in-process QC → pick list → assembly scan (offline-capable, reuse Receiving pattern) → tạo FG serial với link ngược component lot/serial/operator → shipping partial/full → warranty lookup 1 serial trả ra đầy đủ traceability tree.

### 5.2 Gap được giải quyết

- [x] **Gap #3 State machine 3+4/4** (R1:505, R1:506) — Work order (8 state) + Assembly order (7 state).
- [x] **Gap #9 Lot/Serial full flow** (gap-analysis §9, R1:398-426, R2:500) — FG serial entity + warranty traceability.
- [x] **Gap #1 Order end-to-end phần cuối** — WO/Assembly/Ship (bước 6-10 của 10 bước MRP).
- [x] **Gap #6 QC in-process + final** (gap-analysis §6, R1:23) — QC sau mỗi operation + final QC trước ship.
- [x] **Gap #12 P1** — Rework flow (R2:499), Nonconformance.

### 5.3 Breakdown tuần/ngày

#### Tuần 1 — Work Order + Production report

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 1 | Entity `production.work_order`, `production.work_order_operation` | WO: wo_no, snapshot_line_id (parent of what being made), planned_qty, good_qty, scrap_qty, status (DRAFT→RELEASED→READY→RUNNING→PAUSED→QC_PENDING→DONE/CANCELLED, 8 state R1:505), planned_start/end. Operation: wo_id, sequence, work_center_id, description, planned_duration |
| Day 2 | Screen `/wo` list + `/wo/new` | Reuse pattern. Filter status + work_center + planned_date. Form: chọn snapshot_line (parent hàng gia công nội bộ — phantom hoặc sub-assembly), planned_qty, operations |
| Day 3 | Screen `/wo/[id]` detail 3 tab (Thông tin / Operations / Output) | Transitions: Release (DRAFT→RELEASED, lock edit), Ready (RELEASED→READY, vật tư đủ), Start (READY→RUNNING), Pause (RUNNING→PAUSED), Resume, QC pending (RUNNING→QC_PENDING), Done |
| Day 4 | Operator Progress Screen (tablet 1024px) `/wo/[id]/operator` | Tap-friendly UI. Start/Pause/Resume button big. Input good_qty/scrap_qty per operation + reason code scrap. Camera barcode scan machine ID (work_center_id) |
| Day 5 | Entity `production.production_report` + in-process QC | Report: wo_op_id, reported_by, qty_good, qty_scrap, scrap_reason_code, reported_at. Screen `/qc/in-process` list reports chờ QC sau mỗi op. Decision: PASS (qty_good → prod_in stock_transaction) / REWORK (tạo rework order stub) / SCRAP (tx_type=ADJUST OUT) |
| Day 6 | State machine WO + `lib/state-machines/work-order.ts` | Test matrix 8×8. UAT tuần 1: release WO-0001 cho 3 snapshot_line (sub-assembly "Cụm trục chính"), operator update progress, in-process QC, prod_in 3 pieces vào stock |

#### Tuần 2 — Assembly Order + Pick + Scan lắp ráp

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 7 | Entity `assembly.assembly_order`, `assembly.pick_task` | AO: ao_no, order_id (parent sales order), fg_item_id, planned_qty, status (PLANNED→PICKING→READY_TO_ASSEMBLE→ASSEMBLING→VERIFYING→COMPLETED/PARTIAL_SHIPPED/CLOSED, 7 state R1:506). Pick task: ao_id, snapshot_line_id, item_id, lot_serial_id, qty, status (PENDING/PICKED/ISSUED) |
| Day 8 | Screen `/assembly` list + `/assembly/[id]` detail | List AO filter status. Detail 3 tab: Thông tin / Pick list / Assembly progress. Button "Tạo pick list" auto-gen từ snapshot_line.reserved_qty theo FIFO lot |
| Day 9 | Assembly Station Screen `/assembly/[id]/station` (tablet) | Reuse BarcodeScanner + Dexie queue từ Direction B. Flow: scan component → validate (thuộc pick list? lot correct? qty OK?) → confirm → tx_type=ASM_ISSUE. Feedback 3 kênh (visual/audio/haptic). Offline queue dedup `offline_queue_id` |
| Day 10 | Entity `assembly.assembly_scan_log` + `assembly.fg_serial` + `assembly.fg_serial_component` | Scan log (R1:397-426): ao_id, component_lot_serial_id, operator_user_id, scanned_at, offline_queue_id, sync_status, validation_result. fg_serial: item_id, serial_no, ao_id, operator_id, fg_created_at. fg_serial_component (N-M): fg_serial_id → list component lot/serial |
| Day 11 | Screen `/fg-serials` list + `/fg-serials/[sn]` warranty lookup | List filter model + date range. Detail: metadata FG + expandable tree traceability (recursive CTE trên fg_serial_component → lot_serial → receipt_line → po_line → vendor + operator + wo + assembly_order) |
| Day 12 | State machine Assembly order + `lib/state-machines/assembly-order.ts` | 7 state. Transitions: auto PLANNED→PICKING khi pick list tạo, PICKING→READY khi tất cả pick PICKED, ASSEMBLING khi scan đầu tiên, VERIFYING khi scan đủ BOM, COMPLETED khi final QC pass |

#### Tuần 3 — Shipping + Nonconformance + Final QC + Warranty polish

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 13 | Entity `sales.shipment`, `sales.shipment_line` | Shipment: ship_no, order_id, planned_date, shipped_date, status (PLANNED→PICKED→SHIPPED). Line: fg_serial_id hoặc item_id+qty (cho non-serial), packed_in |
| Day 14 | Screen `/shipments` list + `/shipments/[id]` detail + packing slip print | Auto-gen shipment từ order sau assembly complete. Partial ship: chọn serial nào ship đợt này. Print packing slip PDF (server-side) hoặc HTML print-friendly |
| Day 15 | QC final (`/qc/final`) + Nonconformance entity | Entity `quality.nonconformance`: origin (INCOMING/IN_PROCESS/FINAL), item_id/fg_serial_id, severity, disposition (RELEASE/REWORK/SCRAP/RETURN_VENDOR). QC final check FG trước ship. Decision PASS → shipment line enable |
| Day 16 | Entity `production.rework_log` + rework flow | Link nonconformance → rework order (tạo WO mini cho rework). Không phá traceability: rework log track lot_serial_id vẫn giữ nguyên serial, chỉ thêm event "reworked_at" |
| Day 17 | Dashboard V1.3 update | KPI mới: `wo_running`, `assembly_in_progress`, `shipments_this_week`, `fg_in_stock`. Alerts: WO over-due, AO waiting pick > 24h, nonconformance critical |
| Day 18 | Warranty lookup polish + export traceability PDF | `/fg-serials/[sn]` button "Export PDF" xuất báo cáo warranty (serial + model + mfg date + BOM version + component list + operator + QC history). Lưu vào `public/warranty-report/` hoặc stream response |
| Day 19 | UAT full end-to-end + polish | Scenario: SO-0001 từ V1.1 → release WO cho 3 sub-assembly → operator làm xong → pick → assembly scan 25 component × 3 máy = 75 scan → tạo 3 FG serial → final QC pass → ship đợt 1 (2 máy), đợt 2 (1 máy). Lookup 1 serial trả tree đầy đủ ≥ 30 node |
| Day 20 | Buffer + risk mitigation | Dự phòng chạy lại acceptance + fix bug phát hiện UAT |

### 5.4 Deliverables summary

**Screens mới cook (14 screens):**
- `/wo` list, `/wo/new`, `/wo/[id]` detail, `/wo/[id]/operator` (tablet)
- `/qc/in-process`, `/qc/final`
- `/assembly` list, `/assembly/[id]` detail, `/assembly/[id]/station` (tablet)
- `/fg-serials` list, `/fg-serials/[sn]` warranty lookup
- `/shipments` list, `/shipments/[id]` detail + print
- `/nonconformance` list (V1.3 MVP stub)

**Entity mới (12 bảng):**
- `production.work_order`, `production.work_order_operation`, `production.production_report`, `production.rework_log`
- `assembly.assembly_order`, `assembly.pick_task`, `assembly.assembly_scan_log`, `assembly.fg_serial`, `assembly.fg_serial_component`
- `sales.shipment`, `sales.shipment_line`
- `quality.nonconformance`

**Files mới:**
- `apps/web/src/lib/state-machines/work-order.ts`
- `apps/web/src/lib/state-machines/assembly-order.ts`
- `apps/web/src/lib/traceability/serial-tree.ts` (recursive CTE explorer)
- `apps/worker/src/jobs/auto-transition-ao.ts` (tự động PICKING→READY khi pick list xong)
- `apps/web/src/components/assembly/AssemblyStationShelf.tsx` (UI big touch-friendly)
- `apps/web/src/components/fg-serials/TraceabilityTree.tsx` (expandable tree view)
- `apps/web/src/lib/pdf/warranty-report.ts` (server-side HTML to PDF)

**API routes mới:**
- `/api/wo`, `/api/wo/[id]/release|start|pause|resume|complete`
- `/api/wo/[id]/operations/[opId]/report`
- `/api/qc-inspections/in-process|final`
- `/api/assembly`, `/api/assembly/[id]/pick-list`, `/api/assembly/[id]/scan`
- `/api/fg-serials`, `/api/fg-serials/[sn]/traceability`
- `/api/shipments`, `/api/shipments/[id]/pack|ship`
- `/api/nonconformance`

### 5.5 Acceptance criteria

- [ ] WO-0001 cho sub-assembly "Cụm trục chính" (3 cái), release → operator ngày 1 làm 2 piece (op1 PASS, op2 PASS) + 1 piece op1 FAIL → rework.
- [ ] Production report tạo tx_type=PROD_IN 2 piece good vào stock.
- [ ] Rework: FAIL piece tạo rework_log, sau đó redo op1 PASS → thêm 1 PROD_IN, tổng good_qty = 3.
- [ ] Tạo AO-0001 cho order SO-0001 (3 máy CNC ABC). Auto PLANNED→PICKING khi pick list tạo (tất cả 25 component × 3 = 75 pick task).
- [ ] Assembly station: scan 75 component (mix 5 offline + 70 online), verify mỗi scan có `offline_queue_id`, mỗi scan tạo tx_type=ASM_ISSUE.
- [ ] 3 FG serial được tạo sau khi scan đủ 25 component/máy. Mỗi fg_serial có 25+ fg_serial_component rows link ngược lot/serial.
- [ ] Final QC 3 FG serial: 2 PASS, 1 HOLD → rework.
- [ ] Shipment đợt 1: ship 2 FG serial PASS. Shipment đợt 2: sau rework → ship 1 FG.
- [ ] Warranty lookup FG serial SN-0001: trả tree ≥ 30 node (25 component × 1 level + metadata + operator + WO + PO + vendor).
- [ ] Export warranty PDF: file PDF hợp lệ, chứa đầy đủ traceability.
- [ ] State machine test: không cho phép WO skip RELEASED→RUNNING bỏ qua READY; AO không cho ASSEMBLING khi pick task chưa PICKED hết.
- [ ] Dashboard: KPI wo_running, assembly_in_progress, shipments_this_week real data.
- [ ] PWA Assembly station: 3 kênh feedback hoạt động (visual flash 150ms, audio 880Hz OK / 220Hz error, haptic 50ms vibration).

### 5.6 Risks & mitigation

| # | Risk | Mức độ | Mitigation |
|---|---|---|---|
| R3.1 | Operator tablet Surface Go 2 FPS drop khi scan 20 component/phút | Cao | Test bench sớm Day 9. Nếu FPS < 30 → disable shimmer animation trong `AssemblyStationShelf`, dùng optimistic UI (local update rồi sync) |
| R3.2 | Recursive CTE warranty tree > 3 cấp chậm (> 2s) | Trung bình | Index composite trên fg_serial_component (fg_serial_id, component_lot_serial_id). Cache result 1h trong Redis. Nếu vẫn chậm → materialized view refresh nightly |
| R3.3 | Rework flow làm phá discipline traceability (piece bị rework nhưng vẫn giữ serial cũ) | Cao | Document rõ: rework_log append row, KHÔNG overwrite. fg_serial có thêm flag `has_rework boolean` + view `fg_serial_with_rework_history`. UAT với QC team |
| R3.4 | Offline scan hoàn tất khi chưa sync, rồi tablet hỏng — mất data | Cao | Dexie persist IndexedDB (đã có từ Direction B). Thêm: badge "N events chưa sync" cảnh báo trước khi đóng trình duyệt. Export Dexie queue ra JSON cho rescue |
| R3.5 | 2 operator assembly cùng scan 1 component serial trên 2 device khác nhau | Trung bình | Server dedup `offline_queue_id`. Thêm: check unique constraint (ao_id, component_lot_serial_id) trên scan_log → trả 409 với message "Component đã được scan bởi [operator X lúc Y]" |
| R3.6 | Shipping partial phức tạp khi 1 FG serial trong 1 shipment chia 2 đợt (không realistic nhưng edge case) | Thấp | Constraint: 1 fg_serial chỉ thuộc 1 shipment_line. Nếu hỏng sau pack → tạo rework, cancel shipment_line cũ |
| R3.7 | PDF warranty report server-side timeout khi tree > 100 node | Trung bình | Async job BullMQ `generate-warranty-pdf`, lưu vào `/public/warranty-report/`, trả signed URL. UI polling 3s |

---

## §6 Sprint V1.4 — RBAC 12 roles + Migration expansion + Polish (1-2 tuần)

### 6.1 Mục tiêu

Hardening + mở rộng migration pipeline. Admin phân quyền đầy đủ 12 role × 12 quyền với data scope warehouse/order/cost. Migration wizard mở rộng từ Item Master (đã có) sang BOM template + vendor + open stock + open PO (5 entity cùng pattern ColumnMapper). Audit viewer screen hoạt động đầy đủ.

### 6.2 Gap được giải quyết

- [x] **Gap #10 RBAC 12×12** (gap-analysis §10, R2:313-326, R1:526-537) — mở rộng từ 4 role seed hiện có.
- [x] **Gap #13 Migration 10 bước** (gap-analysis §13, R1:755-766, R2:424-444) — 5 pipeline wizard.
- [x] **Gap #12 P2 stub** — Substitute parts UI (trong BOM editor V1.1 đã có field, V1.4 thêm picker), Label templates, Cycle count UI full, Audit viewer UI.

### 6.3 Breakdown tuần/ngày

#### Tuần 1 — RBAC 12 roles + data scope

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 1 | Entity mở rộng `auth.role`, `auth.permission`, `auth.role_permission`, `auth.user_role` | Seed 12 role: admin, system_engineer, security_officer, design_engineer, material_planner, purchasing, accountant, qc_inspector, warehouse_staff, machine_operator, assembly_staff, manager. Seed 12 permission group (Master data, BOM, Snapshot, Planning, Purchasing, Warehouse, QC, Production, Assembly, Cost, Audit, User). role_permission với scope_type (NONE/WAREHOUSE/ORDER/COST). Level A/E/P/V |
| Day 2 | Session context + middleware | Sau JWT verify, load user → set `current_warehouse_id`, `can_view_cost`, `order_scope_ids`. Middleware Next.js check permission trên mỗi API route (dùng permission code code hash-map) |
| Day 3 | Screen `/admin/users` list + create/edit user | Form assign roles multi-select + warehouse assignment (cho warehouse_staff/qc_inspector) + cost visibility checkbox |
| Day 4 | Screen `/admin/roles` + `/admin/permissions` matrix 12×12 | Reuse DataTable-like matrix. Checkbox A/E/P/V per cell. Save → update role_permission. Cảnh báo khi đổi quyền admin |
| Day 5 | Screen `/admin/audit` viewer | List `audit.audit_event` filter actor + entity_type + date range + action. Detail drawer show diff JSON. Reuse Sheet + DataTable pattern |
| Day 6 | Data scope test + UAT tuần 1 | Scenario: tạo user warehouse_staff assign warehouse W01 → login chỉ thấy stock W01, không thấy W02. Cost column hidden cho non-admin/accountant. Manager thấy cost. UAT với 3 user thật |

#### Tuần 2 — Migration expansion + Polish

| Ngày | Focus | Deliverable |
|---|---|---|
| Day 7 | Generalize ColumnMapperStep thành `ColumnMapperStep<TTargetFields>` reusable | Refactor từ Direction B component cho generic type. Prop: targetSchema, synonymDict, onMappingChange, presetStorageKey |
| Day 8 | Screen `/import/bom` (BOM template pipeline, bước 5/10 R1:764) | Wizard 4 step: upload → map → preview (parent-child resolve + cycle check + phantom flag validation) → result. Extra validation: BOM structure validator (R2:437 layer 3) |
| Day 9 | Screen `/import/vendors` (vendor + lead time, bước 4) | Import vendor master + item_vendor với lead_time. Mapping preset save |
| Day 10 | Screen `/import/stock` (open stock, bước 7) | Import stock balance đầu kỳ theo bin. Validation: sum theo item = input. Tạo initial tx_type=ADJUST IN với batch_id |
| Day 11 | Screen `/import/po` (open PO, bước 8) | Import PO đang mở (status SENT/PARTIAL_RECEIVED). Link linked_snapshot_line_id nếu đã có order migrated |
| Day 12 | Screen `/migration/reconciliation` report | Chạy 4 lớp validation R2:437: (1) Cú pháp (data type, required, length), (2) Nghiệp vụ (item exists, vendor exists), (3) BOM structure (cycle, orphan), (4) Vận hành (reservation không vượt stock). Report diff: tổng Excel vs tổng DB |
| Day 13 | Polish P2 stub: Substitute parts picker + Label templates + Cycle count UI full | Substitute group picker trong BOM revision editor (dropdown multi-select). Label template ZPL editor placeholder (V1 chỉ 1 template hardcode, UI editor defer V2). Cycle count UI: tạo cycle_count_schedule, UI count per bin |
| Day 14 | Final UAT V1 nghiệp vụ LIVE + PROGRESS update | Full scenario end-to-end từ V1.1→V1.4 với 12 user role khác nhau. Document "V1 nghiệp vụ LIVE" trên PROGRESS.md thay "V1.0 LIVE" |

### 6.4 Deliverables summary

**Screens mới cook (10 screens):**
- `/admin/users`, `/admin/roles`, `/admin/permissions`, `/admin/audit`
- `/import/bom`, `/import/vendors`, `/import/stock`, `/import/po`
- `/migration/reconciliation`
- Label print template editor stub `/admin/labels` (V1 hardcode 1 template)

**Entity mở rộng (không entity mới, chỉ seed mở rộng):**
- `auth.role` từ 4 → 12 seed
- `auth.permission` seed 12 group × 12 action = 144 rows
- `auth.role_permission` với scope_type (NONE/WAREHOUSE/ORDER/COST) + level (A/E/P/V)
- `auth.user_warehouse` (mới) cho data scope warehouse
- `master.label_template` (1 row hardcode V1)

**Files mới:**
- `apps/web/src/middleware-rbac.ts` (extension của middleware hiện có)
- `apps/web/src/lib/rbac/check-permission.ts`
- `apps/web/src/lib/rbac/session-context.ts`
- `apps/web/src/components/import/ColumnMapperStep.tsx` (generic refactor từ Direction B)
- `apps/web/src/lib/import/validators/bom-structure.ts` (cycle check + phantom)
- `apps/web/src/lib/import/validators/reconciliation.ts` (4 lớp validation)

**API routes mới:**
- `/api/admin/users`, `/api/admin/users/[id]/roles`
- `/api/admin/roles`, `/api/admin/roles/[id]/permissions`
- `/api/admin/audit`
- `/api/import/bom|vendors|stock|po` (kèm template download endpoints)
- `/api/migration/reconciliation`

### 6.5 Acceptance criteria

- [ ] Seed 12 role đầy đủ. Admin UI matrix 12×12 hiển thị đúng A/E/P/V cho mỗi cell.
- [ ] User warehouse_staff assign W01 → login chỉ thấy stock W01, items W02 ẩn.
- [ ] User accountant đăng nhập → cột cost hiển thị, non-accountant cột cost ẩn.
- [ ] User qc_inspector chỉ thao tác được QC decision, không edit được item master.
- [ ] User sales chỉ thấy order của mình (order_scope_ids filter).
- [ ] Import BOM: file Excel 100 template × 10 cấp → wizard 4 step → preview cycle check → commit. Reconciliation report khớp 100%.
- [ ] Import vendor: 50 vendor + 200 item_vendor link với lead_time → wizard → commit.
- [ ] Import stock đầu kỳ: 5000 dòng → tạo 5000 tx_type=ADJUST IN với batch_id chung → `stock_balance` view khớp Excel.
- [ ] Import open PO: 30 PO đang mở → link snapshot_line nếu match, list unmatched để manual review.
- [ ] Reconciliation report chạy 4 lớp validation, hiển thị diff count theo từng lớp.
- [ ] Audit viewer: filter theo user admin 7 ngày qua → hiển thị ≥ 50 event, detail drawer show diff before/after JSON.
- [ ] Substitute parts picker: trong BOM revision editor, chọn substitute_group cho component X → 3 alternate item hiển thị.
- [ ] Full flow V1 nghiệp vụ LIVE: 1 đơn hàng đi hết BOM→PO→GRN→QC→WO→Assembly→Ship với 5 user khác role.

### 6.6 Risks & mitigation

| # | Risk | Mức độ | Mitigation |
|---|---|---|---|
| R4.1 | RBAC matrix 12×12 quá phức tạp, user admin config sai quyền → block vận hành | Cao | Default seed có sẵn ma trận R2:313-326 (copy nguyên). Admin UI có button "Reset về default". Documentation VN cho từng role + VN/EN label permission |
| R4.2 | Data scope implement ở service layer vs RLS Postgres — nếu chọn service layer dễ miss check ở API mới | Cao | V1.4 implement ở service layer (helper `checkScope(user, resource)` gọi đầu mọi handler). Viết integration test coverage mọi API route. V2 migrate sang RLS (R1:566-618) khi ổn định |
| R4.3 | Import BOM cycle check không bắt được cycle gián tiếp 4-5 cấp | Trung bình | Unit test với 10 sample cycle (direct, 2-hop, 3-hop, 4-hop, phantom cycle). Recursive DFS với visited set + stack. Performance: worst case O(E) |
| R4.4 | Import stock đầu kỳ khi có stock đã có từ V1.2 test → duplicate tx | Trung bình | Check batch_id unique. Nếu batch đã import → refuse re-import. UI cảnh báo "Đã import batch này". Fallback: reset flag trong admin panel |
| R4.5 | Audit viewer query chậm khi > 1M events | Trung bình | Index (actor_user_id, created_at DESC) + (entity_type, entity_id, created_at DESC). Pagination 100 row/page. Partition by month nếu > 10M |

---

## §7 Ma trận entity mới cần tạo

| Sprint | Schema | Entity | Mục đích | Ghi chú |
|---|---|---|---|---|
| V1.1 | engineering | bom_template | Master template BOM | Unique (code) |
| V1.1 | engineering | bom_revision | Version của template | State DRAFT/RELEASED/OBSOLETE |
| V1.1 | engineering | bom_component | Line item trong revision | parent-child recursive, substitute_group, phantom, scrap_pct |
| V1.1 | engineering | eco_request | Change request stub | Workflow DRAFT/SUBMITTED/APPROVED/APPLIED |
| V1.1 | sales | customer_order | Đơn hàng khách | 6 state |
| V1.1 | sales | customer_order_line | Line trong order | item_or_bom_template_id |
| V1.1 | sales | bom_snapshot | Snapshot bất biến khi release order | source_bom_revision_id fixed |
| V1.1 | sales | bom_snapshot_line | Line snapshot | **9 cột qty** (required/gross_required/open_purchase/received/qc_pass/reserved/issued/assembled/remaining_short) + 10 state |
| V1.1 | audit | state_transition_log | Log transition cho 4 state machine | Shared V1.1-V1.3 |
| V1.2 | procurement | purchase_order | PO header | 8 state |
| V1.2 | procurement | purchase_order_line | PO line | linked_snapshot_line_id nullable |
| V1.2 | procurement | receipt | GRN header | |
| V1.2 | procurement | receipt_line | GRN line | qc_status pending/pass/hold/fail |
| V1.2 | inventory | stock_transaction | **Log-first unified, partitioned monthly** | 10 tx_type + offline_queue_id unique |
| V1.2 | inventory | stock_reservation | Reserve cho snapshot line | policy FIFO/FEFO/SERIAL |
| V1.2 | quality | qc_inspection | QC decision (incoming V1.2, in-process/final V1.3) | 3-way disposition |
| V1.2 | inventory | location_bin (mở rộng) | Thêm `is_qc_hold boolean` | Migration only |
| V1.2 | master | item_supplier (mở rộng) | Thêm 4 cột ETA rolling | Migration only |
| V1.3 | production | work_order | WO | 8 state |
| V1.3 | production | work_order_operation | Op trong WO | sequence |
| V1.3 | production | production_report | Report qty good/scrap | Trigger tx_type=PROD_IN |
| V1.3 | production | rework_log | Track rework | Không phá serial |
| V1.3 | assembly | assembly_order | AO header | 7 state |
| V1.3 | assembly | pick_task | Pick list task | PENDING/PICKED/ISSUED |
| V1.3 | assembly | assembly_scan_log | Scan log (copy R1:397-426 DDL) | offline_queue_id + sync_status |
| V1.3 | assembly | fg_serial | FG serial master | unique (item_id, serial_no) |
| V1.3 | assembly | fg_serial_component | N-M link back component lot/serial | Traceability key |
| V1.3 | sales | shipment | Shipment header | 3 state |
| V1.3 | sales | shipment_line | Shipment line | fg_serial_id hoặc item+qty |
| V1.3 | quality | nonconformance | NC record | 4 disposition |
| V1.4 | auth | user_warehouse | Data scope warehouse | Migration only |
| V1.4 | master | label_template | ZPL template (V1 hardcode 1) | Stub |

**Tổng: 28 entity mới** (không bao gồm mở rộng column).

---

## §8 Ma trận screens mới cần cook

| Sprint | Route | Role primary | Priority | Pattern reuse |
|---|---|---|---|---|
| V1.1 | `/bom/templates` | design_engineer (write) | P0 | DataTable + FilterBar |
| V1.1 | `/bom/templates/new` | design_engineer | P0 | Form 2-step |
| V1.1 | `/bom/templates/[id]` | design_engineer | P0 | Detail 3-tab |
| V1.1 | `/bom/revisions/[id]` | design_engineer | P0 | Custom tree editor |
| V1.1 | `/eco` + `/eco/new` | design_engineer + manager (approve) | P1 stub | Form + list |
| V1.1 | `/orders` | sales | P0 | DataTable + FilterBar |
| V1.1 | `/orders/new` | sales | P0 | Form header + line table |
| V1.1 | `/orders/[id]` | sales read-only sau CONFIRMED | P0 | Detail 3-tab + snapshot board |
| V1.1 | `/shortage-board` | material_planner + purchasing | P0 | Aggregate DataTable |
| V1.1 | `/` (Dashboard real data) | all roles | P0 | Update từ Direction B mock |
| V1.2 | `/po` | purchasing | P0 | DataTable |
| V1.2 | `/po/new` | purchasing | P0 | Form + line |
| V1.2 | `/po/[id]` | purchasing | P0 | Detail 3-tab |
| V1.2 | `/po/[id]/receive` (desktop GRN) | warehouse_staff | P0 | DataTable edit-in-place |
| V1.2 | `/qc/incoming` | qc_inspector | P0 | DataTable + decision dialog |
| V1.2 | `/putaway` | warehouse_staff | P0 | Scanner + form |
| V1.2 | `/transfer` | warehouse_staff | P0 | Form đơn giản |
| V1.2 | `/cycle-count` | warehouse_staff | P1 stub | List + count form |
| V1.2 | `/suppliers/[id]` (mở rộng) | purchasing | P1 | Tab ETA sparkline thêm |
| V1.3 | `/wo` | material_planner (plan) + supervisor (release) | P0 | DataTable |
| V1.3 | `/wo/new` | material_planner | P0 | Form |
| V1.3 | `/wo/[id]` | material_planner + supervisor | P0 | Detail 3-tab |
| V1.3 | `/wo/[id]/operator` | machine_operator | P0 | Tablet big touch |
| V1.3 | `/qc/in-process` | qc_inspector | P0 | DataTable + decision |
| V1.3 | `/qc/final` | qc_inspector | P0 | DataTable + decision |
| V1.3 | `/assembly` | assembly_staff + material_planner | P0 | DataTable |
| V1.3 | `/assembly/[id]` | assembly_staff | P0 | Detail 3-tab |
| V1.3 | `/assembly/[id]/station` | assembly_staff | P0 | PWA + BarcodeScanner |
| V1.3 | `/fg-serials` | all | P0 | DataTable |
| V1.3 | `/fg-serials/[sn]` | all | P0 | Tree view + PDF export |
| V1.3 | `/shipments` | sales + warehouse_staff | P0 | DataTable |
| V1.3 | `/shipments/[id]` | sales + warehouse_staff | P0 | Detail + print |
| V1.3 | `/nonconformance` | qc_inspector + manager | P1 | DataTable stub |
| V1.4 | `/admin/users` | admin + security_officer | P0 | DataTable + form |
| V1.4 | `/admin/roles` | admin | P0 | Custom matrix 12×12 |
| V1.4 | `/admin/permissions` | admin | P0 | Matrix read-only view |
| V1.4 | `/admin/audit` | admin + security_officer | P0 | DataTable + detail drawer |
| V1.4 | `/import/bom` | design_engineer | P0 | ColumnMapper generic |
| V1.4 | `/import/vendors` | purchasing | P0 | ColumnMapper generic |
| V1.4 | `/import/stock` | warehouse_staff | P0 | ColumnMapper generic |
| V1.4 | `/import/po` | purchasing | P0 | ColumnMapper generic |
| V1.4 | `/migration/reconciliation` | admin | P0 | Report page |
| V1.4 | `/admin/labels` | admin | P2 stub | Hardcode 1 template |

**Tổng: 43 screens mới** (không bao gồm đã có từ Direction B: `/login`, `/`, `/items*`, `/suppliers` list, `/pwa/receive/[poId]`).

---

## §9 Dependencies giữa 4 sprint

```
V1.0 Direction B (pre-requisite)
  └─> V1.1 (BOM + Order backbone, 3 tuần)
        │
        ├─> V1.2 (Procurement + Warehouse, 2 tuần)
        │     │  (phụ thuộc: bom_snapshot_line để join PO linked_snapshot_line_id)
        │     │  (phụ thuộc: stock_transaction schema phải có ngay đầu V1.2)
        │     │
        │     └─> V1.3 (Production + Assembly + Shipping, 3 tuần)
        │           (phụ thuộc: stock_transaction để post PROD_IN/ASM_ISSUE)
        │           (phụ thuộc: snapshot_line + reservation để pick list)
        │
        └─> V1.4 (RBAC + Migration + Polish, 1-2 tuần)
              (chạy song song V1.3 được từ Day 7 trở đi)
              (phụ thuộc V1.1-V1.3 chỉ khi Import BOM/stock/PO — các import pipeline khác
               như Import BOM template không cần chờ V1.3)
```

**Critical path:** V1.0 → V1.1 → V1.2 → V1.3 = **8 tuần tuần tự**, không parallelize được. V1.4 parallel từ V1.3 Day 7 → **tổng 9-10 tuần**.

**Gợi ý FTE:**
- 1.5 FTE dev (1 senior BE + 0.5 FE): mốc thời gian trên là thực tế.
- 2-3 FTE: rút xuống 7-8 tuần bằng cách parallel V1.2 BE + V1.1 polish FE.
- 1 FTE: kéo dài 14-16 tuần — không khuyến khích vì Song Châu chờ lâu.

---

## §10 Cần chốt trước khi start V1.1 (pre-requisites với PO/BA/Tech lead)

Checklist sign-off 10 điểm trước Day 1 V1.1:

1. [ ] **Glossary** — từ điển thuật ngữ VN-EN cho 30 khái niệm chính: BOM template, BOM revision, snapshot, explode, shortage, reservation, GRN, putaway, QC disposition, WO, operation, assembly order, pick task, FG serial, warranty lookup, NC, rework, ECO, ETA, lead time, work center, scrap, substitute, phantom, lot, batch, bin, zone, warehouse, cycle count.
2. [ ] **Item taxonomy** — 3-5 root category + naming convention SKU (regex đã có từ tuần 2). Ví dụ: `RAW-*`, `PUR-*` (purchased), `MAN-*` (manufactured), `ASM-*` (assembly), `FG-*` (finished goods).
3. [ ] **BOM model** — cho phép bao nhiêu cấp BOM? (khuyến nghị max 5). Cho phép substitute không? Phantom không? Scrap_pct theo component hay theo operation?
4. [ ] **UoM list** — danh mục đơn vị đo chuẩn (pcs, kg, m, mm, hour, set, pair...). Conversion rule (nếu có: 1 m = 1000 mm).
5. [ ] **Reservation policy** — FIFO hay FEFO default? Có serial-reserve (cho item high-value) không?
6. [ ] **QC plans** — incoming/in-process/final luồng nào cần QC mandatory, luồng nào optional?
7. [ ] **Valuation method** — FIFO/weighted-avg/standard cost? (Ảnh hưởng `stock_transaction.unit_cost` + reporting V2).
8. [ ] **Barcode standards** — Code128 cho item SKU? QR cho serial? Regex `SKU_REGEX` đã có từ tuần 2 nhưng chưa có format cho lot_no + serial_no.
9. [ ] **Role → người cụ thể** — ai là admin, material_planner, purchasing, qc_inspector, warehouse_staff, machine_operator, assembly_staff, sales, accountant, manager, design_engineer, security_officer? (V1.4 sẽ seed user thật).
10. [ ] **Data migration source** — Excel file cũ có cột gì? Mapping sang entity mới? Open PO/WO trạng thái nào import được (SENT/CONFIRMED/PARTIAL)?

**Document deliverable:** `docs/glossary-v1.md` + `docs/business-rules-v1.md` (2 file, ~20 trang tổng, sign-off từ PO Song Châu + BA).

---

## §11 Risks lớn nhất xuyên suốt 4 sprint

### Top 5 risks cần watch

| # | Risk | Sprint | Mức độ | Mitigation chiến lược |
|---|---|---|---|---|
| **RX1** | Pre-requisite §10 không sign-off đúng hạn → V1.1 Day 1 block | Pre V1.1 | **Cao** | BA làm document song song với Direction B cook. Deadline 3 ngày trước V1.1 kick-off. Nếu chưa xong → delay 1 tuần thay start thiếu thông tin |
| **RX2** | Snapshot bất biến discipline bị break khi ECO/manual edit vào snapshot đã release | V1.1-V1.3 | **Cao** | Code level: mọi bảng `*_snapshot*` có trigger INSERT/UPDATE sau status=RELEASED chỉ cho update specific fields (received_qty, reserved_qty, v.v.). Không update revision_id, component_id, required_qty |
| **RX3** | Recursive CTE performance BOM explode + warranty tree chậm > 5s khi > 1000 node | V1.1, V1.3 | **Cao** | Benchmark sớm Day 3 V1.1 + Day 11 V1.3. Fallback: worker async + polling UI. Cache Redis 1h cho warranty lookup |
| **RX4** | State machine 4 entity × transition rules phức tạp, miss case sinh bug production | V1.1-V1.3 | **Cao** | Unit test matrix 100% per state machine (~8-10×8-10 = 64-100 test/machine). Integration test end-to-end mỗi sprint acceptance |
| **RX5** | Reservation race condition + offline queue dedup sai dẫn đến stock âm | V1.2-V1.3 | **Cao** | `SELECT FOR UPDATE` + advisory lock per item_id. Unit test concurrent 10 thread. Alert real-time nếu phát hiện stock âm ở bất kỳ bin nào |

### Risks trung bình (watch nhưng không block)

- Schema `app` phẳng hiện tại vs schema đa (`engineering/sales/procurement/...`) — quyết định migration strategy ở pre-V1.1 (migrate ngay hay chạy song song).
- UX complexity: 9 cột qty trên snapshot line có thể overwhelming → test với warehouse staff thực, có thể hide cột default chỉ show 5, có button "Show all".
- Mobile/tablet PWA Assembly Station vs Operator Progress Screen: khác UX pattern (scan-heavy vs form-heavy) nhưng cùng layout PWA → phải test kỹ cả 2.
- Warranty PDF export nặng với tree > 100 node → async job + throttle 5 req/min per user.
- Storage growth: `stock_transaction` partitioned monthly, năm 1 dự kiến 500K row → OK. Năm 3 nếu 5M row/năm → cần archive partition cũ > 2 năm.

---

## §12 Next steps

1. [ ] **Review plan này với team** (1 ngày) — PO, BA, Tech lead duyệt §3-§6 + §10 pre-requisites.
2. [ ] **Chốt glossary + item taxonomy + BOM model** (§10) — BA soạn draft, PO sign-off (3-5 ngày song song với Direction B cook).
3. [ ] **Cook xong Direction B** (10-14 ngày) — theo [`260417-implementation-plan.md`](./260417-implementation-plan.md).
4. [ ] **Quyết định schema migration strategy** trước V1.1 Day 1: migrate schema `app` phẳng → đa schema (`engineering/sales/...`) hay tạo schema mới song song và migrate dần?
5. [ ] **Seed test data** cho V1.1 UAT: 1 BOM template máy CNC ABC 3 cấp, 5 vendor, 30 item mẫu.
6. [ ] **Kick-off V1.1** — Day 1 sprint V1.1.
7. [ ] **Post-sprint review** sau mỗi V1.x — UAT với Song Châu xưởng thực, update PROGRESS.md.

---

## §13 Tham chiếu chéo

### Link tới gap-analysis (cho từng sprint)

- V1.1: giải quyết gap §1, §2, §3 (1/4), §4, §12 P1 stub (ECO)
- V1.2: giải quyết gap §3 (2/4), §5, §6 (incoming), §7 polish, §8, §11
- V1.3: giải quyết gap §3 (3+4/4), §6 (in-process+final), §9, §12 P1 (Rework, NC)
- V1.4: giải quyết gap §10, §12 P2 stub (substitute, label, cycle), §13

### Link tới R1/R2 (các section dùng làm reference DDL/flow)

- R1:19 — nguyên tắc snapshot bất biến (V1.1)
- R1:34, R1:142 — traceability log-first (V1.2)
- R1:146-165 — schema 11 nhóm (pre-V1.1 quyết định migration)
- R1:242-327 — DDL BOM revision/line + order_bom_snapshot với 9 cột qty (V1.1)
- R1:365-395 — DDL stock_transaction partitioned 10 tx_type (V1.2)
- R1:397-426 — DDL assembly_scan_log với offline_queue_id (V1.3)
- R1:434-470 — Recursive CTE BOM explosion (V1.1)
- R1:478-497 — Mermaid flowchart end-to-end 10 bước (V1.1-V1.3)
- R1:501-507 — 4 state machine (V1.1-V1.3)
- R1:510-519 — Offline queue 6 bước (V1.2 dedup + V1.3 assembly)
- R1:526-537, R1:539-546, R1:566-618 — RBAC 12 role + data scope + GRANT/RLS (V1.4)
- R1:755-766 — Migration 10 bước (V1.4)
- R2:32 — 3 entity BOM tách biệt (V1.1)
- R2:93-127 — Sequence diagram 9 actor (V1.1-V1.3)
- R2:154-198 — Tables chính V1 mapping tên VN (tất cả sprint)
- R2:247 — Partial qty model 9 cột (V1.1)
- R2:252-261 — Reservation rules 8 dòng (V1.2)
- R2:262-263 — QC 3 luồng (V1.2 incoming, V1.3 in-process+final)
- R2:264-278 — ETA formula rolling (V1.2)
- R2:313-326 — RBAC 12×12 matrix (V1.4)
- R2:424-444 — Migration pipeline 4 lớp validation (V1.4)
- R2:446-472 — Gantt roadmap 3 phase (cả plan này)
- R2:488-501 — 15 điểm dễ bỏ sót (V1.1 ECO stub, V1.4 substitute/label/cycle/audit, V2 còn lại)

### Link tới artifact Direction B (pattern reuse)

- `260417-design-spec.md §3.12 StatusBadge` → mở rộng ≥35 preset V1.1-V1.3
- `260417-design-spec.md §3.16 ColumnMapperStep` → generic hoá V1.4
- `260417-design-spec.md §3.17 BarcodeScanner` + §5.3 scan feedback → reuse V1.3 Assembly
- `260417-brainstorm-deep.md §2.5` Dexie queue + D19/D20 → kế thừa V1.2 dedup server-side + V1.3 Assembly offline
- `260417-implementation-plan.md §11` path cheatsheet → extend cho V1.1-V1.4 components

---

## §14 Kết

Plan này **không thay thế** Direction B mà **kế thừa** — 8 screens Direction B là foundation UI, V1.1-V1.4 là **foundation nghiệp vụ**. Sau V1.4 hoàn tất, hệ thống sẽ đủ 14 luồng R1/R2 khuyến nghị để xưởng Song Châu chạy 1 đơn hàng end-to-end thật sự (không phải demo screen rời).

Độ chi tiết plan này (3 tuần × 5 ngày = 15 day-tasks cho V1.1, tương tự V1.2/V1.3/V1.4) đủ để 1 planner/PM khác tiếp nhận không cần hỏi lại. Mọi screen đã có đích route, mọi entity đã có schema + column chính, mọi state machine đã có trạng thái + nguồn R1 cụ thể.

**Direction B giữ nguyên 10-14 ngày. V1 nghiệp vụ LIVE thêm 9-10 tuần nữa. Tổng thời gian từ tag `v1.1.0` hiện tại → `v1 nghiệp vụ LIVE` = ~12 tuần (~3 tháng).**

Sau V1 nghiệp vụ LIVE, backlog V2 (edge gateway, OEE, analytics) sẽ plan riêng khi nhu cầu Song Châu rõ hơn.

---

*End of V1 expansion plan. Version 1.0 — 2026-04-17. Based on gap-analysis v1.0 + R1 + R2 + Direction B artifacts.*
