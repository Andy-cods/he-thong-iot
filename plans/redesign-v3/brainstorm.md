# Redesign V3 — Brainstorm Kiến Trúc MES BOM-centric

**Ngày:** 2026-04-25
**Phạm vi:** redesign UI navigation + dashboard + receiving workflow + Excel BOM importer + schema deltas (material/process master, dimensions, weight, position code, notes).
**Bối cảnh:** V1.5 đang build, V1.4 đang chạy LIVE tại `https://mes.songchau.vn`. Schema BOM-centric đã đủ ~80% (xem `bom_snapshot_line` 10-state machine trong `packages/db/migrations/0005c_order_snapshot.sql`).
**Tham chiếu code:**
- Sidebar: `apps/web/src/components/layout/Sidebar.tsx`
- Nav registry: `apps/web/src/lib/nav-items.ts`
- Migrations: `packages/db/migrations/0006b_tables_app.sql`, `0014_po_accounting_fields.sql`, `0015_user_permission_override.sql`
- File Excel mẫu: `Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx`

---

## 1. Tóm tắt điều hành

- **Hiện trạng:** schema BOM-centric đã rất tốt (snapshot line 10-state, PR/PO/Receiving/WO đầy đủ). UI hoạt động được nhưng group theo *function* (BOM/PR/PO/Receiving rời rạc), thiếu **dashboard tổng quan tiến độ**, thiếu **tickbox receiving per-line**, importer Excel không cover BOM file thực tế.
- **Vấn đề chính:** UX chưa map vào *bộ phận* (Kho/Mua bán/Kỹ thuật/Kế toán), dẫn tới mỗi người phải lội qua nhiều menu để xong việc của mình. Excel importer chỉ ăn được Item master, không nuốt được BOM file thật → operator vẫn dùng Excel song song, dữ liệu phân mảnh.
- **Hướng giải quyết:** chọn **Phương án C — Hybrid lean** (xem §3). Phase 1 quick-win 3 tuần (regroup nav 4 bộ phận + Tổng quan + tickbox receiving + Excel BOM mapper). Phase 2 5 tuần (schema delta `material_master`/`process_master`/`item.dimensions` + module Kế toán tối thiểu).
- **Rủi ro lớn nhất:** **regroup nav phá vỡ thói quen user hiện tại** + **operator kho có thể không quen tickbox PWA** trên điện thoại lúc nhận hàng. Mitigate: giữ alias route cũ + UAT 2 ngày với 1 operator trước khi roll out.
- **Next step:** user trả lời 5 câu trong §8, đặc biệt Q1 (workflow duyệt PR/PO multi-level) và Q2 (Kế toán phase 1 scope).

---

## 2. Top 5 vấn đề lớn nhất hiện tại

### 2.1. Sidebar group theo *function*, không phản ánh workflow theo bộ phận
**Bằng chứng:** `apps/web/src/lib/nav-items.ts` định nghĩa 3 section "Sản xuất / Kho & Mua sắm / Khác". Trong khi đó user nói rõ: bộ phận Kho và bộ phận Mua bán là 2 team khác nhau, ngồi 2 bàn khác nhau, dùng UI khác nhau. Hiện tại cả 2 đều phải vào group "Kho & Mua sắm" — operator kho nhìn thấy cả PR/PO không phải việc của họ, nhân viên mua bán nhìn thấy `Danh mục vật tư` lẫn `Nhận hàng` không phải việc của họ.

**Hậu quả:** mỗi role mất 2-3 click thừa để vào đúng module, và vẫn dễ click nhầm sang module khác.

### 2.2. Không có trang Tổng quan — landing page redirect sang `/bom`
**Bằng chứng:** `apps/web/src/app/(app)/page.tsx` (root) hiện redirect sang `/bom`. Sếp xưởng / chủ doanh nghiệp khi log in chỉ thấy danh sách BOM template — không biết hôm nay tiến độ chung sao, đơn nào đang nghẽn, mua bán còn nợ bao nhiêu PO chưa về.

**Có sẵn nguyên liệu:** `apps/web/src/components/domain/KpiCard.tsx`, `OrdersReadinessTable.tsx`, `apps/web/src/app/api/dashboard/overview/route.ts` — đã có API + component kpi. Chưa có page tập hợp lại theo dạng *progress bar drilldown*.

**Hậu quả:** sếp phải mở 4-5 tab BOM/PO/WO để gom được bức tranh — đúng nỗi đau cốt lõi user nhắc.

### 2.3. Receiving workflow chưa khớp với bom_snapshot_line.received_qty
**Bằng chứng:** schema có sẵn `bom_snapshot_line.received_qty` với `linkedOrderId`/`snapshotLineId` trong `purchase_order_line` (xem `0005c_order_snapshot.sql` + `0005d_procurement.sql`). Nhưng UI hiện không có *tickbox per-line* trong PO detail để bộ phận kho click "đã nhận xong line này" — hiện vẫn phải tạo `inbound_receipt` riêng → operator nhập số liệu 2 lần.

**Hậu quả:** progress bar BOM 80% (40/50) không tự cập nhật real-time. User phải nhìn 2 nguồn (PO + Receipt) để biết thực sự còn thiếu bao nhiêu.

### 2.4. Excel BOM importer chỉ cover Item, không cover BOM file thực tế
**Bằng chứng:** module `/import` hiện hỗ trợ Item master (sku/name/uom). File Excel thực tế user đang dùng (đã đọc) có:
- Sheet 1+2: BOM project, mỗi sheet 40-58 line, có cột `ID Number` (R01-R41), `Standard Number` (mã bản vẽ → SKU), `Sub Category` (vật liệu code), `Visible Part Size` (LxWxH), `NCC shorthand`, `Note 1/2/3` (status text).
- Sheet 3 "Material&Process": **2 master tables song song** — vật liệu (POM/PB108/PVC/AL6061/SUS304/S45C…) với giá/kg, quy trình (MCT/Wire-cutting/Milling/Anodizing…) với giá/giờ.

**Schema gap:**
- `bom_line` thiếu `position_code` (string "R01", chỉ có `position` integer).
- `item` thiếu `dimensions` jsonb, `weight_g` numeric, `material_code` FK.
- Chưa có bảng `material_master` + `process_master`.
- `bom_line` chưa có `notes` per-line (đã có `bom_snapshot_line.notes` nhưng không phải per-template).

**Hậu quả:** operator vẫn phải nhập tay từng line vào UI sau khi import → chậm + dễ sai. File Excel thật có 2 sheet × 40-58 line = ~100 line, nhập tay là **không thể**.

