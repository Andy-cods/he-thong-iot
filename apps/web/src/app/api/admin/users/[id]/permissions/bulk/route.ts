import { NextResponse, type NextRequest } from "next/server";
import {
  userPermissionBulkSchema,
  type RbacAction,
  type RbacEntity,
} from "@iot/shared";
import { logger } from "@/lib/logger";
import { getUserById } from "@/server/repos/userAccounts";
import {
  deleteOverride,
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
 * V1.9 P10 — POST /api/admin/users/[id]/permissions/bulk
 *
 * Body: { patches: UserPermissionPatch[] }  (max 200)
 * Apply tuần tự — mỗi patch tự upsert/delete. Audit gộp 1 dòng SUMMARY ở cuối
 * (mỗi cell vẫn có audit riêng nhờ writeAudit per-mutation).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "user");
  if ("response" in guard) return guard.response;

  if (!guard.session.roles.includes("admin")) {
    return jsonError("FORBIDDEN", "Chỉ admin được sửa quyền user.", 403);
  }

  const body = await parseJson(req, userPermissionBulkSchema);
  if ("response" in body) return body.response;

  const target = await getUserById(params.id);
  if (!target) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

  const meta = extractRequestMeta(req);
  const isSelf = guard.session.userId === params.id;

  let granted = 0;
  let denied = 0;
  let removed = 0;

  try {
    for (const p of body.data.patches) {
      // Self-deny lockout
      if (
        isSelf &&
        p.granted === false &&
        (p.entity === "user" || p.entity === "session")
      ) {
        return jsonError(
          "SELF_DENY_FORBIDDEN",
          `Không được tự thu hồi quyền ${p.entity}.${p.action} của chính bạn (tránh lockout).`,
          409,
        );
      }

      if (p.granted === null) {
        const r = await deleteOverride(params.id, p.entity, p.action);
        if (r) removed++;
      } else {
        await upsertOverride({
          userId: params.id,
          entity: p.entity as RbacEntity,
          action: p.action as RbacAction,
          granted: p.granted,
          reason: p.reason ?? null,
          expiresAt: p.expiresAt ?? null,
          grantedBy: guard.session.userId,
        });
        if (p.granted) granted++;
        else denied++;
      }
    }

    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "user_permission_override",
      objectId: params.id,
      after: {
        bulk: true,
        total: body.data.patches.length,
        granted,
        denied,
        removed,
      },
      notes: `Bulk update overrides: ${granted} grants, ${denied} denies, ${removed} removed`,
      ...meta,
    });

    return NextResponse.json({
      data: {
        userId: params.id,
        applied: body.data.patches.length,
        granted,
        denied,
        removed,
      },
    });
  } catch (err) {
    logger.error(
      { err, userId: params.id },
      "bulk update user permission failed",
    );
    return jsonError("INTERNAL", "Không cập nhật được quyền.", 500);
  }
}
