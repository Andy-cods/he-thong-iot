import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError } from "@/server/http";
import { stageErrorResponse } from "@/server/bomStageHttp";
import { writeAudit } from "@/server/services/audit";
import { reverseMove } from "@/server/repos/bomStageMoves";
import { requireCan } from "@/server/session";
import { publishBomEvent } from "@/server/services/bom-events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** BOM V5 / WP6 — đảo 1 bút toán (tạo bút toán ngược, không xoá). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; moveId: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const moveId = Number(params.moveId);
  if (!Number.isInteger(moveId) || moveId <= 0)
    return jsonError("VALIDATION_FAILED", "Mã bút toán không hợp lệ.", 422);

  try {
    const r = await reverseMove(moveId, params.id, guard.session.userId);
    if (!r.ok) return stageErrorResponse(r.code);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_stage_move",
      objectId: String(r.move?.id ?? ""),
      notes: `Đảo bút toán #${moveId}`,
      ...extractRequestMeta(req),
    });
    const rl = (r.move as { lineId?: string } | null | undefined)?.lineId;
    publishBomEvent({
      templateId: params.id,
      lineIds: rl ? [rl] : undefined,
      kind: "stage",
      actorId: guard.session.userId,
    });
    return NextResponse.json({ data: { move: r.move, buckets: r.buckets } });
  } catch (err) {
    logger.error({ err, moveId }, "reverse bom stage move failed");
    return jsonError("INTERNAL", "Không đảo được bút toán.", 500);
  }
}
