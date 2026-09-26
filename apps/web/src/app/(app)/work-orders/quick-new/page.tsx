import { redirect } from "next/navigation";
import { withQuery, type PageSearchParams } from "@/lib/redirect-query";

/**
 * V3.7.73 — Demo "Tạo nhanh" LSX đã bị bỏ. Redirect về form Phiếu LSX GTAM
 * chính thức (đầy đủ Routing + NVL + Dao cụ + spec). Giữ route để
 * bookmark cũ không 404.
 */
// V4.1 AD-18 — giữ query (dữ liệu điền sẵn) khi chuyển sang form mới.
export default function WOQuickNewRedirect({
  searchParams,
}: {
  searchParams?: PageSearchParams;
}) {
  redirect(withQuery("/work-orders/new-lsx", searchParams));
}
