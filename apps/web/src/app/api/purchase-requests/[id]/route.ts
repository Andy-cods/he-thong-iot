import { NextResponse, type NextRequest } from "next/server";
import { prUpdateSchema } from "@iot/shared";
import { and, eq } from "drizzle-orm";
import { purchaseRequest } from "@iot/db/schema";
import { logger } from "@/lib/logger";
import {
  getPR,
  getPRLinesEnriched,
} from "@/server/repos/purchaseRequests";
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
 * GET /api/purchase-requests/[id] — detail PR + enriched lines (join item + snapshot).
 * PATCH /api/purchase-requests/[id] — update title/notes (chỉ DRAFT).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(_req, "read", "pr");
  if ("response" in guard) return guard.response;

  const row = await getPR(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);

  const lines = await getPRLinesEnriched(params.id);
  return NextResponse.json({ data: { ...row, lines } });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "update", "pr");
  if ("response" in guard) return guard.response;

  const before = await getPR(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy PR.", 404);
  if (before.status !== "DRAFT") {
    return jsonError(
      "NOT_EDITABLE",
      `PR đang ở trạng thái ${before.status} — không sửa được.`,
      409,
    );
  }

  const body = await parseJson(req, prUpdateSchema);
  if ("response" in body) return body.response;

  try {
    const [after] = await db
      .update(purchaseRequest)
      .set({
        title: body.data.title ?? null,
        notes: body.data.notes ?? null,
        updatedAt: new Date(),
      })
      .where(and(eq(purchaseRequest.id, params.id), eq(purchaseRequest.status, "DRAFT")))
      .returning();

    if (!after)
      return jsonError(
        "CONFLICT",
        "PR đã chuyển trạng thái khi đang sửa.",
        409,
      );

    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "purchase_request",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });

    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update PR failed");
    return jsonError("INTERNAL", "Không cập nhật được PR.", 500);
  }
}
