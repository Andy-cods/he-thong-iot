import { describe, expect, it } from "vitest";
import { matchBomRows, type MatchItemInput, type MatchRowInput } from "./bomMatch";

const item = (
  id: string,
  sku: string,
  name = "",
  extra: Partial<MatchItemInput> = {},
): MatchItemInput => ({ id, sku, name, description: null, materialCode: null, dimensions: null, ...extra });

const one = (row: Partial<MatchRowInput>, items: MatchItemInput[]) =>
  matchBomRows([{ position: 1, file3dName: "", category: "COMMERCIAL", ...row } as MatchRowInput], items)[0]!;

describe("bomMatch", () => {
  it("BL12 gia công khớp tên, item cũ NULL, vật liệu nằm trong name", () => {
    const r = one(
      { file3dName: "Stopper_AL 1", category: "GTAM", materialCode: "AL6061", dims: { l: 58, w: 40, h: 10 } },
      [item("a", "STOPPER_AL 1", "AL6061, anode màu đen")],
    );
    expect(r.status).toBe("MATCH");
    expect(r.itemId).toBe("a");
    expect(r.reasons).toContain("DIMS_UNKNOWN");
  });

  it("BL24 thương mại theo tên", () => {
    const r = one({ file3dName: "S6KA3-15_1" }, [item("a", "S6KA3-15", "hộp số S6KA15B")]);
    expect(r.status).toBe("MATCH");
    expect(r.matchedBy).toBe("NAME");
  });

  it("BL25 cảnh báo đổi sang", () => {
    const r = one({ file3dName: "SB6000ZZ_1", blankSpec: "SB6000ZZ" }, [
      item("a", "SB6000ZZ", "SB6000ZZ đổi sang C-SE6000ZZ"),
    ]);
    expect(r.status).toBe("MATCH");
    expect(r.warnings).toEqual([{ code: "SUBSTITUTE", text: "C-SE6000ZZ", itemId: "a" }]);
  });

  it("BL23 hai item khác nhau → CONFIRM", () => {
    const r = one({ file3dName: "S6I06G-GX_1", blankSpec: "S6I06GX-V12CE" }, [
      item("a", "S6I06G-GX"),
      item("b", "S6I06GX-V12CE"),
    ]);
    expect(r.status).toBe("CONFIRM");
    expect(r.candidates.map((c) => c.itemId).sort()).toEqual(["a", "b"]);
  });

  it("BL33 theo blank_spec", () => {
    const r = one({ file3dName: "(bổ sung) Speed Controller", blankSpec: "SUD06IX-V12" }, [
      item("a", "SUD06IX-V12", "SPG"),
    ]);
    expect(r.status).toBe("MATCH");
    expect(r.matchedBy).toBe("BLANK_CODE");
  });

  it("BL28 blank có xuống dòng", () => {
    const r = one(
      { file3dName: "HTPA18S5M100-A-N8-FC30.0_1", blankSpec: "HTPA18S5M100-A\n-N8-FC30.0" },
      [item("a", "HTPA18S5M100-A-N8-FC30.0")],
    );
    expect(r.status).toBe("MATCH");
    expect(r.itemId).toBe("a");
  });

  it("BL2 không có item → NEW", () => {
    const r = one({ file3dName: "Conveyor 320mm - P001", category: "GTAM", materialCode: "AL6061" }, [
      item("a", "X"),
    ]);
    expect(r.status).toBe("NEW");
  });

  it("lệch vật liệu (name chứa SUS304) → CONFIRM MATERIAL_MISMATCH", () => {
    const r = one({ file3dName: "Plate_1", category: "GTAM", materialCode: "AL6061" }, [
      item("a", "PLATE", "SUS304 tấm"),
    ]);
    expect(r.status).toBe("CONFIRM");
    expect(r.reasons).toContain("MATERIAL_MISMATCH");
  });

  it("item.materialCode khác → CONFIRM", () => {
    const r = one({ file3dName: "Plate", category: "OUTSOURCED", materialCode: "AL 6061" }, [
      item("a", "PLATE", "", { materialCode: "SUS304" }),
    ]);
    expect(r.status).toBe("CONFIRM");
  });

  it("dims lệch → CONFIRM; hoán vị / sai số 0.5 → MATCH", () => {
    const row = {
      file3dName: "Plate",
      category: "GTAM" as const,
      materialCode: "AL6061",
      dims: { l: 58, w: 40, h: 10 },
    };
    const mk = (d: { l: number; w: number; h: number }) => [
      item("a", "PLATE", "", { materialCode: "al6061", dimensions: d }),
    ];
    const bad = one(row, mk({ l: 60, w: 40, h: 10 }));
    expect(bad.status).toBe("CONFIRM");
    expect(bad.reasons).toContain("DIMS_MISMATCH");
    expect(one(row, mk({ l: 58.4, w: 39.6, h: 10 })).status).toBe("MATCH");
    const p = one(row, mk({ l: 40, w: 58, h: 10 }));
    expect(p.status).toBe("MATCH");
    expect(p.reasons).toContain("DIMS_PERMUTED");
  });

  it("hiệu năng 2000 item x 500 dòng < 200ms", () => {
    const items = Array.from({ length: 2000 }, (_, i) => item(`i${i}`, `SKU-${i}`, "AL6061"));
    const rows: MatchRowInput[] = Array.from({ length: 500 }, (_, i) => ({
      position: i,
      file3dName: `SKU-${i * 3}_1`,
      category: i % 2 ? "GTAM" : "COMMERCIAL",
      materialCode: "AL6061",
    }));
    const t = performance.now();
    matchBomRows(rows, items);
    expect(performance.now() - t).toBeLessThan(200);
  });
});
