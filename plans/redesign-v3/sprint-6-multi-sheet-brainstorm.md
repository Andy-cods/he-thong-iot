# Sprint 6 — Multi-sheet BOM List Brainstorm

**Ngày:** 2026-04-25
**Tác giả:** solution-brainstormer agent
**Trạng thái:** DRAFT — chờ user duyệt 5 câu §10
**Phạm vi:** kiến trúc multi-sheet cho BOM List, importer V2, UI BOM detail tab/section, schema deltas (migration 0025+)
**Liên quan:**
- Baseline đã chốt: [`brainstorm.md`](brainstorm.md) Phương án C, [`addendum-user-answers.md`](addendum-user-answers.md) 5 quyết định
- Implementation Sprint 6 cũ: [`implementation-plan.md`](implementation-plan.md) (importer V2 strict, đơn-sheet)
- Schema hiện tại: [`packages/db/src/schema/bom.ts`](../../packages/db/src/schema/bom.ts)
- Importer V1 đã có: [`apps/web/src/server/services/bomImportParser.ts`](../../apps/web/src/server/services/bomImportParser.ts) (đã có `classifyOfficialSheet`)
- File Excel mẫu: `Bản chính thức 20260324_ Z0000002-502653 Z0000002-502654_ BOM trien khai_sl 02 + 02.xlsx`

---

## 1. Tóm tắt điều hành

- **Vấn đề:** user nói "1 file Excel chính thức = 1 BOM List, có nhiều sheet trong đó" — file mẫu có 3 sheet (R01 + L01 + Material&Process). Schema hiện tại 1 `bom_template` = 1 sản phẩm flat → không map được. UI cần tab/section cho từng sheet + nút "+ Thêm sheet".
- **Hướng giải quyết:** thêm bảng `bom_sheet` lightweight (1 BOM List ↔ N sheets) + giữ nguyên `bom_template` hiện tại (template cũ tự động sinh 1 sheet PROJECT mặc định khi backfill). Material/Process vẫn dùng `material_master`/`process_master` global (đã có ở 0017), sheet MATERIAL/PROCESS chỉ là "view subset" link vào master.
- **Phương án chọn:** **Phương án D — Hybrid (`bom_sheet` chỉ cho sheet phụ, sheet PROJECT vẫn dùng `bom_template`)**, modified: cả sheet PROJECT cũng có row trong `bom_sheet` (kind=PROJECT, link `template_id`) để query đồng nhất + dễ reorder.
- **Rủi ro lớn nhất:** confusion thuật ngữ "BOM List" vs "BOM Template" với engineer cũ + complexity khi 1 file Excel có 2 sheet PROJECT khác sản phẩm (R01 vs L01) — schema phải support 2 trường hợp: (a) 1 BOM List = 1 sản phẩm = 1 sheet PROJECT, (b) 1 BOM List = nhiều sản phẩm cùng họ = N sheet PROJECT.
- **Next step:** user trả lời Q1 (R01+L01 trong 1 file = 1 hay 2 BOM List), Q2 (sheet MATERIAL store data hay reference), Q9 (re-import policy). Sau đó: code Sprint 6 ~26h theo roadmap §9.

---

## 2. Phân tích deep yêu cầu user (đặt mình vào vị trí kỹ sư xưởng)

1. **User là kỹ sư cơ khí Việt Nam, dùng Excel hằng ngày** — họ nghĩ "file Excel" trước, "database row" sau. Khi nói "BOM List" thực chất họ tưởng tượng 1 *workbook Excel* nhiều sheet. Schema phải reflect mental model đó để giảm friction.
2. **File "Bản chính thức" là single source of truth** — họ không quen tách 1 file thành nhiều BOM trong UI. Khi upload, expectation = "tao up file này lên, tao thấy nó NGUYÊN VẸN trong UI, click vào tab nào ra tab đó".
3. **Sheet 1 (R01) và Sheet 2 (L01) cùng họ máy "Băng tải DIPPING"** — R01 = bên phải, L01 = bên trái, là 2 *sản phẩm physical khác nhau* nhưng *thiết kế gốc giống nhau* (mirror). Engineer xưởng coi 2 cái là "cặp đôi" thuộc cùng 1 dự án `Z0000002-502653/654`. Tách 2 BOM riêng = mất ngữ nghĩa "cặp đôi".
4. **Sheet Material&Process là tham chiếu (lookup table), không phải data BOM** — user nhìn nó như "thư viện vật liệu/quy trình mà các sheet trên dùng tới". Nếu duplicate dữ liệu material vào mỗi BOM List, mỗi lần đổi giá phải edit nhiều chỗ → DRY violation.
5. **Khi mở BOM detail (workspace `/bom/[id]`), expectation thấy gì?** Chắc chắn KHÔNG phải 1 bảng phẳng 80 dòng (R01 + L01 trộn lẫn). Phải có tab/section per-sheet, click tab R01 thấy 41 line, click tab L01 thấy 40 line, click tab Material thấy bảng vật liệu. Giống Excel xuống dòng dưới có sheet bar.
6. **Khi có module phụ phát sinh (vd thêm sheet "Z0000002-502655 BOM packaging" sau 1 tháng)** — user mong đợi có nút "+ Thêm sheet" ngay trong BOM detail, không phải tạo BOM List mới. Tránh phân mảnh dữ liệu khi cùng 1 dự án phát sinh nhiều cụm.
7. **Khi search "Z0000002-502653" trong app** — kỳ vọng tìm ra 1 kết quả BOM List, không phải 2-3 BOM template rời rạc.
8. **Khi report tiến độ sản xuất** — sếp xưởng hỏi "dự án Z0000002-502653 đến đâu rồi?" → cần aggregate qua tất cả sheets PROJECT trong BOM List, không phải báo cáo per-template.
9. **Khi update giá vật liệu (Sheet 3 update giá AL6061 từ 140k lên 145k/kg)** — kỳ vọng 1 lần update, all BOM List dùng AL6061 tự thấy giá mới. Tức là Material/Process *PHẢI* là master toàn cục, không per-BOM copy.
10. **Khi RELEASE BOM (immutable snapshot)** — toàn bộ BOM List (cả 3 sheets) phải freeze cùng lúc. Không thể release riêng sheet R01 vì khách order cả "băng tải DIPPING cặp đôi" — không có chuyện giao R01 mà chưa có L01.

**Kết luận quan trọng:** mental model user = **Workbook (BOM List) → Sheets → Lines/Refs**. Schema phải reflect 3 cấp này, không phải 2 cấp.

---

## 3. Bốn phương án kiến trúc multi-sheet (so sánh sòng phẳng)

### Phương án A — `bom_sheet` table mới, sheet là first-class