### 2.5. Lệnh sản xuất thiếu workflow duyệt + ghi note + delay
**Bằng chứng:** `work_order` đã có `status` (DRAFT/QUEUED/RELEASED/IN_PROGRESS/PAUSED/COMPLETED/CANCELLED) và `wo_progress_log` (PROGRESS_REPORT/PAUSE/RESUME/QC_PASS/QC_FAIL/ISSUE/NOTE/PHOTO). Nhưng:
- Không có cột `metadata.approvalStatus` như PO V1.9 → không biết "ai đã duyệt WO này".
- UI hiện chưa có nút "Trì hoãn" + ghi note với due-date mới.
- Không phân biệt rõ WO cho hàng PURCHASED (commercial) vs FABRICATED (gia công nội bộ) — cùng 1 form.

**Hậu quả:** xưởng ra quyết định miệng → mất trace, không gắn với BOM snapshot line, không thể audit về sau.

---

## 3. Ba phương án kiến trúc redesign

### Phương án A — Big Bang (8-12 tuần)

**Mô tả:** redesign toàn bộ UI + chạy migration schema đồng loạt + module Kế toán full + xác lập design system mới. Push một bản V2.0 thay V1.5.

**Pros:**
- Một lần đau, hết đau. Code base sạch, không có "vùng xám" cũ-mới.
- User retrain 1 lần, sau đó chỉ học 1 UI.
- Kiến trúc đồng bộ, dễ maintain dài hạn.

**Cons:**
- 8-12 tuần không có release tăng giá trị → user mất kiên nhẫn (production đang dùng hằng ngày).
- Risk migration data lớn — `bom_snapshot_line` đang chạy, đụng schema dễ down.
- Khó rollback nếu user phản ứng tiêu cực với UI mới.
- YAGNI — schema hiện đã đủ 80%, làm full redesign là **over-engineer**.

**Verdict:** **không khuyến nghị.** V1 đang chạy production, big bang là risk không cần thiết.

---

### Phương án B — Incremental theo bộ phận (4 phase × 1-2 tuần)

**Mô tả:** mỗi phase release 1 bộ phận hoàn chỉnh (Kho → Mua bán → Kỹ thuật → Kế toán). Không đụng schema cũ trừ khi bộ phận đó bắt buộc.

**Phase 1 — Bộ phận Kho (1.5 tuần):**
- Regroup sidebar: tách section `inventory` thành `warehouse` + `purchasing`.
- Gộp `/items` + `/receiving` thành workspace `/warehouse` với 2 tab.
- Thêm tickbox receiving per-line trong PO detail → cập nhật `inbound_receipt_line` + `bom_snapshot_line.received_qty`.

**Phase 2 — Bộ phận Mua bán (1 tuần):**
- Workspace `/purchasing` gồm tab Suppliers + tab PO. PR đẩy về Engineering.
- Dashboard mini: PO đang chờ duyệt, PO đang chờ về, công nợ tổng theo NCC.

**Phase 3 — Bộ phận Kỹ thuật (2 tuần):**
- Workspace `/engineering` gồm BOM + WO + PR-from-BOM bulk-create.
- Excel BOM importer mới (2 sheet project + 1 sheet master).
- Schema delta: `material_master`, `process_master`, `item.dimensions/weight/material_code`, `bom_line.notes/position_code`.

**Phase 4 — Bộ phận Kế toán (1.5 tuần):**
- Workspace `/accounting` minimum: PO payment status, công nợ NCC, log thanh toán. Chưa cần xuất hoá đơn VAT.
- Trang Tổng quan tích hợp KPI từ cả 4 bộ phận.

**Pros:**
- Mỗi phase 1-2 tuần → user thấy giá trị liên tục.
- Risk phân mảnh nhỏ, rollback từng phase được.
- Schema delta chỉ áp dụng phase 3 → tách biệt risk migration.

**Cons:**
- 4 phase × 1-2 tuần = ~6 tuần. Tổng quan dashboard về cuối → sếp xưởng phải đợi lâu (ý đau thực sự của họ).
- 4 lần regroup sidebar → user thấy nav đổi liên tục, hơi rối.
- Mỗi phase phải maintain backward compat với phase trước → overhead.

---

### Phương án C — Hybrid lean (2 phase × 3-5 tuần) **[KHUYẾN NGHỊ]**

**Mô tả:** Phase 1 = quick-win 3 tuần đập sạch các nỗi đau lộ ra ngay (nav + dashboard + tickbox + importer). Phase 2 = 5 tuần làm schema delta + module Kế toán + UI workspace per-bộ phận hoàn thiện.

**Phase 1 — Quick wins (3 tuần, KHÔNG đụng schema):**
1. **Tuần 1:** regroup sidebar 4 bộ phận (Kho/Mua bán/Kỹ thuật/Kế toán-coming-soon). Chỉ rename + thêm field `section` mới trong `nav-items.ts`. Route giữ nguyên.
2. **Tuần 1-2:** trang Tổng quan `/` (thay redirect) — 6 progress bar + drilldown click → route hiện tại. Tái dùng `KpiCard` + `OrdersReadinessTable`. API mới `/api/dashboard/overview-v2` aggregate từ `bom_snapshot_line`.
3. **Tuần 2:** tickbox receiving per-line trong PO detail → cập nhật `inbound_receipt_line` (chưa cần lot/serial). Cộng dồn vào `bom_snapshot_line.received_qty` qua trigger SQL hiện có hoặc service layer.
4. **Tuần 2-3:** Excel BOM importer mới — wizard 3 bước (chọn file → preview 3 sheet → confirm import). Phase 1 chỉ map các trường có sẵn, các trường thiếu (`material_code`, `dimensions`) lưu vào `item.specJson` tạm.

**Phase 2 — Schema + module mới (5 tuần):**
1. **Tuần 4-5:** schema delta — migration `0017_material_process_master.sql`, `0018_item_dimensions_weight.sql`, `0019_bom_line_notes_position.sql`. Backfill từ `specJson` cũ.
2. **Tuần 5-6:** Excel BOM importer V2 — map đầy đủ `material_code`, `dimensions`, `weight_g`, `position_code`, `notes`. Tự seed `material_master` + `process_master` từ sheet 3.
3. **Tuần 6-7:** workspace `/engineering` PR-from-BOM bulk create. WO với `metadata.approvalStatus` + nút "Trì hoãn" + ghi note + reason.
4. **Tuần 7-8:** workspace `/accounting` tối thiểu — PO payment status + log thanh toán + báo cáo công nợ NCC. Tổng quan dashboard cập nhật KPI kế toán.

**Pros:**
- 3 tuần đầu: user thấy ngay 4 nỗi đau lớn nhất được fix (nav + dashboard + tickbox + importer cơ bản).
- Schema delta gom vào phase 2 → migration 1 cửa sổ duy nhất, dễ test.
- Mỗi tuần có deliverable rõ ràng.
- Phase 1 không đụng schema → rollback chỉ là git revert UI.

