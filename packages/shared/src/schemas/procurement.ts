import { z } from "zod";

/**
 * Procurement schemas — V1.2 Phase B4.
 *
 * Purchase Request (PR): DRAFT → SUBMITTED → APPROVED → CONVERTED (→ PO).
 * Từ DRAFT/SUBMITTED/APPROVED có thể → REJECTED.
 *
 * Purchase Order (PO): DRAFT → SENT → PARTIAL → RECEIVED / CLOSED / CANCELLED.
 *
 * Rule V1.2: 1 PO = 1 supplier. PR N item → N PO split by preferred_supplier_id atomic.
 */

export const PR_STATUSES = [
  "DRAFT",
  "SUBMITTED",
  "APPROVED",
  "CONVERTED",
  "REJECTED",
] as const;
export type PRStatus = (typeof PR_STATUSES)[number];

export const PR_STATUS_LABELS: Record<PRStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Đã gửi",
  APPROVED: "Đã duyệt",
  CONVERTED: "Đã chuyển PO",
  REJECTED: "Từ chối",
};

export const PO_STATUSES = [
  "DRAFT",
  "SENT",
  "PARTIAL",
  "RECEIVED",
  "CANCELLED",
  "CLOSED",
] as const;
export type POStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<POStatus, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi",
  PARTIAL: "Nhận 1 phần",
  RECEIVED: "Đã nhận đủ",
  CANCELLED: "Đã huỷ",
  CLOSED: "Đã đóng",
};

export const PR_SOURCES = ["MANUAL", "SHORTAGE"] as const;
export type PRSource = (typeof PR_SOURCES)[number];

const uuid = z.string().uuid("ID không hợp lệ");
const positiveQty = z.coerce
  .number()
  .positive("Số lượng phải > 0")
  .max(10_000_000, "Số lượng quá lớn");
