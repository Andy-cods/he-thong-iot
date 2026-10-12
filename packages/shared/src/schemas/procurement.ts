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
  // V4.4 (Việc 4) — huỷ bởi người tạo/admin, khác REJECTED (bị người duyệt
  // từ chối). Migration 0069 ALTER TYPE ADD VALUE.
  "CANCELLED",
] as const;
export type PRStatus = (typeof PR_STATUSES)[number];

export const PR_STATUS_LABELS: Record<PRStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Đã gửi",
  APPROVED: "Đã duyệt",
  CONVERTED: "Đã chuyển PO",
  REJECTED: "Từ chối",
  CANCELLED: "Đã huỷ",
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
  .number({ invalid_type_error: "Số lượng phải là số." })
  .positive("Số lượng phải > 0")
  // A12 — cột numeric(…,6): giá trị nhỏ hơn 0.000001 làm tròn về 0 vi phạm CHECK.
  .min(0.000001, "Số lượng tối thiểu 0,000001")
  .max(10_000_000, "Số lượng quá lớn");
/** N2 — "YYYY-MM-DD" có phải ngày lịch thật (loại 2026-02-30, JS tự lăn sang 02/03). */
export function isRealIsoDateString(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Tham số ngày `YYYY-MM-DD` (query lọc): đúng định dạng + ngày có thật. */
const isoDateParam = z
  .string()
  .refine(isRealIsoDateString, "Ngày không hợp lệ (dùng YYYY-MM-DD, ngày phải có thật).");

const dateStringOrDate = z
  .union([z.string().trim().min(1), z.date()], {
    errorMap: () => ({ message: "Ngày không hợp lệ." }),
  })
  // N2 — chuỗi dạng ngày (YYYY-MM-DD) phải là ngày thật; không thật → Invalid Date.
  .transform((v) =>
    v instanceof Date
      ? v
      : /^\d{4}-\d{2}-\d{2}$/.test(v) && !isRealIsoDateString(v)
        ? new Date(Number.NaN)
        : new Date(v),
  )
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày không hợp lệ");

/** Giới hạn số dòng / số tiền / tồn — khớp UI và cột NUMERIC trong DB (L9/L12/L19). */
export const PR_MAX_LINES = 20;
/** Đơn giá dự kiến tối đa (VND) — 10.000 tỷ. */
export const PR_MAX_UNIT_PRICE = 1e13;
/** Tồn kho snapshot tối đa. */
export const PR_MAX_ON_HAND = 1e12;
/** Thành tiền dòng (SL × đơn giá) tối đa — nhỏ hơn trần NUMERIC(18,2) = 1e16. */
export const PR_MAX_LINE_TOTAL = 1e15;

/** A12 — ngày cần/ngày giao tối đa ~5 năm tới. */
export const PR_MAX_DATE_AHEAD_DAYS = 365 * 5;

/** Ngày YYYY-MM-DD theo giờ Việt Nam (UTC+7) — không phụ thuộc múi giờ máy chủ. */
export function prTodayVN(now: Date = new Date()): string {
  return new Date(now.getTime() + 7 * 3600_000).toISOString().slice(0, 10);
}

/** Ngày cần/ngày giao không được ở quá khứ (cho phép hôm nay, giờ VN). */
const futureDateStringOrDate = dateStringOrDate
  .refine(
    // A12 — Date không hợp lệ đã bị refine trên báo lỗi; ở đây chỉ tránh ném
    // RangeError (toISOString) → 500.
    (d) => Number.isNaN(d.getTime()) || prTodayVN(d) >= prTodayVN(),
    "Ngày không được ở quá khứ (chọn hôm nay hoặc sau đó).",
  )
  .refine(
    (d) => Number.isNaN(d.getTime()) || d.getTime() <= Date.now() + PR_MAX_DATE_AHEAD_DAYS * 86_400_000,
    "Ngày quá xa (tối đa 5 năm tới).",
  );

const vText = (label: string, max: number) =>
  z
    .string({ invalid_type_error: `${label} không hợp lệ.` })
    .trim()
    .max(max, `${label} tối đa ${max} ký tự.`);

/** ==== Purchase Request ==== */

/** V3.7.55 MRF — Ưu tiên line. */
export const PR_PRIORITIES = ["URGENT", "NORMAL", "RESERVE"] as const;
export type PrPriority = (typeof PR_PRIORITIES)[number];

/** V3.7.55 MRF — Phân loại vật tư. */
export const PR_CATEGORIES = ["TOOL", "CONSUMABLE", "MATERIAL", "OTHER"] as const;
export type PrCategory = (typeof PR_CATEGORIES)[number];

/** V3.10 — Loại phiếu trình bày: MRF (YCVT 5-section) | DNVT (GTAM/PRD-MRF-02). */
export const PR_FORM_TYPES = ["MRF", "DNVT"] as const;
export type PrFormType = (typeof PR_FORM_TYPES)[number];

const prLineShape = {
  /** V3.7.72 — Nullable: cho phép nhập tay vật tư chưa có trong master. */
  itemId: uuid.optional().nullable(),
  /** V3.7.72 YCVT — Tên VT nhập tay khi itemId null. */
  itemName: vText("Tên vật tư", 255).optional().nullable(),
  /** V3.7.72 YCVT — Mã VT nhập tay khi itemId null. */
  itemSku: vText("Mã vật tư", 64).optional().nullable(),
  qty: positiveQty,
  preferredSupplierId: uuid.optional().nullable(),
  snapshotLineId: uuid.optional().nullable(),
  neededBy: futureDateStringOrDate.optional().nullable(),
  notes: vText("Ghi chú", 500).optional().nullable(),
  // V3.7.55 — MRF GTAM fields
  specification: vText("Quy cách", 512).optional().nullable(),
  uom: vText("Đơn vị tính", 16).optional().nullable(),
  priority: z
    .enum(PR_PRIORITIES, { errorMap: () => ({ message: "Mức ưu tiên không hợp lệ." }) })
    .optional()
    .nullable(),
  category: z
    .enum(PR_CATEGORIES, { errorMap: () => ({ message: "Phân loại không hợp lệ." }) })
    .optional()
    .nullable(),
  estimatedUnitPrice: z.coerce
    .number({ invalid_type_error: "Đơn giá phải là số." })
    .nonnegative("Đơn giá không được âm.")
    .max(PR_MAX_UNIT_PRICE, "Đơn giá quá lớn (tối đa 10.000 tỷ đồng).")
    .optional()
    .nullable(),
  referenceCode: vText("Mã tham chiếu", 128).optional().nullable(),
  // V3.7.69 YCVT — Tồn kho snapshot (auto-fill từ client lookup).
  onHandSnapshot: z.coerce
    .number({ invalid_type_error: "Tồn kho phải là số." })
    .nonnegative("Tồn kho không được âm.")
    .max(PR_MAX_ON_HAND, "Tồn kho quá lớn.")
    .optional()
    .nullable(),
  // V3.10 DNVT — Cột "Tham khảo" (free-text) + "Ngày giao hàng".
  referenceNote: vText("Tham khảo", 64).optional().nullable(),
  deliveryDate: futureDateStringOrDate.optional().nullable(),
};

type PrLineLike = {
  itemId?: string | null;
  itemName?: string | null;
  qty: number;
  estimatedUnitPrice?: number | null;
};

const lineHasItem = (l: PrLineLike) =>
  !!l.itemId || (l.itemName != null && l.itemName.trim().length > 0);
const lineTotalOk = (l: PrLineLike) =>
  (l.estimatedUnitPrice ?? 0) * l.qty < PR_MAX_LINE_TOTAL;
const LINE_NO_ITEM_MSG = "Dòng chưa chọn vật tư (chọn trong danh mục hoặc nhập tên vật tư).";
const LINE_TOTAL_MSG = "Thành tiền (SL × đơn giá) quá lớn — kiểm tra lại số lượng/đơn giá.";

export const prLineInputSchema = z
  .object(prLineShape)
  .refine(lineHasItem, { message: LINE_NO_ITEM_MSG, path: ["itemName"] })
  .refine(lineTotalOk, { message: LINE_TOTAL_MSG, path: ["estimatedUnitPrice"] });

const prLinesArray = <T extends z.ZodTypeAny>(line: T) =>
  z
    .array(line)
    .min(1, "Phiếu cần ít nhất 1 dòng.")
    .max(PR_MAX_LINES, `Phiếu tối đa ${PR_MAX_LINES} dòng. Tách nhiều phiếu nếu cần.`);

export const prCreateSchema = z.object({
  title: vText("Tiêu đề", 255).optional().nullable(),
  source: z.enum(PR_SOURCES, { errorMap: () => ({ message: "Nguồn phiếu không hợp lệ." }) }).default("MANUAL"),
  linkedOrderId: uuid.optional().nullable(),
  notes: vText("Ghi chú", 2000).optional().nullable(),
  lines: prLinesArray(prLineInputSchema),
  // V3.7.55 — MRF GTAM header fields
  targetDepartment: vText("Bộ phận nhận", 64).optional().nullable(),
  proposingDepartment: vText("Bộ phận đề xuất", 64).optional().nullable(),
  requestReason: vText("Lý do đề xuất", 2000).optional().nullable(),
  // V3.10 — Loại phiếu trình bày (optional; server default 'MRF' cho backward-compat).
  formType: z
    .enum(PR_FORM_TYPES, { errorMap: () => ({ message: "Loại phiếu không hợp lệ." }) })
    .optional(),
  /**
   * TASK-6VIEC Việc 2 — true = giữ nguyên DRAFT (KHÔNG auto-submit, KHÔNG bắn
   * notification). Mặc định false/omit giữ nguyên hành vi cũ (tạo xong tự
   * động gửi luôn — xem POST /api/purchase-requests).
   */
  saveAsDraft: z.boolean().optional(),
});

export const prCreateFromShortageSchema = z.object({
  itemIds: z.array(uuid).min(1, "Chọn ít nhất 1 item"),
  title: z.string().trim().max(255).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const prUpdateSchema = z.object({
  title: vText("Tiêu đề", 255).optional().nullable(),
  notes: vText("Ghi chú", 2000).optional().nullable(),
  // V3.7.55 — MRF GTAM header fields
  targetDepartment: vText("Bộ phận nhận", 64).optional().nullable(),
  proposingDepartment: vText("Bộ phận đề xuất", 64).optional().nullable(),
  requestReason: vText("Lý do đề xuất", 2000).optional().nullable(),
  /**
   * V3.4 — full lines edit (replace toàn bộ lines).
   * L7: chỉ cho sửa khi phiếu còn DRAFT (route PATCH kiểm).
   * Nếu omit → giữ nguyên lines hiện tại.
   */
  lines: prLinesArray(
    z
      .object({
        /** Existing line id để update (omit → insert mới). */
        id: uuid.optional(),
        ...prLineShape,
        // A1 — KHÔNG nhận approvedQty từ client: người lập không được tự ghi SL
        // duyệt (zod strip khoá lạ). SL duyệt chỉ ghi ở bước duyệt Kho (chưa có luồng).
      })
      .refine(lineHasItem, { message: LINE_NO_ITEM_MSG, path: ["itemName"] })
      .refine(lineTotalOk, { message: LINE_TOTAL_MSG, path: ["estimatedUnitPrice"] }),
  ).optional(),
});

export const prApproveSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export const prRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Lý do tối đa 500 ký tự"),
  /** M1 — bước client đang thấy; khác bước hiện tại → 409. Thiếu (client cũ) → bỏ qua. */
  expectedStep: z.enum(["SUBMITTED", "DEPT_APPROVED"]).optional(),
});

/** V4.4 (Việc 4) — Huỷ phiếu (khác reject: người tạo/admin tự huỷ). */
export const prCancelSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Lý do tối đa 500 ký tự"),
});

