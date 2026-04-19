import type { RbacAction, RbacEntity } from "@iot/shared";
import { can } from "@iot/shared";
import type { Session } from "../session";

/**
 * Service-layer RBAC enforcement.
 *
 * Khác với `requireCan(req, ...)` (đọc session từ cookie + trả response 401/403),
 * helper này dành cho pure service/worker context đã có `Session` object
 * sẵn — throw Error nếu không đủ quyền, để caller tự bắt và map ra HTTP.
 *
 * Dùng khi:
 * - Import queue worker / BullMQ job cần check quyền user khởi tạo task.
 * - Nested service gọi nhau mà không có NextRequest.
 *
 * @throws {ForbiddenError} 403 code=FORBIDDEN nếu không có quyền.
 */
export class ForbiddenError extends Error {
  readonly code = "FORBIDDEN" as const;
  readonly status = 403 as const;
  constructor(action: RbacAction, entity: RbacEntity) {
    super(`Forbidden: thiếu quyền ${action} trên ${entity}.`);
    this.name = "ForbiddenError";
  }
}

/**
 * Assert session có quyền `action` trên `entity`. Throw `ForbiddenError` nếu không.
 * Trả về chính `session` để inline chain:
 *   const s = requireCan(session, "create", "item");
 */
export function requireCan(
  session: Session,
  action: RbacAction,
  entity: RbacEntity,
): Session {
  if (!can(session.roles, action, entity)) {
    throw new ForbiddenError(action, entity);
  }
  return session;
}

/** Boolean check (không throw). Alias sang @iot/shared `can()`. */
export function hasCan(
  session: Session,
  action: RbacAction,
  entity: RbacEntity,
): boolean {
  return can(session.roles, action, entity);
}
