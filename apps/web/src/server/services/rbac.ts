import type { RbacAction, RbacEntity, Role } from "@iot/shared";
import { can } from "@iot/shared";
import type { Session } from "../session";
import { findActiveOverride } from "../repos/userPermissionOverrides";

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

/**
 * V1.9 P10 — User-aware permission check (async).
 * Logic merge: deny > role > grant (deny wins, grant escalate).
 *
 * 1. Nếu có override `granted=false` còn hiệu lực → DENY.
 * 2. Else nếu role default cho phép → ALLOW (source = "role").
 * 3. Else nếu có override `granted=true` còn hiệu lực → ALLOW (source = "override-grant").
 * 4. Mặc định → DENY (source = "role").
 *
 * Performance: 1 DB hit có index (~1-2ms).
 */
export type CanForUserSource =
  | "role"
  | "override-grant"
  | "override-deny";

export interface CanForUserResult {
  allowed: boolean;
  source: CanForUserSource;
}

export async function canForUser(
  userId: string,
  roles: Role[],
  action: RbacAction,
  entity: RbacEntity,
): Promise<CanForUserResult> {
  const override = await findActiveOverride(userId, entity, action);

  // 1) Deny wins
  if (override && override.granted === false) {
    return { allowed: false, source: "override-deny" };
  }

  // 2) Role default
  const roleAllowed = can(roles, action, entity);
  if (roleAllowed) {
    return { allowed: true, source: "role" };
  }

  // 3) Override grant escalate
  if (override && override.granted === true) {
    return { allowed: true, source: "override-grant" };
  }

  // 4) Deny by default
  return { allowed: false, source: "role" };
}

/**
 * Service-layer assert có override-aware. Throw `ForbiddenError` nếu không.
 * Khác `requireCan(session, ...)` static — giữ static cho V1 tests + workers
 * không cần override (chạy trong queue worker, đã trust caller).
 */
export async function requireCanForUser(
  session: Session,
  action: RbacAction,
  entity: RbacEntity,
): Promise<Session> {
  const result = await canForUser(
    session.userId,
    session.roles,
    action,
    entity,
  );
  if (!result.allowed) {
    throw new ForbiddenError(action, entity);
  }
  return session;
}
