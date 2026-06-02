import { redirect } from "next/navigation";

/**
 * V3.7.73 — Demo "Tạo nhanh" LSX đã bị bỏ. Redirect về form Phiếu LSX GTAM
 * chính thức (đầy đủ Routing + NVL + Dao cụ + spec). Giữ route để
 * bookmark cũ không 404.
 */
export default function WOQuickNewRedirect() {
  redirect("/work-orders/new-lsx");
}
