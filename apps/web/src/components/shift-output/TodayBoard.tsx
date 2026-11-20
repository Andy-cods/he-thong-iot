"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Lock, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { cn } from "@/lib/utils";
import { addDays } from "@/lib/shift-output/shift-window";
import type { BoardCell } from "@/lib/shift-output/board";
import { useShiftBoard } from "@/hooks/useShiftOutput";
import { fmtDay, fmtInt, fmtPct, KpiTile, weekday } from "./primitives";
import { NoShiftNotice } from "./NoShiftNotice";
import { PartImage } from "./PartImage";

/**
 * V4.10 — "Hôm nay": KPI ngày + lưới Máy × Ca. Ô đỏ "Chưa nhập" = ca đã kết
 * thúc mà máy chưa có dòng; xám "Chưa tới ca"; tự làm mới 60 giây. Điện thoại:
 * thẻ theo máy.
 */
export function TodayBoard({ siteId }: { siteId: string | null }) {
  const [date, setDate] = React.useState<string | undefined>(undefined);
  const q = useShiftBoard(date, siteId);
  const data = q.data;
  const shownDate = data?.date ?? date;

  const cellOf = (m: string, s: string): BoardCell | undefined => data?.cells.find((c) => c.machineId === m && c.shiftId === s);
  const k = data?.kpi;
  const isToday = date === undefined;
  const todayRef = React.useRef<string | null>(null);
  if (isToday && data) todayRef.current = data.date;

  if (q.isError && !data) {
    return (
      <div className="p-4">
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-4 p-3 sm:p-4 lg:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center rounded-xl bg-white shadow-xs dark:bg-zinc-900">
          <button
            type="button"
            aria-label="Ngày trước"
            className="flex h-11 w-11 items-center justify-center rounded-l-xl hover:bg-zinc-50 dark:hover:bg-zinc-800"
            onClick={() => shownDate && setDate(addDays(shownDate, -1))}
          >
            <ChevronLeft className="h-5 w-5" aria-hidden="true" />
          </button>
          <div className="min-w-[9.5rem] px-2 text-center">
            <div className="text-md font-semibold text-zinc-900 dark:text-zinc-50">
              {isToday ? "Hôm nay" : shownDate ? `${weekday(shownDate)}, ${fmtDay(shownDate)}` : "…"}
            </div>
            {isToday && shownDate ? <div className="text-sm text-zinc-500">{weekday(shownDate)}, {fmtDay(shownDate)}</div> : null}
          </div>
          <button
            type="button"
            aria-label="Ngày sau"
            disabled={isToday}
            className="flex h-11 w-11 items-center justify-center rounded-r-xl hover:bg-zinc-50 disabled:opacity-30 dark:hover:bg-zinc-800"
            onClick={() => {
              if (!shownDate) return;
              const next = addDays(shownDate, 1);
              setDate(todayRef.current && next >= todayRef.current ? undefined : next);
            }}
          >
            <ChevronRight className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        {!isToday ? (
          <button type="button" onClick={() => setDate(undefined)} className="min-h-11 rounded-lg px-3 text-md font-medium text-indigo-700 dark:text-indigo-300">
            Về hôm nay
          </button>
        ) : null}
        <div className="ml-auto flex items-center gap-2 text-sm text-zinc-500">
          {data && data.missingCount > 0 ? (
            <span className="rounded-full bg-red-50 px-2.5 py-1 font-semibold text-red-700 dark:bg-red-950/40 dark:text-red-300">
              {data.missingCount} ô chưa nhập
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => void q.refetch()}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 hover:bg-white dark:hover:bg-zinc-900"
            aria-label="Làm mới"
          >
            <RefreshCw className={cn("h-4 w-4", q.isFetching && "animate-spin")} aria-hidden="true" />
            <span className="hidden sm:inline">Tự làm mới 60 giây</span>
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {k ? (
          <>
            <KpiTile label="Tổng OK" value={fmtInt(k.ok)} sub={`${k.entries} dòng`} tone="success" />
            <KpiTile label="Tổng NG" value={fmtInt(k.ng)} tone={k.ng > 0 ? "danger" : undefined} />
            <KpiTile label="% NG" value={fmtPct(k.ngPct)} tone={k.ngPct != null && k.ngPct > 10 ? "danger" : undefined} />
            <KpiTile label="% đạt kế hoạch" value={fmtPct(k.planPct, 0)} sub={k.planned != null ? `KH ${fmtInt(k.planned)}` : "Chưa nhập KH"} />
            <KpiTile label="Phút dừng" value={k.downtimeMin == null ? "—" : `${fmtInt(k.downtimeMin)}'`} tone={k.downtimeMin ? "warning" : undefined} />
            <KpiTile label="% khả dụng" value={fmtPct(k.availabilityPct, 0)} sub={k.availableMin ? `trên ${fmtInt(k.availableMin)}' máy-ca` : undefined} />
          </>
        ) : (
          [...Array(6)].map((_, i) => <Skeleton key={i} className="h-[84px] rounded-xl" />)
        )}
      </div>

      {data && data.shifts.length === 0 ? <NoShiftNotice /> : null}
      {data && data.shifts.length > 0 ? (
        <>
          {/* Desktop: bảng Máy × Ca */}
          <div className="hidden overflow-hidden rounded-xl bg-white shadow-xs dark:bg-zinc-900 md:block">
            <table className="w-full table-fixed border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 dark:border-zinc-800">
                  <th className="w-40 px-4 py-3 text-left text-sm font-semibold text-zinc-500">Máy</th>
                  {data.shifts.map((s) => (
                    <th key={s.id} className="px-3 py-3 text-left text-sm font-semibold text-zinc-500">
                      {s.name} <span className="font-normal">{s.startTime}–{s.endTime}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.machines.map((m) => (
                  <tr key={m.id} className="border-b border-zinc-100 last:border-0 dark:border-zinc-800">
                    <td className="px-4 py-3 align-top">
                      <div className="font-mono text-md font-semibold text-zinc-900 dark:text-zinc-50">{m.code}</div>
                      <div className="truncate text-sm text-zinc-500">{m.name}</div>
                    </td>
                    {data.shifts.map((s) => (
                      <td key={s.id} className="p-2 align-top">
                        <Cell cell={cellOf(m.id, s.id)} date={data.date} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {/* Điện thoại: thẻ theo máy */}
          <div className="space-y-3 md:hidden">
            {data.machines.map((m) => (
              <section key={m.id} className="rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900">
                <div className="mb-2 flex items-baseline gap-2">
                  <span className="font-mono text-lg font-semibold">{m.code}</span>
                  <span className="truncate text-sm text-zinc-500">{m.name}</span>
                </div>
                <div className={cn("grid gap-2", data.shifts.length <= 2 ? "grid-cols-2" : "grid-cols-3")}>
                  {data.shifts.map((s) => (
                    <div key={s.id}>
                      <div className="mb-1 truncate text-sm font-medium text-zinc-500">
                        {s.name} <span className="font-normal">{s.startTime}–{s.endTime}</span>
                      </div>
                      <Cell cell={cellOf(m.id, s.id)} date={data.date} compact />
                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
          {data.machines.length === 0 ? <p className="text-md text-zinc-500">Chưa có máy — vào Cài đặt để thêm.</p> : null}
        </>
      ) : !data ? (
        <Skeleton className="h-56 rounded-xl" />
      ) : null}

      <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-zinc-500">
        <Legend className="bg-white ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700" label="Đã nhập" />
        <Legend className="bg-red-50 ring-1 ring-red-200 dark:bg-red-950/40 dark:ring-red-900" label="Chưa nhập (ca đã hết)" />
        <Legend className="bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900" label="Đang chạy" />
        <Legend className="bg-zinc-100 dark:bg-zinc-800" label="Chưa tới ca" />
      </p>
    </div>
  );
}

function Legend({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-3 w-3 rounded", className)} aria-hidden="true" />
      {label}
    </span>
  );
}

function Cell({ cell, date, compact }: { cell: BoardCell | undefined; date: string; compact?: boolean }) {
  if (!cell) return null;
  const base = cn("block w-full rounded-lg text-left", compact ? "min-h-[64px] p-2" : "min-h-[76px] p-3");
  if (cell.state === "done") {
    return (
      <Link
        href={`/san-luong/lich-su?from=${date}&to=${date}&machineId=${cell.machineId}`}
        className={cn(base, "bg-zinc-50 ring-1 ring-zinc-200 hover:ring-indigo-300 dark:bg-zinc-800 dark:ring-zinc-700")}
      >
        <div className="flex items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1">
              <span className={cn("font-semibold tabular-nums text-zinc-900 dark:text-zinc-50", compact ? "text-lg" : "text-xl")}>{fmtInt(cell.ok)}</span>
              {cell.locked ? <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-zinc-400" aria-label="Đã khoá" /> : null}
            </div>
            {cell.ng > 0 ? <div className="text-sm font-medium tabular-nums text-red-600 dark:text-red-400">NG {fmtInt(cell.ng)}</div> : null}
          </div>
          {(cell.images ?? []).length > 0 ? (
            <span className="flex shrink-0 gap-1">
              {(cell.images ?? []).slice(0, compact ? 1 : 2).map((im) => (
                <PartImage key={im.partId} partId={im.partId} assetId={im.assetId} size={compact ? 32 : 40} alt={im.partCode} zoomable={false} />
              ))}
            </span>
          ) : null}
        </div>
        <div className="truncate text-sm text-zinc-500">{cell.partCodes.join(", ")}</div>
        {(cell.workRanges ?? []).length > 0 ? (
          <div className="truncate text-sm text-amber-700 dark:text-amber-400" title="Giờ chạy thực tế (khác giờ ca)">
            {(cell.workRanges ?? []).join(", ")}
          </div>
        ) : null}
      </Link>
    );
  }
  if (cell.state === "missing") {
    return (
      <Link href="/san-luong/nhap" className={cn(base, "bg-red-50 ring-1 ring-red-200 hover:ring-red-400 dark:bg-red-950/40 dark:ring-red-900")}>
        <div className="font-semibold text-red-700 dark:text-red-300">Chưa nhập</div>
        <div className="text-sm text-red-600/80 dark:text-red-400/80">Chạm để nhập</div>
      </Link>
    );
  }
  if (cell.state === "running") {
    return (
      <Link href="/san-luong/nhap" className={cn(base, "bg-indigo-50 ring-1 ring-indigo-200 dark:bg-indigo-950/40 dark:ring-indigo-900")}>
        <div className="font-semibold text-indigo-700 dark:text-indigo-300">Đang chạy</div>
        <div className="text-sm text-indigo-600/80 dark:text-indigo-300/80">Nhập khi hết ca</div>
      </Link>
    );
  }
  return (
    <div className={cn(base, "bg-zinc-100 dark:bg-zinc-800/60")}>
      <div className="font-medium text-zinc-400 dark:text-zinc-500">Chưa tới ca</div>
    </div>
  );
}
