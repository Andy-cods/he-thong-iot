import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {}

/**
 * Direction B — Input primitive.
 * - Height 48px mobile (tap target găng tay), 40px từ `sm` trở lên.
 * - Focus ring dùng `shadow-focus` token (KHÔNG `focus:ring-0`).
 * - Disabled tint slate-100.
 */
export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-12 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base text-slate-900 placeholder:text-slate-400 shadow-xs transition-colors duration-fast sm:h-10",
        "focus:border-info focus:outline-none focus:shadow-focus focus-visible:border-info focus-visible:shadow-focus",
        "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500",
        "aria-[invalid=true]:border-danger aria-[invalid=true]:shadow-none",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
