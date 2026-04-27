import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  NAV_SECTION_LABEL,
  NAV_SECTION_ORDER,
  filterNavByRoles,
  groupNavBySection,
} from "./nav-items";

/**
 * V3 (TASK-20260427-025) — Unit tests cho nav-items 7-section regroup theo
 * bộ phận với hub gộp:
 *   - dashboard / warehouse / purchasing / engineering / operations /
 *     accounting / other.
 */

describe("NAV_ITEMS V3 cấu trúc 7 section (post-TASK-025)", () => {
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

  it("section labels có đủ 7 bộ phận", () => {
    expect(NAV_SECTION_LABEL).toEqual({
      dashboard: "Tổng quan",
      warehouse: "Bộ phận Kho",
      purchasing: "Bộ phận Mua bán",
      engineering: "Bộ phận Thiết kế",
      operations: "Bộ phận Vận hành",
      accounting: "Bộ phận Kế toán",
      other: "Quản trị",
    });
  });

  it("section order: dashboard → warehouse → purchasing → engineering → operations → accounting → other", () => {
    expect(NAV_SECTION_ORDER).toEqual([
      "dashboard",
      "warehouse",
      "purchasing",
      "engineering",
      "operations",
      "accounting",
      "other",
    ]);
  });

  it("Bộ phận Kho có 1 hub /warehouse", () => {
    const warehouseHrefs = NAV_ITEMS.filter(
      (i) => i.section === "warehouse",
    ).map((i) => i.href);
    expect(warehouseHrefs).toEqual(["/warehouse"]);
  });

  it("Bộ phận Mua bán có 1 hub /sales", () => {
    const purchasingHrefs = NAV_ITEMS.filter(
      (i) => i.section === "purchasing",
    ).map((i) => i.href);
    expect(purchasingHrefs).toEqual(["/sales"]);
  });

  it("Bộ phận Thiết kế có 1 hub /engineering", () => {
    const engHrefs = NAV_ITEMS.filter(
      (i) => i.section === "engineering",
    ).map((i) => i.href);
    expect(engHrefs).toEqual(["/engineering"]);
  });

  it("Bộ phận Vận hành có 1 hub /operations", () => {
    const opsHrefs = NAV_ITEMS.filter((i) => i.section === "operations").map(
      (i) => i.href,
    );
    expect(opsHrefs).toEqual(["/operations"]);
  });
});

describe("groupNavBySection", () => {
  it("preserve thứ tự section ORDER", () => {
    const groups = groupNavBySection(NAV_ITEMS);
    const sections = groups.map((g) => g.section);
    expect(sections[0]).toBe("dashboard");
    expect(sections.indexOf("warehouse")).toBeLessThan(
      sections.indexOf("purchasing"),
    );
    expect(sections.indexOf("purchasing")).toBeLessThan(
      sections.indexOf("engineering"),
    );
    expect(sections.indexOf("engineering")).toBeLessThan(
      sections.indexOf("operations"),
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
