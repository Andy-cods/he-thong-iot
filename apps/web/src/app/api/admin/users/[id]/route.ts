import { NextResponse, type NextRequest } from "next/server";
import { userUpdateSchema, workshopRoleIssue } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getUserById, updateUser } from "@/server/repos/userAccounts";
import { revokeAllUserSessions } from "@/server/repos/sessions";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { isSelfAdminDemotion } from "@/lib/admin-guards";
import { getSiteById } from "@/server/repos/shiftOutputSetup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "user");
  if ("response" in guard) return guard.response;

  const user = await getUserById(params.id);
  if (!user) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

  return NextResponse.json({ data: user });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "user");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, userUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getUserById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

  // Safety: admin không được tự deactivate chính mình
  if (
    body.data.isActive === false &&
    guard.session.userId === params.id
  ) {
    return jsonError(
      "CANNOT_DEACTIVATE_SELF",
      "Không được deactivate tài khoản của chính bạn.",
      409,
    );
  }

  // V4.1 AD-12 — chặn admin tự gỡ vai trò admin của chính mình.
  if (
    isSelfAdminDemotion({
      actorUserId: guard.session.userId,
      targetUserId: params.id,
      beforeRoles: before.roles,
      nextRoles: body.data.roles,
    })
  ) {
    return jsonError(
      "CANNOT_DEMOTE_SELF",
      "Không được tự gỡ quyền Quản trị của chính bạn. Nhờ một quản trị viên khác thực hiện.",
      409,
    );
  }

  // V4.10 — tài khoản xưởng: không kiêm vai khác + bắt buộc có xưởng (ghép
  // trạng thái cũ với patch: đổi vai/site riêng lẻ vẫn phải giữ đúng luật).
  const nextRoles = body.data.roles ?? before.roles;
  const nextSiteId = body.data.siteId !== undefined ? body.data.siteId : before.siteId;
  const wsIssue = workshopRoleIssue(nextRoles, nextSiteId);
  if (wsIssue) return jsonError("VALIDATION_ERROR", wsIssue.message, 422, { field: wsIssue.path });
  if (body.data.siteId) {
    const site = await getSiteById(body.data.siteId);
    if (!site || !site.isActive) return jsonError("SITE_NOT_FOUND", "Xưởng không tồn tại hoặc đã ngừng.", 422);
  }

  try {
    const updated = await updateUser(params.id, {
      fullName: body.data.fullName,
      email:
        body.data.email === undefined
          ? undefined
          : body.data.email === ""
            ? null
            : body.data.email,
      isActive:
        typeof body.data.isActive === "boolean" ? body.data.isActive : undefined,
      roles: body.data.roles,
      siteId: body.data.siteId,
    }, guard.session.userId);
    if (!updated) return jsonError("NOT_FOUND", "Không tìm thấy user.", 404);

    // V4.1 AD-04: khoá tài khoản / đổi vai trò phải có hiệu lực ngay — trước đây
    // JWT cũ vẫn chạy tới hết hạn (giờ là 4h) với quyền cũ. Thu hồi mọi phiên để
    // user đăng nhập lại và nhận roles mới. Không tự thu hồi phiên của chính admin
    // đang thao tác (chỉ có thể đổi roles của mình, không thể tự khoá).
    const deactivated = body.data.isActive === false && before.isActive !== false;
    const rolesChanged =
      body.data.roles !== undefined &&
      [...body.data.roles].sort().join(",") !== [...before.roles].sort().join(",");
    // V4.10 — đổi xưởng của tài khoản xưởng cũng thu hồi phiên (phạm vi đổi ngay).
    const siteChanged = body.data.siteId !== undefined && body.data.siteId !== before.siteId;
    if ((deactivated || rolesChanged || siteChanged) && guard.session.userId !== params.id) {
      const revoked = await revokeAllUserSessions(params.id);
      logger.info(
        { id: params.id, revoked, deactivated, rolesChanged },
        "revoked user sessions after admin update",
      );
    }

    const after = await getUserById(params.id);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      (after ?? {}) as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "user_account",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update user failed");
    return jsonError("INTERNAL", "Không cập nhật được user.", 500);
  }
}
