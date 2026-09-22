# Kế hoạch ĐỢT 2 — Phân hệ Tài chính (Finance) V4

- **Mã task đề xuất:** `TASK-20260922-001`
- **Ngày:** 2026-09-22
- **Người lập:** planner (Claude)
- **Bản chất:** TÍNH NĂNG MỚI hoàn toàn — 6 bảng `fin_*` (tái dùng `import_batch` có sẵn, xem quyết định §0.3), API CRUD, dashboard Recharts, import Excel, công nợ phải thu, thông báo tự động
- **Phụ thuộc:** ĐỢT 1 (`plans/v4-finance/wave-1-foundation.md`) — role `shareholder` + `RbacEntity "finance"` trong matrix. **Tại thời điểm viết plan này, wave-1-foundation.md CHƯA tồn tại trên disk** → toàn bộ plan dưới đây viết theo giả định wave-1 đã DONE với đúng 2 kết quả trên. Trước khi execute wave-2, **PHẢI** đọc lại wave-1 thật (nếu đã có) và đối chiếu tên chính xác role/entity — nếu wave-1 đặt tên khác (vd `investor` thay vì `shareholder`), sửa toàn bộ plan này theo tên thật, KHÔNG execute mù.
- **Migration:** `packages/db/migrations/0055_finance_core.sql` (tiếp theo sau `0054` — xem §0.4 lưu ý numbering)
- **Trạng thái:** SẴN SÀNG VIẾT CODE sau khi verify wave-1 DONE

---

## 0. Quyết định nền tảng (đọc trước khi code)

### 0.1 Nguồn thiết kế đã chốt
Bám `plans/v4-finance/research-finance-oss.md` mục 4 (schema), mục 5 (Recharts), mục 6 (import Excel). Plan này **cụ thể hoá** thành file/route/DoD — không đổi quyết định kiến trúc gốc (tự xây trên Drizzle, single-entry, KHÔNG double-entry, VND-only, aging = query động không phải bảng).

### 0.2 Điều chỉnh so với research: 6 bảng thay vì 7

Research đề xuất bảng `fin_import_batch` riêng. **QUYẾT ĐỊNH: KHÔNG tạo bảng mới — tái dùng `import_batch` có sẵn** (`packages/db/src/schema/import.ts`).

**Lý do:**
1. `import_batch` đã có đủ cột cần: `id, kind, status, duplicateMode, fileHash, fileName, fileSizeBytes, rowTotal, rowSuccess, rowFail, previewJson, errorJson, errorFileUrl, errorMessage, uploadedBy, startedAt, finishedAt, createdAt` — khớp 100% nhu cầu audit trail import giao dịch tài chính, không thiếu cột nào so với `fin_import_batch` đề xuất (research liệt kê `totalRows/successRows/duplicateRows/errorRows/errorLog` — đều map 1-1 sang cột đã có, chỉ khác tên).
2. `importKindEnum` hiện là `pgEnum("import_kind", ["item", "bom"])` — **PHẢI ALTER TYPE ADD VALUE 'finance_transaction'** dù chọn phương án nào (kể cả tạo bảng riêng vẫn cần enum mới nếu muốn dùng chung service `findRecentByHash`/`createImportBatch`/`updateImportBatch`). Vì đằng nào cũng phải sửa migration DB, tái dùng bảng tiết kiệm 1 bảng + 1 repo + giữ nguyên chỗ hiển thị lịch sử import tập trung (nếu sau này có trang "Lịch sử import" chung, không phải tách riêng theo domain).
3. Vi phạm DRY nếu tạo bảng mới có cấu trúc giống hệt — đúng tinh thần YAGNI/KISS của CLAUDE.md.
4. Rủi ro duy nhất: `import_batch.kind` dùng cho filter `findRecentByHash(hash, kind, ...)` — hàm hiện hard-code type `"item" | "bom"` ở `apps/web/src/server/repos/importBatch.ts:7` và `apps/web/src/server/repos/importBatch.ts:37` → PHẢI mở rộng union type sang `"item" | "bom" | "finance_transaction"` (Phase D, xem chi tiết).

**Vậy 6 bảng mới trong `packages/db/src/schema/finance.ts`:**
`fin_account`, `fin_category`, `fin_transaction`, `fin_invoice`, `fin_payment`, `fin_payment_allocation`. `fin_transaction.importBatchId` FK thẳng tới `import_batch.id` (bảng cũ), KHÔNG tạo `fin_import_batch`.

### 0.3 Quy trình deploy: push schema TS trước hay chạy SQL trước?

Theo `packages/db/DRIFT-NOTES.md` mục 4 (W.11): **toàn bộ bảng mới trong dự án này được tạo bằng `drizzle-kit push`, KHÔNG bằng `CREATE TABLE` trong file migration SQL.** File migration `.sql` chỉ dùng cho: enum mới cần `ALTER TYPE ADD VALUE` (Postgres yêu cầu enum tồn tại trước khi cast giá trị), trigger, index đặc thù, seed data, và **`ALTER TYPE` lên enum đã tồn tại** (ví dụ `import_kind`).

**Thứ tự bắt buộc cho đợt 2 (áp dụng cả dev lẫn VPS):**

1. **Bước 1 — Sửa TS schema** (`packages/db/src/schema/finance.ts` mới + `index.ts` export). Enum mới hoàn toàn (`fin_account_type`, `fin_direction`, `fin_invoice_status`, `fin_payment_method`, `fin_counterparty_type`, `fin_transaction_status`) khai bằng `pgEnum(...)` trong file TS — Drizzle sẽ tự `CREATE TYPE` khi push, KHÔNG cần viết SQL tay cho các enum này (khác với `import_kind` vì đó là enum ĐÃ TỒN TẠI cần ALTER, không phải tạo mới).
2. **Bước 2 — `drizzle-kit push`** (dev trước, sau đó VPS) → tạo 6 bảng mới + 6 enum mới đồng thời (push tạo cả bảng lẫn enum liên quan trong 1 lệnh — không cần tách bước).
   ```bash
   pnpm --filter @iot/db drizzle-kit push
   ```
   > Cảnh báo (DRIFT-NOTES mục 1): `drizzle-kit push` tạo enum ở schema `public` mặc định, trong khi phần lớn migration SQL cũ tạo enum trong `app`. Sau khi push, **verify ngay**:
   > ```sql
   > SELECT n.nspname, t.typname FROM pg_type t
   > JOIN pg_namespace n ON n.oid = t.typnamespace
   > WHERE t.typname LIKE 'fin_%';
   > ```
   > Nếu Drizzle sinh ra ở `public` thay vì `app` → chấp nhận được (các enum khác trong TS cũng đã ở `public` theo cách push mặc định, ví dụ enum PO/PR không dùng `pgSchema("app").enum`) — KHÔNG cần sửa gì thêm, chỉ cần biết để không nhầm khi viết raw SQL sau này (query phải chỉ rõ schema nếu tra cứu enum, tránh trộn `app.X`/`public.X`).
3. **Bước 3 — Chạy SQL migration `0055_finance_core.sql`** (SAU khi bảng đã tồn tại): gồm (a) `ALTER TYPE import_kind ADD VALUE 'finance_transaction'`, (b) trigger `AFTER INSERT/UPDATE/DELETE` trên `fin_transaction` để cập nhật `fin_account.current_balance`, (c) function + trigger tính lại `fin_invoice.paid_amount`/`status` khi `fin_payment_allocation` thay đổi (xem §Phase A quyết định trigger vs app-layer), (d) index bổ sung không tự sinh qua Drizzle (partial index, trigram nếu cần tìm kiếm), (e) seed `fin_category` mặc định (một số danh mục thu/chi cơ bản: "Chi nguyên liệu", "Chi lương", "Chi điện nước", "Thu bán hàng", "Thu khác", "Chi khác").
4. **Bước 4** — Deploy code (theo flow CI/CD hiện có).

**Vì sao thứ tự này an toàn:** enum mới hoàn toàn không ảnh hưởng code cũ (chỉ đọc/ghi bảng mới). `ALTER TYPE import_kind ADD VALUE` cũng vô hại với code cũ (thêm giá trị không phá giá trị cũ) — nhưng PHẢI chạy TRƯỚC khi deploy code Phase D (vì code Phase D sẽ insert `kind='finance_transaction'`, nếu enum chưa có value này → lỗi 500 `invalid input value for enum`).

### 0.4 Lưu ý numbering migration — QUAN TRỌNG, verify lại trước khi tạo file

`packages/db/migrations/` hiện có **2 file trùng số `0053`**: `0053_audit_action_catchup.sql`... — thực tế kiểm tra: `0052_audit_action_catchup.sql` và `0053_item_type_catchup.sql` + `0053_sales_order_priority.sql` (2 file cùng số 0053, xem DRIFT-NOTES mục 5 về gotcha sort lexical). Số lớn nhất hiện tại là **0053** (x2) — **0054 chưa tồn tại trên disk tại thời điểm khảo sát của plan này**.

Theo brief của user: "đợt 1 đã dùng 0054" — nghĩa là **wave-1 sẽ tạo `0054_*.sql`** (role `shareholder` + có thể update RBAC-liên-quan nếu cần SQL). Đợt 2 phải:
1. **Trước khi tạo file**, chạy lại `ls packages/db/migrations/*.sql | sort` để xác nhận số lớn nhất thực tế lúc execute (có thể đã lên 0054 hoặc hơn nếu có nhánh khác chạy song song).
2. Nếu `0054` đã bị chiếm bởi file khác không phải của wave-1 (dự án có nhiều agent làm song song) → đặt tên `0055_finance_core.sql`; nếu 0055 cũng bị chiếm → tăng dần cho tới số trống.
3. **KHÔNG bao giờ tái sử dụng số đã tồn tại** kể cả khi file đó tên khác miền — migration áp dụng theo thứ tự lexical trên toàn bộ thư mục (`apply-sql-migrations.sh`), trùng số gây nhầm thứ tự chạy trên VPS.

---

## 1. Yêu cầu nghiệp vụ → ánh xạ kỹ thuật

