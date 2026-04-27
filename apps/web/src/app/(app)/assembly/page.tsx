import { redirect } from "next/navigation";

/**
 * V3 (TASK-20260427-025) — `/assembly` landing đã gộp vào
 * `/operations?tab=assembly`. Workspace `/assembly/[woId]` giữ nguyên.
 */
export default function AssemblyLandingRedirect() {
  redirect("/operations?tab=assembly");
}
