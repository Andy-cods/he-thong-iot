/**
 * V3.7.46 — POST /api/work-orders/[id]/approve
 * VH-A duyệt yêu cầu sản xuất (DRAFT → RELEASED).
 *
 * Workflow:
 *   1. Verify WO status === "DRAFT"
 *   2. UPDATE status RELEASED + releasedAt + metadata.approvedBy
 *   3. Notify creator (TK-A) "WO_APPROVED"
 *   4. Audit
 *
 * RBAC: operator + admin (matrix wo:transition).
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { item as itemTable, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyWOApproved } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  notes: z.string().trim().max(500).optional().nullable(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, bodySchema);
  if ("response" in body) return body.response;

  const [wo] = await db
    .select()
    .from(workOrder)
    .where(eq(workOrder.id, params.id))
    .limit(1);
  if (!wo) return jsonError("NOT_FOUND", "Không tìm thấy WO.", 404);
  if (wo.status !== "DRAFT") {
    return jsonError(
      "INVALID_STATE",
      `WO đang ở trạng thái "${wo.status}" — chỉ duyệt được DRAFT.`,
      409,
    );
  }

  const now = new Date();
  const [updated] = await db
    .update(workOrder)
    .set({
      status: "RELEASED",
      releasedAt: now,
      notes: body.data.notes
        ? `${wo.notes ?? ""}\n[Approved] ${body.data.notes}`.trim()
        : wo.notes,
    })
    .where(eq(workOrder.id, params.id))
    .returning();
  if (!updated) return jsonError("INTERNAL", "Không cập nhật được WO.", 500);

  // Lookup product info cho notification
  const [it] = await db
    .select({ id: itemTable.id, sku: itemTable.sku, name: itemTable.name })
    .from(itemTable)
    .where(eq(itemTable.id, wo.productItemId))
    .limit(1);

  const reqMeta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "work_order",
    objectId: wo.id,
    before: { status: "DRAFT" },
    after: { status: "RELEASED", releasedAt: now.toISOString() },
    notes: `Approve YCSX ${wo.woNo}`,
    ...reqMeta,
  });

  await notifyWOApproved({
    woId: wo.id,
    woNo: wo.woNo,
    productName: it?.name ?? it?.sku,
    plannedQty: wo.plannedQty,
    creatorUserId: wo.createdBy,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
  }).catch((err) => {
    logger.warn({ err, woId: wo.id }, "notify WO approved failed");
  });

  return NextResponse.json({ data: updated });
}
