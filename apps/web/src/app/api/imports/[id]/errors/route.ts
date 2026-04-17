import { type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import { buildErrorWorkbook, type ImportRowError } from "@/server/services/excelImport";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/imports/:id/errors
 * → Stream xlsx chứa danh sách lỗi để user sửa rồi upload lại.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireSession(req, "planner", "warehouse");
  if ("response" in guard) return guard.response;

  const batch = await getImportBatch(params.id);
  if (!batch) return jsonError("NOT_FOUND", "Không tìm thấy phiên import.", 404);

  const errors = Array.isArray(batch.errorJson)
    ? (batch.errorJson as ImportRowError[])
    : [];

  const buf = await buildErrorWorkbook(errors);
  const safeName = batch.fileName.replace(/\.xlsx?$/i, "");
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${safeName}-errors.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
