import crypto from "node:crypto";
import ExcelJS from "exceljs";
import { and, eq, gte, lte, sql } from "drizzle-orm";
import { finAccount, finCategory, finTransaction, supplier } from "@iot/db/schema";
import { db } from "@/lib/db";
import { computeSha256 } from "./excelImport";

/**
 * Phase D — Import Excel giao dịch thu/chi (`fin_transaction`). Bám khuôn
 * `excelImport.ts` (parseItemImport/buildErrorWorkbook/buildImportTemplate)
 * nhưng viết file RIÊNG (KHÔNG sửa excelImport.ts) để tránh xung đột logic
 * item/bom, theo đúng chỉ định plans/v4-finance/wave-2-finance.md §D.3.
 *
 * Khác biệt so với parseItemImport: cột KHÔNG hard-code index (đọc theo
 * header row), fuzzy match account/category/supplier theo code HOẶC tên
 * (không cần pg_trgm — dữ liệu nhỏ, so sánh JS đủ nhanh), dedupe hash tính
 * TRƯỚC khi insert (unique index `fin_transaction_dedupe_uk`).
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

const HEADER_LABELS: Record<(typeof FINANCE_IMPORT_HEADER)[number], string> = {
  ngayGd: "Ngày GD",
  loai: "Loại (Thu/Chi)",
  taiKhoan: "Tài khoản",
  danhMuc: "Danh mục",
  soTien: "Số tiền",
  dienGiai: "Diễn giải",
  doiTuong: "Đối tượng (NCC/KH)",
  soChungTu: "Số chứng từ/Ref",
};

// Cột bắt buộc (2 cột optional: danhMuc, doiTuong, soChungTu, dienGiai — không
// chặn header mismatch nếu thiếu các cột optional, chỉ báo thiếu cột BẮT BUỘC).
const REQUIRED_HEADERS: Array<(typeof FINANCE_IMPORT_HEADER)[number]> = [
  "ngayGd",
  "loai",
  "taiKhoan",
  "soTien",
];

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

function normHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // bỏ dấu tiếng Việt
    .replace(/[^a-z0-9]/g, "");
}

// Alias chấp nhận cho từng field — người dùng có thể đặt tên cột theo tiếng
// Việt có dấu/không dấu, khớp bảng mô tả ở wave-2-finance.md §D.3.
const HEADER_ALIASES: Record<(typeof FINANCE_IMPORT_HEADER)[number], string[]> = {
  ngayGd: ["ngaygd", "ngay", "ngaygiaodich", "date"],
  loai: ["loai", "loaithuchi", "direction", "thuchi"],
  taiKhoan: ["taikhoan", "tk", "account", "maTaiKhoan".toLowerCase()],
  danhMuc: ["danhmuc", "category", "madanhmuc"],
  soTien: ["sotien", "amount", "sotienthucthu"],
  dienGiai: ["diengiai", "description", "noidung", "ghichu"],
  doiTuong: ["doituong", "doituongnccc", "supplier", "khachhang", "ncckh"],
  soChungTu: ["sochungtu", "ref", "externalref", "sohoadon", "sochungtungoai"],
};

function excelDateToISO(value: unknown): string | null {
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number") {
    // Excel serial date (epoch 1899-12-30).
    const ms = Math.round((value - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString().slice(0, 10);
  }
  if (typeof value === "string") {
    const s = value.trim();
    // dd/mm/yyyy hoặc dd-mm-yyyy
    const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
    if (m) {
      const [, dd, mm, yyyy] = m;
      const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
      if (Number.isNaN(d.getTime())) return null;
      return d.toISOString().slice(0, 10);
    }
    // yyyy-mm-dd (đã chuẩn ISO)
    const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m2) return s;
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  }
  return null;
}

function normalizeDirection(value: unknown): "IN" | "OUT" | null {
  const s = String(value ?? "").trim().toLowerCase();
  if (!s) return null;
  if (["thu", "in", "income", "receipt"].includes(s)) return "IN";
  if (["chi", "out", "expense", "payment"].includes(s)) return "OUT";
  return null;
}

function parseAmount(value: unknown): number | null {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    // Bỏ dấu phẩy/dấu chấm ngăn cách nghìn, giữ lại dấu thập phân cuối nếu có.
    const cleaned = value.trim().replace(/[^\d.,-]/g, "");
    if (!cleaned) return null;
    // Ưu tiên coi dấu phẩy/chấm là ngăn cách nghìn (VND không lẻ) — bỏ hết.
    const noThousand = cleaned.replace(/[.,]/g, "");
    const n = Number(noThousand);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

/** Fuzzy match: so khớp chính xác code trước, sau đó contains theo tên (case-insensitive, bỏ dấu). */
function fuzzyFind<T extends { id: string; code?: string; name: string }>(
  needle: string,
  candidates: T[],
): T | null {
  const n = normHeader(needle);
  if (!n) return null;
  const byCode = candidates.find((c) => c.code && normHeader(c.code) === n);
  if (byCode) return byCode;
  const byNameExact = candidates.find((c) => normHeader(c.name) === n);
  if (byNameExact) return byNameExact;
  const byNameContains = candidates.find(
    (c) => normHeader(c.name).includes(n) || n.includes(normHeader(c.name)),
  );
  return byNameContains ?? null;
}

