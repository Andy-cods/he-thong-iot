import ExcelJS from "exceljs";
import { sanitizeExcelCellValue } from "./excelSafety";
import { formatDateTime } from "@/lib/format";
import type { StocktakeLineRow } from "@/server/repos/stocktake";

/** V4.4 — nhãn tiếng Việt cho trạng thái phiên kiểm kê (khớp StocktakeSessionSheet.tsx),
 * tránh lộ mã enum thô (VD "PENDING_APPROVAL") ra phiếu in. */
const STOCKTAKE_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Đang đếm",
  PENDING_APPROVAL: "Chờ Giám đốc duyệt",
  APPROVED: "Đã duyệt",
  REJECTED: "Bị trả lại",
  CANCELLED: "Đã huỷ",
};

/**
 * V4.3 Việc 2 — In/xuất phiếu kiểm kê (Excel) để đếm tay nếu cần, hoặc lưu
 * hồ sơ giấy. Cột "Số đếm thực tế" để TRỐNG cho phiên chưa/đang đếm — người
 * đếm điền tay rồi nhập lại vào hệ thống; phiên đã có `countedQty` thì in kèm
 * để đối chiếu.
 */
export async function buildStocktakeSheetWorkbook(
  session: { code: string; scopeNote: string | null; snapshotAt: Date | string; status: string },
  lines: StocktakeLineRow[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("PhieuKiemKe");

  ws.mergeCells("A1:G1");
  ws.getCell("A1").value = `PHIẾU KIỂM KÊ ${session.code}`;
  ws.getCell("A1").font = { bold: true, size: 14 };
  ws.mergeCells("A2:G2");
  // V4.4 — giờ VN cố định (formatDateTime, không lệ thuộc TZ host) + nhãn
  // trạng thái tiếng Việt thay vì mã enum thô.
  const statusLabel = STOCKTAKE_STATUS_LABEL[session.status] ?? session.status;
  ws.getCell("A2").value = sanitizeExcelCellValue(
    `Phạm vi: ${session.scopeNote ?? "—"} · Chụp tồn lúc: ${formatDateTime(
      session.snapshotAt,
    )} · Trạng thái: ${statusLabel}`,
  );

  ws.addRow([]);
  const headerRowIdx = 4;
  ws.getRow(headerRowIdx).values = [
    "Ô kệ",
    "Mã vật tư",
    "Tên vật tư",
    "Lô",
    "Tồn sổ sách",
    "Số đếm thực tế",
    "Ghi chú",
  ];
  ws.getRow(headerRowIdx).font = { bold: true };
  ws.columns = [
    { key: "bin", width: 16 },
    { key: "sku", width: 20 },
    { key: "name", width: 36 },
    { key: "lot", width: 16 },
    { key: "book", width: 14 },
    { key: "counted", width: 16 },
    { key: "notes", width: 24 },
  ];
  // V4.4 — cố định hàng tiêu đề khi cuộn (danh sách vật tư kiểm kê có thể dài).
  ws.views = [{ state: "frozen", ySplit: headerRowIdx }];

  for (const l of lines) {
    const row = ws.addRow([
      sanitizeExcelCellValue(l.binFullCode),
      sanitizeExcelCellValue(l.sku),
      sanitizeExcelCellValue(l.name),
      sanitizeExcelCellValue(l.lotCode ?? ""),
      l.bookQty,
      l.countedQty ?? "",
      sanitizeExcelCellValue(l.notes ?? ""),
    ]);
    // V4.4 — số lượng căn phải, tối đa 4 số lẻ (khớp numeric(18,4) ở kho),
    // không hiện số 0 thừa.
    row.getCell(5).numFmt = "#,##0.####";
    row.getCell(5).alignment = { horizontal: "right" };
    if (l.countedQty != null) {
      row.getCell(6).numFmt = "#,##0.####";
      row.getCell(6).alignment = { horizontal: "right" };
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
