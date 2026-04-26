# Sprint 6 FIX — Material/Process Per-BOM (lật quyết định Q-B)

**Ngày:** 2026-04-26
**Tác giả:** solution-brainstormer agent
**Trạng thái:** DRAFT — chờ user duyệt 5 câu §9
**Phạm vi:** lật quyết định Q-B của brainstorm 2026-04-25 (chỉ là REF) → MATERIAL/PROCESS sheet phải lưu **rows per-BOM** (giá thực, phôi, status, qty), master vẫn giữ vai trò **catalog tham chiếu**.
**Liên quan:**
- Brainstorm gốc: [`sprint-6-multi-sheet-brainstorm.md`](sprint-6-multi-sheet-brainstorm.md) — Phương án D đã chốt + Q-B "REF only"
- Schema đã apply VPS: [`packages/db/migrations/0017_material_process_master.sql`](../../packages/db/migrations/0017_material_process_master.sql), [`0025_bom_sheet.sql`](../../packages/db/migrations/0025_bom_sheet.sql), [`0026_bom_line_sheet_link.sql`](../../packages/db/migrations/0026_bom_line_sheet_link.sql), [`0027_bom_sheet_backfill.sql`](../../packages/db/migrations/0027_bom_sheet_backfill.sql)
- Schema TS: [`packages/db/src/schema/bom-sheet.ts`](../../packages/db/src/schema/bom-sheet.ts), [`bom.ts`](../../packages/db/src/schema/bom.ts), [`master-data.ts`](../../packages/db/src/schema/master-data.ts)
- Importer hiện có: [`apps/web/src/server/services/bomImportParser.ts`](../../apps/web/src/server/services/bomImportParser.ts) (`classifyOfficialSheet`, `MASTER_MATERIAL_PROCESS`)
- File Excel mẫu: `Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx`
- Tình trạng production: 8 sheet PROJECT đã backfill, 147 lines linked, 23 material + 11 process master seed.

---

## 1. Tóm tắt điều hành

- **Vấn đề:** quyết định Q-B sai — sheet MATERIAL/PROCESS không thể chỉ là metadata filter REF. Mỗi BOM cần lưu giá deal khách (vd AL6061 master 140k, BOM này 150k), phôi nguyên liệu cho từng line ("Tôn AL6061 30x152x60mm" cho R09), status mua hàng per-BOM ("Đã đặt 18/4 Thế Long"), và qty thực tế dùng.
- **Quyết định lật:** **giữ master_master làm catalog tham chiếu (tên chuẩn, giá gợi ý, density)**, thêm **2 bảng mới `bom_sheet_material_row` + `bom_sheet_process_row`** cho rows per-BOM. Sheet MATERIAL/PROCESS có data riêng, reference master qua `material_code`/`process_code`.
- **Schema delta:** thêm migration `0028` rename enum (MATERIAL_REF → MATERIAL, PROCESS_REF → PROCESS), `0029` bảng material_row, `0030` bảng process_row. Tổng 3 file SQL mới, ~80 dòng.
- **Migration cần:** ALTER TYPE rename enum value (PG ≥10 hỗ trợ `ALTER TYPE ... RENAME VALUE`), 2 CREATE TABLE idempotent, không touch dữ liệu sheet hiện có.
- **Next step:** user trả lời Q1 (auto-populate hay manual), Q4 (status sync với snapshot không), Q6 (1 row hay nhiều rows per material), Q5 (live-bind giá master hay snapshot), Q3 (importer V2 logic). Sau đó code ~22h theo roadmap §8.

---

## 2. Phân tích case business kỹ sư xưởng (10 câu)

Đặt mình là kỹ sư cơ khí Song Châu mở BOM "Z0000002-502653 BANG TAI DIPPING R01" trên hệ thống:

1. **Tab BOM Structure (Sheet PROJECT R01):** thấy 41 lines tree theo thứ tự `R01 → R02 → R03...`, mỗi line là 1 component (POM Bracket, AL6061 Plate, SUS304 Roller...). Click line R09 mở drawer thấy dimension/qty/NCC/Note đã import từ Excel.

2. **Tab Vật liệu (Sheet MATERIAL):** kỳ vọng thấy bảng **23 rows** vật liệu được dùng trong R01 (extract từ cột Sub Category của lines). Mỗi row có: code (AL6061), tên VN (Nhôm AL6061), **giá deal cho project này (150k/kg, lệch master 140k)**, **phôi cụ thể** ("Tôn 30×152×60mm cho R09"), qty kg, NCC dự kiến, **status** ("PLANNED"/"ORDERED"/"DELIVERED"), note "Khách deal giá theo size order".

3. **Edit giá AL6061 cho project này:** click cell "Giá/kg", nhập 150000, save → chỉ ảnh hưởng row trong BOM này, master vẫn 140k. Master xem là "giá gợi ý". Có icon `⚠ lệch master 140k` hiển thị tooltip để kỹ sư biết.

4. **Status "Đã đặt 18/4 giao bởi Thế Long":** gắn vào **material row**, không gắn vào bom_line. Lý do: 1 lô AL6061 mua xong dùng cho R02+R09+R15, không gắn 1 line cụ thể. Status có 4 state đơn giản: PLANNED → ORDERED → DELIVERED → QC_PASS. Note text "ĐH-04518 Thế Long ngày 18/04 - giá fix 150k" lưu trong field `notes`.

5. **Phôi nguyên liệu cụ thể (vd R09 cần "phôi AL6061 30×152×60mm"):** đây là **dimension của material row instance**, không phải dimension của master AL6061. Schema field `blank_size jsonb`: `{"l_mm": 152, "w_mm": 60, "t_mm": 30, "shape": "PLATE", "qty_pcs": 4}`. Hoặc free-text nếu phôi phức tạp. 1 material code có thể có nhiều rows nếu cùng AL6061 nhưng phôi khác nhau (R09 phôi 30×152×60 vs R15 phôi 20×100×40).

6. **Tab Quy trình (Sheet PROCESS):** bảng 11 rows quy trình dùng trong project: MCT, MILLING, ANODIZING, ASSEMBLY... Mỗi row có: code, tên VN, **giờ ước tính cho project này** (R01 cần 18h MCT, master gợi ý 200k/giờ → tổng 3.6M), **đơn giá deal** (200k/h cố định master, hoặc lệch nếu khách deal). Trạm thực hiện (T1, T2 — định nghĩa `production_station` đã có).

7. **Khi đã có BOM tương tự + tạo BOM mới (cặp đôi R01 + L01 mirror):** user upload file mới sheet L01, kỳ vọng **auto-populate material rows từ sheet L01 lines** (không phải nhập lại 23 vật liệu). Hệ thống detect `Sub Category="AL6061"` trong lines L01 → tạo row AL6061 trong sheet MATERIAL của BOM L01 với giá master snapshot (chưa biết giá deal trước khi mua). User chỉnh giá deal sau.

8. **Báo cáo tổng hợp giá vật liệu BOM:** `SUM(price_per_kg × qty_kg) GROUP BY material_code` từ `bom_sheet_material_row`. Không phải từ master (master không có qty per-BOM). Báo cáo kế toán dự toán giá thành dùng query này.

