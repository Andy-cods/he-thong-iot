import { describe, expect, it } from "vitest";
import { HIDDEN_FEATURES, hiddenRouteRedirect, isHiddenHref } from "./hidden-features";
import { NAV_ITEMS, filterNavByRoles, type NavItem } from "./nav-items";
import { Factory } from "lucide-react";

describe("V4.1 Q4/D10 — hiddenRouteRedirect", () => {
  it("cờ ẩn đang bật", () => {
    expect(HIDDEN_FEATURES.salesOrder).toBe(true);
    expect(HIDDEN_FEATURES.legacyAssembly).toBe(true);
    expect(HIDDEN_FEATURES.fgReceipt).toBe(true);
  });
  it("đơn hàng bán → /bom", () => {
    expect(hiddenRouteRedirect("/orders")).toBe("/bom");
    expect(hiddenRouteRedirect("/orders/SO-2609-0001")).toBe("/bom");
    expect(hiddenRouteRedirect("/orders/new")).toBe("/bom");
  });
  it("ECO / Thiếu vật tư → /bom", () => {
    expect(hiddenRouteRedirect("/eco/ECO-1")).toBe("/bom");
    expect(hiddenRouteRedirect("/shortage")).toBe("/bom");
  });
  it("lắp ráp kiểu cũ: landing → /operations, workspace → trang lệnh SX", () => {
    expect(hiddenRouteRedirect("/assembly")).toBe("/operations");
    expect(hiddenRouteRedirect("/assembly/abc-123")).toBe(
      "/work-orders/abc-123?tab=progress",
    );
  });
  it("không bắt nhầm route khác", () => {
    expect(hiddenRouteRedirect("/work-orders/1")).toBeNull();
    expect(hiddenRouteRedirect("/ordersx")).toBeNull();
    expect(hiddenRouteRedirect("/bom/1/grid")).toBeNull();
    expect(hiddenRouteRedirect("/procurement/purchase-orders")).toBeNull();
    expect(isHiddenHref("/engineering?tab=work-orders")).toBe(false);
  });
});

describe("V4.1 Q4 — nav lọc tính năng ẩn", () => {
  const extra: NavItem[] = [
    ...NAV_ITEMS,
    { href: "/orders", label: "Đơn hàng", icon: Factory },
    { href: "/assembly", label: "Lắp ráp", icon: Factory },
  ];
  it("admin không thấy mục ẩn", () => {
    const out = filterNavByRoles(extra, ["admin"]).map((i) => i.href);
    expect(out).not.toContain("/orders");
    expect(out).not.toContain("/assembly");
    expect(out).toContain("/engineering");
  });
  it("không có roles (fallback) cũng lọc mục ẩn", () => {
    const out = filterNavByRoles(extra, undefined).map((i) => i.href);
    expect(out).not.toContain("/orders");
    expect(out.length).toBe(NAV_ITEMS.length);
  });
});