**Cons:**
- Tuần 2-3 có "vùng xám" (importer V1 dùng specJson, importer V2 sẽ migrate sang cột mới) → có thể phải viết script migrate dữ liệu cũ. Mitigate: phase 1 chỉ import file MỚI, file cũ giữ nguyên cho đến phase 2.
- 4 bộ phận trong nav từ tuần 1 nhưng module Kế toán chưa có gì → ghi rõ "Coming soon" hoặc link sang báo cáo đơn giản.

**Verdict: chốt Phương án C.**

**Lý do:**
- Cân bằng tốt giữa tốc độ giá trị (phase 1 = 3 tuần fix 4 nỗi đau) và độ chỉn chu (phase 2 cleanup schema + module mới).
- Tôn trọng KISS/YAGNI: schema delta chỉ làm khi importer thực sự cần dùng (phase 2), không làm trước.
- Risk thấp: phase 1 không đụng schema, có thể release từng tuần.
- Phù hợp năng lực 1 dev (user hiện tại) — không cần team lớn.

---

## 4. Quyết định lớn cần chốt

### Q1. Gộp `Items` + `Receiving` thành module Kho như thế nào?

**Vấn đề:** user muốn "gộp Danh mục vật tư + Nhận hàng làm một". Có 3 cách gộp:

- **Lựa chọn 1 — Tab trong workspace `/warehouse`:** route `/warehouse?tab=items` và `/warehouse?tab=receiving`. URL ngắn, code reuse layout.
- **Lựa chọn 2 — Sub-route `/warehouse/items` + `/warehouse/receiving`:** giữ 2 page độc lập, share sidebar group. Mỗi tab vẫn có URL riêng để bookmark.
- **Lựa chọn 3 — Nav riêng nhưng cùng group "Kho":** giữ `/items` và `/receiving` như cũ, chỉ đổi label group sidebar thành "Bộ phận Kho".

**Khuyến nghị:** **Lựa chọn 3.** Đây là chỉnh nhỏ nhất, KISS nhất. User nói "gộp" nhưng thực ra ý họ là "nhân viên kho thấy 2 cái này gần nhau trong nav" — không phải nhất thiết phải merge thành 1 page. Lý do thêm: Items là master data (CRUD), Receiving là transaction (workflow) — khác bản chất, gộp tab dễ rối UX. Nếu sau này thấy thực sự cần thì làm sub-route phase 2.

---

### Q2. Trang Tổng quan tự build mới hay tái dùng `KpiCard`/`OrdersReadinessTable`?

**Vấn đề:** đã có sẵn `apps/web/src/components/domain/KpiCard.tsx`, `OrdersReadinessTable.tsx`, `ProductionOverviewCards.tsx`, API `/api/dashboard/overview/route.ts`. Build mới hay reuse?

- **Lựa chọn 1 — Tái dùng + thêm progress bar wrapper:** giữ KpiCard, viết thêm component `ProgressBarStack` (6 thanh: linh kiện/lắp ráp/mua bán/đặt hàng/nhận hàng/báo giá), lắp vào page mới `/`.
- **Lựa chọn 2 — Build mới hoàn toàn:** thiết kế lại từ đầu vì các component cũ thiết kế cho dashboard riêng lẻ.

**Khuyến nghị:** **Lựa chọn 1.** Tái dùng + bổ sung. Component cũ đủ tốt cho KPI cards (KpiCard) và bảng order readiness (OrdersReadinessTable). Phần mới cần làm:
- 1 component `ProgressBarStack` (6 thanh phổ tiến độ).
- 1 API mới `/api/dashboard/overview-v2` aggregate sums từ `bom_snapshot_line` per-state. Query nặng → cache 30s với Redis.
- 1 component `DrilldownModal` hoặc dùng route nested.

Lý do: **KISS**. Component cũ đã được optimize và test, viết lại lãng phí.

---

### Q3. Receiving tickbox nên ở đâu?

**Vấn đề:** user muốn "trong cùng BOM list 50 linh kiện, đã đặt 1 PO 40 cái → tick checkbox per-line trong PO → tự động cập nhật received_qty". 3 nơi đặt:

- **Lựa chọn 1 — PO detail page:** trang `/procurement/purchase-orders/[id]` thêm cột "Đã nhận?" tickbox per `purchase_order_line`. Tick → tạo `inbound_receipt_line` + cập nhật `bom_snapshot_line.received_qty`.
- **Lựa chọn 2 — BOM grid `/bom/[id]/grid`:** tickbox trong BOM grid, mỗi line có cột "Status receipt".
- **Lựa chọn 3 — Trang `/receiving` mới với queue:** nhân viên kho mở queue, mỗi PO sắp về là 1 card, tick từng line trong card.

**Khuyến nghị:** **Lựa chọn 1 (chính) + Lựa chọn 3 (phase 2).** Lý do:
- Lựa chọn 1: PO detail là *nơi đúng nhất* về mặt domain — line PO là đơn vị giao dịch với NCC. Tickbox ở đây gắn trực tiếp với `purchase_order_line.id`, từ đó qua `snapshotLineId` đẩy về `bom_snapshot_line.received_qty`. Source-of-truth rõ ràng.
- Lựa chọn 2 không phù hợp: BOM grid là góc nhìn **engineer** (cấu trúc sản phẩm), không phải kho. Tickbox ở đây dễ confuse.
- Lựa chọn 3 là enhancement phase 2: queue view cho operator kho dùng PWA mobile khi đứng cạnh container hàng về. Phase 1 chưa cần.

---

### Q4. PR-from-BOM workflow

**Vấn đề:** user muốn engineer "chọn line nào cần mua trong BOM list → đẩy sang Mua bán". 2 cách:

- **Lựa chọn 1 — Bulk-create từ BOM grid:** trong `/bom/[id]/grid` thêm cột checkbox + nút "Tạo PR cho các line đã chọn" → mở modal nhập NCC + chuyển sang `/procurement/purchase-requests/[new-id]`.
- **Lựa chọn 2 — Sub-flow `/bom/[id]/grid?action=create-pr`:** mở wizard riêng với 3 bước (chọn line → chọn NCC → confirm).

**Khuyến nghị:** **Lựa chọn 1.** KISS. Bulk-create từ checkbox + 1 modal là pattern quen thuộc với user (đã làm tương tự trong V1.4). Wizard nhiều bước over-engineer cho task đơn giản. Lưu ý: PR sinh ra phải tự động set `linkedOrderId` (sales order) + `snapshotLineId` (bom_snapshot_line.id) để trace.

