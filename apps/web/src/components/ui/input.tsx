import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * V2 Input — Linear-inspired compact.
 * Size sm (h-8 filter bar) / default (h-9 form) / lg (h-11 PWA touch).
 * Font 13px (text-base V2). Border zinc-200, focus blue-500 outline.
 */

const inputVariants = cva(
  "flex w-full rounded-md border bg-white text-base text-zinc-900 placeholder:text-zinc-400 transition-colors duration-150 ease-out focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500 dark:disabled:bg-zinc-800 dark:disabled:text-zinc-600",
  {
    variants: {
      size: {
        sm: "h-8 px-2.5 py-1", // 32px — filter
        default: "h-9 px-3 py-1", // 36px — form default
        lg: "h-11 px-3.5 py-2 text-md", // 44px — PWA
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
);

export interface InputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">,
    VariantProps<typeof inputVariants> {
  error?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type = "text", size, error, ...props }, ref) => (
    <input
      ref={ref}
      type={type}
      aria-invalid={error || props["aria-invalid"]}
      className={cn(
        inputVariants({ size }),
        // Border + focus trạng thái chuẩn V2 (CSS outline thuần không box-shadow).
        error
          ? "border-red-500 focus:border-red-500 focus-visible:outline-red-500 dark:border-red-500 dark:focus:border-red-400"
          : "border-zinc-200 focus:border-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-0 dark:border-zinc-700 dark:focus:border-indigo-400 dark:focus-visible:outline-indigo-400",
        "aria-[invalid=true]:border-red-500",
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = "Input";

export { inputVariants };
