import { NextResponse, type NextRequest } from "next/server";
import { getPayablesRawForBucketing } from "@/server/repos/finInvoices";
import { getOpenPoListForExpectedExpense } from "@/server/repos/purchaseOrders";
import { listFinPlannedExpenses } from "@/server/repos/finPlannedExpense";
import { groupPayablesBySupplierAndBucket } from "@/lib/finance-overview-policy";
import { vnToday } from "@/lib/finance";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * TASK-20261001 — Chi tiết ô "Dự trù chi" (mở từ Sheet ở Tổng quan Tài
 * chính): bảng công nợ phải trả theo NCC × mốc hạn + danh sách PO chưa có
 * hoá đơn + danh sách khoản chi dự kiến (OPEN/DONE/CANCELLED). Tách khỏi
 * `/api/finance/dashboard/summary` (nhẹ, gọi khi mở Sheet, không gọi mỗi lần
 * tải Tổng quan).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const to = vnToday();
  const [payableRawRows, openPos, plannedExpenses] = await Promise.all([
    getPayablesRawForBucketing(),
    getOpenPoListForExpectedExpense(),
    listFinPlannedExpenses({}),
  ]);

  const payableBySupplierBucket = groupPayablesBySupplierAndBucket(payableRawRows, to);

  return NextResponse.json({
    data: {
      payableBySupplierBucket,
      openPos,
      plannedExpenses,
    },
  });
}
