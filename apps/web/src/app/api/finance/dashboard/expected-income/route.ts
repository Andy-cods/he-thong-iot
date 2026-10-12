import { NextResponse, type NextRequest } from "next/server";
import { getReceivablesRawForBucketing } from "@/server/repos/finInvoices";
import { listFinPlannedIncomes } from "@/server/repos/finPlannedIncome";
import {
  groupReceivablesByCustomerAndBucket,
  parseHorizon,
  sumBucketsWithinHorizon,
} from "@/lib/finance-overview-policy";
import { vnToday } from "@/lib/finance";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Chi tiết ô "Dự trù thu" (mở từ Sheet ở Tổng quan Tài chính): bảng công nợ
 * phải thu theo KHÁCH HÀNG x mốc hạn + danh sách khoản thu dự kiến
 * (OPEN/DONE/CANCELLED). Phần Bảng sản xuất đã có ở trang /production-board
 * nên không lặp lại ở đây. `?horizon=30|45|60|90` chỉ ảnh hưởng số tổng
 * `receivableDueWithinHorizon`; bảng hiện đủ mọi mốc.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const horizon = parseHorizon(req.nextUrl.searchParams.get("horizon"));
  const to = vnToday();
  const [receivableRawRows, plannedIncomes] = await Promise.all([
    getReceivablesRawForBucketing(),
    listFinPlannedIncomes({}),
  ]);

  const receivableByCustomerBucket = groupReceivablesByCustomerAndBucket(receivableRawRows, to);

  return NextResponse.json({
    data: {
      horizon,
      receivableDueWithinHorizon: sumBucketsWithinHorizon(
        receivableByCustomerBucket.totalByBucket,
        horizon,
      ),
      receivableByCustomerBucket,
      plannedIncomes,
    },
  });
}
