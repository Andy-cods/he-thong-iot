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
 *
 * TASK-20260922 — Tài chính không còn là nav item riêng (/finance), đã trở
 * thành tab con của /sales. Section "purchasing" giờ chỉ còn 1 item /sales,
 * gate bằng `entities: ["po", "supplier", "finance"]` (OR) để accountant/
 * shareholder cũng thấy item này (nhưng vào /sales chỉ thấy tab Tài chính).
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

  // TASK-20260922 — section purchasing chỉ còn 1 hub /sales (Tài chính đã
  // gộp làm tab con bên trong, không còn nav item /finance riêng).
  it("Purchasing section chỉ còn hub /sales (Tài chính đã gộp làm tab con)", () => {
    const finHrefs = NAV_ITEMS.filter((i) => i.section === "purchasing").map((i) => i.href);
    expect(finHrefs).toEqual(["/sales"]);
  });

  // /sales gate bằng `roles` (không phải `entities`) vì warehouse/operator/
  // planner cũng có quyền read entity "po"/"supplier" nhưng không thuộc bộ
  // phận Thu mua — xem comment chi tiết tại nav-items.ts.
  it("/sales chỉ cho đúng 4 role: admin/purchaser/accountant/shareholder", () => {
    const sales = NAV_ITEMS.find((i) => i.href === "/sales");
    expect(sales?.roles).toEqual(["admin", "purchaser", "accountant", "shareholder"]);
  });

  it("Bộ phận Thiết kế có hub và lối tắt đề xuất vật tư", () => {
    const engHrefs = NAV_ITEMS.filter((i) => i.section === "engineering").map((i) => i.href);
    expect(engHrefs).toEqual(["/engineering", "/procurement/purchase-requests"]);
  });

  it("Bộ phận Gia công có hub, bảng sản xuất QC và QC nhập kho", () => {
    const opsHrefs = NAV_ITEMS.filter((i) => i.section === "operations").map((i) => i.href);
    expect(opsHrefs).toEqual(["/operations", "/production-board", "/qc-inbound"]);
  });

  // V4.1 Đợt 1a — "QC nhập kho" chỉ role qc (admin/warehouse vào qua tab Kho).
  it("/qc-inbound chỉ cho role qc", () => {
    const qcInbound = NAV_ITEMS.find((i) => i.href === "/qc-inbound");
    expect(qcInbound?.roles).toEqual(["qc"]);
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

  // TASK-20260922 — Cổ đông: CHỈ Tổng quan + Bảng sản xuất + /sales (Tài
  // chính đã gộp làm tab con của /sales, không còn nav item /finance riêng).
  // Cổ đông vào /sales chỉ thấy 7 tab Tài chính (page.tsx tự lọc theo entity).
  it("shareholder chỉ thấy tổng quan, bảng sản xuất và hub thu mua (để xem Tài chính)", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["shareholder"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual(["/", "/production-board", "/sales"]);
    expect(hrefs).not.toContain("/engineering");
    expect(hrefs).not.toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/finance");
    expect(hrefs).not.toContain("/warehouse");
    expect(hrefs).not.toContain("/admin");
  });

  // TASK-20260922 — Kế toán thấy /sales (để vào tab Tài chính) + Đề xuất vật
  // tư (YCVT). Không còn nav item /finance riêng.
  it("accountant thấy hub thu mua (tài chính) và đề xuất vật tư", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["accountant"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/finance");
    expect(hrefs).not.toContain("/admin");
    expect(hrefs).not.toContain("/warehouse");
  });

  it("V4.1 — qc thấy đề xuất vật tư, bảng sản xuất và QC nhập kho", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["qc"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/procurement/purchase-requests",
      "/production-board",
      "/qc-inbound",
    ]);
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
