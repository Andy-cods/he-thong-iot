import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/finance/imports/:id — trạng thái + preview + counters.
 *
 * File RIÊNG cho finance (KHÔNG tái dùng `/api/imports/:id` generic) vì route
 * đó guard cứng `requireCan(req, "read", "item")` — accountant/shareholder
 * KHÔNG có quyền `item` trong RBAC matrix (chỉ có `finance`), nên polling qua
 * route generic sẽ luôn 403. Route này guard đúng entity `finance`.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);
  if (batch.kind !== "finance_transaction") {
    return jsonError("WRONG_KIND", "Phiên import không phải giao dịch tài chính.", 400);
  }

  const preview = batch.previewJson as {
    preview?: unknown[];
    validCount?: number;
    freshCount?: number;
    duplicateCount?: number;
    errorCount?: number;
    warnings?: unknown[];
  } | null;

  return NextResponse.json({
    data: {
      id: batch.id,
      kind: batch.kind,
      status: batch.status,
      fileName: batch.fileName,
      fileSizeBytes: batch.fileSizeBytes,
      rowTotal: batch.rowTotal,
      rowSuccess: batch.rowSuccess,
      rowFail: batch.rowFail,
      preview: preview
        ? {
            rows: preview.preview ?? [],
            validCount: preview.validCount ?? 0,
            freshCount: preview.freshCount ?? 0,
            duplicateCount: preview.duplicateCount ?? 0,
            errorCount: preview.errorCount ?? 0,
            warnings: preview.warnings ?? [],
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
