"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V2 Sheet — Linear-inspired slide-in-right.
 * Width md (420px — giảm từ V1 480 cho density compact). lg (560px). sm (360px).
 * Animation 220ms ease-out-quart (Linear signature).
 * Overlay bg-black/40 nhẹ hơn Dialog 0.5.
 * Header h-12 (48px) — giảm từ V1 56. Body padding 20 — giảm từ V1 24.
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
      "fixed inset-0 z-dialog bg-overlay-sheet",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
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
    "inset-y-0 right-0 border-l rounded-l-lg data-[state=open]:slide-in-from-right data-[state=closed]:slide-out-to-right",
  left:
    "inset-y-0 left-0 border-r rounded-r-lg data-[state=open]:slide-in-from-left data-[state=closed]:slide-out-to-left",
  bottom:
    "inset-x-0 bottom-0 border-t rounded-t-lg data-[state=open]:slide-in-from-bottom data-[state=closed]:slide-out-to-bottom",
  top:
    "inset-x-0 top-0 border-b rounded-b-lg data-[state=open]:slide-in-from-top data-[state=closed]:slide-out-to-top",
};

// V2 sizes — giảm từ V1 để phù hợp density compact.
const sizeClasses: Record<Side, Record<Size, string>> = {
  right: {
    sm: "w-full md:w-[360px]",
    md: "w-full md:w-[420px]", // V1 480 → V2 420
    lg: "w-full md:w-[560px]", // V1 640 → V2 560
  },
  left: {
    sm: "w-full md:w-[360px]",
    md: "w-full md:w-[420px]",
    lg: "w-full md:w-[560px]",
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
          "fixed z-dialog flex flex-col bg-white border-zinc-200 shadow-lg duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
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
              "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900",
              "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
            )}
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
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
      "flex h-12 shrink-0 items-center justify-between border-b border-zinc-100 px-5",
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
  <div className={cn("flex-1 overflow-y-auto p-5", className)} {...props} />
);
SheetBody.displayName = "SheetBody";

export const SheetFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex h-14 shrink-0 items-center justify-end gap-2 border-t border-zinc-100 px-5",
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
    className={cn("text-lg font-semibold text-zinc-900", className)}
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
    className={cn("text-base text-zinc-500", className)}
    {...props}
  />
));
SheetDescription.displayName = "SheetDescription";
