"use client";

import * as React from "react";
import { Eye, EyeOff } from "lucide-react";
import { Input, type InputProps } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * PasswordInput — input type=password với nút toggle show/hide (mắt).
 *
 * Tái dùng Input (V2 style) + Eye/EyeOff icon. Nút toggle type="button" để
 * không submit form. Accessibility: aria-label + aria-pressed cập nhật theo
 * state. Hỗ trợ forwardRef về input element.
 */
export const PasswordInput = React.forwardRef<HTMLInputElement, InputProps>(
  function PasswordInput({ className, ...props }, ref) {
    const [visible, setVisible] = React.useState(false);
    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          className={cn("pr-10", className)}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          aria-pressed={visible}
          tabIndex={0}
          className="absolute inset-y-0 right-0 inline-flex w-10 items-center justify-center rounded-r-md text-zinc-500 transition-colors hover:text-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
        >
          {visible ? (
            <EyeOff className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Eye className="h-4 w-4" aria-hidden="true" />
          )}
        </button>
      </div>
    );
  },
);
