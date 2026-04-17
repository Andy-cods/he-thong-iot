"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils";

/**
 * V2 Tabs — Linear-inspired underline style (not pill-filled V1).
 * List h-9 (36px) border-b zinc-200.
 * Trigger h-8 padding-x 12, text-base 13px weight 500, text-zinc-500.
 * Active: text-zinc-900 border-b-2 zinc-900 (quiet neutral, KHÔNG blue
 * để tabs không "ồn" — blue chỉ cho action/command).
 */

export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex h-9 w-full items-center justify-start gap-1 border-b border-zinc-200 text-zinc-500",
      className,
    )}
    {...props}
  />
));
TabsList.displayName = "TabsList";

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex h-8 items-center justify-center whitespace-nowrap border-b-2 border-transparent px-3 text-base font-medium text-zinc-500 transition-colors duration-100 ease-out -mb-px",
      "hover:text-zinc-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
      "disabled:pointer-events-none disabled:opacity-50",
      "data-[state=active]:border-zinc-900 data-[state=active]:text-zinc-900",
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = "TabsTrigger";

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
      className,
    )}
    {...props}
  />
));
TabsContent.displayName = "TabsContent";