**Mô tả:**
- Bảng mới `bom_sheet` (id, bom_template_id FK, sheet_name, sheet_kind enum, position, metadata jsonb).
- Thêm `bom_line.sheet_id` FK nullable (nullable cho data cũ).
- Mỗi sheet có thể chứa lines (PROJECT) hoặc references (MATERIAL/PROCESS) qua metadata jsonb.
- Schema: `bom_template (1) -- (N) bom_sheet (1) -- (N) bom_line`.

**Pros:**
- Schema chuẩn relational, query thẳng `WHERE sheet_id = ?`.
- Reorder sheet bằng cột `position`, drag-drop UI dễ.
- Future-proof — sheet kind mới (CUSTOM, NOTES, DRAWINGS) chỉ thêm enum.
- Index per-sheet hiệu quả khi BOM lớn (>500 lines).

**Cons:**
- Phá schema cũ — `bom_line` đã có 80+ rows production, ALTER TABLE thêm FK + backfill `sheet_id`.
- "1 BOM List = 1 sản phẩm" không còn — `bom_template` thực ra chỉ là *parent grouping*, không phải template thật. Confuse.
- Self-ref tree `bom_line.parent_line_id` giờ phải scope theo `sheet_id` → enforce constraint khó (cross-sheet parent vô lý).

**Verdict:** khả thi nhưng tham — đảo lộn nghĩa của `bom_template`.

---

### Phương án B — Parent-Child `bom_template` (sheets là child template)

**Mô tả:**
- Thêm `bom_template.parent_bom_id` FK self-ref nullable.
- File Excel R01+L01 → 1 parent template "Bản chính thức 20260324_Z0000002-502653-654" (chỉ là wrapper, không có line) + 2 child template (R01 = 1 template với 41 lines, L01 = 1 template với 40 lines).
- Sheet Material/Process: **không có template riêng** — chỉ là `parent_template.metadata.materialSheet = {...}` jsonb.

**Pros:**
- Tận dụng schema có sẵn — `bom_template` đã là 1 BOM hoàn chỉnh, chỉ thêm 1 cột FK.
- Cấu trúc tự nhiên cho user: "BOM List cha = 1 file Excel, BOM con = 1 sheet PROJECT".
- RELEASE 1 sheet cũng không sao — child template release riêng được. (Đồng thời cũng nhược: §6 user nói release toàn bộ.)
- Query hierarchy đơn giản: `WHERE parent_bom_id = ?`.

**Cons:**
- Mỗi child template phải có `code` unique → phải auto-gen "Z0000002-502653-R01" vs "Z0000002-502653-L01" → khó đẹp.
- Sheet Material/Process bị "đặc biệt hóa" — không dùng template, dùng metadata jsonb → asymmetric, code 2 path.
- Khi user "thêm sheet PROJECT mới" → tạo child template + auto-gen code. Code sinh dễ trùng nếu 2 user thao tác cùng lúc.
- BomRevision (immutable snapshot) phải snapshot cả parent + tất cả children atomically — transaction phức tạp.

**Verdict:** đẹp về schema nhưng chia code 2 path (template vs metadata) cho 2 loại sheet.

---

### Phương án C — JSONB metadata sheets[] (no schema change)

**Mô tả:**
- Không tạo bảng mới. Lưu cấu trúc sheet trong `bom_template.metadata.sheets`:
```json
{
  "sheets": [
    { "id": "uuid", "name": "Z0000002-502653 BOM triển khai", "kind": "PROJECT", "position": 1, "lineFilterTag": "R01" },
    { "id": "uuid", "name": "Z0000002-502654 BOM triển khai", "kind": "PROJECT", "position": 2, "lineFilterTag": "L01" },
    { "id": "uuid", "name": "Material&Process", "kind": "MATERIAL_PROCESS", "position": 3, "materialCodes": ["POM","AL6061",...], "processCodes": [...] }
  ]
}
```
- `bom_line.metadata.sheetId` để filter line theo sheet.

**Pros:**
- KISS tuyệt đối — không migration, không refactor.
- Linh hoạt — thay đổi cấu trúc sheets schema dễ (chỉ đổi shape jsonb).
- 1 BOM List = 1 `bom_template` rõ ràng, không phá nghĩa.

**Cons:**
- Query khó: filter line theo sheet phải `WHERE metadata->>'sheetId' = ?` — không có index hỗ trợ tốt (cần GIN expr index riêng).
- Reorder sheet = update jsonb array → race condition nếu 2 user đồng thời drag-drop.
- Validate consistency khó — sheet ID jsonb có thể orphan.
- Không scale — BOM 1000 lines × 10 sheets, query lọc qua jsonb scan nặng.
- Type safety yếu — Drizzle type cho metadata.sheets phải maintain bằng tay.

**Verdict:** quick & dirty, fit cho MVP nhưng tích nợ kỹ thuật cao. NOT recommended cho production data.

---

### Phương án D — Hybrid (bom_sheet table + giữ nguyên bom_template) **[KHUYẾN NGHỊ]**

**Mô tả:**
- Giữ nguyên `bom_template` = 1 BOM List (tên = title file Excel hoặc tên do user nhập).
- Thêm bảng `bom_sheet` (id, template_id FK, name, kind enum, position, metadata jsonb) — *mọi* sheet đều có row ở đây, kể cả sheet PROJECT.
- Thêm `bom_line.sheet_id` FK nullable → nullable để backward compat với BOM cũ (BOM cũ không có sheet → migrate tạo 1 sheet PROJECT mặc định + backfill `sheet_id`).
- Sheet kind: `PROJECT` (chứa lines), `MATERIAL_REF` (link material_master qua jsonb code list), `PROCESS_REF` (link process_master), `CUSTOM` (free-form jsonb data).
- `bom_line.parent_line_id` constraint ENFORCE cùng `sheet_id` (CHECK constraint hoặc trigger). Tree không cross-sheet.
- Material/Process master toàn cục (đã có `material_master` / `process_master` ở migration 0017). Sheet MATERIAL_REF chỉ store list code references trong `metadata.codes: string[]`, render bằng JOIN với master.

**Pros:**
- Schema đồng nhất — mọi sheet là row trong `bom_sheet`, query 1 path.
- 1 BOM List = 1 `bom_template` không đổi nghĩa cũ — lý luận với user dễ.
- Sheet PROJECT giữ self-ref tree trong `bom_line` (đã có) — không refactor logic tree.
- Sheet MATERIAL/PROCESS là *view subset* của master → DRY (cập nhật giá master 1 lần, all BOM thấy).
- Reorder sheet bằng `position` int, drag-drop frontend update batch.
- Backward compat — BOM cũ migrate tạo 1 sheet PROJECT default, lines link `sheet_id` về sheet đó.
- RELEASE atomic toàn BOM — `bom_revision.frozen_snapshot` snapshot cả `bom_sheet` + `bom_line` JSON tree.
- Material/Process master không bị duplicate per BOM — vẫn global.

