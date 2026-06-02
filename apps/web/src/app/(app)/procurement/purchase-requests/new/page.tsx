import { redirect } from "next/navigation";

/**
 * V3.7.73 — Demo "Tạo PR nhanh" đã bị bỏ. Redirect về form Phiếu MRF GTAM
 * chính thức (5 sections đầy đủ). Giữ route này để bookmark cũ không 404.
 */
export default function PRQuickNewRedirect() {
  redirect("/procurement/purchase-requests/new-mrf");
}
