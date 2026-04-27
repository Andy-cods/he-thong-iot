import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/procurement/purchase-orders` đã gộp vào
 * `/sales?tab=po`. Detail + new pages giữ nguyên.
 */
export default function PurchaseOrdersListRedirect() {
  redirect("/sales?tab=po");
}
