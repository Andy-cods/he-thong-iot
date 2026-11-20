import { can, SHIFT_SETUP_WORKSHOP_KINDS, type RbacAction, type RbacEntity, type ShiftSetupKind } from "@iot/shared";
import { logger } from "@/lib/logger";
import { isModuleLockedRoles } from "@/lib/shift-output/access";
import { findActiveOverride } from "./repos/userPermissionOverrides";
import type { Session } from "./session";

/**
 * V4.10 — kiểm 1 quyền PHỤ trong route (vd `approve:shiftOutput` để sửa dòng đã
 * khoá / nhập lùi quá hạn) theo đúng quy tắc requireCan: DENY override thắng →
 * quyền theo vai trò → GRANT override. Lỗi DB khi tra override → theo vai trò.
 */
export async function canWithOverride(
  session: Session,
  action: RbacAction,
  entity: RbacEntity = "shiftOutput",
): Promise<boolean> {
  let override: Awaited<ReturnType<typeof findActiveOverride>> = null;
  try {
    override = await findActiveOverride(session.userId, entity, action);
  } catch (err) {
    logger.warn({ err, userId: session.userId, entity, action }, "shift-output override lookup failed");
  }
  if (override && override.granted === false) return false;
  if (can(session.roles, action, entity)) return true;
  return override?.granted === true;
}

/**
 * P2 — tài khoản XƯỞNG (module-locked, không kiêm admin) chỉ được thêm / sửa /
 * ngừng dùng các danh mục trong `SHIFT_SETUP_WORKSHOP_KINDS` (Mã hàng, Người
 * phụ trách, Ca). Máy, lý do lỗi/dừng, thiết lập xưởng → 403. Vai khác giữ quy
 * tắc theo RBAC như P1. Trả `true` nếu BỊ CHẶN.
 */
export function workshopSetupDenied(session: Session, kind: ShiftSetupKind | "site"): boolean {
  if (!isModuleLockedRoles(session.roles)) return false;
  return kind === "site" || !SHIFT_SETUP_WORKSHOP_KINDS.includes(kind);
}

export const WORKSHOP_SETUP_DENIED_MESSAGE =
  "Tài khoản xưởng chỉ sửa được Mã hàng, Người phụ trách và Ca làm việc. Danh mục này do quản trị.";
