# Đợt 2 — Thu mua PR → PO → Nhận hàng → HĐ mua (DOT2_PLAN)

> Lập 2026-09-27, đã đối chiếu code thật (nhánh `fix/v4.1-dot2-thu-mua`). Path tương đối `apps/web/src/` trừ khi ghi khác.
> Quyết định: **D7** = không tự sinh HĐ; nút "Tạo HĐ mua từ PO" (PO PARTIAL/RECEIVED/CLOSED) tạo HĐ mua NHÁP điền sẵn, chặn HĐ thứ 2 cho cùng PO (409 + link HĐ cũ).
> **D8** = người tạo không tự duyệt PR/PO của mình (trừ admin); chỉ purchaser/admin đổi đơn giá/VAT PO.
> Ràng buộc: Đợt 3 (Tài chính) chạy song song → KHÔNG sửa `components/finance/*`, repo tài chính cũ; D7 nằm trong file mới `server/repos/poInvoice.ts` + route mới. **Không đổi `rbac/matrix.ts`** (tránh xung đột; quyền D7/D8 kiểm theo vai trò trong code, admin luôn qua). Migration duy nhất: `0062_dot2_thu_mua.sql`.

## 0. Kiểm chứng audit (claim → thực tế)

| ID | Kết luận | Ghi chú |
|---|---|---|
| TM-01/08 | Đã xong Đợt 0 | `createPO` khoá PR + CONVERTED; `createPOFromPR` FOR UPDATE |
| TM-02 | **Đã xong (Đợt 1a KHO-08)** | `postReceivingAtomic` khoá PO, chỉ SENT/PARTIAL/RECEIVED; tab "Nhận nhanh" ẩn khi DRAFT, read-only khi RECEIVED/CLOSED/CANCELLED |
| TM-03 | Đúng | trang sửa PO không gửi `snapshotLineId`/`spec`/ETA dòng; `updatePOWithLines` không ghi `spec` |
| TM-04 | Đúng | `Number(l.taxRate) \|\| 8` → 0% thành 8% |
| TM-05 | Đúng | `notifyPRApproved` chỉ báo người lập |
| TM-06 | Đúng + rộng hơn | from-shortage tạo DRAFT không submit; route `/submit` không bắn `notifyPRSubmitted`; trang PR không có nút Gửi |
| TM-07 | Đúng | submit-approval không notify; tạo PO kèm duyệt (admin) / kèm gửi duyệt cũng không notify |
| TM-09 | Đúng | override `lineId` không lọc theo `prId`; body lỗi bị nuốt → convert "im lặng" không override |
| TM-10 | Đúng | PO từ PR: giá 0, `qty` thay `approvedQty`; duyệt được PO 0đ |
| TM-11/12 | Đúng | status vẫn `SUBMITTED` sau Kho duyệt (bước ở `approvalStep`) → sửa được; PATCH bỏ `referenceNote/deliveryDate/approvedQty` |
| TM-13 | Đúng | mark-completed/mark-issued không kiểm trạng thái PR |
| TM-14 | Đúng | nhận nhanh đủ → không `markPRGoodsReceived` |
| TM-15 | KHO-09 xong Đợt 1 (chọn dòng theo poLineId); **approve 95% gộp vẫn sai** | sửa theo từng dòng |
| TM-16 | Đúng | NG vẫn cộng `received_qty` và tính "đủ" |
| TM-17 | Đúng | không có huỷ/đóng PO |
| TM-18/19 | = D7 / D8 | |
| TM-20 | Đúng | tiền ghi chuỗi `fmtVND`, cột "Mã PR" in UUID |
| TM-21 | Nhỏ | nhãn "Số phiếu (dự kiến)" — xem §1.9 |
| TM-22 | Đúng | bước 1 báo cả Thu mua (họ chỉ hành động bước 3) |
| TM-23 | Đúng | `qty*1.1` float |
| TM-24 | Đúng | nhóm phiếu nhập theo ngày UTC (`toISOString`), tiêu đề PR thiếu hụt, SKU tự sinh |
| TM-25 | Đúng | `new Date("abc").toISOString()` → 500 ở list/stats PO |
| TM-26 | Đúng | find-or-create NCC theo tên + auto-pick `item_supplier` khớp cả NCC `is_active=false` |
| Dashboard | Đúng | thẻ "Đơn hàng đang sản xuất" = dòng vật tư snapshot; Đặt mua/Nhận hàng % từ snapshot; tab BOM "Mua sắm" lọc qua đơn hàng bán (PO từ dòng BOM không có); link "PO quá hạn" → redirect mất `?overdue` |

## 1. Thiết kế

