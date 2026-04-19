import { NextResponse, type NextRequest } from "next/server";
import { userCreateSchema, userListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  checkUsernameAvailable,
  createUser,
  listUsers,
} from "@/server/repos/userAccounts";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "user");
  if ("response" in guard) return guard.response;

  const q = parseSearchParams(req, userListQuerySchema);
  if ("response" in q) return q.response;

  try {
    const page = q.data.page ?? 1;
    const pageSize = q.data.pageSize ?? 50;
    const result = await listUsers({
      q: q.data.q,
      role: q.data.role,
      isActive:
        typeof q.data.isActive === "boolean" ? q.data.isActive : undefined,
      page,
      pageSize,
    });
    return NextResponse.json({
      data: result.rows,
      meta: { page, pageSize, total: result.total },
    });
  } catch (err) {
    logger.error({ err }, "list users failed");
    return jsonError("INTERNAL", "Lỗi tải danh sách user.", 500);
  }
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "user");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, userCreateSchema);
  if ("response" in body) return body.response;

  const available = await checkUsernameAvailable(body.data.username);
  if (!available) {
    return jsonError(
      "USERNAME_DUPLICATE",
      `Username "${body.data.username}" đã tồn tại.`,
      409,
    );
  }

  try {
    const row = await createUser(
      {
        username: body.data.username,
        fullName: body.data.fullName,
        email: body.data.email || null,
        password: body.data.password,
        roles: body.data.roles,
      },
      guard.session.userId,
    );

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "user_account",
      objectId: row.id,
      after: {
        id: row.id,
        username: row.username,
        fullName: row.fullName,
        email: row.email,
        roles: body.data.roles,
      },
      ...meta,
    });

    return NextResponse.json(
      {
        data: {
          id: row.id,
          username: row.username,
          fullName: row.fullName,
          email: row.email,
          roles: body.data.roles,
        },
      },
      { status: 201 },
    );
  } catch (err) {
    logger.error({ err }, "create user failed");
    return jsonError("INTERNAL", "Không tạo được user.", 500);
  }
}
