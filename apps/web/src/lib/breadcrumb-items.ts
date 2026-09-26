/**
 * V4.1 UI-BOM: dựng breadcrumb từ pathname (hàm thuần — dùng bởi
 * `useBreadcrumb` trong components/ui/breadcrumb.tsx).
 *
 * - Segment có nhãn tiếng Việt trong SEGMENT_LABELS → dùng nhãn.
 * - `segmentLabels` (ghi đè) ưu tiên cao nhất — vd UUID BOM → mã BOM.
 * - Segment dạng UUID không có nhãn ghi đè → "Chi tiết" (không hiện UUID thô).
 * - Item cuối không có href (trang hiện tại).
 */

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

export const SEGMENT_LABELS: Record<string, string> = {
  "": "Trang chủ",
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
): BreadcrumbItem[] {
  const segments = pathname.split("/").filter(Boolean);
  const items: BreadcrumbItem[] = [{ label: "Trang chủ", href: "/" }];
  let acc = "";
  for (const seg of segments) {
    acc += `/${seg}`;
    const label =
      segmentLabels?.[seg] ??
      SEGMENT_LABELS[seg] ??
      (UUID_RE.test(seg) ? "Chi tiết" : safeDecode(seg));
    items.push({ label, href: acc });
  }
  const lastItem = items[items.length - 1]!;
  items[items.length - 1] = { label: lastItem.label };
  return items;
}
