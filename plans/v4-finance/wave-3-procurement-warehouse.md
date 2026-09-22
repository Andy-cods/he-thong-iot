# Kế hoạch V4 — ĐỢT 3 (Thu mua & Kho & Sản xuất): Kiểm tồn Kho, Mã tham chiếu, PO cập nhật giá + notify, Phiếu giao hàng/BBGH, WO → PR NVL

- **Mã task đề xuất:** `TASK-20260922-003`
- **Ngày lập:** 2026-09-22
- **Người lập:** planner (Claude)
- **Bản chất:** MỞ RỘNG nghiệp vụ Thu mua/Kho/Sản xuất trên nền RBAC + notification đã dựng ở Đợt 1. KHÔNG viết phân hệ Tài chính kế toán (đó là Đợt 2 — xem `plans/v4-finance/research-finance-oss.md`, hiện chưa có plan Wave 2 chi tiết).
- **Phụ thuộc bắt buộc:** `plans/v4-finance/wave-1-foundation.md` (Đợt 1) phải DEPLOY XONG trước khi code Đợt 3, cụ thể cần các thay đổi sau đã có trên `main`:
  - RbacEntity `deliveryNote` (Phase 2 Đợt 1) — Đợt 3 dùng luôn, KHÔNG tự tạo lại.
  - `warehouse.pr` có `approve` (Phase 3 Đợt 1, Phương án A — `warehouse` + `planner` cùng duyệt dept-approve song song).
  - Event type union `NotificationEventType` đã mở rộng chỗ trống cho `DELIVERY_NOTE_CREATED`/`DELIVERY_NOTE_CONFIRMED` (Phase 4 Đợt 1 chỉ khai báo, Đợt 3 mới thật sự dùng).
  - **QUAN TRỌNG:** tại thời điểm lập kế hoạch này (2026-09-22), Đợt 1 mới ở trạng thái DRAFT — `packages/shared/src/rbac/matrix.ts` hiện tại (đã đọc trực tiếp) **CHƯA CÓ** role `shareholder`, entity `finance`/`deliveryNote`, và `warehouse.pr` **CHƯA CÓ** `approve` (dòng 124 hiện là `pr: ["create", "read"]`). Người thực thi Đợt 3 PHẢI grep lại `matrix.ts` ngay trước khi code để xác nhận Đợt 1 đã merge đúng như plan, không suy đoán.
- **Migration dự kiến:** `packages/db/migrations/0056_*.sql` trở đi — **CHƯA CHỐT SỐ THẬT**. Tại thời điểm khảo sát, `ls packages/db/migrations | sort` cho thấy file mới nhất là `0053_item_type_catchup.sql` / `0053_sales_order_priority.sql` (trùng số 0053 — xem `DRIFT-NOTES.md` mục 5 + Đợt 1 R-1); Đợt 1 dự kiến chiếm `0054` + `0055`. Vậy Đợt 3 dự kiến bắt đầu từ **`0056`**, nhưng đây CHỈ LÀ DỰ ĐOÁN — **BẮT BUỘC chạy `ls packages/db/migrations | sort` lại lần nữa ngay trước khi tạo file** (Đợt 2 Tài chính có thể đã chiếm một phần dải số nếu code trước Đợt 3), tuyệt đối không copy số này vào code mà không verify lại.
- **Trạng thái:** ĐÃ CHỐT một phần — xem mục 0 (user đã trả lời, GHI ĐÈ đề xuất mặc định của planner).

---

## 0. ⚠️ QUYẾT ĐỊNH CHÍNH THỨC CỦA USER (2026-09-22) — GHI ĐÈ MỌI ĐỀ XUẤT BÊN DƯỚI

Các câu trả lời trực tiếp của user. Khi mâu thuẫn với QĐ-1..QĐ-9 ở mục 2, **mục này thắng**.

| # | Câu hỏi | User chốt | Ảnh hưởng tới plan |
|---|---|---|---|
| U-1 | Kho có phải nhập/xác nhận số tồn từng dòng khi duyệt không? | **KHÔNG** — chỉ cần bấm duyệt. Hệ thống hiện số tồn tham khảo là đủ. | **GHI ĐÈ QĐ-1 + QĐ-2 + QĐ-3.** Phase A thu hẹp mạnh: KHÔNG thêm cột `warehouseVerifiedQty`/`warehouseSupplyDecision`, KHÔNG bắt buộc nhập liệu khi duyệt, KHÔNG có logic skip dòng "cấp từ kho" khi convert PO. Chỉ cần đảm bảo UI duyệt của Kho HIỂN THỊ RÕ tồn kho hiện tại từng dòng để Kho nhìn rồi quyết. Effort Phase A giảm từ ~2.5 ngày xuống ~0.5 ngày. |
| U-2 | "Chỉ Giám đốc duyệt phiếu xuất hàng" áp dụng cho loại xuất nào? | **CHỈ xuất bán / giao khách** (và trả hàng NCC). Xuất vật tư cho sản xuất nội bộ **giữ nguyên Kho tự duyệt**. | **XÁC NHẬN QĐ-5 theo hướng phân biệt `reason`.** Guard mới: `reason IN ('sales','return')` → bắt buộc admin; các `reason` khác (`production`/`manual`/`other`) → giữ nguyên warehouse+admin như hiện tại. Lý do: tránh làm tắc xuất vật tư hàng ngày cho xưởng. |
| U-3 | Cho sửa đơn giá PO sau khi đã gửi NCC không? | **KHÔNG** — chỉ sửa khi chưa gửi (giữ nguyên hành vi hiện tại). | **GHI ĐÈ QĐ-7 + QĐ-8.** Phase C BỎ phần mở rộng sửa giá khi `SENT`, BỎ luôn phần lịch sử giá (không cần vì chỉ sửa được lúc DRAFT — audit_event hiện có đã đủ). Phase C chỉ còn: (a) notify Kho khi giá đổi lúc DRAFT, (b) bổ sung notify approve/reject PO còn thiếu, (c) trả kết quả PO về Thu mua + Kho + người đề xuất gốc. Effort giảm đáng kể. |
| U-4 | Mẫu BBGH gồm những trường gì? | **Claude tự thiết kế 1 form**, user sẽ vào sửa sau. | **GHI ĐÈ QĐ-4** — không còn là gate chặn. Cứ code Phase D với bộ trường đề xuất ở mục 7.2, thiết kế sao cho DỄ SỬA (trường khai báo tập trung, không hardcode rải rác trong PDF template). |

**Bối cảnh Đợt 1 đã DEPLOY (commit `17b8f79`)** — khác một điểm so với giả định của plan này:
- `warehouse.pr` đã có `approve`, và **`planner` ĐÃ BỊ GỠ `approve:pr`** (user chọn "đổi cứng ngay", KHÔNG giữ song song như Phương án A mà plan Đợt 1 đề xuất). Route `dept-approve` hiện chỉ cho `admin | warehouse`.
- Role `shareholder`, entity `finance` + `deliveryNote` đã có trên `main`.
- Migration `0054` đã dùng. Đợt 2/3 tiếp từ `0055` — vẫn phải `ls` verify trước khi tạo file.

---

## 1. Tóm tắt & Mục tiêu

Đợt 3 phủ 3 mảng nghiệp vụ theo yêu cầu user (A/B/C nguyên văn):

| Phase | Nội dung | Tương ứng yêu cầu |
|---|---|---|
| Phase A | Kho xác nhận tồn kho THỰC TẾ trước khi Trưởng bộ phận (Kho) duyệt PR bước 2 | A.2 |
| Phase B | Mã tham chiếu duy nhất cho từng dòng vật tư đề xuất | A.1 |
| Phase C | PO: cập nhật đơn giá có lịch sử + thông báo Kho; bổ sung notify approve/reject PO còn thiếu; trả kết quả PO về Thu mua/Kho/người đề xuất | A.3, A.4 |
| Phase D | Phiếu giao hàng + BBGH: đề xuất xuất hàng → CHỈ admin duyệt → giao hàng → sinh BBGH → notify Thu mua + Kho | B.5, B.6 |
| Phase E | WO → tạo PR mua NVL thiếu, phân quyền chỉ cho thao tác này | C.7 |
| Phase F | Rà soát trùng lặp `warehouse_issue_request` vs `material_request` — đề xuất hướng, KHÔNG bắt buộc làm ngay | — |

**Thứ tự phụ thuộc bắt buộc:** Phase B (mã tham chiếu) nên làm trước hoặc cùng Phase A vì Phase A cần hiển thị đúng dòng theo mã duy nhất khi Kho xác nhận tồn từng dòng. Phase C độc lập, có thể làm song song. Phase D độc lập hoàn toàn (bảng mới), nhưng **BẮT BUỘC user duyệt danh sách trường BBGH (mục 2, QĐ-4) trước khi code** — đây là phase rủi ro cao nhất về việc phải sửa lại nếu đoán sai mẫu. Phase E phụ thuộc Phase B (PR tạo từ WO cũng cần mã tham chiếu). Phase F là phân tích, không có code bắt buộc.

**Đề xuất thứ tự thực thi:** B → A → C → E → D (D làm sau cùng vì cần thời gian chờ user duyệt mẫu BBGH song song với lúc code B/A/C/E) → F (document, không cần chờ).

---

## 2. Quyết định cần chốt trước khi code (đề xuất của planner — user duyệt hoặc chỉnh)

