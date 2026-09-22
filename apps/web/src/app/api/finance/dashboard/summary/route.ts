import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
  getPayablesAging,
  getReceivablesAging,
} from "@/server/repos/finInvoices";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Tổng đã thu/đã chi (30 ngày gần nhất) + tổng số dư tất cả tài khoản đang
 * hoạt động + tổng công nợ phải thu/phải trả (TASK-20260922 — bổ sung
 * `totalPayable` cho KPI "công nợ phải trả" ở OverviewTab, đối xứng với
 * `totalReceivable` đã có).
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const today = new Date();
  const to = toDateStr(today);
  const from = toDateStr(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));

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
