"use client";

import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";
import { Input } from "./input";

/**
 * V2 Dialog — Linear-inspired.
 * Overlay bg-black/50 (darker than V1 0.48) backdrop-blur-sm.
 * Content rounded-lg 8px, shadow-lg (single layer) thay V1 shadow-dialog.
 * Padding 24→20. Header title text-lg (15px) weight 600.
 * Close button 32px (h-7 w-7) ghost.
 */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;
export const DialogPortal = DialogPrimitive.Portal;

export const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-dialog bg-overlay-scrim backdrop-blur-[2px]",
      "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:duration-150",
      "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:duration-150",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

export const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    size?: "sm" | "md" | "lg";
  }
>(({ className, children, size = "md", ...props }, ref) => {
  const sizeClass = {
    sm: "max-w-sm", // 384px
    md: "max-w-md", // 448px (spec target ~480)
    lg: "max-w-lg", // 512px
  }[size];
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed left-1/2 top-1/2 z-dialog grid w-full -translate-x-1/2 -translate-y-1/2 gap-3 rounded-lg border border-zinc-200 bg-white p-5 shadow-lg duration-200 ease-[cubic-bezier(0.25,1,0.5,1)]",
          "data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95",
          "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95",
          sizeClass,
          className,
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close
          className={cn(
            "absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors duration-100 hover:bg-zinc-100 hover:text-zinc-900",
            "focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-2",
          )}
        >
          <X className="h-3.5 w-3.5" aria-hidden="true" />
          <span className="sr-only">Đóng</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  );
});
DialogContent.displayName = "DialogContent";

export const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col gap-1", className)} {...props} />
);

export const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "mt-3 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
      className,
    )}
    {...props}
  />
);

export const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title> & {
    variant?: "default" | "destructive";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-snug",
      variant === "destructive" ? "text-red-700" : "text-zinc-900",
      className,
    )}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

export const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-base text-zinc-500", className)}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

/**
 * DialogConfirm — destructive type-to-confirm.
 * User phải gõ đúng `confirmText` (mặc định "XOA") mới enable action button.
 */
export interface DialogConfirmProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Text user phải gõ. Default "XOA". */
  confirmText?: string;
  /** Label cho action button. Default "Xoá". */
  actionLabel?: string;
  onConfirm: () => void | Promise<void>;
  loading?: boolean;
  children?: React.ReactNode;
}

export function DialogConfirm({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "XOA",
  actionLabel = "Xoá",
  onConfirm,
  loading = false,
  children,
}: DialogConfirmProps) {
  const [typed, setTyped] = React.useState("");
  const disabled = typed !== confirmText || loading;

  React.useEffect(() => {
    if (!open) setTyped("");
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" role="alertdialog">
        <DialogHeader>
          <DialogTitle variant="destructive">{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </DialogHeader>
        {children}
        <div className="mt-2 space-y-2">
          <label
            htmlFor="dialog-confirm-input"
            className="text-base font-medium text-zinc-900"
          >
            Gõ{" "}
            <span className="font-mono font-semibold text-red-700">
              {confirmText}
            </span>{" "}
            để xác nhận:
          </label>
          <Input
            id="dialog-confirm-input"
            autoComplete="off"
            autoFocus
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            aria-label={`Gõ ${confirmText} để xác nhận`}
          />
        </div>
        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Huỷ
          </Button>
          <Button
            variant="danger"
            disabled={disabled}
            onClick={() => void onConfirm()}
          >
            {loading ? "Đang xử lý..." : actionLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
