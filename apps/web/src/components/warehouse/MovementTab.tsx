"use client";

import * as React from "react";
import type { MovementMode } from "./movement-mode";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { ReceivingMovementView } from "./ReceivingMovementView";
import { IssueMovementView } from "./IssueMovementView";

/**
 * Wave 5 Phase A — `<MovementTab>` khung chung cho `/warehouse?tab=movement`.
 *
 * Gộp 2 tab cũ "Nhận hàng" (`ReceivingTab`) + "Xuất hàng" (`IssueTab`) thành
 * 1 tab "Nhập / Xuất kho" với segmented control chuyển chế độ. Khung chung
 * (segmented control) nằm ở đây; nội dung mỗi mode nằm ở 2 view riêng vì data
 * model khác nhau (PO-based vs. issue-request/free-form) — xem plan
 * `plans/v4-finance/wave-5-warehouse-redesign.md` §3.1.
 */

// `MovementMode` + `resolveMovementMode` ĐÃ CHUYỂN sang `./movement-mode.ts`
// (file KHÔNG có "use client") vì Server Component `warehouse/page.tsx` cần
// gọi helper này — import từ file client sẽ nhận stub và ném
// `TypeError: T is not a function` lúc runtime. Re-export để các nơi đang
// import từ đây không gãy.
export { resolveMovementMode, type MovementMode } from "./movement-mode";

export function MovementTab({ mode }: { mode: MovementMode }) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const setMode = (next: MovementMode) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("tab", "movement");
    params.set("mode", next);
    router.push(`/warehouse?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      {/* Segmented control Nhập ⇄ Xuất */}
      <div className="sticky top-0 z-sticky border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <div
          role="tablist"
          aria-label="Chế độ Nhập/Xuất kho"
          className="inline-flex h-10 items-center rounded-xl bg-zinc-100 p-1 dark:bg-zinc-800"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === "in"}
            onClick={() => setMode("in")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors",
              mode === "in"
                ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            <ArrowDownToLine className="h-4 w-4" aria-hidden />
            Nhập kho
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === "out"}
            onClick={() => setMode("out")}
            className={cn(
              "inline-flex h-8 items-center gap-1.5 rounded-lg px-4 text-sm font-semibold transition-colors",
              mode === "out"
                ? "bg-white text-indigo-700 shadow-sm dark:bg-zinc-900 dark:text-indigo-300"
                : "text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-200",
            )}
          >
            <ArrowUpFromLine className="h-4 w-4" aria-hidden />
            Xuất kho
          </button>
        </div>
      </div>

      {/* Nội dung theo mode */}
      <div className="flex-1">
        {mode === "in" ? <ReceivingMovementView /> : <IssueMovementView />}
      </div>
    </div>
  );
}
