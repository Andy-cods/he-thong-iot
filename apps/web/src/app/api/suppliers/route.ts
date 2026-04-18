import { NextResponse, type NextRequest } from "next/server";
import {
  supplierCreateSchema,
  supplierListQuerySchema,
} from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createSupplier,
  getSupplierByCode,
  listSuppliers,
} from "@/server/repos/suppliers";
import {
  extractRequestMeta,
  jsonError,
  parseJson,
  parseSearchParams,
} from "@/server/http";
import { writeAudit } from "@/server/services/audit";
import { requireSession } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireSession(req, "planner", "warehouse");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, supplierListQuerySchema);
  if ("response" in q) return q.response;
  const result = await listSuppliers(q.data);
  return NextResponse.json({
    data: result.rows,
    meta: {
      page: q.data.page,
      pageSize: q.data.pageSize,
      total: result.total,
    },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireSession(req, "planner");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, supplierCreateSchema);
  if ("response" in body) return body.response;

  const dup = await getSupplierByCode(body.data.code);
  if (dup)
    return jsonError(
      "SUPPLIER_CODE_DUPLICATE",
      `Mã NCC "${body.data.code}" đã tồn tại.`,
      409,
    );
  try {
    const row = await createSupplier(body.data);
    if (!row) throw new Error("createSupplier trả về undefined");
    const meta = extractRequestMeta(req);
    await writeAudit({
      actor: guard.session,
      action: "CREATE",
      objectType: "supplier",
      objectId: row.id,
      after: row,
      ...meta,
    });
    return NextResponse.json({ data: row }, { status: 201 });
  } catch (err) {
    logger.error({ err }, "create supplier failed");
    return jsonError("INTERNAL", "Không tạo được NCC.", 500);
  }
}
