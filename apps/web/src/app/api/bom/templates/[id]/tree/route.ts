import { NextResponse, type NextRequest } from "next/server";
import { getTemplateById, loadTree } from "@/server/repos/bomTemplates";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const template = await getTemplateById(params.id);
  if (!template) return jsonError("NOT_FOUND", "Không tìm thấy BOM.", 404);

  const tree = await loadTree(params.id);
  return NextResponse.json({ data: { tree } });
}
