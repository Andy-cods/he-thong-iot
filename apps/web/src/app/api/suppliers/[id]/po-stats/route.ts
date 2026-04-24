import { NextResponse, type NextRequest } from "next/server";
import {
  getSupplierById,
  getSupplierPoStats,
} from "@/server/repos/suppliers";
import { jsonError } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "supplier");
  if ("response" in guard) return guard.response;

  const supplier = await getSupplierById(params.id);
  if (!supplier) return jsonError("NOT_FOUND", "Không tìm thấy NCC.", 404);

  const stats = await getSupplierPoStats(params.id);
  return NextResponse.json({ data: stats });
}
