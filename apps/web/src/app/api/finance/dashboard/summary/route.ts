import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
} from "@/server/repos/finInvoices";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Tổng đã thu/đã chi (30 ngày gần nhất) + tổng số dư tất cả tài khoản đang hoạt động. */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  const today = new Date();
  const to = toDateStr(today);
  const from = toDateStr(new Date(today.getTime() - 29 * 24 * 60 * 60 * 1000));

  const [totals, totalBalance] = await Promise.all([
    getCashflowTotals(from, to),
    getAccountsBalanceSummary(),
  ]);

  return NextResponse.json({
    data: {
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      netCashflow: totals.totalIn - totals.totalOut,
      totalBalance,
      period: { from, to },
    },
  });
}
