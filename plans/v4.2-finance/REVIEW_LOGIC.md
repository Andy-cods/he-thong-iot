# Review nghiệp vụ + code — Module Tài chính (2026-09-30)

> Phạm vi: `components/finance/*`, `app/api/finance/**`, `server/repos/fin*.ts`,
> `server/repos/poInvoice.ts`, `server/repos/poPrices.ts`, `lib/finance.ts`,
> `lib/procurement-policy.ts`, schema `packages/db/src/schema/finance.ts`,
> migrations `0055-0064`, RBAC `packages/shared/src/rbac/matrix.ts`.
> Đã đọc `DOT2_PLAN.md`, `DOT3_PLAN.md`, `AUDIT.md` trước khi soát — KHÔNG lặp
> lại TC-02..TC-27 đã sửa ở Đợt 3, trừ 1 mục bên dưới có bằng chứng lỗi vẫn còn
> **sau** bản sửa (migration 0064).
> Đã kiểm chứng trực tiếp trên DB prod (chỉ SELECT, qua SSH) — 2 phát hiện P0
> dưới đây có dữ liệu thật đang sai trên `mes.songchau.vn`, không phải giả định.

---

## P0 — Sai tiền / chặn vận hành

### P0-1. Migration `0064` backfill VOID cho `fin_payment` nhưng không dọn `fin_payment_allocation` → 4 hoá đơn đang hiện SAI số đã trả trên production ngay lúc này

- **File**: `packages/db/migrations/0064_fin_transfer_payment_status.sql` dòng ~52
  (`UPDATE fin_payment SET status='VOID' WHERE ...` — backfill payment mà mọi
  transaction con đã VOID trước khi có cột `status`).
- **Cơ chế lỗi**: `recalcInvoicePaidAmount()` (`apps/web/src/server/repos/finInvoices.ts:222-256`)
  tính `paidAmount = SUM(fin_payment_allocation.amount WHERE invoice_id = X)` —
  **không lọc theo trạng thái của `fin_payment`** (bảng `fin_payment_allocation`
  không có cột status, chỉ có FK `payment_id`). Khi migration 0064 chỉ đổi
  `fin_payment.status → VOID` mà không xoá `fin_payment_allocation` tương ứng
  (khác với hàm `voidPaymentWithAllocations()` ở `finPayments.ts:273-313` — hàm
  này XOÁ allocation đúng cách khi void qua UI), các allocation cũ vẫn được
  cộng vào `paidAmount` của hoá đơn như thể khoản thanh toán còn hiệu lực.
- **Bằng chứng trên DB prod** (`docker exec iot_postgres psql ... SELECT`):
  5 dòng `fin_payment_allocation` trỏ tới payment đã `status='VOID'`
  (`voided_at` NULL, cùng timestamp `2026-09-22 05:24:30` = giờ chạy migration
  0064, không phải void qua UI), ảnh hưởng **4 hoá đơn**:

  | invoice_no | status hiện tại | paid_amount hiện tại | total | Khoản bị cộng nhầm (payment đã VOID) |
  |---|---|---|---|---|
  | `AA/26E-0000567` | **PAID** | 20.350.000 | 20.350.000 | TT-2607-0001 (toàn bộ 20.35tr) — **thực chất chưa trả đồng nào** |
  | `0001234` | **PAID** | 104.500.000 | 104.500.000 | TT-2608-0001 (toàn bộ 104.5tr) — **thực chất chưa trả đồng nào** |
  | `0001589` | OVERDUE | 40.360.000 | 45.360.000 | TT-2608-0002 (25tr) + TT-2609-0001 (15.36tr) — **paid thật = 0**, phải là UNPAID |
  | `0002198` | OVERDUE | 5.000.000 | 9.936.000 | TT-2608-0003 (5tr) — **paid thật = 0**, phải là UNPAID |

- **Kịch bản lỗi cụ thể**: Kế toán mở màn "Công nợ phải trả" hôm nay, thấy hoá
  đơn `AA/26E-0000567` và `0001234` đã **"Đã trả" (PAID)**, không nằm trong
  danh sách cần thanh toán, không lọt vào aging — nhưng thực tế NCC chưa nhận
  được tiền nào (payment gốc đã bị huỷ). Công ty đang nợ NCC 20.35tr + 104.5tr
  = **124.850.000đ** mà hệ thống không cho thấy khoản nợ này ở đâu cả. Tương
  tự `0001589`/`0002198` đang hiện "đã trả một phần" trong khi thực tế "chưa
  trả gì" — sai số tiền còn nợ hiển thị trên bảng chi tiết đối tác.
- **Mức độ**: **P0** — sai số tiền thực tế công ty còn nợ NCC, hoá đơn đã trả
  đủ (PAID) bị loại khỏi mọi báo cáo công nợ dù chưa hề thanh toán.
