import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { writeAudit } from "@/server/services/audit";
import { reopenStocktakeSession } from "@/server/repos/stocktake";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f-]{36}$/i;

/**
 * V4.3 Việc 2 — POST /api/warehouse/stocktake/[id]/reopen
 * REJECTED → DRAFT — Kho mở lại để đếm lại sau khi Giám đốc trả lại kèm lý do.
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

  const row = await reopenStocktakeSession(params.id);
  if (!row) {
    return jsonError("INVALID_STATE", "Chỉ mở lại được phiên đang ở trạng thái REJECTED.", 409);
  }

  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "stocktake_session",
    objectId: row.id,
    after: { status: "DRAFT" },
    notes: "Mở lại phiên kiểm kê để đếm lại",
  });

  return NextResponse.json({ data: row });
}