| # | Vấn đề | Đề xuất | Rủi ro nếu bỏ qua |
|---|---|---|---|
| QĐ-1 | Bước Kho kiểm tồn: **gộp vào dept-approve** hay **tách bước riêng** `WAREHOUSE_CHECKED`? | **GỘP** — khi Kho bấm "Duyệt bước 2" (dept-approve), form bắt buộc xác nhận/nhập số tồn thực tế cho từng dòng trước khi API cho phép submit duyệt. KHÔNG thêm giá trị mới vào `approval_step` (đang là VARCHAR+CHECK, không phải PG enum — thêm giá trị enum thì dễ nhưng thêm 1 BƯỚC MỚI vào state machine sẽ phá vỡ toàn bộ chuỗi UI/route/worker/test đang giả định 6 bước cố định DRAFT→SUBMITTED→DEPT_APPROVED→DIRECTOR_APPROVED→CONVERTED→DONE). Lý do chọn gộp: (i) đúng yêu cầu user "yêu cầu KHO KIỂM TRA LƯỢNG TỒN **trước khi** Trưởng bộ phận duyệt" — vì Trưởng bộ phận CHÍNH LÀ Kho (đã chốt ở Đợt 1), "trước khi duyệt" và "lúc duyệt" là CÙNG một hành động của cùng một người, tách bước riêng chỉ tạo thêm 1 cú click vô nghĩa cho cùng 1 vai trò; (ii) không cần sửa `approval_step`, không ảnh hưởng phiếu đang chạy dở, không phải sửa lại worker/notify/PDF timeline; (iii) rủi ro thấp nhất, đúng KISS. | Nếu chọn tách bước: phải thêm `approval_step` mới, sửa `pr_approval_step_idx`, sửa toàn bộ nơi filter theo step (worker `prReminderScan`, PDF timeline, list PR theo tab), effort tăng gấp ~2-3 lần Phase A mà không thêm giá trị nghiệp vụ tương xứng vì cùng 1 người (Kho) làm cả 2 việc |
| QĐ-2 | Cột lưu "tồn thực tế Kho xác nhận" — thêm ở đâu? | Thêm 2 cột mới vào `purchase_request_line`: `warehouseVerifiedQty` (numeric, tồn Kho xác nhận thực tế tại thời điểm duyệt) và `warehouseSupplyDecision` (varchar(16), giá trị `BUY` / `SUPPLY_FROM_STOCK` — Kho đề xuất cấp từ tồn kho thay vì mua). KHÔNG tái dùng `onHandSnapshot` hiện có vì đó là auto-fill LÚC TẠO phiếu (có thể đã lệch xa thời điểm duyệt vài ngày/tuần) — cần 1 cột riêng thể hiện xác nhận CHỦ ĐỘNG của Kho tại lúc duyệt, khác bản chất với snapshot tham khảo cũ. | Nếu tái dùng `onHandSnapshot`: mất khả năng phân biệt "số lúc tạo phiếu" (auto, không ai chịu trách nhiệm) với "số Kho xác nhận lúc duyệt" (có accountability — ai bấm duyệt phải chịu trách nhiệm số này đúng) — mất dấu vết audit quan trọng nếu sau này tồn kho sai lệch dẫn tới mua thừa/thiếu |
| QĐ-3 | `warehouseSupplyDecision = SUPPLY_FROM_STOCK` thì dòng đó xử lý tiếp thế nào — có tự động loại khỏi PO khi convert không? | **CÓ, tự động loại** — sửa `createPOFromPR`/`convertPRtoPOs` (cần đọc thêm hàm chuyển đổi khi code, tên hàm chính xác là `createPOFromPR` theo grep ở mục 2 header repo) để SKIP các line có `warehouseSupplyDecision = 'SUPPLY_FROM_STOCK'` khi group theo supplier tạo PO — dòng này coi như "đã xử lý xong bằng cấp phát nội bộ", không sinh PO. Cần notify riêng cho người đề xuất biết dòng này được cấp từ kho thay vì mua (dùng chung `notifyPRDeptApproved`, thêm message liệt kê SL dòng supply-from-stock). | Nếu không skip: PO vẫn sinh ra cho vật tư mà Kho đã nói "có sẵn, không cần mua" → mua trùng, tồn kho ảo tăng, lãng phí ngân sách — đúng vấn đề mà yêu cầu A.2 muốn giải quyết bị vô hiệu hoá |
| QĐ-4 | **Trường trên mẫu BBGH — CẦN USER XÁC NHẬN TRƯỚC KHI CODE PHASE D.** File mẫu `po 2112520763, 2112522933 roller (2000, 700) -/BBGH.pdf` và `DeliveryNote 2112520763, 2112522933 roller (2000, 700).pdf` CÓ tồn tại trong repo (đã `ls` xác nhận) nhưng agent (Claude) KHÔNG đọc được nội dung PDF trong phiên lập kế hoạch này. | Đề xuất danh sách trường theo chuẩn Biên bản giao hàng (BBGH) phổ biến ở xưởng cơ khí VN — user duyệt nhanh Có/Sửa/Bỏ từng dòng trước khi Phase D code (xem bảng chi tiết mục 7.2). | Nếu code trước khi user duyệt mẫu: rủi ro làm sai form, phải sửa lại PDF template (bài học từ `poPdf.tsx`/`ycvtPdf.tsx`/`dnvtPdf.tsx` đã qua nhiều lần chỉnh sửa theo mẫu thực tế công ty) — lãng phí effort |
| QĐ-5 | Guard `warehouse/issue-request/[id]/approve` và `reject`: đổi từ `requireCan(req, "transition", "po")` (sai entity, hiện cho phép MỌI role có `po.transition` — tức warehouse + purchaser + planner) sang thế nào? | Theo đúng yêu cầu user mục B.5 "CHỈ GIÁM ĐỐC (admin) được nhận và phê duyệt" — đổi guard thành `requireCan(req, "approve", "deliveryNote")` (entity mới, xem Đợt 1 Phase 2 — chỉ `admin` được cấp `approve` trên `deliveryNote` theo bảng quyền Đợt 1 mục 5.2) **CỘNG THÊM** check cứng `guard.session.roles.includes("admin")` bắt buộc (giống pattern `dept-approve`/`director-approve` đã dùng ở PR) để tránh trường hợp tương lai ai đó vô tình cấp thêm quyền `approve:deliveryNote` cho role khác trong matrix mà quên siết lại route — đây là chỗ NGHIỆP VỤ YÊU CẦU CỨNG "chỉ Giám đốc", không nên chỉ dựa vào RBAC matrix mềm. | Nếu chỉ đổi entity RBAC mà không hard-check role admin: matrix thay đổi trong tương lai (VD ai đó thêm `warehouse: {deliveryNote: ["approve"]}` cho mục đích khác) sẽ vô tình mở lại quyền duyệt cho Kho, vi phạm yêu cầu nghiệp vụ "CHỈ Giám đốc" |
| QĐ-6 | 2 cơ chế `warehouse_issue_request` (Kho duyệt xuất) và `material_request` (Kho pick/ready/deliver) đang trùng chức năng — Đợt 3 có gộp không? | **KHÔNG gộp ở Đợt 3** — xem phân tích đầy đủ Phase F. Đề xuất: `warehouse_issue_request` là luồng "CẦN DUYỆT trước khi xuất" (có APPROVED/REJECTED), còn `material_request` là luồng "CHẮC CHẮN xuất, chỉ cần Kho pick hàng" (không có bước reject) — hai luồng phục vụ 2 tình huống nghiệp vụ khác nhau (xuất có kiểm soát rủi ro cao/thấp), giữ nguyên cả 2, chỉ bổ sung BBGH cho luồng `warehouse_issue_request` (vì đó là luồng có "đề xuất xuất hàng" khớp với yêu cầu B.5). Đề xuất dài hạn (KHÔNG làm ở Đợt 3): cân nhắc hợp nhất ở Wave 4+ nếu người dùng thực tế báo nhầm lẫn giữa 2 luồng khi thao tác. | Nếu gộp vội ở Đợt 3: rủi ro phá 2 luồng đang chạy ổn định trong production (V3.3 và V3.7.9), effort lớn không nằm trong scope yêu cầu user lần này |
| QĐ-7 | PO cho phép sửa giá ở trạng thái nào? Hiện tại chỉ `DRAFT` sửa full, `SENT` chỉ sửa `expectedEta`/`actualDeliveryDate`/`notes` (KHÔNG sửa giá) — theo `apps/web/src/app/api/purchase-orders/[id]/route.ts` dòng 62-64 (`HEADER_ONLY_FIELDS`). | **MỞ RỘNG:** cho phép sửa `unitPrice`/`taxRate` từng dòng khi PO ở trạng thái `SENT` (thêm 2 field vào diện cho phép sửa khi SENT, tách riêng khỏi "sửa cấu trúc dòng" — KHÔNG cho thêm/xoá dòng hay đổi `itemId`/`orderedQty` khi SENT, CHỈ cho sửa giá của dòng đã có). Lý do nghiệp vụ: NCC báo giá lại sau khi đã gửi PO là tình huống thực tế phổ biến (biến động giá thép/vật tư), chặn cứng ở DRAFT sẽ buộc user phải huỷ PO cũ tạo PO mới — mất số PO, mất lịch sử, message NCC nhầm PO. **KHÔNG cho sửa giá khi `PARTIAL`/`RECEIVED`/`CLOSED`/`CANCELLED`** (đã có hàng về, đổi giá sẽ sai lệch với `inbound_receipt` đã post). | Nếu giữ nguyên chỉ DRAFT: user gặp NCC báo giá lại sau khi gửi (rất phổ biến ở xưởng cơ khí — giá thép biến động) sẽ không có cách hợp lệ cập nhật, phải quay về thao tác thủ công ngoài hệ thống → dữ liệu PO trong app sai lệch với thực tế thanh toán |
| QĐ-8 | Lưu lịch sử thay đổi giá PO bằng bảng mới hay tái dùng `audit_event`? | **Tái dùng `audit_event`** (đã có `beforeJson`/`afterJson`/`objectType`/`objectId`, đủ để trả lời "ai đổi giá dòng nào từ bao nhiêu thành bao nhiêu lúc nào" qua query `WHERE object_type='purchase_order' AND object_id=X ORDER BY occurred_at`). KHÔNG tạo bảng `po_price_history` riêng — vi phạm YAGNI vì chưa có yêu cầu hiển thị "lịch sử giá" thành 1 màn hình riêng biệt, chỉ cần truy vết được khi có tranh chấp. Nếu Wave sau cần UI "lịch sử giá" riêng biệt dễ nhìn hơn audit trail chung, tạo bảng lúc đó. | Tạo bảng riêng khi chưa cần: thêm 1 bảng + migration + repo + không ai dùng ngay, over-engineer |
| QĐ-9 | Mã tham chiếu (`reference_code`) hiện tại có unique constraint không, và định dạng đề xuất là gì? | Đã kiểm tra `packages/db/src/schema/procurement.ts` dòng 265: `referenceCode: varchar("reference_code", { length: 128 })` — **KHÔNG có `uniqueIndex`/`unique()` nào trên cột này**, và ý nghĩa hiện tại của field là "link/PO cũ/sản phẩm NCC" (free-text tham chiếu ngoài, theo comment dòng 264 "Mã tham chiếu (link/PO cũ/sản phẩm NCC)") — **KHÁC HẲN** ý nghĩa "mã ID duy nhất định danh dòng vật tư" mà yêu cầu A.1 muốn. Đề xuất: **KHÔNG tái dùng `reference_code`** (giữ nguyên ý nghĩa cũ, đang có dữ liệu thật, đổi ý nghĩa giữa chừng gây nhầm lẫn) — thêm cột MỚI `lineRefCode` (tên đề xuất, user có thể đổi) tự sinh server-side theo định dạng `PRL-{YYMM}-{seq5}` (VD `PRL-2609-00042`), dùng `genDocNo()` có sẵn (`_docNumber.ts`) với `pad: 5` (ước lượng số dòng PR toàn hệ thống 1 tháng không vượt 99999), UNIQUE INDEX toàn bảng (không theo tháng) để đảm bảo "duy nhất" đúng nghĩa đen theo yêu cầu — sinh tự động khi INSERT dòng PR (mọi form_type MRF/DNVT), KHÔNG cho user tự nhập/sửa. | Nếu tái dùng `reference_code`: 2 khái niệm (link ngoài tham khảo vs mã định danh nội bộ duy nhất) bị trộn lẫn trong 1 cột, dữ liệu cũ đã nhập (link/PO cũ) sẽ lẫn với mã hệ thống mới sinh, không đảm bảo unique vì cột cũ cho phép trùng/null |

---

## 3. Bối cảnh kỹ thuật đã khảo sát (đọc trực tiếp file thật, ngày 2026-09-22)

