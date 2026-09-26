import { redirect } from "next/navigation";
import { hiddenRouteRedirect } from "@/lib/hidden-features";

/**
 * V4.1 Q4 — Đơn hàng bán đang TẠM ẨN (quyết định anh Thang). Mọi trang
 * `/orders*` (danh sách, tạo mới, chi tiết) chuyển về `/bom` thay vì 404 —
 * link cũ trong thông báo / bookmark không gãy. Code trang giữ nguyên; bật lại
 * bằng `HIDDEN_FEATURES.salesOrder = false`. API + DB giữ (Đợt 7 mới dọn).
 */
export default function OrdersLayout({ children }: { children: React.ReactNode }) {
  const to = hiddenRouteRedirect("/orders");
  if (to) redirect(to);
  return <>{children}</>;
}