| # | Yêu cầu user | Giải pháp |
|---|---|---|
| 1 | Theo dõi thu/chi hàng ngày kèm hóa đơn chứng từ đầu vào/đầu ra | `fin_transaction` (giao dịch hàng ngày, `attachmentUrl`) + `fin_invoice` (direction IN/OUT = hóa đơn mua/bán) |
| 2 | Lịch sử thanh toán đầy đủ CẢ CÓ và KHÔNG hóa đơn; hiển thị TỔNG ĐÃ CHI | `fin_transaction` đứng độc lập (`invoiceId` nullable) cho luồng không hóa đơn; `fin_payment` + `fin_payment_allocation` cho luồng có hóa đơn. Tổng đã chi = query gộp 2 luồng chống double-count (chi tiết §Phase C.2) |
| 3 | Role Kế toán (đã có, full quyền) + Cổ đông (đợt 1 tạo, read-only, theo dõi gia công + thu chi) | RBAC matrix entity `finance`: `accountant` full CRUD, `shareholder` chỉ `["read"]`. Route guard `/finance` cho cả 2 + admin |
| 4 | 2 phương thức nhập liệu: tay + Excel | Phase B (form nhập tay qua API CRUD) + Phase D (import Excel 3 bước) |
| 5 | Công nợ phải thu | Phase C — aging bucket trên `fin_invoice WHERE direction='OUT'` |
| 6 | Danh sách tài khoản giao dịch tập trung | `fin_account` CRUD (Phase B) + tab "Tài khoản giao dịch" (Phase E) |
| 7 | Biểu đồ tăng trưởng + dòng tiền theo ngày | Recharts `ComposedChart` (Phase E) trên dữ liệu dashboard API (Phase C) |

---

## Phase A — Schema + Migration

### A.1 File tạo mới: `packages/db/src/schema/finance.ts`

Theo đúng convention `procurement.ts` (namespace `appSchema`, `uuid().defaultRandom()`, `numeric(18,2)`, index đặt tên `<table>_<field>_idx`/`_uk`). Nội dung đầy đủ (rút gọn còn phần khai báo, comment nghiệp vụ giữ tiếng Việt như code hiện có):

```ts
import { sql } from "drizzle-orm";
import {
  boolean, date, index, numeric, pgEnum, text, timestamp,
  uniqueIndex, uuid, varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { supplier } from "./master";
import { purchaseOrder } from "./procurement";
import { salesOrder } from "./order";
import { importBatch } from "./import";

export const finAccountTypeEnum = pgEnum("fin_account_type", ["BANK", "CASH"]);
export const finDirectionEnum = pgEnum("fin_direction", ["IN", "OUT"]);
export const finCounterpartyTypeEnum = pgEnum("fin_counterparty_type", [
  "SUPPLIER", "CUSTOMER", "EMPLOYEE", "OTHER",
]);
export const finTransactionStatusEnum = pgEnum("fin_transaction_status", [
  "DRAFT", "POSTED", "VOID",
]);
export const finInvoiceStatusEnum = pgEnum("fin_invoice_status", [
  "DRAFT", "UNPAID", "PARTIAL", "PAID", "OVERDUE", "CANCELLED",
]);
export const finPaymentMethodEnum = pgEnum("fin_payment_method", [
  "BANK_TRANSFER", "CASH", "CHECK", "OTHER",
]);

/** fin_account — Tài khoản giao dịch (ngân hàng/tiền mặt) tập trung. */
export const finAccount = appSchema.table("fin_account", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  type: finAccountTypeEnum("type").notNull(),
  bankName: varchar("bank_name", { length: 255 }),
  accountNumber: varchar("account_number", { length: 64 }),
  openingBalance: numeric("opening_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  openingBalanceDate: date("opening_balance_date"),
  // Cache denormalized — nguồn sự thật vẫn là SUM(fin_transaction); trigger giữ đồng bộ (xem A.3).
  currentBalance: numeric("current_balance", { precision: 18, scale: 2 }).notNull().default("0"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  codeUk: uniqueIndex("fin_account_code_uk").on(t.code),
  activeIdx: index("fin_account_active_idx").on(t.isActive),
}));

/** fin_category — Danh mục thu/chi phẳng (KHÔNG phải COA double-entry). */
export const finCategory = appSchema.table("fin_category", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  direction: finDirectionEnum("direction").notNull(),
  parentId: uuid("parent_id"),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  codeUk: uniqueIndex("fin_category_code_uk").on(t.code),
  parentFk: index("fin_category_parent_idx").on(t.parentId),
}));
// Self-reference FK (parentId -> finCategory.id) khai riêng sau khi bảng định nghĩa xong,
// theo đúng pattern self-ref của bom_line hiện có (tránh lỗi "used before declared").

/** fin_invoice — Hóa đơn đầu vào/đầu ra. */
export const finInvoice = appSchema.table("fin_invoice", {
  id: uuid("id").defaultRandom().primaryKey(),
  invoiceNo: varchar("invoice_no", { length: 64 }).notNull(),
  direction: finDirectionEnum("direction").notNull(),
  supplierId: uuid("supplier_id").references(() => supplier.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
  salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
  issueDate: date("issue_date").notNull(),
  dueDate: date("due_date"),
  subtotalAmount: numeric("subtotal_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  vatRate: numeric("vat_rate", { precision: 5, scale: 2 }).notNull().default("8"),
  vatAmount: numeric("vat_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  // Cache — cập nhật bằng trigger/app-layer khi fin_payment_allocation đổi (xem A.3).
  paidAmount: numeric("paid_amount", { precision: 18, scale: 2 }).notNull().default("0"),
  status: finInvoiceStatusEnum("status").notNull().default("UNPAID"),
  notes: text("notes"),
  attachmentUrl: text("attachment_url"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  noUk: uniqueIndex("fin_invoice_no_supplier_uk").on(t.direction, t.invoiceNo, t.supplierId),
  statusIdx: index("fin_invoice_status_idx").on(t.direction, t.status),
  supplierIdx: index("fin_invoice_supplier_idx").on(t.supplierId),
  poIdx: index("fin_invoice_po_idx").on(t.purchaseOrderId),
  dueDateIdx: index("fin_invoice_due_date_idx").on(t.dueDate),
}));

/** fin_payment — Đợt thanh toán (1 payment → N invoice, hoặc 1 invoice ← N payment). */
export const finPayment = appSchema.table("fin_payment", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  direction: finDirectionEnum("direction").notNull(),
  accountId: uuid("account_id").notNull().references(() => finAccount.id),
  supplierId: uuid("supplier_id").references(() => supplier.id),
  paymentDate: date("payment_date").notNull(),
  totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
  method: finPaymentMethodEnum("method").notNull().default("BANK_TRANSFER"),
  referenceNo: varchar("reference_no", { length: 128 }),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  codeUk: uniqueIndex("fin_payment_code_uk").on(t.code),
  accountIdx: index("fin_payment_account_idx").on(t.accountId),
  dateIdx: index("fin_payment_date_idx").on(t.paymentDate),
}));

/** fin_payment_allocation — N-N payment↔invoice (partial payment nhiều đợt). */
export const finPaymentAllocation = appSchema.table("fin_payment_allocation", {
  id: uuid("id").defaultRandom().primaryKey(),
  paymentId: uuid("payment_id").notNull().references(() => finPayment.id, { onDelete: "cascade" }),
  invoiceId: uuid("invoice_id").notNull().references(() => finInvoice.id),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
}, (t) => ({
  uk: uniqueIndex("fin_payment_allocation_uk").on(t.paymentId, t.invoiceId),
  paymentIdx: index("fin_payment_allocation_payment_idx").on(t.paymentId),
  invoiceIdx: index("fin_payment_allocation_invoice_idx").on(t.invoiceId),
}));

/** fin_transaction — Giao dịch thu/chi hàng ngày (bảng trung tâm, single-entry). */
export const finTransaction = appSchema.table("fin_transaction", {
  id: uuid("id").defaultRandom().primaryKey(),
  code: varchar("code", { length: 32 }).notNull(),
  direction: finDirectionEnum("direction").notNull(),
  accountId: uuid("account_id").notNull().references(() => finAccount.id),
  categoryId: uuid("category_id").references(() => finCategory.id),
  amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
  transactionDate: date("transaction_date").notNull(),
  description: text("description"),
  counterpartyType: finCounterpartyTypeEnum("counterparty_type"),
  supplierId: uuid("supplier_id").references(() => supplier.id),
  purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
  salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
  invoiceId: uuid("invoice_id").references(() => finInvoice.id),
  paymentId: uuid("payment_id").references(() => finPayment.id),
  attachmentUrl: text("attachment_url"),
  importBatchId: uuid("import_batch_id").references(() => importBatch.id),
  externalRef: varchar("external_ref", { length: 128 }),
  dedupeHash: varchar("dedupe_hash", { length: 64 }),
  status: finTransactionStatusEnum("status").notNull().default("POSTED"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().default(sql`now()`),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().default(sql`now()`),
  createdBy: uuid("created_by").references(() => userAccount.id),
}, (t) => ({
  codeUk: uniqueIndex("fin_transaction_code_uk").on(t.code),
  dedupeUk: uniqueIndex("fin_transaction_dedupe_uk").on(t.dedupeHash),
  accountDateIdx: index("fin_transaction_account_date_idx").on(t.accountId, t.transactionDate),
  poIdx: index("fin_transaction_po_idx").on(t.purchaseOrderId),
  supplierIdx: index("fin_transaction_supplier_idx").on(t.supplierId),
  invoiceIdx: index("fin_transaction_invoice_idx").on(t.invoiceId),
  paymentIdx: index("fin_transaction_payment_idx").on(t.paymentId),
  importBatchIdx: index("fin_transaction_import_batch_idx").on(t.importBatchId),
}));

export type FinAccount = typeof finAccount.$inferSelect;
export type NewFinAccount = typeof finAccount.$inferInsert;
export type FinCategory = typeof finCategory.$inferSelect;
export type FinTransaction = typeof finTransaction.$inferSelect;
export type NewFinTransaction = typeof finTransaction.$inferInsert;
export type FinInvoice = typeof finInvoice.$inferSelect;
export type NewFinInvoice = typeof finInvoice.$inferInsert;
export type FinPayment = typeof finPayment.$inferSelect;
export type FinPaymentAllocation = typeof finPaymentAllocation.$inferSelect;
```