9. **Master data quản lý ở đâu:** trang `/admin/materials` vẫn CRUD master toàn cục (giá gợi ý mới nhất, density, category, name chuẩn). Khi giá thị trường biến động (vd AL6061 từ 140k lên 145k), admin update 1 chỗ → BOM mới import sau đó snapshot giá mới. **BOM cũ không tự update** (xem Q5).

10. **RELEASE BOM (immutable):** snapshot vào `bom_revision.frozen_snapshot` jsonb gồm `template + sheets[] + lines[] + material_rows[] + process_rows[]`. Sau release, nếu master price đổi, BOM frozen vẫn giữ giá tại thời điểm release. Khách hàng nhận quote với giá đã chốt — không bị "rút gậy" sau khi báo giá.

**Kết luận:** master_master = catalog tham chiếu (name canonical, price_suggested, density, category). `bom_sheet_material_row` = data thực tế per-BOM (price actual, blank size, status, qty, supplier). 2 vai trò khác nhau, không duplicate vô nghĩa — đây là **master + transactional data** pattern chuẩn ERP.

---

## 3. Ba phương án schema (so sánh sòng phẳng)

### Phương án X1 — Bảng `bom_sheet_material_row` + `bom_sheet_process_row` riêng [KHUYẾN NGHỊ]

**Mô tả:**
- Tạo bảng mới `bom_sheet_material_row`:
  - `id UUID PK`, `sheet_id UUID FK bom_sheet`, `material_code VARCHAR(64)` (optional FK soft tới `material_master.code`), `name_override VARCHAR(255)` (nếu user dùng tên khác master), `price_per_kg NUMERIC(18,2)` (giá deal project), `qty_kg NUMERIC(18,4)`, `blank_size JSONB` (phôi cụ thể), `supplier_code VARCHAR(64)` (NCC dự kiến), `status VARCHAR(16)` enum (PLANNED/ORDERED/DELIVERED/QC_PASS/CANCELLED), `notes TEXT`, `position INT`, audit fields.
- Tương tự `bom_sheet_process_row`: `code`, `name_override`, `hours_estimated NUMERIC(8,2)`, `price_per_unit NUMERIC(18,2)`, `pricing_unit VARCHAR(16)`, `station_code VARCHAR(64)`, `notes`, `position`.
- Sheet MATERIAL chứa N material rows; sheet PROCESS chứa N process rows.
- Optional FK `bom_line_id UUID` link 1 row tới 1 line cụ thể (nếu user muốn — Q2).

**Pros:**
- Schema chuẩn relational — query đơn giản `SELECT * FROM bom_sheet_material_row WHERE sheet_id = ?`.
- Index per row, audit trail per row, FK cascade khi delete sheet.
- Dễ extend (thêm column `lot_id` link tới `inventory_lot` khi nhận hàng — phase 7).
- Type safety Drizzle/Zod tốt — không jsonb đào sâu.
- Reuse pattern `bom_line` (đã có self-ref + position).

**Cons:**
- 2 bảng mới, 2 migration mới.
- API CRUD 2 endpoints song song (hoặc 1 generic — KISS chia 2 đơn giản hơn).
- Schema TS thêm 2 file (`bom-sheet-material-row.ts`, `bom-sheet-process-row.ts`).

**Verdict:** **CHỌN.** Schema chuẩn, dễ maintain, scale tốt khi BOM lớn 100+ vật liệu.

---

### Phương án X2 — Reuse `bom_line` + thêm `bom_line.line_kind`

**Mô tả:**
- Mở rộng `bom_line` thêm column `line_kind` enum `(COMPONENT, MATERIAL_USAGE, PROCESS_USAGE)`.
- `componentItemId` đổi NULLABLE (hiện đang NOT NULL).
- Thêm column `material_code` VARCHAR(64) nullable, `process_code` VARCHAR(64) nullable.
- Sheet MATERIAL chứa lines `line_kind=MATERIAL_USAGE` với `material_code` set, `componentItemId` null.
- Sheet PROCESS chứa lines `line_kind=PROCESS_USAGE` với `process_code` set.
- Sheet PROJECT giữ `line_kind=COMPONENT` (default).

**Pros:**
- Tận dụng schema `bom_line` đã có (tree, position, audit, sheet_id FK).
- 1 query `SELECT * FROM bom_line WHERE sheet_id = ?` cho mọi kind.
- Không cần API/UI tách biệt — tab kind khác nhau chỉ render column khác nhau.

**Cons:**
- `bom_line` schema phình to — nửa column dùng cho COMPONENT, nửa cho MATERIAL/PROCESS. Đọc schema khó hiểu.
- `componentItemId` từ NOT NULL → NULLABLE = breaking change. Phải audit query nào đang assume not null (nhiều).
- 147 lines hiện tại đều `line_kind=COMPONENT` — backfill thêm column.
- Logic validation phức tạp: line_kind=COMPONENT → require componentItemId; line_kind=MATERIAL → require material_code; check trong app code hoặc CHECK constraint dài.
- Repos/queries hiện tại assume bom_line = component → phải refactor mọi nơi.
- Mixed kind trong 1 query khó index hiệu quả.

**Verdict:** **KHÔNG CHỌN.** Reuse table xuất hiện DRY nhưng thực ra tăng coupling, tích nợ schema.

---

### Phương án X3 — `bom_sheet.metadata.rows[]` jsonb

**Mô tả:**
- Mọi data nằm trong `bom_sheet.metadata` jsonb:
```json
{
  "kind": "MATERIAL",
  "rows": [
    {"id":"uuid","material_code":"AL6061","price_per_kg":150000,"qty_kg":12.5,"blank_size":{...},"status":"ORDERED","notes":"..."}
  ]
}
```
- Không tạo bảng mới.

**Pros:**
- Zero migration schema (chỉ rename enum nếu cần).
- Linh hoạt — đổi shape row dễ.

**Cons:**
- Query khó: filter rows theo material_code phải `metadata->'rows' @> '[{"material_code":"AL6061"}]'` — index GIN nặng.
- Audit trail rows mất — không biết row nào do user nào edit khi nào.
- Update 1 row trong array phải read-modify-write toàn array → race condition.
- FK `material_code → material_master` không enforce được.
- Type safety yếu — phải maintain Zod schema bằng tay, không DB-driven.
- Khi BOM có 50+ vật liệu × 10 BOM, query report cross-BOM (vd "tổng AL6061 đã đặt tháng 4") phải scan toàn jsonb.
- KHÔNG scale.

**Verdict:** **KHÔNG CHỌN.** Quick win nhưng tích nợ kỹ thuật cao. KISS không phải lazy.

---

### Tại sao chọn X1?

X1 là **single-purpose table** chuẩn relational. Các ERP lớn (SAP, Odoo, Oracle Fusion) đều có bảng `bom_material_line` riêng biệt với `bom_component_line`. Tách table = tách concern = dễ scale.

X2 (reuse) hấp dẫn vì DRY apparent, nhưng `bom_line` đã có 147 rows production, đổi nullable + thêm 3 column = breaking change khó đảm bảo.

X3 (jsonb) là phản pattern khi data có chiều sâu (rows array) + cần audit + cần FK enforce.

