import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  NAV_SECTION_LABEL,
  NAV_SECTION_ORDER,
  filterNavByRoles,
  groupNavBySection,
} from "./nav-items";

/**
 * V3 — Unit tests cho nav-items 6-section regroup theo bộ phận.
 */

describe("NAV_ITEMS V3 cấu trúc 6 section", () => {
  it("có item Tổng quan section dashboard", () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === "/");
    expect(dashboard).toBeDefined();
    expect(dashboard?.section).toBe("dashboard");
    expect(dashboard?.label).toBe("Tổng quan");
  });

  it("có item Kế toán placeholder disabled", () => {
    const acc = NAV_ITEMS.find((i) => i.section === "accounting");
    expect(acc).toBeDefined();
    expect(acc?.disabled).toBe(true);
    expect(acc?.badge).toBe("Sắp ra mắt");
  });

  it("section labels có đủ 6 bộ phận", () => {
    expect(NAV_SECTION_LABEL).toEqual({
      dashboard: "Tổng quan",
      warehouse: "Bộ phận Kho",
      purchasing: "Bộ phận Mua bán",
      engineering: "Bộ phận Kỹ thuật",
      accounting: "Bộ phận Kế toán",
      other: "Quản trị",
    });
  });

  it("section order: dashboard → warehouse → purchasing → engineering → accounting → other", () => {
    expect(NAV_SECTION_ORDER).toEqual([
      "dashboard",
      "warehouse",
      "purchasing",
      "engineering",
      "accounting",
      "other",
    ]);
  });

  it("Bộ phận Kho có items + lot-serial + receiving", () => {
    const warehouseHrefs = NAV_ITEMS.filter(
      (i) => i.section === "warehouse",
    ).map((i) => i.href);
    expect(warehouseHrefs).toEqual([
      "/items",
      "/lot-serial",
      "/receiving",
    ]);
  });

  it("Bộ phận Mua bán có suppliers + PO", () => {
    const purchasingHrefs = NAV_ITEMS.filter(
      (i) => i.section === "purchasing",
    ).map((i) => i.href);
    expect(purchasingHrefs).toEqual([
      "/suppliers",
      "/procurement/purchase-orders",
    ]);
  });

  it("Bộ phận Kỹ thuật có BOM + orders + WO + assembly + PR + import", () => {
    const engHrefs = NAV_ITEMS.filter(
      (i) => i.section === "engineering",
    ).map((i) => i.href);
    expect(engHrefs).toEqual([
      "/bom",
      "/orders",
      "/work-orders",
      "/assembly",
      "/procurement/purchase-requests",
      "/import",
    ]);
  });
});

describe("groupNavBySection", () => {
  it("preserve thứ tự section ORDER", () => {
    const groups = groupNavBySection(NAV_ITEMS);
    const sections = groups.map((g) => g.section);
    // Thứ tự phải khớp NAV_SECTION_ORDER (chỉ section có item).
    expect(sections[0]).toBe("dashboard");
    expect(sections.indexOf("warehouse")).toBeLessThan(
      sections.indexOf("purchasing"),
    );
    expect(sections.indexOf("purchasing")).toBeLessThan(
      sections.indexOf("engineering"),
    );
  });

  it("section rỗng (sau filter) sẽ KHÔNG xuất hiện trong groups", () => {
    const groups = groupNavBySection([]);
    expect(groups).toEqual([]);
  });

  it("item không có section → vào group other", () => {
    const firstIcon = NAV_ITEMS[0]!.icon;
    const groups = groupNavBySection([
      { href: "/x", label: "X", icon: firstIcon },
    ]);
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

  it("role warehouse: thấy /items + /lot-serial + /receiving (không thấy /admin)", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["warehouse"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/items");
    expect(hrefs).toContain("/lot-serial");
    expect(hrefs).toContain("/receiving");
    expect(hrefs).not.toContain("/admin");
  });

  it("role admin: thấy hầu hết items kể cả /admin", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["admin"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/bom");
    expect(hrefs).toContain("/work-orders");
  });
});
