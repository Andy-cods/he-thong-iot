import { readFileSync } from "node:fs";
import path from "node:path";
import ExcelJS from "exceljs";
import { beforeAll, describe, expect, it } from "vitest";
import { bomLineTotalQty, buildBomLineValues, type CommitRow } from "@iot/shared";
import { parseBomImport } from "./bomImportParser";
import type { TrienKhaiParse } from "./bomTrienKhaiParser";

/**
 * Fixture cắt từ file thật Z0000002-618824 (BOM TRIỂN KHAI, "Số bộ = 4"): dòng 1–4
 * + 8 dòng dữ liệu + 1 dòng cuối, giá trị tĩnh, không ảnh.
 */
const FIXTURE = path.join(__dirname, "__fixtures__", "bom-trien-khai-Z0000002-618824-trim.xlsx");

async function reparse(mutate: (ws: ExcelJS.Worksheet) => void): Promise<TrienKhaiParse> {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(readFileSync(FIXTURE) as unknown as ArrayBuffer);
  mutate(wb.worksheets[0]!);
  const buf = Buffer.from(await wb.xlsx.writeBuffer());
  const res = await parseBomImport(buf);
  return res.trienKhai!;
}

let tk: TrienKhaiParse;
beforeAll(async () => {
  tk = (await parseBomImport(readFileSync(FIXTURE))).trienKhai!;
});

describe("BOM TRIỂN KHAI — số lượng (file 618824)", () => {
  it("đọc Số bộ = 4 từ ghi chú dòng 2; Hệ số / SL đúng cột", () => {
    expect(tk.projectCode).toBe("Z0000002-618824");
    expect(tk.setCountNote).toBe(4);
    expect(tk.setCount).toBe(4);
    expect(tk.setCountSource).toBe("NOTE");
    const cp3 = tk.rows.find((r) => r.position === "CP3")!;
    expect(cp3.rowNumber).toBe(7);
    expect(cp3.coef).toBe(6);
    expect(cp3.qty).toBe(24);
    // file nhất quán: SL = Hệ số × 4 ở mọi dòng → không cảnh báo
    for (const r of tk.rows) expect(r.qty).toBe((r.coef ?? 0) * 4);
    expect(tk.qtyWarnings).toEqual([]);
  });

  it("commit → qty_per_parent = Hệ số (6), lưới SL = 6 × 4 = 24 = SL file", () => {
    const cp3 = tk.rows.find((r) => r.position === "CP3")!;
    const v = buildBomLineValues({ ...cp3, assetId: null, fullUrl: null } as CommitRow, {
      templateId: "t",
      sheetId: "s",
      componentItemId: "i",
      position: 1,
      batchId: "b",
      supplierId: null,
      setCount: tk.setCount,
    });
    expect(v.qtyPerParent).toBe("6");
    expect(v.coef).toBe("6");
    expect(v.metadata.fileQty).toBe(24);
    expect(bomLineTotalQty(v.metadata, v.qtyPerParent, tk.setCount)).toBe(24);
    for (const r of tk.rows) {
      const lv = buildBomLineValues({ ...r, assetId: null, fullUrl: null } as CommitRow, {
        templateId: "t", sheetId: "s", componentItemId: "i", position: 1, batchId: "b", supplierId: null, setCount: tk.setCount,
      });
      expect(bomLineTotalQty(lv.metadata, lv.qtyPerParent, tk.setCount), r.position).toBe(r.qty);
    }
  });

  it("thiếu 'Số bộ = N' → suy ra 4 từ SL ÷ Hệ số và báo trong cảnh báo", async () => {
    const t = await reparse((ws) => {
      ws.getRow(2).getCell(1).value = "Bóc từ 3D. SL = Hệ số × số bộ.";
    });
    expect(t.setCountNote).toBeNull();
    expect(t.setCount).toBe(4);
    expect(t.setCountSource).toBe("INFERRED");
    expect(t.warnings[0]).toMatch(/suy ra Số bộ = 4/);
  });

  it("thiếu ghi chú + tỉ lệ không đồng nhất → Số bộ 1 + cảnh báo kiểm tra", async () => {
    const t = await reparse((ws) => {
      ws.getRow(2).getCell(1).value = "";
      ws.getRow(7).getCell(15).value = 30; // CP3: 30 / 6 = 5 ≠ 4
    });
    expect(t.setCount).toBe(1);
    expect(t.setCountSource).toBe("DEFAULT");
    expect(t.warnings[0]).toMatch(/tạm dùng Số bộ = 1/);
  });

  it("SL file ≠ Hệ số × Số bộ → cảnh báo (không chặn), hệ thống dùng Hệ số", async () => {
    const t = await reparse((ws) => {
      ws.getRow(7).getCell(15).value = 20; // CP3: Hệ số 6, 4 bộ → phải 24
    });
    expect(t.setCount).toBe(4);
    expect(t.qtyWarnings).toHaveLength(1);
    expect(t.qtyWarnings[0]).toBe(
      "Dòng 7 (CP3): SL file 20 ≠ Hệ số 6 × Số bộ 4 = 24 — hệ thống dùng Hệ số 6/bộ (tổng 24).",
    );
  });
});