**Cons:**
- Phải viết migration 0025 + 0026 + 0027 (3 file: tạo bảng + thêm FK bom_line + backfill).
- Backfill BOM cũ (khoảng dưới 50 BOM production hiện tại) — chạy script 1 lần.
- 1 query `GET /api/bom/[id]` giờ phải JOIN 3 bảng: template + sheets + lines.
- UI BOM detail phải refactor — page `/bom/[id]` hiện render flat lines, giờ render tab.

**Verdict:** **CHỌN PHƯƠNG ÁN D.** Cân bằng schema chuẩn + backward compat + DRY material master.

---

### Vì sao chọn D thay vì A?

A và D rất giống — đều có bảng `bom_sheet`. Khác biệt:
- **A:** sheet MATERIAL/PROCESS có lines luôn (sheet là chứa data, kể cả material data riêng). → duplicate data → vi phạm DRY khi cập nhật giá.
- **D:** sheet MATERIAL/PROCESS chỉ chứa **references** vào master toàn cục. → 1 nguồn dữ liệu, cập nhật 1 chỗ.

D thắng vì user nói rõ ở §2 phân tích: *"khi update giá AL6061, tất cả BOM dùng nó tự động thấy giá mới"*. Đây là yêu cầu kinh điển của master data pattern.

### Vì sao không chọn B?

B đẹp về domain (parent template = BOM List, child = sheet) nhưng 2 nhược điểm killing:
1. **Sheet MATERIAL/PROCESS bị đặc biệt hóa** — không dùng `bom_template` mà dùng `metadata` jsonb. Code 2 path xấu.
2. **Code unique chia child** — auto-gen "Z0000002-502653-R01" dễ duplicate, restoration headaches.

### Vì sao tuyệt đối không chọn C?

JSONB metadata sheets là kỹ thuật nợ tương lai. Sprint 6 quick-win nhưng sprint 8-9 sẽ khó query/index/migrate. KISS không có nghĩa là *lazy*. C là *lazy*.

---

## 4. Quyết định lớn cần chốt (Q1-Q10)

### Q1. File Excel có 2 sheet BOM project (R01+L01) — tạo 1 BOM List hay 2?

**Vấn đề:** R01 và L01 là 2 sản phẩm physical khác (mirror trái/phải) nhưng cùng dự án `Z0000002-502653/654`.

- **Lựa chọn 1 (1 BOM List, 2 sheet PROJECT bên trong):** đúng mental model user (workbook = file). 1 row `bom_template`, 2 row `bom_sheet` kind=PROJECT, ~80 lines tổng split theo sheet_id.
- **Lựa chọn 2 (2 BOM List riêng):** mỗi sản phẩm 1 BOM template riêng. Đúng nghĩa "BOM = 1 sản phẩm" cũ, nhưng phá yêu cầu user "1 file = 1 BOM List".
- **Lựa chọn 3 (Hybrid: parent BOM List + 2 child template):** Phương án B. Đẹp domain nhưng phức tạp như đã phân tích.

**Khuyến nghị: Lựa chọn 1.** Dù R01 ≠ L01 về sản phẩm, chúng cùng *project file* — engineer thực tế quản lý theo project, không theo sản phẩm. Khi sản xuất, nhận order "1 cặp băng tải" = order cả R01+L01 cùng lúc. Tách 2 BOM List = mất ngữ cảnh project. **Default nếu user không trả lời: Lựa chọn 1.**

---

### Q2. Sheet MATERIAL/PROCESS — store data trong sheet hay reference master toàn cục?

**Vấn đề:** Sheet 3 file Excel có 23 vật liệu + 11 quy trình. Nếu mỗi BOM List có copy riêng → DRY violation. Nếu chỉ reference → cần master cập nhật.

- **Lựa chọn 1 (Reference master toàn cục):** sheet MATERIAL_REF chỉ chứa `metadata.codes = ["POM","AL6061",...]`. Render UI = JOIN `material_master` lookup giá hiện tại.
- **Lựa chọn 2 (Copy data vào sheet):** sheet có rows riêng, giá tại thời điểm import. Không cập nhật khi master thay đổi.
- **Lựa chọn 3 (Hybrid: reference + override per-BOM):** mặc định reference, user có thể override giá riêng cho 1 BOM (case "khách hàng quote giá đặc biệt").

**Khuyến nghị: Lựa chọn 1 cho V1, Lựa chọn 3 cho V2.** Phase 6 KISS → reference master. Nếu user phát sinh case override (vd "BOM dự án X giá AL6061 đặc biệt") thì mới làm hybrid. **Default: Lựa chọn 1.**

---

### Q3. User add sheet mới vào BOM cũ — UI flow như nào?

**Vấn đề:** sau khi BOM List tạo từ 3 sheet, user phát sinh thêm "BOM packaging" — UI cho add sao?

- **Lựa chọn 1 (Nút "+ Thêm sheet" trong BOM detail):** click → modal chọn kind (PROJECT/MATERIAL/PROCESS/CUSTOM) → nhập tên → tạo sheet rỗng. User add lines manual hoặc upload Excel chỉ sheet đó.
- **Lựa chọn 2 (Wizard "Thêm sheet" 3 bước):** chọn loại → import Excel hoặc tạo trống → confirm. Nhiều click nhưng rõ ràng.
- **Lựa chọn 3 (Drag-drop file Excel vào BOM detail):** drop file → auto-detect là 1 sheet đơn → add vào BOM. Magic UX nhưng confuse khi file có nhiều sheet.

**Khuyến nghị: Lựa chọn 1 (button + modal đơn giản).** Wizard chỉ cần nếu sheet PROJECT (cần upload Excel). MATERIAL/PROCESS = pick codes từ master, không cần upload. CUSTOM = textarea + jsonb metadata. **Default: Lựa chọn 1.**

---

### Q4. Sheet copy/clone từ BOM khác — có cần không?

**Vấn đề:** user có thể muốn copy sheet PROJECT R01 từ BOM cũ sang BOM mới (vì 80% giống nhau).

- **Lựa chọn 1 (KHÔNG, YAGNI):** không support clone phase 1. User export Excel BOM cũ + re-import vào BOM mới.
- **Lựa chọn 2 (CÓ, dropdown "Clone từ sheet khác"):** modal pick BOM + sheet → deep copy lines + new IDs.
- **Lựa chọn 3 (CÓ, kéo-thả cross-BOM):** drag sheet tab từ BOM A sang BOM B. Magic UX nhưng dev expensive.

