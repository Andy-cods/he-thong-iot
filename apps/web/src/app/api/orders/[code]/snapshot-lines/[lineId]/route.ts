import { NextResponse, type NextRequest } from "next/server";
import { snapshotLineUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getOrderByCode } from "@/server/repos/orders";
import {
  ConflictError,
  StateTransitionError,
  getSnapshotLine,
  updateSnapshotLine,
} from "@/server/repos/snapshots";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V1.9 Phase 3 — PATCH /api/orders/[code]/snapshot-lines/[lineId]
 *
 * Cho phép điều chỉnh chi tiết 1 snapshot line từ tab Sản xuất order detail:
 *   - requiredQty / grossRequiredQty (kế hoạch)
 *   - qcPassQty (số sẵn sàng)
 *   - state (transition, với admin override bypass state machine)
 *   - notes (ghi chú tự do)
 *
 * RBAC: `transition` `bomSnapshot` (planner/operator/admin/warehouse đều có).
 * Optimistic lock versionLock. Audit diff before/after.
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: { code: string; lineId: string } },
) {
  const guard = await requireCan(req, "transition", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const order = await getOrderByCode(params.code);
  if (!order) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  const before = await getSnapshotLine(params.lineId);
  if (!before) {
    return jsonError("NOT_FOUND", "Không tìm thấy snapshot line.", 404);
  }
  if (before.orderId !== order.id) {
    return jsonError(
      "NOT_FOUND",
      "Snapshot line không thuộc đơn hàng này.",
      404,
    );
  }

  const body = await parseJson(req, snapshotLineUpdateSchema);
  if ("response" in body) return body.response;

  const isAdmin = guard.session.roles.includes("admin");

  try {
    const after = await updateSnapshotLine(
      {
        lineId: before.id,
        expectedVersionLock: body.data.expectedVersionLock,
        userId: guard.session.userId,
        requiredQty: body.data.requiredQty,
        grossRequiredQty: body.data.grossRequiredQty,
        qcPassQty: body.data.qcPassQty,
        state: body.data.state,
        notes: body.data.notes ?? undefined,
      },
      { adminOverride: isAdmin },
    );

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "bom_snapshot_line",
      objectId: before.id,
      before: diff.before,
      after: diff.after,
      notes: `Order ${order.orderNo} · line ${before.componentSku}`,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    if (err instanceof ConflictError) {
      return jsonError("VERSION_CONFLICT", err.message, 409);
    }
    if (err instanceof StateTransitionError) {
      return jsonError("STATE_TRANSITION_INVALID", err.message, 422);
    }
    logger.error(
      { err, orderCode: params.code, lineId: params.lineId },
      "update snapshot line failed",
    );
    return jsonError("INTERNAL", "Không cập nhật được snapshot line.", 500);
  }
}