> **Lưu ý `dedupeHash` unique nullable:** Postgres cho phép NHIỀU NULL trong unique index (NULL ≠ NULL) — giao dịch nhập tay không cần hash vẫn insert bình thường, chỉ giao dịch từ import Excel mới set hash để chống trùng. Không cần xử lý đặc biệt.
>
> **`fin_category.parentId` self-reference:** thêm FK bằng cách khai `.references(() => finCategory.id)` sau khi biến `finCategory` đã tồn tại — nếu TypeScript báo lỗi "used before assigned" do circular, dùng pattern `AnyPgColumn` như Drizzle docs gợi ý cho self-ref (tham khảo cách `bom_line.parentId` đã làm trong `packages/db/src/schema/bom.ts` — đọc file đó để copy đúng cú pháp circular ref trước khi viết).

### A.2 Sửa `packages/db/src/schema/index.ts`
Thêm dòng `export * from "./finance";` (theo thứ tự alphabet tương đối với các export khác — chèn sau `export * from "./eco";` hoặc theo nhóm logic gần `procurement`/`order`, không bắt buộc thứ tự tuyệt đối nhưng giữ nhất quán bằng cách đặt cạnh `procurement`).

### A.3 Quyết định: trigger SQL hay tính ở application layer?

Research (mục 7, khuyến nghị 3) đề xuất tính `paidAmount`/`status` ở **application layer** (trong Drizzle transaction) vì dễ debug hơn trigger SQL. **Quyết định giữ theo research — tính ở application layer, KHÔNG dùng trigger cho `fin_invoice.paidAmount`.**

Lý do cụ thể hoá thêm (đối chiếu rủi ro đề bài yêu cầu nêu):
- **Rủi ro trigger + import hàng loạt:** nếu dùng trigger AFTER INSERT trên `fin_payment_allocation` mà import Excel sau này mở rộng sang import cả payment (ngoài scope V1 nhưng để dự phòng), insert hàng loạt trong 1 transaction sẽ kích hoạt trigger N lần tuần tự → có thể gây lock contention trên cùng row `fin_invoice` nếu nhiều allocation trỏ cùng 1 invoice trong cùng batch (`FOR UPDATE` ngầm bên trong trigger). Tính ở application layer cho phép gộp thành 1 UPDATE duy nhất sau khi insert xong toàn bộ allocation của 1 request, giảm số lần lock.
- Áp dụng **duy nhất 1 trigger SQL** cho `fin_account.currentBalance` (mục A.3.1) vì đây là phép cộng/trừ đơn giản không có logic rẽ nhánh trạng thái phức tạp như invoice, rủi ro thấp, và cần đồng bộ ngay cả khi có INSERT trực tiếp ngoài luồng API (ví dụ future: sync ngân hàng tự động) — invoice thì luôn đi qua route allocation nên an toàn khi để app layer quản lý.

**A.3.1 — Trigger SQL cho `fin_account.current_balance`** (trong `0055_finance_core.sql`):
```sql
CREATE OR REPLACE FUNCTION app.fin_account_recalc_balance() RETURNS trigger AS $$
DECLARE
  affected_account uuid;
BEGIN
  affected_account := COALESCE(NEW.account_id, OLD.account_id);
  UPDATE app.fin_account
  SET current_balance = opening_balance + COALESCE((
    SELECT SUM(CASE WHEN direction = 'IN' THEN amount ELSE -amount END)
    FROM app.fin_transaction
    WHERE account_id = affected_account AND status = 'POSTED'
  ), 0)
  WHERE id = affected_account;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER fin_transaction_recalc_balance
AFTER INSERT OR UPDATE OF amount, direction, status, account_id OR DELETE
ON app.fin_transaction
FOR EACH ROW EXECUTE FUNCTION app.fin_account_recalc_balance();
```
> Trigger dùng `SUM` full re-scan theo `account_id` mỗi lần thay đổi (không phải cộng dồn tăng dần) — **chủ đích đơn giản hoá (KISS)**, chấp nhận chi phí O(n) theo số giao dịch/tài khoản vì xưởng cơ khí quy mô nhỏ (ước tính vài trăm-nghìn giao dịch/năm/tài khoản, không phải ngân hàng), tránh bug cộng dồn sai khi UPDATE đổi `account_id` (chuyển giao dịch giữa 2 tài khoản) — full re-scan luôn đúng bất kể loại thay đổi nào.

**A.3.2 — Application layer cho `fin_invoice.paidAmount`/`status`:** viết trong `apps/web/src/server/repos/finPayments.ts`, hàm `recalcInvoicePaidAmount(tx, invoiceId)` — SELECT SUM(`fin_payment_allocation.amount`) WHERE `invoiceId` = X, so với `totalAmount`, derive `status` (0 → UNPAID nếu chưa quá hạn hoặc OVERDUE nếu quá hạn; 0<paid<total → PARTIAL; paid>=total → PAID), UPDATE 1 lần. Gọi hàm này trong CÙNG transaction Drizzle với insert/delete allocation (xem Phase B API thanh toán).

**A.3.3 — Job/query derive OVERDUE:** KHÔNG cần cron riêng để set `status='OVERDUE'` liên tục — vì `status` chỉ đọc để hiển thị nhanh, còn **mọi query báo cáo công nợ (Phase C) tính lại real-time** bằng điều kiện `dueDate < CURRENT_DATE AND paidAmount < totalAmount` thay vì tin tưởng cột `status` cache. Cột `status='OVERDUE'` chỉ được ghi khi có sự kiện thay đổi thực sự (tạo/update invoice, tạo payment) để hiển thị nhanh trong list UI, tránh lệch giữa "trạng thái hiển thị" và "trạng thái tính đúng lúc" — Phase F (job worker quét hạn thanh toán hàng ngày) sẽ chạy `UPDATE ... SET status='OVERDUE' WHERE dueDate < today AND status IN ('UNPAID','PARTIAL')` mỗi ngày để đồng bộ cache, đồng thời bắn notification (xem Phase F).

### A.4 File migration SQL: `packages/db/migrations/0055_finance_core.sql`

Nội dung gồm (theo thứ tự chạy trong 1 file, KHÔNG bọc `--single-transaction` vì có `ALTER TYPE ADD VALUE`):
```sql
-- 1. Mở rộng enum import_kind (ĐÃ TỒN TẠI, cần ALTER, không phải tạo mới)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'finance_transaction'
      AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'import_kind')
  ) THEN
    ALTER TYPE import_kind ADD VALUE 'finance_transaction';
  END IF;
END $$;

-- 2. Trigger tự tính fin_account.current_balance (xem A.3.1, dán nguyên văn)
CREATE OR REPLACE FUNCTION app.fin_account_recalc_balance() ...
CREATE TRIGGER fin_transaction_recalc_balance ...

-- 3. Seed danh mục thu/chi mặc định (idempotent ON CONFLICT DO NOTHING)
INSERT INTO app.fin_category (code, name, direction) VALUES
  ('CHI_NGUYENLIEU', 'Chi nguyên vật liệu', 'OUT'),
  ('CHI_LUONG', 'Chi lương nhân viên', 'OUT'),
  ('CHI_DIENNUOC', 'Chi điện nước', 'OUT'),
  ('CHI_VANHANH', 'Chi phí vận hành khác', 'OUT'),
  ('CHI_GIACONG', 'Chi phí gia công ngoài', 'OUT'),
  ('THU_BANHANG', 'Thu bán hàng', 'IN'),
  ('THU_GIACONG', 'Thu gia công', 'IN'),
  ('THU_KHAC', 'Thu khác', 'IN')
ON CONFLICT (code) DO NOTHING;

-- 4. Index bổ sung không tự sinh qua Drizzle (nếu cần — ví dụ partial index cho status OVERDUE)
CREATE INDEX IF NOT EXISTS fin_invoice_overdue_idx ON app.fin_invoice (due_date)
  WHERE status IN ('UNPAID', 'PARTIAL');
```

> **Chạy TRƯỚC bước drizzle-kit push hay SAU?** Theo §0.3: PUSH TRƯỚC (tạo bảng `fin_invoice`/`fin_transaction` etc.) rồi mới chạy file SQL này (vì file SQL tham chiếu `app.fin_transaction`, `app.fin_invoice` — bảng phải tồn tại trước). Đây là NGOẠI LỆ so với thứ tự "migration trước, code sau" của các đợt cũ (VD 0050 accountant) — vì 0050 chỉ ALTER enum có sẵn `role_code` không tạo bảng mới, còn 0055 phụ thuộc bảng mới do push tạo ra.

### A.5 Effort & DoD Phase A
- **Effort: M (~1 ngày)** — chủ yếu do cần cẩn trọng thứ tự push/SQL + verify enum schema.
- **DoD:**
  - [ ] `pnpm --filter @iot/db drizzle-kit push` chạy trên dev DB không lỗi, 6 bảng `fin_*` xuất hiện trong `information_schema.tables` schema `app`.
  - [ ] `0055_finance_core.sql` chạy thành công sau push, verify `pg_enum` có `finance_transaction` trong `import_kind`.
  - [ ] Insert thử 1 `fin_transaction` (raw SQL) → trigger cập nhật đúng `fin_account.current_balance`.
  - [ ] `pnpm typecheck` pass với schema mới import vào `@iot/db/schema`.

---

## Phase B — Repo + Zod schema + API CRUD

### B.1 Zod schemas — file mới `packages/shared/src/schemas/finance.ts`
Theo pattern `supplier.ts`/`procurement.ts` cùng thư mục. Export: `finAccountCreateSchema`, `finAccountUpdateSchema`, `finAccountListQuerySchema`, `finCategoryCreateSchema`, `finCategoryListQuerySchema`, `finTransactionCreateSchema`, `finTransactionUpdateSchema`, `finTransactionListQuerySchema`, `finInvoiceCreateSchema`, `finInvoiceUpdateSchema`, `finInvoiceListQuerySchema`, `finPaymentCreateSchema` (kèm mảng `allocations: [{invoiceId, amount}]` lồng trong 1 payload — tạo payment + allocation cùng lúc trong 1 request, giống pattern PO tạo kèm line items). Export toàn bộ trong `packages/shared/src/index.ts` (kiểm tra file này export gì từ `schemas/` để nối theo đúng convention — thường là `export * from "./schemas/xxx"`).