### 1.1 Chính sách thuần `lib/procurement-policy.ts` (dùng chung server + client, có test)
- `isSelfApprovalBlocked({ creatorId, actorId, actorRoles })` — true nếu actor = creator và không có admin (D8).
- `canEditPoPrices(roles)` — admin | purchaser (D8).
- `detectPoPriceChanges(before, after)` → `{ changed, added }` (so theo itemId; dòng mới có giá > 0 tính `added`).
- `findUnpricedPoLines(lines)` → số dòng giá ≤ 0 (TM-10, chặn gửi duyệt/duyệt/tạo-kèm-duyệt).
- `evaluatePoReceipt(lines, threshold)` — TỪNG dòng: `accepted = received − rejected(QC FAIL)`, đủ khi `accepted ≥ ordered × threshold`; trả dòng thiếu (TM-15/16).
- `nextPoStatusAfterReceipt(lines)` → `RECEIVED | PARTIAL | null` theo accepted (auto-status).
- `buildPoInvoiceDraft(po, lines, today)` (D7) → subtotal/VAT/total theo **SL đã nhận đạt** × đơn giá, `vatRate` = thuế suất chung nếu mọi dòng cùng, không thì thuế suất hiệu dụng (2 số lẻ); `dueDate` từ điều khoản "Net N"/"N ngày".
- `parsePaymentTermDays("Net 30")` → 30.
- `prLineToPoLine(prLine)` (TM-10) → `{ orderedQty: approvedQty>0 ? approvedQty : qty, unitPrice: estimatedUnitPrice ?? 0 }`, `approvedQty = 0` → bỏ dòng.
- `vnToday(now)` (TM-24) → `YYYY-MM-DD` giờ +07.
- `parseDateParam(s)` (TM-25) → `Date | null | "invalid"`.

### 1.2 PR (TM-05/06/09/11/12/13/22/23, D8)
- `dept-approve`, `director-approve`: 403 `SELF_APPROVAL` nếu người duyệt = người lập (admin miễn). UI ẩn nút + ghi chú.
- `notifyPRApprovedToPurchasing` (mới): duyệt cuối → fan-out Thu mua "cần tạo PO" (TM-05). Gọi ở director/quick-approve.
- `notifyPRSubmitted`: bỏ fan-out Thu mua ở bước 1 (TM-22 — Thu mua đã nhận ở bước 2 `PR_DEPT_APPROVED`).
- `/submit` bắn `notifyPRSubmitted`; `from-shortage` auto-submit như POST thường; nút **"Gửi phiếu"** trên trang PR khi DRAFT (TM-06).
- PATCH PR: chỉ khi `approvalStep ∈ {DRAFT, SUBMITTED}` (TM-11); header + lines trong 1 transaction; giữ `referenceNote/deliveryDate/approvedQty` (TM-12).
- mark-issued / mark-completed: chỉ PR `APPROVED/CONVERTED` (TM-13); mark-completed yêu cầu đã xuất kho (khớp UI).
- `qty*1.1` làm tròn 4 số lẻ (TM-23).

### 1.3 PO từ PR (TM-09/10/26)
- `createPOFromPR`: override chỉ áp dòng thuộc PR (`WHERE pr_id`), dòng lạ → lỗi `LINE_NOT_IN_PR` (422); body JSON sai → 422 (không nuốt).
- Dòng PO mang `unitPrice = estimatedUnitPrice`, `orderedQty = approvedQty||qty`, VAT 8, `lineTotal` + `totalAmount` header.
- NCC nhập tay / auto-pick `item_supplier` chỉ NCC `is_active` (TM-26).
- Wizard "Tạo PO từ PR" điền giá dự kiến + SL duyệt + snapshotLineId + quy cách.

### 1.4 PO (TM-03/04/07/10/17/19/20/25, D8)
- Sửa PO nháp giữ `snapshotLineId`, `spec`, ETA dòng (schema + repo + trang) (TM-03); VAT 0 hợp lệ (TM-04).
- PATCH: đổi đơn giá/VAT (dòng cũ) hoặc dòng mới có giá mà không phải admin/purchaser → 403 `PRICE_EDIT_FORBIDDEN` (D8). UI khoá ô giá cho vai trò khác.
- approve PO: người gửi duyệt/tạo = người duyệt và không phải admin → 403 (D8; hiện chỉ admin có `approve:po`, guard phòng override quyền).
- Chặn gửi duyệt / duyệt / tạo-kèm-duyệt khi có dòng giá 0 → 409 `UNPRICED_LINES` (TM-10).
- Notify: gửi duyệt (và tạo kèm gửi duyệt) → admin `PO_APPROVAL_REQUESTED` (email); tạo kèm duyệt (admin) → Kho `PO_SENT` (TM-07).
- **Huỷ PO** `POST /api/purchase-orders/[id]/cancel` `{reason}`: DRAFT/SENT chưa nhận gì → CANCELLED (purchaser/admin).
  **Đóng PO** `POST /api/purchase-orders/[id]/close` `{reason}`: PARTIAL/RECEIVED → CLOSED, đánh dấu PR đã nhận hàng (TM-17). Nút trên trang PO.
- Export Excel: cột tiền kiểu số (`numFmt '#,##0'`), cột "Mã PR" = số phiếu (TM-20).
- `?from=abc` → 400 (TM-25). Thêm lọc `overdue=1` cho list/stats.