---

## 4. 8 quyết định lớn (Q1-Q8)

### Q1. Sheet MATERIAL/PROCESS — đổi enum (rename) hay thêm value mới?

**Bối cảnh:** enum `bom_sheet_kind` hiện có `('PROJECT','MATERIAL_REF','PROCESS_REF','CUSTOM')`. Sau khi lật quyết định, semantic không còn là REF (chỉ filter) mà là **container chứa rows per-BOM**.

- **Option A (Rename):** `MATERIAL_REF → MATERIAL`, `PROCESS_REF → PROCESS`. PG ≥10 hỗ trợ `ALTER TYPE ... RENAME VALUE`. Sạch, semantic chuẩn.
- **Option B (Thêm value, giữ cũ):** thêm `MATERIAL_DATA`, `PROCESS_DATA`. Code app dùng value mới. Value cũ deprecated. Migration backfill `bom_sheet` rows kind=MATERIAL_REF → MATERIAL_DATA.
- **Option C (Giữ y nguyên, đổi semantic):** code đối xử MATERIAL_REF như "MATERIAL with rows". Lấp liếm về tên, hợp đồng cũ.

**Khuyến nghị: Option A.** Production hiện chưa có sheet kind=MATERIAL_REF/PROCESS_REF nào (chỉ 8 sheet PROJECT đã backfill). Rename không ảnh hưởng data thực. Code TS regenerate enum, dễ refactor.

**Default nếu user không trả lời:** Option A (rename).

---

### Q2. Material row có chứa `componentLineId` (link tới bom_line cụ thể) không?

**Bối cảnh:** R09 có phôi AL6061 riêng → material row "AL6061 phôi 30×152×60" có cần FK tới bom_line R09?

- **Option A (CÓ FK optional):** thêm `bom_sheet_material_row.component_line_id UUID NULLABLE FK bom_line(id)`. User có thể link hoặc không. Hữu ích khi tracking phôi cho line cụ thể.
- **Option B (KHÔNG FK):** material rows rời rạc với bom_lines. Field `notes` lưu free-text "cho R09".
- **Option C (CÓ FK + bắt buộc):** material rows phải link 1 line cụ thể. 1 line dùng 2 vật liệu = 2 rows.

**Phân tích:**
- C quá strict — Sheet MATERIAL có vật liệu chung "AL6061 dùng cho 5 lines" thì link line nào?
- A linh hoạt — link khi cần phôi cụ thể (R09), bỏ trống khi vật liệu chung (master "AL6061 mua sỉ 50kg").
- B mất ngữ nghĩa truy vết.

**Khuyến nghị: Option A (FK optional).** UI có dropdown "Gắn với line nào?" cho phép null. Query `JOIN bom_line ON bom_sheet_material_row.component_line_id = bl.id LEFT JOIN` — null OK.

**Default:** Option A.

---

### Q3. Khi import Excel "Bản chính thức", auto-populate MATERIAL rows từ Sub Category column hay manual?

**Bối cảnh:** Excel sheet 1 lines có column `Sub Category` (vd "AL6061", "POM ESD BLACK", "SUS304_4_10"). Sheet 3 Material&Process có 23 rows master vật liệu. Khi import, có 2 strategies:

- **Option A (Auto-populate):** parser extract distinct `Sub Category` values từ lines sheet 1+2 → match với `material_master.code` → tạo material rows tương ứng trong sheet MATERIAL với:
  - `material_code` = match với master
  - `price_per_kg` = snapshot từ master tại thời điểm import (default deal price = master price)
  - `qty_kg` = NULL (user nhập sau)
  - `blank_size` = NULL
  - `status` = PLANNED
  - `notes` = "Auto-populated from import"
- **Option B (Manual):** user vào tab MATERIAL sau import, click "+ Thêm vật liệu" pick từ master dropdown, nhập rows manual.
- **Option C (Hybrid wizard):** import xong show preview list "23 vật liệu detected, tick chọn cái nào tạo row" + có thể edit price/qty inline trước commit.

**Phân tích:**
- A nhanh nhất nhưng có thể tạo rows thừa (vd "POM" master không match exactly với "POM Thường" trong line) → user phải xóa.
- B chính xác nhưng tốn thời gian — file Excel mẫu có 23 vật liệu, nhập tay tốn 30 phút.
- C cân bằng — preview + tick trước commit.

**Khuyến nghị: Option A cho V1, Option C cho V2.** Phase 6 KISS = auto-populate hết, user tweak sau (xóa row thừa, sửa price). Phase 7+ làm wizard preview nếu user phàn nàn rows thừa.

**Default:** Option A (auto-populate, status=PLANNED, price=master snapshot).

---

### Q4. Status flow material row — sync với `bom_snapshot_line.state` 10-state hay riêng?

**Bối cảnh:** [`bom_snapshot_line`](../../packages/db/src/schema/snapshot.ts) đã có 10-state machine cho component line (PLANNED → RESERVED → IN_PROGRESS → DONE → ...). Material row có nên dùng cùng enum?

- **Option A (Riêng — 4-state đơn giản):** PLANNED → ORDERED → DELIVERED → QC_PASS (+CANCELLED). Material không có "RESERVED/IN_PROGRESS" như line — nó là raw material chưa thành phẩm.
- **Option B (Sync với 10-state):** dùng cùng enum `bom_snapshot_line_state`. Phải skip một số state không liên quan (IN_PROGRESS, ASSEMBLED). Confuse.
- **Option C (Sync với PO line state):** purchase_order_line đã có state (DRAFT/SENT/CONFIRMED/RECEIVED). Material row state = PO line state nếu có linked PO.

**Phân tích:**
- A đơn giản, đúng nghĩa "lifecycle vật liệu mua".
- B over-engineer — material không cần 10 state.
- C hấp dẫn nhưng tight coupling — phải có PO trước. Material status `PLANNED` không cần PO.

**Khuyến nghị: Option A.** Enum mới `material_row_status` 5 value: `PLANNED, ORDERED, DELIVERED, QC_PASS, CANCELLED`. Khi link với PO line (Q7), status auto-derive từ PO line state. Khi không link, user manual update.

**Default:** Option A (5-state riêng).

---

### Q5. Khi `material_master.price_per_kg` thay đổi — material rows cũ trong BOM có auto-update không?

**Bối cảnh:** master AL6061 từ 140k → 145k. BOM cũ đã có row AL6061 với price 140k.

- **Option A (Snapshot, không auto-update):** material row giữ price tại thời điểm import. User phải manual sync nếu muốn cập nhật (button "Sync giá master").
- **Option B (Live-bind, auto-update):** material row không lưu price, query JOIN master mỗi lần đọc. Master đổi → BOM hiển thị giá mới.
- **Option C (Hybrid, có flag):** material row có column `price_locked BOOLEAN`. `false` = live-bind, `true` = snapshot.

**Phân tích:**
- B đẹp DRY nhưng phá nghĩa "BOM là quote chốt với khách". Khách quote 140k, master tăng 145k → khách thấy 145k → chargeback.
- A đúng nghĩa quote. Phải có UX rõ ràng "giá master 145k > giá row 140k, có sync không?" warning.
- C linh hoạt nhưng tốn 1 column + UX complexity.

