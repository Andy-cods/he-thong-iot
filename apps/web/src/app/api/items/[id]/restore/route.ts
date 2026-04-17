import { NextResponse, type NextRequest } from "next/server";
import { getItemById, restoreItem } from "@/server/repos/items";
import { extractRequestMeta, jsonError } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;

  const before = await getItemById(params.id);
  if (!before) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);
  if (before.isActive === true) {
    return NextResponse.json({ data: { id: before.id, isActive: true } });
  }

  const after = await restoreItem(params.id, guard.session.userId);
  if (!after) return jsonError("NOT_FOUND", "Không tìm thấy item.", 404);

  const meta = extractRequestMeta(req);
  await writeAudit({
    actor: guard.session,
    action: "UPDATE",
    objectType: "item",
    objectId: params.id,
    before: { isActive: false },
    after: { isActive: true },
    notes: "restore",
    ...meta,
  });
  return NextResponse.json({
    data: { id: after.id, isActive: after.isActive },
  });
}
