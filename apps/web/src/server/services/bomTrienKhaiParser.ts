import type ExcelJS from "exceljs";
import {
  parseBomCategory,
  parseDims,
  stripDiacritics,
  type BomCategory,
  type Dims,
} from "@iot/shared";

/**
 * BOM V5 WP3 — parser mẫu "BOM TRIỂN KHAI" (header dòng 4, ảnh 3D cột C).
 * Hàm thuần trên workbook ExcelJS đã load; không đụng DB/đĩa.
 */

export interface TrienKhaiRow {
  /** Số dòng Excel (1-based). */
  rowNumber: number;
  stt: number | null;
  /** Cột ID: BL1..BLn. */
  position: string;
  file3dName: string;
  materialNote: string | null;
  categoryText: string | null;
  category: BomCategory;
  dimsText: string | null;
  dims: Dims | null;
  processMethod: string | null;
  materialCode: string | null;
  surfaceTreatment: string | null;
  /** Đã bỏ xuống dòng (\n) trong ô. */
  blankSpec: string | null;
  supplierText: string | null;
  /** Nhiều nhà ("A/B", "A, B") → cần chốt 1 NCC. */
  supplierPending: boolean;
  supplierNames: string[];
  picNames: string[];
  coef: number | null;
  qty: number | null;
  /** Chỉ số trong TrienKhaiParse.images, hoặc null nếu dòng không có ảnh. */
  imageIndex: number | null;
}

export interface TrienKhaiImage {
  index: number;
  buffer: Buffer;
  extension: string;
  /** Dòng Excel được gán. */
  rowNumber: number | null;
}

export interface TrienKhaiParse {
  template: "TRIEN_KHAI";
  sheetName: string;
  headerRow: number;
  projectCode: string | null;
  title: string | null;
  setCount: number | null;
  rows: TrienKhaiRow[];
  images: TrienKhaiImage[];
  warnings: string[];
}

const fold = (s: string) => stripDiacritics(s).toLowerCase().replace(/\s+/g, " ").trim();

function cellText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  if (v instanceof Date) return v.toISOString();
  if (typeof v === "object") {
    const o = v as Record<string, unknown>;
    if (Array.isArray(o.richText)) {
      return (o.richText as Array<{ text?: string }>).map((r) => r.text ?? "").join("");
    }
    if ("result" in o) return cellText(o.result);
    if ("text" in o) return cellText(o.text);
  }
  return "";
}

function cellNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (v && typeof v === "object" && "result" in (v as object)) {
    return cellNumber((v as { result: unknown }).result);
  }
  const t = cellText(v).trim().replace(",", ".");
  return /^-?\d+(\.\d+)?$/.test(t) ? Number(t) : null;
}

type ColKey =
  | "stt" | "id" | "image" | "name" | "note" | "category" | "dims" | "process"
  | "materialCode" | "surface" | "blank" | "supplier" | "pic" | "coef" | "qty";

/** Map header đã fold → khoá cột. */
function headerKey(h: string): ColKey | null {
  const t = fold(h);
  if (t === "stt") return "stt";
  if (t === "id") return "id";
  if (t.startsWith("anh 3d")) return "image";
  if (t.startsWith("ten chi tiet")) return "name";
  if (t.startsWith("vat lieu")) return "note";
  if (t === "category") return "category";
  if (t.startsWith("quy cach d")) return "dims";
  if (t.startsWith("pp gia cong")) return "process";
  if (t === "ma vat lieu") return "materialCode";
  if (t.startsWith("xu ly be mat")) return "surface";
  if (t.startsWith("quy cach phoi")) return "blank";
  if (t === "ncc") return "supplier";
  if (t === "pic") return "pic";
  if (t === "he so") return "coef";
  if (t === "sl") return "qty";
  return null;
}

const HEADER_SCAN_DEPTH = 8;

type Cols = Partial<Record<ColKey, number>>;

/** Tìm header mẫu TRIỂN KHAI trong sheet; trả {row, cols} hoặc null. */
export function detectTrienKhaiHeader(ws: ExcelJS.Worksheet): { row: number; cols: Cols } | null {
  for (let rn = 1; rn <= Math.min(HEADER_SCAN_DEPTH, ws.rowCount); rn++) {
    const cols: Cols = {};
    ws.getRow(rn).eachCell({ includeEmpty: false }, (cell, colNumber) => {
      const k = headerKey(cellText(cell.value));
      if (k && cols[k] === undefined) cols[k] = colNumber;
    });
    if (cols.name && cols.coef && cols.image && cols.id) return { row: rn, cols };
  }
  return null;
}

const EMU_PER_PT = 12700;

function rowHeightEmu(ws: ExcelJS.Worksheet, rowNumber: number): number {
  const h = ws.getRow(rowNumber).height ?? ws.properties.defaultRowHeight ?? 15;
  return (h > 0 ? h : 15) * EMU_PER_PT;
}

/** Toạ độ dọc (đơn vị "hàng", 0-based, phần lẻ theo offset EMU) của 1 anchor. */
function rowCoord(ws: ExcelJS.Worksheet, a: { nativeRow: number; nativeRowOff: number }): number {
  return a.nativeRow + a.nativeRowOff / rowHeightEmu(ws, a.nativeRow + 1);
}

