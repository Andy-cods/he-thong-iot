# Đợt 3 — Tài chính + nguồn thu / nguồn chi (DOT3_PLAN)

> Lập 2026-09-27, đã đối chiếu code thật. Path tương đối `apps/web/src/` trừ khi ghi khác.
> Quyết định: Q7 (AUDIT §0/§5) · D9 = chỉ BANK / CASH / EXPENSE (không "Khác") · KHÔNG bật auto-AR/AP.
> Migration: `0063_*` (ALTER TYPE, NGOÀI transaction) → `0064_*` (BEGIN/COMMIT). `0062` để dành Đợt 2.

## 0. Kiểm chứng audit (so với code)

| ID | Kết luận | Bằng chứng thật |
|---|---|---|
| TC-02 | Đúng | `transactions/[id]/void` chỉ đổi 1 dòng VOID, không đụng allocation/HĐ |
| TC-03 | Đúng | 4 component gọi `useSuppliersList({pageSize:200})`, zod max 100 → 422 |
| TC-04 | Đúng | parser lặp MỌI sheet, sheet `HuongDan` dòng 1 thiếu cột → headerMismatch |
| TC-05 | Đúng (2 lớp) | sheet giữ `row` cũ + `optionalTrim` biến `undefined`→`null` nên PATCH phải gửi đủ field |
| TC-06 | Đúng | `fin_payment` không có cột trạng thái |
| TC-07 | Đúng | nhóm theo `notes`, UI lưu khách ở `supplier_id` |
| TC-08 | Đúng | mutation không `onError`, huỷ 1 click |
| (mới) | Đúng | `accountant` không có `supplier` → SupplierPicker 403 |
| TC-09 | Đúng | trùng `(payment_id, invoice_id)` → 23505 → 500 |
| TC-10 | Đúng | unique index có `supplier_id` NULL → không chặn |
| TC-11 | Đúng | PATCH dueDate không tính lại status |
| TC-12 | Đúng | job quét chỉ `UNPAID/PARTIAL`, lần 1 đã đổi OVERDUE → không bao giờ nhắc lại |
| TC-13 | Đúng | form gửi `new Date()` → ISO UTC → server `.slice(0,10)` lùi 1 ngày trước 7h sáng; dashboard `toISOString` |
| TC-14 | **Hoãn → Đợt 2** | D7 "Tạo HĐ mua từ PO" thuộc Đợt 2 (cột `fin_invoice.purchase_order_id` ĐÃ có sẵn từ 0055a) |
| TC-15 | Đúng | cancel kiểm `paidAmount` ngoài transaction |
| TC-16 | Đúng | sheet tìm HĐ cùng chiều giao dịch (sai chiều sau TC-01) trong 200 dòng |
| TC-17 | Đúng | worker không ghi `import_batch_id` |
| TC-18 | Đúng | `fuzzyFind` "contains" + cả TK đã ngưng |
| TC-19 | Đúng | `attachmentUrl` chuỗi tự do → `javascript:` trong `href` |
| TC-20 | Đúng | tái dùng lô `done` trong 60' → không có preview |
| TC-21 | Đúng | invalidate lúc enqueue, không phải lúc worker xong |
| TC-22 | Đúng | `1234567.5`→12345675; `31/02`→03/03; `new Date(y,m,d).toISOString()` lùi ngày |
| TC-23 | Đúng | hash không có chiều; 2 dòng giống hệt trong file → dòng 2 bị bỏ |
| TC-24 | Đúng | `z.coerce.boolean("false") = true` (cả `hasInvoice`) |
| TC-25 | Đúng | `paid >= total && total > 0` |
| TC-26 | Đúng | `Content-Disposition` chứa tên tiếng Việt → header không phải ByteString → 500 |
| TC-27 | Đúng | chỉ tin `file.type` |
| (UI) | Đúng | `fmtVND` rút gọn cho cả bảng |

## 1. Thiết kế Q7

- Enum `fin_account_type` + `EXPENSE` ("Tài khoản chi tiêu"). Nhãn: BANK "Ngân hàng", CASH "Quỹ tiền mặt", EXPENSE "TK chi tiêu".
- Form phiếu thu/chi/thanh toán: nhãn **"Nguồn thu" / "Nguồn chi"**, `<select>` có `<optgroup>` theo loại, option `Tên · 12.500.000 ₫`; dưới ô "Số dư sau phiếu: Y ₫" (đỏ nếu âm).
- **Chặn chi vượt số dư (server)**: `lockSpendSource(tx, accountId, amount, {allowOverdraft})` — `SELECT … FOR UPDATE` dòng `fin_account`, nguồn ngưng → 409 `FIN_ACCOUNT_INACTIVE`; `balance − amount < 0` và không override → 409 `FIN_INSUFFICIENT_BALANCE` "Nguồn chi X chỉ còn Y ₫". `allowOverdraft=true` chỉ có hiệu lực với admin (route tự xét role). Áp cho: phiếu chi tay, thanh toán chiều Chi, chân OUT của chuyển quỹ. Import Excel chỉ **cảnh báo** số dư âm.
- **Chuyển quỹ nội bộ**: `POST /api/finance/transfers {fromAccountId,toAccountId,amount,transactionDate,description?,allowOverdraft?}` → 1 transaction DB: khoá nguồn, mã `CQ-YYMM-NNNN` (genDocNo), chân OUT mã `CQ-…`, chân IN mã `CQ-…-N`, cùng `transfer_group_id`. Trigger số dư tự cộng/trừ 2 nguồn. Loại khỏi tổng thu/chi ở 3 điểm: `getFinTransactionStats`, `getCashflowSeries`, `getCashflowTotals` (`transfer_group_id IS NULL`). Huỷ 1 chân = huỷ cả nhóm. Không cho sửa danh mục chân chuyển quỹ.
- Import: cột "Nguồn" (vẫn nhận "Tài khoản"), khớp **chính xác** mã hoặc tên (bỏ dấu, không phân biệt hoa thường) trên nguồn **đang hoạt động**.