- **Đề xuất sửa**: chạy 1 script/migration vá dữ liệu — với mọi `fin_payment`
  có `status='VOID'`, xoá nốt `fin_payment_allocation` còn sót (giống hệt logic
  `voidPaymentWithAllocations`) rồi gọi lại `recalcInvoicePaidAmount()` cho các
  `invoice_id` bị ảnh hưởng. Đồng thời cân nhắc thêm ràng buộc DB (trigger hoặc
  constraint) chặn `fin_payment_allocation` tồn tại khi `fin_payment.status='VOID'`
  để lỗi tương tự không tái diễn nếu có backfill/thao tác tay khác sau này.

### P0-2. Ẩn ("xoá") nguồn tiền còn số dư khác 0 → KPI "Số dư tài khoản" trên dashboard mất tiền ngay lập tức — đã xảy ra thật trên prod

- **File**: `apps/web/src/app/api/finance/accounts/[id]/route.ts` (`DELETE`,
  dòng 62-87) gọi thẳng `updateFinAccount(id, { isActive: false })`
  (`server/repos/finAccounts.ts:93-108`) — **không kiểm tra `currentBalance`**
  trước khi ẩn.
- **Cơ chế lỗi**: `getAccountsBalanceSummary()` (`finInvoices.ts:443-450`), là
  nguồn của KPI "Số dư tài khoản" (`OverviewTab.tsx` → `/api/finance/dashboard/summary`
  → `finInvoices.ts` `getAccountsBalanceSummary`), tính
  `SUM(current_balance) WHERE is_active = true`. Ẩn một nguồn còn dư (dương
  hoặc âm) khiến số dư của nó **biến mất khỏi tổng** dù tiền vẫn tồn tại thật
  (trigger vẫn cộng/trừ đúng cho tài khoản đó, chỉ là nó không còn được SUM).
- **Bằng chứng trên DB prod**: tài khoản `VCB-001 [DEMO] Vietcombank CN Bình
  Dương` (BANK) đã bị ẩn (`is_active=false`) nhưng `current_balance =
  500.000.000đ`. Tổng số dư 2 tài khoản đang active hiện chỉ **250.000.000đ**
  — dashboard "Số dư tài khoản" đang thiếu **500 triệu đồng** so với tổng tiền
  thật công ty đang có trong các nguồn.
- **Kịch bản lỗi cụ thể**: Kế toán/Giám đốc gộp 2 tài khoản ngân hàng, ẩn tài
  khoản cũ mà quên rút hết số dư trước (hoặc số dư dương do lịch sử giao dịch
  demo/nhập liệu), hoặc chỉ đơn giản ẩn nhầm — KPI "Số dư tài khoản" ở Tổng
  quan lập tức giảm đúng bằng số dư nguồn bị ẩn, dễ khiến Giám đốc tưởng công
  ty vừa mất/chi 500 triệu trong khi không có giao dịch nào tương ứng.
- **Mức độ**: **P0** — sai lệch số liệu tài sản hiển thị ở dashboard cấp cao
  nhất, đã tái hiện thật với 500tr trên production, không phải kịch bản giả
  định.
- **Đề xuất sửa**: `DELETE /api/finance/accounts/[id]` chặn ẩn khi
  `currentBalance != 0` (yêu cầu chuyển hết số dư sang nguồn khác — dùng ngay
  tính năng "Chuyển quỹ nội bộ" đã có — trước khi ẩn), trả 409 kèm số dư hiện
  tại. Tối thiểu: nếu vẫn cho ẩn, `getAccountsBalanceSummary()` phải cộng cả
  số dư của nguồn vừa ẩn (bỏ điều kiện `is_active=true`, hoặc cộng riêng dòng
  "số dư nguồn đã ẩn" để không mất dấu vết tài sản).

---

## P1 — Sai lệch / khó dùng nghiêm trọng

### P1-3. Soft-delete `fin_account`/`fin_category` không có ràng buộc nào khác ngoài `isActive` — nguồn/danh mục đang dùng trong giao dịch treo vẫn ẩn được

- **File**: `finAccounts.ts:110-117` (`softDeleteFinAccount`, thực chất route
  gọi `updateFinAccount` như P0-2 ở trên, hàm `softDeleteFinAccount` hiện
  không được route nào gọi — dead code trùng logic).
- Cùng nguyên nhân gốc với P0-2 nhưng nêu riêng vì đây là **thiết kế thiếu
  ràng buộc**, không chỉ 1 lần thao tác sai: không có cách nào trong toàn bộ
  code chặn ẩn một nguồn đang là `accountId` của các `fin_transaction`/`fin_payment`
  chưa tất toán. Nên gộp chung hướng sửa với P0-2 (chặn theo `currentBalance`
  là đủ, vì balance = 0 đồng nghĩa không còn giao dịch treo về mặt số tiền).

### P1-4. Comment code nói "chặn sửa hoá đơn nếu đã có allocation" nhưng không có kiểm tra đó — hiện tại an toàn nhờ Zod, nhưng dễ vỡ nếu sau này thêm field

- **File**: `apps/web/src/app/api/finance/invoices/[id]/route.ts:45`
  (docstring `PATCH`) so với `finInvoiceUpdateSchema`
  (`packages/shared/src/schemas/finance.ts:220-224`, chỉ có
  `dueDate/notes/attachmentUrl`).