function splitNames(text: string | null): string[] {
  if (!text) return [];
  return text
    .split(/[/,;]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseTrienKhai(wb: ExcelJS.Workbook): TrienKhaiParse | null {
  for (const ws of wb.worksheets) {
    const hdr = detectTrienKhaiHeader(ws);
    if (hdr) return parseSheet(wb, ws, hdr);
  }
  return null;
}

function parseSheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  hdr: { row: number; cols: Cols },
): TrienKhaiParse {
  const { cols } = hdr;
  const warnings: string[] = [];
  const get = (rn: number, k: ColKey) => (cols[k] ? ws.getRow(rn).getCell(cols[k]!).value : null);
  const str = (rn: number, k: ColKey, oneLine = false): string | null => {
    let t = cellText(get(rn, k)).trim();
    if (oneLine) t = t.replace(/\s*[\r\n]+\s*/g, "");
    return t === "" ? null : t;
  };

  const title = cellText(ws.getRow(1).getCell(1).value).trim() || null;
  const projectCode = title?.match(/Z\d{6,}(?:-\d+)?/)?.[0] ?? null;
  const note = stripDiacritics(cellText(ws.getRow(2).getCell(1).value));
  const sm = note.match(/so bo\s*=\s*(\d+)/i);
  const setCount = sm ? Number(sm[1]) : null;

  const rows: TrienKhaiRow[] = [];
  for (let rn = hdr.row + 1; rn <= ws.rowCount; rn++) {
    const position = str(rn, "id") ?? "";
    const name = str(rn, "name") ?? "";
    const stt = cellNumber(get(rn, "stt"));
    if (fold(position) === "tong" || fold(name) === "tong" || fold(str(rn, "stt") ?? "") === "tong") {
      continue;
    }
    if (stt === null || !name) continue;

    const categoryText = str(rn, "category");
    const dimsText = str(rn, "dims");
    const supplierText = str(rn, "supplier");
    const supplierNames = splitNames(supplierText);
    rows.push({
      rowNumber: rn,
      stt,
      position,
      file3dName: name,
      materialNote: str(rn, "note"),
      categoryText,
      category: parseBomCategory(categoryText),
      dimsText,
      dims: parseDims(dimsText),
      processMethod: str(rn, "process"),
      materialCode: str(rn, "materialCode"),
      surfaceTreatment: str(rn, "surface"),
      blankSpec: str(rn, "blank", true),
      supplierText,
      supplierPending: supplierNames.length > 1,
      supplierNames,
      picNames: splitNames(str(rn, "pic")),
      coef: cellNumber(get(rn, "coef")),
      qty: cellNumber(get(rn, "qty")),
      imageIndex: null,
    });
  }

  // Ảnh: gán theo hàng chứa phần lớn diện tích ảnh (KHÔNG theo from.row).
  const images: TrienKhaiImage[] = [];
  const byRow = new Map<number, { imageIdx: number; overlap: number }>();
  const rowByNumber = new Map(rows.map((r) => [r.rowNumber, r]));
  const imageCol = cols.image ? cols.image - 1 : 2;
  for (const im of ws.getImages()) {
    const media = wb.getImage(Number(im.imageId)) as
      | { buffer?: Buffer; extension?: string }
      | undefined;
    const r = im.range as unknown as {
      tl: { nativeRow: number; nativeRowOff: number; nativeCol: number };
      br?: { nativeRow: number; nativeRowOff: number };
      ext?: { height: number };
    };
    if (!media?.buffer || !r?.tl) continue;
    if (Math.floor(r.tl.nativeCol) !== imageCol) {
      warnings.push(`Ảnh ngoài cột "Ảnh 3D" (cột ${r.tl.nativeCol + 1}) bị bỏ qua.`);
      continue;
    }
    const top = rowCoord(ws, r.tl);
    const bottom = r.br
      ? rowCoord(ws, r.br)
      : top + ((r.ext?.height ?? 0) * 9525) / rowHeightEmu(ws, r.tl.nativeRow + 1);
    const center = (top + bottom) / 2;
    const idx = images.length;
    const rowNumber = Math.floor(center) + 1;
    images.push({
      index: idx,
      buffer: Buffer.from(media.buffer),
      extension: media.extension ?? "png",
      rowNumber: null,
    });
    if (!rowByNumber.has(rowNumber)) {
      warnings.push(`Ảnh #${idx + 1} rơi vào dòng ${rowNumber} không phải dòng dữ liệu — bỏ qua.`);
      continue;
    }
    // Phần ảnh nằm trong hàng (đơn vị hàng, 0-based: hàng Excel n phủ [n-1, n)).
    const overlap = Math.min(bottom, rowNumber) - Math.max(top, rowNumber - 1);
    const cur = byRow.get(rowNumber);
    if (cur) warnings.push(`Dòng ${rowNumber} có nhiều ảnh — giữ ảnh phủ nhiều nhất.`);
    if (!cur || overlap > cur.overlap) byRow.set(rowNumber, { imageIdx: idx, overlap });
  }
  for (const [rowNumber, { imageIdx }] of byRow) {
    rowByNumber.get(rowNumber)!.imageIndex = imageIdx;
    images[imageIdx]!.rowNumber = rowNumber;
  }
  const noImg = rows.filter((r) => r.imageIndex === null).map((r) => r.position);
  if (noImg.length) warnings.push(`Dòng không có ảnh: ${noImg.join(", ")}.`);

  return {
    template: "TRIEN_KHAI",
    sheetName: ws.name,
    headerRow: hdr.row,
    projectCode,
    title,
    setCount,
    rows,
    images,
    warnings,
  };
}
