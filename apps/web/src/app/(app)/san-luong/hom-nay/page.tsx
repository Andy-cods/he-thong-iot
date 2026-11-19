"use client";

import { TodayBoard } from "@/components/shift-output/TodayBoard";
import { useShiftSite } from "@/components/shift-output/ShiftOutputShell";

/** V4.10 (TASK-20261118-001) — Sản lượng ca › Hôm nay. */
export default function Page() {
  const siteId = useShiftSite();
  return <TodayBoard siteId={siteId} />;
}