Validate nghiệp vụ quan trọng cần zod `.refine()`:
- `finTransactionCreateSchema`: nếu `direction='OUT'` và có `invoiceId` → không bắt buộc gì thêm (invoice optional cho MỌI giao dịch, kể cả OUT — đây chính là cách hỗ trợ "khoản không có hóa đơn": `invoiceId` luôn nullable, KHÔNG có ràng buộc NOT NULL nào ở DB lẫn Zod).
- `finPaymentCreateSchema`: `SUM(allocations[].amount)` phải **<=** `totalAmount` truyền vào (cho phép payment lớn hơn tổng allocation nếu muốn ghi nhận thanh toán dư/tạm ứng — nhưng V1 KISS: bắt buộc bằng nhau, `.refine(sum === totalAmount)`, nếu muốn allocate ít hơn thì tạo payment với `totalAmount` nhỏ hơn tương ứng).
- `finInvoiceCreateSchema`: `totalAmount = subtotalAmount + vatAmount` — refine kiểm tra khớp (sai số làm tròn cho phép ±1 VND do numeric scale 2).

### B.2 Repo — file mới `apps/web/src/server/repos/finAccounts.ts`, `finCategories.ts`, `finTransactions.ts`, `finInvoices.ts`, `finPayments.ts`

Theo pattern `apps/web/src/server/repos/suppliers.ts` (CRUD list/get/create/update, filter qua `parseSearchParams`). Điểm khác biệt cần lưu ý code review sau này:

- `finPayments.ts` — hàm `createPaymentWithAllocations(input, actorId)`: PHẢI chạy trong `db.transaction(async (tx) => {...})`:
  1. `genDocNo(tx, { table: "app.fin_payment", column: "code", prefix: "TT-" + currentYymm(), seqPart: 2 })` — dùng `_docNumber.ts` có sẵn (KHÔNG tự viết sinh số, tái dùng đúng theo brief).
  2. Insert `fin_payment`.
  3. Insert N `fin_payment_allocation` (bulk insert 1 câu lệnh).
  4. Insert N `fin_transaction` tương ứng (1 transaction ghi sổ CHO MỖI allocation, `paymentId` = payment vừa tạo, `invoiceId` = invoice tương ứng, `amount` = allocation.amount, `direction` = payment.direction) — **đây chính là cầu nối "payment có hóa đơn cũng phải xuất hiện trong sổ giao dịch hàng ngày"**, đáp ứng yêu cầu "theo dõi thu chi hàng ngày" phải thấy CẢ giao dịch có hóa đơn.
  5. Gọi `recalcInvoicePaidAmount(tx, invoiceId)` cho từng invoice bị ảnh hưởng (dedupe nếu nhiều allocation cùng invoice trong 1 payment — hiếm nhưng validate chặn ở B.1 nên an toàn).
  6. Trigger `fin_account_recalc_balance` tự chạy khi 4 insert transaction ở bước 4 commit (AFTER INSERT trên `fin_transaction`).
  7. Return payment + allocations.

  > **Đây là cơ chế chống double-count trọng tâm** — xem chi tiết đầy đủ ở Phase C.2 (không lặp lại ở đây, chỉ đánh dấu điểm code chèn).

- `finTransactions.ts` — hàm `createTransaction(input, actorId)` dùng cho **luồng KHÔNG hóa đơn**: chỉ 1 insert `fin_transaction` với `invoiceId=null`, `paymentId=null`, sinh code `PT-`/`PC-` (Phiếu Thu/Phiếu Chi) tùy `direction` qua `genDocNo`.

### B.3 Danh sách API endpoint đầy đủ (method + path + guard + mô tả)

Guard dùng `requireCan(req, action, "finance")` (entity `finance` từ wave-1). Với action cụ thể theo RBAC matrix cần bổ sung ở Phase B (xem B.4):

| # | Method | Path | Guard (action, entity) | Mô tả |
|---|---|---|---|---|
| 1 | GET | `/api/finance/accounts` | read, finance | List tài khoản giao dịch (filter `isActive`, `type`) |
| 2 | POST | `/api/finance/accounts` | create, finance | Tạo tài khoản mới |
| 3 | GET | `/api/finance/accounts/[id]` | read, finance | Chi tiết 1 tài khoản + `currentBalance` |
| 4 | PATCH | `/api/finance/accounts/[id]` | update, finance | Sửa tên/số TK/trạng thái (KHÔNG cho sửa `openingBalance` sau khi đã có giao dịch — validate ở route) |
| 5 | GET | `/api/finance/categories` | read, finance | List danh mục thu/chi (cây parent/child) |
| 6 | POST | `/api/finance/categories` | create, finance | Tạo danh mục |
| 7 | PATCH | `/api/finance/categories/[id]` | update, finance | Sửa/deactivate danh mục |
| 8 | GET | `/api/finance/transactions` | read, finance | List giao dịch (filter: direction, accountId, categoryId, dateFrom/dateTo, supplierId, hasInvoice) |
| 9 | POST | `/api/finance/transactions` | create, finance | Tạo giao dịch thủ công (CÓ hoặc KHÔNG invoiceId) |
| 10 | GET | `/api/finance/transactions/[id]` | read, finance | Chi tiết giao dịch |
| 11 | PATCH | `/api/finance/transactions/[id]` | update, finance | Sửa (chỉ khi `status=DRAFT`, giao dịch `POSTED` không cho sửa amount — chỉ cho sửa `description`/`attachmentUrl`) |
| 12 | POST | `/api/finance/transactions/[id]/void` | delete, finance | Hủy giao dịch (status→VOID, KHÔNG xóa cứng — giữ audit trail; trigger tự trừ lại balance vì query trigger lọc `status='POSTED'`) |
| 13 | GET | `/api/finance/invoices` | read, finance | List hóa đơn (filter direction/status/supplierId/overdue) |
| 14 | POST | `/api/finance/invoices` | create, finance | Tạo hóa đơn (option: kèm `purchaseOrderId` để auto-fill từ PO) |
| 15 | GET | `/api/finance/invoices/[id]` | read, finance | Chi tiết hóa đơn + lịch sử allocation (join `fin_payment_allocation` + `fin_payment`) |
| 16 | PATCH | `/api/finance/invoices/[id]` | update, finance | Sửa hóa đơn (chặn sửa nếu đã có allocation > 0, trừ notes/attachmentUrl) |
| 17 | POST | `/api/finance/invoices/[id]/cancel` | delete, finance | Hủy hóa đơn (status→CANCELLED, chỉ khi `paidAmount=0`) |
| 18 | GET | `/api/finance/payments` | read, finance | List đợt thanh toán |
| 19 | POST | `/api/finance/payments` | create, finance | Tạo payment + allocations (xem B.2) |
| 20 | GET | `/api/finance/payments/[id]` | read, finance | Chi tiết payment + allocation breakdown |
| 21 | GET | `/api/finance/receivables/aging` | read, finance | Aging bucket công nợ phải thu (Phase C) |
| 22 | GET | `/api/finance/dashboard/cashflow` | read, finance | Dòng tiền theo ngày + so sánh kỳ (Phase C) |
| 23 | GET | `/api/finance/dashboard/summary` | read, finance | Tổng đã thu/đã chi/số dư tất cả TK (Phase C) |
| 24 | GET | `/api/finance/export-excel` | read, finance | Export Excel sổ giao dịch theo filter hiện tại (dùng `exceljs`, mẫu `export-excel/route.ts`) |

> Toàn bộ 24 route tuân thủ pattern chuẩn: `runtime="nodejs"; dynamic="force-dynamic"` → `requireCan` → `parseJson`/`parseSearchParams` → repo Drizzle → `writeAudit` (cho POST/PATCH/void/cancel) → `jsonError`.

### B.4 RBAC matrix — cập nhật `packages/shared/src/rbac/matrix.ts`

Giả định wave-1 đã thêm `"finance"` vào `RbacEntity` union và khởi tạo entry rỗng/placeholder cho `admin`/`shareholder`. Đợt 2 **hoàn thiện quyền cụ thể**:

```ts
admin: {
  ...,
  finance: ["create", "read", "update", "delete", "approve"], // approve dự phòng duyệt chi lớn tương lai, V1 chưa dùng
},
accountant: {
  ...,
  finance: ["create", "read", "update", "delete"],
},
shareholder: {
  ...,
  finance: ["read"],
},
```
Cập nhật `RBAC_ENTITIES` thêm `"finance"` nếu wave-1 chưa thêm (idempotent — chỉ thêm nếu chưa có). Cập nhật `packages/shared/src/rbac/can.test.ts` thêm case:
```ts
["accountant", "create", "finance", true],
["accountant", "delete", "finance", true],
["shareholder", "read", "finance", true],
["shareholder", "create", "finance", false],
["shareholder", "update", "finance", false],
["purchaser", "read", "finance", false],
```

### B.5 Route guard + nav

- `apps/web/src/app/(app)/layout.tsx` `ROUTE_ROLE_GUARD`: thêm `{ prefix: "/finance", roles: ["admin", "accountant", "shareholder"] }`.
- `apps/web/src/lib/nav-items.ts`: **QUAN TRỌNG** — nav hiện tại section `"finance"` đang trỏ `/sales` (Bộ phận Thu mua) với label "Bộ phận Thu mua", KHÔNG PHẢI trang Finance mới. Route `/finance` chưa có entry nào. Thêm **nav item mới riêng**:
  ```ts
  {
    href: "/finance",
    label: "Tài chính",
    icon: Wallet, // cần import thêm từ lucide-react
    roles: ["admin", "accountant", "shareholder"],
    section: "finance",
  },
  ```
  Đặt SAU item `/sales` trong mảng `NAV_ITEMS` (cùng section `"finance"` — sidebar sẽ hiện 2 item con trong nhóm "Tài chính & Mua bán": "Bộ phận Thu mua" + "Tài chính"). Xác nhận với user nếu muốn đổi label section hoặc tách section riêng — **V1 giữ chung section theo cấu trúc có sẵn (KISS)**, không tạo `NavSection` mới.

