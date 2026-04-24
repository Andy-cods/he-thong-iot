import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import {
  getSupplierById,
  getTopItemsBoughtFromSupplier,
} from "@/server/repos/suppliers";
import { jsonError, parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
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

  const rows = await getTopItemsBoughtFromSupplier(params.id, q.data.limit);
  return NextResponse.json({ data: rows });
}
