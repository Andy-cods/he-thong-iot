import { NextResponse, type NextRequest } from "next/server";
import {
  getAccountsBalanceSummary,
  getCashflowTotals,
  getPayablesAging,
  getReceivablesAging,
} from "@/server/repos/finInvoices";
import { getBoardValueSummary } from "@/server/repos/productionBoard";
import { getExpectedPayableSummary } from "@/server/repos/purchaseOrders";
import { addDaysIso, vnToday } from "@/lib/finance";
import { requireCan } from "@/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tổng đã thu/đã chi (30 ngày gần nhất) + tổng số dư tất cả tài khoản đang
 * hoạt động + tổng công nợ phải thu/phải trả (TASK-20260922 — bổ sung
 * `totalPayable` cho KPI "công nợ phải trả" ở OverviewTab, đối xứng với
 * `totalReceivable` đã có).
 *
 * V4.4.2 (Việc 2) — bổ sung hàng "Kế hoạch" (khác hàng số thực ở trên):
 *   - `production.inProduction`  — Σ(qty_planned × unit_price) mã hàng đang
 *     chạy (QUEUED/IN_PROGRESS/QC).
 *   - `production.expectedReceivable` — Σ(qty_done × unit_price) mã hàng
 *     COMPLETED (hoàn thành, chưa giao) — KHÔNG phải tồn kho, không trùng
 *     `totalReceivable` (công nợ phải thu từ hoá đơn bán).
 *   - `production.missingPriceCount` — mã hàng (2 nhóm trên) chưa nhập giá.
 *   - `expectedPayable` — cam kết chi chưa thành công nợ phải trả (PO mở
 *     chưa có HĐ + HĐ mua đang NHÁP), không đếm trùng `totalPayable`.
 * Mọi vai đọc `finance` (admin/accountant/shareholder) đều thấy — không cần
 * quyền `productionBoard`/`po` riêng vì đây là số TỔNG HỢP phía server.
 */
export async function GET(req: NextRequest) {
  const guard = await requireCan(req, "read", "finance");
  if ("response" in guard) return guard.response;

  // V4.1 TC-13 — "hôm nay" theo giờ VN (trước 7h sáng từng lấy nhầm ngày UTC hôm qua).
  const to = vnToday();
  const from = addDaysIso(to, -29);

  const [totals, totalBalance, receivableBuckets, payableBuckets, production, expectedPayable] =
    await Promise.all([
      getCashflowTotals(from, to),
      getAccountsBalanceSummary(),
      getReceivablesAging(),
      getPayablesAging(),
      getBoardValueSummary(),
      getExpectedPayableSummary(),
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
      production,
      expectedPayable,
      period: { from, to },
    },
  });
}
