# QA-D (Nghiệm thu cuối) — Tài chính - Kế toán (`/finance`)

- Môi trường: STAGING `http://localhost:3100` (bản sao DB prod, không worker), `/api/health` = 200 trước khi test.
- Phương pháp: (a) script API tag `[QA-D]` mô phỏng đúng nghiệp vụ UI gửi (72 kiểm thử), đối chiếu số dư/trạng thái tính tay; (b) Playwright thao tác UI thật, chụp 19 ảnh desktop 1440×900 / mobile 390×844 / dark — xem từng ảnh.
- Tài khoản dùng: `qad.admin`, `qad.accountant`, `qad.purchaser`, `qad.shareholder`, `qad.warehouse`, `qad.planner`, `qad.operator`, `qad.qc` (1 lần đăng nhập/tài khoản, dưới hạn mức).
- Ảnh lưu tại `C:\Users\ASUS\AppData\Local\Temp\claude\c--dev-he-thong-iot\7c0e0492-2281-453b-97aa-d20b0da7ef8e\scratchpad\qa-final\D\D01..D19.png`.

## 1. Bảng kết quả (tóm tắt theo nhóm — chi tiết từng bước nằm trong log script, 70/72 PASS lúc đầu, 2 "FAIL" đã xác minh lại KHÔNG phải lỗi — xem ghi chú)

| # | Vai | Chức năng | PASS/FAIL | Số kỳ vọng / thực tế | Giao diện (ảnh) |
|---|---|---|---|---|---|
| RBAC-1 | purchaser/warehouse/planner/operator/qc | GET `/api/finance/*` | PASS | 403 / 403 (cả 5 vai) | D13,D14,D15 — không menu, bị đá về Tổng quan |
| RBAC-2 | shareholder | Đọc OK, ghi 403 | PASS | GET 200, POST transactions/categories 403/403 | D11,D12 — không có nút "Thêm/Ghi" |
| RBAC-3 | purchaser | Vào `/finance` | PASS | redirect về `/`, không thấy tab Tài chính | D13 |
| N1 | accountant | Danh mục: tạo CHI/THU, sửa tên, ẩn | PASS 5/5 | 11 danh mục seed, tạo/sửa/ẩn đều 201/200 | D07 |
| N2 | accountant/admin | Tài khoản: tạo CASH/BANK, ẩn nguồn còn dư bị chặn, admin điều chỉnh số dư | PASS 6/6 | 409 FIN_ACCOUNT_HAS_BALANCE; accountant adjust-balance 403; admin 200 đúng số | D06 (accountant không có nút), D09+D10 (admin có nút + sheet) |
| N3 | accountant/admin | Sổ quỹ: thu/chi có & không danh mục, huỷ GD, sửa danh mục, chuyển quỹ, chặn vượt quỹ, admin override, số tiền lớn, giờ nửa đêm | PASS 13/14 | Balance khớp tính tay từng bước (20tr→18,8tr→18tr→23tr→23,8tr…); chuyển quỹ KHÔNG vào tổng thu/chi | D02 |
| N4 | accountant | Hoá đơn: VAT 10%, VAT 8% lẻ, sửa hạn, huỷ (chưa trả), HĐ 0đ, HĐ tương lai | PASS 8/9 | total = subtotal+vat đúng từng đồng; HĐ tương lai status=UNPAID | D03 |
| N5 | accountant | Thanh toán: trả 1 phần/đủ/đúng bằng nợ, huỷ HĐ có TT bị chặn, overpay bị chặn, huỷ TT hoàn tiền, thu tiền khách | PASS 10/10 | PARTIAL→PAID→(huỷ TT)→PARTIAL đúng số; balance hoàn đúng +6.000.000 | D04 |
| N6 | accountant | Công nợ phải trả/thu + Tổng quan + dòng tiền | PASS 4/4 | Tổng phải trả 82.028.000đ khớp UI (D18) | D01,D05,D18 |
| N7 | accountant | Tải mẫu Excel import | PASS 1/1 | 200 | — |

