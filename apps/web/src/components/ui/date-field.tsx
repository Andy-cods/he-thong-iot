"use client";

import * as React from "react";
import { Calendar } from "lucide-react";
import { cn } from "@/lib/utils";
import { autoFormatVnDateInput, formatDate, parseVnDate } from "@/lib/format";
import { Input, type InputProps } from "./input";

/**
 * V4.4 A4 — `<input type="date">` native hiện placeholder/định dạng THEO
 * LOCALE HỆ ĐIỀU HÀNH/TRÌNH DUYỆT (thường "mm/dd/yyyy" ở máy tiếng Anh) trong
 * khi toàn hệ thống hiển thị ngày kiểu Việt Nam "dd/MM/yyyy" — không có class
 * CSS nào sửa được placeholder này (giới hạn nền tảng, xem
 * plans/v4.4-ui/UI_INVENTORY.md §A4).
 *
 * `DateField` là lựa chọn THAY THẾ (opt-in, KHÔNG bắt buộc) cho `<input
 * type="date">`: hiển thị ô nhập text "dd/mm/yyyy" nhất quán (gõ tay tự chèn
 * "/", có validate), kèm nút lịch mở date-picker native của trình duyệt.
 * `value`/`onChange` vẫn là chuỗi ISO "yyyy-MM-dd" giống input date cũ —
 * drop-in, KHÔNG phá form hiện có. Trang cũ dùng `<input type="date">` trực
 * tiếp vẫn hoạt động bình thường; việc thay dần sang `DateField` để nhóm
 * trang tự làm khi chạm tới form đó.
 */
export interface DateFieldProps
  extends Omit<InputProps, "type" | "value" | "onChange" | "size"> {
  /** ISO "yyyy-MM-dd", khớp giá trị `<input type="date">` cũ. Rỗng/null = chưa chọn. */
  value?: string | null;
  /** Nhận ISO "yyyy-MM-dd"; chuỗi rỗng khi người dùng xoá ô. */
  onChange?: (value: string) => void;
  size?: InputProps["size"];
}

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  return formatDate(iso, "dd/MM/yyyy");
}

export const DateField = React.forwardRef<HTMLInputElement, DateFieldProps>(
  (
    {
      value,
      onChange,
      className,
      size,
      disabled,
      min,
      max,
      id,
      name,
      required,
      placeholder,
      "aria-label": ariaLabel,
      ...rest
    },
    ref,
  ) => {
    const [text, setText] = React.useState(() => isoToDisplay(value));
    const nativeRef = React.useRef<HTMLInputElement>(null);

    // Đồng bộ khi `value` điều khiển từ ngoài đổi (VD reset form, load dữ liệu).
    React.useEffect(() => {
      setText(isoToDisplay(value));
    }, [value]);

    const commit = (nextText: string) => {
      setText(nextText);
      if (nextText === "") {
        onChange?.("");
        return;
      }
      const iso = parseVnDate(nextText);
      if (iso) onChange?.(iso);
    };

    return (
      <div className={cn("relative", className)}>
        <Input
          ref={ref}
          id={id}
          name={name}
          required={required}
          type="text"
          inputMode="numeric"
          placeholder={placeholder ?? "dd/mm/yyyy"}
          autoComplete="off"
          size={size}
          disabled={disabled}
          value={text}
          onChange={(e) => commit(autoFormatVnDateInput(e.target.value))}
          onBlur={() => {
            // Gõ dở / không hợp lệ khi rời ô → quay về giá trị hợp lệ gần nhất
            // (không âm thầm gửi ISO sai lên `onChange`).
            if (text !== "" && !parseVnDate(text)) setText(isoToDisplay(value));
          }}
          className="pr-9"
          aria-label={ariaLabel ?? "Ngày (dd/mm/yyyy)"}
          {...rest}
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          onClick={() => {
            const el = nativeRef.current;
            if (!el) return;
            if (typeof el.showPicker === "function") el.showPicker();
            else el.focus();
          }}
          className="absolute right-1.5 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 disabled:pointer-events-none disabled:opacity-40 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          aria-label="Mở lịch chọn ngày"
        >
          <Calendar className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
        {/* Input native ẩn — CHỈ dùng để mở date-picker gốc của trình duyệt/hệ
            điều hành qua nút lịch; đồng bộ 2 chiều với ô text dd/mm/yyyy hiển
            thị ở trên. Không nhận focus bàn phím trực tiếp (tabIndex=-1). */}
        <input
          ref={nativeRef}
          type="date"
          tabIndex={-1}
          aria-hidden="true"
          disabled={disabled}
          min={min}
          max={max}
          value={value ?? ""}
          onChange={(e) => commit(isoToDisplay(e.target.value))}
          className="absolute inset-0 h-0 w-0 opacity-0"
        />
      </div>
    );
  },
);
DateField.displayName = "DateField";