| Phát hiện | Chứng cứ (file:dòng) | Hệ quả cho Đợt 3 |
|---|---|---|
| `purchase_request_line` đã có `referenceCode` (varchar 128, KHÔNG unique), `onHandSnapshot` (numeric, auto-fill lúc tạo — chỉ tham khảo), `estimatedUnitPrice`, `approvedQty` | `packages/db/src/schema/procurement.ts:260-269` | Phase B thêm cột mới thay vì sửa `referenceCode`; Phase A thêm 2 cột mới cạnh `onHandSnapshot` |
| `approval_step` là `varchar(24)` + giá trị tự do (không phải PG enum) — xác nhận qua comment dòng 81 "V3.7.69 YCVT — workflow 3-step" và schema không có `pgEnum` cho field này | `packages/db/src/schema/procurement.ts:81` | Phase A KHÔNG cần `ALTER TYPE`, chỉ cần `ALTER TABLE ADD COLUMN` cho 2 cột line mới — migration đơn giản, rollback an toàn (`DROP COLUMN`) |
| Route `dept-approve` hiện guard cứng `admin` OR `planner` (dòng 31-40) — **CHƯA phản ánh đổi sang `warehouse`** vì Đợt 1 chưa merge tại thời điểm khảo sát | `apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts:31-40` | Phase A PHẢI sửa route này thêm bước validate tồn kho — nhưng vị trí sửa phụ thuộc Đợt 1 đã đổi guard hay chưa; nếu code Đợt 3 trước khi Đợt 1 merge, phải merge conflict cả 2 cùng file — khuyến cáo deploy Đợt 1 xong hẳn trước |
| `deptApprovePR()` repo là 1 câu `UPDATE ... WHERE approvalStep='SUBMITTED'` đơn giản, không có logic dòng (line-level) | `apps/web/src/server/repos/purchaseRequests.ts:664-687` | Phase A cần thêm hàm mới hoặc mở rộng `deptApprovePR` nhận thêm `lineVerifications: Array<{lineId, verifiedQty, decision}>` — cần transaction (update header + N line) |
| `purchase_order.metadata` jsonb chứa `approvalStatus` (pending/approved/rejected) — KHÔNG phải cột riêng | `packages/db/src/schema/procurement.ts:162-167` | Phase C: notify khi approve/reject đọc từ kết quả trả về của `approvePO()`/`rejectPO()`, không cần sửa schema |
| `approvePO`/`rejectPO`/`submitPOForApproval` **KHÔNG gọi bất kỳ hàm `notify*` nào** — xác nhận qua đọc trực tiếp 3 route `approve/route.ts`, `reject/route.ts`, `submit-approval/route.ts` (không có `import` từ `notifications.ts`) | `apps/web/src/app/api/purchase-orders/[id]/{approve,reject,submit-approval}/route.ts` | Đúng như user note — đây là gap thật, Phase C phải thêm 3 lệnh gọi notify mới |
| `replacePOLines()` xoá TOÀN BỘ `purchase_order_line` cũ rồi insert lại mới — KHÔNG giữ line ID cũ, KHÔNG lưu giá trị trước khi xoá | `apps/web/src/server/repos/purchaseOrders.ts:249-291` | Phase C PHẢI tự capture "before" (đọc lines cũ bằng `getPOLines()`) TRƯỚC KHI gọi `replacePOLines`/`updatePOWithLines`, rồi diff thủ công so với lines mới để ghi đúng audit "giá đổi từ X thành Y" — không thể dựa vào trigger DB vì line bị xoá-tạo lại, không phải UPDATE |
| `PATCH /api/purchase-orders/[id]` hiện chặn sửa khi `isSent` chỉ cho 3 field header (`HEADER_ONLY_FIELDS`), **body.data.lines bị bỏ qua hoàn toàn khi `isSent`** (dòng 128-137 chỉ áp dụng `if (isDraft)`) | `apps/web/src/app/api/purchase-orders/[id]/route.ts:62-64, 128-165` | Phase C (QĐ-7) phải thêm nhánh xử lý mới: khi `isSent`, cho phép body chứa `lines[].unitPrice`/`taxRate` (KHÔNG cho `itemId`/`orderedQty` đổi) — validate diff tại route trước khi gọi repo |
| `warehouse/issue-request/[id]/approve` VÀ `reject` đều dùng `requireCan(req, "transition", "po")` — SAI entity (xác nhận đúng như ghi chú user) | `apps/web/src/app/api/warehouse/issue-request/[id]/approve/route.ts:38`, `.../reject/route.ts:24` | Phase D sửa CẢ 2 route (không chỉ approve) sang entity `deliveryNote` + hard-check `admin` |
| `warehouseIssueRequest` schema hiện có `status` PENDING/APPROVED/REJECTED/COMPLETED (thực tế code nhảy thẳng PENDING→COMPLETED khi approve, không dừng ở APPROVED — xem `approve/route.ts` dòng 76-90 set `status: "COMPLETED"` trực tiếp), `picksJson`, KHÔNG có trường nào cho "phiếu giao hàng" | `packages/db/src/schema/warehouse-location.ts:65-108` | Phase D: BBGH là ENTITY MỚI hoàn toàn (`delivery_note` + `delivery_note_line`), liên kết `warehouseIssueRequestId` — KHÔNG nhồi thêm cột BBGH vào bảng `warehouse_issue_request` (tách bảng đúng chuẩn hoá, vì 1 issue request có thể có 1 BBGH duy nhất nhưng BBGH có nhiều trường riêng — chữ ký, người nhận hàng bên ngoài, biển số xe... không liên quan gì tới nghiệp vụ issue request) |
| `material_request` (V3.3) là luồng riêng biệt: PENDING→PICKING→READY→DELIVERED, không có REJECTED, không cần duyệt | `packages/db/src/schema/material-request.ts:19-24` | Phase F: xác nhận đúng đây là 2 luồng khác mục đích (issue request = có kiểm soát/duyệt; material request = luôn chấp nhận, chỉ theo dõi tiến độ pick) |
| `genDocNo()` có advisory lock chống trùng số, dùng cho mọi loại chứng từ mới | `apps/web/src/server/repos/_docNumber.ts:40-61` | Phase B (mã tham chiếu dòng PR) và Phase D (số BBGH) BẮT BUỘC dùng hàm này, không tự viết `MAX+1` |
| `writeAudit()` với `action: "UPDATE"`, `objectType`, `before`/`after` JSON — cơ chế chung toàn hệ thống | Pattern lặp lại ở mọi route đã đọc (`dept-approve`, `director-approve`, `approve` PO...) | Phase C dùng đúng cơ chế này cho lịch sử giá PO (QĐ-8), KHÔNG tạo bảng riêng |
| `notifyPOSent`/`notifyPRDeptApproved`/... đều dùng `emitToUsersWithRole(role, {...})` cho broadcast "cần hành động" (đếm badge) — pattern chuẩn từ V3.16 | `apps/web/src/server/services/notifications.ts:206-225, 380-394` | Mọi notify mới ở Phase C/D PHẢI dùng `emitToUsersWithRole`, KHÔNG dùng `emitNotification({recipientRole})` broadcast không đếm badge (trừ trường hợp cố ý như `notifyMaterialRequestDelivered`) |
| `work_order.materialRequirements` là JSONB tự do, KHÔNG có schema cố định — cần audit thực tế dữ liệu hiện có khi code Phase E để biết field nào chứa `itemId`/`shortageQty` | `packages/db/src/schema/production.ts:65` | Phase E: BẮT BUỘC bước audit đọc dữ liệu thật (query vài row `work_order.material_requirements` trên dev DB) trước khi viết logic parse, plan này KHÔNG giả định cấu trúc cụ thể |
| Pattern "tạo PR từ nguồn khác" đã có sẵn: `POST /api/purchase-requests/from-shortage` — nhận `itemIds[]`, gọi `createPRFromShortage()` aggregate `remaining_short_qty × 1.1` buffer | `apps/web/src/app/api/purchase-requests/from-shortage/route.ts` (67 dòng, đọc toàn bộ) | Phase E tái dùng pattern này 90% — route mới `from-work-order/[woId]` gọi hàm repo mới `createPRFromWorkOrder(woId, itemIds, actorId)` |
| RBAC hiện tại (đã đọc `matrix.ts` đầy đủ block `warehouse`/`purchaser`/`planner`/`operator`): `RBAC_ENTITIES` hiện có đúng **17 entity** (đếm tay: item, supplier, bomTemplate, bomRevision, salesOrder, bomSnapshot, pr, po, wo, reservation, eco, audit, user, session, inventory, report, productionBoard) — CHƯA có `finance`/`deliveryNote` (chờ Đợt 1) | `packages/shared/src/rbac/matrix.ts:188-206` | Phase D dùng entity `deliveryNote` — nếu code trước khi Đợt 1 merge, phải tự thêm entity này (trùng việc với Đợt 1) — **khuyến cáo mạnh: đợi Đợt 1 merge xong** |
| Nav hiện tại: `NavSection` có `purchasing`/`warehouse`/`engineering`/`operations` (bản đã đọc là bản GỐC trước Đợt 1 rename — Đợt 1 Phase 0 dự kiến đổi `finance→purchasing`, nhưng bản hiện tại đã sẵn tên `purchasing` rồi qua rà soát header file — cần re-verify lúc code vì có thể Đợt 1 đã áp dụng 1 phần) | `apps/web/src/lib/nav-items.ts:1-33` | Phase D cần thêm nav mới cho trang BBGH — vị trí đề xuất trong section `warehouse` (Kho) + `purchasing` (Thu mua xem) |
| Mẫu PDF thật đã có trong repo dùng để tham khảo khi thiết kế BBGH: `po 2112520763, 2112522933 roller (2000, 700) -/BBGH.pdf` VÀ `DeliveryNote 2112520763, 2112522933 roller (2000, 700).pdf` — 2 file PDF KHÁC NHAU (1 là BBGH nội bộ, 1 là Delivery Note tiếng Anh cho khách/NCC quốc tế) | Xác nhận bằng `ls` thư mục | Cần user làm rõ: BBGH và Delivery Note có phải cùng 1 khái niệm hay 2 loại chứng từ riêng? Xem câu hỏi bổ sung ở QĐ-4 mở rộng, mục 7.2 |

---

## 4. Phase A — Bước Kho kiểm tồn CHỦ ĐỘNG trước khi duyệt PR

**Effort: L (2-2.5 ngày)**

### 4.1 Thiết kế đã chốt (theo QĐ-1, QĐ-2, QĐ-3)

Gộp bước kiểm tồn vào chính hành động dept-approve của Kho — KHÔNG thêm `approval_step` mới.

### 4.2 Migration mới (số dự kiến `0056_pr_line_warehouse_check.sql` — VERIFY LẠI SỐ TRƯỚC KHI TẠO)

```sql
-- V4 Wave 3 — Kho xác nhận tồn kho thực tế cho từng dòng PR trước khi duyệt
-- bước 2 (dept-approve, do warehouse thực hiện theo Đợt 1). Nullable — dòng
-- PR cũ (đã duyệt trước khi có tính năng này) giữ NULL, không phá dữ liệu.

ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS warehouse_verified_qty NUMERIC(18,4),
  ADD COLUMN IF NOT EXISTS warehouse_supply_decision VARCHAR(16)
    CHECK (warehouse_supply_decision IN ('BUY', 'SUPPLY_FROM_STOCK'));

-- Mã tham chiếu duy nhất từng dòng (Phase B — gộp cùng migration vì cùng
-- bảng, tránh 2 lần ALTER TABLE liên tiếp không cần thiết).
ALTER TABLE app.purchase_request_line
  ADD COLUMN IF NOT EXISTS line_ref_code VARCHAR(32);

CREATE UNIQUE INDEX IF NOT EXISTS pr_line_ref_code_uk
  ON app.purchase_request_line (line_ref_code)
  WHERE line_ref_code IS NOT NULL;
```

> Lưu ý: `CREATE UNIQUE INDEX ... WHERE line_ref_code IS NOT NULL` (partial unique index) để cho phép NULL ở dòng dữ liệu cũ (trước khi backfill/trước khi tính năng deploy) mà không vi phạm unique constraint (Postgres unique index mặc định coi nhiều NULL là "không trùng nhau" nên thực ra kể cả unique index thường cũng OK với nhiều NULL — dùng `WHERE` ở đây chủ yếu để rõ ý định + tránh index phình to với dòng NULL không cần index).

### 4.3 Schema TS — `packages/db/src/schema/procurement.ts`

