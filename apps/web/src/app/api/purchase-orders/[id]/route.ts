import { NextResponse, type NextRequest } from "next/server";
import { poUpdateSchema } from "@iot/shared";
import { and, eq } from "drizzle-orm";
import { purchaseOrder } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import { getPO, getPOLines } from "@/server/repos/purchaseOrders";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireCan } from "@/server/session";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/purchase-orders/[id] — detail + lines.
 * PATCH /api/purchase-orders/[id] — update expectedEta/actualDelivery/notes/status.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "po");
  if ("response" in guard) return guard.response;

  const row = await getPO(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  const lines = await getPOLines(params.id);
  return NextResponse.json({ data: { ...row, lines } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "po");
  if ("response" in guard) return guard.response;

  const before = await getPO(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PO.", 404);

  const body = await parseJson(req, poUpdateSchema);
  if ("response" in body) return body.response;

  const patch: Record<string, unknown> = {};
  if (body.data.expectedEta !== undefined)
    patch.expectedEta = body.data.expectedEta
      ? body.data.expectedEta.toISOString().slice(0, 10)
      : null;
  if (body.data.notes !== undefined) patch.notes = body.data.notes;
  if (body.data.status !== undefined) patch.status = body.data.status;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ data: before });
  }

  try {
    const [after] = await db
      .update(purchaseOrder)
      .set(patch)
      .where(eq(purchaseOrder.id, params.id))
      .returning();
    if (!after) return jsonError("CONFLICT", "PO đã thay đổi.", 409);

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_order",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err, id: params.id }, "update PO failed");
    return jsonError("INTERNAL", "Không cập nhật được PO.", 500);
  }
}
