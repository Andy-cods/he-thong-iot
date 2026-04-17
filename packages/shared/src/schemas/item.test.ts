import { describe, expect, it } from "vitest";
import {
  itemCreateSchema,
  itemImportRowSchema,
  itemListQuerySchema,
  SKU_REGEX,
} from "./item";

describe("SKU_REGEX", () => {
  it("cho phép mã hợp lệ", () => {
    expect(SKU_REGEX.test("RM-0001")).toBe(true);
    expect(SKU_REGEX.test("ABC_123")).toBe(true);
    expect(SKU_REGEX.test("1A")).toBe(true);
  });

  it("chặn ký tự lạ, chữ thường, bắt đầu bằng -/_", () => {
    expect(SKU_REGEX.test("rm-0001")).toBe(false);
    expect(SKU_REGEX.test("-ABC")).toBe(false);
    expect(SKU_REGEX.test("_ABC")).toBe(false);
    expect(SKU_REGEX.test("A")).toBe(false); // < 2 chars
    expect(SKU_REGEX.test("ABC 123")).toBe(false);
    expect(SKU_REGEX.test("ABC@123")).toBe(false);
  });
});

describe("itemCreateSchema", () => {
  it("uppercase SKU, default fields, parse OK", () => {
    const res = itemCreateSchema.parse({
      sku: "rm-0001",
      name: "Thép tấm",
      itemType: "RAW",
      uom: "KG",
    });
    expect(res.sku).toBe("RM-0001");
    expect(res.status).toBe("ACTIVE");
    expect(res.minStockQty).toBe(0);
    expect(res.leadTimeDays).toBe(0);
    expect(res.isLotTracked).toBe(false);
  });

  it("từ chối itemType/uom sai", () => {
    const res = itemCreateSchema.safeParse({
      sku: "AB",
      name: "x",
      itemType: "INVALID",
      uom: "KG",
    });
    expect(res.success).toBe(false);
  });

  it("cho phép TOOL + PACKAGING (mới tuần 2)", () => {
    expect(
      itemCreateSchema.safeParse({
        sku: "TL-01",
        name: "Dao phay",
        itemType: "TOOL",
        uom: "PCS",
      }).success,
    ).toBe(true);
    expect(
      itemCreateSchema.safeParse({
        sku: "PK-01",
        name: "Thùng carton",
        itemType: "PACKAGING",
        uom: "BOX",
      }).success,
    ).toBe(true);
  });
});

describe("itemImportRowSchema", () => {
  it("parse row Excel hợp lệ, coerce number/bool", () => {
    const res = itemImportRowSchema.parse({
      sku: "rm-0001",
      name: "Thép tấm",
      itemType: "RAW",
      uom: "KG",
      minStockQty: "100",
      reorderQty: 500,
      leadTimeDays: "14",
      isLotTracked: "true",
      barcode: "8934567890123",
      barcodeType: "EAN13",
      supplierCode: "NCC-001",
      moq: 1,
      packSize: "1",
    });
    expect(res.sku).toBe("RM-0001");
    expect(res.minStockQty).toBe(100);
    expect(res.leadTimeDays).toBe(14);
    expect(res.isLotTracked).toBe(true);
    expect(res.barcodeType).toBe("EAN13");
  });

  it("default barcodeType = CODE128 khi không truyền", () => {
    const res = itemImportRowSchema.parse({
      sku: "AB-01",
      name: "x",
      itemType: "PURCHASED",
      uom: "PCS",
    });
    expect(res.barcodeType).toBe("CODE128");
  });
});

describe("itemListQuerySchema", () => {
  it("default page=1, pageSize=20, isActive=true, sort=-updatedAt", () => {
    const res = itemListQuerySchema.parse({});
    expect(res.page).toBe(1);
    expect(res.pageSize).toBe(20);
    expect(res.isActive).toBe(true);
    expect(res.sort).toBe("-updatedAt");
  });

  it("type single hoặc array cùng normalize thành array", () => {
    expect(itemListQuerySchema.parse({ type: "RAW" }).type).toEqual(["RAW"]);
    expect(itemListQuerySchema.parse({ type: ["RAW", "FG"] }).type).toEqual([
      "RAW",
      "FG",
    ]);
  });

  it("pageSize > 100 bị reject", () => {
    expect(itemListQuerySchema.safeParse({ pageSize: 500 }).success).toBe(
      false,
    );
  });

  it('isActive="false" chuyển thành boolean false', () => {
    expect(itemListQuerySchema.parse({ isActive: "false" }).isActive).toBe(
      false,
    );
  });
});
