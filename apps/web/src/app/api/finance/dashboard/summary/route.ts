import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
  getPayablesAging,
  getPayablesRawForBucketing,
  getReceivablesAging,
  getReceivablesRawForBucketing,
} from "@/server/repos/finInvoices";
import { getOpenOrdersValueSummary } from "@/server/repos/orders";
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
 *   - `orders.expectedReceivable` — "Dự trù thu" từ ĐƠN HÀNG BÁN (V4.7):
 *     Σ(order_qty × unit_price) các đơn đang mở chưa giao (DRAFT/CONFIRMED/
 *     SNAPSHOTTED/IN_PROGRESS — gồm DRAFT vì workflow lean không có bước xác
 *     nhận). KHÔNG đếm trùng `totalReceivable`: loại đơn đã có hoá đơn bán
 *     active (xem getOpenOrdersValueSummary). Thay nguồn cũ Bảng sản xuất TV.
 *   - `orders.missingPriceCount` — số đơn (phạm vi trên) chưa nhập đơn giá.
 *   - `expectedPayable` — "Dự trù chi": (a) công nợ phải trả SẮP ĐẾN HẠN
 *     (`payableDueSoon` = OVERDUE + ≤30 ngày, chi tiết theo NCC × mốc hạn ở
 *     `payableBySupplierBucket`) + (b) PO mở chưa có HĐ + HĐ mua NHÁP + (c)
 *     khoản chi dự kiến OPEN (`plannedExpenseOpenValue`). `value` = tổng cả
 *     3 phần — KHÔNG đếm trùng `totalPayable` (chỉ lấy phần ≤30 ngày của
 *     công nợ, không phải toàn bộ — xem lib/finance-overview-policy.ts).
 * Kỳ dự trù chung `?horizon=30|45|60|90` (mặc định 30) áp cho `expectedReceivable`
 * (Đơn hàng bán + công nợ phải thu quá hạn/trong kỳ + khoản thu dự kiến) và
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
    orders,
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
    getOpenOrdersValueSummary(),
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
    orderValue: orders.expectedReceivable.value,
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

  // V4.7 — "Dự trù thu" = Đơn hàng bán (`orders.expectedReceivable`) + công nợ
  // phải thu quá hạn/trong kỳ + khoản thu dự kiến OPEN hạn ≤ hôm nay + kỳ.
  const expectedReceivable = {
    value: receivableTotal.value,
    orderValue: receivableTotal.orderValue,
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
      orders,
      expectedPayable,
      expectedReceivable,
      horizon,
      payableBySupplierBucket,
      period: { from, to },
    },
  });
}
