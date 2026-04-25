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

/** Phân loại sheet trong file Excel BOM theo template chính thức. */
export type OfficialSheetKind =
  /** Sheet BOM project (Z0000002-XXXXXX_BANG TAI ...). */
  | "PROJECT"
  /** Sheet master vật liệu + quy trình (Material&Process). */
  | "MASTER_MATERIAL_PROCESS"
  /** Sheet không thuộc template chính thức (legacy / generic). */
  | "UNKNOWN";

export interface OfficialFormatInfo {
  /** True nếu file có ≥1 sheet PROJECT khớp template "Bản chính thức". */
  isOfficial: boolean;
  /** Lý do nhận diện / từ chối — hiển thị UI cho user biết. */
  reason: string;
  /** Phân loại từng sheet theo tên + topTitle + headers. */
  sheetKinds: Record<string, OfficialSheetKind>;
}

export interface BomParseResult {
  fileHash: string;
  sheets: BomSheetMeta[];
  /** All rows per sheet, dùng cho worker commit. */
  allRowsBySheet: Record<string, Array<{ rowNumber: number; data: Record<string, unknown> }>>;
  /** V3: nhận diện format chính thức (Bản chính thức Z0000002-...). */
  officialFormat: OfficialFormatInfo;
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

/**
 * V3 — Regex nhận diện project code "Bản chính thức".
 * Ví dụ topTitle: "Z0000002-502653_BANG TAI DIPPING R01"
 *                 "Z0000002-502654_BANG TAI DIPPING L01"
 * Pattern: Z<7-9 digits>-<6 digits>_<text>
 */
const OFFICIAL_PROJECT_TITLE_RE = /^Z\d{6,10}-\d{4,8}_/i;

/**
 * V3 — Pattern nhận diện sheet master Material&Process.
 */
const OFFICIAL_MASTER_NAME_RE = /material\s*[&+]?\s*process|materialprocess/i;

/**
 * V3 — header tối thiểu để confirm sheet là PROJECT (không tính title).
 * Cần ≥ 4/6 trong các canonical headers.
 */
const OFFICIAL_PROJECT_HEADERS_REQUIRED = [
  "idnumber",
  "quantity",
  "standardnumber",
  "ncc",
  "subcategory",
  "visiblepartsize",
];

function classifyOfficialSheet(sheet: BomSheetMeta): OfficialSheetKind {
  const nameNorm = normHeader(sheet.sheetName);
  if (OFFICIAL_MASTER_NAME_RE.test(sheet.sheetName)) {
    return "MASTER_MATERIAL_PROCESS";
  }
  if (
    sheet.topTitle &&
    OFFICIAL_PROJECT_TITLE_RE.test(sheet.topTitle.trim())
  ) {
    // Verify thêm: header có đủ canonical fields.
    const headerSet = new Set(sheet.headersDetected.map((h) => normHeader(h)));
    let matchCount = 0;
    for (const req of OFFICIAL_PROJECT_HEADERS_REQUIRED) {
      for (const h of headerSet) {
        if (h.includes(req) || req.includes(h)) {
          matchCount++;
          break;
        }
      }
    }
    if (matchCount >= 4) return "PROJECT";
  }
  // Header signature fallback: nếu sheet có ≥ 5 canonical headers → vẫn nhận PROJECT
  // (kể cả khi topTitle thiếu — file có thể bị tách header riêng).
  const headerSet = new Set(sheet.headersDetected.map((h) => normHeader(h)));
  let signatureCount = 0;
  for (const req of OFFICIAL_PROJECT_HEADERS_REQUIRED) {
    for (const h of headerSet) {
      if (h.includes(req) || req.includes(h)) {
        signatureCount++;
        break;
      }
    }
  }
  if (signatureCount >= 5) return "PROJECT";
  // Tên sheet match pattern "BOM trien khai" / "BOM triển khai" cũng là project hint.
  if (/bomtrienkhai/i.test(nameNorm)) return "PROJECT";
  return "UNKNOWN";
}

/**
 * V3 — filter footer summary rows trong sheet PROJECT.
 *
 * Pattern footer (ví dụ R46-R58 trong file mẫu Z0000002-502653):
 *   - ID Number empty
 *   - Standard Number empty
 *   - Quantity empty
 *   - Chỉ có cột NCC + Note có giá trị (tổng kết status per-NCC)
 *
 * Logic: row được coi là footer summary nếu KHÔNG có cả `componentSku`-like
 * lẫn `idnumber`-like value, trong khi có ≥ 1 cột NCC/Note có giá trị.
 */
function isFooterSummaryRow(
  data: Record<string, unknown>,
): boolean {
  const keys = Object.keys(data);
  // Tìm key SKU (Standard Number) + key ID (ID Number).
  let skuVal = "";
  let idVal = "";
  let hasNccOrNote = false;
  for (const k of keys) {
    const norm = normHeader(k);
    const valStr = String(data[k] ?? "").trim();
    if (norm.includes("standardnumber") || norm === "sku") {
      skuVal = valStr;
    } else if (norm === "idnumber" || norm === "stt" || norm === "no") {
      idVal = valStr;
    } else if (
      norm.includes("ncc") ||
      norm.includes("note") ||
      norm.includes("ghichu")
    ) {
      if (valStr) hasNccOrNote = true;
    }
  }
  // Footer = SKU empty + ID empty + có NCC/Note.
  return skuVal === "" && idVal === "" && hasNccOrNote;
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

    // V3: filter footer summary rows (tổng kết per-NCC) trước khi return.
    const filteredDataRows = dataRows.filter(
      (r) => !isFooterSummaryRow(r.data),
    );
    const skippedFooterCount = dataRows.length - filteredDataRows.length;

    sheets.push({
      sheetName: ws.name,
      rowCount: filteredDataRows.length,
      headerRow,
      headersDetected: headers,
      previewRows,
      topTitle,
      headerWarning:
        headerWarning ??
        (skippedFooterCount > 0
          ? `Đã bỏ qua ${skippedFooterCount} dòng tổng kết ở cuối sheet.`
          : null),
      headerScanInfo: {
        scannedRows: scanned.map((r) => ({
          rowNumber: r.rowNumber,
          nonEmpty: r.nonEmpty,
          matches: r.matches,
        })),
      },
    });
    allRowsBySheet[ws.name] = filteredDataRows;
  });

  // V3: classify từng sheet + detect official format.
  const sheetKinds: Record<string, OfficialSheetKind> = {};
  let projectCount = 0;
  let masterCount = 0;
  for (const s of sheets) {
    const kind = classifyOfficialSheet(s);
    sheetKinds[s.sheetName] = kind;
    if (kind === "PROJECT") projectCount++;
    if (kind === "MASTER_MATERIAL_PROCESS") masterCount++;
  }
  const isOfficial = projectCount >= 1;
  const officialFormat: OfficialFormatInfo = {
    isOfficial,
    reason: isOfficial
      ? `Đã nhận diện ${projectCount} sheet BOM project${
          masterCount > 0
            ? ` + ${masterCount} sheet master Material&Process (sẽ bỏ qua phase 1)`
            : ""
        }.`
      : 'Không nhận diện được template "Bản chính thức". File phải có ít nhất 1 sheet với title `Z<số>-<số>_BANG TAI...` và header chuẩn (ID Number, Quantity, Standard Number, NCC).',
    sheetKinds,
  };

  return { fileHash, sheets, allRowsBySheet, officialFormat };
}

