import { z } from "zod";

/**
 * Finance schemas — V4.0 đợt 2 (TASK-20260922-001), Phase A.
 * Bám pattern `procurement.ts`/`supplier.ts` cùng thư mục. Validate create/update
 * cho 6 entity `fin_*` + list query params. Chỉ dùng ở Phase B (API routes) —
 * Phase A chỉ cần export sẵn để `packages/shared` build/test pass, KHÔNG có
 * route nào import các schema này ở đợt 2 (giới hạn scope theo yêu cầu).
 *
 * Ràng buộc nghiệp vụ quan trọng (xem `plans/v4-finance/wave-2-finance.md`):
 *  - `fin_transaction`: invoiceId/paymentId LUÔN optional — hỗ trợ "khoản
 *    chi/thu KHÔNG có hoá đơn". `paymentId` bị CHẶN ở create thủ công (chỉ
 *    được set qua `createPaymentWithAllocations`, Phase B) để không double-count
 *    "tổng đã chi" (xem wave-2-finance.md §C.2).
 *  - `fin_payment`: tổng `allocations[].amount` phải BẰNG `totalAmount` (V1 KISS,
 *    không cho phép overpay/underpay ở tầng validate).
 *  - `fin_invoice`: `totalAmount = subtotalAmount + vatAmount`, cho phép sai số
 *    làm tròn ±1 (numeric scale 2).
 */

const uuid = z.string().uuid("ID không hợp lệ");
const positiveAmount = z.coerce
  .number()
  .positive("Số tiền phải > 0")
  .max(999_999_999_999, "Số tiền quá lớn");
const nonNegativeAmount = z.coerce
  .number()
  .nonnegative("Số tiền không được âm")
  .max(999_999_999_999, "Số tiền quá lớn");
const dateStringOrDate = z
  .union([z.string().trim().min(1), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày không hợp lệ");
const optionalTrim = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v === "" ? null : (v ?? null)));

export const FIN_ACCOUNT_TYPES = ["BANK", "CASH"] as const;
export type FinAccountType = (typeof FIN_ACCOUNT_TYPES)[number];

export const FIN_DIRECTIONS = ["IN", "OUT"] as const;
export type FinDirection = (typeof FIN_DIRECTIONS)[number];

export const FIN_COUNTERPARTY_TYPES = [
  "SUPPLIER",
  "CUSTOMER",
  "EMPLOYEE",
  "OTHER",
] as const;
export type FinCounterpartyType = (typeof FIN_COUNTERPARTY_TYPES)[number];

export const FIN_TRANSACTION_STATUSES = ["DRAFT", "POSTED", "VOID"] as const;
export type FinTransactionStatus = (typeof FIN_TRANSACTION_STATUSES)[number];

export const FIN_INVOICE_STATUSES = [
  "DRAFT",
  "UNPAID",
  "PARTIAL",
  "PAID",
  "OVERDUE",
  "CANCELLED",
] as const;
export type FinInvoiceStatus = (typeof FIN_INVOICE_STATUSES)[number];

export const FIN_PAYMENT_METHODS = [
  "BANK_TRANSFER",
  "CASH",
  "CHECK",
  "OTHER",
] as const;
export type FinPaymentMethod = (typeof FIN_PAYMENT_METHODS)[number];

/** ==== fin_account ==== */

export const finAccountCreateSchema = z.object({
  code: z.string().trim().min(1, "Bắt buộc").max(32).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  type: z.enum(FIN_ACCOUNT_TYPES),
  bankName: optionalTrim(255),
  accountNumber: optionalTrim(64),
  openingBalance: nonNegativeAmount.optional().default(0),
  openingBalanceDate: dateStringOrDate.optional().nullable(),
});

export const finAccountUpdateSchema = finAccountCreateSchema
  .omit({ code: true, openingBalance: true, openingBalanceDate: true })
  .partial()
  .extend({
    isActive: z.coerce.boolean().optional(),
  });

