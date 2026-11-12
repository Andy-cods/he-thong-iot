import { describe, expect, it } from "vitest";
import {
  buildSavePayload,
  buildSpecRows,
  kindOfCategory,
  mergeActivity,
  pickLineActions,
  validateForm,
  buildInitial,
} from "./model";
import type { BomTreeNodeRaw } from "../../../hooks/useBom";

const node = (over: Partial<BomTreeNodeRaw> = {}): BomTreeNodeRaw =>
  ({
    id: "l1",
    qtyPerParent: "2",
    scrapPercent: "0",
    uom: "cái",
    description: "SUS304",
    supplierItemCode: null,
    metadata: {},
    category: "GTAM",
    componentSku: "SKU1",
    ...over,
  }) as unknown as BomTreeNodeRaw;

describe("pickLineActions", () => {
  it("không có số liệu → không hành động", () => {
    expect(pickLineActions("GTAM", null)).toEqual([]);
  });
  it("GTAM còn hàng ở Gia công → Gửi nhà thầu phụ trước, rồi Chuyển bước", () => {
    const a = pickLineActions("GTAM", { BLANK: 0, MACHINING: 4, SURFACE: 0, QC: 0, ASSEMBLY: 0 });
    expect(a.map((x) => x.kind)).toEqual(["sendNtp", "move"]);
    expect(a[0]!.qty).toBe(4);
    expect(a[1]!.label).toBe("Chuyển sang Bề mặt·NTP (4)");
  });
  it("còn hàng ở QC → Giao lắp ráp", () => {
    const a = pickLineActions("GTAM", { BLANK: 0, MACHINING: 0, SURFACE: 0, QC: 3, ASSEMBLY: 0 });
    expect(a[0]).toMatchObject({ kind: "deliver", qty: 3 });
  });
  it("thương mại ở Đề xuất → chỉ Chuyển sang bước kế", () => {
    const a = pickLineActions("COMMERCIAL", { PROPOSE: 5, PO: 0, STOCK: 0, QC: 0, ASSEMBLY: 0 });
    expect(a).toHaveLength(1);
    expect(a[0]!.label).toBe("Chuyển sang Đặt PO (5)");
  });
  it("đã giao lắp ráp đủ → không hành động", () => {
    expect(pickLineActions("GTAM", { BLANK: 0, MACHINING: 0, SURFACE: 0, QC: 0, ASSEMBLY: 5 })).toEqual([]);
  });
  it("tối đa 2 hành động", () => {
    const a = pickLineActions("GTAM", { BLANK: 0, MACHINING: 2, SURFACE: 0, QC: 3, ASSEMBLY: 0 });
    expect(a.length).toBeLessThanOrEqual(2);
  });
});

describe("mergeActivity", () => {
  const history = [
    { id: 1, oldValue: { name: "A" }, newValue: { name: "B" }, actorName: "An", at: "2026-11-10T08:00:00Z" },
  ];
  const moves = [
    { id: 5, fromStage: "MACHINING", toStage: "SURFACE", qty: "2.0000", docType: "MANUAL", actorName: "Bình", at: "2026-11-11T08:00:00Z", reversesId: null, reversedById: null },
    { id: 6, fromStage: "QC", toStage: "ASSEMBLY", qty: "1", docType: "DELIVERY_SLIP", actorName: null, at: "2026-11-12T08:00:00Z", reversesId: null, reversedById: null },
    { id: 7, fromStage: "SURFACE", toStage: "MACHINING", qty: "1", docType: "MANUAL", actorName: "Bình", at: "2026-11-09T08:00:00Z", reversesId: 3, reversedById: null },
    { id: 3, fromStage: "MACHINING", toStage: "SURFACE", qty: "1", docType: "MANUAL", actorName: "Bình", at: "2026-11-08T08:00:00Z", reversesId: null, reversedById: 7 },
  ];
  const items = mergeActivity("GTAM", history, moves);

  it("mới nhất trước", () => {
    expect(items.map((i) => i.key)).toEqual(["m6", "m5", "s1", "m7", "m3"]);
  });
  it("chỉ move MANUAL chưa đảo mới đảo được", () => {
    expect(items.filter((i) => i.reversibleMoveId != null).map((i) => i.reversibleMoveId)).toEqual([5]);
  });
  it("câu mô tả + loại", () => {
    expect(items[0]).toMatchObject({ kind: "slip" });
    expect(items[0]!.text).toContain("theo phiếu giao");
    expect(items[1]!.text).toBe("Chuyển Gia công → Bề mặt·NTP · 2");
    expect(items[2]!.text).toBe("Đổi NCC: A → B");
    expect(items[3]).toMatchObject({ kind: "reverse" });
    expect(items[4]!.text).toContain("đã bị đảo");
  });
  it("rỗng → rỗng", () => {
    expect(mergeActivity(null, [], [])).toEqual([]);
  });
});

describe("category → kind, lưu, kiểm tra", () => {
  it("GTAM/OUTSOURCED → fab, COMMERCIAL → com", () => {
    expect(kindOfCategory("GTAM")).toBe("fab");
    expect(kindOfCategory("OUTSOURCED")).toBe("fab");
    expect(kindOfCategory("COMMERCIAL")).toBe("com");
  });
  it("payload giữ đúng trường + metadata.kind/category", () => {
    const n = node({ category: "COMMERCIAL", supplierItemCode: "old" });
    const f = { ...buildInitial(n), supplierPartNumber: "PN-1", moq: "10" };
    const p = buildSavePayload(f, n);
    expect(p).toMatchObject({
      qtyPerParent: 2,
      scrapPercent: 0,
      uom: "cái",
      description: "SUS304",
      supplierItemCode: "PN-1",
      category: "COMMERCIAL",
    });
    expect(p.metadata).toMatchObject({ kind: "com", category: "Thương mại", sourcing: { supplierPartNumber: "PN-1", moq: 10 } });
  });
  it("gia công ghi routing + mirror size, giữ supplierItemCode cũ", () => {
    const n = node({ supplierItemCode: "keep" });
    const f = { ...buildInitial(n), blankSize: "10x10x5", processRoute: ["CUT"] };
    const p = buildSavePayload(f, n);
    expect(p.supplierItemCode).toBe("keep");
    expect(p.metadata).toMatchObject({ kind: "fab", size: "10x10x5", routing: { blankSize: "10x10x5", processRoute: ["CUT"] } });
  });
  it("validate bắt hệ số < 0.01 và hao hụt > 100", () => {
    const f = { ...buildInitial(node()), qtyPerParent: "0", scrapPercent: "101" };
    expect(Object.keys(validateForm(f)).sort()).toEqual(["qtyPerParent", "scrapPercent"]);
  });
  it("spec rows ẩn ô trống", () => {
    const rows = buildSpecRows(node({ processMethod: "CNC", surfaceTreatment: "" }), "10×20×5 mm");
    expect(rows.map((r) => r.label)).toEqual(["Vật liệu / Ghi chú", "Quy cách D×R×C", "PP gia công", "ĐVT"]);
  });
});
