import { describe, expect, it } from "vitest";
import { normName, parseDims, normMaterial } from "./normName";
import { parseBomCategory, stagesFor, stageIndex, stageLabel } from "./stages";

describe("normName", () => {
  it.each([
    ["SB688ZZ_1", "SB688ZZ"],
    ["(bổ sung) Speed Controller", "SPEED CONTROLLER"],
    ["(Bổ Sung)   speed  controller_12", "SPEED CONTROLLER"],
    ["Stopper_AL 1", "STOPPER_AL 1"],
    ["HTPA18S5M100-A-N8-FC30.0_1", "HTPA18S5M100-A-N8-FC30.0"],
    ["  abc   def  ", "ABC DEF"],
    ["(a) (b) X_2", "X"],
    ["ABC (x)", "ABC (X)"],
    ["", ""],
  ])("%s -> %s", (i, o) => expect(normName(i)).toBe(o));
  it("null/undefined -> rỗng", () => {
    expect(normName(null)).toBe("");
    expect(normName(undefined)).toBe("");
  });
});

describe("parseDims", () => {
  it("các ký tự phân cách", () => {
    const e = { l: 56, w: 26.5, h: 18 };
    expect(parseDims("56 × 26.5 × 18")).toEqual(e);
    expect(parseDims("56x26.5x18")).toEqual(e);
    expect(parseDims("56 X 26,5 X 18")).toEqual(e);
    expect(parseDims("56*26.5*18")).toEqual(e);
  });
  it("sai → null", () => {
    expect(parseDims("56 × 26")).toBeNull();
    expect(parseDims("a × b × c")).toBeNull();
    expect(parseDims("")).toBeNull();
    expect(parseDims(null)).toBeNull();
  });
});

describe("normMaterial", () => {
  it("không dấu, bỏ khoảng trắng, hoa", () => {
    expect(normMaterial(" Al 6061 - T6 ")).toBe("AL6061-T6");
    expect(normMaterial("Thép đen")).toBe("THEPDEN");
    expect(normMaterial(null)).toBe("");
  });
});

describe("stages", () => {
  it("bước từng category", () => {
    expect(stagesFor("GTAM")).toEqual(["BLANK", "MACHINING", "SURFACE", "QC", "ASSEMBLY"]);
    expect(stagesFor("OUTSOURCED")).toEqual(["ORDER", "VENDOR", "RECEIVED", "QC", "ASSEMBLY"]);
    expect(stagesFor("COMMERCIAL")).toEqual(["PROPOSE", "PO", "STOCK", "QC", "ASSEMBLY"]);
    expect(stageIndex("GTAM", "SURFACE")).toBe(2);
    expect(stageIndex("GTAM", "PO")).toBe(-1);
    expect(stageLabel("GTAM", "SURFACE")).toBe("Bề mặt·NTP");
  });
  it("parseBomCategory", () => {
    expect(parseBomCategory("GTAM gia công")).toBe("GTAM");
    expect(parseBomCategory("gtam")).toBe("GTAM");
    expect(parseBomCategory("Gia công đặt ngoài")).toBe("OUTSOURCED");
    expect(parseBomCategory("GIA CONG DAT NGOAI")).toBe("OUTSOURCED");
    expect(parseBomCategory("Thương mại")).toBe("COMMERCIAL");
    expect(parseBomCategory("thuong mai")).toBe("COMMERCIAL");
    expect(parseBomCategory("COMMERCIAL")).toBe("COMMERCIAL");
    expect(parseBomCategory("Khác")).toBe("OTHER");
    expect(parseBomCategory(null)).toBe("OTHER");
  });
});