**Khuyến nghị: Option A (snapshot).** Quote không thay đổi sau khi gửi khách. Master đổi giá chỉ áp dụng cho BOM mới import sau đó. Show warning icon nếu lệch master để kỹ sư biết review.

**Default:** Option A. Optional UI button "Sync giá master cho row này" (1 click update).

---

### Q6. 1 material code có nhiều rows trong cùng MATERIAL sheet không?

**Bối cảnh:** AL6061 dùng cho R02, R09, R15. R09 phôi 30×152×60mm, R15 phôi 20×100×40mm. Có 2 cách:

- **Option A (Aggregate 1 row):** 1 row "AL6061 — qty 25kg tổng" với `notes` "phôi đa dạng". Không track phôi per line.
- **Option B (Multiple rows):** N rows AL6061 mỗi row 1 phôi/qty/component_line riêng. Tổng AL6061 = SUM(qty_kg).
- **Option C (Hybrid):** mặc định 1 row aggregate, user có thể "Split thành rows phôi" khi cần track.

**Phân tích:**
- A đơn giản nhưng mất ngữ nghĩa phôi per line — kỹ sư §2 user feedback đặc biệt nói cần phôi cụ thể.
- B đúng business — mỗi instance phôi là 1 row độc lập.
- C linh hoạt nhưng UX phức tạp — khi nào aggregate khi nào split?

**Khuyến nghị: Option B.** Allow multiple rows per material_code. Unique key = `(sheet_id, id)` không phải `(sheet_id, material_code)`. Optional FK `component_line_id` (Q2) làm rõ row nào cho line nào. UI hiển thị group by material_code khi cần xem tổng.

**Default:** Option B (multiple rows, có FK component_line_id optional).

---

### Q7. Material row có cần linked với `purchase_order_line` (đã đặt PO line nào)?

**Bối cảnh:** status=ORDERED → cần biết PO line nào. Hiện tại có table `purchase_order_line`.

- **Option A (V1: Không link, chỉ lưu PO code text):** field `purchase_order_code VARCHAR(64)` lưu "ĐH-04518". Không FK. KISS V1.
- **Option B (V1: FK):** `purchase_order_line_id UUID FK NULLABLE`. Phase 7 implement đầy đủ link.
- **Option C (Hybrid):** field text + optional FK. Khi PO line hệ thống có sẵn, link FK; nếu manual nhập "ĐH-04518" cũ chưa migrate → text only.

**Khuyến nghị: Option A cho Sprint 6, Option B cho Sprint 7+.** Hiện tại PO module chưa hoàn thiện flow "tạo PO từ material row". Phase 6 chỉ lưu text + status. Phase 7 khi làm "PR-from-BOM bulk-create" (đã có trong roadmap addendum) thì link FK.

**Default:** Option A (text only, defer FK Sprint 7).

---

### Q8. Sheet CUSTOM — markdown content trong metadata jsonb hay structured?

**Bối cảnh:** Sheet CUSTOM cho user note đặc tả khách, hướng dẫn lắp ráp, ảnh CAD ref...

- **Option A (jsonb metadata):** `bom_sheet.metadata = {"kind":"CUSTOM","content":"# Markdown\n\n...","attachments":[]}`. Không bảng mới.
- **Option B (Structured table):** `bom_sheet_custom_block` riêng — mỗi block là 1 row (text/image/table). Notion-like.
- **Option C (Defer):** chưa làm CUSTOM trong Sprint 6, defer Sprint 8+ khi user có request cụ thể.

**Khuyến nghị: Option A cho V1.** Markdown trong jsonb đủ dùng. UI WYSIWYG markdown editor (toast-ui hoặc react-markdown). File attachment: lưu URL Cloudinary trong metadata. Phase 8+ làm Option B nếu user cần block-level.

**Default:** Option A. UI render markdown read-only mặc định, edit bằng nút "Edit content".

---

## 5. Schema delta đề xuất

### 5.1. `0028_rename_sheet_kinds.sql` — Rename enum value (theo Q1 Option A)

```sql
-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0028
--   Rename bom_sheet_kind: MATERIAL_REF → MATERIAL, PROCESS_REF → PROCESS
-- ----------------------------------------------------------------------------
-- Lý do: lật quyết định Q-B brainstorm 2026-04-25. MATERIAL/PROCESS sheet
-- không còn chỉ là REF (filter master) mà chứa rows per-BOM (giá deal,
-- phôi, status). Rename cho semantic chuẩn.
--
-- PG ≥10 hỗ trợ ALTER TYPE RENAME VALUE. Idempotent guard qua DO block.
-- Production hiện chưa có sheet kind=MATERIAL_REF/PROCESS_REF nào (chỉ
-- 8 PROJECT). Migration không touch dữ liệu.
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §4 Q1
-- ============================================================================

SET search_path TO app, public;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum
             WHERE enumtypid = 'app.bom_sheet_kind'::regtype
             AND enumlabel = 'MATERIAL_REF') THEN
    ALTER TYPE app.bom_sheet_kind RENAME VALUE 'MATERIAL_REF' TO 'MATERIAL';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_enum
             WHERE enumtypid = 'app.bom_sheet_kind'::regtype
             AND enumlabel = 'PROCESS_REF') THEN
    ALTER TYPE app.bom_sheet_kind RENAME VALUE 'PROCESS_REF' TO 'PROCESS';
  END IF;
END $$;

DO $$
DECLARE v_labels TEXT;
BEGIN
  SELECT string_agg(enumlabel, ',' ORDER BY enumsortorder) INTO v_labels
  FROM pg_enum WHERE enumtypid = 'app.bom_sheet_kind'::regtype;
  RAISE NOTICE '[0028] bom_sheet_kind values now: %', v_labels;
END $$;
```

**Rollback:**
```sql
ALTER TYPE app.bom_sheet_kind RENAME VALUE 'MATERIAL' TO 'MATERIAL_REF';
ALTER TYPE app.bom_sheet_kind RENAME VALUE 'PROCESS' TO 'PROCESS_REF';
```

**Risk:** code TS dùng enum value cũ (`"MATERIAL_REF"`) sẽ break runtime nếu deploy migration trước code. Phải deploy code update enum cùng lúc — Drizzle generate types từ DB, redeploy app sau migration.

---

### 5.2. `0029_bom_sheet_material_row.sql` — Bảng material rows per-BOM

