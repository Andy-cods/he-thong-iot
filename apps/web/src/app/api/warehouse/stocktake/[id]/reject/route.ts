import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, parseJson } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyStocktakeRejected } from "@/server/services/notifications";
import { rejectStocktakeSession } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

const schema = z.object({
  reason: z.string().trim().min(3, "Cần nhập lý do (≥3 ký tự) để Kho biết đếm lại chỗ nào").max(1000),
});

/**
 * V4.3 Việc 2 — POST /api/warehouse/stocktake/[id]/reject
 * PENDING_APPROVAL → REJECTED, kèm lý do — CHỈ Giám đốc (admin, hard-check).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "stocktake");
  if ("response" in guard) return guard.response;
  if (!guard.session.roles.includes("admin")) {
    return jsonError("FORBIDDEN", "Chỉ Giám đốc được trả lại phiên kiểm kê.", 403);
  }

  if (!UUID_RE.test(params.id)) {
    return jsonError("INVALID_ID", "Id phiên kiểm kê không hợp lệ", 400);
  }

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  const row = await rejectStocktakeSession(params.id, guard.session.userId, body.data.reason);
  if (!row) {
    return jsonError("INVALID_STATE", "Phiên không ở trạng thái chờ duyệt (PENDING_APPROVAL).", 409);
  }

  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "stocktake_session",
    objectId: row.id,
    after: { status: "REJECTED", reason: body.data.reason },
    notes: `Giám đốc trả lại phiên kiểm kê ${row.code}: ${body.data.reason}`,
  });

  void notifyStocktakeRejected({
    sessionId: row.id,
    code: row.code,
    creatorUserId: row.createdBy,
    reason: body.data.reason,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
  });

  return NextResponse.json({ data: row });
}
