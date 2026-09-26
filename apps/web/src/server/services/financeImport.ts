import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { eq, sql } from "drizzle-orm";
import { finAccount, finCategory, finTransaction, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import { balanceAfter, formatVndFull } from "@/lib/finance";
import { computeSha256 } from "./excelImport";

/**
 * Phase D — Import Excel giao dịch thu/chi (`fin_transaction`). Bám khuôn
 * `excelImport.ts` nhưng viết file RIÊNG để tránh xung đột logic item/bom.
 *
 * V4.1 Đợt 3 — sửa TC-04/18/22/23 + Q7:
 *   - TC-04: chỉ đọc SHEET DỮ LIỆU (sheet đầu tiên có đủ cột bắt buộc ở dòng 1,
 *     ưu tiên "GiaoDich") — trước đây lặp mọi sheet nên sheet "HuongDan" của
 *     chính file mẫu làm báo "Thiếu cột".
 *   - TC-18 + Q7: cột "Nguồn" (vẫn nhận "Tài khoản" cho file cũ) khớp CHÍNH XÁC
 *     mã hoặc tên (bỏ dấu, không phân biệt hoa thường) trên nguồn ĐANG HOẠT
 *     ĐỘNG — hết khớp mờ "contains" ghi nhầm tài khoản.
 *   - TC-22: parse số `1234567.5` / `1.234.567,5` và ngày `31/02` đúng.
 *   - TC-23: dedupe gồm CHIỀU thu/chi + số thứ tự lần xuất hiện trong file →
 *     2 khoản hợp lệ giống hệt nhau trong 1 file đều được nhập.
 *   - Q7: số dư nguồn âm sau import CHỈ cảnh báo (dữ liệu lịch sử), không chặn.
 * Phần thuần (không DB) tách ra `parseFinanceWorkbook`/`buildFinanceTemplateWorkbook`
 * để test bằng chính file mẫu của hệ thống.
 */

export const FINANCE_IMPORT_HEADER = [
  "ngayGd",
  "loai",
  "taiKhoan",
  "danhMuc",
  "soTien",
  "dienGiai",
  "doiTuong",
  "soChungTu",
] as const;
type Field = (typeof FINANCE_IMPORT_HEADER)[number];

const HEADER_LABELS: Record<Field, string> = {
  ngayGd: "Ngày GD",
  loai: "Loại (Thu/Chi)",
  // V4.1 Q7 — "Nguồn" (nguồn thu / nguồn chi). File cũ ghi "Tài khoản" vẫn đọc được.
  taiKhoan: "Nguồn",
  danhMuc: "Danh mục",
  soTien: "Số tiền",
  dienGiai: "Diễn giải",
  doiTuong: "Đối tượng (NCC/KH)",
  soChungTu: "Số chứng từ/Ref",
};

// Cột bắt buộc — thiếu cột optional (danhMuc, dienGiai, doiTuong, soChungTu) không chặn.
const REQUIRED_HEADERS: Field[] = ["ngayGd", "loai", "taiKhoan", "soTien"];

export interface FinanceImportRow {
  transactionDate: string; // YYYY-MM-DD
  direction: "IN" | "OUT";
  accountId: string;
  accountCode: string;
  categoryId: string | null;
  amount: number;
  description: string | null;
  supplierId: string | null;
  supplierNameRaw: string | null;
  externalRef: string | null;
  dedupeHash: string;
}

export interface FinanceImportRowError {
  rowNumber: number;
  field: string;
  reason: string;
  rawValue?: unknown;
}

export interface FinanceImportWarning {
  rowNumber: number;
  field: string;
  reason: string;
}

export interface FinanceImportParseResult {
  fileHash: string;
  rowTotal: number;
  validRows: Array<{ rowNumber: number; data: FinanceImportRow; duplicate: boolean }>;
  errors: FinanceImportRowError[];
  warnings: FinanceImportWarning[];
  headerMismatch: string[];
}

export function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // bỏ dấu tiếng Việt
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]/g, "");
}

