import { describe, expect, it } from "vitest";
import { buildBreadcrumbItems, hubTabLabel } from "./breadcrumb-items";

const BOM_ID = "5e6de36a-1234-4abc-8def-0123456789ab";

describe("V4.1 UI-BOM — buildBreadcrumbItems", () => {
  it("workspace BOM: hiện mã BOM + nhãn tiếng Việt, không UUID thô", () => {
    const items = buildBreadcrumbItems(`/bom/${BOM_ID}/grid`, {
      [BOM_ID]: "BOM-0042",
    });
    expect(items).toEqual([
      { label: "Tổng quan", href: "/" },
      { label: "BOM", href: "/bom" },
      { label: "BOM-0042", href: `/bom/${BOM_ID}` },
      { label: "Lưới vật tư" },
    ]);
  });

  it("chưa tải được mã BOM → 'Chi tiết' thay vì UUID", () => {
    const items = buildBreadcrumbItems(`/bom/${BOM_ID}/grid`);
    expect(items.map((i) => i.label)).toEqual([
      "Tổng quan",
      "BOM",
      "Chi tiết",
      "Lưới vật tư",
    ]);
  });

  it("giữ hành vi cũ cho segment thường", () => {
    const items = buildBreadcrumbItems("/items/ABC-001");
    expect(items).toEqual([
      { label: "Tổng quan", href: "/" },
      { label: "Vật tư", href: "/items" },
      { label: "ABC-001" },
    ]);
  });

  it("V4.1 UI-09: route hub/thu mua/quản trị có nhãn tiếng Việt", () => {
    expect(buildBreadcrumbItems("/engineering").map((i) => i.label)).toEqual([
      "Tổng quan",
      "Bộ phận Thiết kế",
    ]);
    expect(
      buildBreadcrumbItems(`/procurement/purchase-requests/${BOM_ID}`).map(
        (i) => i.label,
      ),
    ).toEqual(["Tổng quan", "Thu mua", "Đề xuất vật tư", "Chi tiết"]);
    expect(buildBreadcrumbItems("/admin/users").map((i) => i.label)).toEqual([
      "Tổng quan",
      "Quản trị",
      "Người dùng",
    ]);
  });

  it("trang chủ", () => {
    expect(buildBreadcrumbItems("/")).toEqual([{ label: "Tổng quan" }]);
  });

  it("V4.1 UI-27: không bao giờ hiện 'Dashboard'; audit → 'Nhật ký'", () => {
    const all = [
      ...buildBreadcrumbItems("/dashboard"),
      ...buildBreadcrumbItems("/Dashboard"),
      ...buildBreadcrumbItems("/x", { x: "Dashboard" }),
      ...buildBreadcrumbItems("/admin/audit"),
    ].map((i) => i.label);
    expect(all.some((l) => /dashboard/i.test(l))).toBe(false);
    expect(buildBreadcrumbItems("/admin/audit").map((i) => i.label)).toEqual([
      "Tổng quan",
      "Quản trị",
      "Nhật ký",
    ]);
  });
});

describe("V4.1 X6 — crumb theo ?tab= của trang hub", () => {
  it("hub + tab hợp lệ → thêm nhãn tab, crumb hub thành link", () => {
    expect(buildBreadcrumbItems("/warehouse", undefined, "report")).toEqual([
      { label: "Tổng quan", href: "/" },
      { label: "Bộ phận Kho", href: "/warehouse" },
      { label: "Báo cáo kho" },
    ]);
    expect(
      buildBreadcrumbItems("/engineering", undefined, "pr").map((i) => i.label),
    ).toEqual(["Tổng quan", "Bộ phận Thiết kế", "Đề xuất vật tư"]);
    // TASK-20261001 — Tài chính tách hub riêng `/finance`.
    expect(
      buildBreadcrumbItems("/finance", undefined, "cashbook").map((i) => i.label),
    ).toEqual(["Tổng quan", "Tài chính", "Sổ quỹ"]);
    // V4.4 UI nhóm E — `?tab=assembly` bị HIDDEN_FEATURES.legacyAssembly ẩn
    // (D10), trang hub fallback nội dung về "requests" → breadcrumb giờ khớp
    // đúng ("Yêu cầu sản xuất"), không còn tự mâu thuẫn với nhãn cũ "Quy trình
    // lắp ráp" (xem UI_INVENTORY.md §9 mục 3 + HUB_TAB_ALIASES["/operations"]).
    expect(
      buildBreadcrumbItems("/operations", undefined, "assembly").map((i) => i.label),
    ).toEqual(["Tổng quan", "Bộ phận Gia công", "Yêu cầu sản xuất"]);
  });

  it("khoá tab cũ được quy về tab hiện hành", () => {
    expect(hubTabLabel("/warehouse", "picking")).toBe("Nhập / Xuất kho");
    expect(hubTabLabel("/warehouse", "overview")).toBe("Sơ đồ kho");
    expect(hubTabLabel("/finance", "settle")).toBe("Công nợ & Thiết lập");
  });

  it("tab lạ / thiếu tab / route không phải hub → không thêm crumb", () => {
    expect(buildBreadcrumbItems("/warehouse", undefined, "khong-co")).toEqual([
      { label: "Tổng quan", href: "/" },
      { label: "Bộ phận Kho" },
    ]);
    expect(buildBreadcrumbItems("/warehouse", undefined, null)).toEqual([
      { label: "Tổng quan", href: "/" },
      { label: "Bộ phận Kho" },
    ]);
    // Trang con của hub không nhận tab (tab chỉ thuộc trang hub).
    expect(
      buildBreadcrumbItems("/items/ABC-001", undefined, "report").map((i) => i.label),
    ).toEqual(["Tổng quan", "Vật tư", "ABC-001"]);
    expect(hubTabLabel("/admin", "users")).toBeNull();
  });
});
