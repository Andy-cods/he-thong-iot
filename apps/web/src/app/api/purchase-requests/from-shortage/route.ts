import { NextResponse, type NextRequest } from "next/server";
import { prCreateFromShortageSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createPRFromShortage } from "@/server/repos/purchaseRequests";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/purchase-requests/from-shortage
 *
 * Tạo PR từ itemIds[] đang shortage. Repo tự aggregate snapshot_line
 * remaining_short_qty × 1.1 (buffer 10%), lookup preferred supplier từ
 * item_supplier. Role: admin + planner.
 */
export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, prCreateFromShortageSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createPRFromShortage(body.data.itemIds, guard.session.userId, {
      title: body.data.title ?? null,
    });

    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "purchase_request",
      objectId: row.id,
      after: {
        code: row.code,
        source: "SHORTAGE",
        itemCount: body.data.itemIds.length,
      },
      notes: "Tạo từ shortage board",
      ...meta,
    });

    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const msg = (err as Error).message ?? "";
    if (msg.includes("NO_SHORTAGE_FOUND")) {
      return jsonError(
        "NO_SHORTAGE",
        "Không có item nào đang shortage — không thể tạo PR.",
        422,
      );
    }
    if (msg.includes("NO_ITEMS_SELECTED")) {
      return jsonError("VALIDATION", "Chưa chọn item.", 422);
    }
    logger.error({ err }, "create PR from shortage failed");
    return jsonError("INTERNAL", "Không tạo được PR từ shortage.", 500);
  }
}