### B.6 Effort & DoD Phase B
- **Effort: L (~2.5-3 ngày)** — 24 endpoint + 5 repo + zod schemas + RBAC.
- **DoD:**
  - [ ] Toàn bộ 24 endpoint trả đúng status code (201 create, 200 read/update, 404 not-found, 409 conflict trạng thái sai, 403 role sai).
  - [ ] `shareholder` login → GET mọi endpoint = 200, POST/PATCH/void/cancel = 403.
  - [ ] Tạo payment với 2 allocation cho 2 invoice khác nhau → cả 2 invoice `paidAmount`/`status` cập nhật đúng, `fin_account.currentBalance` giảm đúng tổng, xuất hiện đủ 2 `fin_transaction` record (1 payment tách 2 transaction line).
  - [ ] Tạo transaction KHÔNG invoice (chi tiền mặt mua văn phòng phẩm) → không lỗi validate `invoiceId` bắt buộc.
  - [ ] vitest cho `recalcInvoicePaidAmount`: case partial 2 đợt, case overpay bị chặn ở tầng zod refine (B.1).

---

## Phase C — Công nợ phải thu + Báo cáo/Dashboard

### C.1 Aging bucket công nợ phải thu — `GET /api/finance/receivables/aging`

Query động (KHÔNG bảng lưu trữ, đúng research mục 4.2):
```sql
SELECT
  CASE
    WHEN due_date IS NULL OR due_date >= CURRENT_DATE THEN 'CURRENT'
    WHEN CURRENT_DATE - due_date BETWEEN 1 AND 30 THEN '1-30'
    WHEN CURRENT_DATE - due_date BETWEEN 31 AND 60 THEN '31-60'
    WHEN CURRENT_DATE - due_date BETWEEN 61 AND 90 THEN '61-90'
    ELSE '90+'
  END AS bucket,
  COUNT(*) AS invoice_count,
  SUM(total_amount - paid_amount) AS outstanding_amount
FROM app.fin_invoice
WHERE direction = 'OUT' AND status IN ('UNPAID', 'PARTIAL', 'OVERDUE')
GROUP BY bucket;
```
Repo `finInvoices.ts` hàm `getReceivablesAging()`. Response kèm cả breakdown theo `supplierId`/khách hàng nếu FE cần drill-down (V1: chỉ tổng theo bucket, đủ đáp ứng yêu cầu; drill-down chi tiết theo khách hàng để Phase E sau nếu cần thêm — đánh dấu backlog, KHÔNG làm nếu không có trong yêu cầu gốc, tránh over-engineering).

### C.2 CHỐNG DOUBLE-COUNT "Tổng đã chi" — phần quan trọng nhất Phase C

**Vấn đề:** có 2 luồng ghi nhận chi tiền:
- Luồng (a) có hóa đơn: `fin_payment` → N `fin_payment_allocation` → N `fin_transaction` (mỗi allocation sinh 1 transaction, theo B.2 bước 4).
- Luồng (b) không hóa đơn: `fin_transaction` tạo trực tiếp, không qua `fin_payment`.

**Nếu tính "tổng đã chi" = SUM(fin_payment.totalAmount) + SUM(fin_transaction.amount WHERE direction=OUT) → ĐẾM TRÙNG**, vì mỗi payment ở luồng (a) đã có transaction tương ứng (bước B.2.4) — cộng cả 2 nguồn sẽ nhân đôi số tiền của luồng (a).

**QUYẾT ĐỊNH CHỐNG DOUBLE-COUNT: `fin_transaction` là NGUỒN SỰ THẬT DUY NHẤT (single source of truth) cho "tổng đã chi/đã thu".** Không bao giờ cộng `fin_payment.totalAmount` song song với `fin_transaction`. Mọi con số tổng hợp (dashboard, KPI, export) LUÔN LUÔN query trên `fin_transaction WHERE status='POSTED'`, KHÔNG BAO GIỜ query `fin_payment` để tính tổng tiền — `fin_payment` chỉ dùng để: (1) hiển thị "đợt thanh toán" theo góc nhìn kế toán (nhóm nhiều invoice trong 1 lần chuyển khoản), (2) trace nguồn gốc 1 transaction có phải từ 1 payment gộp hay không (`fin_transaction.paymentId`).

```sql
-- Tổng đã chi (luôn đúng, không double-count, gộp CẢ 2 luồng tự nhiên vì
-- cả 2 luồng đều PHẢI đi qua fin_transaction):
SELECT SUM(amount) FROM app.fin_transaction
WHERE direction = 'OUT' AND status = 'POSTED';
```

**Ràng buộc thực thi để đảm bảo bất biến này không bị phá vỡ:**
1. B.2 bước 4 là **BẮT BUỘC**, không được bỏ qua trong bất kỳ code path nào tạo payment — code review phải chặn PR nào tạo `fin_payment` mà không kèm insert `fin_transaction` tương ứng.
2. **KHÔNG được phép** cho phép tạo `fin_transaction` với `paymentId` set nhưng KHÔNG qua `createPaymentWithAllocations` (tức API `POST /api/finance/transactions` — endpoint tạo thủ công — PHẢI validate: nếu body có `paymentId` → trả 400 "Không được set paymentId thủ công, dùng API /payments"). Điều này ngăn user/dev vô tình tạo transaction trùng cho 1 payment đã có transaction tự sinh.
3. Viết vitest riêng `finTransactions.test.ts` case: tạo payment 2 allocation → verify đúng 2 `fin_transaction` row (không phải 1, không phải 3) → verify `SUM(fin_transaction.amount) = SUM(fin_payment_allocation.amount)` khớp `fin_payment.totalAmount`.
4. Ghi rõ trong code comment tại `finPayments.ts` (đầu file) đúng đoạn giải thích bất biến này, để dev tương lai không "tối ưu" bằng cách bỏ bước tạo transaction (nhìn thoáng qua tưởng dư thừa vì đã có payment).

### C.3 Dashboard dòng tiền theo ngày — `GET /api/finance/dashboard/cashflow`

Params: `from`, `to` (mặc định 30 ngày gần nhất), `compareWith` (optional: `previous_period` để so sánh tăng trưởng %).

```sql
SELECT
  transaction_date,
  SUM(CASE WHEN direction='IN' THEN amount ELSE 0 END) AS total_in,
  SUM(CASE WHEN direction='OUT' THEN amount ELSE 0 END) AS total_out
FROM app.fin_transaction
WHERE status = 'POSTED' AND transaction_date BETWEEN $1 AND $2
GROUP BY transaction_date ORDER BY transaction_date;
```

Response shape (FE dùng thẳng cho Recharts, tránh transform phức tạp phía client):
```json
{
  "data": {
    "series": [{ "date": "2026-09-01", "in": 15000000, "out": 8200000, "net": 6800000 }, ...],
    "summary": { "totalIn": ..., "totalOut": ..., "netCashflow": ... },
    "growth": { "inPct": 12.5, "outPct": -3.1, "vsLabel": "so với kỳ trước (30 ngày)" }
  }
}
```
`growth` tính bằng cách query thêm 1 lần cho kỳ trước liền kề cùng độ dài (`from - (to-from)` đến `from`), so sánh `totalIn`/`totalOut` — đây là "so sánh chỉ số tăng trưởng" theo đúng yêu cầu.

### C.4 Cảnh báo numeric(18,2) trả về string — QUAN TRỌNG cho toàn bộ Phase C/E

Postgres driver (`node-postgres`/`postgres.js` dùng bởi Drizzle trong dự án) trả cột `numeric` dưới dạng **string** trong JS (tránh mất precision so với `number` IEEE754), KHÔNG tự động parse thành number. Đã có tiền lệ xử lý ở FE: `AccountingTab.tsx` dùng `Number(po.totalAmount)` trước khi truyền vào `fmtVND()`.

**Quy tắc bắt buộc cho toàn bộ Phase C/E:**
- **Ở API response (BE):** repo trả nguyên `string` từ Drizzle (KHÔNG tự ý convert sang `number` ở BE — tránh mất precision nếu số lớn, giữ nguyên convention hiện có của PO/PR).
- **Ở FE khi tính toán/hiển thị:** LUÔN `Number(value)` trước khi cộng/dùng trong Recharts (Recharts cần `number` cho trục Y, không nhận string) — nếu không convert, chart sẽ crash hoặc hiện sai (Recharts coerce string "1000.00" thành NaN trong 1 số trường hợp tính domain).
- **Ở query SQL tổng hợp (SUM/aggregate) trả về từ raw `sql` template:** kết quả `SUM(numeric)` cũng là string — repo `getCashflowSeries`/`getReceivablesAging` phải convert tường minh bằng `Number(row.total_in)` trước khi đưa vào response JSON, để FE không phải tự đoán field nào là string field nào là number.
- Viết 1 dòng comment chuẩn tại đầu mỗi repo file Phase C: `// LƯU Ý: numeric(18,2) trả về string qua Drizzle/pg driver — convert Number() trước khi tính toán/serialize cho chart.`

### C.5 Effort & DoD Phase C
- **Effort: M (~1-1.5 ngày)**
- **DoD:**
  - [ ] `GET /api/finance/receivables/aging` trả đúng 4 bucket + `CURRENT`, tổng khớp thủ công đối chiếu vài invoice test.
  - [ ] Tạo 1 payment (luồng a) + 1 transaction thủ công (luồng b) cùng ngày → `GET /api/finance/dashboard/cashflow` trả `total_out` = TỔNG CỘNG CẢ HAI, KHÔNG double-count (test case trực tiếp theo §C.2.3).
  - [ ] `growth.outPct` tính đúng khi so 2 kỳ có dữ liệu khác nhau (test với dữ liệu seed cố định, so sánh tay).
  - [ ] Toàn bộ response numeric field đã convert `Number()`, verify bằng `typeof` trong test (không phải string).

---

## Phase D — Import Excel giao dịch tài chính

### D.1 Quyết định tái dùng hạ tầng import có sẵn (đã chốt ở §0.2)

Tái dùng NGUYÊN VẸN: `apps/web/src/server/repos/importBatch.ts`, bảng `import_batch`, queue BullMQ pattern (`enqueueItemImportCommit` → tạo `enqueueFinanceImportCommit` tương tự), UI `ImportWizard.tsx` (copy làm base, đổi field mapping).