Thêm vào object `purchaseRequestLine` (sau `lineTotal` dòng 277, trước dấu đóng `}`, dòng 278):
```ts
/** V4 Wave 3 — Kho xác nhận tồn kho thực tế lúc duyệt dept-approve (khác onHandSnapshot auto-fill lúc tạo). */
warehouseVerifiedQty: numeric("warehouse_verified_qty", { precision: 18, scale: 4 }),
/** V4 Wave 3 — Quyết định Kho: mua mới hay cấp từ tồn kho có sẵn. */
warehouseSupplyDecision: varchar("warehouse_supply_decision", { length: 16 }),
/** V4 Wave 3 — Mã tham chiếu duy nhất tự sinh (khác reference_code free-text cũ). */
lineRefCode: varchar("line_ref_code", { length: 32 }),
```
Thêm index trong khối `(t) => ({...})` (sau `uniq` dòng 286):
```ts
lineRefCodeUk: uniqueIndex("pr_line_ref_code_uk").on(t.lineRefCode),
```
> Drizzle unique index không tự hỗ trợ partial `WHERE` qua builder chuẩn — nếu builder không hỗ trợ, giữ định nghĩa TS ở mức field thường và để migration SQL là nguồn sự thật cho partial index (giống pattern đã dùng ở các bảng khác trong repo có index phức tạp hơn field builder — audit cách `packages/db/src/schema` xử lý partial index tương tự khi code, ví dụ tìm `.where(` trong các file schema khác).

### 4.4 Sửa route `dept-approve` — thêm validate + ghi nhận xác nhận tồn

**File:** `apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts`

- Input schema mở rộng:
  ```ts
  const inputSchema = z.object({
    note: z.string().trim().max(2000).optional().nullable(),
    // V4 Wave 3 — bắt buộc khi actor có role warehouse (Kho); admin có thể bỏ qua
    // (admin bypass mọi bước theo quy ước hệ thống).
    lineChecks: z.array(z.object({
      lineId: z.string().uuid(),
      verifiedQty: z.coerce.number().min(0),
      decision: z.enum(["BUY", "SUPPLY_FROM_STOCK"]),
    })).optional(),
  });
  ```
- Logic mới trước khi gọi `deptApprovePR`:
  1. Lấy toàn bộ line của PR (`getPRLines(id)` — hàm có sẵn, audit tên chính xác khi code).
  2. Nếu actor có role `warehouse` (không phải admin thuần) → BẮT BUỘC `lineChecks` phủ đủ 100% số line (so `lineChecks.length === lines.length` và mọi `lineId` khớp) → nếu thiếu, trả `422 VALIDATION` với message "Vui lòng xác nhận tồn kho cho tất cả N dòng trước khi duyệt".
  3. Nếu actor là `admin` thuần (không có role `warehouse`) → `lineChecks` optional (admin có thể duyệt khẩn không cần qua bước kiểm tồn — giữ đường thoát khẩn cấp, tránh khoá cứng toàn hệ thống vào 1 thao tác bắt buộc).
  4. Update từng line: `warehouseVerifiedQty`, `warehouseSupplyDecision` trong CÙNG transaction với update header `approvalStep` (mở rộng `deptApprovePR` nhận thêm tham số `lineChecks`, dùng `db.transaction`).
- Sau khi duyệt: nếu có dòng `SUPPLY_FROM_STOCK`, thêm message phụ vào `notifyPRDeptApproved` (mở rộng context `PRNotifyContext` thêm field `supplyFromStockCount?: number`) để người đề xuất biết N dòng sẽ KHÔNG mua mà cấp từ kho.

### 4.5 Repo — `apps/web/src/server/repos/purchaseRequests.ts`

Mở rộng `deptApprovePR` (dòng 664-687) hoặc tạo hàm mới `deptApprovePRWithLineChecks` (khuyến nghị TÁCH hàm mới, giữ `deptApprovePR` cũ cho path admin-bypass, tránh 1 hàm quá nhiều nhánh — dễ test hơn):
```ts
export async function deptApprovePRWithLineChecks(
  id: string,
  approverId: string,
  note: string | null,
  lineChecks: Array<{ lineId: string; verifiedQty: number; decision: "BUY" | "SUPPLY_FROM_STOCK" }>,
): Promise<PurchaseRequest | null> {
  return db.transaction(async (tx) => {
    for (const lc of lineChecks) {
      await tx.update(purchaseRequestLine)
        .set({ warehouseVerifiedQty: String(lc.verifiedQty), warehouseSupplyDecision: lc.decision })
        .where(and(eq(purchaseRequestLine.id, lc.lineId), eq(purchaseRequestLine.prId, id)));
    }
    const [row] = await tx.update(purchaseRequest)
      .set({ approvalStep: "DEPT_APPROVED", deptApprovedBy: approverId, deptApprovedAt: new Date(), deptApprovalNote: note, updatedAt: new Date() })
      .where(and(eq(purchaseRequest.id, id), eq(purchaseRequest.approvalStep, "SUBMITTED")))
      .returning();
    return row ?? null;
  });
}
```

### 4.6 Convert PR → PO: skip dòng `SUPPLY_FROM_STOCK` (QĐ-3)

**File:** `apps/web/src/server/repos/purchaseOrders.ts` — hàm `createPOFromPR` (dòng 516, cần đọc đầy đủ thân hàm khi code, hiện chỉ đọc header).
- Thêm filter đầu hàm: `const lines = allLines.filter(l => l.warehouseSupplyDecision !== "SUPPLY_FROM_STOCK")`.
- Nếu SAU KHI FILTER không còn dòng nào (100% supply from stock) → trả kết quả đặc biệt "NO_PO_NEEDED" thay vì lỗi, để route xử lý set PR thẳng sang `DONE` (cần audit route `from-pr/[prId]/route.ts` xử lý case 0 PO khi code).

### 4.7 UI — form dept-approve (Kho)

**File cần audit + sửa (chưa đọc chi tiết component, xác nhận tên khi code):** trang duyệt PR phía Kho (tìm trong `apps/web/src/app/(app)/procurement/` hoặc `apps/web/src/components/engineering/PRTab.tsx` theo cách Đợt 1 đã audit) — thêm bảng inline: mỗi dòng PR hiển thị `qty đề xuất`, `onHandSnapshot` (tham khảo cũ), input `warehouseVerifiedQty`, radio `BUY`/`SUPPLY_FROM_STOCK`. Nút "Duyệt" disable tới khi đủ 100% dòng đã điền (đúng validate phía server).

### Definition of Done Phase A
- [ ] Migration chạy thành công, `\d app.purchase_request_line` xác nhận 3 cột mới (2 của Phase A + `line_ref_code` gộp Phase B).
- [ ] `pnpm --filter web test` (nếu có unit test repo `purchaseRequests`) pass, hoặc viết mới test cho `deptApprovePRWithLineChecks`.
- [ ] Test thủ công: login `bo.phan.kho` (role warehouse) → mở PR SUBMITTED có 3 dòng → bấm Duyệt KHÔNG điền đủ 3 dòng → nhận lỗi 422 đúng message.
- [ ] Điền đủ 3 dòng (2 BUY, 1 SUPPLY_FROM_STOCK) → Duyệt → 200, `approvalStep = DEPT_APPROVED`, 3 dòng có `warehouseVerifiedQty`/`warehouseSupplyDecision` đúng.
- [ ] Login admin → duyệt 1 PR khác KHÔNG kèm `lineChecks` → vẫn 200 (đường thoát khẩn cấp còn hoạt động).
- [ ] Sau director-approve, convert sang PO: dòng SUPPLY_FROM_STOCK không xuất hiện trong PO sinh ra — verify bằng `GET /api/purchase-orders?prId=X`.
- [ ] `notifyPRDeptApproved` — người đề xuất nhận notification có nhắc số dòng supply-from-stock (nếu có).

### Rủi ro & Rollback
- Migration chỉ `ADD COLUMN` nullable — rollback bằng `DROP COLUMN IF EXISTS` an toàn, không mất dữ liệu cột khác.
- Rủi ro nghiệp vụ: Kho quên/lười điền đúng số thực tế (chỉ gõ đại cho qua) — đây là rủi ro CON NGƯỜI không giải quyết được bằng code, chỉ có thể giảm thiểu bằng audit trail (đã có `warehouseVerifiedQty` lưu vĩnh viễn để truy vết nếu sau này phát hiện số sai).

---

## 5. Phase B — Mã tham chiếu duy nhất từng dòng vật tư

**Effort: S-M (1 ngày)**

### 5.1 Migration
Đã gộp vào migration Phase A (mục 4.2) — cột `line_ref_code` + unique partial index.

### 5.2 Sinh mã tự động khi tạo dòng PR

**File:** nơi INSERT `purchase_request_line` — cần audit chính xác (khả năng cao ở `apps/web/src/server/repos/purchaseRequests.ts` trong hàm `createPR`/`createPRWithLines`, tên chính xác cần grep `insert(purchaseRequestLine)` khi code).

Định dạng đề xuất (QĐ-9): **`PRL-{YYMM}-{seq5}`** (VD `PRL-2609-00042`), dùng `genDocNo(tx, { table: "app.purchase_request_line", column: "line_ref_code", prefix: "PRL-" + currentYymm(), seqPart: 3, pad: 5 })`. Sinh NGAY LÚC INSERT dòng (trong cùng transaction tạo PR), KHÔNG đợi tới lúc submit — vì mã dùng để TRA CỨU dòng ngay cả khi phiếu còn DRAFT.

> **Câu hỏi phụ cần user xác nhận (không phải BLOCKER nhưng nên hỏi):** định dạng `PRL-{YYMM}-{seq5}` có OK không, hay muốn định dạng khác (VD theo mã vật tư `{itemSku}-{seq}`)? Đề xuất giữ `PRL-` prefix vì mã theo SKU sẽ dài dòng và trùng lặp khi nhiều dòng cùng SKU trong nhiều PR khác nhau (không "duy nhất" theo đúng nghĩa nếu ghép SKU).

### 5.3 Hiển thị mã trên UI + PDF/Excel

- **UI:** cột mới trong bảng dòng PR (form `new-mrf`/`new-dnvt` và trang chi tiết) — hiển thị `lineRefCode` (read-only, generated).
- **PDF:** `ycvtPdf.tsx`/`dnvtPdf.tsx` (703 + 508 dòng — audit vị trí bảng dòng khi code) — thêm cột "Mã tham chiếu" hoặc thêm vào cột đã có "Mã tham chiếu" hiện tại (dòng 264 schema ghi chú field `referenceCode` được dùng cho mục đích khác — CẦN QUYẾT ĐỊNH có đổi tên cột hiển thị trên PDF từ "Tham chiếu" (free-text cũ) sang thêm 1 cột mới "Mã ID" hay không — đề xuất thêm cột mới riêng biệt, giữ cột cũ, vì 2 khái niệm khác nhau như đã phân tích ở QĐ-9).

### Definition of Done Phase B
- [ ] Tạo PR mới 3 dòng → mỗi dòng có `lineRefCode` dạng `PRL-2609-XXXXX` khác nhau, tăng dần.
- [ ] 2 PR tạo gần như đồng thời (test concurrency bằng cách gọi API song song `Promise.all`) → không có `lineRefCode` trùng (advisory lock hoạt động đúng).
- [ ] Query `SELECT line_ref_code, COUNT(*) FROM app.purchase_request_line GROUP BY line_ref_code HAVING COUNT(*) > 1` → 0 dòng (không trùng).
- [ ] PDF export YCVT/DNVT hiển thị đúng cột mã mới, không đè lên cột "Tham chiếu" cũ.

### Rollback
Thuần cột mới nullable — an toàn.

