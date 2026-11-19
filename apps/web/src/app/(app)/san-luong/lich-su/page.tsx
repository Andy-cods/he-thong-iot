"use client";

import { Suspense } from "react";
import { HistoryView } from "@/components/shift-output/HistoryView";
import { useShiftSite } from "@/components/shift-output/ShiftOutputShell";

/** V4.10 (TASK-20261118-001) — Sản lượng ca › Lịch sử. */
export default function Page() {
  const siteId = useShiftSite();
  return (
    <Suspense fallback={null}>
      <HistoryView siteId={siteId} />
    </Suspense>
  );
}
