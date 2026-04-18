import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req);
  if ("response" in guard) return guard.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);
  if (batch.kind !== "bom") {
    return jsonError("WRONG_KIND", "Phiên import không phải BOM.", 400);
  }

  // Preview 10 lỗi đầu (errorJson là array RowError từ worker).
  const errorJson = Array.isArray(batch.errorJson)
    ? (batch.errorJson as Array<{
        rowNumber: number;
        sheet: string;
        field: string;
        reason: string;
        rawValue?: unknown;
      }>)
    : [];
  const errorPreview = errorJson.slice(0, 10).map((e) => ({
    sheet: e.sheet,
    rowNumber: e.rowNumber,
    field: e.field,
    reason: e.reason,
  }));

  return NextResponse.json({
    data: {
      batchId: batch.id,
      status: batch.status,
      rowTotal: batch.rowTotal,
      rowSuccess: batch.rowSuccess,
      rowFail: batch.rowFail,
      errorMessage: batch.errorMessage,
      errorPreview,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
    },
  });
}
