import { NextResponse, type NextRequest } from "next/server";
import { requireCan } from "@/server/session";
import { jsonError } from "@/server/http";
import { getProductLineOrders } from "@/server/repos/productLines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  req: NextRequest,
  { params }: { params: { id: string } },
) {
  const guard = await requireCan(req, "read", "bomTemplate");
  if ("response" in guard) return guard.response;

  const rows = await getProductLineOrders(params.id);
  return NextResponse.json({ data: rows });
}
