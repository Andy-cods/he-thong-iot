import { describe, expect, it } from "vitest";
import { resolveLegacySalesFinRedirect } from "./legacy-redirects";

/**
 * V4.5 QA-D P1-2 — hàm map THUẦN dùng ở `(app)/layout.tsx` (trước
 * `isRouteAllowed`) + `sales/page.tsx` (fallback) để chuyển link/bookmark cũ
 * `/sales?tab=fin-*` sang `/finance` tương ứng.
 */
describe("resolveLegacySalesFinRedirect", () => {
  it("path khác /sales → null (không đụng)", () => {
    expect(resolveLegacySalesFinRedirect("/finance", "?tab=overview")).toBeNull();
    expect(resolveLegacySalesFinRedirect("/sales/123", "?tab=fin-cashbook")).toBeNull();
  });

  it("/sales không có tab hoặc tab không phải alias Tài chính → null", () => {
    expect(resolveLegacySalesFinRedirect("/sales", "")).toBeNull();
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=po")).toBeNull();
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=suppliers")).toBeNull();
  });

  it("3 alias chính fin-overview/fin-cashbook/fin-settle → /finance đúng tab", () => {
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-overview")).toBe(
      "/finance?tab=overview",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-cashbook")).toBe(
      "/finance?tab=cashbook",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-settle")).toBe(
      "/finance?tab=settle",
    );
  });

  it("5 alias cũ hơn có sub tương ứng", () => {
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-invoices")).toBe(
      "/finance?tab=cashbook&sub=invoices",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-payments")).toBe(
      "/finance?tab=cashbook&sub=payments",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-receivables")).toBe(
      "/finance?tab=settle&sub=receivables",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-accounts")).toBe(
      "/finance?tab=settle&sub=accounts",
    );
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-categories")).toBe(
      "/finance?tab=settle&sub=categories",
    );
  });

  it("giữ nguyên query khác (vd invoiceId từ financeInvoiceLink())", () => {
    expect(
      resolveLegacySalesFinRedirect("/sales", "?tab=fin-cashbook&invoiceId=abc-123"),
    ).toBe("/finance?tab=cashbook&invoiceId=abc-123");
  });

  it("sub tường minh trên URL cũ thắng sub mặc định của alias", () => {
    expect(
      resolveLegacySalesFinRedirect("/sales", "?tab=fin-cashbook&sub=payments"),
    ).toBe("/finance?tab=cashbook&sub=payments");
  });

  it("QA-D P1-2 — accountant/shareholder cũng map đúng (hàm không phân biệt vai trò)", () => {
    // Guard vai trò nằm ở route-guard.ts/layout.tsx — hàm map này THUẦN,
    // không biết gì về vai trò, nên không có khái niệm "chặn theo vai" ở đây.
    expect(resolveLegacySalesFinRedirect("/sales", "?tab=fin-cashbook")).toBe(
      "/finance?tab=cashbook",
    );
  });
});
