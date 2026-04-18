import { NextResponse, type NextRequest } from "next/server";
import { getSnapshotLine } from "@/server/repos/snapshots";
import { jsonError } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/snapshot-lines/[id] — detail 1 snapshot line.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const row = await getSnapshotLine(params.id);
  if (!row) {
    return jsonError("NOT_FOUND", "Không tìm thấy snapshot line.", 404);
  }
  return NextResponse.json({ data: row });
}
