import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/bom` list đã gộp vào `/engineering?tab=bom`.
 * Detail / grid / new pages giữ nguyên.
 */
export default function BomListRedirect() {
  redirect("/engineering?tab=bom");
}
