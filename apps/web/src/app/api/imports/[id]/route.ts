import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/imports/:id — trạng thái + preview + counters. */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "item");
  if ("response" in guard) return guard.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);

  return NextResponse.json({
    data: {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      duplicateMode: batch.duplicateMode,
      fileName: batch.fileName,
      fileSizeBytes: batch.fileSizeBytes,
      rowTotal: batch.rowTotal,
      rowSuccess: batch.rowSuccess,
      rowFail: batch.rowFail,
      preview:
        batch.previewJson &&
        typeof batch.previewJson === "object" &&
        "preview" in (batch.previewJson as Record<string, unknown>)
          ? {
              rows:
                (batch.previewJson as { preview?: unknown[] }).preview ?? [],
              validCount:
                (batch.previewJson as { validCount?: number }).validCount ?? 0,
              errorCount:
                (batch.previewJson as { errorCount?: number }).errorCount ?? 0,
            }
          : null,
      errorCount: Array.isArray(batch.errorJson) ? batch.errorJson.length : 0,
      errorMessage: batch.errorMessage,
      errorFileUrl: batch.errorFileUrl,
      startedAt: batch.startedAt,
      finishedAt: batch.finishedAt,
      createdAt: batch.createdAt,
    },
  });
}
