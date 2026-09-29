# LOOP E2E — Kiểm thử trọn vòng hàng hoá (PO → nhận → QC → putaway → xuất → SX → thành phẩm → giao hàng → tài chính)

> Ngày chạy: 2026-09-30. Môi trường: `http://localhost:3300` (branch `v43/warehouse`), DB **staging**
> tách biệt prod. Công cụ: Playwright headless, đăng nhập thật qua UI, mọi thao tác nghiệp vụ bấm qua UI
> (không gọi API ghi trực tiếp); đọc tồn kho đối chiếu qua API `GET` theo đúng phạm vi cho phép.
> Script chạy tạm tại `apps/web/.tmp-loop-e2e.mjs` (đã xoá sau khi test xong), ảnh chụp tại
> `%TEMP%\claude\c--dev-he-thong-iot\...\scratchpad\loop-e2e\shots\*.png` (không thuộc repo — liệt kê
> tên file bên dưới để tra cứu, không commit).

## Tóm tắt 1 dòng cho từng câu hỏi chủ xưởng

1. **Hàng về nằm ở đâu, ai quyết?** Người nhận (Kho) chọn — hệ thống V4.3 đã có combobox gợi ý #1 kèm lý do, xác nhận qua UI thật; nếu để trống → "Chờ xếp kệ", có worklist "Việc cần làm hôm nay" để xếp kệ sau, tự điền gợi ý. Bằng chứng đầy đủ bên dưới.
2. **Hệ thống có gợi ý vị trí không?** CÓ — đã kiểm 3 nhánh (SAME_ITEM, MOST_CAPACITY, và fallback khi item hoàn toàn mới), hoạt động đúng cả ở wizard nhận hàng, "Xếp kệ" nhanh và dialog hoàn thành LSX.
3. **Xuất kho có trừ tồn thật không?** CÓ, xác nhận bằng số — cả 2 đường (PR "Đã xuất kho" và Yêu cầu xuất kho ISR) đều trừ đúng, sinh mã PX, chặn xuất lô đang Chờ QC, chặn xuất trùng lần 2.
4. **Thành phẩm có nhập kho khi hoàn thành LSX không?** CÓ — tạo lô FG mới đúng số lượng, đúng vị trí gợi ý, cả trường hợp hoàn thành đủ và hoàn thành thiếu (có bắt nhập lý do).
5. **Có lỗi/vướng gì không?** CÓ 1 lỗi P1 nghiêm trọng (nhận hàng vượt số lượng đặt không bị chặn) + vài vướng trải nghiệm — chi tiết ở mục Lỗi/Vướng bên dưới.

---

## 0. Chuẩn bị

