import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/procurement/purchase-requests` list đã gộp vào
 * `/engineering?tab=pr`. Detail / new pages giữ nguyên.
 */
export default function PurchaseRequestsListRedirect() {
  redirect("/engineering?tab=pr");
}
