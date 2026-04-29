import { redirect } from "next/navigation";

/**
 * V3.7.12 — Wizard cũ (snapshot-based) bị xoá theo feedback user.
 * Redirect sang /work-orders/quick-new (form đơn giản đa-SKU + auto issue request).
 */
export default function WorkOrdersNewRedirect() {
  redirect("/work-orders/quick-new");
}
