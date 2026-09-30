import ExcelJS from "exceljs";
import { sanitizeExcelCellValue } from "./excelSafety";
import type { StocktakeLineRow } from "@/server/repos/stocktake";

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
  ws.getCell("A2").value = `Phạm vi: ${session.scopeNote ?? "—"} · Chụp tồn lúc: ${new Date(
    session.snapshotAt,
  ).toLocaleString("vi-VN")} · Trạng thái: ${session.status}`;

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

  for (const l of lines) {
    ws.addRow([
      sanitizeExcelCellValue(l.binFullCode),
      sanitizeExcelCellValue(l.sku),
      sanitizeExcelCellValue(l.name),
      sanitizeExcelCellValue(l.lotCode ?? ""),
      l.bookQty,
      l.countedQty ?? "",
      sanitizeExcelCellValue(l.notes ?? ""),
    ]);
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
