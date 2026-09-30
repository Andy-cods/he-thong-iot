import { describe, expect, it } from "vitest";
import {
  buildMaterialPlanRows,
  resolveMaterialRequirement,
  splitConfirmLines,
  summarizeMaterialStatus,
  type MaterialPlanRow,
} from "./wo-material-plan";

describe("resolveMaterialRequirement", () => {
  it("dùng allocated_qty khi > 0 (khớp dữ liệu thật staging: qty=1, allocated_qty=12)", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 12,
      materialRequirements: [
        { item_id: "item-1", sku: "AL01", name: "AL6061", uom: "PCS", qty: 1, allocated_qty: 12 },
      ],
    });
    expect(res.source).toBe("MANUAL");
    expect(res.skippedRows).toBe(0);
    expect(res.items).toEqual([
      { itemId: "item-1", sku: "AL01", name: "AL6061", uom: "PCS", required: 12 },
    ]);
  });

  it("fallback qty × plannedQty khi allocated_qty = 0/thiếu", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 10,
      materialRequirements: [
        { item_id: "item-2", qty: 2.5, allocated_qty: 0 },
      ],
    });
    expect(res.items[0]?.required).toBe(25);
  });

  it("bỏ qua dòng không có item_id (placeholder '(chưa rõ)' — khớp dữ liệu thật)", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 10,
      materialRequirements: [
        { item_id: null, sku: null, name: "(chưa rõ)", qty: 1, allocated_qty: 0 },
        { item_id: "item-3", qty: 1, allocated_qty: 5 },
      ],
    });
    expect(res.skippedRows).toBe(1);
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.itemId).toBe("item-3");
  });

  it("gộp 2 dòng cùng item_id", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 1,
      materialRequirements: [
        { item_id: "item-1", qty: 1, allocated_qty: 3 },
        { item_id: "item-1", qty: 1, allocated_qty: 4 },
      ],
    });
    expect(res.items).toHaveLength(1);
    expect(res.items[0]?.required).toBe(7);
  });

  it("fallback bom_line gốc khi materialRequirements rỗng", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 20,
      materialRequirements: [],
      bomLines: [
        { componentItemId: "raw-1", qtyPerParent: 2, scrapPercent: 10, sku: "RAW1", name: "Nhôm", uom: "KG" },
      ],
      bomTargetQty: 1,
    });
    expect(res.source).toBe("BOM_TEMPLATE");
    // 2 * 1.10 * (20/1) = 44
    expect(res.items[0]?.required).toBe(44);
  });

  it("fallback bom_line quy đổi theo targetQty khác 1", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 10,
      materialRequirements: [],
      bomLines: [
        { componentItemId: "raw-1", qtyPerParent: 5, scrapPercent: 0, sku: null, name: null, uom: null },
      ],
      bomTargetQty: 5,
    });
    // multiplier = 10/5 = 2 → 5*2=10
    expect(res.items[0]?.required).toBe(10);
  });

  it("không có nguồn nào → NONE", () => {
    const res = resolveMaterialRequirement({ plannedQty: 10, materialRequirements: null });
    expect(res.source).toBe("NONE");
    expect(res.items).toEqual([]);
  });

  it("materialRequirements toàn dòng thiếu item_id vẫn fallback BOM template (không coi là MANUAL rỗng)", () => {
    const res = resolveMaterialRequirement({
      plannedQty: 10,
      materialRequirements: [{ item_id: null, qty: 1, allocated_qty: 0 }],
      bomLines: [
        { componentItemId: "raw-9", qtyPerParent: 1, scrapPercent: 0, sku: null, name: null, uom: null },
      ],
    });
    expect(res.source).toBe("BOM_TEMPLATE");
    expect(res.skippedRows).toBe(1);
  });
});

