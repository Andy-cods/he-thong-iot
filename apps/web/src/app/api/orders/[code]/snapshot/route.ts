import { NextResponse, type NextRequest } from "next/server";
import { snapshotExplodeSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { getOrderByCode } from "@/server/repos/orders";
import { getRevision } from "@/server/repos/bomRevisions";
import {
  explodeSnapshot,
  ConflictError,
} from "@/server/repos/snapshots";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/orders/[code]/snapshot — explode snapshot từ 1 revision.
 *
 * admin/planner only. Body: { revisionId, targetQty }.
 * Benchmark: log duration, warn > 5s, > 500 lines → TODO V1.3 BullMQ queue.
 * Audit action=SNAPSHOT với linesCreated + durationMs.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "create", "bomSnapshot");
  if ("response" in guard) return guard.response;

  const order = await getOrderByCode(params.code);
  if (!order) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  if (
    order.status === "CLOSED" ||
    order.status === "CANCELLED" ||
    order.status === "FULFILLED"
  ) {
    return jsonError(
      "ORDER_NOT_EXPLODABLE",
      `Đơn hàng đang ở trạng thái ${order.status} — không thể explode snapshot.`,
      409,
    );
  }

  const body = await parseJson(req, snapshotExplodeSchema);
  if ("response" in body) return body.response;

  const revision = await getRevision(body.data.revisionId);
  if (!revision) {
    return jsonError("REVISION_NOT_FOUND", "Không tìm thấy revision.", 404);
  }
  if (revision.status !== "RELEASED") {
    return jsonError(
      "REVISION_NOT_RELEASED",
      `Revision phải ở trạng thái RELEASED (hiện tại: ${revision.status}).`,
      409,
    );
  }

  try {
    const result = await explodeSnapshot({
      orderId: order.id,
      revisionId: body.data.revisionId,
      targetQty: body.data.targetQty,
      userId: guard.session.userId,
    });

    if (result.linesCreated > 500) {
      logger.warn(
        {
          orderCode: params.code,
          linesCreated: result.linesCreated,
          durationMs: result.durationMs,
        },
        "snapshot > 500 lines — consider BullMQ queue V1.3",
      );
    }
    if (result.durationMs > 5000) {
      logger.warn(
        {
          orderCode: params.code,
          durationMs: result.durationMs,
          linesCreated: result.linesCreated,
        },
        "explodeSnapshot slow (> 5s)",
      );
    }

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "SNAPSHOT",
      objectType: "sales_order",
      objectId: order.id,
      after: {
        orderCode: params.code,
        revisionId: body.data.revisionId,
        revisionNo: revision.revisionNo,
        targetQty: body.data.targetQty,
        linesCreated: result.linesCreated,
        maxDepth: result.maxDepth,
        durationMs: result.durationMs,
      },
      notes: `Explode ${result.linesCreated} lines depth=${result.maxDepth} in ${result.durationMs}ms`,
      ...meta,
    });

    return NextResponse.json({ data: result }, { status: 201 });
  } catch (err) {
    if (err instanceof ConflictError) {
      return jsonError("CONFLICT", err.message, err.httpStatus);
    }
    const msg = (err as Error).message ?? "";
    if (msg.includes("REVISION_EMPTY")) {
      return jsonError(
        "REVISION_EMPTY",
        "Revision không có linh kiện — không thể explode.",
        409,
      );
    }
    logger.error({ err, orderCode: params.code }, "explode snapshot failed");
    return jsonError("INTERNAL", "Không explode được snapshot.", 500);
  }
}