---

## 6. Phase C — PO: cập nhật đơn giá có lịch sử + thông báo đầy đủ

**Effort: M-L (2 ngày)**

### 6.1 Cho phép sửa giá khi `SENT` (QĐ-7)

**File:** `apps/web/src/app/api/purchase-orders/[id]/route.ts`, hàm `PATCH` (dòng 68-165 đã đọc toàn bộ).

- Thêm schema mới cho case `isSent` + có `lines`:
  ```ts
  // V4 Wave 3 — SENT cho phép sửa GIÁ từng dòng (KHÔNG đổi itemId/orderedQty).
  const priceOnlyLineSchema = z.object({
    id: z.string().uuid(), // line ID hiện có — bắt buộc, không cho thêm dòng mới khi SENT
    unitPrice: z.coerce.number().min(0).optional(),
    taxRate: z.coerce.number().min(0).max(100).optional(),
  });
  ```
- Logic: nếu `isSent` và `body.data.lines` có giá trị → validate mọi `line.id` phải tồn tại trong PO hiện tại (khớp `getPOLines`), KHÔNG cho phép item mới (`id` không nằm trong set cũ → 422). Nếu hợp lệ, gọi hàm mới `updatePOLinePrices(poId, priceChanges)` (KHÔNG dùng `replacePOLines` vì hàm đó xoá-tạo lại toàn bộ, sẽ mất `receivedQty` đã ghi nhận nếu PO đã nhận 1 phần — **rủi ro nghiêm trọng nếu dùng nhầm hàm cũ cho case SENT**).
- **Trước khi update, đọc `getPOLines(poId)` lưu vào biến `beforeLines`** để làm audit diff (mục 6.2).

### 6.2 Hàm mới `updatePOLinePrices` — UPDATE tại chỗ, KHÔNG xoá-tạo lại

**File:** `apps/web/src/server/repos/purchaseOrders.ts` (hàm mới, đặt gần `replacePOLines`):
```ts
export async function updatePOLinePrices(
  poId: string,
  changes: Array<{ id: string; unitPrice?: number; taxRate?: number }>,
): Promise<{ totalAmount: string }> {
  return db.transaction(async (tx) => {
    for (const c of changes) {
      const [existing] = await tx.select().from(purchaseOrderLine).where(eq(purchaseOrderLine.id, c.id)).limit(1);
      if (!existing || existing.poId !== poId) throw new Error("LINE_NOT_FOUND");
      const qty = Number(existing.orderedQty);
      const price = c.unitPrice ?? Number(existing.unitPrice);
      const taxPct = c.taxRate ?? Number(existing.taxRate);
      const lineTotal = computeLineTotal(qty, price, taxPct);
      await tx.update(purchaseOrderLine)
        .set({ unitPrice: String(price), taxRate: String(taxPct), lineTotal: String(lineTotal) })
        .where(eq(purchaseOrderLine.id, c.id));
    }
    // Recompute header totalAmount từ TOÀN BỘ lines (không chỉ lines vừa đổi).
    const allLines = await tx.select().from(purchaseOrderLine).where(eq(purchaseOrderLine.poId, poId));
    const totalAmount = allLines.reduce((sum, l) => sum + Number(l.lineTotal), 0).toFixed(2);
    await tx.update(purchaseOrder).set({ totalAmount }).where(eq(purchaseOrder.id, poId));
    return { totalAmount };
  });
}
```

### 6.3 Ghi audit lịch sử giá (QĐ-8) — trong route, sau khi update thành công

```ts
// So sánh beforeLines vs lines mới để chỉ log DÒNG THỰC SỰ ĐỔI GIÁ.
const priceDiffs = changes
  .map((c) => {
    const before = beforeLines.find((l) => l.id === c.id);
    if (!before) return null;
    const changed = (c.unitPrice !== undefined && Number(before.unitPrice) !== c.unitPrice)
      || (c.taxRate !== undefined && Number(before.taxRate) !== c.taxRate);
    return changed ? { lineId: c.id, itemSku: before.itemSku, before: { unitPrice: before.unitPrice, taxRate: before.taxRate }, after: { unitPrice: c.unitPrice, taxRate: c.taxRate } } : null;
  })
  .filter(Boolean);

if (priceDiffs.length > 0) {
  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "purchase_order",
    objectId: params.id,
    before: { lines: priceDiffs.map((d) => d!.before) },
    after: { lines: priceDiffs.map((d) => d!.after) },
    notes: `Cập nhật đơn giá ${priceDiffs.length} dòng (PO đã SENT)`,
    ...meta,
  });
  // Notify Kho — yêu cầu A.4.
  void notifyPOPriceUpdated({ poId: params.id, poNo: row.poNo, actorUserId: guard.session.userId, actorUsername: guard.session.username, changedLineCount: priceDiffs.length });
}
```

### 6.4 Notification mới — `notifyPOPriceUpdated`

**File:** `apps/web/src/server/services/notifications.ts`, thêm event type (nếu Đợt 1 chưa khai báo sẵn — audit lại union `NotificationEventType` trước khi thêm để tránh trùng):
```ts
| "PO_PRICE_UPDATED" // V4 Wave 3 — cập nhật đơn giá dòng PO đã SENT
```
Builder mới (đặt cạnh `notifyPOSent`):
```ts
export interface POPriceUpdateContext {
  poId: string; poNo: string; changedLineCount: number;
  actorUserId: string; actorUsername: string;
}
export async function notifyPOPriceUpdated(ctx: POPriceUpdateContext) {
  await emitToUsersWithRole("warehouse", {
    actorUserId: ctx.actorUserId,
    actorUsername: ctx.actorUsername,
    eventType: "PO_PRICE_UPDATED",
    entityType: "purchase_order",
    entityId: ctx.poId,
    entityCode: ctx.poNo,
    title: `${ctx.poNo} vừa đổi giá ${ctx.changedLineCount} dòng`,
    message: "Kiểm tra lại giá trị khi đối chiếu nhận hàng.",
    link: `/procurement/purchase-orders/${ctx.poId}`,
    severity: "warning",
  });
}
```

### 6.5 Notify approve/reject PO còn thiếu (yêu cầu A.3 — "chuyển trả kết quả")

**File:** `apps/web/src/app/api/purchase-orders/[id]/approve/route.ts` và `.../reject/route.ts`.

- Cần truy ngược người đề xuất gốc: `purchase_order.prId` → `purchase_request.requestedBy` (join khi lấy `before`/`row`, hoặc thêm 1 query nhỏ `getPR(row.prId)` nếu `prId` không null — PO tạo thủ công không qua PR thì `prId` null, bỏ qua notify creator trong trường hợp đó).
- Builder mới `notifyPOApproved` / `notifyPOApprovalRejected` (đặt tên tránh trùng `notifyPRApproved`/`notifyPRRejected` đã có cho PR):
  ```ts
  export interface POApprovalNotifyContext {
    poId: string; poNo: string;
    actorUserId: string; actorUsername: string;
    prRequesterUserId?: string | null;
  }
  export async function notifyPOApproved(ctx: POApprovalNotifyContext) {
    await emitToUsersWithRole("purchaser", { /* ... */ eventType: "PO_APPROVED", title: `${ctx.poNo} đã được duyệt`, link: `/procurement/purchase-orders/${ctx.poId}`, severity: "success" });
    await emitToUsersWithRole("warehouse", { /* ... */ eventType: "PO_APPROVED", title: `${ctx.poNo} đã duyệt — chuẩn bị nhận hàng`, link: `/procurement/purchase-orders/${ctx.poId}`, severity: "info" });
    if (ctx.prRequesterUserId) {
      await emitNotification({ recipientUser: ctx.prRequesterUserId, /* ... */ eventType: "PO_APPROVED", title: `Đơn mua cho đề xuất của bạn đã duyệt`, link: `/procurement/purchase-orders/${ctx.poId}`, severity: "success" });
    }
  }
  // notifyPOApprovalRejected tương tự, severity "warning", eventType "PO_APPROVAL_REJECTED"
  ```
- Thêm 2 event type mới vào union: `"PO_APPROVED"`, `"PO_APPROVAL_REJECTED"` (đặt tên phân biệt rõ với `PR_APPROVED`/`PR_REJECTED` đã có, tránh nhầm giữa PO và PR trong log/UI).
- Gọi trong route `approve/route.ts` sau `writeAudit` thành công; `reject/route.ts` tương tự.

### Definition of Done Phase C
- [ ] PO `SENT` → PATCH đổi `unitPrice` 1 dòng → 200, `lineTotal`/`totalAmount` tính lại đúng, `receivedQty` của dòng đó KHÔNG bị reset về 0 (verify quan trọng — chứng minh không dùng nhầm `replacePOLines`).
- [ ] PATCH cùng lúc cố đổi `itemId` hoặc thêm dòng mới khi SENT → 422 bị chặn.
- [ ] `SELECT * FROM app.audit_event WHERE object_type='purchase_order' AND object_id=X ORDER BY occurred_at DESC LIMIT 1` → thấy đúng before/after giá.
- [ ] Kho (`bo.phan.kho`) nhận notification `PO_PRICE_UPDATED` sau khi đổi giá.
- [ ] Approve 1 PO → purchaser + warehouse + (nếu có prId) người đề xuất gốc đều nhận notification `PO_APPROVED` (verify qua `GET /api/notifications` từng account).
- [ ] Reject 1 PO → tương tự với `PO_APPROVAL_REJECTED`.
- [ ] `pnpm --filter web build` pass (union `NotificationEventType` mở rộng không phá switch/exhaustive check nào).

### Rủi ro & Rollback
- Rủi ro cao nhất: nhầm giữa `replacePOLines` (xoá-tạo lại) và `updatePOLinePrices` (update tại chỗ) — PHẢI code review kỹ điểm này, viết test riêng khẳng định `receivedQty` giữ nguyên sau khi đổi giá.
- Rollback: code thuần, không có migration DB mới ở Phase C (chỉ dùng cột có sẵn) — revert commit an toàn.

---

## 7. Phase D — Phiếu giao hàng + BBGH (Biên bản giao hàng)

**Effort: L-XL (3-4 ngày, gồm thời gian chờ user duyệt mẫu)**

### 7.1 CẢNH BÁO BẮT BUỘC ĐỌC TRƯỚC KHI CODE

**KHÔNG code Phase D cho tới khi user xác nhận bảng trường mục 7.2.** Agent (Claude) không đọc được nội dung 2 file PDF mẫu đã có trong repo (`po 2112520763, 2112522933 roller (2000, 700) -/BBGH.pdf` và `DeliveryNote 2112520763, 2112522933 roller (2000, 700).pdf`). Đề xuất: user tự mở 2 file này, đối chiếu bảng đề xuất bên dưới, đánh dấu Có/Sửa/Bỏ.

### 7.2 Danh sách trường ĐỀ XUẤT cho BBGH (theo chuẩn biên bản giao hàng VN phổ biến ở xưởng cơ khí)