**Trade-off cần biết:** một số case engineer chỉ muốn 1 line + nhiều NCC (xin báo giá so sánh). Phase 1 cứ 1 PR / nhiều line / 1 NCC mặc định. Phase 2 nếu user phàn nàn mới thêm flow split.

---

### Q5. `material_master` + `process_master` — bảng riêng hay enum?

**Vấn đề:** sheet 3 file Excel có ~15 vật liệu (POM, PB108, PVC, AL6061, SUS304, S45C…) + ~10 quy trình (MCT, Milling, Anodizing…). Lưu ở đâu?

- **Lựa chọn 1 — Bảng riêng `app.material_master` + `app.process_master`:** schema chuẩn, có giá/kg, giá/giờ, có thể CRUD qua admin UI. FK từ `item.material_code`.
- **Lựa chọn 2 — Mở rộng `item.category` enum:** thêm category cho vật liệu/quy trình. Đơn giản nhưng confuse vì category hiện đang dùng cho item type khác.
- **Lựa chọn 3 — JSON config file `materials.json` static:** không cần CRUD, deploy mới khi thêm vật liệu.

**Khuyến nghị:** **Lựa chọn 1.** Lý do:
- Giá vật liệu thay đổi theo thời gian (AL6061 hôm nay 140k/kg, tháng sau 145k) — cần version history qua updated_at + audit.
- Process master cần liên kết với WO routing sau này → bảng có FK rõ ràng.
- Số lượng record nhỏ (~25 row total) nhưng cấu trúc chuẩn → dễ CRUD admin UI sau này.
- KISS với migration: 2 bảng đơn giản (`code`, `name_en`, `name_vn`, `price_unit`, `unit`, `density?`).

Lựa chọn 3 là YAGNI ngược — không có CRUD thì user phải gọi dev mỗi lần thêm vật liệu mới.

---

### Q6. Note 1/2/3 từ Excel lưu UI nào?

**Vấn đề:** 3 cột Note trong Excel chứa status text tự do ("đã yc gửi data", "ducpt đã nhận hàng 27/3", "chưa có data"). 2 cách:

- **Lựa chọn 1 — `metadata.notes: ["...", "...", "..."]`:** mảng 3 phần tử trong jsonb metadata. Linh hoạt, không đụng schema.
- **Lựa chọn 2 — 3 cột riêng `note1`, `note2`, `note3`:** rõ ràng nhưng cứng nhắc, schema không đẹp.
- **Lựa chọn 3 — Bảng riêng `bom_line_note` (parentId, idx, text, createdBy, createdAt):** mỗi note là 1 row, có audit trail, có thể thêm note thứ 4 mà không đổi schema.

**Khuyến nghị:** **Lựa chọn 3 cho phase 2, Lựa chọn 1 cho phase 1.** Lý do:
- Phase 1: gấp, dùng metadata.notes mảng 3 phần tử cho `bom_snapshot_line` (cột đã có).
- Phase 2: tách bảng `bom_line_note` để có audit trail (ai ghi note, khi nào). Note kiểu "ducpt đã nhận hàng 27/3" có giá trị forensic — cần biết ai ghi.
- Lựa chọn 2 (3 cột cứng) là anti-pattern, refuse.

---

### Q7. Drilldown từ Tổng quan — modal hay route mới?

**Vấn đề:** click vào progress bar "Mua bán 75%" → muốn xem chi tiết 25% còn lại là PO nào. Modal hay route?

- **Lựa chọn 1 — Modal overlay:** click → mở modal full-screen với danh sách + filter. Đóng modal về dashboard. URL không đổi.
- **Lựa chọn 2 — Route mới `/dashboard/drilldown/po`:** click → navigate. Có thể bookmark, share link.
- **Lựa chọn 3 — Redirect sang module gốc với filter:** click "Mua bán 75%" → `/procurement/purchase-orders?status=PENDING` (filter pre-applied). Tái dùng UI module.

**Khuyến nghị:** **Lựa chọn 3.** Lý do:
- KISS tuyệt đối. Không cần code thêm UI mới.
- Module gốc `/procurement/purchase-orders` đã có table + filter. Chỉ cần pass query param.
- User có thể bookmark/share link.
- Lựa chọn 1 (modal) phải code thêm UI duplicate — DRY violation.

---

### Q8. Workflow duyệt WO

**Vấn đề:** user muốn WO có người duyệt + delay được. PO V1.9 đã có pattern `metadata.approvalStatus`. Áp dụng cho WO?

- **Lựa chọn 1 — Copy y chang pattern PO:** `wo.metadata.approvalStatus`: PENDING/APPROVED/REJECTED + approvedBy + approvedAt.
- **Lựa chọn 2 — Tạo enum mới `wo_approval_status`:** schema chuẩn hơn, có index.
- **Lựa chọn 3 — Reuse status enum hiện có:** thêm DRAFT → PENDING_APPROVAL → QUEUED.

**Khuyến nghị:** **Lựa chọn 1.** Lý do:
- DRY — pattern đã làm cho PO, copy là quick + consistent.
- WO approval không cần index (volume thấp ~50 WO/tháng).
- Lựa chọn 3 phá vỡ semantic của status (DRAFT/QUEUED là production state, không phải approval state).

**Bonus:** thêm field `wo.delayed_until` (timestamp) + `wo.delay_reason` (text) cho tính năng "Trì hoãn". Có thể thêm vào metadata cũng được nhưng cột riêng dễ index sort.

---

### Q9. Bộ phận Kế toán phase 1 có gì tối thiểu?

**Vấn đề:** user nhắc kế toán nhưng V1 chưa cần ERP đầy đủ. Tối thiểu là gì?

**Khuyến nghị scope phase 1:**
- Bảng tổng PO theo trạng thái thanh toán (`metadata.paymentStatus`: UNPAID/PARTIAL/PAID — đã có ở V1.9 `0014_po_accounting_fields.sql`).
- Báo cáo công nợ NCC (sum `lineTotal` per supplier filter status != PAID).
- Log thanh toán: bảng `app.payment_log` (poId, amount, method, paidAt, notes). Manual entry, không tích hợp ngân hàng.
- KHÔNG làm: xuất hoá đơn VAT, e-invoice, chuyển khoản tự động, sổ kế toán đầy đủ → đó là phase 3+ và **không nên làm in-house**, dùng MISA/FAST sau.

**Không khuyến nghị** integrate trực tiếp với MISA/FAST phase 1 — quá nhiều API contract, phải có user thực sự dùng MISA mới làm.

---

### Q10. Sync Note 1 ("đã đặt 18/4") — auto infer hay nhập tay?

