/**
 * V4.5 QA-D P1-2 / QA-A — chuyển hướng link/bookmark cũ `/sales?tab=fin-*`
 * sang `/finance` tương ứng (Tài chính tách hub riêng từ TASK-20261001).
 *
 * BUG gốc: `route-guard.ts` rule `/sales` chỉ còn `roles: ["admin",
 * "purchaser"]` (bỏ accountant/shareholder khi tách hub) — route guard chạy ở
 * `(app)/layout.tsx` TRƯỚC khi `sales/page.tsx` kịp redirect, nên accountant/
 * shareholder gọi link cũ bị chặn thẳng về `/?denied=1`, không bao giờ tới
 * được logic redirect (dù comment trong `sales/page.tsx` ghi rõ ý định "MỌI
 * link/bookmark cũ tự chuyển sang /finance").
 *
 * FIX: tách hàm map THUẦN ra đây, gọi từ `(app)/layout.tsx` TRƯỚC
 * `isRouteAllowed` (áp dụng cho MỌI vai, kể cả admin/purchaser — hành vi cũ
 * không đổi vì `sales/page.tsx` cũng redirect y hệt).
 */
export interface LegacyFinTabTarget {
  tab: string;
  sub?: string;
}

/**
 * Map tab Tài chính cũ (từng ở `/sales`) → { tab, sub } mới ở `/finance`.
 * `fin-overview` đổi tên key thành `overview` (hub mới không cần tiền tố
 * `fin-` vì không còn lẫn với tab PO/Nhà cung cấp khác hub nữa).
 */
export const LEGACY_FIN_TAB_REDIRECT: Record<string, LegacyFinTabTarget> = {
  "fin-overview": { tab: "overview" },
  "fin-cashbook": { tab: "cashbook" },
  "fin-settle": { tab: "settle" },
  // Alias cũ hơn (trước TASK-20260922 gộp sub-tab) — vẫn thấy trong thông báo/
  // email cũ, worker reminder jobs trước khi sửa (defense in depth).
  "fin-invoices": { tab: "cashbook", sub: "invoices" },
  "fin-payments": { tab: "cashbook", sub: "payments" },
  "fin-receivables": { tab: "settle", sub: "receivables" },
  "fin-accounts": { tab: "settle", sub: "accounts" },
  "fin-categories": { tab: "settle", sub: "categories" },
};

/**
 * `pathname` KHÔNG kèm query (vd "/sales"); `search` là chuỗi kiểu
 * `location.search`/`req.nextUrl.search` (rỗng hoặc bắt đầu bằng "?").
 *
 * Trả về đường dẫn đích (vd "/finance?tab=cashbook&sub=invoices&invoiceId=1")
 * nếu khớp link Tài chính cũ, `null` nếu không áp dụng (giữ nguyên hành vi
 * hiện tại — mọi path/tab khác của `/sales` không bị đụng tới).
 */
export function resolveLegacySalesFinRedirect(
  pathname: string,
  search: string,
): string | null {
  if (pathname !== "/sales") return null;
  const params = new URLSearchParams(search);
  const requested = params.get("tab");
  if (!requested) return null;
  const legacyFin = LEGACY_FIN_TAB_REDIRECT[requested];
  if (!legacyFin) return null;

  const qs = new URLSearchParams();
  qs.set("tab", legacyFin.tab);
  const sub = params.get("sub") ?? legacyFin.sub;
  if (sub) qs.set("sub", sub);
  // Giữ nguyên MỌI query khác (vd `invoiceId` từ `financeInvoiceLink()`).
  for (const [k, v] of params.entries()) {
    if (k === "tab" || k === "sub") continue;
    qs.set(k, v);
  }
  return `/finance?${qs.toString()}`;
}
