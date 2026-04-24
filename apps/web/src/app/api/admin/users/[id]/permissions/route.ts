import { NextResponse, type NextRequest } from "next/server";
import {
  RBAC_ACTIONS,
  RBAC_ENTITIES,
  RBAC_MATRIX,
  userPermissionPatchSchema,
  type RbacAction,
  type RbacEntity,
  type Role,
} from "@iot/shared";
import { logger } from "@/lib/logger";
import { getUserById } from "@/server/repos/userAccounts";
import {
  deleteOverride,
  listActiveOverridesByUser,
  upsertOverride,
} from "@/server/repos/userPermissionOverrides";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.9 P10 — GET /api/admin/users/[id]/permissions
 *
 * Trả ma trận quyền của user: 14 entity × 6 action với 4 cờ:
 *   roleAllowed       (theo role default)
 *   override          ("GRANT" | "DENY" | null)
 *   effectiveAllowed  (sau merge)
 *   source            ("role" | "override-grant" | "override-deny")
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "user");
  if ("response" in guard) return guard.response;

  const user = await getUserById(params.id);
  if (!user) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

  const overrides = await listActiveOverridesByUser(params.id);
  const overrideMap = new Map<string, (typeof overrides)[number]>();
  for (const o of overrides) {
    overrideMap.set(`${o.entity}::${o.action}`, o);
  }

  const matrix = RBAC_ENTITIES.map((entity) => {
    const actions = RBAC_ACTIONS.map((action) => {
      // role allowed = OR over user's roles
      const roleAllowed = user.roles.some((r: Role) =>
        RBAC_MATRIX[r]?.[entity]?.includes(action),
      );
      const ov = overrideMap.get(`${entity}::${action}`);
      const overrideKind = ov
        ? ov.granted
          ? ("GRANT" as const)
          : ("DENY" as const)
        : null;

      let effectiveAllowed: boolean;
      let source: "role" | "override-grant" | "override-deny";
      if (ov && ov.granted === false) {
        effectiveAllowed = false;
        source = "override-deny";
      } else if (roleAllowed) {
        effectiveAllowed = true;
        source = "role";
      } else if (ov && ov.granted === true) {
        effectiveAllowed = true;
        source = "override-grant";
      } else {
        effectiveAllowed = false;
        source = "role";
      }

      return {
        action,
        roleAllowed,
        override: overrideKind,
        effectiveAllowed,
        source,
        reason: ov?.reason ?? null,
        expiresAt: ov?.expiresAt?.toISOString() ?? null,
      };
    });
    return { entity, actions };
  });

  return NextResponse.json({
    data: {
      userId: user.id,
      username: user.username,
      roles: user.roles,
      matrix,
    },
  });
}

/**
 * PATCH /api/admin/users/[id]/permissions
 *
 * Body: { entity, action, granted: boolean | null, reason?, expiresAt? }
 *  - granted = true   → upsert GRANT
 *  - granted = false  → upsert DENY
 *  - granted = null   → xoá override (về role-default)
 *
 * Self-deny prevention: admin không thể self-DENY entity "user" (lockout).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "user");
  if ("response" in guard) return guard.response;

  // Strict admin only — RBAC matrix `update user` chỉ admin có. Layer thừa
  // cho safety nếu matrix có bị nới thêm role tương lai.
  if (!guard.session.roles.includes("admin")) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ admin được sửa quyền user.",
      403,
    );
  }

  const body = await parseJson(req, userPermissionPatchSchema);
  if ("response" in body) return body.response;

  const target = await getUserById(params.id);
  if (!target) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

  const { entity, action, granted, reason, expiresAt } = body.data;

  // Self-deny lockout protection: admin không được tự DENY các quyền user/session
  if (
    guard.session.userId === params.id &&
    granted === false &&
    (entity === "user" || entity === "session")
  ) {
    return jsonError(
      "SELF_DENY_FORBIDDEN",
      "Không được tự thu hồi quyền user/session của chính mình (tránh lockout).",
      409,
    );
  }

  const meta = extractRequestMeta(req);

  try {
    if (granted === null) {
      // Remove override
      const removed = await deleteOverride(params.id, entity, action);
      if (removed) {
        await writeAudit({
          actor: guard.session,
          action: "UPDATE",
          objectType: "user_permission_override",
          objectId: params.id,
          before: {
            entity,
            action: action as RbacAction,
            granted: removed.granted,
          },
          after: { entity, action: action as RbacAction, granted: null },
          notes: `Xoá override ${entity}.${action}`,
          ...meta,
        });
      }
      return NextResponse.json({
        data: {
          userId: params.id,
          entity,
          action,
          override: null,
        },
      });
    }

    const row = await upsertOverride({
      userId: params.id,
      entity: entity as RbacEntity,
      action: action as RbacAction,
      granted,
      reason: reason ?? null,
      expiresAt: expiresAt ?? null,
      grantedBy: guard.session.userId,
    });

    await writeAudit({
      actor: guard.session,
      action: granted ? "APPROVE" : "UPDATE",
      objectType: "user_permission_override",
      objectId: params.id,
      after: {
        entity,
        action: action as RbacAction,
        granted,
        reason: reason ?? null,
      },
      notes: granted
        ? `GRANT ${entity}.${action}`
        : `DENY ${entity}.${action}`,
      ...meta,
    });

    return NextResponse.json({
      data: {
        userId: params.id,
        entity,
        action,
        override: row.granted ? "GRANT" : "DENY",
        reason: row.reason,
        expiresAt: row.expiresAt?.toISOString() ?? null,
      },
    });
  } catch (err) {
    logger.error(
      { err, userId: params.id, entity, action },
      "patch user permission failed",
    );
    return jsonError("INTERNAL", "Không cập nhật được quyền.", 500);
  }
}