export const prListQuerySchema = z
  .object({
  status: z
    .union([z.enum(PR_STATUSES), z.array(z.enum(PR_STATUSES))], {
      errorMap: () => ({ message: "Trạng thái không hợp lệ." }),
    })
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  /**
   * A14 — tab "Hoàn tất" tách khỏi "Đã duyệt": completed=1 → chỉ phiếu đã hoàn tất
   * (approval_step DONE); completed=0 → loại phiếu hoàn tất.
   */
  completed: z
    .enum(["0", "1"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "1")),
  linkedOrderId: uuid.optional(),
  /** V1.8 — filter PR theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId: uuid.optional(),
  requestedBy: uuid.optional(),
  /** V3.13 — lọc phiếu theo đúng 1 ngày (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). */
  date: isoDateParam.optional(),
  /** V3.16 — lọc khoảng ngày [from, to] (`YYYY-MM-DD`, giờ Asia/Ho_Chi_Minh). */
  from: isoDateParam.optional(),
  to: isoDateParam.optional(),
  /** V3.16 — bảng phẳng thay thư mục: sort theo cột "Ngày tạo". */
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  q: z.string().trim().max(120).optional(),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
  })
  .refine((v) => !v.from || !v.to || v.from <= v.to, {
    message: "Từ ngày phải trước hoặc bằng Đến ngày.",
    path: ["to"],
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
  /** V4.1 TM-03/TM-10 — quy cách (DNVT) mang từ PR sang PO. */
  spec: z.string().trim().max(255).optional().nullable(),
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
  /** Nếu true + role có quyền approve → tạo PO ở DRAFT và duyệt luôn. */
  autoApprove: z.boolean().optional().default(false),
  /** Tạo PO và đưa vào hàng chờ duyệt trong cùng transaction. */
  submitForApproval: z.boolean().optional().default(false),
  lines: z.array(poLineInputSchema).min(1, "PO cần ít nhất 1 dòng"),
});

