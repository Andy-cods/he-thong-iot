"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import type { JourneyView } from "@/lib/bom-stage-journey";

/** Thanh 5 bước (tô theo SL đã tới bước đó) + nhãn "Gia công 1 · Chờ phôi 1". */
export function StageJourneyBars({ journey }: { journey: JourneyView }) {
  return (
    <div className="flex gap-0.5" aria-hidden>
      {journey.stages.map((s, i) => (
        <i
          key={s.code}
          title={`${s.label}: đã tới ${formatNumber(s.reached)}/${formatNumber(journey.required)} · đang có ${formatNumber(s.qty)}`}
          className="block h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-700"
        >
          <b
            className={cn(
              "block h-full rounded-full",
              i === journey.stages.length - 1 ? "bg-emerald-500" : "bg-indigo-500",
            )}
            style={{ width: `${s.pct}%` }}
          />
        </i>
      ))}
    </div>
  );
}

export function StageJourneyCell({ journey }: { journey: JourneyView | null }) {
  if (!journey) return <span className="text-zinc-300 dark:text-zinc-600">—</span>;
  const { parts, full, split, required } = journey;
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <StageJourneyBars journey={journey} />
      <div className="flex min-w-0 items-center gap-1 text-[11px] leading-tight">
        {full ? (
          <b className="text-emerald-600 dark:text-emerald-400">
            Đã giao lắp ráp đủ {formatNumber(required)}
          </b>
        ) : (
          <span className="min-w-0 truncate text-zinc-600 dark:text-zinc-300">
            {parts.slice(0, 2).map((p, i) => (
              <React.Fragment key={p.code}>
                {i > 0 ? " · " : ""}
                <b className="font-semibold">{p.label}</b> {formatNumber(p.qty)}
              </React.Fragment>
            ))}
            {parts.length > 2 ? " …" : ""}
          </span>
        )}
        {split && !full && (
          <span className="shrink-0 rounded-full bg-indigo-50 px-1.5 py-px text-[10px] font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
            từng phần
          </span>
        )}
      </div>
    </div>
  );
}