// Alias chấp nhận cho từng field (đã chuẩn hoá bằng normHeader).
const HEADER_ALIASES: Record<Field, string[]> = {
  ngayGd: ["ngaygd", "ngay", "ngaygiaodich", "date"],
  loai: ["loaithuchi", "loai", "direction", "thuchi"],
  // V4.1 Q7 — "Nguồn" là tên mới; "Tài khoản"/"TK" giữ cho file cũ.
  taiKhoan: ["nguon", "nguonthuchi", "nguontien", "taikhoan", "tk", "account", "mataikhoan"],
  danhMuc: ["danhmuc", "category", "madanhmuc"],
  soTien: ["sotien", "amount", "sotienthucthu"],
  dienGiai: ["diengiai", "description", "noidung", "ghichu"],
  doiTuong: ["doituongncckh", "doituong", "supplier", "khachhang", "ncckh"],
  soChungTu: ["sochungturef", "sochungtu", "ref", "externalref", "sohoadon", "sochungtungoai"],
};

/**
 * V4.1 TC-22 — Ngày từ ô Excel → 'YYYY-MM-DD' (hoặc null nếu không hợp lệ).
 * - Date (ExcelJS trả nửa đêm UTC) / số serial Excel → đọc theo UTC.
 * - Chuỗi dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy hoặc yyyy-mm-dd — KIỂM ngày có
 *   thật (31/02 bị từ chối, không tự "trôi" sang 03/03 như `new Date`).
 * Trước đây `new Date(y, m, d).toISOString()` dùng giờ máy chủ → lùi 1 ngày.
 */
export function parseImportDate(value: unknown): string | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Excel serial date (epoch 1899-12-30), bỏ phần giờ.
    const ms = Math.round((Math.floor(value) - 25569) * 86400 * 1000);
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  if (typeof value !== "string") return null;
  const s = value.trim();
  let y: number;
  let m: number;
  let d: number;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (dmy) {
    d = Number(dmy[1]);
    m = Number(dmy[2]);
    y = Number(dmy[3]);
  } else if (ymd) {
    y = Number(ymd[1]);
    m = Number(ymd[2]);
    d = Number(ymd[3]);
  } else {
    return null;
  }
  if (m < 1 || m > 12 || d < 1 || y < 1900 || y > 2999) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) {
    return null; // VD 31/02, 30/02, 31/04
  }
  return date.toISOString().slice(0, 10);
}

/**
 * V4.1 TC-22 — Số tiền từ ô Excel. Ô kiểu số giữ nguyên. Chuỗi:
 * - có cả '.' và ',' → dấu xuất hiện SAU CÙNG là dấu thập phân
 *   (`1.234.567,5` = `1,234,567.5` = 1234567.5);
 * - chỉ 1 loại dấu, xuất hiện ≥ 2 lần → ngăn cách nghìn (`1.234.567`);
 * - chỉ 1 dấu duy nhất: theo sau đúng 3 chữ số → ngăn cách nghìn (`1.500` =
 *   1500 — VND hầu như không lẻ); còn lại là thập phân (`1234567.5`).
 * Bỏ ký hiệu tiền (₫, đ, VND) và khoảng trắng. Làm tròn 2 số lẻ (numeric(18,2)).
 */
export function parseImportAmount(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
  if (typeof value !== "string") return null;
  let s = value.trim().replace(/(vnd|vnđ|đ|₫|\s)/gi, "");
  if (!s) return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return null;
  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");
  let normalized: string;
  if (lastDot >= 0 && lastComma >= 0) {
    const dec = lastDot > lastComma ? "." : ",";
    const thou = dec === "." ? "," : ".";
    normalized = s.split(thou).join("").replace(dec, ".");
    if ((normalized.match(/\./g) ?? []).length > 1) return null;
  } else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? "." : ",";
    const parts = s.split(sep);
    if (parts.length > 2) {
      // nhiều dấu cùng loại → ngăn cách nghìn, mọi nhóm sau phải đủ 3 số
      if (parts.slice(1).some((p) => p.length !== 3)) return null;
      normalized = parts.join("");
    } else {
      normalized = parts[1]!.length === 3 ? parts.join("") : `${parts[0]}.${parts[1]}`;
    }
  } else {
    normalized = s;
  }
  const n = Number(normalized);
  if (!Number.isFinite(n)) return null;
  return ((negative ? -1 : 1) * Math.round(n * 100)) / 100;
}

function normalizeDirection(value: unknown): "IN" | "OUT" | null {
  const s = normHeader(String(value ?? ""));
  if (!s) return null;
  if (["thu", "in", "income", "receipt", "phieuthu"].includes(s)) return "IN";
  if (["chi", "out", "expense", "payment", "phieuchi"].includes(s)) return "OUT";
  return null;
}

