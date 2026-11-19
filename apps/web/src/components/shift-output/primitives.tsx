"use client";

import * as React from "react";
import { Minus, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V4.10 (TASK-20261118-001) — khối dựng giao diện Sản lượng ca (mobile-first):
 * vùng chạm ≥ 44px, chữ ô nhập 16px (iOS không tự phóng to), 1 màu thương hiệu
 * (indigo) + xám + màu trạng thái chức năng. Không gradient.
 */

export function Panel({
  title,
  hint,
  right,
  children,
  className,
}: {
  title?: React.ReactNode;
  hint?: React.ReactNode;
  right?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-xl bg-white p-4 shadow-xs dark:bg-zinc-900", className)}>
      {title || right ? (
        <header className="mb-3 flex items-start justify-between gap-2">
          <div className="min-w-0">
            {title ? <h2 className="text-md font-semibold text-zinc-900 dark:text-zinc-50">{title}</h2> : null}
            {hint ? <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">{hint}</p> : null}
          </div>
          {right}
        </header>
      ) : null}
      {children}
    </section>
  );
}

export function Chip({
  selected,
  onClick,
  children,
  sub,
  tone = "brand",
  className,
  disabled,
  ariaLabel,
}: {
  selected?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "brand" | "danger" | "neutral";
  className?: string;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  const on =
    tone === "danger"
      ? "border-red-500 bg-red-50 text-red-800 dark:border-red-400 dark:bg-red-950/40 dark:text-red-200"
      : tone === "neutral"
        ? "border-zinc-700 bg-zinc-800 text-white dark:border-zinc-300 dark:bg-zinc-200 dark:text-zinc-900"
        : "border-indigo-600 bg-indigo-600 text-white dark:border-indigo-400 dark:bg-indigo-500";
  return (
    <button
      type="button"
      aria-pressed={selected}
      aria-label={ariaLabel}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "inline-flex min-h-11 select-none flex-col items-start justify-center rounded-lg border px-3.5 py-1.5 text-left text-md font-medium transition-colors",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500",
        "disabled:cursor-not-allowed disabled:opacity-50",
        selected
          ? on
          : "border-zinc-200 bg-white text-zinc-800 hover:border-zinc-300 hover:bg-zinc-50 active:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:hover:bg-zinc-800",
        className,
      )}
    >
      <span className="leading-tight">{children}</span>
      {sub ? (
        <span className={cn("text-sm leading-tight", selected ? "opacity-80" : "text-zinc-500 dark:text-zinc-400")}>{sub}</span>
      ) : null}
    </button>
  );
}

/**
 * Ô số có nút −/+ (±1 chạm nhanh, ±10 khi giữ Shift hoặc nút phụ). Bàn phím số
 * (`inputmode=numeric`), chữ 16px, chọn hết khi focus để gõ đè nhanh.
 */
export function Stepper({
  label,
  value,
  onChange,
  min = 0,
  max = 100_000,
  big,
  tone,
  id,
  allowEmpty,
  step10 = true,
  suffix,
}: {
  label: React.ReactNode;
  value: number | null;
  onChange: (v: number | null) => void;
  min?: number;
  max?: number;
  big?: boolean;
  tone?: "ok" | "ng" | "neutral";
  id?: string;
  allowEmpty?: boolean;
  step10?: boolean;
  suffix?: string;
}) {
  const autoId = React.useId();
  const inputId = id ?? autoId;
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  const bump = (d: number) => onChange(clamp((value ?? 0) + d));
  const btn =
    "inline-flex shrink-0 items-center justify-center rounded-lg border border-zinc-200 bg-zinc-50 text-zinc-700 active:bg-zinc-200 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-200 dark:active:bg-zinc-700";
  const size = big ? "h-14 w-14" : "h-11 w-11";
  return (
    <div className="min-w-0">
      <label htmlFor={inputId} className="mb-1 flex items-center gap-1.5 text-sm font-medium text-zinc-600 dark:text-zinc-400">
        {tone === "ok" ? <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" /> : null}
        {tone === "ng" ? <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" /> : null}
        {label}
      </label>
      <div className="flex items-center gap-1.5">
        {step10 ? (
          <button type="button" className={cn(btn, size, "text-sm font-semibold")} onClick={() => bump(-10)} aria-label="Bớt 10">
            −10
          </button>
        ) : null}
        <button type="button" className={cn(btn, size)} onClick={() => bump(-1)} aria-label="Bớt 1">
          <Minus className="h-5 w-5" aria-hidden="true" />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            id={inputId}
            inputMode="numeric"
            pattern="[0-9]*"
            enterKeyHint="next"
            autoComplete="off"
            value={value ?? ""}
            placeholder={allowEmpty ? "—" : "0"}
            onFocus={(e) => e.currentTarget.select()}
            onChange={(e) => {
              const digits = e.target.value.replace(/[^0-9]/g, "");
              if (digits === "") onChange(allowEmpty ? null : 0);
              else onChange(clamp(Number(digits)));
            }}
            className={cn(
              "w-full rounded-lg border border-zinc-200 bg-white text-center font-semibold tabular-nums text-zinc-900 outline-none",
              "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900",
              big ? "h-14 text-[22px]" : "h-11 text-[16px]",
            )}
          />
          {suffix ? (
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-zinc-400">{suffix}</span>
          ) : null}
        </div>
        <button type="button" className={cn(btn, size)} onClick={() => bump(1)} aria-label="Thêm 1">
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
        {step10 ? (
          <button type="button" className={cn(btn, size, "text-sm font-semibold")} onClick={() => bump(10)} aria-label="Thêm 10">
            +10
          </button>
        ) : null}
      </div>
    </div>
  );
}

/** Ô chữ 16px cao 44px cho mobile. */
export const TouchInput = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...props }, ref) => (
    <input
      ref={ref}
      {...props}
      className={cn(
        "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none placeholder:text-zinc-400",
        "focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50 dark:focus:ring-indigo-900",
        className,
      )}
    />
  ),
);
TouchInput.displayName = "TouchInput";

