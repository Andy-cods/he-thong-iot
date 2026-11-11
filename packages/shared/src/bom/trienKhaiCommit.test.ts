import { describe, expect, it } from "vitest";
import {
  buildBomLineValues,
  buildNewItemValues,
  newItemKey,
  planTrienKhaiRows,
  resolveSupplierName,
  toDims,
  uniqueSku,
  type CommitRow,
} from "./trienKhaiCommit";
import { bomImportDecisionsBodySchema } from "../schemas/bomImportV5";

const row = (o: Partial<CommitRow> = {}): CommitRow => ({
  rowNumber: 5,
  stt: 1,
  position: "BL1",
  file3dName: "(bổ sung) Stopper_AL_2",
  materialNote: null,
  category: "GTAM",
  dims: { l: 56, w: 26.5, h: 18 },
  dimsText: "56 × 26.5 × 18",
  processMethod: "CNC",
  materialCode: "AL6061",
  surfaceTreatment: "Anod",
  blankSpec: "60x30x20",
  supplierText: "Tân Tiến",
  supplierPending: false,
  supplierNames: ["Tân Tiến"],
  picNames: ["Hòa", "Đức"],
  coef: 2,
  qty: 4,
  assetId: "asset-1",
  fullUrl: "/api/bom/assets/asset-1?size=full",
  ...o,
});

const sups = [
  { id: "s1", code: "NCC-1", name: "Công ty Tân Tiến" },
  { id: "s2", code: "NCC-2", name: "Phạm Gia" },
];

describe("resolveSupplierName", () => {
  it("khớp chính xác không phân biệt hoa/thường/dấu", () => {
    expect(resolveSupplierName("PHAM GIA", sups)).toEqual({ state: "MATCHED", supplierId: "s2" });
  });
  it("khớp theo chứa (duy nhất)", () => {
    expect(resolveSupplierName("Tân Tiến", sups)).toEqual({ state: "MATCHED", supplierId: "s1" });
  });
  it("mơ hồ / không có", () => {
    expect(resolveSupplierName("Công ty", [...sups, { id: "s3", code: "NCC-3", name: "Công ty ABC" }]).state).toBe("AMBIGUOUS");
    expect(resolveSupplierName("Hòa Phát", sups).state).toBe("MISSING");
    expect(resolveSupplierName("", sups).state).toBe("MISSING");
  });
});

describe("planTrienKhaiRows", () => {
  const rows = [
    { position: "BL1", match: { status: "MATCH" as const, itemId: "i1", candidates: [{ itemId: "i1" }] } },
    { position: "BL2", match: { status: "NEW" as const, candidates: [] } },
    { position: "BL3", match: { status: "CONFIRM" as const, candidates: [{ itemId: "a" }, { itemId: "b" }] } },
  ];
  it("CONFIRM chưa quyết → undecided", () => {
    const r = planTrienKhaiRows(rows, []);
    expect(r.undecided).toEqual(["BL3"]);
    expect(r.plan.get("BL1")).toEqual({ action: "USE", itemId: "i1" });
    expect(r.plan.get("BL2")).toEqual({ action: "NEW" });
  });
  it("USE_ITEM hợp lệ / NEW", () => {
    expect(planTrienKhaiRows(rows, [{ position: "BL3", action: "USE_ITEM", itemId: "b" }]).undecided).toEqual([]);
    expect(planTrienKhaiRows(rows, [{ position: "BL3", action: "NEW" }]).plan.get("BL3")).toEqual({ action: "NEW" });
  });
  it("USE_ITEM ngoài danh sách ứng viên bị từ chối", () => {
    expect(planTrienKhaiRows(rows, [{ position: "BL3", action: "USE_ITEM", itemId: "zzz" }]).undecided).toEqual(["BL3"]);
  });
});