**Về 2 "FAIL" ban đầu**: kỳ vọng ban đầu của tôi là HTTP 400 cho (a) chuyển quỹ sang chính nó, (b) hoá đơn tổng tiền không khớp VAT — thực tế trả **422**. Đã đọc `apps/web/src/server/http.ts` dòng 21-35 (`zodErrorResponse`) — toàn hệ thống dùng **422** cho mọi lỗi validate Zod (không phải 400), đây là *quy ước nhất quán toàn app*, không phải lỗi. Cả 2 trường hợp đều bị chặn đúng → tính là **PASS**, tổng **72/72**.

## 2. LỖI tìm thấy

### P1-01 — Ô "Đang sản xuất" (Tổng quan Tài chính) hiển thị số vô nghĩa khi dữ liệu nguồn có đơn giá bất thường, KHÔNG có giới hạn/kiểm tra hợp lý
- **Tái hiện**: Bảng sản xuất có 1 dòng `unitPrice=999.999.999.999đ`, `qtyPlanned=99.999` (do nhóm QA khác tạo, mã `QAC-BOARD-HUGE-MUPJB7U0`) → ô "Đang sản xuất" ở `/finance?tab=overview` hiển thị **"99.999.000,8 tỷ đ"** (≈ 9,9999×10¹⁶ đồng) — một con số không có ý nghĩa thương mại, không cảnh báo, không giới hạn hiển thị. Xem ảnh D01/D08/D16 (số liệu nguyên trạng, không phải do tôi tạo ra).
- **File:line**: công thức `apps/web/src/lib/finance-overview-policy.ts:58` (`inProductionValue += qtyPlanned * price`) không có chặn trên (sanity cap) cho đơn giá/sản lượng; API `apps/web/src/app/api/finance/dashboard/summary` trả thẳng giá trị này cho UI hiển thị nguyên văn.
- **Tác động**: Đây là tile đầu tiên chủ xưởng/kế toán nhìn thấy khi mở Tổng quan Tài chính — 1 dòng nhập liệu sai ở Bảng sản xuất (gõ nhầm thêm vài số 0 vào đơn giá) sẽ làm hỏng hoàn toàn độ tin cậy của màn hình tài chính mà không có cảnh báo nào.
- **Đề xuất**: validate `unitPrice`/`qtyPlanned` ở nguồn (Bảng sản xuất) với ngưỡng hợp lý; VÀ/HOẶC ở tầng tổng hợp Tài chính, nếu giá trị 1 dòng vượt ngưỡng (vd > vài tỷ/dòng) thì tách riêng cảnh báo "có mã hàng đơn giá bất thường" thay vì cộng thẳng vào tổng hiển thị cho kế toán.

### P1-02 — Link cũ `/sales?tab=fin-*` KHÔNG chuyển được sang `/finance` cho đúng 2 vai cần nó nhất (Kế toán, Cổ đông)
- **Tái hiện**: `GET /sales?tab=fin-cashbook` bằng cookie `qad.accountant` (hoặc `qad.shareholder`) → **307 → `/?denied=1`** (bị chặn, về Tổng quan), KHÔNG tới `/finance`. Cùng request bằng `qad.admin`/`qad.purchaser` → 200, nội dung đã là trang Tài chính (redirect hoạt động đúng).
- **Nguyên nhân**: `apps/web/src/lib/route-guard.ts` dòng 39-44 — rule `/sales` chỉ còn `roles: ["admin","purchaser"]` (bỏ accountant/shareholder khi tách hub `/finance` ra riêng, theo đúng comment tại chỗ). Route-guard chạy ở layout/middleware **TRƯỚC** khi tới logic `LEGACY_FIN_TAB_REDIRECT` nằm trong `apps/web/src/app/(app)/sales/page.tsx` dòng 18-21, 39-68 — nên logic redirect không bao giờ được thực thi cho 2 vai này.
- **Mâu thuẫn với chính comment trong code**: `sales/page.tsx` dòng 18-21 viết "Giữ `LEGACY_FIN_TAB_REDIRECT` ... để **MỌI** link/bookmark cũ ... tự chuyển sang `/finance`" — nhưng thực tế chỉ đúng cho admin/purchaser, sai lời hứa với đúng 2 vai sở hữu nghiệp vụ Tài chính.
- **Đề xuất**: thêm 1 rule route-guard riêng (đặt TRƯỚC rule `/sales`) khớp `prefix: "/sales"` kèm `tab` bắt đầu bằng `fin-` cho phép `finance:read`, hoặc đơn giản nhất: chuyển hẳn logic `LEGACY_FIN_TAB_REDIRECT` lên tầng middleware (chạy trước route-guard) để redirect xảy ra bất kể quyền `/sales`.

