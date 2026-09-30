import type { Role } from "@iot/shared";

/**
 * TASK-notify V4.4 — hàm THUẦN tách khỏi 3 job nhắc định kỳ (prReminderScan,
 * prApprovedNoPoScan, finInvoiceReminderScan) để test được không cần Postgres
 * thật (worker không có DB test riêng — xem reminderLogic.test.ts).
 */

/** prReminderScan — vai trò cần nhắc theo approval_step hiện tại của PR.
 * PHẢI khớp guard dept-approve (admin|warehouse) / director-approve
 * (admin|purchaser) phía apps/web, nếu lệch worker nhắc nhầm người. */
export function prReminderTargetRoles(approvalStep: string): Role[] {
  return approvalStep === "SUBMITTED" ? ["warehouse", "admin"] : ["purchaser", "admin"];
}

/** Nhãn "đang chờ ai duyệt" hiển thị trong nội dung nhắc. */
export function prReminderStepLabel(approvalStep: string): string {
  return approvalStep === "SUBMITTED" ? "Trưởng bộ phận" : "Giám đốc/Mua hàng";
}

/** prApprovedNoPoScan — số ngày đã duyệt (làm tròn xuống); null nếu thiếu mốc. */
export function daysSinceApproved(
  approvedAt: Date | null,
  nowMs: number = Date.now(),
): number | null {
  if (!approvedAt) return null;
  const diff = nowMs - approvedAt.getTime();
  return diff < 0 ? 0 : Math.floor(diff / (24 * 60 * 60 * 1000));
}

/** finInvoiceReminderScan — gộp nhiều danh sách userId, loại trùng (user nhiều vai trò). */
export function mergeUniqueUserIds(...groups: readonly (readonly string[])[]): string[] {
  return [...new Set(groups.flat())];
}

/** finInvoiceReminderScan — số tiền còn nợ = tổng − đã trả, không âm (phòng dữ liệu lệch). */
export function outstandingAmount(
  totalAmount: string | number,
  paidAmount: string | number,
): number {
  const out = Number(totalAmount) - Number(paidAmount);
  return out > 0 ? out : 0;
}