describe("item mới / sku", () => {
  it("uniqueSku thêm hậu tố, giữ ≤64 ký tự, so không phân biệt hoa/thường", () => {
    expect(uniqueSku("ABC", new Set())).toBe("ABC");
    expect(uniqueSku("ABC", new Set(["ABC"]))).toBe("ABC-2");
    expect(uniqueSku("ABC", new Set(["ABC", "ABC-2"]))).toBe("ABC-3");
    const long = "X".repeat(70);
    const s = uniqueSku(long, new Set(["X".repeat(64)]));
    expect(s.length).toBeLessThanOrEqual(64);
    expect(s.endsWith("-2")).toBe(true);
  });
  it("buildNewItemValues: sku, vật liệu, kích thước, ảnh", () => {
    const v = buildNewItemValues(row(), "STOPPER_AL");
    expect(v).toMatchObject({
      sku: "STOPPER_AL",
      itemType: "FABRICATED",
      materialCode: "AL6061",
      imageUrl: "/api/bom/assets/asset-1?size=full",
      dimensions: { length: 56, width: 26.5, height: 18, unit: "mm" },
    });
  });
  it("newItemKey: cùng tên chuẩn hoá nhưng khác vật liệu → khác key", () => {
    expect(newItemKey(row())).toBe(newItemKey(row({ file3dName: "STOPPER_AL_9" })));
    expect(newItemKey(row())).not.toBe(newItemKey(row({ materialCode: "SUS304" })));
  });
  it("toDims nhận cả {length,width,height} và {l,w,h}", () => {
    expect(toDims({ length: 1, width: 2, height: 3 })).toEqual({ l: 1, w: 2, h: 3 });
    expect(toDims({ l: 1, w: 2, h: 3 })).toEqual({ l: 1, w: 2, h: 3 });
    expect(toDims({ length: 1 })).toBeNull();
    expect(toDims(null)).toBeNull();
  });
});

describe("buildBomLineValues", () => {
  const ctx = { templateId: "t", sheetId: "sh", componentItemId: "i", position: 3, batchId: "b1", supplierId: null };
  it("điền đủ cột V5, NCC không chốt → supplierPending = text gốc", () => {
    const v = buildBomLineValues(row({ supplierText: "Tân Tiến/Phạm Gia", supplierPending: true }), ctx);
    expect(v).toMatchObject({
      positionCode: "BL1",
      qtyPerParent: "4",
      coef: "2",
      category: "GTAM",
      supplierId: null,
      supplierPending: "Tân Tiến/Phạm Gia",
      picNames: ["Hòa", "Đức"],
      imageAssetId: "asset-1",
      materialCode: "AL6061",
      file3dName: "(bổ sung) Stopper_AL_2",
    });
    expect(v.metadata).toMatchObject({ seq: "BL1", importedFromBatch: "b1" });
  });
  it("NCC chốt chắc → supplierId, không pending; qty rỗng → 1", () => {
    const v = buildBomLineValues(row({ qty: null, coef: null, picNames: [] }), { ...ctx, supplierId: "s1" });
    expect(v.supplierId).toBe("s1");
    expect(v.supplierPending).toBeNull();
    expect(v.qtyPerParent).toBe("1");
    expect(v.coef).toBeNull();
    expect(v.picNames).toBeNull();
  });
  it("idempotent: cùng đầu vào → cùng giá trị (không sinh id ngẫu nhiên)", () => {
    expect(buildBomLineValues(row(), ctx)).toEqual(buildBomLineValues(row(), ctx));
  });
});

describe("bomImportDecisionsBodySchema", () => {
  it("hợp lệ", () => {
    const r = bomImportDecisionsBodySchema.safeParse({
      decisions: [
        { position: "BL1", action: "NEW" },
        { position: "BL2", action: "USE_ITEM", itemId: "6f1c1c2e-5b0a-4c53-9a53-0b6a2f3a1111" },
      ],
    });
    expect(r.success).toBe(true);
  });
  it("USE_ITEM thiếu itemId / itemId sai → lỗi; thiếu decisions → []", () => {
    expect(bomImportDecisionsBodySchema.safeParse({ decisions: [{ position: "BL1", action: "USE_ITEM" }] }).success).toBe(false);
    expect(bomImportDecisionsBodySchema.safeParse({ decisions: [{ position: "BL1", action: "USE_ITEM", itemId: "x" }] }).success).toBe(false);
    expect(bomImportDecisionsBodySchema.safeParse({ decisions: [{ position: "BL1", action: "XOA" }] }).success).toBe(false);
    const d = bomImportDecisionsBodySchema.parse({});
    expect(d.decisions).toEqual([]);
  });
});
