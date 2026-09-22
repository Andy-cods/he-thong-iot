import { NextResponse, type NextRequest } from "next/server";
import { finInvoiceCreateSchema, finInvoiceListQuerySchema } from "@iot/shared";
import { logger } from "@/lib/logger";
import { createFinInvoice, listFinInvoices } from "@/server/repos/finInvoices";
import { extractRequestMeta, jsonError, parseJson, parseSearchParams } from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, finInvoiceListQuerySchema);
  if ("response" in q) return q.response;
  const result = await listFinInvoices(q.data);
  return NextResponse.json({
    data: result.rows,
    meta: { page: q.data.page, pageSize: q.data.pageSize, total: result.total },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "finance");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, finInvoiceCreateSchema);
  if ("response" in body) return body.response;

  try {
    const row = await createFinInvoice(body.data, guard.session.userId);
    if (!row) throw new Error("createFinInvoice trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "fin_invoice",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    const pgCode =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      return jsonError(
        "FIN_INVOICE_DUPLICATE",
        "Hoá đơn đã tồn tại (trùng direction + số hoá đơn + NCC).",
        409,
      );
    }
    logger.error({ err }, "create fin invoice failed");
    return jsonError("INTERNAL", "Không tạo được hoá đơn.", 500);
  }
}