| # | Trường | Loại | Ghi chú |
|---|---|---|---|
| 1 | Số BBGH | Auto (`genDocNo`) | Định dạng đề xuất `BBGH-{YYMM}-{seq4}` |
| 2 | Ngày lập | Auto (now) | |
| 3 | Bên giao (Song Châu — tên cố định công ty) | Auto | Lấy từ config công ty nếu có, hoặc hardcode |
| 4 | Bên nhận (tên khách hàng/đơn vị nhận) | Nhập tay | Free-text hoặc chọn từ danh sách khách hàng nếu hệ thống có bảng customer (CẦN AUDIT — hiện tại chưa thấy bảng `customer` trong schema đã đọc, có thể là free-text) |
| 5 | Địa chỉ giao hàng | Nhập tay | |
| 6 | Số PO/hợp đồng liên quan | Link tới `purchase_order` hoặc free-text | Theo tên file mẫu `BBGH` gắn với `po 2112520763, 2112522933` — khả năng cao BBGH liên kết PO chứ không phải issue request thuần |
| 7 | Danh sách hàng hoá: STT / Tên hàng / Mã hàng / ĐVT / Số lượng / Ghi chú | Bảng dòng | Lấy từ `warehouseIssueRequest.picksJson` hoặc từ PO lines nếu liên kết PO |
| 8 | Người giao (tên, ký tên) | Nhập tay hoặc auto từ actor | |
| 9 | Người nhận (tên, ký tên) | Nhập tay | Người ngoài hệ thống, không có tài khoản |
| 10 | Ghi chú/tình trạng hàng hoá | Nhập tay | VD "hàng đủ, không móp méo" |
| 11 | Chữ ký điện tử/scan | KHÔNG làm ở Đợt 3 | PDF in ra ký tay, scan lại đính kèm (nếu cần lưu file — xem câu hỏi phụ) |

**Câu hỏi phụ cần user trả lời cùng lúc:**
- (a) BBGH có LIÊN KẾT PO không, hay chỉ liên kết `warehouse_issue_request`? (Tên file mẫu gợi ý có liên kết PO — nhưng nghiệp vụ B.5 mô tả "đề xuất xuất hàng" nghe giống nội bộ hơn là giao cho NCC/khách qua PO).
- (b) "Phiếu giao hàng" và "BBGH" là 2 chứng từ khác nhau theo trình tự (Phiếu giao hàng lập trước → sau khi giao xong ký thành BBGH) hay là 2 TÊN GỌI của cùng 1 chứng từ ở 2 giai đoạn (nháp/đã xác nhận)? Đề xuất planner: coi là CÙNG 1 bảng, khác `status` (`DRAFT`/`ISSUED` = "Phiếu giao hàng" chưa ký, `CONFIRMED` = "BBGH" đã ký xác nhận) — đúng tinh thần yêu cầu "Sau khi hoàn tất giao nhận, tự động chuyển trả BBGH" (ngụ ý BBGH là TRẠNG THÁI HOÀN TẤT của cùng chứng từ, không phải 2 bảng riêng).
- (c) Có cần upload file scan chữ ký tay sau khi giao xong không, hay chỉ cần PDF hệ thống tự sinh (không chữ ký thật, chỉ có tên)? Ảnh hưởng tới việc có cần thêm cột `attachmentUrl`/dùng cơ chế upload nào (audit cơ chế upload hiện có trong hệ thống, VD ảnh QC, khi trả lời Có).

### 7.3 Schema mới (SAU KHI user xác nhận mục 7.2 — bảng dưới đây tạm thời dựa trên đề xuất, PHẢI SỬA LẠI THEO XÁC NHẬN THẬT)

**File mới:** `packages/db/src/schema/delivery-note.ts`
```ts
export const deliveryNoteStatusEnum ... // KHÔNG dùng pgEnum — theo đúng convention purchase_request (varchar tự do) để dễ mở rộng, tránh ALTER TYPE
export const deliveryNote = appSchema.table("delivery_note", {
  id: uuid("id").defaultRandom().primaryKey(),
  noteNo: varchar("note_no", { length: 64 }).notNull(),
  status: varchar("status", { length: 16 }).notNull().default("DRAFT"), // DRAFT → PENDING_ADMIN_APPROVAL → CONFIRMED (= BBGH) / REJECTED
  issueRequestId: uuid("issue_request_id").references(() => warehouseIssueRequest.id),
  poId: uuid("po_id").references(() => purchaseOrder.id), // nullable — xem câu hỏi (a)
  recipientName: varchar("recipient_name", { length: 255 }),
  recipientAddress: text("recipient_address"),
  deliveredBy: uuid("delivered_by").references(() => userAccount.id),
  confirmedBy: uuid("confirmed_by").references(() => userAccount.id), // Giám đốc (admin) — người duyệt
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
  notes: text("notes"),
  createdAt: ..., createdBy: ...,
});
export const deliveryNoteLine = appSchema.table("delivery_note_line", {
  id: uuid("id").defaultRandom().primaryKey(),
  deliveryNoteId: uuid(...).references(() => deliveryNote.id, { onDelete: "cascade" }),
  lineNo: integer(...),
  itemId: uuid(...).references(() => item.id),
  qty: numeric(...),
  notes: text(...),
});
```

### 7.4 Migration mới (số dự kiến `0057_delivery_note.sql` — VERIFY LẠI)
`CREATE TABLE app.delivery_note (...)`, `CREATE TABLE app.delivery_note_line (...)`, index theo `note_no` UNIQUE, `status`, `issue_request_id`. Theo `DRIFT-NOTES.md` mục 4: bảng mới cần cân nhắc tạo qua `drizzle-kit push` (baseline) HAY qua SQL migration — vì đây là bảng MỚI HOÀN TOÀN chưa từng tồn tại, theo đúng quy ước ghi trong `DRIFT-NOTES.md`, các bảng tạo SAU baseline ban đầu ĐỀU tạo bằng SQL migration (không phải `drizzle-kit push`) — xác nhận lại cách các bảng tương tự gần đây (`warehouse_issue_request` ở 0036, `material_request` ở 0033) đã tạo để bám đúng convention.

### 7.5 API routes mới

| Route | Method | Vai trò | Việc |
|---|---|---|---|
| `/api/warehouse/delivery-notes` | POST | warehouse | Tạo phiếu giao hàng DRAFT từ 1 issue request đã COMPLETED |
| `/api/warehouse/delivery-notes` | GET | warehouse, purchaser, admin | List |
| `/api/warehouse/delivery-notes/[id]` | GET | warehouse, purchaser, admin | Chi tiết |
| `/api/warehouse/delivery-notes/[id]/submit` | POST | warehouse | DRAFT → PENDING_ADMIN_APPROVAL |
| `/api/warehouse/delivery-notes/[id]/approve` | POST | **CHỈ admin** (QĐ-5) | PENDING_ADMIN_APPROVAL → CONFIRMED (= BBGH chính thức), sinh PDF, notify |
| `/api/warehouse/delivery-notes/[id]/reject` | POST | **CHỈ admin** | → REJECTED |
| `/api/warehouse/delivery-notes/[id]/pdf` | GET | warehouse, purchaser, admin | Tải PDF BBGH (chỉ khả dụng khi CONFIRMED) |

Guard mẫu cho `approve`/`reject` (áp dụng QĐ-5 — hard-check admin, không chỉ dựa RBAC matrix mềm):
```ts
const guard = await requireCan(req, "approve", "deliveryNote");
if ("response" in guard) return guard.response;
if (!guard.session.roles.includes("admin")) {
  return jsonError("FORBIDDEN", "Chỉ Giám đốc được phê duyệt phiếu giao hàng.", 403);
}
```

### 7.6 Sửa guard SAI hiện có (theo user note + khảo sát mục 3)

**File:** `apps/web/src/app/api/warehouse/issue-request/[id]/approve/route.ts` (dòng 38) và `.../reject/route.ts` (dòng 24) — **ĐÂY LÀ 2 ROUTE KHÁC**, không phải route mới của Phase D, nhưng user yêu cầu sửa guard sai entity ở đây. Cân nhắc lại phạm vi: yêu cầu gốc B.5 nói "Tiếp nhận & xử lý ĐỀ XUẤT XUẤT HÀNG cùng PHIẾU GIAO HÀNG — CHỈ GIÁM ĐỐC được duyệt" — nghĩa là chính luồng `warehouse_issue_request` hiện tại (Kho đang tự duyệt) phải đổi thành CHỈ ADMIN duyệt, KHÔNG PHẢI Kho nữa.

> **MÂU THUẪN CẦN USER XÁC NHẬN:** nếu đổi guard `issue-request/approve` từ `warehouse` sang CHỈ `admin`, thì luồng xuất kho nội bộ hiện tại (Kho tự duyệt xuất cho operator, đã chạy ổn định từ V3.7.9) sẽ bị chặn hoàn toàn — MỌI issue request (kể cả xuất nội bộ nhỏ lẻ cho sản xuất) đều phải chờ Giám đốc duyệt. Đây có phải ý user không, hay ý user là "CHỈ áp dụng cho case xuất hàng GIAO CHO BÊN NGOÀI (khách/NCC, sinh BBGH)", còn xuất nội bộ (cho operator/production) vẫn để Kho tự duyệt như cũ?
> **Đề xuất planner (chờ user chốt):** phân biệt bằng field `reason` đã có sẵn trong `warehouseIssueRequest` (enum-string `production`/`sales`/`manual`/`loss`/`return`/`other` — xem `route.ts` dòng 40). Đề xuất: **CHỈ khi `reason IN ('sales', 'return')`** (xuất giao cho bên ngoài) mới bắt buộc admin duyệt + sinh BBGH; các `reason` còn lại (`production`, `manual`, `loss`, `other` — xuất nội bộ) GIỮ NGUYÊN Kho tự duyệt như hiện tại, KHÔNG đổi guard cho case này. Đây là phương án ít phá vỡ luồng đang chạy nhất, nhưng **PHẢI USER XÁC NHẬN TRƯỚC KHI CODE** vì ảnh hưởng lớn tới guard hiện có.

Nếu user xác nhận hướng "phân biệt theo `reason`":
```ts
// apps/web/src/app/api/warehouse/issue-request/[id]/approve/route.ts
const guard = await requireCan(req, "approve", request.reason === "sales" || request.reason === "return" ? "deliveryNote" : "issueRequest" /* hoặc giữ "po" nếu chưa muốn tạo entity issueRequest riêng — xem ghi chú dưới */);
```
> Ghi chú kỹ thuật: hiện KHÔNG có `RbacEntity` tên `issueRequest` riêng (guard đang mượn tạm `po`). Sửa đúng cần: (i) audit trước xem có nên tạo `RbacEntity` mới `issueRequest` (đúng bản chất, tách khỏi `po`) hay tiếp tục mượn entity khác — đề xuất tạo mới `issueRequest` vì đây LÀ BUG CÓ SẴN cần sửa tận gốc, không nên vá tạm thêm lần nữa. Việc thêm entity mới lại phụ thuộc quy trình giống Đợt 1 Phase 2 (thêm vào `RbacEntity` union + matrix + test) — Phase D phải làm bước này TRƯỚC KHI sửa guard, xem mục 7.7.

### 7.7 RBAC bổ sung (nếu chọn hướng tạo entity `issueRequest` mới ở 7.6)

Thêm `RbacEntity` mới `"issueRequest"` (giống cách Đợt 1 thêm `finance`/`deliveryNote`) — gán quyền:
- `warehouse`: `["create", "read", "approve"]` (giữ quyền tự duyệt case nội bộ)
- `admin`: full
- `purchaser`: `["read"]`

Và giữ nguyên entity `deliveryNote` (Đợt 1 đã tạo) chỉ cấp `approve` cho `admin` — đúng theo bảng Đợt 1 mục 5.2 (đã có sẵn: `admin: full`, `warehouse: ["create","read","update"]` KHÔNG có approve, `purchaser: ["read"]`). Route `delivery-notes/[id]/approve` (mục 7.5) dùng đúng entity `deliveryNote` này, KHÔNG cần sửa gì thêm vì Đợt 1 đã thiết kế đúng ý đồ "chỉ admin approve".

### 7.8 PDF BBGH

