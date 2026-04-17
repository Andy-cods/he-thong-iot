import { NextResponse, type NextRequest } from "next/server";
import { itemSupplierUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  deleteItemSupplier,
  getItemSupplier,
  updateItemSupplier,
} from "@/server/repos/itemSuppliers";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, itemSupplierUpdateSchema);
  if ("response" in body) return body.response;
  const before = await getItemSupplier(params.id, params.sid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);
  try {
    const after = await updateItemSupplier(params.id, params.sid, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "item_supplier",
      objectId: params.sid,
      before,
      after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update item_supplier failed");
    return jsonError("INTERNAL", "Không cập nhật được liên kết.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const before = await getItemSupplier(params.id, params.sid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);
  const row = await deleteItemSupplier(params.id, params.sid);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "item_supplier",
    objectId: params.sid,
    before,
    ...meta,
  });
  return NextResponse.json({ data: { id: row.id } });
}
