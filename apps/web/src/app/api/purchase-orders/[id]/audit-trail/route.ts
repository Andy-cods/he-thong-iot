import { NextResponse, type NextRequest } from "next/server";
import { and, desc, eq, or } from "drizzle-orm";
import { auditEvent } from "@iot/db/schema";
import { db } from "@/lib/db";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { getPO } from "@/server/repos/purchaseOrders";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders/[id]/audit-trail — V3.2 audit history.
 *
 * Trả về audit_event records cho:
 *   - object_type='purchase_order' AND object_id=poId (header changes)
 *   - object_type='receiving_event' WHERE notes/after_json mention poNo (best effort)
 *   - object_type='inbound_receipt' liên quan PO (filter qua po_id trong before/after JSON)
 *
 * V3.2 simple: chỉ filter theo object_type+object_id của PO. Receiving events
 * + inbound receipts có endpoint riêng /api/receiving/[poId]/events.
 *
 * RBAC: `read` `po`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const poId = params.id;
  if (!poId || !/^[0-9a-f-]{36}$/.test(poId)) {
    return jsonError("INVALID_PO_ID", "PO id không hợp lệ", 400);
  }

  try {
    const po = await getPO(poId);
    if (!po) return jsonError("PO_NOT_FOUND", "PO không tồn tại", 404);

    const events = await db
      .select({
        id: auditEvent.id,
        actorUserId: auditEvent.actorUserId,
        actorUsername: auditEvent.actorUsername,
        action: auditEvent.action,
        objectType: auditEvent.objectType,
        objectId: auditEvent.objectId,
        beforeJson: auditEvent.beforeJson,
        afterJson: auditEvent.afterJson,
        notes: auditEvent.notes,
        occurredAt: auditEvent.occurredAt,
        requestId: auditEvent.requestId,
        ipAddress: auditEvent.ipAddress,
      })
      .from(auditEvent)
      .where(
        and(
          eq(auditEvent.objectType, "purchase_order"),
          eq(auditEvent.objectId, poId),
        ),
      )
      .orderBy(desc(auditEvent.occurredAt))
      .limit(200);

    return NextResponse.json({
      data: {
        po: { id: po.id, poNo: po.poNo, status: po.status },
        events,
      },
    });
  } catch (e) {
    return jsonError(
      "AUDIT_TRAIL_FAILED",
      (e as Error).message ?? "Không lấy được audit trail",
      500,
    );
  }
}
