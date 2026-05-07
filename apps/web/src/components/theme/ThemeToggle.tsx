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
  const { mode, resolved, setMode } = useTheme();
  // Cycle: light → dark → system → light
  const next: ThemeMode =
    mode === "light" ? "dark" : mode === "dark" ? "system" : "light";
  const label =
    mode === "system" ? `Hệ thống (${resolved === "dark" ? "Tối" : "Sáng"})` : mode === "dark" ? "Tối" : "Sáng";
  const Icon = mode === "system" ? Monitor : mode === "dark" ? Moon : Sun;
  return (
    <button
      type="button"
      onClick={() => setMode(next)}
      aria-label={`Giao diện: ${label} — bấm để đổi`}
      title={`Giao diện: ${label}`}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900 transition-colors dark:text-zinc-300 dark:hover:bg-zinc-800 dark:hover:text-zinc-50",
        className,
      )}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
