import { NextResponse, type NextRequest } from "next/server";
import { getReceivablesAging, getReceivablesByCustomer } from "@/server/repos/finInvoices";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Aging bucket công nợ phải thu (direction=OUT) — query động, không bảng
 * lưu trữ. `?groupBy=supplier` (giữ tên tham số chung, ở đây trả nhóm theo
 * khách hàng) trả danh sách theo đối tác thay vì theo bucket tuổi nợ —
 * TASK-20260922. Mặc định giữ nguyên `bucket` để không phá link cũ.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const groupBy = req.nextUrl.searchParams.get("groupBy");
  if (groupBy === "supplier" || groupBy === "customer" || groupBy === "partner") {
    const partners = await getReceivablesByCustomer();
    return NextResponse.json({ data: { partners } });
  }

  const buckets = await getReceivablesAging();
  return NextResponse.json({ data: { buckets } });
}
