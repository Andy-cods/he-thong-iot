import { NextResponse, type NextRequest } from "next/server";
import { getReceivablesAging } from "@/server/repos/finInvoices";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Aging bucket công nợ phải thu (direction=OUT) — query động, không bảng lưu trữ. */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const buckets = await getReceivablesAging();
  return NextResponse.json({ data: { buckets } });
}
