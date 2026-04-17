import { type NextRequest } from "next/server";
import { buildImportTemplate } from "@/server/services/excelImport";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/imports/template?kind=item — tải template xlsx mẫu. */
export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "planner", "warehouse");
  if ("response" in guard) return guard.response;

  const buf = await buildImportTemplate();
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": 'attachment; filename="item-import-template.xlsx"',
      "Cache-Control": "no-store",
    },
  });
}
