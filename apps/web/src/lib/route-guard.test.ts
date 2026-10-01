import { describe, expect, it } from "vitest";
import type { Role } from "@iot/shared";
import { NAV_ITEMS, filterNavByRoles, filterNavForUser, navToCommandItems } from "./nav-items";
import { findRouteGuard, isRouteAllowed } from "./route-guard";
import { canWithOverrides } from "./permissions";
import { auditObjectEntity, scopedAuditEntity } from "./audit-scope";

const ALL_ROLES: Role[] = [
  "admin",
  "planner",
  "operator",
  "warehouse",
  "purchaser",
  "qc",
  "accountant",
  "shareholder",
];

describe("V4.1 AD-19 — canWithOverrides (deny > role > grant)", () => {
  it("DENY thắng quyền theo vai trò", () => {
    expect(canWithOverrides(["planner"], [], "read", "wo")).toBe(true);
    expect(
      canWithOverrides(["planner"], [{ entity: "wo", action: "read", granted: false }], "read", "wo"),
    ).toBe(false);
  });
  it("GRANT mở thêm quyền vai trò không có", () => {
    expect(canWithOverrides(["operator"], [], "read", "supplier")).toBe(false);
    expect(
      canWithOverrides(["operator"], [{ entity: "supplier", action: "read", granted: true }], "read", "supplier"),
    ).toBe(true);
  });
  it("override khác action không ảnh hưởng", () => {
    expect(
      canWithOverrides(["planner"], [{ entity: "wo", action: "update", granted: false }], "read", "wo"),
    ).toBe(true);
  });
});

describe("V4.1 AD-17 — route guard", () => {
  it("không đổi hành vi mặc định: mọi mục menu vai trò thấy đều vào được", () => {
    for (const r of ALL_ROLES) {
      for (const item of filterNavByRoles(NAV_ITEMS, [r])) {
        expect({ role: r, href: item.href, ok: isRouteAllowed(item.href, [r]) }).toEqual({
          role: r,
          href: item.href,
          ok: true,
        });
      }
    }
  });

  it("khớp prefix theo ranh giới đường dẫn, mục cụ thể trước mục chung", () => {
    expect(findRouteGuard("/procurement/purchase-orders/abc")?.entities).toEqual(["po"]);
    expect(findRouteGuard("/procurement/purchase-requests")?.entities).toEqual(["pr"]);
    expect(findRouteGuard("/administration")).toBeNull();
    expect(findRouteGuard("/")).toBeNull();
  });

  it("admin vào mọi trang", () => {
    expect(isRouteAllowed("/admin/users", ["admin"])).toBe(true);
    expect(
      isRouteAllowed("/warehouse", ["admin"], [{ entity: "inventory", action: "read", granted: false }]),
    ).toBe(true);
  });

  it("AD-16 — kế toán vào được trang NCC chi tiết; operator/cổ đông thì không", () => {
    expect(isRouteAllowed("/suppliers/123", ["accountant"])).toBe(true);
    expect(isRouteAllowed("/suppliers/123", ["purchaser"])).toBe(true);
    expect(isRouteAllowed("/suppliers/123", ["operator"])).toBe(false);
    expect(isRouteAllowed("/suppliers/123", ["shareholder"])).toBe(false);
  });

  it("AD-19 — GRANT đọc NCC mở trang NCC (mục chỉ gate theo entity)", () => {
    expect(
      isRouteAllowed("/suppliers/1", ["operator"], [{ entity: "supplier", action: "read", granted: true }]),
    ).toBe(true);
  });

  it("AD-19 — DENY đọc kho → chặn trang Kho + ẩn menu Kho", () => {
    // V4.3 mục 4.3 — `/warehouse` nay thêm entity `qcInspection` (role `qc`
    // vào qua tab "Chờ QC", gộp `/qc-inbound`); `warehouse` role CŨNG có sẵn
    // `qcInspection: [read, update]` nên chỉ DENY `inventory` không còn đủ
    // chặn trang (API vẫn chặn thật qua `requireCan` — đây chỉ là guard UI).
    // DENY cả 2 entity mới đúng ý "thu hồi toàn bộ quyền Kho".
    const deny = [
      { entity: "inventory", action: "read", granted: false },
      { entity: "qcInspection", action: "read", granted: false },
    ];
    expect(isRouteAllowed("/warehouse", ["warehouse"], deny)).toBe(false);
    const nav = filterNavForUser(NAV_ITEMS, ["warehouse"], deny).map((i) => i.href);
    expect(nav).not.toContain("/warehouse");
    expect(filterNavForUser(NAV_ITEMS, ["warehouse"]).map((i) => i.href)).toContain("/warehouse");
  });

  it("V4.6 — mọi vai nghiệp vụ thấy menu + vào được '/procurement/purchase-requests'; display/shareholder thì không", () => {
    const businessRoles: Role[] = [
      "admin",
      "planner",
      "operator",
      "warehouse",
      "purchaser",
      "qc",
      "accountant",
    ];
    const prNavItem = NAV_ITEMS.find((i) => i.href === "/procurement/purchase-requests");
    expect(prNavItem?.roles).toEqual(expect.arrayContaining(businessRoles));
    for (const r of businessRoles) {
      expect(filterNavByRoles(NAV_ITEMS, [r]).map((i) => i.href)).toContain(
        "/procurement/purchase-requests",
      );
      expect(isRouteAllowed("/procurement/purchase-requests", [r])).toBe(true);
    }
    expect(isRouteAllowed("/procurement/purchase-requests", ["shareholder"])).toBe(false);
    expect(
      filterNavByRoles(NAV_ITEMS, ["shareholder"]).map((i) => i.href),
    ).not.toContain("/procurement/purchase-requests");
  });

  // V4.3 mục 4.3 — gộp `/qc-inbound` vào tab Kho "Chờ QC": role `qc` vào được
  // `/warehouse` (qua `qcInspection`), operator/planner (không role kho/qc,
  // không quyền kho nào) thì không.
  it("V4.3 — qc vào được /warehouse (qcInspection), operator thì không", () => {
    expect(isRouteAllowed("/warehouse", ["qc"])).toBe(true);
    expect(isRouteAllowed("/warehouse", ["operator"])).toBe(false);
    expect(isRouteAllowed("/warehouse", ["planner"])).toBe(false);
  });

  it("AD-19 — GRANT không mở hub của bộ phận khác (mục có roles)", () => {
    expect(
      isRouteAllowed("/warehouse", ["planner"], [{ entity: "inventory", action: "read", granted: true }]),
    ).toBe(false);
  });

  // V4.5 QA-C P1-2 — RBAC matrix cấp read:productionBoard cho planner/operator/
  // warehouse từ V3.8 nhưng route-guard.ts quên cập nhật → 3 vai này gọi API
  // /api/production-board được 200 nhưng vào trang bị redirect về Tổng quan.
  it("QA-C P1-2 — planner/operator/warehouse vào được /production-board (khớp matrix read)", () => {
    for (const r of ["planner", "operator", "warehouse"] as Role[]) {
      expect(isRouteAllowed("/production-board", [r])).toBe(true);
    }
    // Vai không có read:productionBoard trong matrix vẫn bị chặn trang.
    expect(isRouteAllowed("/production-board", ["accountant"])).toBe(false);
  });
});

