import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  supplierCreateSchema,
  supplierListQuerySchema,
} from "@iot/shared";
import { logger } from "@/lib/logger";
import {
  createSupplier,
  findSimilarActiveSupplier,
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
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "supplier");
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

// V4.5 QA-A P1 — `force: true` = người dùng đã thấy gợi ý NCC gần giống và
// xác nhận vẫn muốn tạo mới (giống cơ chế `quickCreateItem`). Mở rộng LOCAL ở
// route (không đụng `supplierCreateSchema` dùng chung cho form sửa/client).
const supplierCreateWithForceSchema = supplierCreateSchema.extend({
  force: z.coerce.boolean().optional().default(false),
});

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "supplier");
  if ("response" in guard) return guard.response;
  const body = await parseJson(req, supplierCreateWithForceSchema);
  if ("response" in body) return body.response;

  const dup = await getSupplierByCode(body.data.code);
  if (dup)
    return jsonError(
      "SUPPLIER_CODE_DUPLICATE",
      `Mã NCC "${body.data.code}" đã tồn tại.`,
      409,
    );

  if (!body.data.force) {
    const similar = await findSimilarActiveSupplier(body.data.name);
    if (similar) {
      return jsonError(
        "SUPPLIER_NAME_SIMILAR",
        `NCC "${similar.name}" (mã ${similar.code}) có tên gần giống — kiểm tra lại trước khi tạo mới. Gửi lại kèm "force: true" nếu vẫn muốn tạo NCC mới.`,
        409,
        { suggestion: similar },
      );
    }
  }

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
    const pgCode =
      (err as { code?: string; cause?: { code?: string } }).code ??
      (err as { cause?: { code?: string } }).cause?.code;
    if (pgCode === "23505") {
      return jsonError(
        "SUPPLIER_CODE_DUPLICATE",
        `Mã NCC "${body.data.code}" đã tồn tại.`,
        409,
      );
    }
    logger.error({ err }, "create supplier failed");
    return jsonError("INTERNAL", "Không tạo được NCC.", 500);
  }
}