### D.2 Mở rộng type `kind` — sửa 2 điểm

- `apps/web/src/server/repos/importBatch.ts`:
  - Dòng 7: `kind: "item" | "bom"` → `kind: "item" | "bom" | "finance_transaction"`.
  - Dòng 37: tương tự trong tham số `createImportBatch`.
- `packages/db/src/schema/import.ts`: **KHÔNG SỬA GÌ** — `importKindEnum` không cần đổi trong TS vì Drizzle `pgEnum` chỉ cần khớp giá trị runtime, việc thêm giá trị mới vào Postgres enum (qua migration 0055 §A.4) không bắt buộc phải liệt kê lại trong TS array để INSERT hoạt động — **NHƯNG khuyến nghị vẫn cập nhật TS cho đồng bộ type-safety**: đổi
  ```ts
  export const importKindEnum = pgEnum("import_kind", ["item", "bom"]);
  ```
  thành
  ```ts
  export const importKindEnum = pgEnum("import_kind", ["item", "bom", "finance_transaction"]);
  ```
  Nếu sửa TS này, `drizzle-kit push` lần sau sẽ KHÔNG cố tạo lại enum (Drizzle diff theo tên, không phá enum đã ALTER bằng tay) — nhưng **cẩn trọng**: chạy `drizzle-kit push` sau khi vừa `ALTER TYPE` tay có thể khiến Drizzle nghĩ cần thêm giá trị (nó sẽ thấy giá trị đã tồn tại → no-op, an toàn). Verify bằng `drizzle-kit push --dry-run` nếu có flag này trong version đang dùng trước khi push thật lên VPS.

### D.3 Parser mới — `apps/web/src/server/services/finImportExcel.ts` (file mới, KHÔNG sửa `excelImport.ts` cũ để tránh xung đột logic item/bom)

Tái dùng helper chung từ `excelImport.ts` (import các hàm `computeSha256`, các helper build workbook lỗi) nếu chúng được export riêng lẻ (đọc lại file để xác nhận export nào public trước khi import chéo — nếu helper không export, copy đoạn code ngắn thay vì sửa file cũ, giữ nguyên tắc không đụng module khác ngoài phạm vi).

Cột Excel template (theo mapping động — user có thể đổi thứ tự cột, đọc theo header row, không hard-code index):
| Cột | Field | Bắt buộc | Validate |
|---|---|---|---|
| Ngày GD | `transactionDate` | Có | Parse dd/mm/yyyy hoặc Excel serial date |
| Loại (Thu/Chi) | `direction` | Có | Map "Thu"→IN, "Chi"→OUT (case-insensitive, trim) |
| Số tiền | `amount` | Có | Số dương, bỏ dấu phẩy ngăn cách nghìn |
| Tài khoản | `accountCode` | Có | Fuzzy match `fin_account.code`/`name`, lỗi nếu không khớp |
| Danh mục | `categoryCode` | Không | Fuzzy match `fin_category`, để trống nếu không khớp (không chặn dòng) |
| Diễn giải | `description` | Không | Free text |
| Đối tượng (NCC/KH) | `supplierName` | Không | Fuzzy match `supplier.name`, cảnh báo nếu không khớp nhưng KHÔNG chặn |
| Số chứng từ/Ref | `externalRef` | Không | Dùng làm dedupe key ưu tiên |

### D.4 Dedupe hash — đúng theo research mục 6.3

```ts
function computeDedupeHash(row: {
  accountId: string; transactionDate: string; amount: string; externalRef?: string | null;
}): string {
  const key = row.externalRef?.trim()
    ? `${row.accountId}|${row.transactionDate}|${row.amount}|${row.externalRef.trim()}`
    : `${row.accountId}|${row.transactionDate}|${row.amount}|${row.description ?? ""}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}