export function FieldLabel({ htmlFor, children }: { htmlFor?: string; children: React.ReactNode }) {
  return (
    <label htmlFor={htmlFor} className="mb-1 block text-sm font-medium text-zinc-600 dark:text-zinc-400">
      {children}
    </label>
  );
}

/** Thẻ KPI gọn cho Hôm nay / Báo cáo. `tone` chỉ tô chấm + chữ phụ. */
export function KpiTile({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  sub?: React.ReactNode;
  tone?: "success" | "danger" | "warning";
}) {
  const dot = tone === "success" ? "bg-emerald-500" : tone === "danger" ? "bg-red-500" : tone === "warning" ? "bg-amber-500" : null;
  return (
    <div className="min-w-0 rounded-xl bg-white px-3.5 py-3 shadow-xs dark:bg-zinc-900">
      <div className="flex items-center gap-1.5 text-sm text-zinc-500 dark:text-zinc-400">
        {dot ? <span className={cn("h-2 w-2 shrink-0 rounded-full", dot)} aria-hidden="true" /> : null}
        <span className="truncate">{label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">{value}</div>
      {sub ? <div className="mt-0.5 truncate text-sm text-zinc-500 dark:text-zinc-400">{sub}</div> : null}
    </div>
  );
}

const VN = "vi-VN";
export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : n.toLocaleString(VN));
export const fmtPct = (n: number | null | undefined, digits = 1) =>
  n == null ? "—" : `${n.toLocaleString(VN, { maximumFractionDigits: digits, minimumFractionDigits: 0 })}%`;
/** "2026-11-18" → "18/11/2026" (không đi qua múi giờ). */
export const fmtDay = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;
export const fmtDayShort = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const WEEKDAY = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
export const weekday = (d: string) => WEEKDAY[new Date(`${d}T00:00:00Z`).getUTCDay()] ?? "";