export function computeFinanceDedupeHash(row: {
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

/**
 * Parse file Excel giao dịch thu/chi. Đọc toàn bộ `fin_account`/`fin_category`/
 * `supplier` 1 lần để fuzzy match trong bộ nhớ (dữ liệu nhỏ — vài trăm dòng).
 */
export async function parseFinanceTransactionImport(
  buffer: Buffer,
): Promise<FinanceImportParseResult> {
  const fileHash = await computeSha256(buffer);
  const validRows: FinanceImportParseResult["validRows"] = [];
  const errors: FinanceImportRowError[] = [];
  const warnings: FinanceImportWarning[] = [];
  const headerMismatch: string[] = [];

  const [accounts, categories, suppliers] = await Promise.all([
    db.select({ id: finAccount.id, code: finAccount.code, name: finAccount.name }).from(finAccount),
    db
      .select({ id: finCategory.id, code: finCategory.code, name: finCategory.name, direction: finCategory.direction })
      .from(finCategory),
    db.select({ id: supplier.id, code: supplier.code, name: supplier.name }).from(supplier),
  ]);

  // Dedupe hash đã tồn tại trong DB (để đánh dấu "trùng, sẽ bỏ qua" ở preview
  // — KHÔNG phải lỗi, xem wave-2-finance.md §D.1 dedupe).
  const existingHashes = new Set(
    (
      await db
        .select({ hash: finTransaction.dedupeHash })
        .from(finTransaction)
        .where(sql`${finTransaction.dedupeHash} IS NOT NULL`)
    ).map((r) => r.hash as string),
  );

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(Uint8Array.from(buffer).buffer);

  let headerMap: Record<string, number> | null = null;
  let rowTotal = 0;
  const seenHashInFile = new Set<string>();

  for (const worksheet of workbook.worksheets) {
    worksheet.eachRow({ includeEmpty: false }, (row) => {
      if (row.number === 1) {
        const headers: Record<string, number> = {};
        row.eachCell((cell, colIdx) => {
          const rawValue = cell.value;
          const v = typeof rawValue === "string" ? rawValue : String(rawValue ?? "");
          headers[normHeader(v)] = colIdx;
        });
        for (const field of REQUIRED_HEADERS) {
          const found = HEADER_ALIASES[field].some((alias) => normHeader(alias) in headers);
          if (!found) headerMismatch.push(HEADER_LABELS[field]);
        }
        headerMap = headers;
        return;
      }

      if (!headerMap || headerMismatch.length > 0) return;
      rowTotal++;

      const getCell = (field: (typeof FINANCE_IMPORT_HEADER)[number]): unknown => {
        for (const alias of HEADER_ALIASES[field]) {
          const idx = headerMap![normHeader(alias)];
          if (idx) {
            const cell = row.getCell(idx);
            const v = cell.value;
            if (v === null || v === undefined) return undefined;
            if (typeof v === "object" && "text" in (v as unknown as Record<string, unknown>)) {
              return (v as unknown as { text: string }).text;
            }
            if (typeof v === "object" && "result" in (v as unknown as Record<string, unknown>)) {
              return (v as unknown as { result: unknown }).result;
            }
            return v;
          }
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

      const rowErrors: FinanceImportRowError[] = [];

      const transactionDate = excelDateToISO(rawDate);
      if (!transactionDate) {
        rowErrors.push({
          rowNumber: row.number,
          field: "ngayGd",
          reason: "Ngày giao dịch không hợp lệ (dùng dd/mm/yyyy).",
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

      const amount = parseAmount(rawAmount);
      if (amount === null || amount <= 0) {
        rowErrors.push({
          rowNumber: row.number,
          field: "soTien",
          reason: "Số tiền phải là số dương.",
          rawValue: rawAmount,
        });
      }

      const accountMatch = rawAccount
        ? fuzzyFind(String(rawAccount), accounts)
        : null;
      if (!rawAccount) {
        rowErrors.push({
          rowNumber: row.number,
          field: "taiKhoan",
          reason: "Thiếu tài khoản.",
          rawValue: rawAccount,
        });
      } else if (!accountMatch) {
        rowErrors.push({
          rowNumber: row.number,
          field: "taiKhoan",
          reason: `Không khớp tài khoản nào với "${String(rawAccount)}".`,
          rawValue: rawAccount,
        });
      }

      let categoryMatch: { id: string; code: string; name: string } | null = null;
      if (rawCategory) {
        const found = fuzzyFind(String(rawCategory), categories);
        if (!found) {
          warnings.push({
            rowNumber: row.number,
            field: "danhMuc",
            reason: `Không khớp danh mục "${String(rawCategory)}" — để trống.`,
          });
        } else {
          categoryMatch = found;
        }
      }

      let supplierMatch: { id: string; code: string; name: string } | null = null;
      if (rawSupplier) {
        const found = fuzzyFind(String(rawSupplier), suppliers);
        if (!found) {
          warnings.push({
            rowNumber: row.number,
            field: "doiTuong",
            reason: `Không khớp NCC/khách hàng "${String(rawSupplier)}" — bỏ qua, không chặn dòng.`,
          });
        } else {
          supplierMatch = found;
        }
      }

      if (rowErrors.length > 0) {
        errors.push(...rowErrors);
        return;
      }

      const description = rawDesc ? String(rawDesc).trim() : null;
      const externalRef = rawRef ? String(rawRef).trim() : null;

      const dedupeHash = computeFinanceDedupeHash({
        accountId: accountMatch!.id,
        transactionDate: transactionDate!,
        amount: amount!,
        externalRef,
        description,
      });

      const duplicate = existingHashes.has(dedupeHash) || seenHashInFile.has(dedupeHash);
      seenHashInFile.add(dedupeHash);

      validRows.push({
        rowNumber: row.number,
        duplicate,
        data: {
          transactionDate: transactionDate!,
          direction: direction!,
          accountId: accountMatch!.id,
          accountCode: accountMatch!.code,
          categoryId: categoryMatch?.id ?? null,
          amount: amount!,
          description,
          supplierId: supplierMatch?.id ?? null,
          supplierNameRaw: rawSupplier ? String(rawSupplier) : null,
          externalRef,
          dedupeHash,
        },
      });
    });
  }

  return { fileHash, rowTotal, validRows, errors, warnings, headerMismatch };
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
 * Tạo template import mẫu — sheet "GiaoDich" (header + 1 dòng ví dụ) + sheet
 * "HuongDan" (mô tả cột) + sheet "DanhMuc" (liệt kê mã tài khoản/danh mục hợp
 * lệ hiện có trong DB để người dùng điền đúng).
 */
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

  const wb = new ExcelJS.Workbook();

  const ws = wb.addWorksheet("GiaoDich");
  ws.addRow(FINANCE_IMPORT_HEADER.map((h) => HEADER_LABELS[h]));
  ws.addRow([
    "01/09/2026",
    "Chi",
    accounts[0]?.code ?? "TM01",
    categories.find((c) => c.direction === "OUT")?.code ?? "CHI_VANHANH",
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
  guide.addRow(["Ngày GD", "Có", "Định dạng dd/mm/yyyy"]);
  guide.addRow(["Loại (Thu/Chi)", "Có", 'Ghi "Thu" hoặc "Chi" (không phân biệt hoa/thường)']);
  guide.addRow(["Tài khoản", "Có", "Mã hoặc tên tài khoản — xem sheet DanhMuc"]);
  guide.addRow(["Danh mục", "Không", "Mã hoặc tên danh mục — để trống nếu không rõ"]);
  guide.addRow(["Số tiền", "Có", "Số dương, có thể có dấu , hoặc . ngăn cách nghìn"]);
  guide.addRow(["Diễn giải", "Không", "Mô tả tự do"]);
  guide.addRow(["Đối tượng (NCC/KH)", "Không", "Tên nhà cung cấp/khách hàng — fuzzy match, không chặn nếu không khớp"]);
  guide.addRow(["Số chứng từ/Ref", "Không", "Dùng để chống trùng khi import lại — nên điền nếu có"]);
  guide.getRow(1).font = { bold: true };
  guide.columns.forEach((col) => {
    col.width = 26;
  });

  const dm = wb.addWorksheet("DanhMuc");
  dm.addRow(["Mã tài khoản", "Tên tài khoản"]);
  for (const a of accounts) dm.addRow([a.code, a.name]);
  dm.addRow([]);
  dm.addRow(["Mã danh mục", "Tên danh mục", "Chiều"]);
  for (const c of categories) dm.addRow([c.code, c.name, c.direction]);
  dm.getRow(1).font = { bold: true };
  dm.columns.forEach((col) => {
    col.width = 26;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