**Vấn đề:** Excel có Note "đã đặt Thế Long, 18/4 giao" — đây là status text. Phase mới nên auto-infer từ PO/Receipt state, hay vẫn cho user nhập tay?

- **Lựa chọn 1 — Auto-infer từ PO/Receipt:** "đã đặt" → query xem snapshot line này có PO nào không, có thì show "Đã đặt PO-XYZ ngày dd/mm". "Đã nhận" → query inbound_receipt.
- **Lựa chọn 2 — Nhập tay (như Excel hiện tại):** user gõ tự do, AI không can thiệp.
- **Lựa chọn 3 — Hybrid:** auto-suggest từ state, user override được nếu muốn.

**Khuyến nghị:** **Lựa chọn 3 (hybrid).** Phase 1 chỉ cần:
- Hiển thị status auto-derived từ snapshot_line.state (PLANNED/PURCHASING/IN_PRODUCTION/AVAILABLE/...) — đã có sẵn dữ liệu.
- Cho phép user gắn note text tự do bên cạnh (cột notes).
- Phase 2 mới làm AI suggestion.

Lý do từ chối Lựa chọn 1: Note Excel hiện tại có context user-specific như "ducpt đã nhận hàng 27/3" — không infer được từ schema. Để user gõ + system đồng thời show state.

---

## 5. Schema deltas cần thiết

> **Nguyên tắc:** mỗi migration <50 dòng SQL, có rollback, có seed data nếu cần. Tham chiếu: `packages/db/migrations/`.

| Migration | Mục đích | Phase |
|---|---|---|
| `0017_material_process_master.sql` | Tạo bảng `app.material_master` (code, name_en, name_vn, price_per_kg, density_kg_m3 nullable, uom). Tạo bảng `app.process_master` (code, name_en, name_vn, price_per_hour, uom). Seed từ Excel sheet 3. | Phase 2 |
| `0018_item_dimensions_weight.sql` | Thêm `item.dimensions` jsonb (`{length, width, height, unit}`), `item.weight_g` numeric, `item.material_code` varchar nullable FK `material_master.code`. | Phase 2 |
| `0019_bom_line_position_code.sql` | Thêm `bom_line.position_code` varchar(16) (chuỗi "R01","S40"). Giữ `position` integer như cũ. | Phase 2 |
| `0020_bom_line_note.sql` | Tạo bảng `app.bom_line_note` (id, bom_line_id FK, idx int, text text, created_by, created_at). Phase 2 mới làm — phase 1 dùng `bom_snapshot_line.metadata.notes` mảng. | Phase 2 |
| `0021_wo_approval_delay.sql` | Thêm `work_order.delayed_until` timestamp nullable + `work_order.delay_reason` text. Đối với approval, dùng metadata jsonb có sẵn, không cần migration. | Phase 2 |
| `0022_payment_log.sql` | Tạo bảng `app.payment_log` (id, po_id FK, amount, method enum BANK/CASH/OTHER, paid_at, notes, created_by). | Phase 2 (Kế toán) |

**Backfill scripts (không phải migration, là 1-off):**
- `scripts/backfill-bom-line-position.ts` — đọc tất cả `bom_line.position` integer + generate `position_code` ("R01" cho `position=1`, "R02" cho 2…). Chạy 1 lần sau migration 0019.
- `scripts/backfill-spec-to-dimensions.ts` — parse `item.specJson` cũ (text format "601.0 X 21.0 X 20.0") → cột `item.dimensions`. Chạy 1 lần. Item không parse được giữ nguyên `specJson`.

**Không cần migration phase 1** — chỉ regroup nav + tickbox + dashboard + importer V1 (lưu vào specJson).

---

## 6. Roadmap đề xuất (theo Phương án C — Hybrid lean)

### Phase 1 — Quick wins (3 tuần, KHÔNG đụng schema)

| Tuần | Deliverable | Owner agent | Verify |
|---|---|---|---|
| 1.1 | Regroup sidebar 4 bộ phận: edit `nav-items.ts` → 4 section (`warehouse`, `purchasing`, `engineering`, `accounting`). Item map cũ → mới. Section "accounting" hiện disabled "Coming soon". | ui-ux-developer | Login, click qua từng item, không 404. |
| 1.2 | Trang Tổng quan `/`: 6 progress bar + drilldown link. API `/api/dashboard/overview-v2` aggregate từ `bom_snapshot_line` per-state. Cache Redis 30s. | ui-ux-designer + ui-ux-developer | KPI khớp với count thủ công trong DB. |
| 2.1 | Tickbox receiving per-line trong PO detail (`/procurement/purchase-orders/[id]`). Service layer cập nhật `inbound_receipt_line` + `bom_snapshot_line.received_qty`. | ui-ux-developer + tester | Test E2E: tạo PO, tick 5/10 line → check `received_qty` DB. |
| 2.2 | Excel BOM importer V1 — wizard 3 bước. Map: ID Number, Standard Number → SKU, Quantity, NCC shorthand → supplier. Material/process lưu vào `specJson`. | planner + ui-ux-developer | Import file mẫu thực tế → 58 line tạo đúng. |
| 3.1 | Polishing: dashboard mobile responsive, tickbox PWA test. | ui-ux-designer | UAT 2 ngày với operator kho thật. |
| 3.2 | Release V2.0-phase1, monitor 3 ngày. | git-manager + project-manager | No P0 bug 72h → green. |

### Phase 2 — Schema + module mới (5 tuần)

| Tuần | Deliverable | Owner agent | Verify |
|---|---|---|---|
| 4.1 | Migration `0017_material_process_master.sql` + seed 25 record từ Excel sheet 3. Admin UI `/admin/materials` + `/admin/processes` CRUD. | planner + ui-ux-developer | Seed query SELECT * trả đủ 25 row. |
| 4.2 | Migration `0018_item_dimensions_weight.sql` + `0019_bom_line_position_code.sql`. Backfill scripts. UI item form thêm field. | planner + ui-ux-developer | Backfill chạy không lỗi, dimensions parse đúng 80%+. |
| 5.1 | Excel BOM importer V2 — map đầy đủ tất cả cột Excel. Auto-create item nếu chưa có. Auto-link material/process master. | ui-ux-developer + tester | Import file mẫu → so sánh với importer V1, tất cả field nhập chuẩn. |
| 5.2 | Migration `0020_bom_line_note.sql` + UI hiển thị note timeline trong BOM grid. | ui-ux-designer + ui-ux-developer | Tạo note → audit trail có createdBy, createdAt. |
| 6.1 | PR-from-BOM bulk-create: BOM grid checkbox + modal "Tạo PR". Auto-link `linkedOrderId` + `snapshotLineId`. | ui-ux-developer | Tạo PR từ 5 line → check FK đúng. |
| 6.2 | Migration `0021_wo_approval_delay.sql`. UI WO: nút "Trì hoãn" + ghi reason + due-date mới. `metadata.approvalStatus` workflow giống PO. | ui-ux-developer + tester | Trì hoãn WO → audit log có entry, due date update. |
| 7.1 | Migration `0022_payment_log.sql`. Workspace `/accounting` minimum: PO payment status table + payment log form + báo cáo công nợ. | planner + ui-ux-developer | Test ghi payment 1 PO partial → balance đúng. |
| 7.2 | Tổng quan dashboard: thêm KPI Kế toán (công nợ NCC, PO chờ thanh toán). | ui-ux-developer | KPI khớp với /accounting tổng. |
| 8.1 | Polish + UAT toàn hệ thống với 4 role (warehouse/purchasing/engineering/accounting). | ui-ux-designer + tester | Mỗi role hoàn thành end-to-end task. |
| 8.2 | Release V2.0-phase2 + viết docs cho user. | docs-manager + git-manager | Tag release `v2.0`, deploy production. |