export const finAccountListQuerySchema = z.object({
  type: z.enum(FIN_ACCOUNT_TYPES).optional(),
  isActive: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

/** ==== fin_category ==== */

export const finCategoryCreateSchema = z.object({
  code: z.string().trim().min(1, "Bắt buộc").max(32).transform((v) => v.toUpperCase()),
  name: z.string().trim().min(1, "Bắt buộc").max(255),
  direction: z.enum(FIN_DIRECTIONS),
  parentId: uuid.optional().nullable(),
});

export const finCategoryUpdateSchema = finCategoryCreateSchema
  .omit({ code: true, direction: true })
  .partial()
  .extend({
    isActive: z.coerce.boolean().optional(),
  });

export const finCategoryListQuerySchema = z.object({
  direction: z.enum(FIN_DIRECTIONS).optional(),
  isActive: z
    .union([z.enum(["true", "false"]), z.boolean()])
    .optional()
    .transform((v) => {
      if (v === undefined) return undefined;
      if (typeof v === "boolean") return v;
      return v === "true";
    }),
  parentId: uuid.optional().nullable(),
});

/** ==== fin_invoice ==== */

export const finInvoiceCreateSchema = z
  .object({
    invoiceNo: z.string().trim().min(1, "Bắt buộc").max(64),
    direction: z.enum(FIN_DIRECTIONS),
    supplierId: uuid.optional().nullable(),
    purchaseOrderId: uuid.optional().nullable(),
    salesOrderId: uuid.optional().nullable(),
    issueDate: dateStringOrDate,
    dueDate: dateStringOrDate.optional().nullable(),
    subtotalAmount: nonNegativeAmount,
    vatRate: z.coerce.number().min(0).max(100).optional().default(8),
    vatAmount: nonNegativeAmount,
    totalAmount: nonNegativeAmount,
    notes: optionalTrim(2000),
    attachmentUrl: optionalTrim(2000),
  })
  .refine(
    (v) => Math.abs(v.subtotalAmount + v.vatAmount - v.totalAmount) <= 1,
    {
      message: "totalAmount phải bằng subtotalAmount + vatAmount (sai số cho phép ±1đ)",
      path: ["totalAmount"],
    },
  );

export const finInvoiceUpdateSchema = z.object({
  dueDate: dateStringOrDate.optional().nullable(),
  notes: optionalTrim(2000),
  attachmentUrl: optionalTrim(2000),
});

export const finInvoiceListQuerySchema = z.object({
  direction: z.enum(FIN_DIRECTIONS).optional(),
  status: z
    .union([z.enum(FIN_INVOICE_STATUSES), z.array(z.enum(FIN_INVOICE_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  supplierId: uuid.optional(),
  overdue: z.coerce.boolean().optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

/** ==== fin_transaction ==== */

export const finTransactionCreateSchema = z.object({
  direction: z.enum(FIN_DIRECTIONS),
  accountId: uuid,
  categoryId: uuid.optional().nullable(),
  amount: positiveAmount,
  transactionDate: dateStringOrDate,
  description: optionalTrim(2000),
  counterpartyType: z.enum(FIN_COUNTERPARTY_TYPES).optional().nullable(),
  supplierId: uuid.optional().nullable(),
  purchaseOrderId: uuid.optional().nullable(),
  salesOrderId: uuid.optional().nullable(),
  // invoiceId LUÔN optional — hỗ trợ khoản chi/thu KHÔNG có hoá đơn.
  invoiceId: uuid.optional().nullable(),
  attachmentUrl: optionalTrim(2000),
  externalRef: optionalTrim(128),
  // paymentId KHÔNG cho phép set thủ công qua schema này — chỉ
  // `createPaymentWithAllocations` (Phase B repo) mới được gán, để tránh
  // double-count "tổng đã chi" (xem wave-2-finance.md §C.2 ràng buộc #2).
});

export const finTransactionUpdateSchema = z.object({
  description: optionalTrim(2000),
  attachmentUrl: optionalTrim(2000),
  categoryId: uuid.optional().nullable(),
});

export const finTransactionListQuerySchema = z.object({
  direction: z.enum(FIN_DIRECTIONS).optional(),
  accountId: uuid.optional(),
  categoryId: uuid.optional(),
  supplierId: uuid.optional(),
  status: z.enum(FIN_TRANSACTION_STATUSES).optional(),
  hasInvoice: z.coerce.boolean().optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

/** ==== fin_payment (+ allocations lồng trong 1 payload) ==== */

export const finPaymentAllocationInputSchema = z.object({
  invoiceId: uuid,
  amount: positiveAmount,
});

export const finPaymentCreateSchema = z
  .object({
    direction: z.enum(FIN_DIRECTIONS),
    accountId: uuid,
    supplierId: uuid.optional().nullable(),
    paymentDate: dateStringOrDate,
    totalAmount: positiveAmount,
    method: z.enum(FIN_PAYMENT_METHODS).optional().default("BANK_TRANSFER"),
    referenceNo: optionalTrim(128),
    notes: optionalTrim(2000),
    allocations: z.array(finPaymentAllocationInputSchema).min(1, "Cần ít nhất 1 phân bổ hoá đơn"),
  })
  .refine(
    (v) => {
      const sum = v.allocations.reduce((acc, a) => acc + a.amount, 0);
      return Math.abs(sum - v.totalAmount) <= 1;
    },
    {
      // V1 KISS: bắt buộc SUM(allocations) === totalAmount (không cho phép
      // overpay/tạm ứng dư — muốn allocate ít hơn thì tạo payment nhỏ hơn).
      message: "Tổng các khoản phân bổ (allocations) phải bằng totalAmount",
      path: ["allocations"],
    },
  );

export const finPaymentListQuerySchema = z.object({
  direction: z.enum(FIN_DIRECTIONS).optional(),
  accountId: uuid.optional(),
  supplierId: uuid.optional(),
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  dateTo: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type FinAccountCreate = z.infer<typeof finAccountCreateSchema>;
export type FinAccountUpdate = z.infer<typeof finAccountUpdateSchema>;
export type FinAccountListQuery = z.infer<typeof finAccountListQuerySchema>;

export type FinCategoryCreate = z.infer<typeof finCategoryCreateSchema>;
export type FinCategoryUpdate = z.infer<typeof finCategoryUpdateSchema>;
export type FinCategoryListQuery = z.infer<typeof finCategoryListQuerySchema>;

export type FinInvoiceCreate = z.infer<typeof finInvoiceCreateSchema>;
export type FinInvoiceUpdate = z.infer<typeof finInvoiceUpdateSchema>;
export type FinInvoiceListQuery = z.infer<typeof finInvoiceListQuerySchema>;

export type FinTransactionCreate = z.infer<typeof finTransactionCreateSchema>;
export type FinTransactionUpdate = z.infer<typeof finTransactionUpdateSchema>;
/**
 * Bộ lọc cho endpoint thống kê tổng thu/chi — GIỐNG list nhưng KHÔNG có
 * page/pageSize (tổng tính trên toàn bộ kết quả khớp lọc, không phân trang).
 */
export const finTransactionStatsQuerySchema = finTransactionListQuerySchema.omit({
  page: true,
  pageSize: true,
});
export type FinTransactionStatsQuery = z.infer<typeof finTransactionStatsQuerySchema>;

export type FinTransactionListQuery = z.infer<typeof finTransactionListQuerySchema>;

export type FinPaymentAllocationInput = z.infer<typeof finPaymentAllocationInputSchema>;
export type FinPaymentCreate = z.infer<typeof finPaymentCreateSchema>;
export type FinPaymentListQuery = z.infer<typeof finPaymentListQuerySchema>;
