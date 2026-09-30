/**
 * V4.3 Việc 1 — Import Excel "Vị trí mặc định vật tư": validate SKU/mã ô
 * CHÍNH XÁC, báo lỗi từng dòng, không ghi gì (phần thuần, không chạm DB).
 */
import ExcelJS from "exceljs";
import { describe, expect, it, vi } from "vitest";

import { parseDefaultBinImportFile, type DefaultBinImportRefs } from "./defaultBinImport";

vi.mock("@/lib/db", () => ({ db: {} }));

const ITEM_A = { id: "item-a", sku: "SKU-A", name: "Vật tư A", isActive: true };
const ITEM_B = { id: "item-b", sku: "SKU-B", name: "Vật tư B", isActive: true };
const ITEM_INACTIVE = { id: "item-c", sku: "SKU-C", name: "Vật tư C (ngừng)", isActive: false };
const BIN_1 = { id: "bin-1", fullCode: "A-01-1-01", isActive: true };
const BIN_2 = { id: "bin-2", fullCode: "A-02-1-01", isActive: true };
const BIN_INACTIVE = { id: "bin-3", fullCode: "A-03-1-01", isActive: false };

function refs(): DefaultBinImportRefs {
  return { items: [ITEM_A, ITEM_B, ITEM_INACTIVE], bins: [BIN_1, BIN_2, BIN_INACTIVE] };
}

async function workbookOf(rows: unknown[][]) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Data");
  rows.forEach((r) => ws.addRow(r));
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe("parseDefaultBinImportFile", () => {
  it("thiếu cột bắt buộc → headerMismatch", async () => {
    const buf = await workbookOf([["Cột lạ"], ["x"]]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.headerMismatch.length).toBeGreaterThan(0);
  });

  it("dòng hợp lệ (có vị trí) → validRows đúng, không lỗi", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-A", "A-01-1-01"],
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.errors).toHaveLength(0);
    expect(r.validRows).toHaveLength(1);
    expect(r.validRows[0]).toMatchObject({ itemId: "item-a", binId: "bin-1" });
  });

  it("khớp mã vật tư không phân biệt hoa/thường + khoảng trắng thừa", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      [" sku-a ", " a-01-1-01 "],
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.errors).toHaveLength(0);
    expect(r.validRows[0]?.itemId).toBe("item-a");
  });

  it("để trống cột vị trí → hợp lệ, binId=null (ý nghĩa: xoá vị trí mặc định)", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-A", ""],
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.errors).toHaveLength(0);
    expect(r.validRows[0]?.binId).toBeNull();
  });

  it("mã vật tư không tồn tại / không active → lỗi dòng đó, không chặn dòng khác", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-KHONG-CO", "A-01-1-01"],
      ["SKU-C", "A-01-1-01"], // tồn tại nhưng inactive
      ["SKU-B", "A-02-1-01"], // dòng hợp lệ
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]?.rowNumber).toBe(2);
    expect(r.errors[1]?.rowNumber).toBe(3);
    expect(r.validRows).toHaveLength(1);
    expect(r.validRows[0]?.itemId).toBe("item-b");
  });

  it("mã vị trí không tồn tại / không active → lỗi dòng đó", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-A", "KHONG-TON-TAI"],
      ["SKU-B", "A-03-1-01"], // tồn tại nhưng inactive
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.errors).toHaveLength(2);
    expect(r.validRows).toHaveLength(0);
  });

  it("trùng SKU trong file → chỉ dòng đầu áp dụng, dòng sau báo lỗi", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-A", "A-01-1-01"],
      ["SKU-A", "A-02-1-01"],
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.validRows).toHaveLength(1);
    expect(r.errors).toHaveLength(1);
    expect(r.errors[0]?.rowNumber).toBe(3);
  });

  it("dòng trống hoàn toàn bị bỏ qua, không tính vào rowTotal", async () => {
    const buf = await workbookOf([
      ["Mã vật tư", "Vị trí mặc định"],
      ["SKU-A", "A-01-1-01"],
      ["", ""],
      ["SKU-B", "A-02-1-01"],
    ]);
    const r = await parseDefaultBinImportFile(buf, refs());
    expect(r.rowTotal).toBe(2);
    expect(r.validRows).toHaveLength(2);
  });
});