```
Insert dùng `ON CONFLICT (dedupe_hash) DO NOTHING` — khớp `fin_transaction.dedupeUk` đã tạo ở Phase A. Batch chunk 500 dòng/insert (theo research mục 6.4), trong `db.transaction` riêng từng chunk để tránh lock lâu.

### D.5 3 API endpoint (thêm vào bảng B.3)

| Method | Path | Guard | Mô tả |
|---|---|---|---|
| POST | `/api/finance/imports/transactions` | create, finance | Upload Excel → parse → preview (pattern y hệt `imports/items/route.ts`) |
| POST | `/api/finance/imports/[id]/commit` | create, finance | Enqueue BullMQ job commit (pattern `imports/[id]/commit/route.ts`) |
| GET | `/api/finance/imports/template` | read, finance | Tải template Excel mẫu (dùng `buildImportTemplate` helper nếu tái dùng được, hoặc viết bản mới cho finance) |

### D.6 Worker job — `apps/worker/src/jobs/financeTransactionImport.ts`

Theo pattern `itemImport.ts`: nhận `batchId`, đọc `previewJson.allRows` từ `import_batch`, chunk insert `fin_transaction` với `ON CONFLICT (dedupe_hash) DO NOTHING`, đếm `successRows`/`duplicateRows` (map vào `rowSuccess`/`rowFail` của `import_batch` — lưu ý bảng cũ không có cột `duplicateRows` riêng, cần quyết định: gộp duplicate vào `rowFail` kèm ghi rõ trong `errorJson` dòng nào là "trùng, đã bỏ qua" khác với "lỗi validate", để user phân biệt được khi xem báo cáo). Đăng ký queue mới `QUEUE_NAMES.FINANCE_TRANSACTION_IMPORT_COMMIT` trong `packages/shared/src/constants.ts` + worker + web (enqueue service) theo đúng 3 điểm chạm như `ITEM_IMPORT_COMMIT` hiện có.

Sau commit xong, trigger `fin_account_recalc_balance` tự chạy cho từng insert — nhưng vì insert theo chunk 500 dòng cùng lúc trong 1 câu lệnh multi-row `INSERT`, trigger `FOR EACH ROW` sẽ chạy 500 lần liên tiếp update cùng 1 `fin_account` (nếu cùng tài khoản) → **rủi ro hiệu năng đáng lưu ý** (xem Phase D.7 rủi ro).

### D.7 Rủi ro riêng Phase D

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| Trigger recalc chạy 500 lần/chunk cùng tài khoản khi import hàng loạt → mỗi lần trigger là 1 full re-scan SUM() → O(n²) trong 1 chunk | Cao | Với VPS 4vCPU/8GB và quy mô "vài trăm giao dịch/tháng" theo research, chunk 500 dòng re-scan tối đa vài nghìn record hiện có → chấp nhận được (< 1s/chunk theo ước tính). Nếu sau này khối lượng tăng (sổ phụ ngân hàng hàng nghìn dòng/tháng), tối ưu bằng cách **tạm DISABLE TRIGGER trong lúc bulk insert, sau đó chạy 1 lần `UPDATE fin_account SET current_balance = ...` cho các account_id bị ảnh hưởng** — ghi chú TODO trong code, KHÔNG làm ngay ở V1 (YAGNI, chưa có bằng chứng cần). |
| Deadlock nếu 2 job import chạy song song cùng account | Trung | Worker `concurrency: 1` cho queue này (giống `itemImportCommitWorker`) — chỉ 1 job chạy tại 1 thời điểm, loại bỏ khả năng deadlock giữa 2 job. |
| Fuzzy match tài khoản/NCC sai (chọn nhầm entity gần giống tên) | Trung | Threshold similarity cao (>0.6 dùng `pg_trgm` hoặc so sánh JS `string-similarity` nếu đã có dep, kiểm tra `package.json`) + LUÔN hiển thị preview cho user duyệt trước khi commit (bước bắt buộc, không auto-commit). |
| Import trùng cùng file nhiều lần | Thấp | `findRecentByHash` (đã có, mở rộng `kind` param) chặn tạo batch mới trong 60 phút; dedupeHash ở tầng transaction chặn thêm 1 lớp nếu vẫn cố tình commit lại batch cũ. |

### D.8 Effort & DoD Phase D
- **Effort: L (~2 ngày)**
- **DoD:**
  - [ ] Upload file Excel mẫu 20 dòng (5 dòng lỗi validate cố ý, 3 dòng trùng nhau) → preview trả đúng 12 dòng hợp lệ + 5 lỗi + báo cáo 3 trùng sau commit.
  - [ ] Import lại CHÍNH file đó lần 2 → `fin_transaction` KHÔNG tăng thêm record nào (dedupe hoạt động qua `ON CONFLICT`).
  - [ ] Download template → mở bằng Excel thật, điền dữ liệu, upload lại → thành công.
  - [ ] `fin_account.currentBalance` sau import khớp tổng thủ công (SUM Excel gốc).

---

## Phase E — UI trang `/finance`

### E.1 Cài đặt Recharts (bước đầu tiên, thực hiện Local trước khi code UI)
```bash
cd apps/web && pnpm add recharts
```
Verify `pnpm build` pass sau khi thêm dependency (nguyên tắc 3 CLAUDE.md).

### E.2 Cấu trúc trang — `apps/web/src/app/(app)/finance/page.tsx`
Theo pattern hub tabs như `/engineering`, `/sales` (Server Component fetch roles → Client Component tabs). Tabs (query param `?tab=`):

| Tab key | Label | Component | Vai trò xem |
|---|---|---|---|
| `overview` | Tổng quan biểu đồ | `apps/web/src/components/finance/OverviewTab.tsx` | admin, accountant, shareholder |
| `cashbook` | Thu chi | `apps/web/src/components/finance/CashbookTab.tsx` | admin, accountant, shareholder (read-only cho shareholder) |
| `invoices` | Hóa đơn | `apps/web/src/components/finance/InvoicesTab.tsx` | admin, accountant, shareholder |
| `payments` | Thanh toán | `apps/web/src/components/finance/PaymentsTab.tsx` | admin, accountant, shareholder |
| `receivables` | Công nợ | `apps/web/src/components/finance/ReceivablesTab.tsx` | admin, accountant, shareholder |
| `accounts` | Tài khoản giao dịch | `apps/web/src/components/finance/AccountsTab.tsx` | admin, accountant, shareholder |
| `categories` | Danh mục | `apps/web/src/components/finance/CategoriesTab.tsx` | admin, accountant, shareholder |

**Ẩn/disable nút hành động (Tạo/Sửa/Xóa/Duyệt) khi `roles.includes("shareholder") && !roles.includes("admin") && !roles.includes("accountant")`** — dùng `can(roles, "create", "finance")` từ `@iot/shared` (KHÔNG hardcode role check rải rác, theo đúng bài học DRY từ V3.9 refactor `canCreateMRF`).

### E.3 Component chart — `apps/web/src/components/finance/CashflowChart.tsx`
```tsx
"use client";
import { ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, CartesianGrid } from "recharts";
```
- Bar: `in` (màu emerald) + `out` (màu rose) theo ngày.
- Line: `net` lũy kế (cumulative) hoặc trend — theo đúng yêu cầu "dòng tiền chi tiết theo ngày" (bar) + "chỉ số tăng trưởng" (line xu hướng).
- **Bọc `"use client"` bắt buộc** — Recharts dùng `ResizeObserver`, không chạy được ở Server Component (đã ghi rõ trong research mục 5).
- Dark mode: dùng CSS variable/Tailwind token hiện có của dự án cho màu trục/tooltip (đọc `apps/web/src/app/globals.css` lấy đúng token màu emerald/rose/zinc đã dùng ở `AccountingTab.tsx` để đồng bộ, KHÔNG tự bịa mã màu mới).
- Data fetch: page cha (Server Component hoặc client hook `useQuery`) gọi `/api/finance/dashboard/cashflow`, convert `Number()` mọi field trước khi truyền props vào chart (theo cảnh báo C.4).

### E.4 Format tiền — tái dùng `fmtVND`
`fmtVND` hiện định nghĩa cục bộ (không export) trong `AccountingTab.tsx`. **Khuyến nghị nhỏ: tách `fmtVND`/`fmtDate` ra `apps/web/src/lib/format.ts` (file mới, hoặc thêm vào file utils chung nếu đã có) rồi import ở cả `AccountingTab.tsx` lẫn các component Finance mới** — tránh copy-paste 2 nơi (DRY). Nếu ngại đổi file cũ (rủi ro thấp nhưng cần review), phương án tối thiểu: copy y nguyên hàm vào 1 file `apps/web/src/components/finance/_format.ts` dùng chung cho các tab Finance — chấp nhận trùng lặp có kiểm soát (KISS, ít rủi ro hơn refactor file đang chạy production).

### E.5 Wizard import — `apps/web/src/components/finance/ImportTransactionsWizard.tsx`
Copy cấu trúc `ImportWizard.tsx` (3 bước: chọn file → preview → commit + kết quả), đổi endpoint gọi sang `/api/finance/imports/transactions`.

### E.6 Effort & DoD Phase E
- **Effort: L (~2.5 ngày)** — 7 tab UI + 1 chart component + wizard.
- **DoD:**
  - [ ] `pnpm build` pass sau khi thêm recharts + toàn bộ component.
  - [ ] Đăng nhập `shareholder` → thấy đủ 7 tab, KHÔNG thấy bất kỳ nút Tạo/Sửa/Xóa nào, chart render đúng dữ liệu thật.
  - [ ] Đăng nhập `accountant` → full thao tác CRUD trên cả 7 tab.
  - [ ] Dark mode toggle → toàn bộ 7 tab + chart hiển thị đúng, không có nền trắng/chữ trắng lẫn nhau (test thủ công bằng mắt, chụp screenshot 2 theme).
  - [ ] Responsive: chart không vỡ layout ở mobile width (test DevTools 375px).

---

## Phase F — Thông báo tài chính

### F.1 Event type mới — thêm vào `NotificationEventType` union (`apps/web/src/server/services/notifications.ts`)
```ts
// V4 Finance — hóa đơn sắp đến hạn/quá hạn, thanh toán ghi nhận, công nợ quá hạn.
| "FIN_INVOICE_DUE_SOON"
| "FIN_INVOICE_OVERDUE"
| "FIN_PAYMENT_RECORDED"
| "FIN_RECEIVABLE_OVERDUE"
```
**Không cần migration** — `event_type` là `varchar(64)` tự do (đã xác nhận trong brief + `notification.ts` schema), insert string mới không cần ALTER TYPE.

### F.2 Builder function mới trong `notifications.ts`
- `notifyInvoiceDueSoon(ctx)` — fan-out `emitToUsersWithRole("accountant", {...})`, gọi khi worker quét thấy hóa đơn còn 3 ngày đến hạn.
- `notifyInvoiceOverdue(ctx)` — tương tự, khi quét thấy hóa đơn quá hạn hôm nay (chuyển UNPAID/PARTIAL→OVERDUE).
- `notifyPaymentRecorded(ctx)` — gọi ngay trong route `POST /api/finance/payments` (fire-and-forget, KHÔNG qua worker) sau khi tạo payment thành công, fan-out tới `accountant` (không cần gửi cho chính actor).
- `notifyReceivableOverdue(ctx)` — cho hóa đơn `direction=OUT` (thu từ khách) quá hạn, fan-out `accountant` + `shareholder` (cổ đông cần biết công nợ phải thu quá hạn theo đúng yêu cầu "theo dõi thu chi").

### F.3 Worker job mới — `apps/worker/src/jobs/finInvoiceReminderScan.ts`
Copy cấu trúc `prReminderScan.ts` (đã đọc, dùng làm mẫu chuẩn theo brief):
- Quét `fin_invoice WHERE status IN ('UNPAID','PARTIAL') AND direction IN ('IN','OUT')`.
- Nhánh 1: `dueDate BETWEEN today AND today+3` → `FIN_INVOICE_DUE_SOON` (chỉ nhắc 1 lần/invoice/ngày — check `notification` đã có eventType này trong 24h chưa, y hệt cơ chế `already` của `prReminderScan.ts`).
- Nhánh 2: `dueDate < today` → UPDATE `status='OVERDUE'` (đồng bộ cache theo A.3.3) + bắn `FIN_INVOICE_OVERDUE` (nếu `direction=IN`, chi trả NCC) hoặc `FIN_RECEIVABLE_OVERDUE` (nếu `direction=OUT`, thu từ khách — kèm fan-out `shareholder`).
- **Copy y nguyên `getActiveUserIdsByRoles` cục bộ trong worker** (đúng lý do đã ghi trong comment `prReminderScan.ts`: worker không import code `apps/web`, 2 app tách biệt runtime).
- Đăng ký `QUEUE_NAMES.FIN_INVOICE_REMINDER_SCAN` + `upsertJobScheduler` chạy **1 lần/ngày** (khác PR reminder chạy mỗi giờ — hóa đơn không cần tần suất cao, tránh spam notification hàng ngày nhiều lần). Chọn giờ chạy cố định sáng sớm (VD 7:00 Asia/Ho_Chi_Minh) bằng cron pattern `0 0 * * *` (UTC 00:00 = 07:00 VN, do server chạy UTC — verify timezone container trước khi chốt cron string).

### F.4 Effort & DoD Phase F
- **Effort: M (~1 ngày)**
- **DoD:**
  - [ ] Seed 1 invoice `dueDate = today+2` → chạy job thủ công (`processFinInvoiceReminderScan` gọi trực tiếp trong test) → accountant nhận `FIN_INVOICE_DUE_SOON`, chạy lại lần 2 trong ngày → KHÔNG nhận trùng.
  - [ ] Seed 1 invoice `dueDate = yesterday`, `direction=OUT` → chạy job → status chuyển `OVERDUE` + accountant VÀ shareholder đều nhận `FIN_RECEIVABLE_OVERDUE`.
  - [ ] Tạo payment qua UI → accountant khác (không phải actor) nhận `FIN_PAYMENT_RECORDED` ngay lập tức (không cần chờ job).
  - [ ] `upsertJobScheduler` idempotent — restart worker nhiều lần không tạo lịch trùng (verify qua BullMQ dashboard/log, giống cách `PR_REMINDER_SCAN` đã verify).

---

## 2. Tổng hợp danh sách file (toàn bộ 6 phase)

| # | File | Loại | Phase |
|---|---|---|---|
| 1 | `packages/db/src/schema/finance.ts` | Tạo mới | A |
| 2 | `packages/db/src/schema/index.ts` | Sửa | A |
| 3 | `packages/db/migrations/0055_finance_core.sql` (số thật xác nhận lại theo §0.4) | Tạo mới | A |
| 4 | `packages/db/src/schema/import.ts` | Sửa (enum TS đồng bộ, tuỳ chọn) | D |
| 5 | `packages/shared/src/schemas/finance.ts` | Tạo mới | B |
| 6 | `packages/shared/src/index.ts` | Sửa (export schema mới) | B |
| 7 | `packages/shared/src/rbac/matrix.ts` | Sửa | B |
| 8 | `packages/shared/src/rbac/can.test.ts` | Sửa | B |
| 9 | `apps/web/src/server/repos/finAccounts.ts` | Tạo mới | B |
| 10 | `apps/web/src/server/repos/finCategories.ts` | Tạo mới | B |
| 11 | `apps/web/src/server/repos/finTransactions.ts` | Tạo mới | B |
| 12 | `apps/web/src/server/repos/finInvoices.ts` | Tạo mới | B, C |
| 13 | `apps/web/src/server/repos/finPayments.ts` | Tạo mới | B |
| 14-37 | `apps/web/src/app/api/finance/**/route.ts` (24 route theo bảng B.3) | Tạo mới | B, C, D |
| 38 | `apps/web/src/app/(app)/layout.tsx` | Sửa (ROUTE_ROLE_GUARD) | B |
| 39 | `apps/web/src/lib/nav-items.ts` | Sửa (thêm nav item `/finance`) | B |
| 40 | `apps/web/src/server/repos/importBatch.ts` | Sửa (mở rộng union `kind`) | D |
| 41 | `apps/web/src/server/services/finImportExcel.ts` | Tạo mới | D |
| 42 | `apps/web/src/server/services/importQueue.ts` | Sửa (thêm `enqueueFinanceImportCommit`) | D |
| 43 | `apps/worker/src/jobs/financeTransactionImport.ts` | Tạo mới | D |
| 44 | `packages/shared/src/constants.ts` | Sửa (2 QUEUE_NAMES mới) | D, F |
| 45 | `apps/worker/src/index.ts` | Sửa (đăng ký 2 worker mới) | D, F |
| 46 | `apps/web/package.json` | Sửa (`pnpm add recharts`) | E |
| 47 | `apps/web/src/app/(app)/finance/page.tsx` | Tạo mới | E |
| 48-54 | `apps/web/src/components/finance/*Tab.tsx` (7 tab) | Tạo mới | E |
| 55 | `apps/web/src/components/finance/CashflowChart.tsx` | Tạo mới | E |
| 56 | `apps/web/src/components/finance/ImportTransactionsWizard.tsx` | Tạo mới | E |
| 57 | `apps/web/src/server/services/notifications.ts` | Sửa (4 event type + 4 builder) | F |
| 58 | `apps/worker/src/jobs/finInvoiceReminderScan.ts` | Tạo mới | F |
| 59 | `apps/web/src/hooks/useFinance*.ts` (React Query hooks, theo pattern `usePurchaseRequests.ts`) | Tạo mới | B, E |

---

## 3. Test strategy tổng hợp

### 3.1 Vitest (bắt buộc trước push, nguyên tắc 3 CLAUDE.md)
- `packages/shared/src/rbac/can.test.ts` — case mới §B.4.
- `apps/web/src/server/repos/finPayments.test.ts` — partial payment nhiều đợt (2-3 đợt cho 1 invoice), overpay bị chặn, double-count guard (§C.2.3).
- `apps/web/src/server/repos/finInvoices.test.ts` — aging bucket tính đúng theo mốc ngày cố định (mock `CURRENT_DATE` hoặc seed `dueDate` tương đối `now()`).
- `apps/web/src/server/services/finImportExcel.test.ts` — dedupe hash, parse ngày dd/mm/yyyy vs Excel serial, fuzzy match account/supplier.

### 3.2 E2E `.mjs` (theo nguyên tắc 5 CLAUDE.md — login thật, không chỉ `/api/health`)
Script mới `scripts/e2e-finance-smoke.mjs` (đặt cạnh các script `.mjs` hiện có nếu thư mục `scripts/` đã có tiền lệ — kiểm tra lại vị trí chuẩn trước khi tạo):
1. Login `admin` → tạo `fin_account` "Tiền mặt" → tạo `fin_category` → tạo `fin_transaction` chi tiền mặt KHÔNG hóa đơn → verify `currentBalance` giảm đúng.
2. Login `accountant` (dùng acc `ketoan` có sẵn — cần gán thêm quyền `finance` hoặc tạo acc mới nếu `ketoan` chỉ có role accountant nhưng matrix đã tự cấp `finance` action) → tạo `fin_invoice` IN từ 1 PO có sẵn → tạo `fin_payment` phân bổ 1 phần → verify `paidAmount`/`status=PARTIAL`.
3. Login `shareholder` (cần acc test mới, tạo qua `/admin/users` hoặc SQL seed) → GET mọi tab → verify 200; thử POST → verify 403.
4. Upload Excel import 5 dòng qua `accountant` → verify preview → commit → verify `fin_transaction` xuất hiện đủ + `import_batch.status=done`.
5. `GET /api/finance/dashboard/cashflow` → verify tổng khớp thủ công.
6. `GET /api/finance/receivables/aging` → verify bucket khớp.

### 3.3 Regression cần chạy lại (không phải viết mới, nhưng PHẢI xác nhận không vỡ)
- `pnpm -F @iot/shared test` (toàn bộ, không chỉ finance — RBAC matrix sửa có thể ảnh hưởng snapshot test đếm entity/role).
- `pnpm build` toàn monorepo — đặc biệt các `Record<Role, ...>` exhaustive check (như V3.9 đã gặp) — nếu wave-1 thêm role `shareholder`, MỌI `Record<Role,...>` trong codebase (UserForm.tsx, admin users pages, rlsContext.ts) phải có key `shareholder` hoặc TypeScript sẽ fail build — đây là lưới an toàn tự nhiên, nhưng đợt 2 KHÔNG chịu trách nhiệm sửa (thuộc wave-1), chỉ cần verify build xanh trước khi bắt đầu code đợt 2 (nếu build đỏ do thiếu key shareholder ở đâu đó, đó là bug wave-1 chưa xong, KHÔNG execute wave-2 cho tới khi build xanh).

---

## 4. Rủi ro tổng hợp (bổ sung ngoài rủi ro đã nêu từng phase)

| # | Rủi ro | Mức | Giảm thiểu |
|---|---|---|---|
| R1 | wave-1-foundation.md chưa tồn tại khi viết plan này — giả định sai tên role/entity | Cao | Bước đầu tiên khi execute: đọc lại wave-1 thật (nếu đã viết) hoặc chạy `grep -n "shareholder\|finance" packages/shared/src/rbac/matrix.ts packages/shared/src/types.ts` để verify tên chính xác trước khi code bất kỳ dòng nào của đợt 2. |
| R2 | Migration 0054/0055 bị trùng số nếu có nhánh khác chạy song song (dự án nhiều agent) | Cao | `ls packages/db/migrations/*.sql \| sort` NGAY TRƯỚC khi tạo file, không tin số cố định trong plan này. |
| R3 | `drizzle-kit push` sinh enum ở `public` thay vì `app`, gây khó tra cứu sau này (DRIFT-NOTES mục 1 tiền lệ) | Trung | Verify bằng query pg_type sau push (§0.3 bước 2), ghi nhận vào DRIFT-NOTES.md nếu phát sinh lệch schema, KHÔNG cần sửa nếu nhất quán với cách các enum khác trong dự án đã làm. |
| R4 | Double-count "tổng đã chi" nếu dev sau này thêm tính năng mới mà quên nguyên tắc §C.2 | Cao (dài hạn) | Comment code rõ ràng + vitest guard (§C.2.3) + validate chặn set `paymentId` thủ công (§C.2 ràng buộc 2) — 3 lớp phòng thủ. |
| R5 | Trigger `fin_account_recalc_balance` chậm khi dữ liệu lớn dần theo thời gian (full re-scan) | Thấp (V1), Trung (dài hạn) | Đã ghi rõ TODO tối ưu ở D.7, không làm sớm (YAGNI) — theo dõi qua log slow query nếu VPS báo chậm. |
| R6 | Shareholder route guard bị bỏ sót 1 trong 24 API route (chỉ nhớ sửa layout.tsx mà quên 1 số route dùng guard khác) | Trung | Toàn bộ 24 route dùng CHUNG `requireCan(req, action, "finance")` — action `read` cho GET đã tự động cho phép shareholder qua RBAC matrix (KHÔNG cần whitelist role thủ công từng route như PR ownership) — thiết kế nhất quán giảm khả năng sót. |
| R7 | Recharts thêm ~120KB gzip vào bundle `/finance` — ảnh hưởng thời gian tải trang lần đầu | Thấp | Chỉ load ở route `/finance` (Next.js code-split tự động theo route), không ảnh hưởng các trang khác. |
| R8 | Import Excel tài chính là dữ liệu nhạy cảm — sai sót khó phát hiện sau khi trộn với giao dịch thật | Trung | Bước preview bắt buộc (D.3-D.5) + KHÔNG auto-commit + audit trail `import_batch` giữ nguyên file gốc hash để trace. |

---

## 5. Ước lượng tổng

| Phase | Nội dung | Effort |
|---|---|---|
| A | Schema + migration | M (~1 ngày) |
| B | Repo + API CRUD (24 endpoint) | L (~2.5-3 ngày) |
| C | Công nợ + dashboard | M (~1-1.5 ngày) |
| D | Import Excel | L (~2 ngày) |
| E | UI 7 tab + chart | L (~2.5 ngày) |
| F | Thông báo + worker job | M (~1 ngày) |
| — | Test E2E + fix lặt vặt | M (~1 ngày) |

**Tổng ước lượng: ~11-12 ngày dev** (1 dev full-time, không tính review/QA riêng). Khuyến nghị chia làm ít nhất 3 PR theo cụm: (1) A+B [nền tảng data+API], (2) C+D [báo cáo+import], (3) E+F [UI+notification] — để review từng phần thay vì 1 PR khổng lồ ~60 file.

---

## 6. Thứ tự deploy khi execute (tổng hợp từ §0.3 + tiền lệ 0050)

1. Verify wave-1 đã DONE (R1).
2. Code Phase A local → `drizzle-kit push` local dev DB → chạy `0055_finance_core.sql` local → verify.
3. Code Phase B-F local, `pnpm build` + `pnpm typecheck` + toàn bộ vitest pass.
4. Trên VPS: backup DB (`bash scripts/backup.sh` theo README migrations) → `drizzle-kit push` (hoặc thao tác tương đương an toàn cho prod — XÁC NHẬN LẠI cách team đã push schema mới lên VPS trước đây, vì DRIFT-NOTES chỉ mô tả cách bootstrap fresh deploy, không mô tả rõ quy trình push incremental lên prod đang chạy — nếu chưa có tiền lệ, cân nhắc chạy `drizzle-kit push` qua SSH tunnel tới DB VPS thay vì chạy trực tiếp trên VPS, tùy hạ tầng CI hiện tại).
5. Chạy `0055_finance_core.sql` qua `apply-sql-migrations.sh` hoặc `psql -f` thủ công (theo pattern 0050).
6. Push `main` → GitHub Actions build → VPS pull + `docker compose up -d app worker caddy`.
7. Smoke test E2E thật trên `mes.songchau.vn` (đăng nhập `ketoan` + 1 acc shareholder test) theo §3.2.
8. Cập nhật `PROGRESS.md` + đổi version hiển thị (nếu có hardcode version string).

---

## 7. Ghi chú workflow

Theo `CLAUDE.md` hiện tại của repo, quy trình `codexdo.md` **đã bị bỏ** (user memory `codexdo_dropped.md`) — dùng `TodoWrite` + `plans/` thay thế. KHÔNG tạo task trong `codexdo.md`. Khi execute plan này, dùng `TodoWrite` để track theo 6 phase A-F ở trên, và cập nhật `PROGRESS.md` sau khi mỗi phase merge.