/**
 * Synonym dict BOM target field → header tokens (normalized, không khoảng trắng,
 * chỉ chữ + số, tất cả lowercase). Mở rộng VN/EN theo file thực tế xưởng.
 */
export const BOM_SYNONYM_DICT: Record<string, string[]> = {
  componentSku: [
    "standardnumber",
    "sku",
    "ma",
    "macode",
    "mavattu",
    "mvt",
    "mahanghoa",
    "mahang",
    "partnumber",
    "partno",
    "itemcode",
    "materialcode",
    "code",
  ],
  qtyPerParent: [
    "quantity",
    "sl",
    "soluong",
    "qty",
    "qtyperparent",
    "amount",
    "qtyper",
  ],
  componentSeq: ["idnumber", "stt", "id", "so", "seq", "sequence", "no", "thutu"],
  description: [
    "subcategory",
    "mota",
    "description",
    "desc",
    "name",
    "ten",
    "tenvt",
    "tenvattu",
    "productname",
    "spec",
    "specification",
  ],
  supplierItemCode: [
    "ncc",
    "nhacungcap",
    "supplier",
    "supplieritemcode",
    "supplierno",
    "vendor",
    "vendorcode",
    "maxncc",
  ],
  size: [
    "visiblepartsize",
    "size",
    "kichthuoc",
    "kt",
    "dimension",
    "dimensions",
    "dim",
  ],
  notes: ["note", "notes", "ghichu", "comment", "comments", "remark", "remarks"],
};

