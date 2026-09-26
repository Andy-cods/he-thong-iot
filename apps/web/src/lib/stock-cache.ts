import type { QueryClient } from "@tanstack/react-query";

/**
 * V4.1 Đợt 1b (KHO-24) — sau MỌI thao tác làm đổi tồn (nhận hàng, xuất kho,
 * lập phiếu xuất giao phiếu yêu cầu, duyệt yêu cầu xuất kho…) phải làm mới
 * đồng loạt các màn đọc tồn. Trước đây mỗi nơi chỉ invalidate 1–2 key →
 * Vật tư / Sơ đồ kho / popover tồn BOM hiện số cũ tới khi F5.
 *
 * Invalidate theo PREFIX (TanStack so khớp tiền tố key) — không cần biết key
 * chi tiết của từng màn.
 */
const STOCK_QUERY_PREFIXES: ReadonlyArray<readonly string[]> = [
  ["warehouse"],
  ["items"],
  ["inventory"],
  ["inventory-summary"],
  ["lot-serial"],
  ["qc-inbound"],
  ["goods-issues"],
  ["material-request"],
  ["material-requests"],
  ["issue-request"],
];

export function invalidateStockQueries(qc: QueryClient): void {
  for (const queryKey of STOCK_QUERY_PREFIXES) {
    void qc.invalidateQueries({ queryKey: [...queryKey] });
  }
}
