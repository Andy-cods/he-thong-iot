"use client";

import { ReportsView } from "@/components/shift-output/ReportsView";
import { useShiftSite } from "@/components/shift-output/ShiftOutputShell";

/** V4.10 (TASK-20261118-001) — Sản lượng ca › Báo cáo. */
export default function Page() {
  const siteId = useShiftSite();
  return <ReportsView siteId={siteId} />;
}
