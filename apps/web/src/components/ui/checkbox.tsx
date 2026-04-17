"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check, Minus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Direction B — Checkbox (Radix).
 * Size md (20×20) default, lg (24×24) cho PWA găng tay.
 * State: unchecked / checked / indeterminate.
 */

export interface CheckboxProps
  extends React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> {
  size?: "md" | "lg";
}

export const Checkbox = React.forwardRef<
  React.ElementRef<typeof CheckboxPrimitive.Root>,
  CheckboxProps
>(({ className, size = "md", ...props }, ref) => {
  const box = size === "lg" ? "h-6 w-6" : "h-5 w-5";
  const icon = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  return (
    <CheckboxPrimitive.Root
      ref={ref}
      className={cn(
        "peer inline-flex shrink-0 items-center justify-center rounded-sm border border-slate-300 bg-white text-white transition-colors duration-fast",
        "focus:outline-none focus-visible:shadow-focus",
        "data-[state=checked]:bg-cta data-[state=checked]:border-cta",
        "data-[state=indeterminate]:bg-cta/70 data-[state=indeterminate]:border-cta",
        "disabled:cursor-not-allowed disabled:bg-slate-100 disabled:border-slate-200 disabled:opacity-60",
        box,
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
        {props.checked === "indeterminate" ? (
          <Minus className={icon} strokeWidth={3} aria-hidden="true" />
        ) : (
          <Check className={icon} strokeWidth={3} aria-hidden="true" />
        )}
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
});
Checkbox.displayName = "Checkbox";
