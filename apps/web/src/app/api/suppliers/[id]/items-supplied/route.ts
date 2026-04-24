import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupplierById,
  listItemsSuppliedBy,
} from "@/server/repos/suppliers";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  q: z.string().trim().max(120).optional(),
  category: z.string().trim().max(80).optional(),
  limit: z.coerce.number().int().positive().max(200).default(100),
  offset: z.coerce.number().int().nonnegative().default(0),
});

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "supplier");
  if ("response" in guard) return guard.response;

  const supplier = await getSupplierById(params.id);
  if (!supplier) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);

  const q = parseSearchParams(req, querySchema);
  if ("response" in q) return q.response;

  const result = await listItemsSuppliedBy(params.id, q.data);
  return NextResponse.json({
    data: result.rows,
    meta: {
      total: result.total,
      limit: q.data.limit,
      offset: q.data.offset,
    },
  });
}
