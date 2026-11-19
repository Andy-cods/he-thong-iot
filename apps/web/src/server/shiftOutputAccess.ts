import { can, type RbacAction, type RbacEntity } from "@iot/shared";
import { logger } from "@/lib/logger";
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
