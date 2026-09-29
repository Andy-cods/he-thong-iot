/**
 * V4.1 UI-BOM: dựng breadcrumb từ pathname (hàm thuần — dùng bởi
 * `useBreadcrumb` trong components/ui/breadcrumb.tsx).
 *
 * - Segment có nhãn tiếng Việt trong SEGMENT_LABELS → dùng nhãn.
 * - `segmentLabels` (ghi đè) ưu tiên cao nhất — vd UUID BOM → mã BOM.
 * - Segment dạng UUID không có nhãn ghi đè → "Chi tiết" (không hiện UUID thô).
 * - Item cuối không có href (trang hiện tại).
 * - V4.1 UI-27 (Đợt 6B): gốc = "Tổng quan" (khớp menu), không bao giờ hiện
 *   "Dashboard"; `audit` → "Nhật ký".
 * - V4.1 X6: trang hub dùng `?tab=` → thêm nhãn tab làm crumb cuối (crumb hub
 *   thành link). Tab lạ / không có tab → không thêm.
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

/** V4.1 UI-27: nhãn crumb gốc — trùng tên mục menu "/" (nav-items). */
export const ROOT_LABEL = "Tổng quan";

export const SEGMENT_LABELS: Record<string, string> = {
  "": ROOT_LABEL,
  items: "Vật tư",
  suppliers: "Nhà cung cấp",
  import: "Nhập Excel",
  new: "Tạo mới",
  pwa: "PWA",
  receive: "Nhận hàng",
  dashboard: "Tổng quan",
  admin: "Quản trị",
  // V4.1 UI-BOM: workspace BOM (trước hiện "bom" / "grid" thô).
  bom: "BOM",
  grid: "Lưới vật tư",
  tree: "Cây BOM",
  // V4.1 UI-09/X6: đủ nhãn tiếng Việt cho mọi route (trước hiện "engineering",
  // "purchase-requests", "users", "audit"… thô trên topbar). Khớp nav-items.
  engineering: "Bộ phận Thiết kế",
  operations: "Bộ phận Gia công",
  warehouse: "Bộ phận Kho",
  sales: "Bộ phận Thu mua",
  procurement: "Thu mua",
  "purchase-requests": "Đề xuất vật tư",
  "purchase-orders": "Đơn đặt hàng",
  "production-board": "Bảng sản xuất",
  "qc-inbound": "QC nhập kho",
  "material-requests": "Yêu cầu vật tư",
  "work-orders": "Lệnh sản xuất",
  orders: "Đơn hàng",
  receiving: "Nhận hàng",
  wizard: "Nhận hàng theo PO",
  assembly: "Lắp ráp",
  "lot-serial": "Lô / Serial",
  finance: "Tài chính",
  notifications: "Thông báo",
  me: "Cá nhân",
  profile: "Hồ sơ",
  productivity: "Năng suất",
  "change-password": "Đổi mật khẩu",
  "force-change-password": "Đổi mật khẩu",
  users: "Người dùng",
  audit: "Nhật ký",
  settings: "Cài đặt",
  sessions: "Phiên đăng nhập",
  reports: "Báo cáo",
  targets: "Chỉ tiêu",
  department: "Bộ phận",
  "employee-productivity": "Năng suất nhân viên",
  "new-dnvt": "Tạo phiếu ĐNVT",
  "new-mrf": "Tạo phiếu MRF",
  "new-lsx": "Tạo lệnh sản xuất",
};

/**
 * V4.1 X6: nhãn tab theo hub (`?tab=<key>`). PHẢI khớp nhãn hiển thị trong
 * HubTabsNav của từng trang hub / WarehouseTabsNav (giữ dạng dữ liệu thuần để
 * test được — đổi nhãn tab ở trang hub thì cập nhật cả ở đây).
 */
export const HUB_TAB_LABELS: Record<string, Record<string, string>> = {
  "/engineering": {
    bom: "BOM List",
    "work-orders": "Yêu cầu sản xuất",
    pr: "Yêu cầu mua",
  },
  "/operations": {
    requests: "Yêu cầu sản xuất",
    assembly: "Quy trình lắp ráp",
  },
  "/sales": {
    po: "Đặt hàng (PO)",
    suppliers: "Nhà cung cấp",
    "fin-overview": "Tài chính · Tổng quan",
    "fin-cashbook": "Tài chính · Sổ quỹ",
    "fin-settle": "Tài chính · Công nợ & Thiết lập",
  },
  "/warehouse": {
    layout: "Sơ đồ kho",
    items: "Vật tư",
    movement: "Nhập / Xuất kho",
    "goods-issues": "Phiếu xuất kho",
    "delivery-notes": "Phiếu giao hàng",
    report: "Báo cáo kho",
  },
};

/** Khoá tab cũ (bookmark/link cũ) → khoá tab hiện hành — khớp resolveTab của trang hub. */
export const HUB_TAB_ALIASES: Record<string, Record<string, string>> = {
  "/sales": {
    "fin-invoices": "fin-cashbook",
    "fin-payments": "fin-cashbook",
    "fin-receivables": "fin-settle",
    "fin-accounts": "fin-settle",
    "fin-categories": "fin-settle",
  },
  "/warehouse": {
    overview: "layout",
    picking: "movement",
    issue: "movement",
    receiving: "movement",
    "lot-serial": "items",
  },
};

/** Nhãn tab của hub; `null` nếu route không phải hub hoặc tab không hợp lệ. */
export function hubTabLabel(
  pathname: string,
  tab: string | null | undefined,
): string | null {
  if (!tab) return null;
  const hub = pathname.replace(/\/+$/, "") || "/";
  const labels = HUB_TAB_LABELS[hub];
  if (!labels) return null;
  const key = HUB_TAB_ALIASES[hub]?.[tab] ?? tab;
  return labels[key] ?? null;
}

/** "Dashboard" (mọi kiểu viết) KHÔNG bao giờ là nhãn crumb → "Tổng quan". */
function normalizeLabel(label: string): string {
  return label.trim().toLowerCase() === "dashboard" ? ROOT_LABEL : label;
}

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeDecode(seg: string): string {
  try {
    return decodeURIComponent(seg);
  } catch {
    return seg;
  }
}

export function buildBreadcrumbItems(
  pathname: string,
  segmentLabels?: Record<string, string | undefined>,
  tab?: string | null,
): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: ROOT_LABEL, href: "/" }];
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    const label =
      segmentLabels?.[seg] ??
      SEGMENT_LABELS[seg] ??
      (UUID_RE.test(seg) ? "Chi tiết" : safeDecode(seg));
    items.push({ label: normalizeLabel(label), href: acc });
  }
  // V4.1 X6: hub `?tab=` → crumb cuối là nhãn tab, crumb hub giữ link.
  const tabLabel = hubTabLabel(pathname, tab);
  if (tabLabel) items.push({ label: tabLabel });
  const lastItem = items[items.length - 1]!;
  items[items.length - 1] = { label: lastItem.label };
  return items;
}
