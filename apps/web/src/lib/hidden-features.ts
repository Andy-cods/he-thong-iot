/**
 * V4.1 Đợt 4 — Tính năng TẠM ẨN theo quyết định anh Thang (AUDIT §0/§8).
 *
 *  - Q2: nhập kho thành phẩm khi hoàn tất lệnh SX — chưa có backend PROD_IN.
 *  - Q4: Đơn hàng bán, ECO, Thiếu vật tư.
 *  - D10: Lắp ráp kiểu cũ (cần đơn hàng bán + snapshot) — ẩn cùng Đơn hàng bán.
 *
 * "Ẩn" = gỡ khỏi giao diện + chuyển hướng route. KHÔNG xoá bảng/API (Đợt 7).
 * Bật lại: đổi cờ tương ứng về `false` rồi build lại.
 *
 * File THUẦN (không import server/client-only) — dùng được ở server component,
 * client component và vitest.
 */
export const HIDDEN_FEATURES = {
  /** Q4 — Đơn hàng bán (`/orders*`, tab/chip "Đơn hàng"). */
  salesOrder: true,
  /** Q4 — ECO. */
  eco: true,
  /** Q4 — Thiếu vật tư (shortage). */
  shortage: true,
  /** D10 — Lắp ráp kiểu cũ (`/assembly*`, tab "Lắp ráp"). */
  legacyAssembly: true,
  /** Q2 — Nhập kho thành phẩm khi hoàn tất lệnh SX. */
  fgReceipt: true,
} as const;

export type HiddenFeatureKey = keyof typeof HIDDEN_FEATURES;

interface HiddenRoute {
  prefix: string;
  feature: HiddenFeatureKey;
  /** Đích chuyển hướng khi route bị ẩn. */
  to: string;
}

/** Thứ tự quan trọng: prefix dài/cụ thể đứng trước. */
const HIDDEN_ROUTES: HiddenRoute[] = [
  { prefix: "/orders", feature: "salesOrder", to: "/bom" },
  { prefix: "/eco", feature: "eco", to: "/bom" },
  { prefix: "/shortage", feature: "shortage", to: "/bom" },
  { prefix: "/assembly", feature: "legacyAssembly", to: "/operations" },
];

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`) || pathname.startsWith(`${prefix}?`);
}

/**
 * Trả đích chuyển hướng nếu `pathname` thuộc tính năng đang ẩn, ngược lại null.
 *
 * `/assembly/<woId>` → `/work-orders/<woId>?tab=progress` (giữ đúng lệnh SX
 * thay vì đẩy người dùng về trang chung).
 */
export function hiddenRouteRedirect(pathname: string): string | null {
  const path = pathname.split("#")[0] ?? pathname;
  for (const r of HIDDEN_ROUTES) {
    if (!HIDDEN_FEATURES[r.feature]) continue;
    if (!matchesPrefix(path, r.prefix)) continue;
    if (r.prefix === "/assembly") {
      const m = /^\/assembly\/([^/?#]+)/.exec(path);
      if (m?.[1]) return `/work-orders/${encodeURIComponent(decodeURIComponent(m[1]))}?tab=progress`;
    }
    return r.to;
  }
  return null;
}

/** true nếu link (href nội bộ) trỏ vào tính năng đang ẩn — dùng lọc nav/link. */
export function isHiddenHref(href: string): boolean {
  return hiddenRouteRedirect(href) !== null;
}
