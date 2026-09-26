import { redirect } from "next/navigation";
import { withQuery, type PageSearchParams } from "@/lib/redirect-query";

/**
 * V3.7.73 — Demo "Tạo PR nhanh" đã bị bỏ. Redirect về form Phiếu MRF GTAM
 * chính thức (5 sections đầy đủ). Giữ route này để bookmark cũ không 404.
 */
// V4.1 AD-18 — giữ query (dữ liệu điền sẵn) khi chuyển sang form mới.
export default function PRQuickNewRedirect({
  searchParams,
}: {
  searchParams?: PageSearchParams;
}) {
  redirect(withQuery("/procurement/purchase-requests/new-mrf", searchParams));
}