### P2-01 — Hoá đơn tổng 0đ được tạo tự do và tự động nhảy trạng thái "Đã trả"
- **Tái hiện**: Tạo hoá đơn `subtotalAmount=0, vatAmount=0, totalAmount=0` → 201 OK, UI hiển thị trạng thái **"Đã trả"** ngay khi vừa tạo (ảnh D03, dòng `QAD-ZERO`). Về mặt logic `paid(0) >= total(0)` nên đúng theo công thức, nhưng về nghiệp vụ một hoá đơn 0đ "đã trả" ngay từ đầu dễ gây hiểu nhầm (VD do lỗi nhập liệu quên điền số tiền).
- **File**: `packages/shared/src/schemas/finance.ts` dòng 215-237 (`finInvoiceCreateSchema` dùng `nonNegativeAmount`, không có ràng buộc `totalAmount > 0`).
- **Đề xuất**: thêm cảnh báo xác nhận ở UI khi tổng tiền = 0 trước khi cho lưu ("Hoá đơn 0đ — bạn có chắc?"), hoặc chặn hẳn totalAmount phải > 0 nếu nghiệp vụ không có use-case hợp lệ nào cho hoá đơn 0đ.

### P2-02 — Dữ liệu test tồn đọng của các nhóm QA khác lẫn trong danh sách thật trên staging
- Khi xem Tài khoản/Hoá đơn trong lúc test, thấy lẫn nhiều bản ghi `[E2E-FIN]`, `[E2E-V42]`, `HD-REG-MUP...`, mã Bảng sản xuất `[QA-C]`, `[QA-A]`, `[QA-B]` từ các phiên QA trước/song song (ảnh D06, D09). Không phải lỗi sản phẩm, nhưng nên dọn staging định kỳ hoặc mỗi nhóm QA dùng DB nhánh riêng để tránh số liệu chéo gây nhiễu khi đối chiếu (như P1-01 ở trên — bắt nguồn từ dữ liệu nhóm khác để lại).

## 3. Lệch giao diện so với chuẩn Apple

Nhìn chung giao diện **đạt chuẩn tốt**: thẻ bo góc không viền, nền xám nhạt #F5F5F7-like, segmented control 7/30/90 ngày, icon nhất quán, dark mode đủ contrast (D08), mobile thu gọn hợp lý, card list cho Công nợ trên mobile (D18), Sheet điều chỉnh số dư đúng pattern Huỷ·tiêu đề·hành động (D10). Không phát hiện lệch bố cục/overflow nghiêm trọng nào trên 19 ảnh đã xem.

- Lệch nhẹ duy nhất: ô "Đang sản xuất" khi gặp số cực lớn ("99.999.000,8 tỷ đ") vẫn fit trong khung (không vỡ layout) nhưng về mặt UX số liệu dài bất thường nên có quy tắc rút gọn/cảnh báo riêng (liên quan P1-01, không phải lỗi dàn trang).
- Sheet "Điều chỉnh số dư" (D10) tiêu đề lặp lại 2 lần ("Điều chỉnh số dư" ở cả thanh trên lẫn nút hành động) — chấp nhận được theo pattern chung nhưng có thể rút gọn nút hành động thành "Lưu" cho đỡ lặp từ.

