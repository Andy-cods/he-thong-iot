import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  boolean,
  date,
  foreignKey,
  index,
  numeric,
  pgEnum,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { appSchema } from "./_schema";
import { userAccount } from "./auth";
import { supplier } from "./master";
import { purchaseOrder } from "./procurement";
import { salesOrder } from "./order";
import { importBatch } from "./import";

/**
 * V4.0 đợt 2 — Phân hệ Tài chính (sổ thu/chi + công nợ), single-entry,
 * KHÔNG double-entry, VND-only. Xem `plans/v4-finance/wave-2-finance.md` Phase A
 * và `plans/v4-finance/research-finance-oss.md` mục 4 cho quyết định thiết kế.
 *
 * 6 bảng: fin_account, fin_category, fin_transaction, fin_invoice, fin_payment,
 * fin_payment_allocation. KHÔNG tạo fin_import_batch riêng — tái dùng `import_batch`
 * có sẵn (xem `packages/db/src/schema/import.ts`), chỉ cần ALTER TYPE import_kind
 * ADD VALUE 'finance_transaction' (làm ở migration 0055_finance_core.sql).
 */

export const finAccountTypeEnum = pgEnum("fin_account_type", ["BANK", "CASH"]);
export const finDirectionEnum = pgEnum("fin_direction", ["IN", "OUT"]);
export const finCounterpartyTypeEnum = pgEnum("fin_counterparty_type", [
  "SUPPLIER",
  "CUSTOMER",
  "EMPLOYEE",
  "OTHER",
]);
export const finTransactionStatusEnum = pgEnum("fin_transaction_status", [
  "DRAFT",
  "POSTED",
  "VOID",
]);
export const finInvoiceStatusEnum = pgEnum("fin_invoice_status", [
  "DRAFT",
  "UNPAID",
  "PARTIAL",
  "PAID",
  "OVERDUE",
  "CANCELLED",
]);
export const finPaymentMethodEnum = pgEnum("fin_payment_method", [
  "BANK_TRANSFER",
  "CASH",
  "CHECK",
  "OTHER",
]);

/**
 * fin_account — Tài khoản giao dịch (ngân hàng/tiền mặt) tập trung.
 * `currentBalance` là cache denormalized — nguồn sự thật vẫn là
 * SUM(fin_transaction.amount) theo account; trigger SQL (xem migration 0055)
 * giữ đồng bộ mỗi khi fin_transaction thay đổi (INSERT/UPDATE/DELETE).
 */
export const finAccount = appSchema.table(
  "fin_account",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    type: finAccountTypeEnum("type").notNull(),
    bankName: varchar("bank_name", { length: 255 }),
    accountNumber: varchar("account_number", { length: 64 }),
    openingBalance: numeric("opening_balance", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    openingBalanceDate: date("opening_balance_date"),
    currentBalance: numeric("current_balance", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    codeUk: uniqueIndex("fin_account_code_uk").on(t.code),
    activeIdx: index("fin_account_active_idx").on(t.isActive),
  }),
);

/**
 * fin_category — Danh mục thu/chi phẳng (KHÔNG phải chart of accounts
 * double-entry đầy đủ). `parentId` self-reference cho phép nhóm (VD "Chi phí
 * vận hành" > "Điện nước") — khai bằng `foreignKey()` sau khi cột định nghĩa
 * xong, đúng pattern self-ref của `bom_line.parentLineId`
 * (`packages/db/src/schema/bom.ts`), tránh lỗi TS "used before declared".
 */
export const finCategory = appSchema.table(
  "fin_category",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    direction: finDirectionEnum("direction").notNull(),
    parentId: uuid("parent_id"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    codeUk: uniqueIndex("fin_category_code_uk").on(t.code),
    parentFk: foreignKey({
      columns: [t.parentId],
      foreignColumns: [t.id as AnyPgColumn],
      name: "fin_category_parent_fk",
    }),
    parentIdx: index("fin_category_parent_idx").on(t.parentId),
  }),
);

