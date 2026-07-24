/**
 * V3.15 — Xuất NHIỀU phiếu đề xuất vật tư ra 1 file Excel, MỖI PHIẾU 1 SHEET
 * và mỗi sheet giữ nguyên bố cục "phiếu gốc" (template YCVT/MRF hoặc DNVT).
 *
 * Kỹ thuật: với mỗi phiếu, load template vào 1 workbook tạm → fill dữ liệu →
 * copy `worksheet.model` sang workbook đích (giữ style/format/formula/pageSetup)
 * → áp LẠI merges thủ công (model setter làm rơi merges) → add lại logo (ảnh
 * không đi theo model). Sheet đầu "Tổng hợp" liệt kê toàn bộ phiếu.
 */
import ExcelJS from "exceljs";
import {
  YCVT_TEMPLATE_SHEET,
  getYcvtTemplateBuffer,
  addYcvtLogo,
  fillYcvtCells,
  type YcvtExportData,
} from "./ycvtExportExcel";
import {
  DNVT_TEMPLATE_SHEET,
  getDnvtTemplateBuffer,
  addDnvtLogo,
  fillDnvtCells,
  type DnvtExportData,
} from "./dnvtExportExcel";

export interface PrSheetInput {
  kind: "ycvt" | "dnvt";
  /** Tên gợi ý cho sheet (thường là số phiếu) — sanitize + dedupe bên trong. */
  sheetName: string;
  data: YcvtExportData | DnvtExportData;
}

export interface PrSummary {
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

/** Sanitize tên sheet theo luật Excel (bỏ `\ / ? * [ ] :`, ≤31 ký tự) + dedupe. */
function sanitizeSheetName(name: string, used: Set<string>): string {
  let base = name.replace(/[\\/?*[\]:]/g, "-").trim();
  if (base.length === 0) base = "Phieu";
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

function buildSummarySheet(
  wb: ExcelJS.Workbook,
  title: string,
  summary: PrSummary,
  hasSlips: boolean,
): void {
  const ws = wb.addWorksheet("Tổng hợp");
  ws.columns = summary.columns.map((c) => ({ width: c.width }));
  const colCount = Math.max(1, summary.columns.length);

  const titleRow = ws.addRow([title]);
  titleRow.font = { bold: true, size: 14 };
  ws.mergeCells(1, 1, 1, colCount);
  ws.addRow([]);

  if (!hasSlips) {
    const emptyRow = ws.addRow([
      "Không có phiếu nào trong khoảng thời gian đã chọn.",
    ]);
    emptyRow.font = { italic: true, color: { argb: "FF71717A" } };
    ws.mergeCells(emptyRow.number, 1, emptyRow.number, colCount);
    return;
  }

  const headerRow = ws.addRow(summary.columns.map((c) => c.header));
  headerRow.eachCell({ includeEmpty: true }, (cell) => {
    cell.font = { bold: true };
    cell.fill = HEADER_FILL;
    cell.border = THIN_BORDER;
  });
  ws.views = [{ state: "frozen", ySplit: headerRow.number }];
  for (const rowData of summary.rows) {
    const row = ws.addRow(rowData);
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.border = THIN_BORDER;
    });
  }
}

/**
 * Copy 1 worksheet template (đã fill) sang workbook đích, giữ nguyên bố cục.
 */
function copyFilledSheet(
  master: ExcelJS.Workbook,
  src: ExcelJS.Worksheet,
  name: string,
): ExcelJS.Worksheet {
  const merges = ((src.model as { merges?: string[] }).merges ?? []).slice();
  const dest = master.addWorksheet(name);
  dest.model = src.model;
  dest.name = name; // model mang theo tên gốc "Phiếu MRF/DNVT" → đặt lại
  for (const m of merges) {
    try {
      dest.mergeCells(m);
    } catch {
      /* range đã merge — bỏ qua */
    }
  }
  return dest;
}

export async function buildPrTemplateWorkbook(input: {
  workbookTitle: string;
  summary: PrSummary;
  sheets: PrSheetInput[];
}): Promise<Uint8Array> {
  const master = new ExcelJS.Workbook();
  master.creator = "he-thong-iot MES";
  master.created = new Date();

  buildSummarySheet(master, input.workbookTitle, input.summary, input.sheets.length > 0);

  const used = new Set<string>(["Tổng hợp"]);
  // Load template 1 lần (bytes được cache trong service tương ứng).
  const ycvtTpl = await getYcvtTemplateBuffer();
  const dnvtTpl = await getDnvtTemplateBuffer();

  for (const s of input.sheets) {
    const tmp = new ExcelJS.Workbook();
    const tplBytes = s.kind === "ycvt" ? ycvtTpl : dnvtTpl;
    await tmp.xlsx.load(tplBytes as unknown as ArrayBuffer);
    const srcName = s.kind === "ycvt" ? YCVT_TEMPLATE_SHEET : DNVT_TEMPLATE_SHEET;
    const src = tmp.getWorksheet(srcName);
    if (!src) continue; // template hỏng — bỏ qua phiếu này

    if (s.kind === "ycvt") fillYcvtCells(src, s.data as YcvtExportData);
    else fillDnvtCells(src, s.data as DnvtExportData);

    const name = sanitizeSheetName(s.sheetName, used);
    const dest = copyFilledSheet(master, src, name);

    if (s.kind === "ycvt") await addYcvtLogo(master, dest);
    else await addDnvtLogo(master, dest);
  }

  const buf = await master.xlsx.writeBuffer();
  return new Uint8Array(buf);
}
