import { describe, expect, it } from "vitest";
import { buildBreadcrumbItems } from "./breadcrumb-items";

const BOM_ID = "5e6de36a-1234-4abc-8def-0123456789ab";

describe("V4.1 UI-BOM — buildBreadcrumbItems", () => {
  it("workspace BOM: hiện mã BOM + nhãn tiếng Việt, không UUID thô", () => {
    const items = buildBreadcrumbItems(`/bom/${BOM_ID}/grid`, {
      [BOM_ID]: "BOM-0042",
    });
    expect(items).toEqual([
      { label: "Trang chủ", href: "/" },
      { label: "BOM", href: "/bom" },
      { label: "BOM-0042", href: `/bom/${BOM_ID}` },
      { label: "Lưới vật tư" },
    ]);
  });

  it("chưa tải được mã BOM → 'Chi tiết' thay vì UUID", () => {
    const items = buildBreadcrumbItems(`/bom/${BOM_ID}/grid`);
    expect(items.map((i) => i.label)).toEqual([
      "Trang chủ",
      "BOM",
      "Chi tiết",
      "Lưới vật tư",
    ]);
  });

  it("giữ hành vi cũ cho segment thường", () => {
    const items = buildBreadcrumbItems("/items/ABC-001");
    expect(items).toEqual([
      { label: "Trang chủ", href: "/" },
      { label: "Vật tư", href: "/items" },
      { label: "ABC-001" },
    ]);
  });

  it("V4.1 UI-09: route hub/thu mua/quản trị có nhãn tiếng Việt", () => {
    expect(buildBreadcrumbItems("/engineering").map((i) => i.label)).toEqual([
      "Trang chủ",
      "Bộ phận Thiết kế",
    ]);
    expect(
      buildBreadcrumbItems(`/procurement/purchase-requests/${BOM_ID}`).map(
        (i) => i.label,
      ),
    ).toEqual(["Trang chủ", "Thu mua", "Đề xuất vật tư", "Chi tiết"]);
    expect(buildBreadcrumbItems("/admin/users").map((i) => i.label)).toEqual([
      "Trang chủ",
      "Quản trị",
      "Người dùng",
    ]);
  });

  it("trang chủ", () => {
    expect(buildBreadcrumbItems("/")).toEqual([{ label: "Trang chủ" }]);
  });
});
