import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
  getPayablesAging,
  getPayablesRawForBucketing,
  getReceivablesAging,
  getReceivablesRawForBucketing,
} from "@/server/repos/finInvoices";
import { getBoardValueSummary } from "@/server/repos/productionBoard";
import { getExpectedPayableSummary } from "@/server/repos/purchaseOrders";
import { getOpenPlannedExpenseItems } from "@/server/repos/finPlannedExpense";
import { getOpenPlannedIncomeItems } from "@/server/repos/finPlannedIncome";
import { addDaysIso, vnToday } from "@/lib/finance";
import {
  computeExpectedPayableTotal,
  computeExpectedReceivableTotal,
  groupPayablesBySupplierAndBucket,
  groupReceivablesByCustomerAndBucket,
  parseHorizon,
} from "@/lib/finance-overview-policy";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tổng đã thu/đã chi (30 ngày gần nhất) + tổng số dư tất cả tài khoản đang
 * hoạt động + tổng công nợ phải thu/phải trả (TASK-20260922 — bổ sung
 * `totalPayable` cho KPI "công nợ phải trả" ở OverviewTab, đối xứng với
 * `totalReceivable` đã có).
 *
 * V4.4.2 (Việc 2) / TASK-20261001 (việc 2+3) — bổ sung hàng "Kế hoạch" (khác
 * hàng số thực ở trên):
 *   - `production.expectedReceivable` — "Dự trù thu" GỘP: Σ(qty_planned ×
 *     đơn giá) mã hàng đang gia công (IN_PROGRESS/QC) + Σ(qty_done × đơn giá)
 *     mã hàng COMPLETED (hoàn thành, chưa giao) — KHÔNG gồm QUEUED/DELIVERED,
 *     KHÔNG trùng `totalReceivable` (công nợ phải thu từ hoá đơn bán).
 *   - `production.missingPriceCount` — mã hàng (2 nhóm trên) chưa nhập giá.
 *   - `expectedPayable` — "Dự trù chi": (a) công nợ phải trả SẮP ĐẾN HẠN
 *     (`payableDueSoon` = OVERDUE + ≤30 ngày, chi tiết theo NCC × mốc hạn ở
 *     `payableBySupplierBucket`) + (b) PO mở chưa có HĐ + HĐ mua NHÁP + (c)
 *     khoản chi dự kiến OPEN (`plannedExpenseOpenValue`). `value` = tổng cả
 *     3 phần — KHÔNG đếm trùng `totalPayable` (chỉ lấy phần ≤30 ngày của
 *     công nợ, không phải toàn bộ — xem lib/finance-overview-policy.ts).
 * Kỳ dự trù chung `?horizon=30|45|60|90` (mặc định 30) áp cho `expectedReceivable`
 * (Bảng SX + công nợ phải thu quá hạn/trong kỳ + khoản thu dự kiến) và
 * `expectedPayable` ("≤30 ngày" ở trên = kỳ đang chọn). Mọi vai đọc `finance` (admin/accountant/shareholder) đều thấy — không cần
 * quyền `productionBoard`/`po` riêng vì đây là số TỔNG HỢP phía server.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;
  // Kỳ dự trù chung 30/45/60/90 ngày (mặc định 30; giá trị lạ → 30).
  const horizon = parseHorizon(req.nextUrl.searchParams.get("horizon"));

  // V4.1 TC-13 — "hôm nay" theo giờ VN (trước 7h sáng từng lấy nhầm ngày UTC hôm qua).
  const to = vnToday();
  const from = addDaysIso(to, -29);

  const [
    totals,
    totalBalance,
    receivableBuckets,
    payableBuckets,
    production,
    expectedPayablePoDraft,
    payableRawRows,
    plannedExpenseOpenItems,
    receivableRawRows,
    plannedIncomeOpenItems,
  ] = await Promise.all([
    getCashflowTotals(from, to),
    getAccountsBalanceSummary(),
    getReceivablesAging(),
    getPayablesAging(),
    getBoardValueSummary(),
    getExpectedPayableSummary(),
    getPayablesRawForBucketing(),
    getOpenPlannedExpenseItems(),
    getReceivablesRawForBucketing(),
    getOpenPlannedIncomeItems(),
  ]);

  const totalReceivable = receivableBuckets.reduce((s, b) => s + b.outstandingAmount, 0);
  const totalPayable = payableBuckets.reduce((s, b) => s + b.outstandingAmount, 0);

  const payableBySupplierBucket = groupPayablesBySupplierAndBucket(payableRawRows, to);
  const payableTotal = computeExpectedPayableTotal({
    payables: payableBySupplierBucket,
    poDraftValue: expectedPayablePoDraft.value,
    plannedExpenses: plannedExpenseOpenItems,
    today: to,
    horizon,
  });
  const receivableByCustomerBucket = groupReceivablesByCustomerAndBucket(receivableRawRows, to);
  const receivableTotal = computeExpectedReceivableTotal({
    boardValue: production.expectedReceivable.value,
    receivables: receivableByCustomerBucket,
    plannedIncomes: plannedIncomeOpenItems,
    today: to,
    horizon,
  });

  const expectedPayable = {
    ...expectedPayablePoDraft,
    // Công nợ phải trả quá hạn + đến hạn trong kỳ (tên cũ `payableDueSoon` giữ cho UI).
    payableDueSoon: payableTotal.payableDue,
    plannedExpenseOpenValue: payableTotal.plannedExpenseValue,
    plannedExpenseOpenCount: payableTotal.plannedExpenseCount,
    value: payableTotal.value,
  };

  // "Dự trù thu" = Bảng SX (`production.expectedReceivable`, công thức không đổi)
  // + công nợ phải thu quá hạn/trong kỳ + khoản thu dự kiến OPEN hạn ≤ hôm nay + kỳ.
  const expectedReceivable = {
    value: receivableTotal.value,
    boardValue: receivableTotal.boardValue,
    receivableDue: receivableTotal.receivableDue,
    plannedIncomeValue: receivableTotal.plannedIncomeValue,
    plannedIncomeCount: receivableTotal.plannedIncomeCount,
  };

  return NextResponse.json({
    data: {
      totalIn: totals.totalIn,
      totalOut: totals.totalOut,
      netCashflow: totals.totalIn - totals.totalOut,
      totalBalance,
      totalReceivable,
      totalPayable,
      production,
      expectedPayable,
      expectedReceivable,
      horizon,
      payableBySupplierBucket,
      period: { from, to },
    },
  });
}
