import ExcelJS from "exceljs";
import { sanitizeExcelCellValue } from "./excelSafety";
import { assertImportRowLimit } from "./importLimits";

/**
 * V4.3 Việc 1 — Xuất/nhập Excel "Vị trí mặc định vật tư".
 *
 * Bám khuôn `financeImport.ts` (chuẩn hoá header tiếng Việt có dấu, chống
 * formula injection khi export) nhưng NHẸ hơn nhiều — chỉ 2 cột nghiệp vụ
 * (mã vật tư + mã vị trí mặc định), không cần dedupe/số tiền/ngày tháng.
 */

export const DEFAULT_BIN_IMPORT_HEADER = ["sku", "binCode"] as const;
type Field = (typeof DEFAULT_BIN_IMPORT_HEADER)[number];

const HEADER_LABELS: Record<Field, string> = {
  sku: "Mã vật tư",
  binCode: "Vị trí mặc định",
};

const HEADER_ALIASES: Record<Field, string[]> = {
  sku: ["mavattu", "sku", "ma", "masp"],
  binCode: ["vitrimacdinh", "vitri", "macoke", "bincode", "macokeloc", "macoloc"],
};

const REQUIRED_HEADERS: Field[] = ["sku"];

function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

function cellRaw(v: ExcelJS.CellValue): unknown {
  if (v === null || v === undefined) return undefined;
  if (typeof v === "object" && !(v instanceof Date)) {
    const o = v as unknown as Record<string, unknown>;
    if ("result" in o) return o.result;
    if ("text" in o) return o.text;
    if ("richText" in o && Array.isArray(o.richText)) {
      return (o.richText as Array<{ text: string }>).map((r) => r.text).join("");
    }
  }
  return v;
}

function headerMapOf(ws: ExcelJS.Worksheet): Record<string, number> {
  const headers: Record<string, number> = {};
  ws.getRow(1).eachCell((cell, colIdx) => {
    const raw = cellRaw(cell.value);
    const key = normHeader(String(raw ?? ""));
    if (key && !(key in headers)) headers[key] = colIdx;
  });
  return headers;
}

function missingRequired(headers: Record<string, number>): string[] {
  return REQUIRED_HEADERS.filter((f) => !HEADER_ALIASES[f].some((a) => a in headers)).map(
    (f) => HEADER_LABELS[f],
  );
}

export interface DefaultBinImportRowError {
  rowNumber: number;
  field: string;
  reason: string;
  rawValue?: unknown;
}

export interface DefaultBinImportValidRow {
  rowNumber: number;
  sku: string;
  itemId: string;
  itemName: string;
  /** null = dòng để trống cột vị trí → XOÁ vị trí mặc định hiện tại. */
  binCode: string | null;
  binId: string | null;
}

export interface DefaultBinImportParseResult {
  rowTotal: number;
  validRows: DefaultBinImportValidRow[];
  errors: DefaultBinImportRowError[];
  headerMismatch: string[];
}

export interface DefaultBinImportRefs {
  items: Array<{ id: string; sku: string; name: string; isActive: boolean }>;
  bins: Array<{ id: string; fullCode: string; isActive: boolean }>;
}

/** Khớp CHÍNH XÁC (bỏ dấu/hoa-thường/khoảng trắng) — không khớp mờ "chứa trong". */
function matchExactSku(
  needle: string,
  items: DefaultBinImportRefs["items"],
): DefaultBinImportRefs["items"][number] | null {
  const n = normHeader(needle);
  if (!n) return null;
  return items.find((i) => normHeader(i.sku) === n) ?? null;
}

function matchExactBin(
  needle: string,
  bins: DefaultBinImportRefs["bins"],
): DefaultBinImportRefs["bins"][number] | null {
  const n = normHeader(needle);
  if (!n) return null;
  return bins.find((b) => normHeader(b.fullCode) === n) ?? null;
}