describe("buildMaterialPlanRows", () => {
  it("tính remaining/toIssueFromStock/shortToBuy đúng", () => {
    const rows = buildMaterialPlanRows(
      [{ itemId: "i1", sku: "A", name: "A", uom: "PCS", required: 100 }],
      new Map([["i1", 30]]), // đã xin 30
      new Map(),
      new Map([["i1", 50]]), // tồn khả dụng 50
    );
    const r = rows[0]!;
    expect(r.remaining).toBe(70); // 100-30
    expect(r.toIssueFromStock).toBe(50); // min(70,50)
    expect(r.shortToBuy).toBe(20); // 70-50
  });

  it("đã xin đủ → remaining=0, không tạo thêm gì", () => {
    const rows = buildMaterialPlanRows(
      [{ itemId: "i1", sku: null, name: null, uom: null, required: 10 }],
      new Map([["i1", 10]]),
      new Map(),
      new Map([["i1", 100]]),
    );
    expect(rows[0]?.remaining).toBe(0);
    expect(rows[0]?.toIssueFromStock).toBe(0);
    expect(rows[0]?.shortToBuy).toBe(0);
  });

  it("tồn âm/không có coi như 0 (không lấy quá tồn)", () => {
    const rows = buildMaterialPlanRows(
      [{ itemId: "i1", sku: null, name: null, uom: null, required: 10 }],
      new Map(),
      new Map(),
      new Map(),
    );
    expect(rows[0]?.toIssueFromStock).toBe(0);
    expect(rows[0]?.shortToBuy).toBe(10);
  });
});

describe("summarizeMaterialStatus", () => {
  const base: MaterialPlanRow = {
    itemId: "i1",
    sku: null,
    name: null,
    uom: null,
    required: 10,
    alreadyRequested: 0,
    alreadyIssued: 0,
    remaining: 0,
    availableStock: 0,
    toIssueFromStock: 0,
    shortToBuy: 0,
  };

  it("NONE khi không có dòng nào", () => {
    expect(summarizeMaterialStatus([])).toBe("NONE");
  });

  it("SHORTAGE khi còn remaining > 0", () => {
    expect(summarizeMaterialStatus([{ ...base, remaining: 5 }])).toBe("SHORTAGE");
  });

  it("ISSUED khi đã xuất đủ required", () => {
    expect(summarizeMaterialStatus([{ ...base, alreadyIssued: 10 }])).toBe("ISSUED");
  });

  it("REQUESTED khi hết remaining nhưng chưa xuất đủ", () => {
    expect(summarizeMaterialStatus([{ ...base, alreadyIssued: 3 }])).toBe("REQUESTED");
  });
});

describe("splitConfirmLines", () => {
  it("tách đúng ISR (toIssueFromStock>0) và PR (shortToBuy>0)", () => {
    const rows: MaterialPlanRow[] = [
      {
        itemId: "i1", sku: "A", name: "A", uom: "PCS", required: 100,
        alreadyRequested: 0, alreadyIssued: 0, remaining: 100,
        availableStock: 40, toIssueFromStock: 40, shortToBuy: 60,
      },
      {
        itemId: "i2", sku: "B", name: "B", uom: "KG", required: 5,
        alreadyRequested: 5, alreadyIssued: 0, remaining: 0,
        availableStock: 0, toIssueFromStock: 0, shortToBuy: 0,
      },
    ];
    const { toIsr, toPr } = splitConfirmLines(rows);
    expect(toIsr).toEqual([{ itemId: "i1", sku: "A", name: "A", uom: "PCS", qty: 40 }]);
    expect(toPr).toEqual([{ itemId: "i1", sku: "A", name: "A", uom: "PCS", qty: 60 }]);
  });

  it("không xin trùng: item đã xin đủ (remaining=0) không xuất hiện ở cả 2 bên", () => {
    const rows: MaterialPlanRow[] = [
      {
        itemId: "i1", sku: null, name: null, uom: null, required: 10,
        alreadyRequested: 10, alreadyIssued: 0, remaining: 0,
        availableStock: 10, toIssueFromStock: 0, shortToBuy: 0,
      },
    ];
    const { toIsr, toPr } = splitConfirmLines(rows);
    expect(toIsr).toEqual([]);
    expect(toPr).toEqual([]);
  });
});
