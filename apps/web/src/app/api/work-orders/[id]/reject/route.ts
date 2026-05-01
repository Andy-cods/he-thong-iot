/**
 * V3.7.46 — POST /api/work-orders/[id]/reject
 * VH-A từ chối yêu cầu sản xuất (DRAFT → CANCELLED).
 *
 * Body: { reason: string (required, 5-500 chars) }
 */

import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { item as itemTable, workOrder } from "@iot/db/schema";
import { db } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractRequestMeta, jsonError, parseJson } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { notifyWORejected } from "@/server/services/notifications";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  reason: z.string().trim().min(5, "Lý do tối thiểu 5 ký tự").max(500),
});

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "transition", "wo");
  if ("response" in guard) return guard.response;

  // V3.7.46 — Chỉ operator (VH-A) hoặc admin mới được từ chối YCSX
  // (separation of duties — planner là creator).
  const roles = guard.session.roles;
  if (!roles.includes("admin") && !roles.includes("operator")) {
    return jsonError(
      "FORBIDDEN",
      "Chỉ Bộ phận Vận hành (operator) hoặc admin được từ chối yêu cầu sản xuất.",
      403,
    );
  }

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
      `WO đang "${wo.status}" — chỉ từ chối được khi DRAFT.`,
      409,
    );
  }

  const reason = body.data.reason.trim();
  const [updated] = await db
    .update(workOrder)
    .set({
      status: "CANCELLED",
      notes: `${wo.notes ?? ""}\n[Rejected by ${guard.session.username}] ${reason}`.trim(),
    })
    .where(eq(workOrder.id, params.id))
    .returning();
  if (!updated) return jsonError("INTERNAL", "Không update được.", 500);

  const [it] = await db
    .select({ sku: itemTable.sku, name: itemTable.name })
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
    after: { status: "CANCELLED" },
    notes: `Reject YCSX ${wo.woNo}: ${reason}`,
    ...reqMeta,
  });

  await notifyWORejected({
    woId: wo.id,
    woNo: wo.woNo,
    productName: it?.name ?? it?.sku,
    creatorUserId: wo.createdBy,
    actorUserId: guard.session.userId,
    actorUsername: guard.session.username,
    reason,
  }).catch((err) => {
    logger.warn({ err, woId: wo.id }, "notify WO rejected failed");
  });

  return NextResponse.json({ data: updated });
}