```sql
-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0029
--   bom_sheet_material_row: rows vật liệu per-BOM (giá deal, phôi, status)
-- ----------------------------------------------------------------------------
-- Mỗi BOM có sheet MATERIAL chứa N rows. Reference master qua material_code
-- (soft FK), nhưng có data riêng: price_per_kg deal project, blank_size phôi
-- cụ thể, status mua hàng, qty thực tế, supplier dự kiến.
--
-- Optional component_line_id link tới bom_line (Q2 Option A).
-- 5-state status enum riêng (Q4 Option A).
-- Allow multiple rows per material_code (Q6 Option B).
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §3 X1
-- ============================================================================

SET search_path TO app, public;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'material_row_status') THEN
    CREATE TYPE app.material_row_status AS ENUM (
      'PLANNED',    -- Đã lên kế hoạch, chưa đặt
      'ORDERED',    -- Đã tạo PO, chờ giao
      'DELIVERED',  -- NCC đã giao về kho
      'QC_PASS',    -- QC kiểm tra OK, sẵn sàng dùng
      'CANCELLED'   -- Hủy (đổi vật liệu, sai quy cách)
    );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS app.bom_sheet_material_row (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id           UUID NOT NULL REFERENCES app.bom_sheet(id) ON DELETE CASCADE,
  -- Soft FK tới material_master.code (không enforce hard FK để tránh block khi
  -- user nhập vật liệu chưa có trong master — admin sẽ thêm vào master sau).
  material_code      VARCHAR(64),
  -- Override tên nếu khác master (rare case khách yêu cầu tên riêng trên quote).
  name_override      VARCHAR(255),
  -- Optional link tới bom_line cụ thể (Q2: NULL = vật liệu chung, NOT NULL = phôi cho line).
  component_line_id  UUID REFERENCES app.bom_line(id) ON DELETE SET NULL,
  -- Giá deal cho project này (snapshot từ master tại thời điểm import — Q5).
  price_per_kg       NUMERIC(18,2),
  qty_kg             NUMERIC(18,4),
  -- Phôi: { l_mm, w_mm, t_mm, shape, qty_pcs } hoặc { freeText: "Tôn 30x152x60" }
  blank_size         JSONB NOT NULL DEFAULT '{}'::jsonb,
  supplier_code      VARCHAR(64),  -- NCC dự kiến (text, không FK supplier)
  status             app.material_row_status NOT NULL DEFAULT 'PLANNED',
  -- Q7 Option A: text PO code, không FK PO line (defer Sprint 7).
  purchase_order_code VARCHAR(64),
  notes              TEXT,
  position           INT NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by         UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bom_sheet_material_row_sheet_pos_idx
  ON app.bom_sheet_material_row (sheet_id, position);
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_material_code_idx
  ON app.bom_sheet_material_row (material_code);
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_status_idx
  ON app.bom_sheet_material_row (status);
CREATE INDEX IF NOT EXISTS bom_sheet_material_row_component_line_idx
  ON app.bom_sheet_material_row (component_line_id) WHERE component_line_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS tg_bom_sheet_material_row_touch ON app.bom_sheet_material_row;
    CREATE TRIGGER tg_bom_sheet_material_row_touch
      BEFORE UPDATE ON app.bom_sheet_material_row
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE app.bom_sheet_material_row IS
  'V2.0 Sprint 6 FIX — rows vật liệu per-BOM. Reference master_material qua material_code (soft FK), data per-BOM (price deal, phôi, status, qty).';

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM app.bom_sheet_material_row;
  RAISE NOTICE '[0029] bom_sheet_material_row created, rows=%', v_count;
END $$;
```

**Rollback:**
```sql
DROP TABLE IF EXISTS app.bom_sheet_material_row;
DROP TYPE IF EXISTS app.material_row_status;
```

**Idempotent:** `IF NOT EXISTS` guards đảm bảo chạy lại an toàn.

---

### 5.3. `0030_bom_sheet_process_row.sql` — Bảng process rows per-BOM

```sql
-- ============================================================================
-- V2.0 Phase 2 Sprint 6 FIX — Migration 0030
--   bom_sheet_process_row: rows quy trình per-BOM (giờ ước tính, đơn giá, trạm)
-- ----------------------------------------------------------------------------
-- Tương tự material_row nhưng cho quy trình gia công.
-- Refs: plans/redesign-v3/sprint-6-fix-material-per-bom.md §3 X1
-- ============================================================================

SET search_path TO app, public;

CREATE TABLE IF NOT EXISTS app.bom_sheet_process_row (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sheet_id        UUID NOT NULL REFERENCES app.bom_sheet(id) ON DELETE CASCADE,
  process_code    VARCHAR(64),
  name_override   VARCHAR(255),
  component_line_id UUID REFERENCES app.bom_line(id) ON DELETE SET NULL,
  -- Giờ ước tính cho project này (vd R01 cần 18h MCT).
  hours_estimated NUMERIC(8,2),
  -- Đơn giá deal: VND/giờ hoặc VND/cm2 (theo pricing_unit).
  price_per_unit  NUMERIC(18,2),
  pricing_unit    VARCHAR(16) NOT NULL DEFAULT 'HOUR',  -- HOUR / CM2 / OTHER (theo process_master.pricing_unit)
  -- Trạm thực hiện (T1, T2, EXTERNAL...). Không FK production_station — text linh hoạt.
  station_code    VARCHAR(64),
  notes           TEXT,
  position        INT NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by      UUID REFERENCES app.user_account(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS bom_sheet_process_row_sheet_pos_idx
  ON app.bom_sheet_process_row (sheet_id, position);
CREATE INDEX IF NOT EXISTS bom_sheet_process_row_process_code_idx
  ON app.bom_sheet_process_row (process_code);
CREATE INDEX IF NOT EXISTS bom_sheet_process_row_component_line_idx
  ON app.bom_sheet_process_row (component_line_id) WHERE component_line_id IS NOT NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'tg_touch_updated_at') THEN
    DROP TRIGGER IF EXISTS tg_bom_sheet_process_row_touch ON app.bom_sheet_process_row;
    CREATE TRIGGER tg_bom_sheet_process_row_touch
      BEFORE UPDATE ON app.bom_sheet_process_row
      FOR EACH ROW EXECUTE FUNCTION tg_touch_updated_at();
  END IF;
END $$;

COMMENT ON TABLE app.bom_sheet_process_row IS
  'V2.0 Sprint 6 FIX — rows quy trình per-BOM. Reference process_master qua process_code (soft FK), data per-BOM (hours, price, station).';

DO $$
DECLARE v_count INT;
BEGIN
  SELECT COUNT(*) INTO v_count FROM app.bom_sheet_process_row;
  RAISE NOTICE '[0030] bom_sheet_process_row created, rows=%', v_count;
END $$;
```

**Rollback:** `DROP TABLE IF EXISTS app.bom_sheet_process_row;`

---

### 5.4. (Optional) `0031_bom_line_link_to_material_row.sql` — DEFER Sprint 7

Nếu Q2 Option A chọn link `bom_sheet_material_row.component_line_id`, đã đủ. Không cần migration ngược chiều `bom_line → material_row`.

**Skip Sprint 6.** Chỉ làm khi user yêu cầu navigate ngược "từ line xem material rows liên quan" — query JOIN qua `component_line_id` đã đáp ứng.

---

## 6. Importer V2 multi-sheet flow (revised)

### 6.1. Pseudocode upload "Bản chính thức"

