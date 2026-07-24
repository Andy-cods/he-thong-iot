/**
 * V3.14 — Builder Excel dùng chung cho tính năng "xuất nhiều phiếu theo
 * khoảng thời gian, mỗi phiếu 1 sheet" (material-requests + purchase-requests).
 *
 * Tạo workbook MỚI (không clone template): sheet đầu "Tổng hợp" liệt kê toàn
 * bộ phiếu trong khoảng, các sheet sau — mỗi phiếu 1 sheet chi tiết (tiêu đề +
 * khối thông tin header + bảng dòng vật tư).
 */
import ExcelJS from "exceljs";

export interface SlipSheet {
  /** Tên gợi ý cho sheet — sẽ được sanitize theo luật Excel + dedupe bên trong. */
  sheetName: string;
  /** Tiêu đề in đậm ở dòng đầu sheet, vd "PHIẾU YÊU CẦU VẬT TƯ — MR-2607-0001". */
  title: string;
  /** Các cặp [nhãn, giá trị] hiển thị ngay dưới tiêu đề. */
  info: Array<[string, string]>;
  columns: Array<{ header: string; width: number }>;
  /** Dữ liệu theo đúng thứ tự `columns`. */
  rows: Array<Array<string | number | null>>;
}

export interface SummaryTable {
  columns: Array<{ header: string; width: number }>;
  rows: Array<Array<string | number | null>>;
}

const HEADER_FILL: ExcelJS.Fill = {
  type: "pattern",
  pattern: "solid",
  fgColor: { argb: "FFF1F5F9" },
};

const THIN_BORDER: Partial<ExcelJS.Borders> = {
  top: { style: "thin", color: { argb: "FFD4D4D8" } },
  left: { style: "thin", color: { argb: "FFD4D4D8" } },
  bottom: { style: "thin", color: { argb: "FFD4D4D8" } },
  right: { style: "thin", color: { argb: "FFD4D4D8" } },
};

/** Cột nào nên wrap text (tên vật tư / ghi chú / quy cách — nội dung dài). */
const WRAP_HEADER_RE = /tên|ghi chú|quy cách/i;

/**
 * Sanitize tên sheet theo luật Excel (bỏ `\ / ? * [ ] :`, cắt ≤31 ký tự) +
 * dedupe bằng hậu tố ` (2)`, ` (3)`... nếu trùng tên đã dùng trong `used`.
 */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "-").trim();
  if (base.length === 0) base = "Sheet";
  base = base.slice(0, 31);

  let candidate = base;
  let n = 2;
  while (used.has(candidate)) {
    const suffix = ` (${n})`;
    candidate = base.slice(0, Math.max(0, 31 - suffix.length)) + suffix;
    n++;
  }
  used.add(candidate);
  return candidate;
}

function styleHeaderRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });
}

function styleDataRow(row: ExcelJS.Row): void {
  row.eachCell({ includeEmpty: true }, (cell) => {
    cell.border = THIN_BORDER;
  });
}

export async function buildSlipsWorkbook(input: {
  /** Tiêu đề hiển thị ở đầu sheet Tổng hợp, vd "Yêu cầu vật tư 21/07 – 23/07/2026". */
  workbookTitle: string;
  summary: SummaryTable;
  slips: SlipSheet[];
}): Promise<Uint8Array> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "he-thong-iot MES";
  workbook.created = new Date();

  const usedNames = new Set<string>(["Tổng hợp"]);

  // ── Sheet "Tổng hợp" ──
  const summarySheet = workbook.addWorksheet("Tổng hợp");
  summarySheet.columns = input.summary.columns.map((c) => ({ width: c.width }));
  const colCount = Math.max(1, input.summary.columns.length);

  const titleRow = summarySheet.addRow([input.workbookTitle]);
  titleRow.font = { bold: true, size: 14 };
  summarySheet.mergeCells(1, 1, 1, colCount);
  summarySheet.addRow([]); // dòng trống

  if (input.slips.length === 0) {
    const emptyRow = summarySheet.addRow(["Không có phiếu nào trong khoảng thời gian đã chọn."]);
    emptyRow.font = { italic: true, color: { argb: "FF71717A" } };
    summarySheet.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
  } else {
    const headerRow = summarySheet.addRow(input.summary.columns.map((c) => c.header));
    styleHeaderRow(headerRow);
    summarySheet.views = [{ state: "frozen", ySplit: headerRow.number }];
    for (const rowData of input.summary.rows) {
      styleDataRow(summarySheet.addRow(rowData));
    }
  }

  // ── 1 sheet / phiếu ──
  for (const slip of input.slips) {
    const sheetName = sanitizeSheetName(slip.sheetName, usedNames);
    const ws = workbook.addWorksheet(sheetName);
    ws.columns = slip.columns.map((c) => ({ width: c.width }));
    const slipColCount = Math.max(1, slip.columns.length);

    const slipTitleRow = ws.addRow([slip.title]);
    slipTitleRow.font = { bold: true, size: 13 };
    ws.mergeCells(1, 1, 1, slipColCount);

    for (const [label, value] of slip.info) {
      const row = ws.addRow([label, value]);
      row.getCell(1).font = { bold: true };
    }

    ws.addRow([]); // dòng trống trước bảng

    const headerRow = ws.addRow(slip.columns.map((c) => c.header));
    styleHeaderRow(headerRow);

    for (const rowData of slip.rows) {
      styleDataRow(ws.addRow(rowData));
    }

    slip.columns.forEach((c, idx) => {
      if (WRAP_HEADER_RE.test(c.header)) {
        ws.getColumn(idx + 1).alignment = { wrapText: true, vertical: "top" };
      }
    });
  }

  const buf = await workbook.xlsx.writeBuffer();
  return new Uint8Array(buf);
}

/**
 * V3.14 — Format `Date` → "dd/MM/yyyy HH:mm" theo giờ Asia/Ho_Chi_Minh (dùng
 * cho cột "Ngày tạo" trong info block + summary). Dùng `formatToParts` (locale
 * `en-GB`) thay vì lắp ráp thủ công từ `toLocaleString` để không lệ thuộc định
 * dạng dấu phẩy/khoảng trắng riêng của từng locale/runtime.
 */
export function formatVNDateTime(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("day")}/${get("month")}/${get("year")} ${get("hour")}:${get("minute")}`;
}
