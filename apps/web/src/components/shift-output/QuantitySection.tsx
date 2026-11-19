"use client";

import * as React from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CatalogItem } from "@/hooks/useShiftOutput";
import { Chip, Panel, Stepper } from "./primitives";

/**
 * V4.10 — khối Số lượng (OK / NG / Kế hoạch / Sửa lại) + lưới lý do lỗi (khi
 * NG > 0) + Dừng máy (tuỳ chọn). Dùng chung form Nhập ca và sheet Sửa dòng.
 */
export interface QtyState {
  qtyOk: number;
  qtyNg: number;
  qtyPlanned: number | null;
  qtyRework: number | null;
  /** reasonId → SL lỗi. */
  defects: Record<string, number>;
  /** reasonId → phút dừng. */
  downtimes: Record<string, number>;
  showDowntime: boolean;
}

export const emptyQty = (): QtyState => ({
  qtyOk: 0,
  qtyNg: 0,
  qtyPlanned: null,
  qtyRework: null,
  defects: {},
  downtimes: {},
  showDowntime: false,
});

export const sumValues = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + (b || 0), 0);

export function qtyToPayload(q: QtyState) {
  const defects = Object.entries(q.defects)
    .filter(([, v]) => v > 0)
    .map(([reasonId, qty]) => ({ reasonId, qty }));
  const downtimes = Object.entries(q.downtimes)
    .filter(([, v]) => v > 0)
    .map(([reasonId, minutes]) => ({ reasonId, minutes }));
  return {
    qtyOk: q.qtyOk,
    qtyNg: q.qtyNg,
    qtyPlanned: q.qtyPlanned,
    qtyRework: q.qtyNg > 0 ? q.qtyRework : null,
    defects: q.qtyNg > 0 ? defects : [],
    downtimes,
    // Mở "Dừng máy" mà không chọn lý do = 0' (có ghi nhận, khả dụng 100%); không mở = không ghi.
    downtimeMin: downtimes.length > 0 ? downtimes.reduce((a, d) => a + d.minutes, 0) : q.showDowntime ? 0 : null,
  };
}

export function QuantitySection({
  value,
  onChange,
  defectReasons,
  downtimeReasons,
  shiftMinutes,
  compact,
}: {
  value: QtyState;
  onChange: (patch: Partial<QtyState>) => void;
  defectReasons: CatalogItem[];
  downtimeReasons: CatalogItem[];
  shiftMinutes: number;
  compact?: boolean;
}) {
  const [showMore, setShowMore] = React.useState(value.qtyPlanned != null || (value.qtyRework ?? 0) > 0);
  const defectSum = sumValues(value.defects);
  const unclassified = value.qtyNg - defectSum;
  const downtimeSum = sumValues(value.downtimes);

  return (
    <>
      <Panel title="Số lượng">
        <div className="space-y-3">
          <Stepper label="Đạt (OK)" tone="ok" big value={value.qtyOk} onChange={(v) => onChange({ qtyOk: v ?? 0 })} />
          <Stepper label="Lỗi (NG)" tone="ng" big={!compact} value={value.qtyNg} onChange={(v) => onChange({ qtyNg: v ?? 0 })} />
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="flex min-h-11 items-center gap-1 text-md font-medium text-indigo-700 dark:text-indigo-300"
            aria-expanded={showMore}
          >
            {showMore ? <ChevronUp className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
            Kế hoạch & sửa lại (tuỳ chọn)
          </button>
          {showMore ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Stepper label="Kế hoạch (KH)" allowEmpty value={value.qtyPlanned} onChange={(v) => onChange({ qtyPlanned: v })} />
              {value.qtyNg > 0 ? (
                <Stepper
                  label="Sửa lại được"
                  allowEmpty
                  max={value.qtyNg}
                  value={value.qtyRework}
                  onChange={(v) => onChange({ qtyRework: v })}
                />
              ) : null}
            </div>
          ) : null}
        </div>
      </Panel>

      {value.qtyNg > 0 ? (
        <Panel
          title="Lý do lỗi"
          right={
            unclassified !== 0 ? (
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-sm font-medium",
                  unclassified > 0
                    ? "bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300"
                    : "bg-red-50 text-red-700 dark:bg-red-950/40 dark:text-red-300",
                )}
              >
                {unclassified > 0 ? `Còn ${unclassified} chưa phân loại` : `Vượt NG ${-unclassified}`}
              </span>
            ) : (
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-sm font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Đủ {value.qtyNg}
              </span>
            )
          }
        >
          <ReasonGrid
            reasons={defectReasons}
            values={value.defects}
            onChange={(defects) => onChange({ defects })}
            max={value.qtyNg}
            fillDefault={() => Math.max(1, unclassified)}
          />
        </Panel>
      ) : null}

      <Panel
        title="Dừng máy (tuỳ chọn)"
        hint={value.showDowntime ? `Tổng ${downtimeSum}' / ${shiftMinutes}' ca` : "Chỉ ghi khi máy có dừng trong ca"}
        right={
          <button
            type="button"
            onClick={() => onChange({ showDowntime: !value.showDowntime, ...(value.showDowntime ? { downtimes: {} } : {}) })}
            className="min-h-11 rounded-lg px-3 text-md font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            aria-expanded={value.showDowntime}
          >
            {value.showDowntime ? "Bỏ" : "Ghi dừng máy"}
          </button>
        }
      >
        {value.showDowntime ? (
          <>
            <ReasonGrid
              reasons={downtimeReasons}
              values={value.downtimes}
              onChange={(downtimes) => onChange({ downtimes })}
              max={shiftMinutes}
              suffix="'"
              fillDefault={() => 10}
            />
            {downtimeSum > shiftMinutes ? (
              <p className="mt-2 text-sm font-medium text-red-600 dark:text-red-400">
                Tổng dừng {downtimeSum}&apos; vượt độ dài ca {shiftMinutes}&apos;.
              </p>
            ) : null}
          </>
        ) : null}
      </Panel>
    </>
  );
}

/** Chạm chip lý do → bật ô số ngay dưới; chạm lại chip để bỏ. */
function ReasonGrid({
  reasons,
  values,
  onChange,
  max,
  suffix,
  fillDefault,
}: {
  reasons: CatalogItem[];
  values: Record<string, number>;
  onChange: (v: Record<string, number>) => void;
  max: number;
  suffix?: string;
  fillDefault: () => number;
}) {
  const active = reasons.filter((r) => values[r.id] !== undefined);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {reasons.map((r) => {
          const on = values[r.id] !== undefined;
          return (
            <Chip
              key={r.id}
              selected={on}
              tone={on ? "neutral" : "brand"}
              onClick={() => {
                const next = { ...values };
                if (on) delete next[r.id];
                else next[r.id] = Math.min(max, fillDefault());
                onChange(next);
              }}
              sub={r.isPlanned ? "kế hoạch" : undefined}
            >
              {r.name}
              {on ? ` · ${values[r.id]}${suffix ?? ""}` : ""}
            </Chip>
          );
        })}
      </div>
      {active.length > 0 ? (
        <div className="space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
          {active.map((r) => (
            <Stepper
              key={r.id}
              label={r.name}
              value={values[r.id] ?? 0}
              min={1}
              max={max}
              step10={false}
              suffix={suffix}
              onChange={(v) => onChange({ ...values, [r.id]: v ?? 1 })}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