```typescript
// apps/web/src/server/services/bomImportCommit.ts (refactor)

async function commitMultiSheetImport(parseResult: BomParseResult, userId: string) {
  return await db.transaction(async (tx) => {
    // 1. Tạo BOM List
    const [bomList] = await tx.insert(bomTemplate).values({
      code: gen('BOM-'),
      name: parseResult.fileTitle ?? 'BOM List mới',
      // ... other defaults
    }).returning();

    // 2. Sheet 1+2 PROJECT → tạo bom_sheet kind=PROJECT + bom_lines
    const projectSheets = parseResult.sheets.filter(s => classifyOfficialSheet(s) === 'PROJECT');
    for (const [idx, projSheet] of projectSheets.entries()) {
      const [sheet] = await tx.insert(bomSheet).values({
        templateId: bomList.id,
        name: projSheet.sheetName,
        kind: 'PROJECT',
        position: idx + 1,
        metadata: { sourceSheetName: projSheet.sheetName, titleRow: projSheet.topTitle },
      }).returning();

      // Insert lines linked sheet_id
      for (const [lineIdx, row] of projSheet.rows.entries()) {
        await tx.insert(bomLine).values({
          templateId: bomList.id,
          sheetId: sheet.id,
          position: lineIdx + 1,
          // ... other fields from row
        });
      }
    }

    // 3. Sheet 3 Material&Process → tạo 2 sheet (MATERIAL + PROCESS)
    const masterSheet = parseResult.sheets.find(s => classifyOfficialSheet(s) === 'MASTER_MATERIAL_PROCESS');
    if (masterSheet) {
      // 3a. Upsert material_master (idempotent — không override price hiện tại)
      for (const matRow of masterSheet.materialRows) {
        await tx.insert(materialMaster).values({
          code: matRow.code,
          nameEn: matRow.nameEn,
          nameVn: matRow.nameVn,
          category: matRow.category,
          pricePerKg: matRow.pricePerKg,
          // ... 
        }).onConflictDoNothing(); // GIỮ master cũ nếu code đã tồn tại
      }

      // 3b. Upsert process_master tương tự
      // ...

      // 3c. Tạo sheet MATERIAL với rows auto-populate (Q3 Option A)
      const [matSheet] = await tx.insert(bomSheet).values({
        templateId: bomList.id,
        name: 'Vật liệu',
        kind: 'MATERIAL',
        position: projectSheets.length + 1,
        metadata: { autoPopulatedFrom: masterSheet.sheetName },
      }).returning();

      // Extract distinct material codes used in PROJECT sheet lines (Sub Category column)
      const usedMaterialCodes = new Set<string>();
      for (const projSheet of projectSheets) {
        for (const row of projSheet.rows) {
          if (row.subCategory && /^[A-Z0-9_]+$/.test(row.subCategory.trim())) {
            usedMaterialCodes.add(row.subCategory.trim());
          }
        }
      }

      // Insert material rows per used code
      let pos = 1;
      for (const code of usedMaterialCodes) {
        const master = await tx.query.materialMaster.findFirst({ where: eq(materialMaster.code, code) });
        if (!master) continue; // Skip nếu không match master (warning UI)
        await tx.insert(bomSheetMaterialRow).values({
          sheetId: matSheet.id,
          materialCode: code,
          pricePerKg: master.pricePerKg, // Snapshot tại thời điểm import (Q5)
          qtyKg: null, // User nhập sau
          status: 'PLANNED',
          position: pos++,
          notes: 'Auto-populated from import',
        });
      }

      // 3d. Tạo sheet PROCESS tương tự
      const [procSheet] = await tx.insert(bomSheet).values({
        templateId: bomList.id,
        name: 'Quy trình',
        kind: 'PROCESS',
        position: projectSheets.length + 2,
      }).returning();

      // Auto-populate process rows: extract distinct process codes from Sub Category2 hoặc Note column
      // (Excel format có thể khác, parser detect)
      // ... tương tự material
    }

    return bomList;
  });
}
```

### 6.2. UI Wizard 4 steps

1. **Step 1 - Upload:** drop file .xlsx. Backend parse → trả `parseResult`.
2. **Step 2 - Preview:** show 3 sheet detected: 2 PROJECT + 1 MASTER. Lines count, material codes count, process codes count.
3. **Step 3 - Confirm options:**
   - [✓] Auto-populate MATERIAL rows từ used codes (default ON)
   - [✓] Auto-populate PROCESS rows (default ON)
   - [✓] Upsert master (idempotent) — không override giá hiện có
4. **Step 4 - Commit:** worker BullMQ chạy `commitMultiSheetImport` → toast success → redirect `/bom/[id]`.

### 6.3. Edge cases

- **Material code trong sheet 1 line không match master:** warning toast "Code 'XYZ' không có trong material_master. Vui lòng thêm master trước hoặc tạo row manual." Không block import.
- **Master sheet 3 không có nhưng sheet 1+2 dùng codes:** dùng master hiện có. Nếu code chưa có master → tạo row với `material_code` raw + `name_override` từ Sub Category text.
- **2 sheet PROJECT cùng tên:** rename sheet thứ 2 thêm suffix " (2)".
- **File chỉ có 1 sheet PROJECT (không có Material&Process):** vẫn import OK, sheet MATERIAL/PROCESS empty (user thêm rows manual).

---

## 7. UI mock per sheet kind (ASCII desktop)

### 7.1. Sheet PROJECT — Tree grid như BomGridPro hiện tại

```
[Tab: Z..-502653 R01 (active)]
┌──────┬──────────┬─────────────────┬──────┬─────┬──────┐
│ Pos  │ ID Num   │ Tên VN          │ Qty  │ NCC │ Note │
├──────┼──────────┼─────────────────┼──────┼─────┼──────┤
│ R01  │ ...      │ Khung chính     │  1   │ ...  │ ...  │
│  R02 │ ...      │  Tấm đỡ         │  2   │ ...  │ ...  │
│  R03 │ ...      │  Bulong M8      │  4   │ ...  │ ...  │
└──────┴──────────┴─────────────────┴──────┴─────┴──────┘
```

### 7.2. Sheet MATERIAL — Bảng material rows

```
[Tab: Vật liệu (active) · 23 rows · Tổng: 12.5kg / 1,875,000 ₫]
┌──────────┬────────────────┬────────────────────┬────────┬─────────────┬──────┬──────────┬───────┐
│ Code     │ Tên VN         │ Phôi               │ Qty kg │ Giá/kg deal │ NCC  │ Status   │ Note  │
├──────────┼────────────────┼────────────────────┼────────┼─────────────┼──────┼──────────┼───────┤
│ AL6061   │ Nhôm AL6061    │ 30×152×60mm (R09)  │ 2.4    │ 150,000 ⚠140k│ Long│ ORDERED  │ ...   │
│ AL6061   │ Nhôm AL6061    │ 20×100×40mm (R15)  │ 1.2    │ 150,000     │ Long │ PLANNED  │ ...   │
│ POM      │ POM Thường     │ Thanh φ80×500mm    │ 0.8    │ 125,000 ✓   │ Anh  │ DELIVERED│ ...   │
│ SUS304_..│ SUS304 4-10mm  │ Tấm 200×300×8mm    │ 4.0    │  85,000     │ Hoa  │ PLANNED  │ ...   │
│ ...      │ ...            │ ...                │ ...    │ ...         │ ...  │ ...      │ ...   │
└──────────┴────────────────┴────────────────────┴────────┴─────────────┴──────┴──────────┴───────┘
[+ Thêm vật liệu]    [Sync giá master cho rows lệch]    [Export CSV]
```

