import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * TASK-20260922 — Tài chính đã chuyển thành tab con của `/sales` (Bộ phận
 * Thu mua) theo yêu cầu user ("tôi muốn function tài chính là function con
 * của bộ phận thu mua"). Giữ route `/finance` làm alias redirect để không
 * gãy link/bookmark cũ — trỏ sang tab "Tổng quan" (tab tài chính đầu tiên).
 */
export default function FinancePage() {
  redirect("/sales?tab=fin-overview");
}
