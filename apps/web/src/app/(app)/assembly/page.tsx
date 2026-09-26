import { redirect } from "next/navigation";
import { hiddenRouteRedirect } from "@/lib/hidden-features";

/**
 * V3 (TASK-20260427-025) — `/assembly` landing đã gộp vào
 * `/operations?tab=assembly`. Workspace `/assembly/[woId]` giữ nguyên.
 *
 * V4.1 D10 — tab "Quy trình lắp ráp" đang ẩn → về `/operations`.
 */
export default function AssemblyLandingRedirect() {
  redirect(hiddenRouteRedirect("/assembly") ?? "/operations?tab=assembly");
}
