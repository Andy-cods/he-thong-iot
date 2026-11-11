import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { parseBomImport } from "./bomImportParser";
import type { TrienKhaiParse } from "./bomTrienKhaiParser";

const FIXTURE = path.join(__dirname, "__fixtures__", "bom-trien-khai-Z0000002590422.xlsx");
const sha = (b: Buffer) => createHash("sha256").update(b).digest("hex");

let tk: TrienKhaiParse;
let buf: Buffer;

beforeAll(async () => {
  buf = readFileSync(FIXTURE);
  const res = await parseBomImport(buf);
  expect(res.trienKhai).toBeDefined();
  tk = res.trienKhai!;
});

describe("parseBomImport — mẫu BOM triển khai", () => {
  it("meta dự án", () => {
    expect(tk.projectCode).toBe("Z0000002590422");
    expect(tk.title).toContain("CTQ AVI TOP Conveyor 320mm");
    expect(tk.setCount).toBe(1);
    expect(tk.headerRow).toBe(4);
  });

  it("đúng 33 dòng, bỏ dòng TỔNG", () => {
    expect(tk.rows).toHaveLength(33);
    expect(tk.rows[0]!.position).toBe("BL1");
    expect(tk.rows[32]!.position).toBe("BL33");
    expect(tk.rows.some((r) => /tổng/i.test(r.file3dName))).toBe(false);
    expect(tk.rows[32]!.rowNumber).toBe(37);
  });

  it("32 ảnh gán đúng BL1..BL32 theo hàng chứa ảnh, BL33 không ảnh", async () => {
    expect(tk.images).toHaveLength(32);
    tk.rows.slice(0, 32).forEach((r, i) => {
      expect(r.imageIndex, r.position).not.toBeNull();
      expect(tk.images[r.imageIndex!]!.rowNumber).toBe(i + 5);
    });
    expect(tk.rows[32]!.imageIndex).toBeNull();
    // mỗi ảnh dùng đúng 1 lần
    expect(new Set(tk.rows.map((r) => r.imageIndex).filter((x) => x !== null)).size).toBe(32);

    // BL1: ảnh có anchor from.row (0-based) = 3 (rowOff 475200)
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("BOM")!;
    const anchor3 = ws
      .getImages()
      .find((im) => (im.range.tl as unknown as { nativeRow: number }).nativeRow === 3)!;
    const expected = Buffer.from(wb.getImage(Number(anchor3.imageId)).buffer as unknown as Buffer);
    expect(sha(tk.images[tk.rows[0]!.imageIndex!]!.buffer)).toBe(sha(expected));
    // BL2 phải là ảnh khác BL1 (không lệch 1 hàng)
    expect(tk.rows[1]!.imageIndex).not.toBe(tk.rows[0]!.imageIndex);
  });

  it("12 dòng NCC pending, GTAM đơn không pending", () => {
    const pending = tk.rows.filter((r) => r.supplierPending);
    expect(pending).toHaveLength(12);
    expect(tk.rows[0]!.supplierText).toBe("GTAM");
    expect(tk.rows[0]!.supplierPending).toBe(false);
    const bl33 = tk.rows[32]!;
    expect(bl33.supplierNames).toEqual(["Thế Long", "Sandi"]);
    expect(pending.some((r) => r.supplierText === "Tân Tiến/Phạm Gia")).toBe(true);
  });

  it("PIC Hòa/Đức tách 2 tên", () => {
    expect(tk.rows[32]!.picNames).toEqual(["Hòa", "Đức"]);
    expect(tk.rows[0]!.picNames).toEqual(["Cường"]);
  });

  it("category đúng 3 nhóm, BL2 dims 320×200×12, ô xuống dòng được chuẩn hoá", () => {
    const cats = new Set(tk.rows.map((r) => r.category));
    expect(cats).toEqual(new Set(["GTAM", "OUTSOURCED", "COMMERCIAL"]));
    expect(tk.rows[0]!.category).toBe("GTAM");
    expect(tk.rows[32]!.category).toBe("COMMERCIAL");
    expect(tk.rows[1]!.dims).toEqual({ l: 320, w: 200, h: 12 });
    expect(tk.rows[32]!.dims).toBeNull();
    expect(tk.rows.some((r) => r.blankSpec?.includes("\n"))).toBe(false);
    expect(tk.rows.some((r) => r.blankSpec === "HTPA18S5M100-A-N8-FC30.0")).toBe(true);
    expect(tk.rows[0]!.qty).toBe(1);
    expect(tk.rows[0]!.coef).toBe(1);
  });
});

describe("hồi quy — đường 'Bản chính thức' không bị nhánh mới bắt", () => {
  it("workbook header kiểu Image/ID Number không nhận là TRIEN_KHAI", async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet("BOM");
    ws.addRow(["Z0000002-502653_BANG TAI"]);
    ws.addRow(["Image", "ID Number", "Quantity", "Standard Number", "Sub Category", "Note 1"]);
    ws.addRow(["", "1", 2, "ABC", "Cat", "x"]);
    const b = Buffer.from(await wb.xlsx.writeBuffer());
    const res = await parseBomImport(b);
    expect(res.trienKhai).toBeUndefined();
    expect(res.sheets[0]!.headersDetected).toContain("ID Number");
  });
});