**File mới:** `apps/web/src/server/services/deliveryNotePdf.tsx` — bám pattern `poPdf.tsx`/`ycvtPdf.tsx` (dùng `@react-pdf/renderer` + Roboto vendored đã có). Nội dung theo bảng trường mục 7.2 SAU KHI user xác nhận.

### 7.9 Notification mới

| Event type | Khi nào bắn | Ai nhận | Đếm badge? | Email? |
|---|---|---|---|---|
| `DELIVERY_NOTE_CREATED` | Kho tạo phiếu giao hàng DRAFT → submit | admin (cần duyệt) | Có (`emitToUsersWithRole`) | Có (thêm vào `EMAIL_EVENTS` — đây là event "cần hành động") |
| `DELIVERY_NOTE_CONFIRMED` (= BBGH hoàn tất) | Admin approve | purchaser + warehouse (theo yêu cầu B.6 "chuyển trả BBGH về cho Thu mua và Kho") | Có | Không (event kết quả, không cần hành động tiếp — theo đúng nguyên tắc `EMAIL_EVENTS` hiện tại chỉ email event "cần duyệt") |
| `DELIVERY_NOTE_REJECTED` | Admin reject | warehouse (người tạo) | Có | Không |

> `DELIVERY_NOTE_CREATED`/`DELIVERY_NOTE_CONFIRMED` đã được Đợt 1 Phase 4.1 khai báo SẴN trong union `NotificationEventType` (dạng "chuẩn bị nền", chưa có hàm nào gọi) — Phase D chỉ cần VIẾT HÀM `notifyDeliveryNoteCreated`/`notifyDeliveryNoteConfirmed` thật, KHÔNG cần sửa union type nữa (verify lại khi code — nếu Đợt 1 chưa merge đúng như plan, tự thêm).

### Definition of Done Phase D
- [ ] User đã xác nhận bảng trường mục 7.2 + câu hỏi (a)(b)(c) + mâu thuẫn mục 7.6 — **GHI LẠI QUYẾT ĐỊNH VÀO FILE NÀY** trước khi merge code.
- [ ] Migration tạo 2 bảng mới thành công.
- [ ] Tạo issue request `reason=sales` → Kho tạo delivery note DRAFT → submit → CHỈ admin thấy nút duyệt (warehouse thử duyệt → 403).
- [ ] Admin approve → status `CONFIRMED`, PDF tải được, purchaser + warehouse nhận notify `DELIVERY_NOTE_CONFIRMED`.
- [ ] Issue request `reason=production` (nội bộ) → Kho vẫn tự duyệt như cũ, KHÔNG bị chặn bởi guard mới (regression test quan trọng nhất của Phase D).
- [ ] `pnpm --filter shared test` pass với entity `issueRequest` mới (nếu chọn hướng 7.6/7.7).
- [ ] `pnpm --filter web build` pass.

### Rủi ro & Rollback
- **Rủi ro cao nhất:** mục 7.6 (phân biệt theo `reason`) nếu hiểu sai ý user sẽ chặn nhầm luồng xuất kho nội bộ đang chạy ổn định — bắt buộc test regression case `reason=production` trước khi deploy.
- Rollback: bảng mới (`delivery_note*`) có thể `DROP TABLE` an toàn nếu chưa ai dùng dữ liệu thật; sửa guard route issue-request là code thuần, revert commit được ngay nếu phát hiện chặn nhầm luồng.

---

## 8. Phase E — WO → tạo yêu cầu mua NVL thiếu, phân quyền giới hạn

**Effort: M (1.5 ngày)**

### 8.1 Bước audit bắt buộc trước khi code

`work_order.material_requirements` là JSONB tự do (`packages/db/src/schema/production.ts:65`), KHÔNG có schema cố định trong TS. **Trước khi viết logic parse, chạy query trên dev DB:**
```sql
SELECT id, wo_no, material_requirements FROM app.work_order WHERE material_requirements IS NOT NULL LIMIT 5;
```
để xác nhận shape thực tế (khả năng cao dạng `[{itemId, itemSku, requiredQty, availableQty, shortageQty, ...}]` dựa theo cách đặt tên các trường tương tự ở `bom_snapshot_line`, nhưng KHÔNG được giả định — phải xác nhận bằng dữ liệu thật).

### 8.2 API mới — tái dùng pattern `from-shortage`

**File mới:** `apps/web/src/app/api/work-orders/[id]/create-material-pr/route.ts`
```ts
/**
 * POST /api/work-orders/[id]/create-material-pr
 * Tạo PR cho NVL thiếu của WO này. Role: CHỈ tạo PR, KHÔNG cho sửa/xoá WO
 * (xem RBAC mới `wo.createMaterialPr` — mục 8.3).
 */
export async function POST(req, { params }) {
  const guard = await requireCan(req, "create", "pr"); // vẫn dùng quyền pr.create có sẵn
  if ("response" in guard) return guard.response;
  const wo = await getWorkOrder(params.id);
  if (!wo) return jsonError("NOT_FOUND", ...);
  const shortageItems = parseShortageFromMaterialRequirements(wo.materialRequirements); // hàm mới, dựa audit 8.1
  if (shortageItems.length === 0) return jsonError("NO_SHORTAGE", "WO này không thiếu NVL.", 422);
  const row = await createPRFromWorkOrder(wo.id, shortageItems, guard.session.userId);
  // ... writeAudit, notify (dùng notifyPRSubmitted có sẵn nếu PR tự động submit, hoặc để DRAFT tuỳ quyết định UX)
  return NextResponse.json({ data: row }, { status: 201 });
}
```

### 8.3 Phân quyền "chỉ cho phép thao tác tạo yêu cầu mua NVL" (yêu cầu C.7)

Đọc lại yêu cầu nguyên văn: "Lệnh sản xuất: cấu hình phân quyền CHỈ CHO PHÉP thao tác tạo yêu cầu mua nguyên vật liệu" — diễn giải: có (những) role/tình huống chỉ nên được phép bấm nút "Tạo PR từ WO" trên màn hình WO, KHÔNG được sửa/xoá/chuyển trạng thái WO. Đây KHÔNG phải quyền mới trên entity `pr` (đã có `pr.create`), mà là **giới hạn quyền trên entity `wo`** cho 1 số role.

- Rà theo RBAC hiện tại: role nào đang có `wo` quyền RỘNG hơn cần thiết cho việc này? Xem lại block đã đọc — `purchaser` hiện KHÔNG có `wo` trong matrix (không xuất hiện dòng `wo:` ở block purchaser đã đọc mục khảo sát) → nếu muốn Thu mua tạo PR từ WO để chủ động mua trước NVL thiếu, cần cấp `purchaser.wo = ["read"]` (chỉ đọc, không sửa) — route `create-material-pr` không check quyền `wo` mà check quyền `pr.create` (đã có), nên về mặt RBAC matrix, **không cần thêm action mới**, chỉ cần đảm bảo route KHÔNG bao giờ expose thao tác sửa/xoá WO cho role chỉ nên tạo PR.
- **Đề xuất cụ thể:** thêm `purchaser: { wo: ["read"] }` vào matrix (để Thu mua xem được danh sách WO thiếu NVL và bấm nút tạo PR trên UI), giữ nguyên KHÔNG cấp `update`/`transition`/`delete` cho `purchaser.wo` — RBAC matrix tự động đảm bảo purchaser không thấy nút Sửa/Huỷ WO (dùng `can()` chuẩn, không hardcode UI).
- UI: nút "Tạo YCVT từ NVL thiếu" trên trang WO detail — hiển thị nếu `can(roles, "create", "pr")` (đã có sẵn cho purchaser), các nút Sửa/Huỷ/Chuyển trạng thái WO khác vẫn theo `can(roles, "update"/"transition", "wo")` như cũ (purchaser sẽ KHÔNG thấy các nút này vì không có quyền — tự động đúng theo yêu cầu, không cần code riêng "giới hạn").

> **Lưu ý quan trọng:** yêu cầu C.7 có thể ứng với 1 role KHÁC không phải purchaser (user không nói rõ role nào) — cần user xác nhận: "phân quyền chỉ cho tạo PR" áp dụng cho role nào cụ thể? Nếu là role đã tồn tại (VD `operator`) thì hiện `operator.wo` đã có `["create", "read", "transition"]` (dòng 106-107 matrix) — RỘNG HƠN yêu cầu "chỉ tạo PR", cần user xác nhận có muốn SIẾT LẠI quyền `wo` của operator không (ảnh hưởng lớn tới luồng operator tự tạo Quick WO đang chạy — rủi ro cao nếu siết nhầm).

### Definition of Done Phase E
- [ ] Query xác nhận shape `material_requirements` thật trên dev DB — ghi kết quả vào PR mô tả khi code.
- [ ] `POST /api/work-orders/[id]/create-material-pr` với WO có NVL thiếu → 201, PR mới tạo có dòng đúng item/qty thiếu.
- [ ] WO không có NVL thiếu → 422 `NO_SHORTAGE`.
- [ ] Role được cấp (theo xác nhận user) chỉ thấy nút "Tạo YCVT" trên trang WO, KHÔNG thấy nút Sửa/Huỷ/Release/Complete.
- [ ] `pnpm --filter shared test` pass nếu có thêm case RBAC mới.

### Rủi ro & Rollback
- Rủi ro: hiểu sai role mục tiêu của yêu cầu C.7 — **cần hỏi user làm rõ trước khi code** (đã nêu ở lưu ý trên), tránh sửa nhầm quyền `operator.wo` gây gãy luồng Quick WO.
- Rollback: route mới + matrix thêm dòng — code thuần, revert an toàn.

---

## 9. Phase F — Rà soát trùng lặp `warehouse_issue_request` vs `material_request`

**Effort: XS (0.5 ngày, chỉ phân tích — KHÔNG bắt buộc code)**

### 9.1 So sánh 2 cơ chế

| Tiêu chí | `warehouse_issue_request` (V3.7.9) | `material_request` (V3.3) |
|---|---|---|
| Ai tạo | Bộ phận khác (operator/planner) | Engineer |
| Trạng thái | PENDING → APPROVED/REJECTED → COMPLETED | PENDING → PICKING → READY → DELIVERED/CANCELLED |
| Có bước DUYỆT (reject được) không | CÓ | KHÔNG (Kho luôn phải xử lý, chỉ có thể CANCELLED chứ không REJECT) |
| Input | `picksJson` — plan pick cụ thể (lotSerialId/binId/qty) do người tạo TỰ CHỌN lot | Chỉ `itemId` + `requestedQty` — Kho TỰ CHỌN lot khi pick (FIFO) |
| Side-effect khi hoàn tất | Tự động insert `inventory_txn` OUT_ISSUE | Không thấy insert `inventory_txn` trực tiếp trong luồng đã đọc — cần audit thêm route xử lý `PICKING`/`READY`/`DELIVERED` khi cần (ngoài phạm vi Đợt 3) |
| Mục đích thực tế | Xuất có kiểm soát, người xin đã biết chính xác lot/bin cần xuất (nghiệp vụ rủi ro cao hơn — VD xuất bán, xuất trả) | Xuất phục vụ sản xuất/lắp ráp thông thường, Kho tự sắp xếp pick theo FIFO |

### 9.2 Kết luận & đề xuất

