import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { notifyStocktakeApproved } from "@/server/services/notifications";
import { approveStocktakeSession, StocktakeError } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V4.3 Việc 2 — POST /api/warehouse/stocktake/[id]/approve
 *
 * PENDING_APPROVAL → APPROVED. CHỈ Giám đốc (admin) — quyết định nghiệp vụ
 * CỨNG (chốt 2026-09-30, giống `deliveryNotes` approve): hard-check role admin
 * TRỰC TIẾP, không chỉ dựa RBAC matrix mềm. Ghi TẤT CẢ điều chỉnh tồn
 * (ADJUST_PLUS/MINUS) trong 1 transaction duy nhất — xem `approveStocktakeSession`.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "approve", "stocktake");
  if ("response" in guard) return guard.response;
  if (!guard.session.roles.includes("admin")) {
    return jsonError("FORBIDDEN", "Chỉ Giám đốc được duyệt chốt phiên kiểm kê.", 403);
  }

  if (!UUID_RE.test(params.id)) {
    return jsonError("INVALID_ID", "Id phiên kiểm kê không hợp lệ", 400);
  }

  try {
    const result = await approveStocktakeSession(params.id, guard.session.userId);

    await writeAudit({
      actor: guard.session,
      action: "APPROVE",
      objectType: "stocktake_session",
      objectId: result.id,
      after: { status: "APPROVED", diffLineCount: result.diffLineCount },
      notes: `Giám đốc duyệt chốt phiên kiểm kê ${result.code} — ${result.diffLineCount} dòng chênh lệch đã ghi điều chỉnh.`,
    });

    void notifyStocktakeApproved({
      sessionId: result.id,
      code: result.code,
      creatorUserId: result.createdBy,
      diffLineCount: result.diffLineCount,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
    });

    return NextResponse.json({ data: result });
  } catch (err) {
    if (err instanceof StocktakeError) return jsonError(err.code, err.message, 409);
    return jsonError("APPROVE_FAILED", (err as Error).message ?? "Không duyệt được", 500);
  }
}