/**
 * fin_invoice — Hoá đơn đầu vào/đầu ra.
 * direction: IN = hoá đơn mua (từ NCC), OUT = hoá đơn bán (cho khách, công nợ
 * phải thu tính trên OUT — xem Phase C).
 * `paidAmount`/`status` là cache — tính lại ở APPLICATION LAYER (KHÔNG trigger,
 * xem wave-2-finance.md §A.3) mỗi khi fin_payment_allocation thay đổi, để tránh
 * lock contention khi import/insert hàng loạt.
 */
export const finInvoice = appSchema.table(
  "fin_invoice",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    invoiceNo: varchar("invoice_no", { length: 64 }).notNull(),
    direction: finDirectionEnum("direction").notNull(),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
    issueDate: date("issue_date").notNull(),
    dueDate: date("due_date"),
    subtotalAmount: numeric("subtotal_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    vatRate: numeric("vat_rate", { precision: 5, scale: 2 })
      .notNull()
      .default("8"),
    vatAmount: numeric("vat_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    // Cache — cập nhật ở application layer (recalcInvoicePaidAmount, Phase B) khi
    // fin_payment_allocation đổi, KHÔNG dùng trigger SQL (xem A.3.2).
    paidAmount: numeric("paid_amount", { precision: 18, scale: 2 })
      .notNull()
      .default("0"),
    status: finInvoiceStatusEnum("status").notNull().default("UNPAID"),
    notes: text("notes"),
    attachmentUrl: text("attachment_url"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    noUk: uniqueIndex("fin_invoice_no_supplier_uk").on(
      t.direction,
      t.invoiceNo,
      t.supplierId,
    ),
    statusIdx: index("fin_invoice_status_idx").on(t.direction, t.status),
    supplierIdx: index("fin_invoice_supplier_idx").on(t.supplierId),
    poIdx: index("fin_invoice_po_idx").on(t.purchaseOrderId),
    dueDateIdx: index("fin_invoice_due_date_idx").on(t.dueDate),
  }),
);

/**
 * fin_payment — Đợt thanh toán (1 payment → N invoice qua fin_payment_allocation,
 * hoặc 1 invoice ← N payment cho partial payment nhiều đợt).
 */
export const finPayment = appSchema.table(
  "fin_payment",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    direction: finDirectionEnum("direction").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccount.id),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    paymentDate: date("payment_date").notNull(),
    totalAmount: numeric("total_amount", { precision: 18, scale: 2 }).notNull(),
    method: finPaymentMethodEnum("method").notNull().default("BANK_TRANSFER"),
    referenceNo: varchar("reference_no", { length: 128 }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    codeUk: uniqueIndex("fin_payment_code_uk").on(t.code),
    accountIdx: index("fin_payment_account_idx").on(t.accountId),
    dateIdx: index("fin_payment_date_idx").on(t.paymentDate),
  }),
);

/**
 * fin_payment_allocation — N-N payment ↔ invoice (partial payment nhiều đợt).
 * Sau mỗi insert/delete → recalc `fin_invoice.paidAmount`/`status` ở application
 * layer (xem `finPayments.ts` repo, Phase B — KHÔNG làm ở migration này).
 */
export const finPaymentAllocation = appSchema.table(
  "fin_payment_allocation",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    paymentId: uuid("payment_id")
      .notNull()
      .references(() => finPayment.id, { onDelete: "cascade" }),
    invoiceId: uuid("invoice_id")
      .notNull()
      .references(() => finInvoice.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
  },
  (t) => ({
    uk: uniqueIndex("fin_payment_allocation_uk").on(t.paymentId, t.invoiceId),
    paymentIdx: index("fin_payment_allocation_payment_idx").on(t.paymentId),
    invoiceIdx: index("fin_payment_allocation_invoice_idx").on(t.invoiceId),
  }),
);