### Tổng cộng: 8 tuần (~2 tháng)

---

## 7. Rủi ro + giảm nhẹ

### 7.1. Data loss khi migration schema (phase 2)
**Risk:** migration `0018_item_dimensions_weight.sql` thêm cột — an toàn. Nhưng `0020_bom_line_note.sql` tách bảng → nếu phase 1 đã ghi vào `metadata.notes` thì cần script migrate.

**Giảm nhẹ:**
- Tất cả migration phase 2 chỉ ADD COLUMN/TABLE, không DROP. Cột cũ giữ deprecated marker 1 tháng.
- Backup DB full trước mỗi migration: `pg_dump iot > backup-before-0017.sql`.
- Test migration trên staging clone DB production trước.
- Rollback script `0018_rollback.sql` chuẩn bị sẵn (DROP COLUMN).

### 7.2. Performance progress bar query khi BOM lớn
**Risk:** dashboard query aggregate `bom_snapshot_line` per-state. Hiện tại có ~58 line × N orders, nhưng năm sau có thể 1000 line × 50 orders = 50k row.

**Giảm nhẹ:**
- Cache Redis 30s cho `/api/dashboard/overview-v2` — không real-time strict.
- Index sẵn có `idx_snapshot_line_state` (xem `0005e_indexes_mv.sql`). Verify query plan dùng index.
- Nếu sau >100k row chậm, làm materialized view refresh mỗi 1 phút.
- Pagination drilldown — mỗi state max 50 row trên UI, click "Xem thêm" lazy load.

### 7.3. Operator kho không quen tickbox PWA
**Risk:** kho thật ngoài đời ít user dùng smartphone vào việc — họ quen giấy + bút.

**Giảm nhẹ:**
- UAT 2 ngày với 1 operator thật trước khi roll out.
- PWA tối ưu: button to (44px+), text VN to (16px+), confirm dialog rõ ràng "Xác nhận đã nhận 5 cái?".
- Giữ song song flow nhập tay qua trang `/receiving` cũ — nếu PWA fail vẫn có fallback.
- Training 1 buổi 30 phút + video screen-record VN.

### 7.4. Note text Excel không structured → mapping thất bại
**Risk:** "đã đặt Thế Long, 18/4 giao" + "ducpt đã nhận hàng 27/3" — text tự do, không có format chuẩn.

**Giảm nhẹ:**
- Phase 1: import literal text vào `metadata.notes` hoặc `notes` column. Không parse.
- Phase 2: cho phép user manual link 1 note với 1 PO/Receipt qua dropdown — không tự động.
- KHÔNG dùng AI/regex parse text VN — risk sai cao + dependency.

### 7.5. User reject UI mới do thay đổi quá nhiều
**Risk:** regroup nav + dashboard mới + tickbox mới — có thể overwhelm.

**Giảm nhẹ:**
- Release từng tuần phase 1 thay vì big bang. Mỗi tuần thêm 1 thứ, user adapt từng bước.
- Giữ alias route cũ `/items` redirect sang `/items` (vẫn hoạt động — chỉ đổi sidebar group).
- Toggle "UI cũ" trong settings 2 tuần đầu — fallback nếu user kẹt.
- Onboarding tour `react-joyride` tour 5 step lần đầu login UI mới.

### 7.6. CI build time tăng do thêm dependencies (xlsx parser, redis client)
**Risk:** xlsx (sheetjs) là library nặng (~3MB). Build Vercel/Docker tăng 30s+.

**Giảm nhẹ:**
- Lazy import `xlsx` — chỉ load khi user mở `/import` page.
- Server-side parse: API route `/api/import/excel` parse, client chỉ upload file. Bundle FE không tăng.
- `redis` client đã có (BullMQ) — không tăng dep.

---

## 8. Câu hỏi cần user trả lời trước khi bắt đầu

### Q1. Workflow duyệt PR/PO/WO — multi-level approval không?
- Cần 2 cấp duyệt (planner approve PR → manager approve PO) hay 1 cấp đủ?
- WO approval ai duyệt — supervisor xưởng hay admin?

> **Default đề xuất nếu không trả lời:** 1 cấp duyệt cho phase 1 (admin role), phase 2 mở multi-level nếu cần.

### Q2. Bộ phận Kế toán phase 1 scope tối thiểu?
- Cần xuất hoá đơn VAT không? (nếu có → phải tích hợp e-invoice provider VN, scope x3).
- Cần tích hợp MISA/FAST không?
- Có cần ghi sổ chi phí gia công nội bộ (NEM/NVL)?

> **Default đề xuất:** chỉ payment log + công nợ NCC. Không VAT, không MISA. Phase 3+ mới làm.

### Q3. File Excel BOM cũ có cần migrate không?
- User đã có bao nhiêu file Excel BOM cũ? (10? 50? 100?)
- Sau khi importer V2 ra (phase 2), có cần re-import file cũ vào schema mới không, hay chỉ áp dụng cho file mới từ ngày X?
- Nếu re-import: có chấp nhận data trùng/cần dedupe không?

> **Default đề xuất:** chỉ áp dụng cho file mới từ phase 2. File cũ giữ nguyên `specJson` text, không migrate tự động. User có thể re-import file quan trọng manual.

### Q4. Note 1/2/3 từ Excel — ngữ cảnh người ghi?
- Note do ai ghi? Engineer, kế toán, kho, hay tất cả?
- Có cần xoá / chỉnh sửa note không, hay append-only?
- Có cần tag mention (@user) trong note không?

> **Default đề xuất:** mọi role ghi được, append-only (không xoá), không mention phase 1.

