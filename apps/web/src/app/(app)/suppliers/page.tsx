import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/suppliers` đã gộp vào `/sales?tab=suppliers`.
 * Detail page `/suppliers/[id]` giữ nguyên.
 */
export default function SuppliersListRedirect() {
  redirect("/sales?tab=suppliers");
}
