import { type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import {
  buildErrorWorkbook,
  type ImportRowError,
} from "@/server/services/excelImport";
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
      "Content-Disposition": `attachment; filename="${safeName}-bom-errors.xlsx"`,
      "Cache-Control": "no-store",
    },
  });
}
