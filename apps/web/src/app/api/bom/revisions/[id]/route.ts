import { NextResponse, type NextRequest } from "next/server";
import { getRevision } from "@/server/repos/bomRevisions";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/bom/revisions/[id] — detail revision (frozen_snapshot viewer).
 *
 * Bất kỳ user đăng nhập đều xem được (read-only).
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomRevision");
  if ("response" in guard) return guard.response;

  const row = await getRevision(params.id);
  if (!row) return jsonError("NOT_FOUND", "Không tìm thấy revision.", 404);

  return NextResponse.json({ data: row });
}
