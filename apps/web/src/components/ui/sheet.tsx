"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Direction B — Sheet (side drawer).
 *
 * Dùng lại Radix Dialog primitive để có focus trap + Esc close.
 * Side: right (quick edit, mặc định), left (filter panel), bottom (mobile action),
 * top (scan queue).
 *
 * Animation slide 200ms ease-snap (tương đương cubic-bezier(0.2,0.8,0.2,1)).
 */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetPortal = DialogPrimitive.Portal;

export const SheetOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-dialog bg-overlay",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
      className,
    )}
    {...props}
  />
));
SheetOverlay.displayName = "SheetOverlay";

type Side = "right" | "left" | "bottom" | "top";
type Size = "sm" | "md" | "lg";

const sideClasses: Record<Side, string> = {
  right:
    "inset-y-0 right-0 border-l data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left:
    "inset-y-0 left-0 border-r data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  bottom:
    "inset-x-0 bottom-0 border-t data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  top:
    "inset-x-0 top-0 border-b data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
};

const sizeClasses: Record<Side, Record<Size, string>> = {
  right: {
    sm: "w-full md:w-[360px]",
    md: "w-full md:w-[480px]",
    lg: "w-full md:w-[640px]",
  },
  left: {
    sm: "w-full md:w-[360px]",
    md: "w-full md:w-[480px]",
    lg: "w-full md:w-[640px]",
  },
  bottom: {
    sm: "h-[45vh]",
    md: "h-[65vh]",
    lg: "h-[85vh]",
  },
  top: {
    sm: "h-[30vh]",
    md: "h-[50vh]",
    lg: "h-[70vh]",
  },
};

export interface SheetContentProps
  extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  side?: Side;
  size?: Size;
  /** Ẩn nút close mặc định (user tự render trong header). Default: false. */
  hideCloseButton?: boolean;
}

export const SheetContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  SheetContentProps
>(
  (
    {
      className,
      children,
      side = "right",
      size = "md",
      hideCloseButton = false,
      ...props
    },
    ref,
  ) => (
    <SheetPortal>
      <SheetOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-dialog flex flex-col bg-white border-slate-200 shadow-pop duration-base ease-snap",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          sideClasses[side],
          sizeClasses[side][size],
          className,
        )}
        {...props}
      >
        {children}
        {hideCloseButton ? null : (
          <DialogPrimitive.Close
            className={cn(
              "absolute right-3 top-3 inline-flex h-8 w-8 items-center justify-center rounded-sm text-slate-500 transition-opacity hover:bg-slate-100 hover:text-slate-900",
              "focus:outline-none focus-visible:shadow-focus",
            )}
          >
            <X className="h-4 w-4" aria-hidden="true" />
            <span className="sr-only">Đóng</span>
          </DialogPrimitive.Close>
        )}
      </DialogPrimitive.Content>
    </SheetPortal>
  ),
);
SheetContent.displayName = "SheetContent";

export const SheetHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex h-14 shrink-0 items-center justify-between border-b border-slate-200 px-6",
      className,
    )}
    {...props}
  />
);
SheetHeader.displayName = "SheetHeader";

export const SheetBody = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex-1 overflow-y-auto p-6", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex h-[72px] shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-6",
      className,
    )}
    {...props}
  />
);
SheetFooter.displayName = "SheetFooter";

export const SheetTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold text-slate-900", className)}
    {...props}
  />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-slate-600", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
