import { describe, expect, it } from "vitest";
import { renderDeliverySlipPdfBuffer } from "./deliverySlipPdf";
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

const head = (b: Uint8Array) => Buffer.from(b.slice(0, 5)).toString("latin1");

describe("renderDeliverySlipPdfBuffer", () => {
  it("render phiếu mẫu ra PDF hợp lệ", async () => {
    const buf = await renderDeliverySlipPdfBuffer(mkDetail(3, { received: 5 }));
    expect(head(buf)).toBe("%PDF-");
    expect(buf.byteLength).toBeGreaterThan(2000);
    expect(Buffer.from(buf).includes(Buffer.from("%%EOF"))).toBe(true);
  });

  it("phiếu 30 dòng (nhiều trang) không lỗi và lớn hơn phiếu 3 dòng", async () => {
    const small = await renderDeliverySlipPdfBuffer(mkDetail(3));
    const big = await renderDeliverySlipPdfBuffer(mkDetail(30));
    expect(head(big)).toBe("%PDF-");
    expect(big.byteLength).toBeGreaterThan(small.byteLength);
  });
});
