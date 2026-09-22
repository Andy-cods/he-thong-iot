import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  NAV_SECTION_LABEL,
  NAV_SECTION_ORDER,
  filterNavByRoles,
  groupNavBySection,
} from "./nav-items";

/**
 * V3.1 — Unit tests cho nav-items sau khi gộp Kế toán + Mua bán thành
 * section "purchasing" (Bộ phận Thu mua). 6 sections: dashboard / warehouse /
 * purchasing / engineering / operations / other.
 */

describe("NAV_ITEMS V3.1 cấu trúc 6 section", () => {
  it("có item Tổng quan section dashboard", () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === "/");
    expect(dashboard).toBeDefined();
    expect(dashboard?.section).toBe("dashboard");
    expect(dashboard?.label).toBe("Tổng quan");
  });

  it("Mua bán & Kế toán nằm trong section purchasing", () => {
    const fin = NAV_ITEMS.find((i) => i.section === "purchasing");
    expect(fin).toBeDefined();
    expect(fin?.href).toBe("/sales");
  });

  it("section labels có đủ 6 bộ phận", () => {
    expect(NAV_SECTION_LABEL).toEqual({
      dashboard:   "Tổng quan",
      warehouse:   "Bộ phận Kho",
      purchasing:  "Bộ phận Thu mua",
      engineering: "Bộ phận Thiết kế",
      operations:  "Bộ phận Gia công",
      other:       "Quản trị",
    });
  });

  it("section order follows the business workflow", () => {
    expect(NAV_SECTION_ORDER).toEqual([
      "dashboard",
      "engineering",
      "operations",
      "purchasing",
      "warehouse",
      "other",
    ]);
  });

  it("Bộ phận Kho có 1 hub /warehouse", () => {
    const warehouseHrefs = NAV_ITEMS.filter((i) => i.section === "warehouse").map((i) => i.href);
    expect(warehouseHrefs).toEqual(["/warehouse"]);
  });

  // V4.0 — section purchasing gồm hub Thu mua + phân hệ Tài chính mới.
  it("Purchasing section có hub /sales và /finance", () => {
    const finHrefs = NAV_ITEMS.filter((i) => i.section === "purchasing").map((i) => i.href);
    expect(finHrefs).toEqual(["/sales", "/finance"]);
  });

  it("Bộ phận Thiết kế có hub và lối tắt đề xuất vật tư", () => {
    const engHrefs = NAV_ITEMS.filter((i) => i.section === "engineering").map((i) => i.href);
    expect(engHrefs).toEqual(["/engineering", "/procurement/purchase-requests"]);
  });

  it("Bộ phận Gia công có hub và bảng sản xuất QC", () => {
    const opsHrefs = NAV_ITEMS.filter((i) => i.section === "operations").map((i) => i.href);
    expect(opsHrefs).toEqual(["/operations", "/production-board"]);
  });
});

describe("groupNavBySection", () => {
  it("preserve thứ tự section ORDER", () => {
    const groups = groupNavBySection(NAV_ITEMS);
    const sections = groups.map((g) => g.section);
    expect(sections[0]).toBe("dashboard");
    expect(sections.indexOf("engineering")).toBeLessThan(sections.indexOf("operations"));
    expect(sections.indexOf("operations")).toBeLessThan(sections.indexOf("purchasing"));
    expect(sections.indexOf("purchasing")).toBeLessThan(sections.indexOf("warehouse"));
  });

  it("section rỗng (sau filter) sẽ KHÔNG xuất hiện trong groups", () => {
    const groups = groupNavBySection([]);
    expect(groups).toEqual([]);
  });

  it("item không có section → vào group other", () => {
    const firstIcon = NAV_ITEMS[0]!.icon;
    const groups = groupNavBySection([{ href: "/x", label: "X", icon: firstIcon }]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.section).toBe("other");
  });
});

describe("filterNavByRoles", () => {
  it("undefined roles → giữ tất cả items", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, undefined);
    expect(filtered.length).toBe(NAV_ITEMS.length);
  });

  it("rỗng roles → giữ tất cả items", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, []);
    expect(filtered.length).toBe(NAV_ITEMS.length);
  });

  it("warehouse thấy BOM/đề xuất vật tư và hub kho", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["warehouse"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/engineering",
      "/procurement/purchase-requests",
      "/warehouse",
    ]);
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/sales");
    expect(hrefs).not.toContain("/operations");
  });

  it("planner thấy thiết kế và đề xuất vật tư", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["planner"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual(["/", "/engineering", "/procurement/purchase-requests"]);
  });

  // V3.11.5 — Bộ phận Mua hàng chỉ thấy Tổng quan + Đề xuất vật tư + Thu mua
  // (đã bỏ /engineering khỏi nav purchaser, xem nav-items.ts).
  it("purchaser thấy đề xuất vật tư và hub thu mua", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["purchaser"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/procurement/purchase-requests",
      "/sales",
    ]);
  });

  it("operator thấy BOM, đề xuất vật tư và hub gia công", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["operator"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/engineering",
      "/procurement/purchase-requests",
      "/operations",
    ]);
  });

  // V4.0 — Cổ đông: CHỈ Tổng quan + Tài chính + Bảng sản xuất (tiến độ gia
  // công). KHÔNG thấy Thiết kế / Đề xuất vật tư / Thu mua / Kho / Quản trị.
  it("shareholder chỉ thấy tổng quan, tài chính và bảng sản xuất", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["shareholder"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual(["/", "/production-board", "/finance"]);
    expect(hrefs).not.toContain("/engineering");
    expect(hrefs).not.toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/sales");
    expect(hrefs).not.toContain("/warehouse");
    expect(hrefs).not.toContain("/admin");
  });

  // V4.0 — Kế toán thấy Tài chính (phân hệ chính) + Đề xuất vật tư (YCVT).
  it("accountant thấy tài chính và đề xuất vật tư", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["accountant"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/finance");
    expect(hrefs).toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/warehouse");
  });

  it("V3.3 — admin thấy toàn bộ", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["admin"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/engineering");
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/operations");
    expect(hrefs).toContain("/warehouse");
    expect(hrefs).toContain("/");
  });
});
