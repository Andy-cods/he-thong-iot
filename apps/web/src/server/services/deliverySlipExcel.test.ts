/**
 * BOM V5 WP8c — xuất phiếu giao hàng: so ô chính với mẫu thật
 * (FORM GTAM Phieu giao hang.xlsx): H1 tiêu đề, N4 số phiếu, A6/A7 bên nhận,
 * dòng 11 các cột, dòng Tổng, merge + chữ ký giữ nguyên.
 */
import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildDeliverySlipExcel } from "./deliverySlipExcel";
import type { SlipDetail, SlipLineSnap } from "@/server/repos/deliverySlips";

function mkDetail(n: number, opts: { received?: number } = {}): SlipDetail {
  const snap = (i: number): SlipLineSnap => ({
    name: `Chi tiết ${i}`,
    itemName: `Item ${i}`,
    sku: `SKU${i}`,
    dimsText: "70 × 30 × 20",
    dims: { l: 70, w: 30, h: 20 },
    surfaceTreatment: "Anode bạc",
    positionCode: `BL${i}`,
    projectCode: "Z0000002590422",
    category: "GTAM",
    uom: "Cái",
    recipient: { name: "CÔNG TY CỔ PHẦN ASAHI PLATING HÀ NỘI", address: "Lô 6-2, KCN Quang Minh" },
  });
  return {
    slip: {
      id: "s1",
      slipNo: "GT-PG261111-01",
      kind: "SURFACE",
      templateId: "T1",
      projectCode: "Z0000002590422",
      supplierId: "sup1",
      recipientText: "CÔNG TY CỔ PHẦN ASAHI PLATING HÀ NỘI",
      status: "SENT",
      batchNo: 1,
      notes: null,
      createdBy: null,
      createdAt: new Date("2026-11-11T03:00:00Z"),
    },
    lines: Array.from({ length: n }, (_, i) => ({
      id: `l${i}`,
      slipId: "s1",
      lineId: `bl${i}`,
      stt: i + 1,
      fromStage: "MACHINING",
      toStage: "SURFACE",
      qtyDoc: String(40 + i),
      qtyReceived: String(opts.received ?? 0),
      unitPrice: i === 0 ? "12500" : null,
      note: "Đợt 1 · còn 0",
      snap: snap(i + 1),
    })),
  };
}

async function load(buf: Buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf as unknown as ArrayBuffer);
  return wb.worksheets[0]!;
}

