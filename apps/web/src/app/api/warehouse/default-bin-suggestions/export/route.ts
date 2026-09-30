import { NextResponse, type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";
import { listAllItemsForExport } from "@/server/repos/defaultBinSuggestion";
import { buildDefaultBinExportWorkbook } from "@/server/services/defaultBinImport";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * V4.3 Việc 1 — GET /api/warehouse/default-bin-suggestions/export
 * Xuất Excel toàn bộ vật tư active + vị trí mặc định hiện tại/đề xuất — sửa
 * cột "Vị trí mặc định" rồi nhập lại qua /import để gán hàng loạt.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "inventory");
  if ("response" in guard) return guard.response;

  try {
    const rows = await listAllItemsForExport();
    const buf = await buildDefaultBinExportWorkbook(rows);
    const filename = `vi-tri-mac-dinh-${new Date().toISOString().slice(0, 10)}.xlsx`;
    return new NextResponse(buf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Export-Count": String(rows.length),
      },
    });
  } catch (err) {
    return jsonError(
      "EXPORT_FAILED",
      (err as Error).message ?? "Không xuất được file",
      500,
    );
  }
}
