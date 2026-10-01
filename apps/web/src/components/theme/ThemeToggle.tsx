"use client";

import * as React from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { useTheme, type ThemeMode } from "@/components/providers/ThemeProvider";
import { cn } from "@/lib/utils";

/**
 * V3.7.67 — Theme toggle.
 *
 * 2 variant:
 *   - <ThemeSegmented /> — segmented control 3 nút (Light/Dark/System) cho settings page.
 *   - <ThemeQuickToggle /> — single icon button cycle Light → Dark → System cho topbar.
 */

const OPTIONS: Array<{
  value: ThemeMode;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { value: "light", label: "Sáng", icon: Sun },
  { value: "dark", label: "Tối", icon: Moon },
  { value: "system", label: "Hệ thống", icon: Monitor },
];

export function ThemeSegmented({ className }: { className?: string }) {
  const { mode, setMode } = useTheme();
  return (
    <div
      role="radiogroup"
      aria-label="Chọn giao diện"
      className={cn(
        "inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5 dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
    >
      {OPTIONS.map((opt) => {
        const Icon = opt.icon;
        const active = mode === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            onClick={() => setMode(opt.value)}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-[12px] font-medium transition-colors",
              active
                ? "bg-white text-zinc-900 shadow-sm dark:bg-zinc-800 dark:text-zinc-50"
                : "text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50",
            )}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}

export function ThemeQuickToggle({ className }: { className?: string }) {
  const { resolved, setMode } = useTheme();
  // V4.5 QA-E P3: chu kỳ theo TRẠNG THÁI HIỂN THỊ THỰC TẾ (`resolved`), không
  // theo `mode` thô. Trước đây cycle light→dark→system→light cứ nhảy sang
  // "light" khi rời "Hệ thống" bất kể đang resolve gì — nếu hệ thống đã sẵn
  // hiển thị sáng thì bấm lần đầu KHÔNG thấy đổi (icon đổi nhưng màu giao
  // diện giữ nguyên), giống nút bị đơ, phải bấm lần 2 mới thấy đổi. Nay bấm
  // LUÔN lật đúng màu đang hiển thị: đang tối → bấm ra sáng, đang sáng → bấm
  // ra tối. Lựa chọn "Hệ thống" đầy đủ vẫn có ở `ThemeSegmented` (trang Cài
  // đặt) — quick toggle ở topbar chỉ cần đổi nhanh 2 chiều sáng/tối.
  const next: ThemeMode = resolved === "dark" ? "light" : "dark";
  const label = resolved === "dark" ? "Tối" : "Sáng";
  const nextLabel = next === "dark" ? "Tối" : "Sáng";
  const Icon = resolved === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Giao diện: ${label} — bấm để đổi sang ${nextLabel}`}
      title={`Giao diện: ${label} — bấm để đổi sang ${nextLabel}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
