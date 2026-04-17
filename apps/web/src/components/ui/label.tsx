"use client";

import * as React from "react";
import * as LabelPrimitive from "@radix-ui/react-label";
import { cn } from "@/lib/utils";

export interface LabelProps
  extends React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root> {
  /** Required marker `*` đỏ cạnh label. */
  required?: boolean;
}

export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  LabelProps
>(({ className, required, children, ...props }, ref) => (
  <LabelPrimitive.Root
    ref={ref}
    className={cn(
      "text-sm font-medium leading-none text-slate-700 peer-disabled:cursor-not-allowed peer-disabled:opacity-60",
      className,
    )}
    {...props}
  >
    {children}
    {required ? (
      <span
        aria-hidden="true"
        className="ml-0.5 text-danger-strong"
      >
        *
      </span>
    ) : null}
    {required ? <span className="sr-only"> (bắt buộc)</span> : null}
  </LabelPrimitive.Root>
));
Label.displayName = "Label";