/** Levenshtein edit distance (iterative, O(mn) space-optimized). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr.push(
        Math.min(
          (curr[j - 1] ?? 0) + 1, // insert
          (prev[j] ?? 0) + 1, // delete
          (prev[j - 1] ?? 0) + cost, // replace
        ),
      );
    }
    prev = curr;
  }
  return prev[b.length] ?? 0;
}

/**
 * Auto mapping header → target field dựa synonym dict.
 *
 * Chiến lược 2-pass:
 *   1. Exact / substring match (includes) — ưu tiên cao.
 *   2. Fuzzy Levenshtein ≤ 2 với token dài ≥ 4 ký tự (tránh false-positive
 *      short token như "id" khớp "no").
 *
 * Ví dụ: "Qty per parent" → norm "qtyperparent" → exact match qtyPerParent.
 * "Standard No" → norm "standardno" → substring match componentSku.
 * "Describtion" (typo) → norm "describtion" → fuzzy match description (dist=2).
 */
export function autoMapHeaders(headers: string[]): Record<string, string | null> {
  const mapping: Record<string, string | null> = {};
  // V3: claim target — 1 target chỉ map cho 1 header (header đầu tiên thắng).
  // Tránh case Excel "Bản chính thức" có cả "Quantity" + "Số lượng" cùng map
  // qtyPerParent → 2 cột cùng target → conflict ở worker commit.
  // Multi-value targets (vd notes có Note 1/2/3) → cho phép trùng (giữ tất cả
  // map vào notes; worker commit sẽ concat).
  const MULTI_VALUE_TARGETS = new Set(["notes"]);
  const claimed = new Set<string>();

  for (const h of headers) {
    const n = normHeader(h);
    if (!n) {
      mapping[h] = null;
      continue;
    }

    // Pass 1: exact/substring.
    // V3 fix: substring match (`includes`) chỉ áp dụng khi BOTH ≥ 3 ký tự để
    // tránh false positive 2-char tokens ("id"/"no"/"ma"/"so" leak vào header
    // dài). Token 3-char domain-specific như "ncc", "stt", "sku", "qty" vẫn
    // hoạt động — verified bằng test "Bản chính thức" Z0000002.
    let matched: string | null = null;
    for (const [target, tokens] of Object.entries(BOM_SYNONYM_DICT)) {
      if (claimed.has(target) && !MULTI_VALUE_TARGETS.has(target)) continue;
      for (const t of tokens) {
        if (n === t) {
          matched = target;
          break;
        }
        if (t.length >= 3 && n.length >= 3) {
          if (n.includes(t) || t.includes(n)) {
            matched = target;
            break;
          }
        }
      }
      if (matched) break;
    }

    // Pass 2: fuzzy Levenshtein (chỉ khi pass 1 fail).
    if (!matched && n.length >= 4) {
      let best: { target: string; dist: number } | null = null;
      for (const [target, tokens] of Object.entries(BOM_SYNONYM_DICT)) {
        if (claimed.has(target) && !MULTI_VALUE_TARGETS.has(target)) continue;
        for (const t of tokens) {
          if (t.length < 4) continue;
          const dist = levenshtein(n, t);
          if (dist <= 2 && (!best || dist < best.dist)) {
            best = { target, dist };
          }
        }
      }
      if (best) matched = best.target;
    }

    if (matched && !MULTI_VALUE_TARGETS.has(matched)) {
      claimed.add(matched);
    }
    mapping[h] = matched;
  }
  return mapping;
}
