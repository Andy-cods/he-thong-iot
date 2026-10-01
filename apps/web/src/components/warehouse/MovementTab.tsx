"use client";

import * as React from "react";
import type { MovementMode } from "./movement-mode";
import { useRouter, useSearchParams } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, ShieldCheck } from "lucide-react";
import { can } from "@iot/shared";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useSession } from "@/hooks/useSession";
import { useQcPendingCount } from "@/hooks/useInboundQc";
import { ReceivingMovementView } from "./ReceivingMovementView";
import { IssueMovementView } from "./IssueMovementView";
import { QcPendingView } from "./QcPendingView";

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
  // V4.1 Đợt 1a — segment "Chờ QC" + badge số dòng chờ kiểm.
  const { data: session } = useSession();
  const canSeeQc = can(session?.roles ?? [], "read", "qcInspection");
  const qcCount = useQcPendingCount(canSeeQc);
  const pendingQc = qcCount.data?.pending ?? 0;

  const setMode = (next: MovementMode) => {
    const params = new URLSearchParams(searchParams?.toString());
    params.set("tab", "movement");
    params.set("mode", next);
    router.push(`/warehouse?${params.toString()}`, { scroll: false });
  };

  return (
    <div className="flex h-full flex-col overflow-auto bg-zinc-50/30 dark:bg-zinc-950/30">
      {/* Segmented control Nhập ⇄ Xuất — dùng chung `Tabs variant="segmented"`
          (N7/A12) thay vì 3 <button> tự vẽ, màu active zinc-900 chuẩn toàn hệ. */}
      <div className="sticky top-0 z-sticky border-b border-zinc-200 bg-white px-4 py-3 dark:border-zinc-800 dark:bg-zinc-900 sm:px-6">
        <Tabs value={mode} onValueChange={(v) => setMode(v as MovementMode)}>
          <TabsList variant="segmented" aria-label="Chế độ Nhập/Xuất kho/Chờ QC">
            <TabsTrigger value="in" className="gap-1.5">
              <ArrowDownToLine className="h-4 w-4" aria-hidden />
              Nhập kho
            </TabsTrigger>
            <TabsTrigger value="out" className="gap-1.5">
              <ArrowUpFromLine className="h-4 w-4" aria-hidden />
              Xuất kho
            </TabsTrigger>
            {canSeeQc ? (
              <TabsTrigger value="qc" className="gap-1.5">
                <ShieldCheck className="h-4 w-4" aria-hidden />
                Chờ QC
                {pendingQc > 0 ? (
                  <span
                    className="ml-0.5 inline-flex min-w-[1.25rem] items-center justify-center rounded-full bg-amber-500 px-1.5 text-xs font-bold tabular-nums text-white"
                    aria-label={`${pendingQc} dòng chờ QC`}
                  >
                    {pendingQc > 99 ? "99+" : pendingQc}
                  </span>
                ) : null}
              </TabsTrigger>
            ) : null}
          </TabsList>
        </Tabs>
      </div>

      {/* Nội dung theo mode */}
      <div className="flex-1">
        {mode === "in" ? (
          <ReceivingMovementView />
        ) : mode === "qc" ? (
          <QcPendingView />
        ) : (
          <IssueMovementView />
        )}
      </div>
    </div>
  );
}
