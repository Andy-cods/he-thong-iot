import type { Role } from "@iot/shared";

/**
 * V3.9 — Ownership PR: role nào xem được TẤT CẢ phiếu.
 * operator/qc (không nằm trong list) chỉ xem phiếu requestedBy = chính mình.
 * QĐ-3: warehouse giữ nguyên xem tất cả (hiện trạng V3.7.55).
 * accountant xem tất cả để tải PDF/Excel gửi thanh toán.
 */
const PR_VIEW_ALL_ROLES: Role[] = [
  "admin",
  "planner",
  "purchaser",
  "warehouse",
  "accountant",
];

export function canViewAllPRs(roles: Role[]): boolean {
  return roles.some((r) => PR_VIEW_ALL_ROLES.includes(r));
}

/**
 * TASK-6VIEC Việc 1 — role nào được XUẤT EXCEL phiếu đề xuất vật tư
 * (đơn lẻ `[id]/export-excel` lẫn danh sách/batch `export-excel`).
 * Mọi bộ phận vẫn tạo/xem phiếu của mình bình thường — đây chỉ chặn riêng
 * hành động xuất Excel (PDF giữ nguyên, không đổi). Dùng chung cho
 * server (403 tiếng Việt) + UI (ẩn nút) để không lệch nhau.
 */
const PR_EXPORT_EXCEL_ROLES: Role[] = ["admin", "purchaser", "accountant"];

export function canExportPrExcel(roles: Role[]): boolean {
  return roles.some((r) => PR_EXPORT_EXCEL_ROLES.includes(r));
}

/* ── L5: phiếu NHÁP chỉ thuộc về chủ phiếu (và admin) ─────────────────────── */

interface PrAccessSubject {
  userId: string;
  roles: Role[];
}

interface PrAccessTarget {
  status: string;
  requestedBy: string | null;
}

/**
 * L5 — quyền XEM 1 phiếu cụ thể.
 * - DRAFT: chỉ người lập + admin (người khác nhận 404 như không tồn tại).
 * - Còn lại: role xem-tất-cả (canViewAllPRs) hoặc chính chủ phiếu.
 */
export function canAccessPR(subject: PrAccessSubject, pr: PrAccessTarget): boolean {
  const isOwner = !!pr.requestedBy && pr.requestedBy === subject.userId;
  if (pr.status === "DRAFT") return isOwner || subject.roles.includes("admin");
  return canViewAllPRs(subject.roles) || isOwner;
}

/** L5/L7 — quyền SỬA / GỬI / XOÁ nháp: chỉ DRAFT, chỉ người lập hoặc admin. */
export function canEditPRDraft(subject: PrAccessSubject, pr: PrAccessTarget): boolean {
  if (pr.status !== "DRAFT") return false;
  const isOwner = !!pr.requestedBy && pr.requestedBy === subject.userId;
  return isOwner || subject.roles.includes("admin");
}

/** L6 — "Tạo lại từ phiếu này": REJECTED/CANCELLED, người lập hoặc admin. */
export function canRecreatePR(subject: PrAccessSubject, pr: PrAccessTarget): boolean {
  if (pr.status !== "REJECTED" && pr.status !== "CANCELLED") return false;
  const isOwner = !!pr.requestedBy && pr.requestedBy === subject.userId;
  return isOwner || subject.roles.includes("admin");
}