/**
 * V4.1 TC-18 — Khớp CHÍNH XÁC theo mã hoặc tên (bỏ dấu/hoa thường/khoảng
 * trắng). KHÔNG khớp "chứa trong" — "Quỹ" từng khớp nhầm "Quỹ tiền mặt 2".
 */
export function matchExact<T extends { code?: string | null; name: string }>(
  needle: string,
  candidates: T[],
): T | null {
  const n = normHeader(needle);
  if (!n) return null;
  return (
    candidates.find((c) => c.code && normHeader(c.code) === n) ??
    candidates.find((c) => normHeader(c.name) === n) ??
    null
  );
}

/** Khớp mờ — CHỈ dùng cho danh mục/đối tượng (sai thì chỉ để trống + cảnh báo). */
function fuzzyFind<T extends { id: string; code?: string; name: string }>(
  needle: string,
  candidates: T[],
): T | null {
  const exact = matchExact(needle, candidates);
  if (exact) return exact;
  const n = normHeader(needle);
  if (!n) return null;
  return (
    candidates.find((c) => normHeader(c.name).includes(n) || n.includes(normHeader(c.name))) ??
    null
  );
}

/**
 * V4.1 TC-23 — Hash chống trùng: nguồn + ngày + CHIỀU + số tiền + (số chứng từ
 * hoặc diễn giải) + số thứ tự lần xuất hiện của khoá đó trong file
 * (`occurrence`, 0 = lần đầu). Nhập lại cùng file → cùng hash → bỏ qua; 2 khoản
 * hợp lệ giống hệt nhau trong 1 file → occurrence 0/1 → đều được nhập.
 */
