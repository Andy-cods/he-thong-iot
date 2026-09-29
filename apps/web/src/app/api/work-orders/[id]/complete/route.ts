import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { logger } from "@/lib/logger";
import {
  WoConflictError,
  WoNotFoundError,
  WoTransitionError,
  completeWO,
} from "@/server/repos/workOrders";
import { putawayToBin } from "@/server/repos/warehouseLocation";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { insertActivityLog } from "@/server/repos/activityLogs";
import { notifyWOCompleted } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  versionLock: z.number().int().nonnegative().optional(),
  /**
   * V4.2 PROD-01 — bắt buộc (≥3 ký tự) khi SL đạt < kế hoạch. Guard thật nằm
   * ở `checkWoCompletable` (server, không tin JS phía client) — zod ở đây chỉ
   * validate KIỂU DỮ LIỆU, không validate độ dài (vì hợp lệ hay không phụ
   * thuộc có thiếu SL hay không, guard mới biết).
   */
  completeReason: z.string().trim().max(2000).optional(),
  /**
   * V4.3 Q2 — nhập kho thành phẩm khi hoàn thành. `fgQty` > 0 → tạo lô +
   * `inventory_txn` PROD_IN trong cùng transaction. Không truyền/= 0 → giữ
   * hành vi cũ (chỉ chuyển trạng thái, không nhập kho — dùng khi UI cũ/consumer
   * khác gọi thẳng API không qua dialog hoàn thành).
   */
  fgQty: z.coerce.number().nonnegative().optional(),
  fgBinId: z.string().uuid().optional().nullable(),
  fgHoldQc: z.boolean().optional(),
});

/** POST /api/work-orders/[id]/complete — IN_PROGRESS → COMPLETED (admin/planner). */
export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, schema);
  if ("response" in body) return body.response;

  try {
    const fgReceipt =
      body.data.fgQty && body.data.fgQty > 0
        ? {
            qty: body.data.fgQty,
            binId: body.data.fgBinId ?? null,
            holdQc: body.data.fgHoldQc ?? false,
            userId: guard.session.userId,
          }
        : null;
    const wo = await completeWO(
      params.id,
      body.data.versionLock,
      body.data.completeReason,
      fgReceipt,
    );
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "WO_COMPLETE",
      objectType: "work_order",
      objectId: wo.id,
      after: {
        status: wo.status,
        completedAt: wo.completedAt,
        goodQty: wo.goodQty,
        plannedQty: wo.plannedQty,
        completeReason: body.data.completeReason || null,
        fgReceipt: wo.fgReceipt,
      },
      ...meta,
    });

    // V4.3 Q2 — ghi log `warehouse_putaway` cho lô FG vừa nhập (không chặn
    // response nếu ghi log lỗi — xem cùng cơ chế ở nhận hàng/chuyển bin).
    if (wo.fgReceipt) {
      void putawayToBin({
        lotSerialId: wo.fgReceipt.lotSerialId,
        itemId: wo.productItemId,
        binId: wo.fgReceipt.binId,
        qty: wo.fgReceipt.qty,
        putawayBy: guard.session.userId,
        notes: `Nhập kho thành phẩm ${wo.woNo}`,
      }).catch((err) => {
        logger.warn(
          { err, lotSerialId: wo.fgReceipt?.lotSerialId },
          "ghi warehouse_putaway lúc nhập kho thành phẩm thất bại",
        );
      });
    }

    // Activity log + trigger derived status sync (fire-and-forget)
    void insertActivityLog({
      userId: guard.session.userId,
      entityType: "work_order",
      entityId: wo.id,
      action: "WO_COMPLETED",
      diffJson: {
        status: wo.status,
        completedAt: wo.completedAt,
        completeReason: body.data.completeReason || null,
      },
      ipAddress: meta.ipAddress ?? null,
      userAgent: meta.userAgent ?? null,
    });

    void notifyWOCompleted({
      woId: wo.id,
      woNo: wo.woNo,
      productName: null,
      plannedQty: wo.plannedQty,
      goodQty: wo.goodQty,
      actorUserId: guard.session.userId,
      actorUsername: guard.session.username,
      creatorUserId: wo.createdBy,
    });

    return NextResponse.json({ data: wo });
  } catch (err) {
    if (err instanceof WoNotFoundError) return jsonError("NOT_FOUND", err.message, 404);
    if (err instanceof WoConflictError) return jsonError("CONFLICT", err.message, 409);
    if (err instanceof WoTransitionError)
      return jsonError("INVALID_TRANSITION", err.message, 422);
    logger.error({ err, id: params.id }, "complete WO failed");
    return jsonError("INTERNAL", "Không complete được WO.", 500);
  }
}