describe("buildDeliverySlipExcel", () => {
  it("điền đúng ô chính, giữ tiêu đề/địa chỉ/chữ ký của mẫu", async () => {
    const ws = await load(await buildDeliverySlipExcel(mkDetail(2, { received: 5 })));
    expect(ws.getCell("H1").value ?? ws.getCell("A1").value).toBeTruthy();
    const title = [ws.getCell("A1").value, ws.getCell("H1").value].find((v) => v === "PHIẾU GIAO HÀNG");
    expect(title).toBe("PHIẾU GIAO HÀNG");
    expect(ws.getCell("A2").value).toBe("CTCP SẢN XUẤT TỰ ĐỘNG HÓA CÔNG NGHỆ TOÀN CẦU");
    expect(ws.getCell("N4").value).toBe("GT-PG261111-01");
    expect(ws.getCell("L3").value).toBeInstanceOf(Date);
    expect(ws.getCell("L3").numFmt).toContain("tháng");
    const a6 = ws.getCell("A6").value as { richText: Array<{ text: string; font?: { bold?: boolean } }> };
    expect(a6.richText.map((r) => r.text).join("")).toBe("TO : CÔNG TY CỔ PHẦN ASAHI PLATING HÀ NỘI");
    expect(a6.richText[1]!.font?.bold).toBe(true);
    expect(ws.getCell("A7").value).toBe("Địa Chỉ : Lô 6-2, KCN Quang Minh");
    expect(ws.getCell("B8").value).toBe("Xuất tại kho : Xưởng sản xuất CTCP.GTAM");

    // Dòng 11 (STT 1)
    expect(ws.getCell("A11").value).toBe(1);
    expect(ws.getCell("B11").value).toBe("Chi tiết 1");
    expect([ws.getCell("D11").value, ws.getCell("E11").value, ws.getCell("F11").value]).toEqual([70, 30, 20]);
    expect(ws.getCell("G11").value).toBe("Anode bạc");
    expect(ws.getCell("H11").value).toBe("BL1");
    expect(ws.getCell("I11").value).toBe("Z0000002590422");
    expect(ws.getCell("J11").value).toBe("Cái");
    expect(ws.getCell("K11").value).toBe(40);
    expect(ws.getCell("L11").value).toBe(5);
    expect(ws.getCell("M11").value).toBe(12500);
    expect(ws.getCell("N11").value).toBe("Đợt 1 · còn 0");
    expect(ws.getCell("A12").value).toBe(2);
    expect(ws.getCell("M12").value).toBeNull();

    // Dòng Tổng
    expect(ws.getCell("A33").value).toBe("Tổng");
    const k33 = ws.getCell("K33").value as { formula: string; result: number };
    expect(k33.formula).toBe("SUM(K11:K32)");
    expect(k33.result).toBe(81);

    // Merge + chữ ký của mẫu còn nguyên
    const merges = (ws.model as { merges: string[] }).merges;
    for (const m of ["A9:A10", "B9:C10", "D9:F9", "K9:L9", "B11:C11", "B32:C32"]) expect(merges).toContain(m);
    expect(ws.getCell("B45").value).toBe("NGƯỜI LẬP PHIẾU");
    expect(ws.getCell("G45").value).toBe("NGƯỜI NHẬN HÀNG");
    expect(ws.getCell("K45").value).toBe("P.QLSX");
    expect(ws.getCell("M45").value).toBe("GIÁM ĐỐC");
    expect(ws.getCell("A9").font?.name).toBe("Times New Roman");
    expect(ws.getColumn(7).width).toBeCloseTo(20.55, 1);
  });

  it("dòng mẫu cũ (Chi tiết nhôm) bị xoá; ký tự đầu '=' bị vô hiệu hoá", async () => {
    const d = mkDetail(1);
    (d.lines[0]!.snap as SlipLineSnap).name = "=HYPERLINK(1)";
    const ws = await load(await buildDeliverySlipExcel(d));
    expect(ws.getCell("B11").value).toBe("'=HYPERLINK(1)");
    expect(ws.getCell("L11").value).toBeNull();
    expect(ws.getCell("K12").value).toBeNull();
  });

  it("nhiều hơn 22 dòng: chèn dòng trước Tổng, merge/chữ ký dời xuống đúng", async () => {
    const ws = await load(await buildDeliverySlipExcel(mkDetail(30)));
    // 30 dòng → 11..40, Tổng ở 41 (= 33 + 8)
    expect(ws.getCell("A40").value).toBe(30);
    expect(ws.getCell("B40").value).toBe("Chi tiết 30");
    expect(ws.getCell("A41").value).toBe("Tổng");
    const k = ws.getCell("K41").value as { formula: string; result: number };
    expect(k.formula).toBe("SUM(K11:K40)");
    expect(k.result).toBe(Array.from({ length: 30 }, (_, i) => 40 + i).reduce((a, b) => a + b, 0));
    expect(ws.getCell("B53").value).toBe("NGƯỜI LẬP PHIẾU");
    expect(ws.getCell("K53").value).toBe("P.QLSX");
    const merges = (ws.model as { merges: string[] }).merges;
    expect(merges).toContain("B40:C40");
    expect(merges).toContain("M53:N53");
    expect(merges).toContain("A9:A10");
    // Style hàng chèn lấy từ hàng dữ liệu mẫu (font Times New Roman 11).
    expect(ws.getCell("B38").font?.name).toBe("Times New Roman");
  });
});