### Q5. Mobile/PWA priority?
- Operator kho dùng điện thoại thực sự khi nhận hàng, hay chỉ ngồi máy tính?
- Cần offline mode (kho không có wifi) không?
- Camera scan barcode/QR không?

> **Default đề xuất:** PWA web-only, không offline, không scan barcode phase 1. Phase 2 nếu user xác nhận cần.

---

## 9. Phụ lục — Thông số tham chiếu

### 9.1. File code cần đụng

**Phase 1:**
- `apps/web/src/lib/nav-items.ts` — đổi 3 section thành 4 section, map item.
- `apps/web/src/components/layout/Sidebar.tsx` — không đổi (đã group dynamic).
- `apps/web/src/app/(app)/page.tsx` — thay redirect bằng dashboard tổng quan.
- `apps/web/src/app/api/dashboard/overview/route.ts` — viết v2.
- `apps/web/src/components/domain/KpiCard.tsx` — reuse.
- `apps/web/src/components/domain/OrdersReadinessTable.tsx` — reuse.
- `apps/web/src/app/(app)/procurement/purchase-orders/[id]/page.tsx` — thêm tickbox per-line.
- `apps/web/src/app/(app)/import/` — thêm wizard BOM Excel.

**Phase 2:**
- `packages/db/migrations/0017_material_process_master.sql` (mới)
- `packages/db/migrations/0018_item_dimensions_weight.sql` (mới)
- `packages/db/migrations/0019_bom_line_position_code.sql` (mới)
- `packages/db/migrations/0020_bom_line_note.sql` (mới)
- `packages/db/migrations/0021_wo_approval_delay.sql` (mới)
- `packages/db/migrations/0022_payment_log.sql` (mới)
- `apps/web/src/app/(app)/admin/materials/` (mới)
- `apps/web/src/app/(app)/admin/processes/` (mới)
- `apps/web/src/app/(app)/accounting/` (mới)

### 9.2. Sidebar mapping cũ → mới

| Item | Group cũ | Group mới |
|---|---|---|
| `/items` (Danh mục vật tư) | inventory | warehouse |
| `/receiving` (Nhận hàng) | inventory | warehouse |
| `/suppliers` (NCC) | inventory | purchasing |
| `/procurement/purchase-orders` (PO) | inventory | purchasing |
| `/bom` (BOM Templates) | production | engineering |
| `/orders` (Đơn hàng) | production | engineering |
| `/work-orders` (Lệnh sản xuất) | production | engineering |
| `/assembly` (Lắp ráp) | production | engineering |
| `/lot-serial` (Lot/Serial) | production | warehouse (lot là kho theo dõi) |
| `/procurement/purchase-requests` (PR) | inventory | engineering (engineer phát sinh PR) |
| `/import` (Nhập Excel) | other | engineering (import BOM) hoặc giữ admin |
| `/admin` (Quản trị) | other | other |
| `/accounting` (mới) | — | accounting |

**Rationale mapping:**
- PR (yêu cầu mua) thuộc engineering vì engineer là người biết "BOM thiếu gì cần mua". Mua bán chỉ thực thi.
- PO (đặt hàng) thuộc purchasing vì đó là việc của bộ phận mua bán.
- Receiving thuộc warehouse vì kho nhận hàng vật lý.
- Lot/Serial thuộc warehouse vì là tracking tồn kho.
- Lắp ráp thuộc engineering vì gắn với BOM/WO — sản xuất.

### 9.3. API endpoints mới phase 1

- `GET /api/dashboard/overview-v2` — aggregate progress 6 thanh.
  - Response: `{ componentProgress, assemblyProgress, purchasingProgress, orderProgress, receivingProgress, quotationProgress }` mỗi field có `{ total, done, percent, breakdown }`.
- `POST /api/purchase-orders/[id]/lines/[lineId]/receive` — tick checkbox receive.
  - Body: `{ qty, locationBinId? }`. Tự tạo `inbound_receipt_line` + cập nhật `bom_snapshot_line.received_qty`.
- `POST /api/import/bom-excel` — server-side parse Excel multi-sheet.
  - Multipart file upload. Trả `{ sheets: [{name, rowCount, preview}], summary: {...} }` cho UI preview.
- `POST /api/import/bom-excel/commit` — commit import sau preview.

### 9.4. Effort estimate (rough)

| Phase | Tuần | Story points (Fib) | Dev days |
|---|---|---|---|
| 1 - Quick wins | 3 | 21 | 15 |
| 2 - Schema + modules | 5 | 34 | 25 |
| **Total** | **8** | **55** | **40** |

Giả định: 1 dev senior, 5 ngày/tuần, không OT.

---

## 9.5. Workflow per-bộ phận chi tiết (đề xuất phase 2)

### Bộ phận Kho — daily flow
1. **Sáng:** mở dashboard `/` → click thanh "Nhận hàng 65%" → drilldown danh sách PO sắp về.
2. **Khi xe hàng đến:** mở `/procurement/purchase-orders/[id]` (PO đó) → tick checkbox per-line "đã nhận N cái" → hệ thống tự:
   - Tạo `inbound_receipt_line` với `lotCode` (auto-gen nếu PO không có lot specific).
   - Cập nhật `bom_snapshot_line.received_qty += N`.
   - Trigger update `bom_snapshot_line.state` từ PURCHASING → INBOUND_QC nếu đủ qty.
3. **Cuối ngày:** xem `/warehouse/inventory` (alias `/items` nhưng filter theo location bin) → check tồn kho thực tế khớp.
4. **Pain point hiện tại:** phải vào `/receiving` tạo phiếu mới → nhập 2 lần. Phase 1 tickbox PO line tự tạo phiếu nền.

### Bộ phận Mua bán — daily flow
1. **Sáng:** mở dashboard → drilldown "Mua bán 75%" → list 25% đang chờ duyệt PO.
2. **Nhận PR từ Engineering:** notification (sau này) hoặc check `/procurement/purchase-requests` → tab "Đã APPROVED, chưa convert" → click PR → "Convert sang PO".
3. **Tạo PO:** chọn NCC từ `item_supplier.preferred=true`, fill paymentTerms (đã có schema V1.9), gửi PO PDF qua email NCC (phase 2).
4. **Theo dõi:** `/purchasing/po` filter theo `metadata.deliveryStatus`: ON_TIME / DELAYED / RECEIVED.
5. **Pain point:** hiện không có tab "đã đặt nhưng chưa về" gộp cross-PO. Phase 2 thêm view này.