/** V4.1 TM-17 — huỷ / đóng PO bắt buộc ghi lý do. */
export const poCancelCloseSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Lý do tối đa 500 ký tự"),
});

export const poApproveSchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export const poRejectSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Lý do tối đa 500 ký tự"),
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
        /** V4.1 TM-03 — giữ quy cách khi sửa PO nháp. */
        spec: z.string().trim().max(255).optional().nullable(),
      }),
    )
    .min(1, "PO cần ít nhất 1 dòng")
    .optional(),
}).strict();

/**
 * V4.1 PO-UI: điều chỉnh đơn giá + VAT dòng PO (Thu mua / Giám đốc) ở mọi
 * trạng thái trừ Đã huỷ. Tập thuế suất hợp lệ kiểm ở server (cho phép giữ
 * nguyên VAT cũ của dòng).
 */
export const poPriceUpdateSchema = z
  .object({
    lines: z
      .array(
        z
          .object({
            lineId: uuid,
            unitPrice: z.coerce
              .number()
              .nonnegative("Đơn giá không được âm")
              .max(1e13, "Đơn giá quá lớn"),
            taxRate: z.coerce.number().min(0, "VAT không được âm").max(100),
          })
          .strict(),
      )
      .min(1, "Cần ít nhất 1 dòng")
      .max(500)
      .refine(
        (ls) => new Set(ls.map((l) => l.lineId)).size === ls.length,
        "Một dòng PO xuất hiện 2 lần",
      ),
  })
  .strict();

export const poListQuerySchema = z.object({
  status: z
    .union([z.enum(PO_STATUSES), z.array(z.enum(PO_STATUSES))])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  supplierId: uuid.optional(),
  prId: uuid.optional(),
  /** V1.8 — filter PO theo BOM (JOIN qua sales_order.bom_template_id). */
  bomTemplateId: uuid.optional(),
  /** V3.7.43 — filter theo loại PO. */
  poType: z.enum(["COMMERCIAL", "SUBCONTRACT"]).optional(),
  /** V4.1 Đợt 2 — chỉ PO quá ETA chưa nhận đủ (`overdue=1|true`). */
  overdue: z
    .enum(["1", "true", "0", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
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
export type PRCancelInput = z.infer<typeof prCancelSchema>;
export type PRListQuery = z.infer<typeof prListQuerySchema>;

export type POLineInput = z.infer<typeof poLineInputSchema>;
export type POPriceUpdateInput = z.infer<typeof poPriceUpdateSchema>;
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