const dateStringOrDate = z
  .union([z.string().trim().min(1), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày không hợp lệ");

/** ==== Purchase Request ==== */

export const prLineInputSchema = z.object({
  itemId: uuid,
  qty: positiveQty,
  preferredSupplierId: uuid.optional().nullable(),
  snapshotLineId: uuid.optional().nullable(),
  neededBy: dateStringOrDate.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const prCreateSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  source: z.enum(PR_SOURCES).default("MANUAL"),
  linkedOrderId: uuid.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  lines: z.array(prLineInputSchema).min(1, "PR cần ít nhất 1 dòng"),
});

export const prCreateFromShortageSchema = z.object({
  itemIds: z.array(uuid).min(1, "Chọn ít nhất 1 item"),
  title: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const prUpdateSchema = z.object({
  title: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /**
   * V3.4 — full lines edit (replace toàn bộ lines).
   * Chỉ allowed khi status DRAFT/SUBMITTED.
   * Nếu omit → giữ nguyên lines hiện tại.
   */
  lines: z
    .array(
      z.object({
        /** Existing line id để update (omit → insert mới). */
        id: uuid.optional(),
        itemId: uuid,
        qty: positiveQty,
        preferredSupplierId: uuid.optional().nullable(),
        snapshotLineId: uuid.optional().nullable(),
        neededBy: dateStringOrDate.optional().nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1, "PR cần ít nhất 1 dòng")
    .optional(),
});

export const prApproveSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export const prRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Tối đa 500 ký tự"),
});

export const prListQuerySchema = z.object({
  status: z
    .union([z.enum(PR_STATUSES), z.array(z.enum(PR_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  linkedOrderId: uuid.optional(),
  /** V1.8 — filter PR theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId: uuid.optional(),
  requestedBy: uuid.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

/** ==== Purchase Order ==== */

export const poLineInputSchema = z.object({
  itemId: uuid,
  orderedQty: positiveQty,
  unitPrice: z.coerce.number().nonnegative().optional().default(0),
  taxRate: z.coerce.number().min(0).max(100).optional().default(8),
  snapshotLineId: uuid.optional().nullable(),
  expectedEta: dateStringOrDate.optional().nullable(),
  notes: z.string().trim().max(500).optional().nullable(),
});

export const poCreateSchema = z.object({
  supplierId: uuid,
  prId: uuid.optional().nullable(),
  linkedOrderId: uuid.optional().nullable(),
  expectedEta: dateStringOrDate.optional().nullable(),
  currency: z.string().trim().max(8).default("VND"),
  paymentTerms: z.string().trim().max(100).optional().nullable(),
  deliveryAddress: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  /** Nếu true + role có "approve" quyền → tạo + duyệt luôn (SENT). */
  autoApprove: z.boolean().optional().default(false),
  lines: z.array(poLineInputSchema).min(1, "PO cần ít nhất 1 dòng"),
});

export const poApproveSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export const poRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Tối đa 500 ký tự"),
});

export const poExportQuerySchema = z.object({
  status: z
    .union([z.enum(PO_STATUSES), z.array(z.enum(PO_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  supplierId: uuid.optional(),
  from: dateStringOrDate.optional().nullable(),
  to: dateStringOrDate.optional().nullable(),
});

export const poCreateFromPRSchema = z.object({
  splitBySupplier: z.boolean().default(true),
});

export const poUpdateSchema = z.object({
  expectedEta: dateStringOrDate.optional().nullable(),
  actualDeliveryDate: dateStringOrDate.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  status: z.enum(PO_STATUSES).optional(),
  // V3.4 — header full edit (chỉ allowed khi DRAFT)
  paymentTerms: z.string().trim().max(100).optional().nullable(),
  deliveryAddress: z.string().trim().max(2000).optional().nullable(),
  supplierId: uuid.optional(),
  /**
   * V3.4 — full lines replace.
   * Chỉ allowed khi status DRAFT.
   */
  lines: z
    .array(
      z.object({
        id: uuid.optional(),
        itemId: uuid,
        orderedQty: positiveQty,
        unitPrice: z.coerce.number().nonnegative().optional().default(0),
        taxRate: z.coerce.number().min(0).max(100).optional().default(8),
        snapshotLineId: uuid.optional().nullable(),
        expectedEta: dateStringOrDate.optional().nullable(),
        notes: z.string().trim().max(500).optional().nullable(),
      }),
    )
    .min(1, "PO cần ít nhất 1 dòng")
    .optional(),
});

export const poListQuerySchema = z.object({
  status: z
    .union([z.enum(PO_STATUSES), z.array(z.enum(PO_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  supplierId: uuid.optional(),
  prId: uuid.optional(),
  /** V1.8 — filter PO theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId: uuid.optional(),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type PRLineInput = z.infer<typeof prLineInputSchema>;
export type PRCreateInput = z.infer<typeof prCreateSchema>;
export type PRCreateFromShortageInput = z.infer<
  typeof prCreateFromShortageSchema
>;
export type PRUpdateInput = z.infer<typeof prUpdateSchema>;
export type PRApproveInput = z.infer<typeof prApproveSchema>;
export type PRRejectInput = z.infer<typeof prRejectSchema>;
export type PRListQuery = z.infer<typeof prListQuerySchema>;

export type POLineInput = z.infer<typeof poLineInputSchema>;
export type POCreateInput = z.infer<typeof poCreateSchema>;
export type POCreateFromPRInput = z.infer<typeof poCreateFromPRSchema>;
export type POUpdateInput = z.infer<typeof poUpdateSchema>;
export type POListQuery = z.infer<typeof poListQuerySchema>;
export type POApproveInput = z.infer<typeof poApproveSchema>;
export type PORejectInput = z.infer<typeof poRejectSchema>;
export type POExportQuery = z.infer<typeof poExportQuerySchema>;

/**
 * V1.9-P9 / V3.2 — cấu trúc metadata JSONB trên purchase_order.
 * Chứa state approval (independent với column status) + receiving meta + payment meta.
 */
export interface POApprovalMetadata {
  // Approval workflow (V1.9-P9)
  approvalStatus?: "pending" | "approved" | "rejected";
  submittedBy?: string;
  submittedAt?: string;
  approvedBy?: string;
  approvedAt?: string;
  approvalNotes?: string | null;
  rejectedBy?: string;
  rejectedAt?: string;
  rejectedReason?: string;
  // Auto-approve flag (V3.2)
  autoApproved?: boolean;
  // Receiving approval (V3.2)
  receivingApprovedBy?: string;
  receivingApprovedAt?: string;
  receivingApprovalNotes?: string;
  receivingRejectedBy?: string;
  receivingRejectedAt?: string;
  receivingRejectedReason?: string;
  // Payment tracking (V3.2)
  paidAt?: string;
  paidAmount?: number;
  paidBy?: string;
  paymentNotes?: string;
}

/** Zod validator cho metadata khi PATCH (lỏng — phần lớn fields optional). */
export const poApprovalMetadataSchema = z
  .object({
    approvalStatus: z.enum(["pending", "approved", "rejected"]).optional(),
    submittedBy: z.string().uuid().optional(),
    submittedAt: z.string().optional(),
    approvedBy: z.string().uuid().optional(),
    approvedAt: z.string().optional(),
    approvalNotes: z.string().nullable().optional(),
    rejectedBy: z.string().uuid().optional(),
    rejectedAt: z.string().optional(),
    rejectedReason: z.string().optional(),
    autoApproved: z.boolean().optional(),
    receivingApprovedBy: z.string().uuid().optional(),
    receivingApprovedAt: z.string().optional(),
    receivingApprovalNotes: z.string().optional(),
    receivingRejectedBy: z.string().uuid().optional(),
    receivingRejectedAt: z.string().optional(),
    receivingRejectedReason: z.string().optional(),
    paidAt: z.string().optional(),
    paidAmount: z.number().nonnegative().optional(),
    paidBy: z.string().uuid().optional(),
    paymentNotes: z.string().optional(),
  })
  .partial();
