"use client";

import * as React from "react";
import { Clock, RotateCcw } from "lucide-react";
import { cn } from "@/lib/utils";
import { hhmm, workWindowMinutes } from "@/lib/shift-output/shift-window";
import { Panel } from "./primitives";

/**
 * P2 — "Giờ chạy thực tế (từ – đến)": mặc định = giờ ca, sửa tay được. Ô
 * `type=time` → bộ chọn giờ gốc của điện thoại. Kết thúc ≤ bắt đầu = qua nửa
 * đêm (tự hiểu, không cần tick). Dùng chung form Nhập ca + sheet Sửa dòng.
 */
export interface WorkTime {
  start: string;
  end: string;
  /** Người dùng đã sửa tay (đổi ca sẽ KHÔNG ghi đè). */
  dirty: boolean;
}

export const workTimeFromShift = (s: { startTime: string; endTime: string } | null | undefined): WorkTime => ({
  start: s ? hhmm(s.startTime) : "",
  end: s ? hhmm(s.endTime) : "",
  dirty: false,
});

export function fmtDuration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m} phút`;
  return m === 0 ? `${h} giờ` : `${h} giờ ${m} phút`;
}

export function WorkTimeSection({
  value,
  onChange,
  shift,
}: {
  value: WorkTime;
  onChange: (v: WorkTime) => void;
  shift: { name: string; startTime: string; endTime: string } | null;
}) {
  const startId = React.useId();
  const endId = React.useId();
  const minutes = value.start && value.end ? workWindowMinutes(value.start, value.end) : null;
  const overnight = minutes != null && value.end <= value.start;
  const differs = !!shift && (value.start !== hhmm(shift.startTime) || value.end !== hhmm(shift.endTime));
  const invalid = !!value.start && !!value.end && minutes == null;
  const input = cn(
    "h-12 w-full rounded-lg border bg-white px-3 text-center text-[18px] font-semibold tabular-nums text-zinc-900 outline-none",
    "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900",
    invalid ? "border-red-400 dark:border-red-500" : "border-zinc-200 dark:border-zinc-700",
  );

  return (
    <Panel
      title="Giờ chạy thực tế"
      hint={shift ? `Mặc định theo ${shift.name} (${hhmm(shift.startTime)}–${hhmm(shift.endTime)})` : undefined}
      right={
        differs && shift ? (
          <button
            type="button"
            onClick={() => onChange({ start: hhmm(shift.startTime), end: hhmm(shift.endTime), dirty: true })}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-md font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> Theo giờ ca
          </button>
        ) : undefined
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={startId} className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Từ
          </label>
          <input
            id={startId}
            type="time"
            step={60}
            required
            value={value.start}
            onChange={(e) => onChange({ ...value, start: e.target.value, dirty: true })}
            className={input}
          />
        </div>
        <div>
          <label htmlFor={endId} className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
            Đến
          </label>
          <input
            id={endId}
            type="time"
            step={60}
            required
            value={value.end}
            onChange={(e) => onChange({ ...value, end: e.target.value, dirty: true })}
            className={input}
          />
        </div>
      </div>
      <p
        className={cn(
          "mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm",
          invalid ? "font-medium text-red-600 dark:text-red-400" : "text-zinc-600 dark:text-zinc-400",
        )}
        role={invalid ? "alert" : undefined}
      >
        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
        {invalid ? (
          "Giờ kết thúc phải khác giờ bắt đầu."
        ) : minutes != null ? (
          <>
            <span>
              Chạy <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmtDuration(minutes)}</span>
            </span>
            {overnight ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-sm font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                qua nửa đêm
              </span>
            ) : null}
            {differs ? <span className="text-amber-700 dark:text-amber-400">khác giờ ca</span> : null}
          </>
        ) : (
          "Chọn giờ bắt đầu và kết thúc."
        )}
      </p>
    </Panel>
  );
}