- **Hiện trạng**: KHÔNG có bug thật hiện tại — schema Zod đã tự giới hạn field
  sửa được, không đụng `subtotalAmount/vatAmount/totalAmount`. Nhưng route/
  repo không có kiểm tra tường minh "invoice có allocation thì chặn sửa X" như
  comment mô tả — nếu sau này ai thêm field `subtotalAmount` vào
  `finInvoiceUpdateSchema` cho tiện (vì đã có sẵn ở `poInvoice.ts` cho luồng
  PO), hoá đơn đã có thanh toán một phần có thể bị sửa tiền mà không ai biết
  cần chặn theo allocation, vì comment khiến người đọc tưởng đã có guard.
- **Mức độ**: P1 (rủi ro tiềm ẩn, chưa gây sai số hiện tại) — hạ xuống từ P0 vì
  hiện tại schema chặn đủ.
- **Đề xuất sửa**: thêm guard tường minh trong `updateFinInvoice`/route (kiểm
  `paidAmount > 0` → 409 nếu sau này field tiền được thêm vào schema), hoặc
  đơn giản là sửa comment cho khớp thực tế ("field tiền không nằm trong schema
  PATCH này, không cần chặn thêm") để không đánh lừa người bảo trì sau.

### P1-5. `fin_payment_allocation` không có cột/điều kiện loại trừ payment đã VOID ở tầng schema — lỗi P0-1 có thể tái diễn bất cứ lúc nào có thao tác ghi trực tiếp DB

- Liên quan P0-1: nguyên nhân sâu xa là **không có ràng buộc DB** đảm bảo
  "allocation chỉ tồn tại khi payment còn POSTED". `recalcInvoicePaidAmount`
  tin tưởng ngầm định điều này chỉ vì code application-layer (`voidPaymentWithAllocations`)
  luôn dọn allocation khi void — nhưng bất kỳ thao tác nào khác (migration,
  fix tay trên DB, job mới sau này) bỏ qua bước dọn allocation sẽ lặp lại đúng
  lỗi P0-1.
- **Đề xuất sửa**: thêm constraint hoặc trigger DB kiểm tra khi
  `fin_payment.status` chuyển sang `VOID` thì tự xoá/đánh dấu vô hiệu các
  `fin_payment_allocation` liên quan (tương tự cách trigger `fin_account_recalc_balance`
  đã tự động hoá số dư) — tránh phụ thuộc hoàn toàn vào kỷ luật gọi đúng hàm ở
  application layer.

---

## Ghi chú (không phải phát hiện mới — xác nhận điểm ĐÃ đúng)

- Luồng PO → HĐ mua (D7, `server/repos/poInvoice.ts`) khoá PO trước khi tạo/
  sửa HĐ, và `poPrices.ts` khoá PO → khoá HĐ mua (cùng thứ tự) khi điều chỉnh
  giá sau khi đã có HĐ nháp — không thấy deadlock hay race.
- RBAC cho `shareholder` đúng 2 lớp: matrix chỉ cấp `finance: ["read"]`, UI
  (`CashbookTab.tsx`) ẩn nút ghi dựa theo `can(roles, "create"/"update", "finance")`,
  VÀ mọi route ghi (`accounts`, `transactions`, `transfers`, `invoices`,
  `payments`, `void`) đều gọi `requireCan(req, "create"/"update", "finance")`
  ở tầng API — không tìm thấy route ghi nào thiếu guard hoặc dựa nhầm action.
- `getFinTransactionStats`/`getCashflowSeries`/`getCashflowTotals` đều lọc
  `status <> 'VOID'` và `transfer_group_id IS NULL` nhất quán ở cả 3 điểm tổng
  hợp — không đếm trùng chuyển quỹ nội bộ vào thu/chi.
- Không phát hiện thêm lỗi mới trong phạm vi TC-02..TC-27 đã liệt kê ở
  `AUDIT.md`/`DOT3_PLAN.md` — các mục đó đã được sửa đúng như mô tả trong code
  hiện tại.

---

## Tổng hợp việc cần làm ngay (theo mức độ)

1. **P0-1**: viết + chạy script vá dữ liệu (xoá allocation mồ côi của payment
   VOID, recalc lại paidAmount/status cho 4 hoá đơn nêu trên) — ảnh hưởng
   124.85tr công nợ phải trả đang "biến mất" khỏi báo cáo ngay bây giờ.
2. **P0-2**: chặn ẩn nguồn tiền còn số dư ≠ 0 (409) + xử lý ngay tài khoản
   `VCB-001` đang ẩn với 500tr dư trên prod (làm rõ với Kế toán: số dư đó có
   thật không, nếu có phải chuyển quỹ trước khi ẩn, nếu là dữ liệu demo thì
   xoá/điều chỉnh opening balance).
3. **P1-3/P1-5**: thêm ràng buộc DB/guard ở soft-delete account và ở trạng
   thái VOID của payment để 2 lỗi trên không tái diễn.
4. **P1-4**: làm rõ lại comment hoặc thêm guard tường minh cho PATCH hoá đơn.
