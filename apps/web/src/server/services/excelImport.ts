import crypto from "node:crypto";
import { Readable } from "node:stream";
import ExcelJS from "exceljs";
import { itemImportRowSchema, type ItemImportRow } from "@iot/shared";

/** Header cần có trong Excel template item. Case-insensitive. */
export const ITEM_IMPORT_HEADER = [
  "sku",
  "name",
  "itemType",
  "uom",
  "category",
  "description",
  "minStockQty",
  "reorderQty",
  "leadTimeDays",
  "isLotTracked",
  "isSerialTracked",
  "barcode",
  "barcodeType",
  "supplierCode",
  "supplierSku",
  "priceRef",
  "moq",
  "packSize",
  "leadTimeDaysSupplier",
] as const;

export interface ImportRowError {
  rowNumber: number;
  field: string;
  reason: string;
  rawValue?: unknown;
}

export interface ParseResult {
  fileHash: string;
  rowTotal: number;
  validRows: Array<{ rowNumber: number; data: ItemImportRow }>;
  errors: ImportRowError[];
  headerMismatch: string[];
}

export async function computeSha256(buffer: Uint8Array): Promise<string> {
  const h = crypto.createHash("sha256");
  h.update(buffer);
  return h.digest("hex");
}

/** Normalize header string (trim, lowercase, remove non-alnum). */
function normHeader(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Parse xlsx từ Buffer bằng streaming để tránh OOM. */
export async function parseItemImport(
  buffer: Buffer,
): Promise<ParseResult> {
  const fileHash = await computeSha256(buffer);
  const validRows: ParseResult["validRows"] = [];
  const errors: ImportRowError[] = [];
  const seenSku = new Set<string>();
  const headerMismatch: string[] = [];

  const stream = Readable.from(buffer);
  const workbook = new ExcelJS.stream.xlsx.WorkbookReader(stream, {
    entries: "emit",
    sharedStrings: "cache",
    styles: "cache",
    worksheets: "emit",
  });

  let headerMap: Record<string, number> | null = null;
  let rowTotal = 0;

  for await (const worksheet of workbook) {
    for await (const row of worksheet) {
      if (row.number === 1) {
        const headers: Record<string, number> = {};
        row.eachCell((cell, colIdx) => {
          const v = typeof cell.value === "string" ? cell.value : String(cell.value ?? "");
          headers[normHeader(v)] = colIdx;
        });
        for (const h of ITEM_IMPORT_HEADER) {
          if (!(normHeader(h) in headers)) headerMismatch.push(h);
        }
        headerMap = headers;
        continue;
      }

      if (!headerMap) continue;
      rowTotal++;

      const getCell = (field: string): unknown => {
        const idx = headerMap![normHeader(field)];
        if (!idx) return undefined;
        const cell = row.getCell(idx);
        const v = cell.value;
        if (v === null || v === undefined) return undefined;
        if (typeof v === "object" && "text" in (v as unknown as Record<string, unknown>)) {
          return (v as { text: string }).text;
        }
        if (typeof v === "object" && "result" in (v as unknown as Record<string, unknown>)) {
          return (v as { result: unknown }).result;
        }
        return v;
      };

      const raw: Record<string, unknown> = {};
      for (const h of ITEM_IMPORT_HEADER) {
        raw[h] = getCell(h);
      }

      const parsed = itemImportRowSchema.safeParse(raw);
      if (!parsed.success) {
        for (const issue of parsed.error.issues) {
          errors.push({
            rowNumber: row.number,
            field: issue.path.join(".") || "_",
            reason: issue.message,
            rawValue: raw[issue.path[0] as string],
          });
        }
        continue;
      }

      if (seenSku.has(parsed.data.sku)) {
        errors.push({
          rowNumber: row.number,
          field: "sku",
          reason: `SKU "${parsed.data.sku}" trùng trong file`,
          rawValue: parsed.data.sku,
        });
        continue;
      }
      seenSku.add(parsed.data.sku);

      validRows.push({ rowNumber: row.number, data: parsed.data });
    }
  }

  return { fileHash, rowTotal, validRows, errors, headerMismatch };
}

/** Tạo file xlsx chứa danh sách lỗi. Trả Buffer để stream xuống client/R2. */
export async function buildErrorWorkbook(
  errors: ImportRowError[],
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Errors");
  ws.columns = [
    { header: "Row", key: "rowNumber", width: 8 },
    { header: "Field", key: "field", width: 24 },
    { header: "Reason", key: "reason", width: 60 },
    { header: "Value", key: "rawValue", width: 40 },
  ];
  for (const e of errors) {
    ws.addRow({
      rowNumber: e.rowNumber,
      field: e.field,
      reason: e.reason,
      rawValue:
        e.rawValue === undefined ? "" : String(e.rawValue ?? ""),
    });
  }
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Tạo template import mẫu (header + 1 row example). */
export async function buildImportTemplate(): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow([...ITEM_IMPORT_HEADER]);
  ws.addRow([
    "RM-0001",
    "Thép tấm S45C 10mm",
    "RAW",
    "KG",
    "Thép tấm",
    "Nhập từ Nhật Bản",
    100,
    500,
    14,
    false,
    false,
    "8934567890123",
    "EAN13",
    "NCC-001",
    "S45C-10",
    45000,
    1,
    1,
    14,
  ]);
  ws.getRow(1).font = { bold: true };
  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}