/**
 * fin_transaction — Giao dịch thu/chi hàng ngày (bảng trung tâm, single-entry).
 * `invoiceId`/`paymentId` LUÔN nullable — bắt buộc để hỗ trợ "khoản chi/thu
 * KHÔNG có hoá đơn" (yêu cầu nghiệp vụ user, xem wave-2-finance.md mục 1 #2).
 * `fin_transaction` là NGUỒN SỰ THẬT DUY NHẤT cho "tổng đã thu/đã chi" — mọi
 * payment có allocation cũng PHẢI có transaction tương ứng để không double-count
 * (xem wave-2-finance.md §C.2, thực thi ở Phase B repo, không phải ở đây).
 * `dedupeHash` unique NULLABLE — Postgres cho phép nhiều NULL trong unique index
 * (NULL ≠ NULL), nên giao dịch nhập tay không cần hash vẫn insert bình thường,
 * chỉ giao dịch import Excel mới set hash để chống trùng (ON CONFLICT DO NOTHING).
 */
export const finTransaction = appSchema.table(
  "fin_transaction",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: varchar("code", { length: 32 }).notNull(),
    direction: finDirectionEnum("direction").notNull(),
    accountId: uuid("account_id")
      .notNull()
      .references(() => finAccount.id),
    categoryId: uuid("category_id").references(() => finCategory.id),
    amount: numeric("amount", { precision: 18, scale: 2 }).notNull(),
    transactionDate: date("transaction_date").notNull(),
    description: text("description"),
    counterpartyType: finCounterpartyTypeEnum("counterparty_type"),
    supplierId: uuid("supplier_id").references(() => supplier.id),
    purchaseOrderId: uuid("purchase_order_id").references(() => purchaseOrder.id),
    salesOrderId: uuid("sales_order_id").references(() => salesOrder.id),
    // Nullable — luồng "không hoá đơn" không set field này (xem doc-comment trên).
    invoiceId: uuid("invoice_id").references(() => finInvoice.id),
    paymentId: uuid("payment_id").references(() => finPayment.id),
    attachmentUrl: text("attachment_url"),
    importBatchId: uuid("import_batch_id").references(() => importBatch.id),
    externalRef: varchar("external_ref", { length: 128 }),
    dedupeHash: varchar("dedupe_hash", { length: 64 }),
    status: finTransactionStatusEnum("status").notNull().default("POSTED"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .default(sql`now()`),
    createdBy: uuid("created_by").references(() => userAccount.id),
  },
  (t) => ({
    codeUk: uniqueIndex("fin_transaction_code_uk").on(t.code),
    dedupeUk: uniqueIndex("fin_transaction_dedupe_uk").on(t.dedupeHash),
    accountDateIdx: index("fin_transaction_account_date_idx").on(
      t.accountId,
      t.transactionDate,
    ),
    poIdx: index("fin_transaction_po_idx").on(t.purchaseOrderId),
    supplierIdx: index("fin_transaction_supplier_idx").on(t.supplierId),
    invoiceIdx: index("fin_transaction_invoice_idx").on(t.invoiceId),
    paymentIdx: index("fin_transaction_payment_idx").on(t.paymentId),
    importBatchIdx: index("fin_transaction_import_batch_idx").on(t.importBatchId),
  }),
);

export type FinAccount = typeof finAccount.$inferSelect;
export type NewFinAccount = typeof finAccount.$inferInsert;
export type FinCategory = typeof finCategory.$inferSelect;
export type NewFinCategory = typeof finCategory.$inferInsert;
export type FinTransaction = typeof finTransaction.$inferSelect;
export type NewFinTransaction = typeof finTransaction.$inferInsert;
export type FinInvoice = typeof finInvoice.$inferSelect;
export type NewFinInvoice = typeof finInvoice.$inferInsert;
export type FinPayment = typeof finPayment.$inferSelect;
export type NewFinPayment = typeof finPayment.$inferInsert;
export type FinPaymentAllocation = typeof finPaymentAllocation.$inferSelect;
export type NewFinPaymentAllocation = typeof finPaymentAllocation.$inferInsert;
