import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
  getPayablesAging,
  getReceivablesAging,
} from "@/server/repos/finInvoices";
import { addDaysIso, vnToday } from "@/lib/finance";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tổng đã thu/đã chi (30 ngày gần nhất) + tổng số dư tất cả tài khoản đang
 * hoạt động + tổng công nợ phải thu/phải trả (TASK-20260922 — bổ sung
 * `totalPayable` cho KPI "công nợ phải trả" ở OverviewTab, đối xứng với
 * `totalReceivable` đã có).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  // V4.1 TC-13 — "hôm nay" theo giờ VN (trước 7h sáng từng lấy nhầm ngày UTC hôm qua).
  const to = vnToday();
  const from = addDaysIso(to, -29);

  const [totals, totalBalance, receivableBuckets, payableBuckets] = await Promise.all([
    getCashflowTotals(from, to),
    getAccountsBalanceSummary(),
    getReceivablesAging(),
    getPayablesAging(),
  ]);

  const totalReceivable = receivableBuckets.reduce((s, b) => s + b.outstandingAmount, 0);
  const totalPayable = payableBuckets.reduce((s, b) => s + b.outstandingAmount, 0);

  return NextResponse.json({
    data: {
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      netCashflow: totals.totalIn - totals.totalOut,
      totalBalance,
      totalReceivable,
      totalPayable,
      period: { from, to },
    },
  });
}
