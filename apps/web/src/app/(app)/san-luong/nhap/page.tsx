"use client";

import { EntryForm } from "@/components/shift-output/EntryForm";
import { useShiftSite } from "@/components/shift-output/ShiftOutputShell";

/** V4.10 (TASK-20261118-001) — Sản lượng ca › Nhập ca. */
export default function Page() {
  const siteId = useShiftSite();
  return <EntryForm siteId={siteId} />;
}
