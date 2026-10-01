import { describe, expect, it } from "vitest";
import {
  NAV_ITEMS,
  NAV_SECTION_LABEL,
  NAV_SECTION_ORDER,
  filterNavByRoles,
} from "./nav-items";

/**
 * V3.1 — Unit tests cho nav-items. 7 sections: dashboard / warehouse /
 * purchasing / finance / engineering / operations / other.
 *
 * TASK-20261001 — Tài chính tách lại thành nav item RIÊNG (/finance), không
 * còn là tab con của /sales (đảo ngược quyết định TASK-20260922). Section
 * "purchasing" giờ chỉ còn /sales (PO + Nhà cung cấp, roles admin/purchaser);
 * "finance" là section mới chỉ 1 item /finance, gate bằng `entity: "finance"`.
 */

describe("NAV_ITEMS V3.1 cấu trúc 7 section", () => {
  it("có item Tổng quan section dashboard", () => {
    const dashboard = NAV_ITEMS.find((i) => i.href === "/");
    expect(dashboard).toBeDefined();
    expect(dashboard?.section).toBe("dashboard");
    expect(dashboard?.label).toBe("Tổng quan");
  });

  it("Bộ phận Thu mua nằm trong section purchasing", () => {
    const sales = NAV_ITEMS.find((i) => i.section === "purchasing");
    expect(sales).toBeDefined();
    expect(sales?.href).toBe("/sales");
  });

  // TASK-20261001 — Tài chính - Kế toán là nav item + section riêng.
  it("Tài chính - Kế toán nằm trong section finance riêng", () => {
    const fin = NAV_ITEMS.find((i) => i.section === "finance");
    expect(fin).toBeDefined();
    expect(fin?.href).toBe("/finance");
    expect(fin?.entity).toBe("finance");
  });

  it("section labels có đủ 7 bộ phận", () => {
    expect(NAV_SECTION_LABEL).toEqual({
      dashboard:   "Tổng quan",
      warehouse:   "Bộ phận Kho",
      purchasing:  "Bộ phận Thu mua",
      finance:     "Tài chính - Kế toán",
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
      "finance",
      "warehouse",
      "other",
    ]);
  });

  it("Bộ phận Kho có 1 hub /warehouse", () => {
    const warehouseHrefs = NAV_ITEMS.filter((i) => i.section === "warehouse").map((i) => i.href);
    expect(warehouseHrefs).toEqual(["/warehouse"]);
  });

  // TASK-20261001 — purchasing section chỉ còn hub /sales (Tài chính tách
  // hub riêng "finance" — xem test "Tài chính - Kế toán nằm trong section
  // finance riêng" ở trên).
  it("Purchasing section chỉ còn hub /sales", () => {
    const purchasingHrefs = NAV_ITEMS.filter((i) => i.section === "purchasing").map((i) => i.href);
    expect(purchasingHrefs).toEqual(["/sales"]);
  });

  // /sales gate bằng `roles` (không phải `entities`) vì warehouse/operator/
  // planner cũng có quyền read entity "po"/"supplier" nhưng không thuộc bộ
  // phận Thu mua — xem comment chi tiết tại nav-items.ts.
  it("/sales chỉ cho đúng 2 role: admin/purchaser", () => {
    const sales = NAV_ITEMS.find((i) => i.href === "/sales");
    expect(sales?.roles).toEqual(["admin", "purchaser"]);
  });

  it("Bộ phận Thiết kế có hub và lối tắt đề xuất vật tư", () => {
    const engHrefs = NAV_ITEMS.filter((i) => i.section === "engineering").map((i) => i.href);
    expect(engHrefs).toEqual(["/engineering", "/procurement/purchase-requests"]);
  });

  // V4.1 (27/09) — "Yêu cầu vật tư" trùng "Đề xuất vật tư" → bỏ khỏi menu.
  it("không còn menu /material-requests cho bất kỳ role nào", () => {
    expect(NAV_ITEMS.find((i) => i.href === "/material-requests")).toBeUndefined();
  });

  it("Bộ phận Gia công có hub, bảng sản xuất QC và QC nhập kho", () => {
    const opsHrefs = NAV_ITEMS.filter((i) => i.section === "operations").map((i) => i.href);
    expect(opsHrefs).toEqual([
      "/operations",
      "/production-board",
      "/warehouse?tab=movement&mode=qc",
    ]);
  });

  // V4.1 Đợt 1a — "QC nhập kho" chỉ role qc (admin/warehouse vào qua tab Kho).
  // V4.3 mục 4.3 — gộp màn: trỏ thẳng tab "Chờ QC" (route /qc-inbound cũ chỉ redirect).
  it("QC nhập kho chỉ cho role qc, trỏ thẳng tab Chờ QC", () => {
    const qcInbound = NAV_ITEMS.find((i) => i.href === "/warehouse?tab=movement&mode=qc");
    expect(qcInbound?.roles).toEqual(["qc"]);
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
    expect(hrefs).toEqual([
      "/",
      "/engineering",
      "/procurement/purchase-requests",
    ]);
  });

  // V3.11.5 — Bộ phận Mua hàng chỉ thấy Tổng quan + Đề xuất vật tư + Thu mua
  // (đã bỏ /engineering khỏi nav purchaser, xem nav-items.ts).
  // TASK-20261001 — purchaser ĐƠN (không kèm accountant) KHÔNG thấy "Tài
  // chính - Kế toán" (khớp yêu cầu "THUMUA-KETOAN chỉ purchaser thì không
  // thấy Tài chính").
  it("purchaser thấy đề xuất vật tư, Bảng sản xuất (thêm mã hàng) và hub thu mua, KHÔNG thấy Tài chính", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["purchaser"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual([
      "/",
      "/procurement/purchase-requests",
      "/production-board",
      "/sales",
    ]);
    expect(hrefs).not.toContain("/material-requests");
    expect(hrefs).not.toContain("/finance");
  });

  // TASK-20261001 — tài khoản thực tế `muahang` = purchaser + accountant →
  // phải thấy ĐỦ CẢ HAI mục "Bộ phận Thu mua" lẫn "Tài chính - Kế toán".
  it("purchaser + accountant (vd tài khoản muahang) thấy CẢ /sales lẫn /finance", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["purchaser", "accountant"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/finance");
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

  // TASK-20261001 — Cổ đông: CHỈ Tổng quan + Bảng sản xuất + /finance (Tài
  // chính tách hub riêng — cổ đông KHÔNG thuộc Thu mua nên không thấy /sales).
  it("shareholder chỉ thấy tổng quan, bảng sản xuất và hub Tài chính", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["shareholder"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toEqual(["/", "/production-board", "/finance"]);
    expect(hrefs).not.toContain("/engineering");
    expect(hrefs).not.toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/sales");
    expect(hrefs).not.toContain("/warehouse");
    expect(hrefs).not.toContain("/admin");
  });

  // TASK-20261001 — Kế toán thấy /finance (hub Tài chính riêng) + Đề xuất
  // vật tư (YCVT). KHÔNG thấy /sales (PO/Nhà cung cấp không phải việc của họ).
  it("accountant thấy hub Tài chính và đề xuất vật tư, KHÔNG thấy /sales", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["accountant"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/finance");
    expect(hrefs).toContain("/procurement/purchase-requests");
    expect(hrefs).not.toContain("/sales");
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
      "/warehouse?tab=movement&mode=qc",
    ]);
  });

  it("V3.3 — admin thấy toàn bộ", () => {
    const filtered = filterNavByRoles(NAV_ITEMS, ["admin"]);
    const hrefs = filtered.map((i) => i.href);
    expect(hrefs).toContain("/admin");
    expect(hrefs).toContain("/engineering");
    expect(hrefs).toContain("/sales");
    expect(hrefs).toContain("/finance");
    expect(hrefs).toContain("/operations");
    expect(hrefs).toContain("/warehouse");
    expect(hrefs).not.toContain("/material-requests");
    expect(hrefs).toContain("/");
  });
});
