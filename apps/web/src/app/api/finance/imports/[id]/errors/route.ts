import { type NextRequest } from "next/server";
import { jsonError } from "@/server/http";
import { getImportBatch } from "@/server/repos/importBatch";
import {
  buildFinanceErrorWorkbook,
  type FinanceImportRowError,
} from "@/server/services/financeImport";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/finance/imports/:id/errors — tải xlsx danh sách lỗi để sửa rồi upload lại. */
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

  const errors = Array.isArray(batch.errorJson)
    ? (batch.errorJson as FinanceImportRowError[])
    : [];

  const buf = await buildFinanceErrorWorkbook(errors);
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