**Khuyến nghị: Lựa chọn 1 (KHÔNG).** YAGNI hard. User chưa nói cần. Nếu sau này user phàn nàn thì làm Lựa chọn 2 đơn giản. **Default: Lựa chọn 1.**

---

### Q5. Sheet PROJECT có self-ref tree giống `bom_lines` hiện tại không?

**Vấn đề:** schema hiện tại `bom_line.parent_line_id` cho phép tree (assembly → sub-assembly → linh kiện). Sheet PROJECT có giữ tree không?

- **Lựa chọn 1 (CÓ tree, scope per sheet):** mỗi sheet PROJECT là 1 tree riêng. CHECK constraint `parent_line_id` cùng `sheet_id`.
- **Lựa chọn 2 (Flat trong sheet, tree cross-sheet):** lines flat trong 1 sheet, tree cha-con cross sheet (sheet R01 root → sheet L01 sub-tree). Quái dị.
- **Lựa chọn 3 (Flat all):** bỏ tree, mọi line flat. Đơn giản nhưng mất feature đã có.

**Khuyến nghị: Lựa chọn 1.** Tree mỗi sheet là tự nhiên (mỗi sản phẩm có cấu trúc riêng). Lựa chọn 2 vô lý, Lựa chọn 3 phá feature cũ. **Default: Lựa chọn 1.**

---

### Q6. Khi BOM List RELEASE — tất cả sheets frozen cùng lúc?

**Vấn đề:** schema hiện tại `bom_revision` snapshot 1 template. Multi-sheet → snapshot toàn bộ?

- **Lựa chọn 1 (Atomic toàn bộ):** RELEASE freeze cả `bom_template` + `bom_sheet[]` + `bom_line[]` vào `frozen_snapshot` jsonb 1 transaction.
- **Lựa chọn 2 (Per-sheet release):** mỗi sheet PROJECT release riêng, có version riêng.
- **Lựa chọn 3 (Hybrid):** sheet PROJECT release riêng, MATERIAL/PROCESS không release (chỉ snapshot reference codes).

**Khuyến nghị: Lựa chọn 1.** Đơn giản + đúng workflow user (xuất hàng cả cặp R01+L01 cùng lúc). Lựa chọn 2 khả thi nhưng phức tạp version matrix. Lựa chọn 3 không cần — sheet MATERIAL_REF chỉ là codes, snapshot tự nhiên với template. **Default: Lựa chọn 1.**

---

### Q7. Sheet permission — ai được add/edit/delete?

**Vấn đề:** RBAC hiện tại có roles (admin/planner/operator/warehouse). Sheet level permission?

- **Lựa chọn 1 (Inherit từ BOM template):** ai edit được template = edit được tất cả sheets. KISS.
- **Lựa chọn 2 (Per-sheet permission):** role planner chỉ edit sheet PROJECT, role purchasing chỉ edit sheet MATERIAL_REF. Phức tạp.
- **Lựa chọn 3 (Per-sheet kind):** sheet kind=MATERIAL_REF read-only cho mọi role trừ admin (vì nó link master toàn cục, edit ở admin/materials).

**Khuyến nghị: Lựa chọn 3 minimal.** Sheet PROJECT/CUSTOM: ai edit template = edit. Sheet MATERIAL_REF/PROCESS_REF: read-only ở BOM detail, edit qua `/admin/materials` global. Tránh bug user edit master qua BOM rồi affect all BOM khác mà không biết. **Default: Lựa chọn 3.**

---

### Q8. Sheet position order — drag-drop reorder hay fixed?

**Vấn đề:** UI tab order — user có cần đổi thứ tự không?

- **Lựa chọn 1 (Fixed theo position int, không reorder UI):** order theo lúc import/add. KISS.
- **Lựa chọn 2 (Drag-drop reorder, batch update position):** UX đẹp, tốn dev (~3h component + API).
- **Lựa chọn 3 (Sort buttons "← →" per sheet tab):** đơn giản hơn drag-drop, vẫn cho user reorder.

**Khuyến nghị: Lựa chọn 1 cho Sprint 6, Lựa chọn 3 cho Sprint 7+.** YAGNI. Order import-time đủ dùng. Nếu user phàn nàn thì làm Lựa chọn 3 (~1h dev). **Default: Lựa chọn 1.**

---

### Q9. Excel re-import vào BOM cũ — append sheets hay replace toàn bộ?

**Vấn đề:** user re-import file Excel mới (vì đã update Note 1 bên Excel) vào BOM List cũ. 2 mode:

- **Lựa chọn 1 (Replace toàn bộ):** xóa sheets cũ + lines cũ, tạo lại từ file mới. ĐƠN GIẢN nhưng MẤT data thủ công user đã edit trên UI sau import.
- **Lựa chọn 2 (Append/merge):** detect sheets trùng tên → update; sheet mới → append; sheet bị xóa khỏi Excel → giữ lại trên UI (warning). Phức tạp nhưng an toàn.
- **Lựa chọn 3 (Wizard 3-way merge):** show diff "Excel có gì khác BOM hiện tại" → user pick từng sheet keep/replace/skip. UX tốt nhưng dev expensive.

**Khuyến nghị: Lựa chọn 1 cho Sprint 6, Lựa chọn 2 cho Sprint 7+.** Phase 6 simplest: replace toàn bộ + warning to-bự "Sẽ xóa data hiện tại, có chắc?". Để user tự dump JSON backup nếu lo. Phase sau làm merge. **Default: Lựa chọn 1.** (CẢNH BÁO: cần confirm dialog 2 lần.)

---

### Q10. Mobile — UI tab nhiều sheet trên màn nhỏ thế nào?

**Vấn đề:** đã chốt addendum: web only, không PWA mobile, có hỗ trợ tablet 768+. Tab 5+ sheet trên tablet?

- **Lựa chọn 1 (Tab horizontal scroll):** tab bar overflow-x-auto, user scroll ngang.
- **Lựa chọn 2 (Dropdown selector trên tablet):** màn <1024px → thay tab bar bằng dropdown "Đang xem: Sheet R01 ▼".
- **Lựa chọn 3 (Accordion vertical):** mọi sheet là 1 accordion section, click expand. Mất sense "tab".

**Khuyến nghị: Lựa chọn 1 cho desktop ≥1280px, Lựa chọn 2 cho tablet 768-1279px.** Hybrid responsive. Không làm Lựa chọn 3 vì phá UX desktop. **Default: Lựa chọn 1+2 hybrid.**

---

## 5. Schema deltas đề xuất (Phương án D)

### 5.1. `0025_bom_sheet.sql` — bảng sheet mới

