"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V2 Checkbox — Linear-inspired compact.
 * Size default (14px h-3.5) — giảm từ V1 20px. Size md (16px) cho inline table.
 * Size lg (24px) giữ cho PWA găng tay.
 * Border 1.5px zinc-300. Checked bg-blue-500. Tick 12px stroke 2.5.
 */

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  size?: "sm" | "default" | "md" | "lg";
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size = "default", ...props }, ref) => {
  const box =
    size === "lg"
      ? "h-6 w-6"
      : size === "md"
        ? "h-4 w-4"
        : size === "sm"
          ? "h-3 w-3"
          : "h-3.5 w-3.5"; // default 14px
  const icon =
    size === "lg"
      ? "h-5 w-5"
      : size === "md"
        ? "h-3.5 w-3.5"
        : size === "sm"
          ? "h-2.5 w-2.5"
          : "h-3 w-3"; // 12px cho default

  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex shrink-0 items-center justify-center rounded-sm border-[1.5px] border-zinc-300 bg-white text-white transition-all duration-100 ease-out",
        "hover:border-zinc-400 hover:bg-zinc-50",
        "focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-1",
        "data-[state=checked]:bg-indigo-600 data-[state=checked]:border-indigo-600 data-[state=checked]:hover:bg-indigo-700",
        "data-[state=indeterminate]:bg-indigo-600 data-[state=indeterminate]:border-indigo-600",
        "disabled:cursor-not-allowed disabled:bg-zinc-100 disabled:border-zinc-200 disabled:opacity-60",
        box,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <Minus className={icon} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Check className={icon} strokeWidth={2.5} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = "Checkbox";
