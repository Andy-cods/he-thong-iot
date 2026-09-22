import { NextResponse, type NextRequest } from "next/server";
import { getPayablesAging, getPayablesBySupplier } from "@/server/repos/finInvoices";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-20260922 — Aging bucket công nợ PHẢI TRẢ (direction=IN, mình nợ NCC),
 * query động, không bảng lưu trữ. Đối xứng với
 * `/api/finance/receivables/aging`. `?groupBy=supplier` trả danh sách theo
 * nhà cung cấp thay vì theo bucket tuổi nợ.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const groupBy = req.nextUrl.searchParams.get("groupBy");
  if (groupBy === "supplier" || groupBy === "partner") {
    const partners = await getPayablesBySupplier();
    return NextResponse.json({ data: { partners } });
  }

  const buckets = await getPayablesAging();
  return NextResponse.json({ data: { buckets } });
}
