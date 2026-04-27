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
 * section "finance" (Tài chính & Mua bán). 6 sections: dashboard / warehouse /
 * finance / engineering / operations / other.
 */

describe("NAV_ITEMS V3.1 cấu trúc 6 section", () => {
  it("có item Tổng quan section dashboard", () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === "/");
    expect(dashboard).toBeDefined();
    expect(dashboard?.section).toBe("dashboard");
    expect(dashboard?.label).toBe("Tổng quan");
  });

  it("Mua bán & Kế toán nằm trong section finance", () => {
    const fin = NAV_ITEMS.find((i) => i.section === "finance");
    expect(fin).toBeDefined();
    expect(fin?.href).toBe("/sales");
  });

  it("section labels có đủ 6 bộ phận", () => {
    expect(NAV_SECTION_LABEL).toEqual({
      dashboard:   "Tổng quan",
      warehouse:   "Bộ phận Kho",
      finance:     "Tài chính & Mua bán",
      engineering: "Bộ phận Thiết kế",
      operations:  "Bộ phận Vận hành",
      other:       "Quản trị",
    });
  });

  it("section order: dashboard → warehouse → finance → engineering → operations → other", () => {
    expect(NAV_SECTION_ORDER).toEqual([
      "dashboard",
      "warehouse",
      "finance",
      "engineering",
      "operations",
      "other",
    ]);
  });

  it("Bộ phận Kho có 1 hub /warehouse", () => {
    const warehouseHrefs = NAV_ITEMS.filter((i) => i.section === "warehouse").map((i) => i.href);
    expect(warehouseHrefs).toEqual(["/warehouse"]);
  });

  it("Finance section có 1 hub /sales", () => {
    const finHrefs = NAV_ITEMS.filter((i) => i.section === "finance").map((i) => i.href);
    expect(finHrefs).toEqual(["/sales"]);
  });

  it("Bộ phận Thiết kế có 1 hub /engineering", () => {
    const engHrefs = NAV_ITEMS.filter((i) => i.section === "engineering").map((i) => i.href);
    expect(engHrefs).toEqual(["/engineering"]);
  });

  it("Bộ phận Vận hành có 1 hub /operations", () => {
    const opsHrefs = NAV_ITEMS.filter((i) => i.section === "operations").map((i) => i.href);
    expect(opsHrefs).toEqual(["/operations"]);
  });
});

describe("groupNavBySection", () => {
  it("preserve thứ tự section ORDER", () => {
    const groups = groupNavBySection(NAV_ITEMS);
    const sections = groups.map((g) => g.section);
    expect(sections[0]).toBe("dashboard");
    expect(sections.indexOf("warehouse")).toBeLessThan(sections.indexOf("finance"));
    expect(sections.indexOf("finance")).toBeLessThan(sections.indexOf("engineering"));
    expect(sections.indexOf("engineering")).toBeLessThan(sections.indexOf("operations"));
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

  it("role warehouse: thấy /warehouse, không thấy /admin", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["warehouse"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/warehouse");
    expect(hrefs).not.toContain("/admin");
  });

  it("role admin: thấy hầu hết items kể cả /admin", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["admin"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/engineering");
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/operations");
  });
});
