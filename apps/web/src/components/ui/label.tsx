"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

/**
 * V2 Label — Linear-inspired.
 * Default: 13px weight 500 zinc-900 (form field).
 * Uppercase variant: 11px uppercase tracking-wider zinc-500 (section header).
 * Required dấu `*` đỏ (red-500), screen reader nghe "(bắt buộc)".
 */

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Required marker `*` đỏ cạnh label. */
  required?: boolean;
  /** Section header style: 11px uppercase tracking-wider zinc-500. */
  uppercase?: boolean;
}

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required, uppercase, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      uppercase
        ? "text-xs font-medium uppercase tracking-wider text-zinc-500"
        : "text-base font-medium leading-none text-zinc-900",
      "peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  >
    {children}
    {required ? (
      <span aria-hidden="true" className="ml-0.5 text-red-500">
        *
      </span>
    ) : null}
    {required ? <span className="sr-only"> (bắt buộc)</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";
