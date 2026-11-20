"use client";

import { Suspense } from "react";
import { SetupView } from "@/components/shift-output/SetupView";
import { useShiftSite } from "@/components/shift-output/ShiftOutputShell";

/** V4.10 (TASK-20261118-001) — Sản lượng ca › Cài đặt. */
export default function Page() {
  const siteId = useShiftSite();
  return (
    <Suspense fallback={null}>
      <SetupView siteId={siteId} />
    </Suspense>
  );
}