| Việc | Kết quả |
|---|---|
| `curl /api/health` | 200 OK trước khi bắt đầu |
| Vật tư nguyên liệu | Không có sẵn item RAW phù hợp tên "thép/nhôm tấm" có SKU khớp — PR dùng tên tự do "[DEMO] Nhôm"; do dòng PR không gắn `itemId` (nhập tên tự do, không qua ItemPicker ở form DNVT), backend **tự tạo item mới** `VT-2609-05EVH` khi convert sang PO (xem mục Lỗi/Vướng #2) → đây mới là item RAW thực tế dùng xuyên suốt bài test |
| Thành phẩm | Không có sẵn item FG nào trên DB staging (khớp phát hiện cũ trong audit V4.3) → tạo mới qua UI `/items/new`: `DEMO-FG-622660` "[DEMO] Thành phẩm LOOP-E2E — Hộp giảm tốc mini", itemType=FG, uom=PCS. Ảnh: `001-00b-fg-item-form.png` |
| Nhà cung cấp | Dùng NCC có sẵn `001 — CÔNG TY TNHH SẢN XUẤT THƯƠNG MẠI DỊCH VỤ MẠNH HƯNG` |
| Tồn ban đầu | RAW mới tạo = 0, FG mới tạo = 0 (sạch, không lẫn dữ liệu người khác) |

---

## 1. Bảng từng bước — PASS/FAIL, ảnh, đối chiếu tồn

| # | Bước | Vai | PASS/FAIL | Ảnh chính | Tồn kỳ vọng → thực tế |
|---|---|---|---|---|---|
| 1 | Tạo phiếu đề xuất vật tư (DNVT) mua 100 SHEET "[DEMO] Nhôm" | planner (e2e.planner) | PASS | `001-01-pr-dnvt-form.png`, `002-02-pr-created.png` | Phiếu `PR-2609-0090` / số giấy `4/PRD-MRF/0926`, tự chuyển `SUBMITTED` ngay khi gửi |
| 2 | Kho duyệt bước 2 (Trưởng bộ phận = Kho) | warehouse (e2e.warehouse) | PASS | `001-04-pr-before-dept-approve.png`, `002-05-pr-dept-approved.png` | — |
| 3 | Giám đốc duyệt cuối | admin | PASS | `001-06-pr-before-director-approve.png`, `002-07-pr-director-approved.png` | Chuông thông báo admin có mục mới (`003-08-admin-bell.png`) |
| 4 | Thu mua tạo PO từ PR | purchaser (e2e.purchaser) | PASS | `002-10-pr-approved-ready-convert.png`, `004-12-po-created-draft.png` | PO `PO-2609-0090-01`, NCC đúng như đã chọn; **backend tự tạo item mới `VT-2609-05EVH`** vì dòng PR không có `itemId` (xem Lỗi #2) |
| 5 | Nhập đơn giá 250,000đ/SHEET (bắt buộc trước khi gửi duyệt) | purchaser | PASS | `002-12c-po-price-saved.png` | Tổng PO 27,000,000đ + VAT 8% = 29,700,000đ (giá dự kiến; số dòng cuối cùng khác do nhận 120 — xem HĐ) |
| 6 | Gửi duyệt PO → Giám đốc duyệt → Gửi NCC | purchaser + admin | PASS | `003-13b-po-submitted-approval.png`, `002-14c-po-approved-by-director.png`, `003-15-po-sent.png` | PO chuyển `SENT` |
| 7 | Kho mở Wizard nhận hàng, xem **combobox gợi ý vị trí** | warehouse | PASS | `002-17-bin-suggest-combobox-open.png` | Gợi ý #1 = `A-01-3-01`, lý do "CÒN TRỐNG 1.000 (THEO SỐ LƯỢNG...)" — item hoàn toàn mới nên không có nhánh SAME_ITEM/DEFAULT_BIN, đúng thiết kế |
| 8 | Nhận 60/100, **để trống vị trí** (do thao tác Playwright bấm Escape thay vì chọn gợi ý — xem ghi chú), QC = Chờ | warehouse | PASS (khác kịch bản dự kiến nhưng vẫn hợp lệ) | `004-19-line-filled-qty60-qc-pending.png`, `006-21-wizard-submitted-60.png` | Lô 60 SHEET, trạng thái `HOLD/QC_PENDING`, rơi đúng vào bin hệ thống "Chờ xếp kệ" (đúng thiết kế fallback) |
| 8v | **Xác nhận lô Chờ QC không xuất được** — gọi thẳng `POST /api/warehouse/fifo-pick` khi lô đang HOLD | warehouse | PASS | — (API-level) | `picks: []` — không lấy được lô nào để xuất, đúng thiết kế `assertIssuable` |
| 9 | Admin (có quyền `approve:qcInspection`) duyệt QC Đạt tại tab "Chờ QC" | admin | PASS | `001-22-qc-pending-tab.png`, `002-23-qc-approved.png` | Lô 60 chuyển `AVAILABLE`, vẫn ở bin "Chờ xếp kệ" |
| 8b | Nhận **40 còn lại** — do lỗi kịch bản (xem Lỗi #1), Playwright vẫn điền 60 thay vì 40 khả dụng | warehouse | **Phát hiện lỗi P1** | (screenshot nằm trong log stage5 lần 2) | **PO nhận tổng 120/100 (120%)** — hệ thống **không chặn** nhận vượt số lượng đặt |
| 10 | Duyệt QC Đạt cho lô over-receipt (60 units thứ 2) | admin | PASS | — | Cả 2 lô AVAILABLE, tổng tồn RAW = 120, đều ở "Chờ xếp kệ" |
| 11 | **Xếp kệ 1 lô 60 SHEET** từ "Việc cần làm hôm nay" — dùng đúng gợi ý #1 tự điền sẵn trong dialog | warehouse | PASS | `001-27-today-inbox-default-tab.png`, `002-28-transfer-dialog-prefilled-suggestion.png`, `003-28b-transfer-dialog-filled.png`, `004-29-putaway-confirmed.png` | Bin đích tự điền đúng `A-01-3-01` (xác nhận bằng `select.inputValue()`, không chỉ đọc textContent); **SL chuyển KHÔNG tự điền** (vướng trải nghiệm #1) → phải tự gõ tay 60. Sau xếp kệ: bin A-01-3-01 có đúng 60 SHEET AVAILABLE (kiểm qua `GET /api/warehouse/bins/{id}`) |
| 12 | "Đã xuất kho" trên PR đã duyệt — xuất 30/120 qua FIFO | warehouse | PASS | `001-30-mark-issued-dialog.png`, `002-31-mark-issued-fifo-preview.png`, `003-32-mark-issued-confirmed.png` | Sinh phiếu **PX-2609-0001**; tồn RAW 120→90 (đúng) |
| 12b | Bấm "Đã xuất kho" **lần 2** — phải bị chặn | warehouse | PASS | `004-33-mark-issued-button-gone.png` | Nút biến mất hẳn sau khi `goodsIssuedAt` được set — không xuất trùng được |
| 13 | Tạo Yêu cầu xuất kho (ISR) reason=production, 20 đơn vị, cho "sản xuất" | warehouse | PASS | `001-34-create-isr-panel.png`, `002-35-isr-line-filled.png`, `003-36-isr-reason-production.png` | Tạo `ISR-2609-0001`/`0002` (2 phiếu do lặp lại thao tác khi debug) — cả hai đều PENDING chờ Kho tự duyệt |
| 14 | Kho tự duyệt + xuất ISR reason=production | warehouse/admin | PASS (1/2) | `001-38-isr-pending-list.png`, `002-39-isr-all-approved.png` | `ISR-2609-0002` → COMPLETED, sinh **PX-2609-0002**, trừ đúng 20 (90→70). `ISR-2609-0001` vẫn PENDING vì lô khoá theo pick cũ đã bị hụt (xem Vướng #2) |
| 15 | Tạo LSX (WO) cho thành phẩm, kế hoạch 10 PCS | planner | PASS | `001-42-wo-new-lsx-form.png`, `002-43-wo-created-draft.png` | `WO-2609-0001` DRAFT |
| 16 | Operator duyệt YCSX (planner không tự duyệt được) | operator | PASS | `001-44-wo-before-approve.png`, `002-45-wo-approved-released.png` | RELEASED |
| 17 | Bắt đầu sản xuất + báo tiến độ | operator | PASS | `001-46-wo-started-in-progress.png`, `001-47-progress-report-filled.png` | IN_PROGRESS, ĐẠT = 10/10 (lần báo đầu) |
| 18 | Hoàn thành LSX, SL FG = 20 (do báo tiến độ lặp 2 lần — lỗi kịch bản, xem ghi chú), chọn vị trí lưu qua gợi ý | admin (chỉ admin/planner có quyền `canComplete`, operator KHÔNG hoàn thành được — xem Vướng #3) | PASS | `002-49-wo-complete-dialog.png`, `003-50-wo-complete-dialog-bin-selected.png`, `004-51-wo-completed-fg-received.png`, `001-52-wo-progress-tab-fglots-banner.png` | Tạo lô **FG-WO-2609-0001** 20 PCS AVAILABLE tại `A-01-3-02` (đúng gợi ý, không rơi vào Chờ xếp kệ vì đã chọn thủ công); trang WO hiện banner "Lô thành phẩm đã nhập kho" ở tab Tiến độ |
| 19 | WO thứ 2: báo tiến độ **CHỈ 4/10** (cố ý thiếu) | operator | PASS | `001-53-wo2-progress-shortfall-4of10.png` | ĐẠT=4, kế hoạch=10 |
| 20 | Hoàn thành WO2 thiếu SL — **phải bắt nhập lý do** | admin | PASS | `001-54-wo2-complete-dialog-shortfall-warning.png`, `002-55-wo2-complete-reason-filled.png`, `003-56-wo2-completed-with-reason.png` | Dialog hiện ô lý do bắt buộc (`#wo-complete-reason`); nút "Hoàn thành" **disabled=true** khi lý do trống (xác nhận bằng `isDisabled()`, không chỉ nhìn ảnh); sau khi nhập lý do hợp lệ → hoàn thành OK, tạo lô **FG-WO-2609-0002** 4 PCS |
| 21 | Yêu cầu xuất kho reason=sales, 15/24 FG cho khách | warehouse | PASS | `001-57-isr-sales-form-fg.png`, `002-58-isr-sales-submitted.png` | `ISR-2609-0003` PENDING, cần Giám đốc duyệt |
| 22 | Giám đốc duyệt + xuất ISR bán hàng từ "Việc cần làm hôm nay" | admin | PASS | `001-59-admin-bell-isr-sales-pending.png`, `002-60-today-inbox-isr-sales-pending.png`, `003-61-isr-sales-approved.png` | Sinh **PX-2609-0003**; tồn FG 24→9 (đúng) |
| 23 | Lập phiếu giao hàng (BBGH) từ ISR bán hàng, gửi duyệt | warehouse | PASS | `001-62-create-delivery-note-dialog.png`, `002-63-delivery-note-form-filled.png`, `003-64-delivery-note-created.png`, `004-65-delivery-note-submitted.png` | `BBGH-2609-0001` DRAFT → PENDING_APPROVAL |
| 24 | Giám đốc duyệt BBGH chính thức + tải PDF | admin | PASS | `001-66-delivery-notes-list-pending.png`, `002-67-delivery-note-approved-bbgh.png` | Status `CONFIRMED`; `GET .../pdf` → 200, `content-type: application/pdf` |
| 25 | Tạo HĐ mua từ PO (Thu mua) | purchaser | PASS | `001-68-po-before-create-invoice.png`, `002-69-invoice-draft-created.png` | HĐ DRAFT, tạm tính 30,000,000đ (120 SHEET × 250,000đ) + VAT 8% = 32,400,000đ |
| 26 | Xác nhận HĐ (ghi công nợ phải trả) | admin | PASS | `001-70-po-invoice-draft-form.png`, `002-71-invoice-no-filled.png`, `003-72-invoice-confirmed-payable.png` | HĐ `HD-DEMO-755855`, status `UNPAID`, `totalAmount=32,400,000` — công nợ phải trả tăng đúng số này |
| 27 | Thanh toán 1 phần 10,000,000đ | admin | PASS | `001-73-payment-form-open.png`, `002-74-payment-form-filled.png`, `003-75-payment-recorded.png` | HĐ chuyển `PARTIAL`, `paidAmount=10,000,000` — đúng |

---

## 2. Đối chiếu tồn kho cuối cùng (API `inventory-summary`, đối chiếu tay)

### RAW — `VT-2609-05EVH` "[DEMO] Nhôm"

| Sự kiện | +/- | Tồn luỹ kế | Tồn thực tế hệ thống |
|---|---|---|---|
| Nhận PO đợt 1 (60) | +60 | 60 | ✅ |
| Nhận PO đợt 2 (60 — lẽ ra chỉ 40) | +60 | 120 | ✅ (xác nhận đúng, nhưng bằng chứng của lỗi P1) |
| PR "Đã xuất kho" PX-2609-0001 | −30 | 90 | ✅ |
| ISR-2609-0002 (production) PX-2609-0002 | −20 | 70 | ✅ |
| ISR-2609-0001 (production, còn PENDING, không trừ) | 0 | 70 | ✅ |
| **Tổng cuối** | | **70** | **Khớp `availableQty=70`, `totalQty=70`** — 2 lô: 60 tại `A-01-3-01`, 10 còn lại của lô gốc tại `A-01-3-01` (đã hợp nhất theo lô ban đầu, không lẫn) |

### FG — `DEMO-FG-622660` "[DEMO] Thành phẩm..."

| Sự kiện | +/- | Tồn luỹ kế | Tồn thực tế |
|---|---|---|---|
| WO-2609-0001 hoàn thành (goodQty=20, do báo tiến độ lặp — xem ghi chú) | +20 | 20 | ✅ |
| WO-2609-0002 hoàn thành thiếu SL (goodQty=4) | +4 | 24 | ✅ |
| ISR-2609-0003 (sales) PX-2609-0003 | −15 | 9 | ✅ |
| **Tổng cuối** | | **9** | **Khớp `availableQty=9`** — 2 lô: `FG-WO-2609-0001` còn 5 tại `A-01-3-02`, `FG-WO-2609-0002` còn 4 tại `A-01-3-02` |

**Kết luận đối chiếu: KHÔNG có lệch số nào** — mọi giao dịch trừ/cộng tồn đều đúng với UI đã bấm, kể cả 2 tình huống "bất thường" tự tạo ra trong lúc test (nhận vượt SL, báo tiến độ 2 lần) đều được hệ thống ghi nhận nhất quán, không có tồn "biến mất" hay "nhân đôi sai".

---

## 3. Danh sách LỖI

### P1 — Nhận hàng KHÔNG bị chặn khi vượt số lượng còn lại của PO

- **Tái hiện:** PO có dòng `orderedQty=100`, đã nhận 60 (`remainingQty=40`). Ở Wizard bước 2, nhập `60` vào ô "Nhận thực tế" (vượt 40) → ô chỉ viền vàng cảnh báo (`aria-invalid`), KHÔNG chặn nút "Tiếp"/"Gửi nhận hàng". Server nhận và ghi nhận đủ 60, PO tổng nhận thành 120/100 (120%), chuyển thẳng `RECEIVED`.
- **Bằng chứng:** `PO-2609-0090-01` thực nhận `120.0000` / đặt `100.0000` (xem API `purchase-orders/{id}` mục 1 báo cáo này).
- **Nghi vấn code:**
  - Client: `apps/web/src/app/(app)/receiving/[poId]/wizard/page.tsx:826-827, 889, 891` — `overRemaining` chỉ đổi màu viền + `aria-invalid`, không disable submit.
  - Server: `apps/web/src/server/repos/receivingEvents.ts:540-544, 582, 604` — có tính `overDelivery` (>105%) nhưng chỉ trả về trong `details[]` để hiển thị toast **sau khi đã ghi**, không có bước chặn/hỏi xác nhận trước khi commit transaction.
- **Đề xuất:** chặn cứng khi `qty > remainingQty` (không cho vượt, trừ khi có cờ "cho phép nhận dư" tường minh + lý do, giống cơ chế "không trừ tồn" đã làm ở PR mark-issued) — vì hàng hoá vật lý không thể "nhận thừa vô hạn" mà không ai biết.
- **Mức độ:** P1 (không mất tồn, không sai số, nhưng cho phép ghi sai lệch dữ liệu nguồn — PO tưởng nhận đủ 100 lại có 120, ảnh hưởng đối soát công nợ NCC, kế toán, và là đúng nguyên nhân gây ra HĐ mua 32.4tr thay vì con số theo PO gốc).

### P2 — Dòng PR nhập tay không gắn `itemId` → mỗi lần convert PO có thể tạo item trùng lặp âm thầm

- **Tái hiện:** Tạo PR (DNVT) với dòng nhập tên tự do "[DEMO] Nhôm" (không dùng ItemPicker vì form DNVT không có ô chọn item, chỉ có ô text tên). Khi Thu mua "Tạo PO", backend tìm item theo tên **khớp chính xác** (không phân biệt hoa thường) — sai khác 1 ký tự (ví dụ có tiền tố "[DEMO]" mà item gốc không có) → **tự tạo item MỚI** với SKU tự sinh, không cảnh báo người dùng.
- **Nghi vấn code:** `apps/web/src/server/repos/purchaseOrders.ts:434-494` (`findOrCreateItemForLine` — so khớp tên bằng `lower(name) = lower(name)` tuyệt đối, không fuzzy, không hỏi xác nhận).
- **Đề xuất:** khi convert PR→PO, nếu dòng PR không có `itemId`, nên hiện dialog xác nhận "tạo item mới X hay dùng item có sẵn Y (giống 90%)" thay vì âm thầm tạo mới.
- **Mức độ:** P2 — không sai tồn kho, nhưng gây phình danh mục vật tư trùng lặp theo thời gian nếu xưởng thao tác PR bằng tên tự do thường xuyên (đúng thói quen thực tế theo mẫu form giấy DNVT).

---

## 4. Vướng trải nghiệm (không phải lỗi, nhưng gây khó dùng)

1. **Dialog "Xếp kệ" từ Việc cần làm hôm nay không tự điền Số lượng chuyển** dù đã biết chính xác tồn của lô (label ghi rõ "tối đa X" nhưng field để trống) — người dùng phải tự gõ lại số đã hiển thị ngay trên dòng lô. Trong khi Bin đích đã tự điền đúng gợi ý. File: `apps/web/src/components/warehouse/BinActions.tsx:778` (`useState(initialToBinId ?? "")` có prefill, nhưng `qty` dòng 778 dưới không có tham số `initialQty` tương ứng). Đề xuất: thêm `initialQty = lot.qty`.
2. **ISR (Yêu cầu xuất kho) khoá "lô lấy sẵn" (pick) tại thời điểm TẠO, không refresh khi duyệt** — nếu giữa lúc tạo và lúc duyệt, lô đó đã bị người khác xuất bớt (đúng nghiệp vụ thực tế, nhiều người thao tác song song), hệ thống báo lỗi đúng ("Lô ... chỉ còn X, không đủ xuất Y") nhưng **không có cách nào "lấy lại lô mới" cho yêu cầu đó** — request bị treo PENDING vĩnh viễn, chỉ có thể "Từ chối" rồi tạo lại từ đầu. Với xưởng có nhiều người xuất kho cùng lúc, đây sẽ là tình huống thường gặp. Đề xuất: thêm nút "Lấy lại lô (refresh FIFO)" ngay tại dòng yêu cầu khi duyệt thất bại vì thiếu tồn.
3. **Chỉ admin/planner "Hoàn thành" được LSX, operator (người trực tiếp chạy máy, báo tiến độ) không có nút này** (`apps/web/src/app/(app)/work-orders/[id]/page.tsx:140`: `canComplete = isAdmin || planner`). Có thể là chủ đích (tách người thực thi khỏi người chốt sổ), nhưng nên xác nhận lại với anh Thang vì hiện tại giao diện không giải thích lý do ẩn nút với operator (không có tooltip/badge nào báo "cần Kế hoạch/Quản trị xác nhận") — dễ gây thắc mắc "sao tôi làm xong mà không bấm Hoàn thành được".
4. **Form "Đề xuất vật tư (DNVT)" không có ô chọn vật tư từ danh mục** (chỉ có ô text tên tự do) — đây chính là nguyên nhân dẫn tới lỗi P2 ở trên. Nếu muốn giữ đúng mẫu giấy DNVT gốc thì có thể chấp nhận, nhưng nên có autocomplete gợi ý item trùng tên khi gõ để giảm rủi ro tạo trùng.
5. **2 phiếu ISR-2609-0001/0002 bị tạo trùng** trong lúc test do nút "Gửi yêu cầu xuất kho" không có phản hồi rõ ràng ngay khi submit thành công lần đầu (phải quan sát kỹ để biết form đã đóng) — không phải lỗi hệ thống (do thao tác test lặp lại), nhưng cũng cho thấy toast thành công (`Đã tạo yêu cầu ISR-xxx`) hơi dễ bỏ lỡ nếu người dùng bấm nhanh 2 lần liên tiếp trong lúc mất kết nối chậm — nên cân nhắc disable nút ngay khi đang submit rõ ràng hơn (hiện tại có `disabled={submitting}` nhưng UI không đổi trạng thái nút đủ rõ).

---

## 5. Chứng từ demo đã tạo trên staging (giữ nguyên, không xoá)

| Loại | Mã | Ghi chú |
|---|---|---|
| Item RAW | `VT-2609-05EVH` — [DEMO] Nhôm | Tạo tự động khi convert PO |
| Item FG | `DEMO-FG-622660` — [DEMO] Thành phẩm LOOP-E2E — Hộp giảm tốc mini | Tạo thủ công qua UI |
| PR (DNVT) | `PR-2609-0090` / số giấy `4/PRD-MRF/0926` | CONVERTED |
| PO | `PO-2609-0090-01` | RECEIVED (120/100 — xem lỗi P1) |
| Phiếu xuất (PX) | `PX-2609-0001` (30 RAW, từ PR), `PX-2609-0002` (20 RAW, ISR production), `PX-2609-0003` (15 FG, ISR sales) | |
| Yêu cầu xuất kho (ISR) | `ISR-2609-0001` (PENDING, kẹt do lô hụt — xem Vướng #2), `ISR-2609-0002` (COMPLETED), `ISR-2609-0003` (COMPLETED) | |
| Lệnh sản xuất (WO) | `WO-2609-0001` (COMPLETED, FG 20), `WO-2609-0002` (COMPLETED thiếu SL có lý do, FG 4) | |
| Lô thành phẩm | `FG-WO-2609-0001` (còn 5), `FG-WO-2609-0002` (còn 4) | Cả 2 tại bin `A-01-3-02` |
| Phiếu giao hàng | `BBGH-2609-0001` | CONFIRMED |
| Hoá đơn mua | `HD-DEMO-755855` | PARTIAL, đã trả 10,000,000/32,400,000đ |

---

## 6. Ghi chú về sai lệch giữa kịch bản dự kiến và thực tế chạy

Trong lúc thao tác Playwright, 2 lần xảy ra "tự gây lỗi kịch bản" (không phải lỗi hệ thống) nhưng được giữ nguyên làm dữ liệu vì vẫn hợp lệ và cho ra bằng chứng tốt hơn dự kiến ban đầu:

- Nhận hàng đợt 2 đáng lẽ 40 (còn lại) nhưng script vẫn gửi 60 → phát hiện ra lỗi P1 (không chặn vượt SL) — coi như "may mắn tìm ra lỗi thật".
- Báo tiến độ WO-2609-0001 hai lần cộng dồn (10+10=20 thay vì 10) → khi hoàn thành, SL FG mặc định lấy đúng `goodQty=20` (không giới hạn theo `plannedQty`) — đây LÀ HÀNH VI ĐÚNG theo thiết kế (SL đạt có thể vượt kế hoạch, sản xuất dư), không phải lỗi, chỉ là không đúng ý định ban đầu của kịch bản test.

Cả 2 tình huống đều được đối chiếu số liệu đầy đủ ở mục 2, không có lệch tồn.
