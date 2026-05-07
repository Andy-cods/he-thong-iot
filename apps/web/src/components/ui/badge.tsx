import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * V2 Badge — Linear-inspired compact.
 * Size sm (h-[18px] 10px) / md (h-5 20px 11px).
 * Variants: default / success / warning / danger / info / shortage (safety-orange).
 * Rounded-sm 4px (V1 rounded-full nhiều khi nặng visual).
 */

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-sm font-medium uppercase tracking-wide",
  {
    variants: {
      variant: {
        default: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        neutral: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300",
        success: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300",
        warning: "bg-amber-50 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300",
        danger: "bg-red-50 text-red-700 dark:bg-red-950/50 dark:text-red-300",
        info: "bg-sky-50 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300",
        shortage: "bg-orange-50 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300",
        outline: "border border-zinc-300 bg-white text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300",
      },
      size: {
        sm: "h-[18px] px-1.5 text-[10px]",
        md: "h-5 px-2 text-xs", // 20px / 11px
        default: "h-5 px-2 text-xs",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, size, ...props }: BadgeProps) {
  return (
    <span
      className={cn(badgeVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { badgeVariants };