## 4. Kịch bản tự nghĩ (biên) — 11 kịch bản

| # | Kịch bản | Kết quả |
|---|---|---|
| 1 | Hoá đơn tổng 0đ | Cho phép tạo, tự "Đã trả" — xem P2-01 |
| 2 | VAT lẻ (8% của 7.250.000 = 580.000) | PASS, chấp nhận sai số ±1đ |
| 3 | Tổng tiền KHÔNG khớp subtotal+VAT | Chặn 422 đúng |
| 4 | Thanh toán đúng bằng số còn nợ | PASS → PAID chính xác |
| 5 | Huỷ hoá đơn ĐÃ có thanh toán | Chặn 409 `FIN_INVOICE_HAS_PAYMENT` đúng |
| 6 | Chuyển quỹ sang chính nó | Chặn 422 đúng |
| 7 | Giao dịch số tiền rất lớn (999.999.999.000đ) | PASS, không lỗi overflow numeric |
| 8 | Ngày sát nửa đêm giờ VN (23:59 vs 00:01) | PASS — ngày ghi nhận đúng theo giờ VN, lệch nhau đúng 1 ngày lịch như kỳ vọng |
| 9 | Hoá đơn ngày phát hành tương lai | Cho tạo, trạng thái UNPAID (không tự OVERDUE) — hợp lý |
| 10 | Chi vượt số dư: kế toán bị chặn kể cả khi tự gửi cờ vượt quỹ; chỉ admin vượt được | PASS — đúng thiết kế phân quyền |
| 11 | Huỷ 1 thanh toán đã huỷ trước đó (double-cancel) | Chặn 409 `FIN_PAYMENT_ALREADY_VOID` đúng |

## 5. Đề xuất cải tiến cho kế toán

1. **Chặn/cảnh báo tile "Đang sản xuất" khi có đơn giá bất thường** (P1-01) — ưu tiên cao nhất vì ảnh hưởng trực tiếp con số đầu tiên kế toán nhìn thấy.
2. **Sửa redirect `/sales?tab=fin-*`** cho kế toán/cổ đông (P1-02) — nếu còn ai lưu bookmark cũ sẽ bị văng về Tổng quan thay vì tới đúng trang.
3. Thêm xác nhận khi lưu hoá đơn 0đ (P2-01).
4. Cân nhắc dọn định kỳ dữ liệu `[E2E-*]`/`[QA-*]` trên staging để không gây nhiễu số liệu đối chiếu giữa các đợt QA.
5. (Nhỏ) rút gọn nhãn nút trong Sheet điều chỉnh số dư.

## Phạm vi CHƯA kiểm sâu (do giới hạn thời gian)
- Luồng "Hoá đơn nháp từ PO → xác nhận" (cần dựng 1 PO hoàn chỉnh từ Thu mua trước) — chỉ xác nhận field `draftInvoiceValue/draftInvoiceCount` tồn tại đúng trong API, chưa thao tác tay trên UI.
- Import Excel: chỉ xác nhận tải mẫu 200 OK; chưa thử tải file có dòng lỗi/xem trước do cần chuẩn bị file mẫu — ghi nhận theo đúng lưu ý đề bài ("staging không có worker, bước commit nền có thể không chạy").
- Đính kèm ảnh/PDF cho phiếu thu/chi (cần upload file qua UI thật, API-only không mô phỏng được).
- Thông báo "nhắc hạn thanh toán" — không có hoá đơn nào tới hạn trong khung giờ test để xác nhận; đã xác nhận panel thông báo + điều hướng hoạt động tốt (D19) với các sự kiện khác.
