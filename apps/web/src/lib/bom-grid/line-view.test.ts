import { describe, expect, it } from "vitest";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import {
  lineCategory,
  lineCoef,
  lineIdText,
  lineImageSrc,
  lineNameText,
  linePics,
} from "./line-view";

function node(p: Partial<BomTreeNodeRaw>): BomTreeNodeRaw {
  return {
    id: "1",
    metadata: {},
    qtyPerParent: "2",
    positionCode: null,
    componentSku: "SKU1",
    componentName: "Tên item",
    assignedToFullName: null,
    assignedToName: null,
    ...p,
  } as unknown as BomTreeNodeRaw;
}

describe("line-view fallback BOM cũ", () => {
  it("category: cột V5 > metadata > OTHER", () => {
    expect(lineCategory(node({ category: "GTAM" }))).toBe("GTAM");
    expect(lineCategory(node({ metadata: { category: "Thương mại" } }))).toBe("COMMERCIAL");
    expect(lineCategory(node({}))).toBe("OTHER");
  });
  it("id / tên / hệ số", () => {
    expect(lineIdText(node({ positionCode: "BL1" }))).toBe("BL1");
    expect(lineIdText(node({ metadata: { seq: "AB01" } }))).toBe("AB01");
    expect(lineIdText(node({}))).toBeNull();
    expect(lineNameText(node({ file3dName: "Tam_1" }))).toBe("Tam_1");
    expect(lineNameText(node({}))).toBe("Tên item");
    expect(lineCoef(node({ coef: "3.0000" }))).toBe(3);
    expect(lineCoef(node({}))).toBe(2);
  });
  it("ảnh + PIC", () => {
    expect(lineImageSrc(node({ imageAssetId: "abc" }))).toBe("/api/bom/assets/abc?size=thumb");
    expect(lineImageSrc(node({ itemImageUrl: "/x.png" }))).toBe("/x.png");
    expect(lineImageSrc(node({}))).toBeNull();
    expect(linePics(node({ picNames: ["An", "Bình"] }))).toEqual(["An", "Bình"]);
    expect(linePics(node({ assignedToName: "Cường" }))).toEqual(["Cường"]);
    expect(linePics(node({}))).toEqual([]);
  });
});
