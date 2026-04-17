import crypto from "node:crypto";
import ExcelJS from "exceljs";

/**
 * Parser BOM Excel multi-sheet (V1.1-alpha).
 * - Header row có thể là row 1 hoặc row 2 (sample file header = row 2, row 1 là title).
 * - Auto-detect: thử row 1 — nếu chứa ≥ 3 header known → row 1; nếu không thử row 2.
 * - Mỗi sheet được treat như 1 BOM riêng (commit sẽ tạo 1 bom_template per sheet).
 */

export interface BomSheetMeta {
  sheetName: string;
  rowCount: number;
  headerRow: number;
  headersDetected: string[];
  firstRows: Array<Record<string, unknown>>; // 5 dòng đầu (sau header) cho preview
}

export interface BomParseResult {
  fileHash: string;
  sheets: BomSheetMeta[];
  /** All rows per sheet, dùng cho worker commit. */
  allRowsBySheet: Record<string, Array<{ rowNumber: number; data: Record<string, unknown> }>>;
}

export async function computeSha256(buffer: Uint8Array): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(buffer);
  return h.digest("hex");
}

/** Normalize header string. */
function normHeader(s: string): string {
  return String(s).trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Header keywords cho detection header row (ít nhất 2 match là đủ). */
const HEADER_KEYWORDS_NORM = [
  "idnumber", "standardnumber", "quantity", "subcategory",
  "ncc", "visiblepartsize", "note", "ma", "soluong", "mota",
  "sku", "qty", "size",
];

function cellToString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "object") {
    if ("text" in (v as Record<string, unknown>)) return String((v as { text: string }).text ?? "");
    if ("result" in (v as Record<string, unknown>)) return String((v as { result: unknown }).result ?? "");
    if ("richText" in (v as Record<string, unknown>)) {
      const rt = (v as { richText: Array<{ text: string }> }).richText ?? [];
      return rt.map((r) => r.text).join("");
    }
  }
  return String(v);
}

function countHeaderMatches(cells: string[]): number {
  let count = 0;
  for (const c of cells) {
    const n = normHeader(c);
    if (!n) continue;
    for (const k of HEADER_KEYWORDS_NORM) {
      if (n.includes(k) || k.includes(n)) {
        count++;
        break;
      }
    }
  }
  return count;
}

function readRowCells(ws: ExcelJS.Worksheet, rowNumber: number): string[] {
  const row = ws.getRow(rowNumber);
  const cells: string[] = [];
  row.eachCell({ includeEmpty: true }, (cell) => {
    cells.push(cellToString(cell.value));
  });
  return cells;
}

export async function parseBomImport(buffer: Buffer): Promise<BomParseResult> {
  const fileHash = await computeSha256(buffer);
  const wb = new ExcelJS.Workbook();
  // ExcelJS types khác biệt Buffer vs Uint8Array → cast an toàn
  await wb.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: BomSheetMeta[] = [];
  const allRowsBySheet: BomParseResult["allRowsBySheet"] = {};

  wb.eachSheet((ws) => {
    // Auto-detect header row: row 1 hoặc row 2
    const row1Cells = readRowCells(ws, 1);
    const row2Cells = readRowCells(ws, 2);

    const matchR1 = countHeaderMatches(row1Cells);
    const matchR2 = countHeaderMatches(row2Cells);

    let headerRow = 1;
    let headerCells = row1Cells;
    if (matchR2 > matchR1 && matchR2 >= 2) {
      headerRow = 2;
      headerCells = row2Cells;
    } else if (matchR1 < 2 && matchR2 >= 2) {
      headerRow = 2;
      headerCells = row2Cells;
    }

    // Xây index header: col-index → header-string
    const headers: string[] = headerCells.filter((c) => c.trim().length > 0);

    // Parse data rows (sau header row)
    const dataRows: Array<{ rowNumber: number; data: Record<string, unknown> }> = [];
    const rowCount = ws.rowCount;

    for (let rn = headerRow + 1; rn <= rowCount; rn++) {
      const row = ws.getRow(rn);
      if (!row || !row.hasValues) continue;

      const rowData: Record<string, unknown> = {};
      let hasAny = false;
      headerCells.forEach((h, idx) => {
        const cell = row.getCell(idx + 1);
        const val = cellToString(cell.value);
        if (val.length > 0) hasAny = true;
        const key = h.trim() || `col_${idx + 1}`;
        rowData[key] = val;
      });

      if (hasAny) dataRows.push({ rowNumber: rn, data: rowData });
    }

    const firstRows = dataRows.slice(0, 5).map((r) => r.data);

    sheets.push({
      sheetName: ws.name,
      rowCount: dataRows.length,
      headerRow,
      headersDetected: headers,
      firstRows,
    });
    allRowsBySheet[ws.name] = dataRows;
  });

  return { fileHash, sheets, allRowsBySheet };
}

/** Synonym dict BOM target field → header tokens (normalized). */
export const BOM_SYNONYM_DICT: Record<string, string[]> = {
  componentSku: ["standardnumber", "sku", "ma", "mvt", "mahanghoa"],
  qtyPerParent: ["quantity", "sl", "soluong", "qty"],
  componentSeq: ["idnumber", "stt", "id", "so"],
  description: ["subcategory", "mota", "description", "name", "ten"],
  supplierItemCode: ["ncc", "nhacungcap", "supplier", "vendor"],
  size: ["visiblepartsize", "size", "kichthuoc", "kt"],
  notes: ["note", "ghichu", "comment"],
};

/** Auto mapping header → target field dựa synonym dict. */
export function autoMapHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  for (const h of headers) {
    const n = normHeader(h);
    let matched: string | null = null;
    for (const [target, tokens] of Object.entries(BOM_SYNONYM_DICT)) {
      for (const t of tokens) {
        if (n.includes(t) || t.includes(n)) {
          matched = target;
          break;
        }
      }
      if (matched) break;
    }
    mapping[h] = matched;
  }
  return mapping;
}