/** Phần THUẦN của import (không DB): đọc workbook + đối chiếu `refs` đã nạp sẵn. */
export function parseDefaultBinWorkbook(
  workbook: ExcelJS.Workbook,
  refs: DefaultBinImportRefs,
): DefaultBinImportParseResult {
  const errors: DefaultBinImportRowError[] = [];
  const validRows: DefaultBinImportValidRow[] = [];

  const ws = workbook.worksheets[0];
  if (!ws) {
    return { rowTotal: 0, validRows, errors, headerMismatch: [HEADER_LABELS.sku] };
  }
  const headerMap = headerMapOf(ws);
  const missing = missingRequired(headerMap);
  if (missing.length > 0) {
    return { rowTotal: 0, validRows, errors, headerMismatch: missing };
  }

  assertImportRowLimit(ws.rowCount);

  const activeItems = refs.items.filter((i) => i.isActive);
  const activeBins = refs.bins.filter((b) => b.isActive);
  const seenSku = new Set<string>();
  let rowTotal = 0;

  ws.eachRow({ includeEmpty: false }, (row) => {
    if (row.number === 1) return;
    const getCell = (field: Field): unknown => {
      for (const alias of HEADER_ALIASES[field]) {
        const idx = headerMap[alias];
        if (idx) return cellRaw(row.getCell(idx).value);
      }
      return undefined;
    };
    const rawSku = getCell("sku");
    const rawBin = getCell("binCode");
    const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
    if (isBlank(rawSku) && isBlank(rawBin)) return;
    rowTotal++;

    if (isBlank(rawSku)) {
      errors.push({ rowNumber: row.number, field: "sku", reason: "Thiếu mã vật tư.", rawValue: rawSku });
      return;
    }
    const skuStr = String(rawSku).trim();
    const itemMatch = matchExactSku(skuStr, activeItems);
    if (!itemMatch) {
      errors.push({
        rowNumber: row.number,
        field: "sku",
        reason: `Không có vật tư đang hoạt động nào có mã "${skuStr}".`,
        rawValue: rawSku,
      });
      return;
    }
    const dupKey = normHeader(skuStr);
    if (seenSku.has(dupKey)) {
      errors.push({
        rowNumber: row.number,
        field: "sku",
        reason: `Mã vật tư "${skuStr}" bị lặp lại trong file — chỉ dòng đầu tiên được áp dụng.`,
        rawValue: rawSku,
      });
      return;
    }
    seenSku.add(dupKey);

    let binId: string | null = null;
    let binCode: string | null = null;
    if (!isBlank(rawBin)) {
      const binStr = String(rawBin).trim();
      const binMatch = matchExactBin(binStr, activeBins);
      if (!binMatch) {
        errors.push({
          rowNumber: row.number,
          field: "binCode",
          reason: `Không có vị trí (ô kệ) đang hoạt động nào có mã "${binStr}".`,
          rawValue: rawBin,
        });
        return;
      }
      binId = binMatch.id;
      binCode = binMatch.fullCode;
    }

    validRows.push({
      rowNumber: row.number,
      sku: itemMatch.sku,
      itemId: itemMatch.id,
      itemName: itemMatch.name,
      binCode,
      binId,
    });
  });

  return { rowTotal, validRows, errors, headerMismatch: [] };
}

/** Đọc buffer .xlsx (upload) → workbook rồi parse. */
export async function parseDefaultBinImportFile(
  buffer: Buffer,
  refs: DefaultBinImportRefs,
): Promise<DefaultBinImportParseResult> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);
  return parseDefaultBinWorkbook(workbook, refs);
}

export interface DefaultBinExportRow {
  sku: string;
  name: string;
  currentBinCode: string | null;
  suggestedBinCode: string | null;
  suggestedQty: number | null;
  totalQty: number | null;
}

/** Xuất danh sách vật tư + vị trí mặc định hiện tại/đề xuất — chống formula injection ở mọi cột chuỗi. */
export async function buildDefaultBinExportWorkbook(rows: DefaultBinExportRow[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("ViTriMacDinh");
  ws.columns = [
    { header: HEADER_LABELS.sku, key: "sku", width: 20 },
    { header: "Tên vật tư", key: "name", width: 36 },
    { header: "Vị trí mặc định hiện tại", key: "currentBinCode", width: 24 },
    { header: HEADER_LABELS.binCode, key: "binCode", width: 24 },
    { header: "SL tại vị trí đề xuất", key: "suggestedQty", width: 18 },
    { header: "Tổng tồn", key: "totalQty", width: 14 },
  ];
  for (const r of rows) {
    ws.addRow({
      sku: sanitizeExcelCellValue(r.sku),
      name: sanitizeExcelCellValue(r.name),
      currentBinCode: sanitizeExcelCellValue(r.currentBinCode ?? ""),
      binCode: sanitizeExcelCellValue(r.suggestedBinCode ?? ""),
      suggestedQty: r.suggestedQty ?? "",
      totalQty: r.totalQty ?? "",
    });
  }
  ws.getRow(1).font = { bold: true };

  const guide = wb.addWorksheet("HuongDan");
  guide.addRow(["Cột", "Bắt buộc", "Ghi chú"]);
  guide.addRow([HEADER_LABELS.sku, "Có", "Mã vật tư ĐÚNG (xem sheet ViTriMacDinh) — không phân biệt hoa/thường"]);
  guide.addRow([
    HEADER_LABELS.binCode,
    "Không",
    'Mã vị trí (ô kệ) ĐÚNG, vd "A-01-1-01" — để TRỐNG sẽ XOÁ vị trí mặc định hiện tại của vật tư đó',
  ]);
  guide.addRow([]);
  guide.addRow(["Lưu ý", "", "Sửa cột 'Vị trí mặc định' rồi nhập lại file này qua chức năng Nhập Excel để áp dụng hàng loạt."]);
  guide.getRow(1).font = { bold: true };
  guide.columns.forEach((col) => {
    col.width = 30;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
