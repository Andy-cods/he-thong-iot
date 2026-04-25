"use client";

import * as React from "react";
import { ScanLine, X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3 BarcodeScanInput — input scanner-friendly cho USB HID scanner phổ biến
 * tại xưởng VN (Honeywell, Datalogic, Symbol, Newland…).
 *
 * Cách scanner USB HID hoạt động:
 *   - Scanner emulate keyboard, gõ ký tự rất nhanh (toàn bộ chuỗi <100ms)
 *   - Kết thúc bằng Enter (\r) — đó là tín hiệu "scan xong".
 *
 * Pattern dùng:
 *   - Auto-focus khi mount + sau khi scan submit (re-focus để scan tiếp).
 *   - `Enter` → call `onScan(value)` + clear + flash visual feedback xanh 1s.
 *   - Phân biệt scan vs gõ tay: scan thường có Enter trong <100ms từ char đầu.
 *     Tuy nhiên user có thể gõ tay rồi Enter — vẫn xử lý như scan (KISS).
 *   - Disable autofill browser (autoComplete=off + name random per mount).
 *
 * Props:
 *   - onScan(code) — callback bắt buộc.
 *   - autoFocus (default true) — chỉ disable nếu trang có nhiều input + user
 *     muốn focus chỗ khác.
 *   - placeholder — default tiếng Việt "Quét mã hoặc nhập SKU…".
 *   - className — Tailwind class outer.
 *   - hint — text hiển thị nhỏ phía dưới (tùy chọn).
 *   - clearOnScan (default true) — false nếu muốn giữ giá trị (cho debug).
 *
 * Performance: dùng `useRef` cho input + `useCallback` cho handlers — không
 * re-render parent khi gõ.
 */

export interface BarcodeScanInputProps {
  onScan: (code: string) => void;
  autoFocus?: boolean;
  placeholder?: string;
  className?: string;
  hint?: string;
  clearOnScan?: boolean;
  disabled?: boolean;
  /** Min length để tránh trigger scan với Enter trên input rỗng. Default 2. */
  minLength?: number;
}

export function BarcodeScanInput({
  onScan,
  autoFocus = true,
  placeholder = "Quét mã hoặc nhập SKU rồi Enter…",
  className,
  hint,
  clearOnScan = true,
  disabled,
  minLength = 2,
}: BarcodeScanInputProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [value, setValue] = React.useState("");
  const [flashUntil, setFlashUntil] = React.useState(0);
  const [, forceTick] = React.useState(0);

  // Random name attribute để autofill browser không suggest.
  const inputName = React.useMemo(
    () => `barcode-${Math.random().toString(36).slice(2, 10)}`,
    [],
  );

  React.useEffect(() => {
    if (autoFocus && inputRef.current && !disabled) {
      inputRef.current.focus();
    }
  }, [autoFocus, disabled]);

  // Re-render mỗi 200ms khi flash để tắt visual.
  React.useEffect(() => {
    if (flashUntil <= Date.now()) return;
    const id = setInterval(() => forceTick((n) => n + 1), 200);
    return () => clearInterval(id);
  }, [flashUntil]);

  const handleSubmit = React.useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (trimmed.length < minLength) return;
      onScan(trimmed);
      if (clearOnScan) {
        setValue("");
      }
      setFlashUntil(Date.now() + 1200);
      // Re-focus sau khi clear để scan tiếp.
      setTimeout(() => inputRef.current?.focus(), 0);
    },
    [onScan, clearOnScan, minLength],
  );

  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        handleSubmit(value);
      }
    },
    [value, handleSubmit],
  );

  const handleClear = React.useCallback(() => {
    setValue("");
    inputRef.current?.focus();
  }, []);

  const flashing = flashUntil > Date.now();

  return (
    <div className={cn("flex flex-col gap-1", className)}>
      <div
        className={cn(
          "flex items-center gap-2 rounded-md border bg-white px-3 py-2 transition-all duration-200",
          flashing
            ? "border-emerald-500 ring-2 ring-emerald-100"
            : "border-zinc-200 focus-within:border-indigo-400 focus-within:ring-2 focus-within:ring-indigo-100",
          disabled && "cursor-not-allowed opacity-60",
        )}
      >
        <ScanLine
          className={cn(
            "h-4 w-4 shrink-0 transition-colors",
            flashing ? "text-emerald-600" : "text-zinc-400",
          )}
          aria-hidden="true"
        />
        <input
          ref={inputRef}
          type="text"
          name={inputName}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={disabled}
          aria-label="Ô quét barcode"
          className="flex-1 bg-transparent text-base outline-none placeholder:text-zinc-400 disabled:cursor-not-allowed"
        />
        {value && !disabled ? (
          <button
            type="button"
            onClick={handleClear}
            aria-label="Xoá"
            className="rounded-sm p-0.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {hint ? (
        <p className="text-xs text-zinc-500">{hint}</p>
      ) : null}
    </div>
  );
}