export function computeFinanceDedupeHash(row: {
  accountId: string;
  transactionDate: string;
  direction: "IN" | "OUT";
  amount: number;
  externalRef?: string | null;
  description?: string | null;
  occurrence?: number;
}): string {
  const ref = row.externalRef?.trim() ? row.externalRef.trim() : (row.description ?? "");
  const key = `v2|${row.accountId}|${row.transactionDate}|${row.direction}|${row.amount}|${ref}|#${row.occurrence ?? 0}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Hash kiểu cũ (trước V4.1, không có chiều/lần xuất hiện) — chỉ để nhận ra file đã nhập trước đây. */
export function computeLegacyFinanceDedupeHash(row: {
  accountId: string;
  transactionDate: string;
  amount: number;
  externalRef?: string | null;
  description?: string | null;
}): string {
  const key = row.externalRef?.trim()
    ? `${row.accountId}|${row.transactionDate}|${row.amount}|${row.externalRef.trim()}`
    : `${row.accountId}|${row.transactionDate}|${row.amount}|${row.description ?? ""}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

/** Chuẩn hoá giá trị ô ExcelJS (rich text / công thức / hyperlink) về giá trị thô. */
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

/**
 * V4.1 TC-04 — Chọn sheet dữ liệu: ưu tiên sheet tên "GiaoDich" nếu đủ cột;
 * không thì sheet ĐẦU TIÊN đủ cột bắt buộc. Không sheet nào đủ → báo thiếu cột
 * theo sheet đầu tiên (hoặc "GiaoDich" nếu có).
 */
export function selectDataSheet(workbook: ExcelJS.Workbook): {
  sheet: ExcelJS.Worksheet | null;
  headers: Record<string, number>;
  missing: string[];
} {
  const sheets = workbook.worksheets;
  const preferred = sheets.find((w) => normHeader(w.name) === "giaodich");
  const ordered = preferred ? [preferred, ...sheets.filter((w) => w !== preferred)] : sheets;
  for (const ws of ordered) {
    const headers = headerMapOf(ws);
    if (missingRequired(headers).length === 0) return { sheet: ws, headers, missing: [] };
  }
  const first = ordered[0];
  if (!first) {
    return { sheet: null, headers: {}, missing: REQUIRED_HEADERS.map((f) => HEADER_LABELS[f]) };
  }
  const headers = headerMapOf(first);
  return { sheet: null, headers, missing: missingRequired(headers) };
}

export interface FinanceImportRefs {
  /** Nguồn tiền ĐANG HOẠT ĐỘNG (TC-18) kèm số dư hiện tại (Q7 cảnh báo âm). */
  accounts: Array<{ id: string; code: string; name: string; currentBalance: string | number }>;
  categories: Array<{ id: string; code: string; name: string; direction: "IN" | "OUT" }>;
  suppliers: Array<{ id: string; code: string; name: string }>;
  /** dedupe_hash đã có trong DB. */
  existingHashes: Set<string>;
}

/** Phần THUẦN của import (không DB): đọc workbook + đối chiếu `refs`. */
export async function parseFinanceWorkbook(
  buffer: Buffer,
  refs: FinanceImportRefs,
): Promise<FinanceImportParseResult> {
  const fileHash = await computeSha256(buffer);
  const validRows: FinanceImportParseResult["validRows"] = [];
  const errors: FinanceImportRowError[] = [];
  const warnings: FinanceImportWarning[] = [];

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

  const picked = selectDataSheet(workbook);
  if (!picked.sheet) {
    return { fileHash, rowTotal: 0, validRows, errors, warnings, headerMismatch: picked.missing };
  }
  const headerMap = picked.headers;
  let rowTotal = 0;
  const occurrences = new Map<string, number>();
  const seenHash = new Set<string>();
  // Q7 — số dư chạy theo nguồn để cảnh báo âm (chỉ cảnh báo, không chặn).
  const running = new Map(refs.accounts.map((a) => [a.id, Number(a.currentBalance) || 0]));
  const warnedNegative = new Set<string>();

  picked.sheet.eachRow({ includeEmpty: false }, (row) => {
    if (row.number === 1) return;
    const getCell = (field: Field): unknown => {
      for (const alias of HEADER_ALIASES[field]) {
        const idx = headerMap[alias];
        if (idx) return cellRaw(row.getCell(idx).value);
      }
      return undefined;
    };

    const rawDate = getCell("ngayGd");
    const rawDirection = getCell("loai");
    const rawAccount = getCell("taiKhoan");
    const rawCategory = getCell("danhMuc");
    const rawAmount = getCell("soTien");
    const rawDesc = getCell("dienGiai");
    const rawSupplier = getCell("doiTuong");
    const rawRef = getCell("soChungTu");

    const isBlank = (v: unknown) => v === undefined || v === null || String(v).trim() === "";
    if ([rawDate, rawDirection, rawAccount, rawAmount, rawDesc].every(isBlank)) return;
    rowTotal++;

    const rowErrors: FinanceImportRowError[] = [];
    const transactionDate = parseImportDate(rawDate);
    if (!transactionDate) {
      rowErrors.push({
        rowNumber: row.number,
        field: "ngayGd",
        reason: "Ngày giao dịch không hợp lệ (dùng dd/mm/yyyy, ngày phải có thật).",
        rawValue: rawDate,
      });
    }
    const direction = normalizeDirection(rawDirection);
    if (!direction) {
      rowErrors.push({
        rowNumber: row.number,
        field: "loai",
        reason: 'Loại phải là "Thu" hoặc "Chi".',
        rawValue: rawDirection,
      });
    }
    const amount = parseImportAmount(rawAmount);
    if (amount === null || amount <= 0) {
      rowErrors.push({
        rowNumber: row.number,
        field: "soTien",
        reason: "Số tiền phải là số dương (VD 1.500.000 hoặc 1500000).",
        rawValue: rawAmount,
      });
    }
    const accountMatch = isBlank(rawAccount) ? null : matchExact(String(rawAccount), refs.accounts);
    if (isBlank(rawAccount)) {
      rowErrors.push({
        rowNumber: row.number,
        field: "taiKhoan",
        reason: "Thiếu nguồn thu/chi.",
        rawValue: rawAccount,
      });
    } else if (!accountMatch) {
      rowErrors.push({
        rowNumber: row.number,
        field: "taiKhoan",
        reason: `Không có nguồn đang hoạt động nào có mã hoặc tên đúng "${String(rawAccount)}" (xem sheet DanhMuc).`,
        rawValue: rawAccount,
      });
    }

    let categoryMatch: { id: string } | null = null;
    if (!isBlank(rawCategory)) {
      const pool = direction
        ? refs.categories.filter((c) => c.direction === direction)
        : refs.categories;
      categoryMatch = fuzzyFind(String(rawCategory), pool);
      if (!categoryMatch) {
        warnings.push({
          rowNumber: row.number,
          field: "danhMuc",
          reason: `Không khớp danh mục "${String(rawCategory)}" — để trống.`,
        });
      }
    }
    let supplierMatch: { id: string } | null = null;
    if (!isBlank(rawSupplier)) {
      supplierMatch = fuzzyFind(String(rawSupplier), refs.suppliers);
      if (!supplierMatch) {
        warnings.push({
          rowNumber: row.number,
          field: "doiTuong",
          reason: `Không khớp NCC/khách hàng "${String(rawSupplier)}" — bỏ qua, không chặn dòng.`,
        });
      }
    }

    if (rowErrors.length > 0) {
      errors.push(...rowErrors);
      return;
    }

    const description = isBlank(rawDesc) ? null : String(rawDesc).trim();
    const externalRef = isBlank(rawRef) ? null : String(rawRef).trim();
    const base = {
      accountId: accountMatch!.id,
      transactionDate: transactionDate!,
      direction: direction!,
      amount: amount!,
      externalRef,
      description,
    };
    const occKey = computeFinanceDedupeHash({ ...base, occurrence: -1 });
    const occurrence = occurrences.get(occKey) ?? 0;
    occurrences.set(occKey, occurrence + 1);
    const dedupeHash = computeFinanceDedupeHash({ ...base, occurrence });
    // File đã nhập bằng bản cũ (hash không có chiều) — coi lần xuất hiện đầu là trùng.
    const legacyHit =
      occurrence === 0 && refs.existingHashes.has(computeLegacyFinanceDedupeHash(base));
    const duplicate = refs.existingHashes.has(dedupeHash) || legacyHit || seenHash.has(dedupeHash);
    seenHash.add(dedupeHash);

    if (!duplicate) {
      const next = balanceAfter(running.get(accountMatch!.id) ?? 0, direction!, amount!);
      running.set(accountMatch!.id, next);
      if (next < -0.5 && !warnedNegative.has(accountMatch!.id)) {
        warnedNegative.add(accountMatch!.id);
        warnings.push({
          rowNumber: row.number,
          field: "taiKhoan",
          reason: `Nguồn "${accountMatch!.name}" sẽ âm ${formatVndFull(next)} từ dòng này (chỉ cảnh báo — vẫn nhập).`,
        });
      }
    }

    validRows.push({
      rowNumber: row.number,
      duplicate,
      data: {
        ...base,
        accountCode: accountMatch!.code,
        categoryId: categoryMatch?.id ?? null,
        supplierId: supplierMatch?.id ?? null,
        supplierNameRaw: isBlank(rawSupplier) ? null : String(rawSupplier),
        dedupeHash,
      },
    });
  });

  return { fileHash, rowTotal, validRows, errors, warnings, headerMismatch: [] };
}

/**
 * Parse file Excel giao dịch thu/chi — nạp danh mục đối chiếu từ DB 1 lần rồi
 * gọi phần thuần `parseFinanceWorkbook`.
 */
export async function parseFinanceTransactionImport(
  buffer: Buffer,
): Promise<FinanceImportParseResult> {
  const [accounts, categories, suppliers, hashes] = await Promise.all([
    db
      .select({
        id: finAccount.id,
        code: finAccount.code,
        name: finAccount.name,
        currentBalance: finAccount.currentBalance,
      })
      .from(finAccount)
      .where(eq(finAccount.isActive, true)),
    db
      .select({
        id: finCategory.id,
        code: finCategory.code,
        name: finCategory.name,
        direction: finCategory.direction,
      })
      .from(finCategory)
      .where(eq(finCategory.isActive, true)),
    db.select({ id: supplier.id, code: supplier.code, name: supplier.name }).from(supplier),
    db
      .select({ hash: finTransaction.dedupeHash })
      .from(finTransaction)
      .where(sql`${finTransaction.dedupeHash} IS NOT NULL`),
  ]);
  return parseFinanceWorkbook(buffer, {
    accounts,
    categories,
    suppliers,
    existingHashes: new Set(hashes.map((r) => r.hash as string)),
  });
}

/** Tạo file xlsx chứa danh sách lỗi (giống buildErrorWorkbook nhưng field finance). */
export async function buildFinanceErrorWorkbook(
  errors: FinanceImportRowError[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.columns = [
    { header: "Dòng", key: "rowNumber", width: 8 },
    { header: "Trường", key: "field", width: 20 },
    { header: "Lý do", key: "reason", width: 60 },
    { header: "Giá trị", key: "rawValue", width: 40 },
  ];
  for (const e of errors) {
    ws.addRow({
      rowNumber: e.rowNumber,
      field: e.field,
      reason: e.reason,
      rawValue: e.rawValue === undefined ? "" : String(e.rawValue ?? ""),
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/**
 * Template import (thuần) — sheet "GiaoDich" (header + 1 dòng ví dụ) + sheet
 * "HuongDan" + sheet "DanhMuc" (nguồn/danh mục hợp lệ hiện có).
 */
export async function buildFinanceTemplateWorkbook(
  accounts: Array<{ code: string; name: string }>,
  categories: Array<{ code: string; name: string; direction: "IN" | "OUT" }>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("GiaoDich");
  ws.addRow(FINANCE_IMPORT_HEADER.map((h) => HEADER_LABELS[h]));
  ws.addRow([
    "01/09/2026",
    "Chi",
    accounts[0]?.code ?? "TM01",
    categories.find((c) => c.direction === "OUT")?.code ?? "CHI_KHAC",
    "1500000",
    "Mua văn phòng phẩm",
    "",
    "",
  ]);
  ws.getRow(1).font = { bold: true };
  ws.columns.forEach((col) => {
    col.width = 22;
  });

  const guide = wb.addWorksheet("HuongDan");
  guide.addRow(["Cột", "Bắt buộc", "Ghi chú"]);
  guide.addRow(["Ngày GD", "Có", "Định dạng dd/mm/yyyy (ngày phải có thật)"]);
  guide.addRow(["Loại (Thu/Chi)", "Có", 'Ghi "Thu" hoặc "Chi" (không phân biệt hoa/thường)']);
  guide.addRow([
    "Nguồn",
    "Có",
    "Nguồn thu/chi: MÃ hoặc TÊN ĐÚNG của nguồn đang hoạt động — xem sheet DanhMuc (file cũ ghi cột 'Tài khoản' vẫn đọc được)",
  ]);
  guide.addRow(["Danh mục", "Không", "Mã hoặc tên danh mục — để trống nếu không rõ"]);
  guide.addRow(["Số tiền", "Có", "Số dương. VD 1500000, 1.500.000 hoặc 1234567.5"]);
  guide.addRow(["Diễn giải", "Không", "Mô tả tự do"]);
  guide.addRow([
    "Đối tượng (NCC/KH)",
    "Không",
    "Tên nhà cung cấp/khách hàng — không khớp thì để trống, không chặn dòng",
  ]);
  guide.addRow(["Số chứng từ/Ref", "Không", "Dùng để chống trùng khi import lại — nên điền nếu có"]);
  guide.addRow([]);
  guide.addRow([
    "Lưu ý",
    "",
    "Chi vượt số dư nguồn KHÔNG bị chặn khi import (dữ liệu lịch sử) — màn xem trước sẽ cảnh báo nguồn bị âm.",
  ]);
  guide.getRow(1).font = { bold: true };
  guide.columns.forEach((col) => {
    col.width = 26;
  });

  const dm = wb.addWorksheet("DanhMuc");
  dm.addRow(["Mã nguồn", "Tên nguồn"]);
  for (const a of accounts) dm.addRow([a.code, a.name]);
  dm.addRow([]);
  dm.addRow(["Mã danh mục", "Tên danh mục", "Chiều"]);
  for (const c of categories) dm.addRow([c.code, c.name, c.direction === "IN" ? "Thu" : "Chi"]);
  dm.getRow(1).font = { bold: true };
  dm.columns.forEach((col) => {
    col.width = 26;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** GET template — nạp nguồn/danh mục đang hoạt động rồi dựng file mẫu. */
export async function buildFinanceImportTemplate(): Promise<Buffer> {
  const [accounts, categories] = await Promise.all([
    db
      .select({ code: finAccount.code, name: finAccount.name })
      .from(finAccount)
      .where(eq(finAccount.isActive, true)),
    db
      .select({ code: finCategory.code, name: finCategory.name, direction: finCategory.direction })
      .from(finCategory)
      .where(eq(finCategory.isActive, true)),
  ]);
  return buildFinanceTemplateWorkbook(accounts, categories);
}
