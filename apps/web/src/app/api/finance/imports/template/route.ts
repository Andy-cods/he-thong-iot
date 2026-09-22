import { buildFinanceImportTemplate } from "@/server/services/financeImport";
import { requireCan } from "@/server/session";
import { type NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/finance/imports/template — tải file mẫu import giao dịch thu/chi. */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const buf = await buildFinanceImportTemplate();
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="finance-transaction-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
