import crypto from "node:crypto";
import ExcelJS from "exceljs";

/**
 * Parser BOM Excel multi-sheet (V1.1-alpha + fix smart header detect).
 * - Header row có thể rơi row 1..5 tuỳ file (title merged row 1 chỉ 1 cell).
 * - Auto-detect 2 tín hiệu:
 *     a) "Non-empty cell count": row nào có ≥ 3 cell non-empty là ứng viên.
 *     b) "Keyword match": ứng viên có keyword match ≥ 2 → chọn luôn.
 *   Ưu tiên row có nhiều keyword match nhất (tie → row có nhiều cell hơn → row sớm hơn).
 * - Nếu không ứng viên nào ≥ 3 cell → fallback row 1 + flag headerWarning.
 * - Mỗi sheet được treat như 1 BOM riêng (commit sẽ tạo 1 bom_template per sheet).
 */

export interface BomSheetMeta {
  sheetName: string;
  rowCount: number;
  headerRow: number;
  headersDetected: string[];
  /** 5 dòng đầu sau header row, dạng positional array (row[colIdx] = value). */
  previewRows: unknown[][];
  /** Title merged cell row 1 (nếu headerRow > 1) — hiển thị UI để gợi ý BOM code. */
  topTitle?: string | null;
  /** Cảnh báo nếu auto-detect không chắc chắn (cell count < 3). */
  headerWarning?: string | null;
  /** Tổng số row đã scan trong 5 row đầu (cho UI debug). */
  headerScanInfo?: {
    scannedRows: Array<{ rowNumber: number; nonEmpty: number; matches: number }>;
  };
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
  "sku", "qty", "size", "stt", "image", "partnumber",
  "material", "description", "spec", "linhkien", "vattu",
];

/** Số row scan đầu sheet để tìm header (title merged có thể chiếm 1-3 rows). */
const HEADER_SCAN_DEPTH = 5;
/** Ngưỡng tối thiểu non-empty cell để 1 row trở thành ứng viên header. */
const MIN_HEADER_CELLS = 3;

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
    // Smart auto-detect header: scan row 1..HEADER_SCAN_DEPTH, chọn row
    // có keyword match cao nhất; nếu hoà → row có nhiều cell hơn; nếu vẫn
    // hoà → row sớm hơn. Fallback: row đầu tiên có ≥ MIN_HEADER_CELLS cell.
    const scanned: Array<{
      rowNumber: number;
      cells: string[];
      nonEmpty: number;
      matches: number;
    }> = [];
    for (let rn = 1; rn <= Math.min(HEADER_SCAN_DEPTH, ws.rowCount); rn++) {
      const cells = readRowCells(ws, rn);
      const nonEmpty = cells.filter((c) => c.trim().length > 0).length;
      const matches = countHeaderMatches(cells);
      scanned.push({ rowNumber: rn, cells, nonEmpty, matches });
    }

    // Ứng viên: có ≥ MIN_HEADER_CELLS cell non-empty.
    const candidates = scanned.filter((r) => r.nonEmpty >= MIN_HEADER_CELLS);

    let picked = candidates[0];
    if (candidates.length > 0) {
      // Sort: match desc → nonEmpty desc → rowNumber asc.
      const sorted = [...candidates].sort((a, b) => {
        if (b.matches !== a.matches) return b.matches - a.matches;
        if (b.nonEmpty !== a.nonEmpty) return b.nonEmpty - a.nonEmpty;
        return a.rowNumber - b.rowNumber;
      });
      picked = sorted[0];
    }

    let headerRow: number;
    let headerCells: string[];
    let headerWarning: string | null = null;
    if (picked) {
      headerRow = picked.rowNumber;
      headerCells = picked.cells;
      if (picked.matches < 2) {
        headerWarning = `Không chắc chắn header ở row ${picked.rowNumber} — vui lòng kiểm tra bước Khớp cột.`;
      }
    } else {
      // Không row nào đủ 3 cell → lấy row 1 làm fallback + warn.
      headerRow = 1;
      headerCells = scanned[0]?.cells ?? [];
      headerWarning = "Không tìm thấy row header hợp lệ (mỗi row < 3 cell). Dùng row 1 tạm thời.";
    }

    // Lấy title row 1 nếu headerRow > 1 (thường là merged title).
    let topTitle: string | null = null;
    if (headerRow > 1 && scanned[0]) {
      const firstNonEmpty = scanned[0].cells.find((c) => c.trim().length > 0);
      topTitle = firstNonEmpty ? firstNonEmpty.trim() : null;
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

    // Preview dạng positional array theo headers (chỉ cột non-empty) để mapper +
    // SheetSelector index theo col idx = index của `headers` (đã filter).
    const previewRows: unknown[][] = dataRows.slice(0, 5).map((r) => {
      const row: unknown[] = [];
      headerCells.forEach((h, idx) => {
        if (!h || h.trim().length === 0) return;
        const key = h.trim() || `col_${idx + 1}`;
        row.push(r.data[key] ?? "");
      });
      return row;
    });

    sheets.push({
      sheetName: ws.name,
      rowCount: dataRows.length,
      headerRow,
      headersDetected: headers,
      previewRows,
      topTitle,
      headerWarning,
      headerScanInfo: {
        scannedRows: scanned.map((r) => ({
          rowNumber: r.rowNumber,
          nonEmpty: r.nonEmpty,
          matches: r.matches,
        })),
      },
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