```sql
CREATE TYPE app.bom_sheet_kind AS ENUM (
  'PROJECT', 'MATERIAL_REF', 'PROCESS_REF', 'CUSTOM'
);

CREATE TABLE app.bom_sheet (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES app.bom_template(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  kind app.bom_sheet_kind NOT NULL DEFAULT 'PROJECT',
  position INT NOT NULL DEFAULT 1,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES app.user_account(id)
);
CREATE INDEX bom_sheet_template_pos_idx ON app.bom_sheet(template_id, position);
CREATE INDEX bom_sheet_kind_idx ON app.bom_sheet(kind);
CREATE UNIQUE INDEX bom_sheet_template_name_uk ON app.bom_sheet(template_id, name);
```

**Rollback:** `DROP TABLE app.bom_sheet; DROP TYPE app.bom_sheet_kind;`

**Constraint chú ý:** unique `(template_id, name)` để tránh sheet trùng tên trong cùng BOM.

---

### 5.2. `0026_bom_line_sheet_link.sql` — link line vào sheet

```sql
ALTER TABLE app.bom_line
  ADD COLUMN sheet_id UUID REFERENCES app.bom_sheet(id) ON DELETE CASCADE;

-- Index cho query lines per sheet
CREATE INDEX bom_line_sheet_idx ON app.bom_line(sheet_id, position);

-- CHECK constraint: parent_line_id phải cùng sheet_id (deferred via trigger)
CREATE OR REPLACE FUNCTION app.bom_line_check_parent_sheet()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.parent_line_id IS NOT NULL AND NEW.sheet_id IS NOT NULL THEN
    IF (SELECT sheet_id FROM app.bom_line WHERE id = NEW.parent_line_id)
       IS DISTINCT FROM NEW.sheet_id THEN
      RAISE EXCEPTION 'parent_line_id phải cùng sheet_id (cross-sheet tree không hợp lệ)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER bom_line_check_parent_sheet_trg
  BEFORE INSERT OR UPDATE ON app.bom_line
  FOR EACH ROW EXECUTE FUNCTION app.bom_line_check_parent_sheet();
```

**Rollback:**
```sql
DROP TRIGGER bom_line_check_parent_sheet_trg ON app.bom_line;
DROP FUNCTION app.bom_line_check_parent_sheet;
DROP INDEX bom_line_sheet_idx;
ALTER TABLE app.bom_line DROP COLUMN sheet_id;
```

**`sheet_id` nullable** ban đầu để backfill — sau migration 0027 sẽ NOT NULL.

---

### 5.3. `0027_bom_sheet_backfill.sql` — backfill BOM cũ

```sql
-- Tạo 1 sheet PROJECT default cho mỗi BOM template hiện có
INSERT INTO app.bom_sheet (template_id, name, kind, position, metadata)
SELECT
  id,
  COALESCE(name, code) || ' (sheet mặc định)',
  'PROJECT'::app.bom_sheet_kind,
  1,
  '{"backfilledFrom": "v1-implicit"}'::jsonb
FROM app.bom_template
WHERE id NOT IN (SELECT template_id FROM app.bom_sheet);

-- Backfill bom_line.sheet_id = sheet PROJECT default của template tương ứng
UPDATE app.bom_line bl
SET sheet_id = bs.id
FROM app.bom_sheet bs
WHERE bs.template_id = bl.template_id
  AND bs.kind = 'PROJECT'
  AND bs.position = 1
  AND bl.sheet_id IS NULL;

-- Verify zero null
DO $$
DECLARE null_count INT;
BEGIN
  SELECT COUNT(*) INTO null_count FROM app.bom_line WHERE sheet_id IS NULL;
  IF null_count > 0 THEN
    RAISE EXCEPTION 'Backfill failed: % bom_line rows have null sheet_id', null_count;
  END IF;
END $$;

-- Set NOT NULL sau khi backfill
ALTER TABLE app.bom_line ALTER COLUMN sheet_id SET NOT NULL;
```

**Rollback:** không rollback được (data đã merge). Phải restore từ backup `pg_dump` trước migration.

---

### 5.4. `0028_bom_template_rename_to_list.sql` — (OPTIONAL, defer Sprint 7)

Đổi tên bảng `bom_template` → `bom_list` để đồng nhất terminology UI. KHÔNG làm Sprint 6 vì:
- Risk cao (rename table affect mọi query/code).
- UI label đổi "BOM List" qua i18n đã đủ — DB column tên cũ OK.
- Defer Sprint 7+ khi có budget refactor.

---

## 6. Importer V2 multi-sheet flow

### 6.1. Pseudocode upload + parse

```
POST /api/bom/imports/upload
  body: multipart file .xlsx
  →
1. Parse file qua existing `bomImportParser.ts` → BomParseResult
2. classifyOfficialSheet() đã có → trả OfficialFormatInfo {
     sheetKinds: { "Z0000002-502653 BOM triển khai": "PROJECT",
                   "Z0000002-502654 BOM triển kh ai": "PROJECT",
                   "Material&Process": "MASTER_MATERIAL_PROCESS" }
   }
3. Trả response {
     fileHash, sheets: [...],  // 3 sheets
     officialFormat: {...},
     suggestedBomList: {
       code: "Z0000002-502653-654",  // gen từ tên file
       name: "Bản chính thức 20260324_Z0000002-502653+654 BOM triển khai",
       sheetsToCreate: [
         { name: "Z0000002-502653 BOM triển khai", kind: "PROJECT", position: 1, lineCount: 41 },
         { name: "Z0000002-502654 BOM triển khai", kind: "PROJECT", position: 2, lineCount: 40 },
         { name: "Material&Process", kind: "MATERIAL_REF + PROCESS_REF (split)", position: 3,
           materialCodes: [...23 codes], processCodes: [...11 codes] }
       ]
     }
   }
```

### 6.2. UI Wizard step

```
Step 1: Upload file
  → PreviewBox: hiển thị 3 sheet detect được
  → BomList preview: code (editable), name (editable)

Step 2: Confirm sheets to import
  → Checkbox per sheet: [✓] Z0000002-502653 (41 lines, PROJECT)
                        [✓] Z0000002-502654 (40 lines, PROJECT)
                        [✓] Material&Process → split thành 2 sheet REF
  → Material codes preview: list 23 codes, mark "đã có trong master" (green) / "sẽ tạo mới" (blue)
  → Process codes preview: tương tự

Step 3: Map columns (tự động skip nếu format chính thức)
  → Đã có ở Sprint 5 importer V1 (autoMapHeaders)

Step 4: Commit
  → POST /api/bom/imports/commit
    body: { fileHash, bomListCode, bomListName, sheetsConfig: [...], importToken }
  → Trả jobId BullMQ
  → Worker:
    - INSERT bom_template (name = bomListName, code = bomListCode)
    - For each sheet config:
      - kind=PROJECT: INSERT bom_sheet, INSERT bom_lines (link sheet_id)
      - kind=MATERIAL_REF: INSERT bom_sheet, metadata.codes = [...]
        + UPSERT material_master (insert nếu code mới)
      - kind=PROCESS_REF: tương tự
    - COMMIT transaction
```

