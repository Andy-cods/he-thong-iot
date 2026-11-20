import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildShiftOutputWorkbook, type ExcelEntryRow } from "./shiftOutputExcel";

const row = (p: Partial<ExcelEntryRow> = {}): ExcelEntryRow => ({
  id: "e1",
  prodDate: "2026-11-18",
  shiftId: "ca1",
  shiftCode: "CA1",
  shiftName: "Ca 1",
  shiftStart: "08:00:00",
  shiftEnd: "12:00:00",
  machineId: "m1",
  machineCode: "CNC-01",
  machineName: "Máy 1",
  partId: "p1",
  partCode: "TRUC-D20",
  partName: "Trục D20",
  customerName: null,
  operatorId: null,
  operatorName: "Hùng",
  qtyOk: 480,
  qtyNg: 12,
  qtyPlanned: 500,
  qtyRework: null,
  downtimeMin: 20,
  shiftMinutes: 240,
  materialLot: null,
  notes: null,
  ...p,
});

describe("buildShiftOutputWorkbook (V4.10)", () => {
  it("P2 — cột Giờ chạy + Phút chạy: thực tế nếu có, không thì giờ ca", async () => {
    const buf = await buildShiftOutputWorkbook({
      siteName: "Đông Anh",
      from: "2026-11-18",
      to: "2026-11-18",
      entries: [
        row({ workStart: "07:00:00", workEnd: "19:00:00", shiftMinutes: 720 }),
        row({ id: "e2", machineId: "m2", machineCode: "CNC-02" }),
      ],
      defects: [],
      downtimes: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Chi tiết")!;
    expect(ws.getRow(4).getCell(17).value).toBe("Giờ chạy");
    expect([ws.getRow(5).getCell(17).value, ws.getRow(5).getCell(18).value]).toEqual(["07:00–19:00", 720]);
    expect([ws.getRow(6).getCell(17).value, ws.getRow(6).getCell(18).value]).toEqual(["08:00–12:00", 240]);
  });

  it("2 sheet Chi tiết + Tổng hợp; ngày dd/MM/yyyy; %NG dạng số", async () => {
    const buf = await buildShiftOutputWorkbook({
      siteName: "Đông Anh",
      from: "2026-11-18",
      to: "2026-11-18",
      entries: [row()],
      defects: [{ entryId: "e1", reasonId: "d1", reasonName: "Kích thước sai", value: 7 }],
      downtimes: [{ entryId: "e1", reasonId: "t1", reasonName: "Thay dao", value: 20 }],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Chi tiết", "Tổng hợp"]);
    const r5 = wb.getWorksheet("Chi tiết")!.getRow(5);
    expect(r5.getCell(1).value).toBe("18/11/2026");
    expect(r5.getCell(9).value).toBe(480);
    expect(r5.getCell(11).value).toBeCloseTo(12 / 492, 6);
    expect(r5.getCell(14).value).toBe("Kích thước sai 7");
    const summary = wb.getWorksheet("Tổng hợp")!;
    const labels: unknown[] = [];
    summary.eachRow((r) => labels.push(r.getCell(1).value));
    expect(labels).toEqual(expect.arrayContaining(["Tổng OK", "Theo máy", "Theo mã hàng", "Pareto lỗi (NG)", "Chưa phân loại"]));
  });

  it("chống formula injection ở chuỗi người dùng nhập", async () => {
    const buf = await buildShiftOutputWorkbook({
      siteName: "=HYPERLINK(\"x\")",
      from: "2026-11-18",
      to: "2026-11-18",
      entries: [row({ partCode: "=1+1", notes: "@cmd", operatorName: "+Hùng" })],
      defects: [],
      downtimes: [],
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    const ws = wb.getWorksheet("Chi tiết")!;
    const r5 = ws.getRow(5);
    expect(r5.getCell(4).value).toBe("'=1+1");
    expect(r5.getCell(7).value).toBe("'+Hùng");
    expect(r5.getCell(16).value).toBe("'@cmd");
    expect(String(ws.getCell("A1").value)).not.toMatch(/^=/);
  });
});
