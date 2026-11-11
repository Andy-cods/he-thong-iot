import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { stageErrorResponse } from "@/server/bomStageHttp";
import { writeAudit } from "@/server/services/audit";
import { moveStage, moveStagesBulk } from "@/server/repos/bomStageMoves";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const itemSchema = z.object({
  lineId: z.string().uuid(),
  from: z.string().min(1).max(32),
  to: z.string().min(1).max(32),
  qty: z.number().positive().max(1e9),
  note: z.string().max(500).nullish(),
});
const bodySchema = z.union([
  itemSchema,
  z.object({ items: z.array(itemSchema).min(1).max(500) }),
]);

/**
 * BOM V5 / WP6 — chuyển bước (1 dòng hoặc `{items:[]}` all-or-nothing).
 * Quyền: `read bomTemplate` — matrix.ts không có action ghi riêng cho sổ bước
 * và mọi role vận hành (operator/warehouse/purchaser/qc/planner) đều đọc được
 * BOM; cùng quyết định "ai xem được thì cập nhật được" như WP2.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;
  const d = body.data;
  const actorId = guard.session.userId;

  try {
    if ("items" in d) {
      const r = await moveStagesBulk(params.id, d.items, actorId);
      if (!r.ok) return stageErrorResponse(r.code, { index: r.index, lineId: r.lineId });
      await writeAudit({
        actor: guard.session,
        action: "UPDATE",
        objectType: "bom_stage_move",
        objectId: params.id,
        after: { count: r.moves.length },
        notes: `Chuyển bước hàng loạt ${r.moves.length} dòng`,
        ...extractRequestMeta(req),
      });
      return NextResponse.json({ data: { moves: r.moves } });
    }
    const r = await moveStage({ ...d, templateId: params.id, actorId });
    if (!r.ok) return stageErrorResponse(r.code);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_stage_move",
      objectId: String(r.move?.id ?? ""),
      after: { lineId: d.lineId, from: d.from, to: d.to, qty: d.qty },
      ...extractRequestMeta(req),
    });
    return NextResponse.json({ data: { move: r.move, buckets: r.buckets } });
  } catch (err) {
    logger.error({ err, templateId: params.id }, "bom stage move failed");
    return jsonError("INTERNAL", "Không chuyển được bước.", 500);
  }
}