### 6.3. Edge cases

- **Sheet PROJECT thứ 3+:** chỉ pop-up confirm "File có 3 sheet PROJECT, tạo 3 sheet trong BOM List?".
- **Sheet không classify được (UNKNOWN):** mặc định kind=CUSTOM, lưu raw rows vào `metadata.rawRows[]`.
- **File không có sheet PROJECT nào:** reject upload với error "File không có sheet BOM hợp lệ. Yêu cầu ≥1 sheet PROJECT format chính thức."
- **Material code trong sheet trùng với code đã có giá khác trong master:** prompt "AL6061 đã có giá 140k/kg trong master. File Excel có 145k/kg. Action: [Giữ master] [Update master] [Skip]".

---

## 7. UI BOM detail multi-sheet (mock 3 viewport)

### 7.1. Desktop ≥1280px — Tab horizontal trên đầu

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Tổng quan / BOM / Z0000002-502653 BOM triển khai                  [...] │
├──────────────────────────────────────────────────────────────────────────┤
│ Z0000002-502653+654 BOM triển khai · 81 dòng · DRAFT          [Release] │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┬────────────────┬───────────────┬─────────┐           │
│ │ Z..-502653 R01 │ Z..-502654 L01 │ Material&Proc │  + Add  │           │
│ │ ▼ active       │                │               │  sheet  │           │
│ └────────────────┴────────────────┴───────────────┴─────────┘           │
├──────────────────────────────────────────────────────────────────────────┤
│ [Sheet R01 - 41 lines]                                                  │
│  ┌──┬──────┬─────────────────┬──────┬────────┬──────────────────────┐   │
│  │  │ R01  │ Standard Number │ Qty  │ NCC    │ Note 1/2/3           │   │
│  │  │ R02  │ ...             │ ...  │ ...    │ ...                  │   │
│  │  │ R03  │ ...             │ ...  │ ...    │ ...                  │   │
│  └──┴──────┴─────────────────┴──────┴────────┴──────────────────────┘   │
└──────────────────────────────────────────────────────────────────────────┘
```

### 7.2. Tablet 768-1279px — Dropdown selector

```
┌────────────────────────────────────────────────┐
│ Tổng quan / BOM / Z..-502653                  │
├────────────────────────────────────────────────┤
│ Z..-502653+654 · 81 dòng · DRAFT  [Release]   │
├────────────────────────────────────────────────┤
│ Đang xem: ┌──────────────────────────┐         │
│           │ Sheet R01 (41 lines)  ▼  │         │
│           └──────────────────────────┘         │
│                                                │
│ [Bảng grid 41 lines theo sheet R01]           │
│  ...                                           │
└────────────────────────────────────────────────┘
```

Dropdown options:
- Sheet Z0000002-502653 R01 (41 lines)
- Sheet Z0000002-502654 L01 (40 lines)
- Sheet Material (23 vật liệu)
- Sheet Process (11 quy trình)
- ──── Hành động ────
- + Thêm sheet mới

### 7.3. Empty state — BOM List 1 sheet duy nhất

```
┌──────────────────────────────────────────────────────────────────────────┐
│ BOM-12345 · Băng tải đơn · 25 dòng · DRAFT             [Release]        │
├──────────────────────────────────────────────────────────────────────────┤
│ ┌────────────────┬─────────┐                                             │
│ │ Sheet mặc định │  + Add  │                                             │
│ │ ▼ active       │  sheet  │                                             │
│ └────────────────┴─────────┘                                             │
├──────────────────────────────────────────────────────────────────────────┤
│ [Bảng 25 lines như cũ — không tab confusion]                             │
└──────────────────────────────────────────────────────────────────────────┘
```

Nếu chỉ 1 sheet, có thể auto-collapse tab bar (chỉ show "+ Thêm sheet" button).

### 7.4. Sheet MATERIAL_REF detail view

```
┌──────────────────────────────────────────────────────────────────────────┐
│ [Sheet Material - 23 vật liệu (link master)]                  [Edit]    │
│                                                                          │
│ ┌──────┬────────────────┬────────────┬──────────────┬─────────────┐    │
│ │ Code │ Name VN        │ Giá hiện   │ Đơn vị       │ Cập nhật    │    │
│ ├──────┼────────────────┼────────────┼──────────────┼─────────────┤    │
│ │ POM  │ Nhựa POM       │ 95.000 ₫   │ kg           │ 2026-04-20  │    │
│ │ AL6061│ Nhôm AL6061   │ 140.000 ₫  │ kg           │ 2026-04-20  │    │
│ │ ...  │ ...            │ ...        │ ...          │ ...         │    │
│ └──────┴────────────────┴────────────┴──────────────┴─────────────┘    │
│                                                                          │
│ [+ Thêm vật liệu] (chuyển sang /admin/materials nếu có quyền)           │
└──────────────────────────────────────────────────────────────────────────┘
```

Read-only view ở BOM detail. Click "+" → redirect `/admin/materials` (nếu role admin) hoặc disabled với tooltip.

---

## 8. Rủi ro + giảm nhẹ

### 8.1. Backfill BOM cũ fail giữa chừng

**Risk:** migration 0027 chạy `INSERT bom_sheet + UPDATE bom_line.sheet_id` — nếu lỗi giữa, BOM cũ không có sheet.

**Giảm nhẹ:**
- Migration trong 1 transaction `BEGIN/COMMIT`.
- DO block verify zero null trước khi `SET NOT NULL` — nếu fail, transaction rollback.
- `pg_dump` backup trước migration (đã chuẩn từ V1).
- Test trên staging clone DB production trước (1 lần dry-run).

### 8.2. Performance khi BOM lớn 10+ sheets

**Risk:** BOM List có 10 sheets × 100 lines = 1000 lines. Page load `GET /api/bom/[id]` JOIN 3 bảng + render tab.

**Giảm nhẹ:**
- API trả structure: `{ template, sheets: [{...meta, lineCount}], lines: [] empty by default }`.
- Lines lazy load per sheet click: `GET /api/bom/[id]/sheets/[sheetId]/lines`.
- Index `bom_line_sheet_idx (sheet_id, position)` — query per-sheet O(log n).
- Cache Redis 60s cho BOM detail meta.

### 8.3. User confusion: BOM List vs BOM Template vs Sheet

**Risk:** thuật ngữ chồng lấn — UI nói "BOM List", DB nói `bom_template`, code cũ nói "BOM Template".

**Giảm nhẹ:**
- UI label: dùng "BOM List" everywhere. Không expose từ "Template" cho user.
- Dev docs (CLAUDE.md): note rõ "DB `bom_template` = UI `BOM List` = file Excel chính thức (1 file = 1 row template)".
- Bom code prefix vẫn `BOM-XXX` để compatibility.
- Migration 0028 rename table chỉ làm khi user phàn nàn (hiện tại defer).

### 8.4. Backward compat với importer V1

**Risk:** importer V1 (Sprint 5) đã tạo BOM cũ flat (1 template = 1 sheet implicit). Sau migration 0027, BOM cũ vẫn hiển thị OK?

**Giảm nhẹ:**
- Backfill 0027 tạo 1 sheet "PROJECT default" cho mỗi BOM cũ.
- UI BOM detail render 1 sheet như empty state §7.3.
- Importer V1 deprecate flag — nếu có code call đến, redirect sang V2 hoặc warning.

### 8.5. Re-import replace gây mất data user edit thủ công

**Risk:** Q9 chốt Lựa chọn 1 (replace toàn bộ). User edit Note 3 trên UI sau import → re-import file Excel → mất Note 3.

**Giảm nhẹ:**
- Confirm dialog 2 lần với text rõ ràng: "Hành động này XÓA tất cả sheets + lines hiện tại của BOM này. Data Note user đã ghi tay sẽ MẤT. Xác nhận?"
- Audit log entry cho re-import (lưu `metadata.replacedFrom = oldSnapshotJson` để forensic).
- Sprint 7+ làm Lựa chọn 2 (merge mode).

### 8.6. Material code trùng khi import nhưng giá khác master

**Risk:** Excel có "AL6061 145k/kg" mà master có "AL6061 140k/kg" → confusion update master hay không.

**Giảm nhẹ:**
- UI prompt rõ: 3 nút action [Giữ master] [Update master] [Skip].
- Default action = Skip (không update master tự động).
- Audit log nếu user pick Update master.
- Sprint 7+ thêm "override per-BOM price" (Q2 Lựa chọn 3) nếu user phàn nàn.

### 8.7. Sheet kind enum thay đổi tương lai

**Risk:** thêm sheet kind mới (VD `DRAWING_REF` cho bản vẽ CAD, `INSPECTION` cho QC) — phải migrate enum.

**Giảm nhẹ:**
- Postgres `ALTER TYPE ADD VALUE` không lock table (PG ≥9.1).
- Document expected future kinds trong CLAUDE.md.
- UI render fallback cho unknown kind = "CUSTOM" view.

---

## 9. Roadmap Sprint 6 (≤30h)

| Task | Deliverable | Estimate | DoD verify |
|---|---|---|---|
| **P2-S6-T1** | Migration 0025 (`bom_sheet` table + enum) + 0026 (`bom_line.sheet_id` FK + trigger) — local apply, drizzle generate types | 4h | `pnpm db:migrate` chạy clean, `bom_sheet` table có schema đúng, `bom_line.sheet_id` nullable |
| **P2-S6-T2** | Migration 0027 (backfill default sheet) + script verify | 3h | Sau migrate, mỗi `bom_template` có ≥1 sheet, mọi `bom_line` có `sheet_id` not null. Test trên staging clone |
| **P2-S6-T3** | Schema TypeScript Drizzle (`packages/db/src/schema/bom-sheet.ts` + update `bom.ts`) + relations | 2h | `pnpm typecheck` pass, query `db.select().from(bomSheet)` work |
| **P2-S6-T4** | API `GET /api/bom/[id]` refactor — trả structure `{template, sheets[], lines[]}` (lines per sheet lazy) | 4h | Curl test trả đủ 3 sheets từ BOM mẫu, response time <200ms |
| **P2-S6-T5** | API `GET /api/bom/[id]/sheets/[sheetId]/lines` — lazy load lines per sheet, paginated | 3h | Curl test pagination 20/page work, index hit verify qua EXPLAIN |
| **P2-S6-T6** | API `POST /api/bom/[id]/sheets` (add sheet) + `PATCH /api/bom/[id]/sheets/[sheetId]` (rename/reorder) + `DELETE` (chỉ kind != PROJECT, hoặc PROJECT khi >1 sheet) | 4h | Test cả 4 method, RBAC enforce qua middleware |
| **P2-S6-T7** | UI BOM detail page refactor — tab bar component + dropdown tablet, render per-sheet | 5h | Visual test desktop+tablet, navigate giữa tabs OK, empty state khi 1 sheet |
| **P2-S6-T8** | UI sheet MATERIAL_REF view — JOIN `material_master`, read-only table, link `/admin/materials` | 2h | Render đúng 23 materials, click "Edit" redirect đúng |
| **P2-S6-T9** | Importer V2 update — parse + classify đã có (`bomImportParser.ts`), chỉ thêm worker commit logic multi-sheet | 4h | Import file mẫu thực → tạo 1 BOM List + 3 sheets + 81 lines. Verify DB |
| **P2-S6-T10** | E2E test multi-sheet: Playwright import file → mở BOM detail → click qua 3 tabs → verify count | 2h | Test pass CI |
| **P2-S6-T11** | UAT 1 ngày + hotfix | 2h | User import file thực → no error 24h |

**Tổng: ~35h** — VƯỢT BUDGET 30h. Cắt giảm:
- Bỏ T6 PATCH/DELETE (defer Sprint 7) — chỉ giữ POST add sheet → -2h
- Bỏ T10 E2E (chỉ unit test thủ công) → -2h
- T11 UAT giảm còn 1h smoke test → -1h

**→ Sprint 6 thực tế: ~30h.** PATCH/DELETE/E2E full vào Sprint 7.

---

## 10. Câu hỏi cần user trả lời (5 câu BLOCKER)

### Q-A. File Excel R01+L01 trong 1 file → 1 BOM List hay 2?

**Default đề xuất:** **1 BOM List với 2 sheet PROJECT** (theo §4 Q1 — đúng mental model "file = BOM List").

Nếu user nói tách 2 BOM riêng:
- Phải làm thêm UI "tạo 2 BOM List từ 1 file" (wizard step pick split).
- Schema vẫn dùng được (mỗi BOM 1 sheet PROJECT).
- Mất ngữ nghĩa "cặp đôi" — BOM L01 và R01 không link với nhau, sếp report khó.

### Q-B. Sheet MATERIAL/PROCESS — reference master toàn cục hay copy data per BOM?

**Default đề xuất:** **Reference master toàn cục** (theo §4 Q2 — DRY).

Nếu user nói copy per BOM:
- Schema sheet MATERIAL_REF đổi thành MATERIAL_DATA — chứa rows riêng.
- Mỗi BOM có giá vật liệu riêng (case khách quote đặc biệt).
- Phải làm thêm UI "sync với master" + warning lệch giá.

### Q-C. Re-import file Excel cũ — replace hết hay merge?

**Default đề xuất:** **Replace hết với confirm 2 lần** (theo §4 Q9).

Nếu user nói merge:
- Phải làm 3-way diff UI (~6h thêm) — defer Sprint 7.
- Giữ Sprint 6 chỉ replace + audit log backup vào jsonb.

### Q-D. Sheet position order — fixed hay reorder?

**Default đề xuất:** **Fixed order theo position lúc import** (theo §4 Q8).

Nếu user nói reorder:
- Thêm component drag-drop hoặc 2 nút "← →" (~2h).
- API PATCH batch update position.
- Defer Sprint 7 nếu user OK.

### Q-E. Khi user xóa sheet PROJECT cuối cùng (BOM List còn 0 sheet) — chặn hay cho?

**Default đề xuất:** **Chặn xóa sheet PROJECT cuối cùng** — BOM List phải có ≥1 sheet PROJECT.

Nếu user xóa hết, BOM List rỗng vô nghĩa. UI disable nút xóa với tooltip "BOM List phải có ít nhất 1 sheet PROJECT. Tạo sheet mới trước khi xóa sheet này."

---

## 11. Phụ lục — Tham chiếu code/path

### 11.1. File cần sửa Sprint 6

**Migrations mới:**
- `packages/db/migrations/0025_bom_sheet.sql` (mới)
- `packages/db/migrations/0026_bom_line_sheet_link.sql` (mới)
- `packages/db/migrations/0027_bom_sheet_backfill.sql` (mới)

**Schema TS:**
- `packages/db/src/schema/bom-sheet.ts` (mới)
- `packages/db/src/schema/bom.ts` (sửa — thêm `sheetId` field vào `bomLine`)
- `packages/db/src/schema/index.ts` (sửa — export bom-sheet)

**API routes:**
- `apps/web/src/app/api/bom/[id]/route.ts` (sửa — return structure mới)
- `apps/web/src/app/api/bom/[id]/sheets/route.ts` (mới — POST add sheet, GET list)
- `apps/web/src/app/api/bom/[id]/sheets/[sheetId]/lines/route.ts` (mới — GET lines per sheet)

**UI components:**
- `apps/web/src/app/(app)/bom/[id]/page.tsx` (sửa — tab bar)
- `apps/web/src/components/bom/SheetTabBar.tsx` (mới — tab horizontal + dropdown responsive)
- `apps/web/src/components/bom/SheetMaterialRefView.tsx` (mới — render JOIN master)
- `apps/web/src/components/bom/AddSheetModal.tsx` (mới — modal + form)

**Worker logic:**
- `apps/web/src/server/services/bomImportParser.ts` (giữ — đã có classifyOfficialSheet)
- `apps/web/src/server/services/bomImportCommit.ts` (sửa — tạo bom_sheet rows + link bom_line)

### 11.2. Schema diff TypeScript

```typescript
// packages/db/src/schema/bom-sheet.ts (MỚI)
export const bomSheetKindEnum = pgEnum("bom_sheet_kind", [
  "PROJECT", "MATERIAL_REF", "PROCESS_REF", "CUSTOM"
]);

