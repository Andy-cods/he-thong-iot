import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyStocktakeSubmitted } from "@/server/services/notifications";
import { submitStocktakeSession, StocktakeError } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V4.3 Việc 2 — POST /api/warehouse/stocktake/[id]/submit
 * DRAFT → PENDING_APPROVAL. Bắt buộc mọi dòng đã đếm. Báo Giám đốc (admin).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "stocktake");
  if ("response" in guard) return guard.response;

  if (!UUID_RE.test(params.id)) {
    return jsonError("INVALID_ID", "Id phiên kiểm kê không hợp lệ", 400);
  }

  try {
    const row = await submitStocktakeSession(params.id, guard.session.userId);

    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "stocktake_session",
      objectId: row.id,
      after: { status: "PENDING_APPROVAL" },
      notes: `Gửi duyệt phiên kiểm kê ${row.code}`,
    });

    void notifyStocktakeSubmitted({
      sessionId: row.id,
      code: row.code,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });

    return NextResponse.json({ data: row });
  } catch (err) {
    if (err instanceof StocktakeError) return jsonError(err.code, err.message, 409);
    return jsonError("SUBMIT_FAILED", (err as Error).message ?? "Không gửi duyệt được", 500);
  }
}
