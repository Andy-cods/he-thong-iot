import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getCashflowSeries, getCashflowTotals } from "@/server/repos/finInvoices";
import { addDaysIso, vnToday } from "@/lib/finance";
import { parseSearchParams } from "@/server/http";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const cashflowQuerySchema = z.object({
  from: dateStr.optional(),
  to: dateStr.optional(),
  compareWith: z.enum(["previous_period"]).optional(),
});

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Dòng tiền theo ngày, nguồn DUY NHẤT fin_transaction (§C.2, không double-
 * count). Mặc định 30 ngày gần nhất. `compareWith=previous_period` để tính
 * % tăng trưởng so kỳ liền trước cùng độ dài.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  const q = parseSearchParams(req, cashflowQuerySchema);
  if ("response" in q) return q.response;

  // V4.1 TC-13 — mặc định theo ngày VN.
  const to = q.data.to ?? vnToday();
  const from = q.data.from ?? addDaysIso(to, -29);

  const [series, totals] = await Promise.all([
    getCashflowSeries(from, to),
    getCashflowTotals(from, to),
  ]);

  let growth: { inPct: number; outPct: number; vsLabel: string } | undefined;
  if (q.data.compareWith === "previous_period") {
    const fromMs = new Date(from).getTime();
    const toMs = new Date(to).getTime();
    const spanMs = toMs - fromMs;
    const prevTo = toDateStr(new Date(fromMs - 24 * 60 * 60 * 1000));
    const prevFrom = toDateStr(new Date(fromMs - spanMs - 24 * 60 * 60 * 1000));
    const prevTotals = await getCashflowTotals(prevFrom, prevTo);

    const pct = (curr: number, prev: number) =>
      prev === 0 ? (curr === 0 ? 0 : 100) : Math.round(((curr - prev) / prev) * 1000) / 10;

    growth = {
      inPct: pct(totals.totalIn, prevTotals.totalIn),
      outPct: pct(totals.totalOut, prevTotals.totalOut),
      vsLabel: "so với kỳ trước",
    };
  }

  return NextResponse.json({
    data: {
      series,
      summary: {
        totalIn: totals.totalIn,
        totalOut: totals.totalOut,
        netCashflow: totals.totalIn - totals.totalOut,
      },
      ...(growth ? { growth } : {}),
    },
  });
}
