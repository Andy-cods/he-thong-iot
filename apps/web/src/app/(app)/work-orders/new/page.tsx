import { redirect } from "next/navigation";

/**
 * V3.7.73 — Cả wizard cũ + quick-new đều đã bỏ. Mọi đường vào "Tạo LSX
 * mới" giờ về form Phiếu LSX GTAM (5 section, đầy đủ Routing/NVL/Dao cụ).
 */
export default function WorkOrdersNewRedirect() {
  redirect("/work-orders/new-lsx");
}
