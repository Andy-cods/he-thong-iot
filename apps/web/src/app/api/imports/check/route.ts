import { NextResponse, type NextRequest } from "next/server";
import { importCheckSchema } from "@iot/shared";
import { findRecentByHash } from "@/server/repos/importBatch";
import { parseJson } from "@/server/http";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;

  const body = await parseJson(req, importCheckSchema);
  if ("response" in body) return body.response;

  const existing = await findRecentByHash(body.data.fileHash, "item", 60);
  return NextResponse.json({
    data: {
      existing: existing
        ? {
            batchId: existing.id,
            status: existing.status,
            createdAt: existing.createdAt,
            rowSuccess: existing.rowSuccess,
            rowFail: existing.rowFail,
            fileName: existing.fileName,
          }
        : null,
    },
  });
}
