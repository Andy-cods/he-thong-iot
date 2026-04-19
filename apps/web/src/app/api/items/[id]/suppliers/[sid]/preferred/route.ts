import { NextResponse, type NextRequest } from "next/server";
import {
  getItemSupplier,
  setPreferredItemSupplier,
} from "@/server/repos/itemSuppliers";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string; sid: string } },
) {
  const guard = await requireCan(req, "update", "item");
  if ("response" in guard) return guard.response;
  const before = await getItemSupplier(params.id, params.sid);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);

  const after = await setPreferredItemSupplier(params.id, params.sid);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy liên kết.", 404);
  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "item_supplier",
    objectId: params.sid,
    before: { isPreferred: before.isPreferred },
    after: { isPreferred: true },
    notes: "set preferred",
    ...meta,
  });
  return NextResponse.json({ data: after });
}
