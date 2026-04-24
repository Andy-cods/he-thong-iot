import { redirect } from "next/navigation";

/**
 * V1.8 — Landing `/` redirect về `/bom` (BOM-centric workspace).
 *
 * Lý do: Dashboard V1.1 chứa dữ liệu mock + KPI mà người dùng hiếm khi xem.
 * BOM-centric workflow (V1.7) đã gom mọi panel sản xuất vào `/bom/[id]/grid`.
 * Landing trực tiếp `/bom` rút gọn 1 click cho use case chính.
 *
 * Dashboard component (KpiCard, OrdersReadinessTable, AlertsList,
 * SystemHealthCard) vẫn còn trong `components/domain/**` — có thể gắn lại
 * ở `/dashboard` sau này nếu cần.
 *
 * @see plans/260424-v1.8-ux-refresh-plan.md Batch 1
 */
export default function LandingPage() {
  redirect("/bom");
}