export const bomSheet = appSchema.table("bom_sheet", {
  id: uuid("id").defaultRandom().primaryKey(),
  templateId: uuid("template_id").notNull().references(() => bomTemplate.id, { onDelete: "cascade" }),
  name: varchar("name", { length: 255 }).notNull(),
  kind: bomSheetKindEnum("kind").notNull().default("PROJECT"),
  position: integer("position").notNull().default(1),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  templatePosIdx: index("bom_sheet_template_pos_idx").on(t.templateId, t.position),
  kindIdx: index("bom_sheet_kind_idx").on(t.kind),
  templateNameUk: uniqueIndex("bom_sheet_template_name_uk").on(t.templateId, t.name),
}));

// packages/db/src/schema/bom.ts (SỬA — thêm sheetId vào bomLine)
sheetId: uuid("sheet_id").notNull().references(() => bomSheet.id, { onDelete: "cascade" }),
```

### 11.3. Estimate vs budget

| Phase | Estimate cũ | Estimate mới | Note |
|---|---|---|---|
| Sprint 6 cũ (importer V2 simple) | 18h | — | replaced |
| Sprint 6 mới (multi-sheet) | — | 30h | +12h cho schema + UI tabs |
| Tổng V2.0 cũ | 244h | 256h | +12h |

Vẫn dưới budget 320h.

---

## 12. Decision matrix tóm tắt

| Decision | Lựa chọn chốt | Lý do ngắn |
|---|---|---|
| Phương án multi-sheet | D - Hybrid `bom_sheet` table | Schema chuẩn + DRY material master + backward compat |
| 1 file = 1 BOM List? | Yes (default) | Mental model user |
| Material/Process scope | Master toàn cục, sheet là REF | DRY, single source of truth |
| Sheet kind enum | PROJECT, MATERIAL_REF, PROCESS_REF, CUSTOM | 4 loại đủ V1 |
| Re-import policy | Replace toàn bộ + confirm 2 lần | KISS V1, merge defer V7 |
| Sheet permission | Inherit BOM template + REF read-only | Đơn giản + an toàn master |
| Sheet reorder | Fixed position import-time | YAGNI V1 |
| Sheet PROJECT cuối — xóa? | Chặn (BOM phải có ≥1 PROJECT) | Tránh BOM rỗng |
| Mobile UI | Desktop tabs + tablet dropdown hybrid | Responsive |
| Backfill BOM cũ | 1 sheet PROJECT default per template | Backward compat |
| RELEASE atomic | Toàn bộ sheets cùng lúc | Đúng workflow user |

---

## 13. Kết luận

**Phương án chốt:** **D — Hybrid `bom_sheet` table + `bom_line.sheet_id` FK + master data REF.**

**Risk ranking (cao → thấp):**
1. Backfill BOM cũ fail giữa chừng (giảm nhẹ: transaction + dry-run staging).
2. User confusion thuật ngữ BOM List vs Template (giảm nhẹ: UI label đồng nhất + docs).
3. Re-import replace mất data user edit (giảm nhẹ: confirm 2 lần + audit log backup).

**5 câu BLOCKER user trả lời:**
- Q-A: 1 hay 2 BOM List? (default: 1)
- Q-B: Material reference hay copy? (default: reference)
- Q-C: Re-import replace hay merge? (default: replace)
- Q-D: Sheet reorder UI? (default: fixed)
- Q-E: Xóa sheet PROJECT cuối? (default: chặn)

**Khi user OK với defaults → bắt đầu Sprint 6 ngay với P2-S6-T1 (migration 0025).**

---

*Brainstorm by solution-brainstormer agent — 2026-04-25.*
