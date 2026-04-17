"use client";

import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "@/lib/utils";

/**
 * V2 Tooltip (NEW) — Linear-inspired.
 * Bg zinc-900 text-zinc-50 text-sm (12px) rounded-md padding 6/10.
 * Delay open 300ms, close 0ms. Max-w 240px.
 * Bỏ arrow, offset 4px.
 * Use cases: icon-only button, truncated cell, KPI delta explanation.
 */

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = React.forwardRef<
  React.ElementRef<typeof TooltipPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(({ className, sideOffset = 4, ...props }, ref) => (
  <TooltipPrimitive.Content
    ref={ref}
    sideOffset={sideOffset}
    className={cn(
      "z-popover max-w-[240px] rounded-md bg-zinc-900 px-2.5 py-1.5 text-sm text-zinc-50 shadow-sm",
      "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:duration-150",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-100",
      className,
    )}
    {...props}
  />
));
TooltipContent.displayName = "TooltipContent";

/**
 * SimpleTooltip — convenience wrapper cho use case phổ biến
 * (trigger text/icon + content text).
 */
export interface SimpleTooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  delayDuration?: number;
  asChild?: boolean;
}

export function SimpleTooltip({
  content,
  children,
  side = "top",
  delayDuration = 300,
  asChild = true,
}: SimpleTooltipProps) {
  return (
    <TooltipProvider delayDuration={delayDuration}>
      <Tooltip>
        <TooltipTrigger asChild={asChild}>{children}</TooltipTrigger>
        <TooltipContent side={side}>{content}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
