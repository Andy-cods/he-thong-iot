import { describe, expect, it } from "vitest";
import {
  TRIEN_KHAI_DISABLED_MESSAGE,
  buildTrienKhaiMatchPreview,
  guardTrienKhaiEnabled,
  type PreviewRowIn,
} from "./bomImportTrienKhaiPreview";
import { buildDecisions, undecidedPositions } from "@/components/bom-import/matchDecisions";
import type { TkPreviewRow } from "@/hooks/useBomImport";

describe("flag BOM_IMPORT_V5", () => {
  it("tắt → lỗi rõ 'Mẫu BOM triển khai chưa bật'", () => {
    const g = guardTrienKhaiEnabled(false);
    expect(g?.message).toBe(TRIEN_KHAI_DISABLED_MESSAGE);
    expect(g?.message).toBe("Mẫu BOM triển khai chưa bật");
    expect(g?.status).toBe(422);
  });
  it("bật → cho qua", () => {
    expect(guardTrienKhaiEnabled(true)).toBeNull();
  });
});

const r = (o: Partial<PreviewRowIn>): PreviewRowIn => ({
  position: "BL1",
  file3dName: "ABC",
  category: "COMMERCIAL",
  supplierPending: false,
  supplierNames: [],
  ...o,
});

describe("buildTrienKhaiMatchPreview", () => {
  const items = [
    { id: "i1", sku: "ABC", name: "ABC" },
    { id: "i2", sku: "DUP", name: "DUP a" },
    { id: "i3", sku: "DUP", name: "DUP b" },
  ];
  const sups = [{ id: "s1", code: "NCC-1", name: "Tân Tiến" }];

  it("thống kê khớp/xác nhận/mới + NCC pending + NCC thiếu", () => {
    const out = buildTrienKhaiMatchPreview(
      [
        r({ position: "BL1", file3dName: "ABC", supplierNames: ["Tân Tiến"] }),
        r({ position: "BL2", file3dName: "DUP_1", supplierNames: ["Tân Tiến", "Phạm Gia"], supplierPending: true }),
        r({ position: "BL3", file3dName: "ZZZ", supplierNames: ["Hòa Phát"] }),
      ],
      items,
      sups,
    );
    expect(out.stats).toMatchObject({ total: 3, match: 1, confirm: 1, new: 1, supplierPending: 1 });
    expect(out.stats.suppliersMissing).toEqual(["Phạm Gia", "Hòa Phát"]);
    expect(out.matches[0]!.supplier).toEqual({ state: "MATCHED", supplierId: "s1" });
    expect(out.matches[1]!.supplier.state).toBe("PENDING");
    expect(out.matches[2]!.supplier.state).toBe("MISSING");
    expect(out.matches[1]!.candidates).toHaveLength(2);
  });
});

describe("quyết định ở UI", () => {
  const rows = [
    { position: "BL1", match: { status: "MATCH" } },
    { position: "BL2", match: { status: "CONFIRM", candidates: [] } },
    { position: "BL3", match: { status: "CONFIRM", candidates: [] } },
  ] as unknown as TkPreviewRow[];
  it("khoá commit khi còn CONFIRM chưa chọn", () => {
    expect(undecidedPositions(rows, {})).toEqual(["BL2", "BL3"]);
    expect(undecidedPositions(rows, { BL2: "NEW", BL3: "x" })).toEqual([]);
  });
  it("buildDecisions", () => {
    expect(buildDecisions(rows, { BL2: "NEW", BL3: "item-9" })).toEqual([
      { position: "BL2", action: "NEW" },
      { position: "BL3", action: "USE_ITEM", itemId: "item-9" },
    ]);
  });
});
