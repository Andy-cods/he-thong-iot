import { z } from "zod";

/**
 * BOM Revision schemas — V1.2 Phase B2.
 *
 * Flow: template DRAFT → releaseRevision → clone frozen_snapshot JSON +
 * revision_no auto (R01, R02, ...). Template sau khi có revision RELEASED
 * chuyển sang ACTIVE (không sửa được lines nữa).
 */

export const BOM_REVISION_STATUSES = ["DRAFT", "RELEASED", "SUPERSEDED"] as const;
export type BomRevisionStatus = (typeof BOM_REVISION_STATUSES)[number];

export const BOM_REVISION_STATUS_LABELS: Record<BomRevisionStatus, string> = {
  DRAFT: "Nháp",
  RELEASED: "Đã phát hành",
  SUPERSEDED: "Đã thay thế",
};

export const bomRevisionStatusSchema = z.enum(BOM_REVISION_STATUSES);

/**
 * Thông tin tuỳ chọn đưa lên Bảng sản xuất khi KÍCH HOẠT BOM (Nháp → Đang
 * dùng). Mọi trường đều có thể bỏ trống — QC điền sau trên /production-board.
 */
export const boardActivationSchema = z.object({
  deadline: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Ngày cần giao không hợp lệ")
    .optional()
    .nullable(),
  rfqNo: z.string().trim().max(64, "Số QT/RFQ tối đa 64 ký tự").optional().nullable(),
  customer: z.string().trim().max(64, "Khách hàng tối đa 64 ký tự").optional().nullable(),
});

export const releaseRevisionSchema = z.object({
  notes: z
    .string()
    .trim()
    .max(2000, "Ghi chú tối đa 2000 ký tự")
    .optional()
    .nullable(),
  board: boardActivationSchema.optional().nullable(),
});

export type BoardActivationInput = z.infer<typeof boardActivationSchema>;

export const supersedeRevisionSchema = z.object({
  reason: z
    .string()
    .trim()
    .min(3, "Lý do tối thiểu 3 ký tự")
    .max(500, "Lý do tối đa 500 ký tự")
    .optional()
    .nullable(),
});

export type ReleaseRevisionInput = z.infer<typeof releaseRevisionSchema>;
export type SupersedeRevisionInput = z.infer<typeof supersedeRevisionSchema>;