## 2. Migrations

- `0063_fin_account_expense.sql` — DO-loop mọi schema có `fin_account_type` → `ALTER TYPE … ADD VALUE IF NOT EXISTS 'EXPENSE'`. KHÔNG BEGIN.
- `0064_fin_transfer_payment_status.sql` — BEGIN; `fin_transaction.transfer_group_id UUID` + partial index + CHECK (chân chuyển quỹ không gắn HĐ/thanh toán); `fin_payment.status VARCHAR(16) DEFAULT 'POSTED' CHECK IN (POSTED,VOID)` + `voided_at`; backfill VOID cho payment mà mọi txn đã VOID; COMMIT.

## 3. Sửa theo mục

- TC-02: void txn có `paymentId` → gọi `voidPaymentWithAllocations` (huỷ cả đợt, HĐ quay lại chưa trả); UI confirm nói rõ.
- TC-03/(mới): list HĐ/thanh toán trả `supplierName` (LEFT JOIN) → bỏ `useSuppliersList(200)`; matrix `accountant.supplier=["read"]` (+ can.test).
- TC-04: chọn sheet dữ liệu = sheet đầu tiên có đủ cột bắt buộc ở dòng 1 (ưu tiên tên `GiaoDich`); không sheet nào → báo thiếu cột theo sheet đầu.
- TC-05: update schema giữ `undefined` (không ép `null`); sheet gửi đúng field đổi + giữ bản mới nhất từ response.
- TC-06: `fin_payment.status`; list hiện chip "Đã huỷ", ẩn nút huỷ; void lần 2 → 409.
- TC-07: nhóm phải thu theo `supplier_id` (tên từ `supplier`), fallback `notes`; click mở danh sách HĐ.
- TC-08: `onError` toast mọi mutation + lỗi 422 lấy câu tiếng Việt đầu tiên; `ConfirmActionDialog` cho huỷ giao dịch / thanh toán / hoá đơn / ẩn nguồn.
- TC-09: repo gộp allocation trùng HĐ; UI không cho chọn lại HĐ đã chọn.
- TC-10: tạo HĐ trong transaction + advisory lock theo (chiều, số HĐ) + kiểm trùng `IS NOT DISTINCT FROM supplier` (bỏ HĐ đã huỷ) → 409.
- TC-11: PATCH HĐ → `recalcInvoicePaidAmount` cùng transaction.
- TC-12: job nhắc gồm cả `OVERDUE`, nhắc lại mỗi 7 ngày.
- TC-13: `isoDateVN()`/`vnToday()` ở server + `toDateInputValue` giờ VN ở client; form mặc định chuỗi ngày VN.
- TC-15: cancel trong transaction `FOR UPDATE`.
- TC-16: sheet dùng `useFinInvoiceDetail(invoiceId)`.
- TC-17: worker ghi `import_batch_id`. TC-18: xem Q7. TC-19: zod `attachmentUrl` chỉ nhận `/api/finance/attachments/<uuid>.<ext>` + UI chỉ render URL an toàn.
- TC-20: bỏ tái dùng lô. TC-21: invalidate khi lô `done`. TC-22: `parseImportAmount`/`parseImportDate` thuần. TC-23: hash gồm chiều + số thứ tự lần xuất hiện trong file (vẫn nhận hash cũ cho lần xuất hiện đầu để không nhập lại file cũ).
- TC-24: parse boolean chuỗi đúng. TC-25: tổng 0 → PAID. TC-26: `Content-Disposition` ASCII + `filename*`. TC-27: soi magic bytes + `nosniff`.
- (UI): `fmtVND` đủ số; `fmtVNDShort` (dấu phẩy) chỉ cho thẻ KPI; trục biểu đồ `1,5 tr`; bảng Thu chi/HĐ: header dính + dòng tổng trang; HĐ thêm cột "Còn nợ"; thông báo lỗi tiếng Việt.

## 4. Test
- vitest: balance-after/evaluateSpend, cặp chân chuyển quỹ, parse số/ngày, chọn sheet bằng chính template, dedupe có chiều + trùng hợp lệ, magic bytes, FakeDb: chi vượt số dư 409 + admin override, gộp allocation trùng, HĐ 0đ PAID, void payment → status VOID.
- Smoke `plans/v4.1-audit-hoan-thien/sql/dot3_smoke.sql` (ROLLBACK): EXPENSE dùng được, trigger thật cộng/trừ 2 nguồn khi chuyển quỹ, VOID cả nhóm hoàn số dư, CHECK chân chuyển quỹ, `fin_payment.status`.