- Icon `⚠140k` tooltip "Master ghi 140k/kg, row này deal 150k. Click để sync."
- Icon `✓` tooltip "Khớp giá master."
- Cell Status có badge màu: PLANNED (xám) / ORDERED (vàng) / DELIVERED (xanh) / QC_PASS (xanh đậm) / CANCELLED (đỏ).
- Click row → drawer edit chi tiết (price, blank_size jsonb editor, link component_line dropdown).

### 7.3. Sheet PROCESS — Bảng process rows

```
[Tab: Quy trình (active) · 11 rows · Tổng giờ: 24.5h / 4,900,000 ₫]
┌──────────┬───────────────────────┬───────┬──────────────┬──────────┬───────┐
│ Code     │ Tên VN                │ Giờ   │ Đơn giá      │ Trạm     │ Note  │
├──────────┼───────────────────────┼───────┼──────────────┼──────────┼───────┤
│ MCT      │ Phay CNC              │ 18.0  │ 200,000/h    │ T1       │ ...   │
│ MILLING  │ Phay                  │  4.5  │ 200,000/h    │ T2       │ ...   │
│ ANODIZING│ Anode hoá             │ 1200  │ 115/cm2      │ EXTERNAL │ Long  │
│ ASSEMBLY │ Lắp ráp               │  1.0  │ 200,000/h    │ T3       │ ...   │
│ ...      │ ...                   │ ...   │ ...          │ ...      │ ...   │
└──────────┴───────────────────────┴───────┴──────────────┴──────────┴───────┘
[+ Thêm quy trình]   [Export CSV]
```

- Cột Giờ là `hours_estimated` (numeric với 1 decimal).
- Cột Đơn giá hiển thị format theo `pricing_unit` (VND/h hoặc VND/cm2).
- Row total dòng cuối auto-compute SUM.

### 7.4. Sheet CUSTOM — Markdown editor

```
[Tab: Ghi chú khách (active)]
┌────────────────────────────────────────────────────────────────────┐
│ # Yêu cầu đặc biệt khách Z0000002-502653                         │
│                                                                    │
│ - Anode màu xám bạc, không đen                                    │
│ - Đóng gói: hộp gỗ chống ẩm                                       │
│ - Giao trước 30/4/2026                                            │
│                                                                    │
│ ## Bản vẽ ref                                                     │
│ - [Drawing R01.pdf](https://...)                                  │
│ - [Anode color spec.jpg](https://...)                             │
└────────────────────────────────────────────────────────────────────┘
[Edit content]    [+ Upload attachment]
```

- Default read-only render qua react-markdown.
- Click "Edit content" → toast-ui editor (split mode markdown + preview).
- Attachments lưu URL Cloudinary, render bằng link.

---

## 8. Roadmap (≤22h vì đã có schema base)

| Subtask | Estimate | DoD verify |
|---|---|---|
| **T1 — Migration 0028 + 0029 + 0030** | 3h | `pnpm db:migrate` clean local + apply VPS staging clone. `\d app.bom_sheet_material_row` show schema đúng. Enum value `MATERIAL`/`PROCESS` exists. |
| **T2 — Schema TS Drizzle + Zod** | 2h | File mới `packages/db/src/schema/bom-sheet-material-row.ts`, `bom-sheet-process-row.ts`. Update enum trong `bom-sheet.ts`. `pnpm typecheck` PASS. |
| **T3 — Repos + API CRUD** | 4h | API `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/material-rows/route.ts` (GET list, POST add). `[rowId]/route.ts` (GET, PATCH, DELETE). Tương tự process-rows. Curl test pass. RBAC check theo BOM template permission. |
| **T4 — UI MaterialSheetView component** | 4h | `apps/web/src/components/bom/MaterialSheetView.tsx` — bảng có search/filter status/material_code, edit inline price + qty, drawer edit chi tiết blank_size + notes. Toast success/error. |
| **T5 — UI ProcessSheetView component** | 3h | `apps/web/src/components/bom/ProcessSheetView.tsx` — bảng tương tự MaterialSheetView nhưng cột khác (hours/price/station). |
| **T6 — UI BOM detail render tab content per kind** | 2h | Refactor `apps/web/src/app/(app)/bom/[id]/page.tsx` — switch theo `sheet.kind` render component đúng (BomGridPro / MaterialSheetView / ProcessSheetView / CustomSheetView). Tab transition không reload page. |
| **T7 — Importer V2 multi-sheet auto-populate** | 4h | `apps/web/src/server/services/bomImportCommit.ts` refactor theo §6.1 pseudocode. Upload file mẫu thực → tạo 1 BOM List + 4 sheets (2 PROJECT + 1 MATERIAL + 1 PROCESS) + auto-populated rows. Verify DB. |

**Total: ~22h** (đúng budget User feedback "≤22h vì đã có schema base").

**Cắt giảm nếu cần:**
- T6 có thể defer 1h nếu UI BOM detail page hiện tại đã render tab structure (chỉ cần thêm switch case).
- T7 có thể giảm 2h nếu auto-populate chỉ làm cho MATERIAL, defer PROCESS auto-populate Sprint 7.

---

## 9. Câu hỏi user trả lời (5 câu BLOCKER)

### Q-FIX-1. Auto-populate MATERIAL rows từ Sub Category column khi import? (Q3)
**Default:** **CÓ — auto-populate** (Option A). User có thể xóa/thêm sau import nếu lệch.
- Nếu KHÔNG: import xong sheet MATERIAL empty, user nhập manual ~30 phút mỗi BOM.
- Nếu Wizard preview (Option C): thêm 4h dev cho UI tick chọn rows trước commit.

### Q-FIX-2. Status flow material row — 5-state riêng (PLANNED/ORDERED/DELIVERED/QC_PASS/CANCELLED) hay sync với 10-state? (Q4)
**Default:** **5-state riêng** (Option A). Material không có "RESERVED/IN_PROGRESS/ASSEMBLED" như component line.
- Nếu sync 10-state: phải skip 5 state không liên quan, UI state machine phức tạp.

### Q-FIX-3. 1 material code có nhiều rows (R09 phôi 30×152×60 vs R15 phôi 20×100×40 đều AL6061) hay aggregate 1 row tổng? (Q6)
**Default:** **Multiple rows** (Option B). Allow N rows AL6061 trong cùng MATERIAL sheet, mỗi row có blank_size + qty riêng. Optional `component_line_id` link tới line cụ thể.
- Nếu aggregate 1 row: mất ngữ nghĩa phôi per line — user feedback §2 đặc biệt nói cần.

### Q-FIX-4. Khi master price đổi, material rows cũ snapshot giữ giá hay live-bind? (Q5)
**Default:** **Snapshot, không auto-update** (Option A). BOM = quote khách, giá đã chốt không đổi. UI có button "Sync giá master" cho user tự pick row nào sync.
- Nếu live-bind: BOM frozen sau release vẫn giữ snapshot, nhưng BOM draft lại auto-update — UX confuse.

