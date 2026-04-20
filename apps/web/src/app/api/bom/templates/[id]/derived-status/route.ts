import { NextResponse, type NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import { getTemplateById } from "@/server/repos/bomTemplates";
import { computeTemplateDerivedStatus } from "@/server/services/derivedStatus";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/bom/templates/[id]/derived-status — Trụ cột 5. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const status = await computeTemplateDerivedStatus(params.id);
  return NextResponse.json({ data: status });
}
