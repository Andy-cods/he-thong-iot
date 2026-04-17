import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  buildImportTemplate,
  computeSha256,
  parseItemImport,
  ITEM_IMPORT_HEADER,
} from "./excelImport";

async function buildWorkbook(
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("items");
  ws.addRow([...ITEM_IMPORT_HEADER]);
  for (const r of rows) {
    ws.addRow(ITEM_IMPORT_HEADER.map((h) => r[h] ?? null));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("computeSha256", () => {
  it("ổn định với cùng input", async () => {
    const a = await computeSha256(Buffer.from("hello"));
    const b = await computeSha256(Buffer.from("hello"));
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it("khác nhau với input khác", async () => {
    const a = await computeSha256(Buffer.from("a"));
    const b = await computeSha256(Buffer.from("b"));
    expect(a).not.toBe(b);
  });
});

describe("parseItemImport", () => {
  it("parse row hợp lệ, trả fileHash + validRows", async () => {
    const buf = await buildWorkbook([
      {
        sku: "RM-0001",
        name: "Thép tấm",
        itemType: "RAW",
        uom: "KG",
        minStockQty: 100,
        reorderQty: 500,
        leadTimeDays: 14,
        isLotTracked: false,
        isSerialTracked: false,
        barcode: "8934567890123",
        barcodeType: "EAN13",
        supplierCode: "NCC-001",
        moq: 1,
        packSize: 1,
      },
    ]);
    const res = await parseItemImport(buf);
    expect(res.headerMismatch).toEqual([]);
    expect(res.rowTotal).toBe(1);
    expect(res.validRows).toHaveLength(1);
    expect(res.errors).toEqual([]);
    expect(res.fileHash).toMatch(/^[0-9a-f]{64}$/);
    expect(res.validRows[0]?.data.sku).toBe("RM-0001");
  });

  it("bắt lỗi duplicate SKU trong file", async () => {
    const buf = await buildWorkbook([
      { sku: "AB-01", name: "x", itemType: "RAW", uom: "KG" },
      { sku: "ab-01", name: "y", itemType: "RAW", uom: "KG" },
    ]);
    const res = await parseItemImport(buf);
    expect(res.validRows).toHaveLength(1);
    expect(res.errors.some((e) => e.reason.includes("trùng"))).toBe(true);
  });

  it("bắt lỗi itemType không hợp lệ", async () => {
    const buf = await buildWorkbook([
      { sku: "AB-01", name: "x", itemType: "INVALID", uom: "KG" },
    ]);
    const res = await parseItemImport(buf);
    expect(res.errors.length).toBeGreaterThan(0);
    expect(res.validRows).toHaveLength(0);
  });
});

describe("buildImportTemplate", () => {
  it("tạo template có đủ header", async () => {
    const buf = await buildImportTemplate();
    const wb = new ExcelJS.Workbook();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await wb.xlsx.load(buf as any);
    const ws = wb.getWorksheet("items");
    expect(ws).toBeDefined();
    const headerRow = ws!.getRow(1);
    const cells: string[] = [];
    headerRow.eachCell((cell) => cells.push(String(cell.value)));
    for (const h of ITEM_IMPORT_HEADER) {
      expect(cells).toContain(h);
    }
  });
});
