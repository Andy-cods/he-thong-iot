import { NextResponse, type NextRequest } from "next/server";
import { listSupplierRegions } from "@/server/repos/suppliers";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** V1.9 P7 — List distinct region để dropdown filter trong /suppliers. */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "supplier");
  if ("response" in guard) return guard.response;
  const rows = await listSupplierRegions();
  return NextResponse.json({ data: rows });
}
