import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireCan } from "@/server/session";
import { jsonError, parseSearchParams } from "@/server/http";
import {
  listProductLines,
  createProductLine,
  getProductLineByCode,
} from "@/server/repos/productLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const listSchema = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

const createSchema = z.object({
  code: z.string().min(1).max(64).toUpperCase(),
  name: z.string().min(1).max(255),
  description: z.string().max(1000).nullable().optional(),
});

export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const parsed = parseSearchParams(req, listSchema);
  if ("response" in parsed) return parsed.response;
  const { q, status, page, pageSize } = parsed.data;

  const result = await listProductLines({
    q,
    status: status
      ? (status.split(",").filter(Boolean) as ("ACTIVE" | "ARCHIVED")[])
      : undefined,
    page,
    pageSize,
  });

  return NextResponse.json({
    data: result.rows,
    meta: { page, pageSize, total: result.total },
  });
}

export async function POST(req: NextRequest) {
  const guard = await requireCan(req, "create", "bomTemplate");
  if ("response" in guard) return guard.response;

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return jsonError("INVALID_BODY", "Body không hợp lệ.", 400);
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return jsonError("VALIDATION", parsed.error.message, 400);
  }

  const existing = await getProductLineByCode(parsed.data.code);
  if (existing) {
    return jsonError("DUPLICATE_CODE", "Mã dòng sản phẩm đã tồn tại.", 409);
  }

  const row = await createProductLine(parsed.data, guard.session.userId);
  return NextResponse.json({ data: row }, { status: 201 });
}