### Q-FIX-5. Material row có FK tới `bom_line` (component_line_id) không? (Q2)
**Default:** **CÓ FK optional** (Option A). Nullable — link khi cần phôi cho line cụ thể (R09), bỏ trống khi vật liệu chung.
- Nếu KHÔNG FK: dùng free-text `notes` "phôi cho R09" — mất truy vết structured.
- Nếu BẮT BUỘC FK: user phải chọn line cho mọi vật liệu — vô lý cho material chung.

---

## 10. Rủi ro + giảm nhẹ

### 10.1. Migration 0028 rename enum break code TS chạy production
- **Risk:** code TS hiện dùng value `"MATERIAL_REF"` (xem `bom-sheet.ts` enum). Deploy migration trước code → app crash khi insert/select sheet kind.
- **Giảm nhẹ:** deploy migration + code TS update cùng lúc qua CI. Migration apply trong window deploy `docker compose up -d` (downtime ~30s OK).

### 10.2. Auto-populate tạo rows thừa
- **Risk:** Sub Category text "POM Thường" không match master code "POM" → row tạo nhưng material_code null + name_override="POM Thường".
- **Giảm nhẹ:** parser fuzzy match (lowercase + remove space + check substring). Nếu vẫn không match → tạo row với material_code raw + flag `metadata.unmatchedFromMaster=true`. UI hiển thị warning icon + suggestion "Tạo master mới?".

### 10.3. Multiple rows cùng material_code gây confuse khi xem tổng
- **Risk:** AL6061 có 3 rows (3 phôi khác nhau) — user nhìn tổng "AL6061 = ?kg" không thấy.
- **Giảm nhẹ:** UI thêm dòng aggregate group by material_code ở footer ("AL6061 tổng: 4.8kg / 720,000 ₫"). Hoặc toggle view "Group by material" / "Flat list".

### 10.4. component_line_id orphan khi xóa bom_line
- **Risk:** xóa line R09 → material_row.component_line_id null hoặc orphan?
- **Giảm nhẹ:** FK `ON DELETE SET NULL` (đã đặt). Material row vẫn tồn tại với component_line_id=NULL + notes "Line gốc R09 đã xóa" (UI auto-add).

### 10.5. Cùng material code đã có giá trong master vs giá mới import
- **Risk:** master AL6061=140k, import file mới có AL6061=145k. Auto-populate dùng giá nào?
- **Giảm nhẹ:** dùng master hiện có (140k) — `ON CONFLICT DO NOTHING` không override. Material row tạo với price=140k. Nếu user muốn dùng 145k file Excel → manual sửa row hoặc admin update master trước import.

### 10.6. Đếm cost report cross-BOM khi nhiều rows cùng code
- **Risk:** "Tổng AL6061 đã đặt tháng 4" — phải SUM(qty_kg) WHERE status=ORDERED across N rows N BOM.
- **Giảm nhẹ:** index `(material_code, status)` partial. Query view aggregate cached Redis 60s.

---

## 11. Decision matrix tóm tắt

| Decision | Default đề xuất | Lý do ngắn |
|---|---|---|
| Schema phương án | X1 — bảng riêng | Chuẩn relational, scale, audit |
| Q1 Enum rename | Option A — rename MATERIAL/PROCESS | Sạch semantic, production chưa có rows |
| Q2 component_line_id | Option A — FK optional NULLABLE | Linh hoạt: phôi line + vật liệu chung |
| Q3 Auto-populate | Option A — auto từ Sub Category | Tiết kiệm 30 phút nhập tay |
| Q4 Status enum | Option A — 5-state riêng | Match nghiệp vụ vật liệu mua |
| Q5 Live-bind giá | Option A — Snapshot không auto | BOM = quote chốt khách |
| Q6 Multiple rows | Option B — allow N rows/code | Phôi per line, user feedback §2 |
| Q7 PO link | Option A — text only V1 | Defer FK Sprint 7 |
| Q8 Custom sheet | Option A — markdown jsonb | KISS, defer block table V8 |

---

## 12. Tham chiếu code path

### 12.1. File mới Sprint 6 FIX
- `packages/db/migrations/0028_rename_sheet_kinds.sql` (mới)
- `packages/db/migrations/0029_bom_sheet_material_row.sql` (mới)
- `packages/db/migrations/0030_bom_sheet_process_row.sql` (mới)
- `packages/db/src/schema/bom-sheet-material-row.ts` (mới)
- `packages/db/src/schema/bom-sheet-process-row.ts` (mới)
- `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/material-rows/route.ts` (mới)
- `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/material-rows/[rowId]/route.ts` (mới)
- `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/process-rows/route.ts` (mới)
- `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/process-rows/[rowId]/route.ts` (mới)
- `apps/web/src/components/bom/MaterialSheetView.tsx` (mới)
- `apps/web/src/components/bom/ProcessSheetView.tsx` (mới)
- `apps/web/src/components/bom/CustomSheetView.tsx` (mới — markdown render)

### 12.2. File sửa
- `packages/db/src/schema/bom-sheet.ts` — đổi enum `MATERIAL_REF`→`MATERIAL`, `PROCESS_REF`→`PROCESS`. Update label dictionary.
- `packages/db/src/schema/index.ts` — export 2 schema mới.
- `apps/web/src/server/services/bomImportParser.ts` — extract distinct material codes từ Sub Category column (helper mới `extractUsedMaterialCodes(sheets)`).
- `apps/web/src/server/services/bomImportCommit.ts` (HOẶC tương đương) — refactor multi-sheet flow theo §6.1.
- `apps/web/src/app/(app)/bom/[id]/page.tsx` — switch sheet.kind render component đúng.

### 12.3. Test
- `apps/web/src/server/services/bomImportParser.test.ts` — thêm test case extractUsedMaterialCodes.
- `apps/web/src/components/bom/MaterialSheetView.test.tsx` (mới — Vitest) — render + edit inline.
- E2E Playwright (defer Sprint 7): import file mẫu → check 4 sheets tạo đúng + material rows count = distinct codes.

---

## 13. Kết luận

**Quyết định lật:** Q-B "MATERIAL/PROCESS chỉ là REF" sai. **Master_master vẫn giữ làm catalog tham chiếu**, **2 bảng `bom_sheet_material_row` + `bom_sheet_process_row` mới** lưu rows per-BOM với data thực (giá deal, phôi, status, qty).

**Phương án schema chốt:** **X1 — bảng riêng** (KHÔNG reuse `bom_line`, KHÔNG jsonb).

**Migration mới:** 3 file (0028 rename enum + 0029 material_row + 0030 process_row), tổng ~120 dòng SQL, idempotent.

**Effort:** ~22h theo roadmap §8.

**5 câu BLOCKER user trả lời (defaults đề xuất):**
- Q-FIX-1: Auto-populate MATERIAL? → CÓ (Option A)
- Q-FIX-2: Status enum riêng? → 5-state riêng (Option A)
- Q-FIX-3: Multiple rows per material_code? → CÓ (Option B)
- Q-FIX-4: Live-bind giá master? → KHÔNG, snapshot (Option A)
- Q-FIX-5: FK component_line_id? → CÓ optional NULLABLE (Option A)

**Khi user OK với defaults → bắt đầu T1 (migration 0028).**

---

*Brainstorm by solution-brainstormer agent — 2026-04-26.*