- **KHÔNG gộp ở Đợt 3** (đã chốt QĐ-6). Lý do: 2 bảng phục vụ 2 quy trình nghiệp vụ có mức độ kiểm soát khác nhau — gộp sẽ phải thiết kế lại state machine chung, phá vỡ 2 luồng đang chạy ổn định, không nằm trong yêu cầu tường minh của user lần này.
- **Đề xuất Đợt 3 chỉ làm:** gắn Phase D (BBGH) vào NHÁNH `warehouse_issue_request` (không đụng `material_request`), vì BBGH gắn với khái niệm "giao hàng ra ngoài" khớp với `reason=sales/return` của `warehouse_issue_request`.
- **Đề xuất dài hạn (không làm ở Đợt 3):** nếu sau này người dùng thực tế phản ánh nhầm lẫn giữa 2 luồng khi thao tác trên UI (VD không biết nên tạo "Material Request" hay "Issue Request"), cân nhắc Wave sau: (i) đổi tên hiển thị UI cho rõ ràng hơn ("Yêu cầu xuất kho có kiểm soát" vs "Yêu cầu vật tư sản xuất"), hoặc (ii) hợp nhất thành 1 bảng với cột `mode: CONTROLLED | STANDARD` phân biệt luồng.

### Definition of Done Phase F
- [ ] Bảng so sánh trên được đưa vào tài liệu (đã có ở đây) — không cần code, không cần migration, không cần test.
- [ ] User đọc và xác nhận đồng ý "không gộp ở Đợt 3" (hoặc phản hồi khác nếu muốn gộp ngay — nếu vậy, đây sẽ thành 1 Đợt riêng, không nằm trong effort ước lượng của Đợt 3).

---

## 10. Bảng tổng hợp Files ảnh hưởng (toàn Đợt 3)

| # | File | Loại | Phase |
|---|---|---|---|
| 1 | `packages/db/migrations/0056_pr_line_warehouse_check.sql` (số dự kiến — verify lại) | Mới | A, B |
| 2 | `packages/db/src/schema/procurement.ts` | Sửa (3 cột mới `purchase_request_line`) | A, B |
| 3 | `apps/web/src/app/api/purchase-requests/[id]/dept-approve/route.ts` | Sửa (validate line checks) | A |
| 4 | `apps/web/src/server/repos/purchaseRequests.ts` | Sửa (hàm `deptApprovePRWithLineChecks`, sinh `lineRefCode` lúc tạo) | A, B |
| 5 | `apps/web/src/server/repos/purchaseOrders.ts` | Sửa (`createPOFromPR` skip supply-from-stock; hàm mới `updatePOLinePrices`) | A, C |
| 6 | UI form dept-approve / PR detail (tên chính xác cần audit) | Sửa | A |
| 7 | `ycvtPdf.tsx` / `dnvtPdf.tsx` | Sửa (thêm cột mã tham chiếu) | B |
| 8 | `apps/web/src/app/api/purchase-orders/[id]/route.ts` | Sửa (cho phép sửa giá khi SENT) | C |
| 9 | `apps/web/src/app/api/purchase-orders/[id]/approve/route.ts` | Sửa (thêm notify) | C |
| 10 | `apps/web/src/app/api/purchase-orders/[id]/reject/route.ts` | Sửa (thêm notify) | C |
| 11 | `apps/web/src/server/services/notifications.ts` | Sửa (event type + builder `notifyPOPriceUpdated`, `notifyPOApproved`, `notifyPOApprovalRejected`, `notifyDeliveryNoteCreated`, `notifyDeliveryNoteConfirmed`, `notifyDeliveryNoteRejected`) | C, D |
| 12 | `packages/db/src/schema/delivery-note.ts` | Mới | D |
| 13 | `packages/db/migrations/0057_delivery_note.sql` (số dự kiến — verify lại) | Mới | D |
| 14 | `apps/web/src/app/api/warehouse/delivery-notes/**` | Mới (6 route) | D |
| 15 | `apps/web/src/app/api/warehouse/issue-request/[id]/approve/route.ts` | Sửa (guard entity + phân biệt theo `reason`) | D |
| 16 | `apps/web/src/app/api/warehouse/issue-request/[id]/reject/route.ts` | Sửa (guard entity) | D |
| 17 | `packages/shared/src/rbac/matrix.ts` | Sửa (entity `issueRequest` mới nếu chọn hướng 7.6/7.7; `purchaser.wo = ["read"]` cho Phase E) | D, E |
| 18 | `packages/shared/src/rbac/can.test.ts` | Sửa (case mới cho entity/quyền thêm) | D, E |
| 19 | `apps/web/src/server/services/deliveryNotePdf.tsx` | Mới | D |
| 20 | `apps/web/src/lib/nav-items.ts` | Sửa (nav phiếu giao hàng) | D |
| 21 | `apps/web/src/app/api/work-orders/[id]/create-material-pr/route.ts` | Mới | E |
| 22 | Trang WO detail (nút "Tạo YCVT từ NVL thiếu") | Sửa | E |
| 23 | `tests/e2e/cross-role-flow.mjs` | Sửa (thêm bước kiểm tồn Kho, PO price update, BBGH flow) | A, C, D |
| 24 | `PROGRESS.md` | Sửa | Cuối |

---

## 11. Bảng rủi ro tổng hợp

| # | Rủi ro | Mức độ | Mitigation |
|---|---|---|---|
| R-1 | Số migration dự đoán (`0056`/`0057`) sai vì Đợt 1/Đợt 2 chưa chốt số thật hoặc chạy song song | Cao | `ls packages/db/migrations \| sort` NGAY TRƯỚC KHI TẠO FILE — không tin số ghi trong plan này |
| R-2 | Code Đợt 3 trước khi Đợt 1 merge xong → matrix.ts conflict, entity `deliveryNote` bị tạo trùng 2 lần | Cao | Bắt buộc deploy + verify Đợt 1 xong hẳn trước khi bắt đầu Đợt 3 (đã ghi rõ ở đầu file) |
| R-3 | Phase D — hiểu sai mối quan hệ BBGH/PO/issue request (mục 7.2 câu hỏi a,b) dẫn tới sai thiết kế bảng | Cao | KHÔNG code Phase D tới khi user trả lời — đây là gate cứng |
| R-4 | Phase D mục 7.6 — đổi guard `issue-request/approve` sai phạm vi làm gãy luồng xuất kho nội bộ đang chạy | Cao | Test regression bắt buộc case `reason=production` trước deploy; xác nhận hướng "phân biệt theo reason" với user trước khi code |
| R-5 | Phase C — nhầm `replacePOLines` (xoá-tạo lại) với `updatePOLinePrices` (update tại chỗ) làm mất `receivedQty` đã ghi nhận | Trung bình-Cao | Code review bắt buộc; test riêng khẳng định `receivedQty` không đổi sau khi sửa giá |
| R-6 | Phase E — hiểu sai role mục tiêu của "phân quyền chỉ tạo PR", lỡ siết nhầm quyền `operator.wo` phá luồng Quick WO | Trung bình | Hỏi user xác nhận role cụ thể trước khi sửa matrix; KHÔNG tự ý đổi quyền `wo` của role đang hoạt động ổn định |
| R-7 | Phase A — Kho điền số tồn không chính xác (rủi ro con người, không phải kỹ thuật) | Thấp (chấp nhận) | Lưu vĩnh viễn `warehouseVerifiedQty` để truy vết trách nhiệm sau này, không thể ngăn hoàn toàn bằng code |
| R-8 | Phase B — định dạng mã tham chiếu mới gây nhầm với `reference_code` cũ trên UI/PDF nếu không đặt tên rõ ràng | Thấp | Đặt tên cột/label khác biệt rõ ("Mã ID hệ thống" vs "Tham chiếu"), audit UI trước khi thêm cột hiển thị |
| R-9 | Phase D — bảng `delivery_note` mới có thể trùng ý tưởng với 1 phần Đợt 2 Tài chính (công nợ giao hàng) nếu Đợt 2 code trước và đã có bảng tương tự | Trung bình | Kiểm tra `plans/v4-finance/` thư mục có plan Wave 2 chi tiết nào tạo bảng liên quan trước khi code Phase D — tại thời điểm lập kế hoạch này, Wave 2 CHƯA có plan chi tiết (chỉ có research), nên rủi ro hiện tại thấp nhưng cần re-check lúc thực thi |

---

## 12. Ước lượng tổng effort

| Phase | Effort | Ghi chú |
|---|---|---|
| A — Kho kiểm tồn | 2-2.5 ngày | Gồm transaction line-level + UI form + test |
| B — Mã tham chiếu | 1 ngày | Đơn giản, tái dùng `genDocNo` có sẵn |
| C — PO giá + notify | 2 ngày | Rủi ro kỹ thuật cao nhất (R-5) cần cẩn trọng |
| D — BBGH | 3-4 ngày | Chưa tính thời gian CHỜ user xác nhận mẫu (không giới hạn, phụ thuộc user) |
| E — WO → PR NVL | 1.5 ngày | Cần audit dữ liệu thật trước, có thể phát sinh thêm nếu shape JSONB phức tạp |
| F — Rà soát trùng lặp | 0.5 ngày | Chỉ phân tích, không code |
| **Tổng** | **~10-11.5 ngày làm việc** | Chưa gồm thời gian chờ Đợt 1 deploy ổn định + chờ user duyệt mẫu BBGH |

---

## 13. Thứ tự deploy đề xuất

1. Xác nhận Đợt 1 đã deploy + ổn định (RBAC `deliveryNote` entity, `warehouse.pr.approve`).
2. Deploy Phase B trước (ít rủi ro nhất, không phụ thuộc gì) — migration cột `lineRefCode` (gộp chung migration Phase A để đỡ 1 lần ALTER TABLE, xem mục 4.2).
3. Deploy Phase A (phụ thuộc cùng migration Phase B) — theo dõi Kho thao tác thực tế 3-5 ngày trước khi Phase C/D.
4. Deploy Phase C — theo dõi audit trail giá vài ngày đầu, đảm bảo không có báo cáo `receivedQty` bị reset nhầm.
5. Deploy Phase E song song Phase C (độc lập).
6. User xác nhận mẫu BBGH (mục 7.2) — có thể làm SONG SONG các bước 2-5 ở trên, không cần chờ.
7. Deploy Phase D sau cùng, sau khi mẫu đã chốt.
8. Cập nhật `PROGRESS.md`.

---

## 14. TODO Tasks (checklist tổng)

- [ ] Chốt QĐ-1 → QĐ-9 với user (đặc biệt QĐ-4 mẫu BBGH, mâu thuẫn mục 7.6, role mục tiêu Phase E)
- [ ] Verify Đợt 1 đã deploy xong (`matrix.ts` có `deliveryNote`, `warehouse.pr` có `approve`)
- [ ] `ls packages/db/migrations | sort` verify số migration thật trước khi tạo file
- [ ] Phase B: cột `lineRefCode` + sinh mã tự động + hiển thị UI/PDF
- [ ] Phase A: 2 cột kiểm tồn + sửa dept-approve + repo + UI + skip supply-from-stock khi convert PO
- [ ] Phase C: cho sửa giá khi SENT (update tại chỗ, KHÔNG xoá-tạo lại) + audit trail + 3 notify mới (price updated, approved, rejected)
- [ ] Phase E: audit shape `material_requirements` thật + route `create-material-pr` + RBAC `purchaser.wo:["read"]` (chờ xác nhận role đích)
- [ ] Phase D: CHỜ user xác nhận mẫu BBGH → bảng mới + 6 routes + PDF + notify + sửa guard issue-request (phân biệt theo `reason`)
- [ ] Phase F: chốt với user "không gộp ở Đợt 3" (đã có phân tích sẵn trong file này)
- [ ] Cập nhật `tests/e2e/cross-role-flow.mjs` với các bước mới
- [ ] Cập nhật `PROGRESS.md` sau khi cả 6 phase deploy ổn định