### 1.5 Nhận hàng (TM-14/15/16/24)
- SQL `rejected` theo dòng PO = Σ `inbound_receipt_line.received_qty` có `qc_status='FAIL'`.
- `postReceivingAtomic`: trần 120% + tự chuyển RECEIVED/PARTIAL tính trên **accepted**; header phiếu nhập nhóm theo ngày +07.
- `/receiving/[poId]/approve`: kiểm TỪNG dòng accepted ≥ 95% → 409 kèm danh sách dòng thiếu.
- Nhận nhanh làm PO → RECEIVED: `markPRGoodsReceived` (TM-14).
- QC kết luận FAIL/PASS sau đó: route QC gọi `recomputePoReceiptStatus` (transaction riêng, sau commit — tránh đảo thứ tự khoá PO ↔ phiếu nhập) → RECEIVED ⇄ PARTIAL.

### 1.6 D7 — HĐ mua từ PO (`server/repos/poInvoice.ts`, route `api/purchase-orders/[id]/invoice`)
- `GET` → HĐ (không huỷ) gắn PO hoặc null + bản nháp tính trước. Quyền: `read:finance` hoặc purchaser.
- `POST` → tạo `fin_invoice` `direction=IN, status=DRAFT, purchase_order_id`, NCC, số HĐ mặc định = số PO (kế toán sửa khi xác nhận), ngày HĐ hôm nay (+07), hạn TT theo điều khoản. Khoá PO `FOR UPDATE` + kiểm HĐ đã có → 409 `PO_INVOICE_EXISTS` `{ invoiceId, invoiceNo, link }`; unique index là chốt cuối. Chỉ PO PARTIAL/RECEIVED/CLOSED, có SL nhận đạt > 0. Quyền: `create:finance` (admin/accountant) hoặc purchaser.
- `PATCH` → sửa HĐ NHÁP (số HĐ NCC, ngày, hạn TT, tạm tính, VAT, ghi chú) + `confirm:true` → DRAFT → UNPAID (OVERDUE nếu quá hạn) = ghi công nợ phải trả. Quyền `update:finance` (admin/accountant).
- UI: `components/procurement/PoInvoicePanel.tsx` trên trang PO (tab Thông tin): nút "Tạo HĐ mua từ PO" → tạo + cuộn tới panel HĐ; form xác nhận; link "Mở ở Tài chính" (`/sales?tab=fin-cashbook&sub=invoices&invoiceId=`).
- Đợt 3 lưu ý: HĐ NHÁP không vào công nợ (aging lọc UNPAID/PARTIAL/OVERDUE) — đúng ý; `InvoiceDetailSheet` có thể thêm đọc `?invoiceId=`.

### 1.7 Dashboard
- Thẻ 1 đổi nhãn "Linh kiện sẵn sàng" (dòng vật tư) — đúng dữ liệu.
- Đặt mua % = PO đã gửi NCC (SENT/PARTIAL/RECEIVED/CLOSED) / PO không huỷ; Nhận hàng % = dòng PO đã nhận đạt đủ / dòng PO đã gửi. Loader chung `server/services/dashboardOverview.ts` cho `page.tsx` + API (DRY), cache key `v2`.
- "PR chờ duyệt" đếm SUBMITTED (bước 1-2), link lọc đúng; "PO quá hạn" → `/sales?tab=po&overdue=1` (POTab đọc `overdue`, chip bỏ lọc).
- Tab BOM "Mua sắm": PO tạo từ dòng BOM ghi `metadata.bomTemplateId/bomLineId`; lọc `bomTemplateId` nhận cả metadata; migration backfill từ `audit_event`.

## 2. Migration `packages/db/migrations/0062_dot2_thu_mua.sql`
1. Partial unique `fin_invoice_po_active_uk ON app.fin_invoice(purchase_order_id) WHERE purchase_order_id IS NOT NULL AND direction='IN' AND status<>'CANCELLED'` — bỏ qua (NOTICE) nếu dữ liệu cũ đã trùng.
2. Index `inbound_receipt_line_po_line_fail_idx (po_line_id) WHERE qc_status='FAIL'`.
3. Backfill `purchase_order.metadata.bomTemplateId/bomLineId` từ `audit_event` (CREATE purchase_order có `after_json.bomLineId`).
Không đổi enum, không đổi cột.

## 3. Test (vitest, không DB)
`lib/procurement-policy.test.ts`: self-approval, quyền giá, phát hiện đổi giá, dòng chưa giá, per-line đủ (dòng 0 không qua, NG không tính), trạng thái sau nhận, map HĐ từ PO (VAT 0, VAT trộn, điều khoản Net 30), PR line → PO line (approvedQty 0 bỏ), vnToday, parseDateParam.

## 4. Smoke SQL (ROLLBACK) `plans/v4.1-audit-hoan-thien/sql/dot2_smoke.sql`
Gọi thật `app.gen_pr_code()`, `app.gen_pr_paper_form_no()`, `app.reservation_lock()`, `pg_advisory_xact_lock`, `FOR UPDATE` PO, unique index HĐ/PO (bắt 23505), truy vấn accepted/rejected, backfill metadata, aging không đếm DRAFT.
