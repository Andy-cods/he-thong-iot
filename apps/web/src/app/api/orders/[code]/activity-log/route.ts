import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { auditEvent, bomSnapshotLine } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { getOrderByCode } from "@/server/repos/orders";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export interface OrderActivityLogRow {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  actorUsername: string | null;
  notes: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  occurredAt: string;
}

/**
 * V1.9 Phase 3 — GET /api/orders/[code]/activity-log
 *
 * Trả timeline audit cho:
 *   - sales_order (object_type='sales_order' + object_id = order.id)
 *   - bom_snapshot_line thuộc order này (JOIN qua snapshot line id).
 *
 * Giới hạn 100 record gần nhất để FE render nhẹ.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { code: string } },
) {
  const guard = await requireCan(req, "read", "audit");
  if ("response" in guard) return guard.response;

  const order = await getOrderByCode(params.code);
  if (!order) return jsonError("NOT_FOUND", "Không tìm thấy đơn hàng.", 404);

  try {
    // Lấy danh sách snapshot line IDs thuộc order này để join vào audit.
    const lineIds = await db
      .select({ id: bomSnapshotLine.id })
      .from(bomSnapshotLine)
      .where(eq(bomSnapshotLine.orderId, order.id));
    const lineIdList = lineIds.map((r) => r.id);

    const whereExpr = lineIdList.length > 0
      ? or(
          and(
            eq(auditEvent.objectType, "sales_order"),
            eq(auditEvent.objectId, order.id),
          ),
          and(
            eq(auditEvent.objectType, "bom_snapshot_line"),
            inArray(auditEvent.objectId, lineIdList),
          ),
        )
      : and(
          eq(auditEvent.objectType, "sales_order"),
          eq(auditEvent.objectId, order.id),
        );

    const rows = await db
      .select({
        id: auditEvent.id,
        action: auditEvent.action,
        objectType: auditEvent.objectType,
        objectId: auditEvent.objectId,
        actorUsername: auditEvent.actorUsername,
        notes: auditEvent.notes,
        beforeJson: auditEvent.beforeJson,
        afterJson: auditEvent.afterJson,
        occurredAt: auditEvent.occurredAt,
      })
      .from(auditEvent)
      .where(whereExpr ?? sql`true`)
      .orderBy(desc(auditEvent.occurredAt))
      .limit(100);

    const data: OrderActivityLogRow[] = rows.map((r) => ({
      id: r.id,
      action: r.action,
      objectType: r.objectType,
      objectId: r.objectId,
      actorUsername: r.actorUsername,
      notes: r.notes,
      beforeJson: r.beforeJson,
      afterJson: r.afterJson,
      occurredAt: r.occurredAt instanceof Date
        ? r.occurredAt.toISOString()
        : String(r.occurredAt),
    }));

    return NextResponse.json({ data });
  } catch (err) {
    logger.error({ err, code: params.code }, "order activity-log failed");
    return jsonError("INTERNAL", "Không tải được lịch sử đơn hàng.", 500);
  }
}