### Bộ phận Kỹ thuật — daily flow
1. **Sáng:** mở dashboard → tổng quan tiến độ sản xuất + BOM nào còn shortage.
2. **Tạo BOM mới:** từ `/import` upload Excel (V2 phase 2) → wizard preview 3 sheet → confirm. Hoặc manual qua `/bom/new`.
3. **Explode BOM cho đơn hàng mới:** `/orders/[id]` → click "Explode BOM" → tạo `bom_snapshot_line` cho từng component.
4. **PR-from-BOM:** trong `/bom/[id]/grid` (hoặc snapshot view của order) → checkbox các line cần mua → "Tạo PR" → modal chọn NCC + chuyển sang `/procurement/purchase-requests/new` đã pre-fill.
5. **Tạo WO cho hàng FABRICATED:** `/work-orders/new` → link với `bom_snapshot_line.id` → chọn routing process từ `process_master`.
6. **Pain point:** hiện không có flow "nhìn BOM tổng, chọn line nào outsource (PR), line nào in-house (WO)" — phase 2 thêm BOM grid với 2 nút action per-line.

### Bộ phận Kế toán — daily flow (phase 2)
1. **Sáng:** mở dashboard → KPI công nợ NCC + PO đến hạn thanh toán hôm nay.
2. **Ghi thanh toán:** `/accounting/payments/new` → chọn PO → nhập amount + method (BANK/CASH) + upload chứng từ → save vào `payment_log`.
3. **Báo cáo cuối tháng:** `/accounting/reports/aging` (báo cáo tuổi nợ NCC) — filter theo NCC, paymentTerms.
4. **Out-of-scope phase 2:** xuất hoá đơn VAT (làm bằng MISA bên ngoài), chuyển khoản tự động (làm thủ công qua app ngân hàng).

---

## 9.6. Phân tích trade-off Phase 1 vs Phase 2

### Tại sao tách 2 phase?

**Logic:** phase 1 không cần migration → có thể release liên tục từng tuần. Phase 2 cần migration → release theo batch mỗi tuần phải plan downtime ngắn (~2 phút mỗi migration).

**Alternative đã consider và bỏ:**
- *Làm tất cả trong 1 phase 8 tuần:* user phải đợi 8 tuần mới thấy nav mới — quá lâu, mất nhuệ khí.
- *Làm 4 phase nhỏ × 2 tuần (Phương án B):* tổng vẫn 8 tuần nhưng dashboard tổng quan ra cuối → sếp xưởng (stakeholder cao nhất) phải đợi 6 tuần thấy giá trị. Không hợp lý vì sếp là người thấy dashboard quan trọng nhất.

### Kpi đo thành công

**Phase 1 (sau 3 tuần):**
- Dashboard tổng quan load <1s (cache Redis hit rate >80%).
- Tickbox receiving giảm thời gian nhận hàng từ ~5 phút/PO xuống <2 phút/PO (đo qua audit log timestamp).
- Excel BOM importer đọc đúng >90% line trong file mẫu thực (10/58 cho phép sai để fix manual).
- Survey user: "UI mới dễ dùng hơn?" >7/10 trên thang Likert.

**Phase 2 (sau 8 tuần):**
- Material/process master có >25 record seed + 5 record user thêm trong tháng đầu.
- WO approval workflow dùng đủ: 100% WO mới có approvalStatus.
- Module Kế toán log >80% PO có ít nhất 1 payment entry sau 1 tháng go-live.
- Zero data loss qua các migration (verify bằng diff `pg_dump` trước/sau).

---

## 9.7. Things explicitly NOT in scope (YAGNI guard)

Để tránh scope creep, list rõ những thứ KHÔNG làm phase 1+2:

- **AI features:** auto-suggest BOM, AI parse note text, OCR Excel scan ảnh — phase 3+.
- **Multi-warehouse:** 1 location duy nhất phase 1+2. Chuyển kho cross-location phase 3+.
- **Multi-currency:** chỉ VND. USD/CNY phase 3+.
- **Mobile native app:** chỉ PWA web. iOS/Android native phase 3+.
- **Real-time collab (multi-user edit cùng BOM):** lock optimistic phase 1+2. WebSocket phase 3+.
- **Tích hợp API ngoài:** MISA/FAST/Zalo/SMS Gateway — phase 3+.
- **Barcode/QR scan:** phase 3+ (cần test kỹ với hardware thực).
- **Advanced reports:** chỉ aging report cơ bản. Cube/OLAP phase 3+.
- **Workflow engine:** không dùng BPMN/Camunda. State machine hardcode trong code đủ dùng.
- **Microservices:** giữ monolith Next.js. Tách service phase 4+ nếu thực sự cần scale (hiện 4vCPU/8GB còn dư nhiều).

**Lý do liệt kê:** mỗi item trên có thể là feature request "nhỏ" nhưng cộng dồn = 6 tháng dev. Cần kỷ luật từ chối.

---

## 9.8. Decision matrix tóm tắt

| Decision | Lựa chọn chốt | Lý do ngắn |
|---|---|---|
| Phương án | C - Hybrid | Cân bằng tốc độ + chỉn chu |
| Sidebar group | 4 bộ phận | Map workflow thực |
| Items + Receiving | Giữ tách + cùng group warehouse | KISS |
| Dashboard component | Reuse + thêm ProgressBarStack | DRY |
| Tickbox receiving | PO detail page | Domain đúng |
| PR-from-BOM | Bulk modal từ BOM grid | Pattern quen |
| Material/Process | Bảng riêng | Cần CRUD + history |
| Note 1/2/3 phase 1 | metadata.notes mảng | Quick |
| Note 1/2/3 phase 2 | bom_line_note table | Audit trail |
| Drilldown | Redirect filter pre-applied | Tái dùng UI |
| WO approval | Copy pattern PO metadata | DRY |
| Kế toán phase 1 | Payment log + aging only | YAGNI |
| Status note | Hybrid auto + manual | Practical |

---

## 10. Kết luận & decision log

**Phương án chốt:** **C — Hybrid lean** (8 tuần, 2 phase).

**Risk ranking (cao → thấp):**
1. User reject UI thay đổi (giảm nhẹ: release từng tuần + alias route).
2. Operator kho không quen tickbox PWA (giảm nhẹ: UAT 2 ngày + fallback flow cũ).
3. Migration schema phase 2 (giảm nhẹ: ADD-only + backup + rollback script).

**Top 3 unknowns cần user trả lời ngay:**
1. Multi-level approval PR/PO/WO?
2. Kế toán phase 1 cần VAT/MISA không?
3. Mobile/PWA priority + scan barcode?

**Khi user trả lời 3 câu trên, cập nhật brainstorm này → chuyển planner agent viết `plan.md` chi tiết phase 1.**

---

*Brainstorm by solution-brainstormer agent — 2026-04-25.*
