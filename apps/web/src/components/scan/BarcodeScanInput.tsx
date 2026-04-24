"use client";

import * as React from "react";
import { ScanLine, CheckCircle2, AlertCircle } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useBarcodeScan } from "@/hooks/useBarcodeScan";

/**
 * V1.9 Phase 5 — BarcodeScanInput.
 *
 * Ô input chủ động listen HID keyboard wedge. Logic:
 *   - Khi focus → đánh dấu `data-scan-ready="true"`, `useBarcodeScan` scoped
 *     window vẫn bắt được vì input đánh dấu ready.
 *   - Cho phép user vẫn gõ tay + Enter submit (fallback).
 *   - Visual feedback: ring-indigo khi scan active, flash emerald khi success,
 *     flash red khi error. Beep 880Hz (success) / 220Hz (error) tuỳ `sound`.
 *
 * Props tuân theo plan:
 *   - onScan: callback code string đã trim
 *   - placeholder: gợi ý
 *   - disabled
 *   - autoFocus
 */
export interface BarcodeScanInputProps {
  onScan: (code: string) => void;
  placeholder?: string;
  disabled?: boolean;
  autoFocus?: boolean;
  /** Tên label hiển thị trên ô. */
  label?: string;
  /** Minimum length coi là valid scan (default 4). */
  minLength?: number;
  /** Âm thanh beep (default true). */
  sound?: boolean;
  className?: string;
}

type FlashKind = "success" | "danger" | null;

function beep(freq: number) {
  try {
    const globalAny = globalThis as unknown as {
      AudioContext?: typeof AudioContext;
      webkitAudioContext?: typeof AudioContext;
    };
    const AC = globalAny.AudioContext ?? globalAny.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.value = 0.1;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.1);
    osc.onended = () => ctx.close();
  } catch {
    // ignore
  }
}

export function BarcodeScanInput({
  onScan,
  placeholder = "Quét barcode (hoặc gõ tay rồi Enter)",
  disabled = false,
  autoFocus = false,
  label,
  minLength = 4,
  sound = true,
  className,
}: BarcodeScanInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState("");
  const [flash, setFlash] = React.useState<FlashKind>(null);

  const trigger = React.useCallback(
    (code: string, kind: "success" | "danger" = "success") => {
      setFlash(kind);
      if (sound) beep(kind === "success" ? 880 : 220);
      if (typeof navigator !== "undefined" && navigator.vibrate) {
        navigator.vibrate(kind === "success" ? 40 : [80, 40, 80]);
      }
      window.setTimeout(() => setFlash(null), 400);
      if (kind === "success") onScan(code);
    },
    [onScan, sound],
  );

  // Listener document-level: khi scanner bắn chuỗi + Enter mà chưa focus input
  // thì vẫn bắt. Dùng `useBarcodeScan` không ignore INPUT để hoạt động được
  // với focus input nữa.
  const { isScanning } = useBarcodeScan({
    enabled: !disabled,
    minLength,
    onScan: (code) => {
      // clear input (nếu user vừa gõ tay), play feedback
      setValue("");
      trigger(code.trim(), "success");
    },
    ignoreIfFocusedOn: [], // scan dù focus ở đâu — input có data-scan-ready
    stopPropagation: true,
    preventDefault: true,
  });

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const v = value.trim();
    if (v.length === 0) return;
    if (v.length < minLength) {
      trigger(v, "danger");
      return;
    }
    setValue("");
    trigger(v, "success");
  };

  return (
    <form
      onSubmit={handleManualSubmit}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-white px-3 py-2 transition-all duration-150",
        flash === "success" &&
          "border-emerald-500 ring-[3px] ring-emerald-500/30",
        flash === "danger" && "border-red-500 ring-[3px] ring-red-500/30",
        !flash && isScanning && "border-indigo-500 ring-[3px] ring-indigo-500/20",
        !flash && !isScanning && "border-zinc-200",
        className,
      )}
      aria-busy={disabled}
    >
      <ScanLine
        className={cn(
          "h-5 w-5 shrink-0 transition-colors",
          flash === "success"
            ? "text-emerald-600"
            : flash === "danger"
              ? "text-red-600"
              : isScanning
                ? "text-indigo-600"
                : "text-zinc-400",
        )}
        aria-hidden="true"
      />
      <div className="flex-1 min-w-0">
        {label ? (
          <label
            htmlFor="barcode-scan-input"
            className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500"
          >
            {label}
          </label>
        ) : null}
        <Input
          id="barcode-scan-input"
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck={false}
          data-scan-ready="true"
          className="border-none px-0 focus:outline-none focus-visible:outline-none focus:border-transparent shadow-none h-8 text-base"
          aria-label={label ?? "Ô quét barcode"}
        />
      </div>
      {flash === "success" ? (
        <CheckCircle2
          className="h-5 w-5 shrink-0 text-emerald-600"
          aria-hidden="true"
        />
      ) : flash === "danger" ? (
        <AlertCircle
          className="h-5 w-5 shrink-0 text-red-600"
          aria-hidden="true"
        />
      ) : null}
    </form>
  );
}
