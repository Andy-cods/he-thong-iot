import { NextResponse, type NextRequest } from "next/server";
import { finAccountUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getFinAccountById, updateFinAccount } from "@/server/repos/finAccounts";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { diffObjects, writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const row = await getFinAccountById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  return NextResponse.json({ data: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finAccountUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getFinAccountById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  try {
    const after = await updateFinAccount(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "fin_account",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update fin account failed");
    return jsonError("INTERNAL", "Không cập nhật được tài khoản.", 500);
  }
}

/**
 * DELETE = soft delete (isActive=false) — tài khoản KHÔNG bao giờ xoá cứng vì
 * fin_transaction FK tới accountId (giữ audit trail dòng tiền lịch sử).
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "delete", "finance");
  if ("response" in guard) return guard.response;
  const before = await getFinAccountById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  if (before.isActive === false) {
    return NextResponse.json({ data: { id: before.id, isActive: false } });
  }
  const after = await updateFinAccount(params.id, { isActive: false });
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy tài khoản.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "fin_account",
    objectId: params.id,
    before: { isActive: true },
    after: { isActive: false },
    notes: "soft delete",
    ...meta,
  });
  return NextResponse.json({ data: { id: after.id, isActive: false } });
}