describe("V4.1 AD-13 — Ctrl+K dùng chung nguồn với menu", () => {
  it("mục Ctrl+K = đúng các mục menu (không thừa, không thiếu) cho mọi vai trò", () => {
    for (const r of ALL_ROLES) {
      const nav = filterNavForUser(NAV_ITEMS, [r]);
      const cmd = navToCommandItems(nav);
      expect(cmd.map((c) => c.href)).toEqual(nav.filter((n) => !n.disabled).map((n) => n.href));
      for (const c of cmd) expect(isRouteAllowed(c.href, [r])).toBe(true);
    }
  });

  it("không hiện Quản trị cho người không phải admin, không có /material-requests", () => {
    for (const r of ALL_ROLES.filter((x) => x !== "admin")) {
      const hrefs = navToCommandItems(filterNavForUser(NAV_ITEMS, [r])).map((c) => c.href);
      expect(hrefs).not.toContain("/admin");
    }
    const adminHrefs = navToCommandItems(filterNavForUser(NAV_ITEMS, ["admin"])).map((c) => c.href);
    expect(adminHrefs).toContain("/admin");
    expect(adminHrefs).not.toContain("/material-requests");
  });
});

describe("V4.1 AD-02 — phạm vi nhật ký cho người không phải admin", () => {
  it("chỉ truy vấn 1 loại + objectId mới được xét theo quyền chứng từ", () => {
    expect(scopedAuditEntity({ entity: ["work_order"], objectId: "x" })).toBe("wo");
    expect(scopedAuditEntity({ entity: ["purchase_order"], objectId: "x" })).toBe("po");
    expect(scopedAuditEntity({ entity: ["work_order"] })).toBeNull();
    expect(scopedAuditEntity({ objectId: "x" })).toBeNull();
    expect(scopedAuditEntity({ entity: ["work_order", "purchase_order"], objectId: "x" })).toBeNull();
  });

  it("loại nhạy cảm (tài khoản, phiên, đăng nhập sai, quyền) không mở cho người thường", () => {
    for (const t of ["user_account", "session", "login_failed", "user_permission_override", "không_rõ"]) {
      expect(auditObjectEntity(t)).toBeNull();
    }
  });
});
