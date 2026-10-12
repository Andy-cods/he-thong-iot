"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { formatVnNumberText, parseVnNumberText } from "@/lib/pr-form";

export interface VnNumberInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "type"> {
  /** Giá trị canonical dạng chuỗi ("1500000.5"), rỗng = chưa nhập. */
  value: string;
  onValueChange: (canonical: string) => void;
  maxDecimals?: number;
}

/**
 * Ô số kiểu VN: hiển thị dấu chấm ngàn + dấu phẩy thập phân, không có spinner.
 * Giữ nguyên vị trí con trỏ khi định dạng lại.
 */
export const VnNumberInput = React.forwardRef<HTMLInputElement, VnNumberInputProps>(
  ({ value, onValueChange, maxDecimals = 3, className, ...rest }, ref) => {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const caretDigits = React.useRef<number | null>(null);
    const display = formatVnNumberText(value);

    React.useLayoutEffect(() => {
      const el = innerRef.current;
      const n = caretDigits.current;
      if (!el || n === null || document.activeElement !== el) return;
      caretDigits.current = null;
      let seen = 0;
      let pos = 0;
      while (pos < display.length && seen < n) {
        if (/[\d,]/.test(display[pos]!)) seen += 1;
        pos += 1;
      }
      el.setSelectionRange(pos, pos);
    }, [display]);

    return (
      <input
        {...rest}
        ref={(node) => {
          innerRef.current = node;
          if (typeof ref === "function") ref(node);
          else if (ref) (ref as React.MutableRefObject<HTMLInputElement | null>).current = node;
        }}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const el = e.target;
          const before = el.value.slice(0, el.selectionStart ?? el.value.length);
          caretDigits.current = (before.match(/[\d,]/g) ?? []).length;
          onValueChange(parseVnNumberText(el.value, maxDecimals));
        }}
        className={cn("min-w-0 tabular-nums", className)}
      />
    );
  },
);
VnNumberInput.displayName = "VnNumberInput";
