import { z } from "zod";

/**
 * Sales Order schemas — V1.2 Phase B1.
 *
 * Pattern giống `bom.ts`: enum labels VN + create/update/query Zod.
 * Status 7-variant khớp Drizzle `salesOrderStatusEnum`.
 */

export const SALES_ORDER_STATUSES = [
  "DRAFT",
  "CONFIRMED",
  "SNAPSHOTTED",
  "IN_PROGRESS",
  "FULFILLED",
  "CLOSED",
  "CANCELLED",
] as const;
export type SalesOrderStatus = (typeof SALES_ORDER_STATUSES)[number];

export const SALES_ORDER_STATUS_LABELS: Record<SalesOrderStatus, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã xác nhận",
  SNAPSHOTTED: "Đã chốt BOM",
  IN_PROGRESS: "Đang SX",
  FULFILLED: "Hoàn tất",
  CLOSED: "Đã đóng",
  CANCELLED: "Đã huỷ",
};

export const ORDER_PRIORITIES = ["LOW", "NORMAL", "HIGH", "URGENT"] as const;
export type OrderPriority = (typeof ORDER_PRIORITIES)[number];

export const ORDER_PRIORITY_LABELS: Record<OrderPriority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn cấp",
};

export const salesOrderStatusSchema = z.enum(SALES_ORDER_STATUSES);
export const orderPrioritySchema = z.enum(ORDER_PRIORITIES);

/** Coerce string date "YYYY-MM-DD" (HTML input type=date) sang Date. */
const dateStringOrDate = z
  .union([z.string().trim().min(1), z.date()])
  .transform((v) => (v instanceof Date ? v : new Date(v)))
  .refine((d) => !Number.isNaN(d.getTime()), "Ngày không hợp lệ");

export const orderCreateSchema = z.object({
  customerName: z
    .string()
    .trim()
    .min(2, "Tên khách hàng tối thiểu 2 ký tự")
    .max(128, "Tên khách hàng tối đa 128 ký tự"),
  customerRef: z.string().trim().max(128).optional().nullable(),
  productItemId: z.string().uuid("Phải chọn sản phẩm"),
  bomTemplateId: z.string().uuid().optional().nullable(),
  orderQty: z.coerce
    .number()
    .positive("Số lượng phải > 0")
    .max(10_000_000, "Số lượng quá lớn"),
  dueDate: dateStringOrDate.optional().nullable(),
  priority: orderPrioritySchema.default("NORMAL"),
  notes: z.string().trim().max(2000).optional().nullable(),
});

export const orderUpdateSchema = orderCreateSchema
  .partial()
  .omit({ productItemId: true })
  .extend({
    expectedVersionLock: z.coerce.number().int().nonnegative(),
  });

export const orderCloseSchema = z.object({
  closeReason: z
    .string()
    .trim()
    .min(3, "Lý do đóng đơn tối thiểu 3 ký tự")
    .max(500, "Tối đa 500 ký tự"),
});

export const orderListQuerySchema = z.object({
  q: z.string().trim().max(120).optional(),
  status: z
    .union([salesOrderStatusSchema, z.array(salesOrderStatusSchema)])
    .optional()
    .transform((v) => (v === undefined ? undefined : Array.isArray(v) ? v : [v])),
  customer: z.string().trim().max(128).optional(),
  dateFrom: z.string().trim().optional(),
  dateTo: z.string().trim().optional(),
  /** V1.6 — filter orders theo BOM template ID (FK direct). */
  bomTemplateId: z.string().uuid().optional(),
  sort: z.enum(["createdAt", "dueDate", "orderNo"]).default("createdAt"),
  sortDir: z.enum(["asc", "desc"]).default("desc"),
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(200).default(50),
});

export type OrderCreate = z.infer<typeof orderCreateSchema>;
export type OrderUpdate = z.infer<typeof orderUpdateSchema>;
export type OrderClose = z.infer<typeof orderCloseSchema>;
export type OrderListQuery = z.infer<typeof orderListQuerySchema>;
