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
 * Ngày thật dạng `YYYY-MM-DD`: đúng định dạng VÀ tồn tại trên lịch (từ chối
 * `2026-02-31`, `2026-13-01`; `2028-02-29` hợp lệ). Hàm thuần — dùng chung cho
 * schema Bảng sản xuất (POST/PATCH) và hộp Kích hoạt BOM.
 */
export function isValidYmd(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d;
}

export const INVALID_YMD_MESSAGE = "Ngày không hợp lệ (cần ngày có thật, dạng YYYY-MM-DD).";

/** zod: chuỗi ngày thật YYYY-MM-DD. */
export function ymdSchema(message: string = INVALID_YMD_MESSAGE) {
  return z.string().refine(isValidYmd, message);
}

/**
 * Thông tin tuỳ chọn đưa lên Bảng sản xuất khi KÍCH HOẠT BOM (Nháp → Đang
 * dùng). Mọi trường đều có thể bỏ trống — QC điền sau trên /production-board.
 */
export const boardActivationSchema = z.object({
  deadline: ymdSchema("Ngày cần giao không hợp lệ").optional().nullable(),
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
