import { fmtVND } from "@/components/finance/_format";
import type { FinTransactionRow } from "@/hooks/useFinance";

/** Câu xác nhận huỷ theo loại giao dịch (TC-02 / Q7). */
export function voidConfirmText(row: FinTransactionRow): string {
  if (row.paymentId) {
    return `Giao dịch ${row.code} thuộc một đợt thanh toán hoá đơn. Huỷ sẽ huỷ CẢ đợt thanh toán đó: mọi giao dịch của đợt bị huỷ, số dư nguồn được hoàn lại và hoá đơn quay về trạng thái chưa trả.`;
  }
  if (row.transferGroupId) {
    return `Phiếu ${row.code} là một chân của lần chuyển quỹ nội bộ. Huỷ sẽ huỷ CẢ 2 chân (nguồn đi và nguồn nhận), số dư 2 nguồn trở lại như trước khi chuyển.`;
  }
  return `Huỷ giao dịch ${row.code} (${row.direction === "IN" ? "+" : "−"}${fmtVND(row.amount)})? Số dư nguồn sẽ được tính lại. Giao dịch vẫn được giữ với trạng thái "Đã huỷ".`;
}
