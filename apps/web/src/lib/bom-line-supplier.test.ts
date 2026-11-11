import { describe, expect, it } from "vitest";
import {
  lineSupplierLabel,
  lineSupplierSearchText,
  resolveLineSupplier,
} from "./bom-line-supplier";

describe("resolveLineSupplier", () => {
  it("ưu tiên cột supplier_id hơn metadata", () => {
    const r = resolveLineSupplier({
      supplierId: "col-1",
      supplierName: "Cột",
      metadata: { sourcing: { supplierId: "meta-1", supplierName: "Meta" } },
      supplierPending: "x",
    });
    expect(r).toMatchObject({ source: "column", id: "col-1", name: "Cột", pending: null });
  });

  it("fallback metadata.sourcing.supplierId khi cột NULL (bug import không hiện NCC)", () => {
    const r = resolveLineSupplier({
      supplierId: null,
      legacySupplierName: "Tên join",
      metadata: { sourcing: { supplierId: "meta-1" } },
    });
    expect(r).toMatchObject({ source: "metadata", id: "meta-1", name: "Tên join" });
  });

  it("fallback metadata.supplierId phẳng; tên lấy từ sourcing.supplierName nếu không join được", () => {
    expect(
      resolveLineSupplier({ metadata: { supplierId: "flat-1", supplierName: "Phẳng" } }),
    ).toMatchObject({ source: "metadata", id: "flat-1", name: "Phẳng" });
    expect(
      resolveLineSupplier({
        metadata: { sourcing: { supplierId: "m", supplierName: "Trong sourcing" } },
      }).name,
    ).toBe("Trong sourcing");
  });

  it("sourcing.supplierId thắng metadata.supplierId", () => {
    expect(
      resolveLineSupplier({ metadata: { supplierId: "b", sourcing: { supplierId: "a" } } }).id,
    ).toBe("a");
  });

  it("chỉ có supplier_pending → source pending, kèm text gốc", () => {
    const r = resolveLineSupplier({ supplierPending: "  Tân Tiến/Phạm Gia ", metadata: {} });
    expect(r).toEqual({
      source: "pending",
      id: null,
      name: null,
      code: null,
      pending: "Tân Tiến/Phạm Gia",
    });
  });

  it("không có gì (kể cả chuỗi rỗng / metadata null) → none", () => {
    expect(resolveLineSupplier({ supplierId: "  ", metadata: null }).source).toBe("none");
    expect(resolveLineSupplier({}).source).toBe("none");
  });

  it("label/search text gom tên, mã, pending, part number", () => {
    const line = {
      supplierId: "c",
      supplierName: "Misumi",
      supplierCode: "NCC-1",
      supplierItemCode: "PN-9",
    };
    expect(lineSupplierLabel(line)).toBe("Misumi");
    expect(lineSupplierSearchText(line)).toBe("Misumi NCC-1 PN-9");
    expect(lineSupplierLabel({ supplierPending: "A/B" })).toBe("A/B");
    expect(lineSupplierLabel({ supplierItemCode: "PN-1" })).toBe("PN-1");
  });
});
