import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      className={cn(
        "flex h-10 w-full rounded border border-slate-300 bg-white px-2 py-1 text-base text-slate-900 placeholder:text-slate-500 shadow-xs transition-colors duration-fast focus:border-info focus:outline-none focus:ring-2 focus:ring-info/35 disabled:cursor-not-allowed disabled:bg-slate-100",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";
