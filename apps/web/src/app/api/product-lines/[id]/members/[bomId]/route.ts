import { NextResponse, type NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import { removeProductLineMember } from "@/server/repos/productLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  req: NextRequest,
  { params }: { params: { id: string; bomId: string } },
) {
  const guard = await requireCan(req, "update", "bomTemplate");
  if ("response" in guard) return guard.response;

  await removeProductLineMember(params.id, params.bomId);
  return NextResponse.json({ data: { removed: true } });
}
