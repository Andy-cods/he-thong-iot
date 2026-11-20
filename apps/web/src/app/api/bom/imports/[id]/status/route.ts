import { NextResponse, type NextRequest } from "next/server";
import type { BomImportOutcome } from "@iot/shared";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
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

  // Kết quả từng BOM do worker ghi (preview_json.outcomes) — màn Kết quả nói
  // chính xác việc đã làm ("Đã thay 63 dòng…" / "Bỏ qua vì…").
  const outcomes = Array.isArray((batch.previewJson as { outcomes?: unknown } | null)?.outcomes)
    ? ((batch.previewJson as { outcomes: BomImportOutcome[] }).outcomes)
    : [];

  return NextResponse.json({
    data: {
      outcomes,
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
