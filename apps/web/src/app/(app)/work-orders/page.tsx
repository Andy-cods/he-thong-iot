import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/work-orders` list đã gộp vào
 * `/engineering?tab=work-orders`. Detail / new pages giữ nguyên.
 */
export default function WorkOrdersListRedirect() {
  redirect("/engineering?tab=work-orders");
}
