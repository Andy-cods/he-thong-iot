import { redirect } from "next/navigation";
import { withQuery, type PageSearchParams } from "@/lib/redirect-query";

/**
 * V3.7.73 — Cả wizard cũ + quick-new đều đã bỏ. Mọi đường vào "Tạo LSX
 * mới" giờ về form Phiếu LSX GTAM (5 section, đầy đủ Routing/NVL/Dao cụ).
 */
// V4.1 AD-18 — giữ query (dữ liệu điền sẵn) khi chuyển sang form mới.
export default function WorkOrdersNewRedirect({
  searchParams,
}: {
  searchParams?: PageSearchParams;
}) {
  redirect(withQuery("/work-orders/new-lsx", searchParams));
}
