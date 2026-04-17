import { NextResponse, type NextRequest } from "next/server";
import { supplierUpdateSchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  getSupplierById,
  softDeleteSupplier,
  updateSupplier,
} from "@/server/repos/suppliers";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
} from "@/server/http";
import { writeAudit, diffObjects } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner", "warehouse");
  if ("response" in guard) return guard.response;
  const row = await getSupplierById(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);
  return NextResponse.json({ data: row });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, supplierUpdateSchema);
  if ("response" in body) return body.response;

  const before = await getSupplierById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);
  try {
    const after = await updateSupplier(params.id, body.data);
    if (!after) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);
    const meta = extractRequestMeta(req);
    const diff = diffObjects(
      before as unknown as Record<string, unknown>,
      after as unknown as Record<string, unknown>,
    );
    await writeAudit({
      actor: guard.session,
      action: "UPDATE",
      objectType: "supplier",
      objectId: params.id,
      before: diff.before,
      after: diff.after,
      ...meta,
    });
    return NextResponse.json({ data: after });
  } catch (err) {
    logger.error({ err }, "update supplier failed");
    return jsonError("INTERNAL", "Không cập nhật được NCC.", 500);
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const before = await getSupplierById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);
  if (before.isActive === false) {
    return NextResponse.json({ data: { id: before.id, isActive: false } });
  }
  const after = await softDeleteSupplier(params.id);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "DELETE",
    objectType: "supplier",
    objectId: params.id,
    before: { isActive: true },
    after: { isActive: false },
    notes: "soft delete",
    ...meta,
  });
  return NextResponse.json({ data: { id: after.id, isActive: false } });
}
