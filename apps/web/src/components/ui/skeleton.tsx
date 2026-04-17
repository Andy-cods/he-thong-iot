import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V2 Skeleton — Linear-inspired.
 * Bg zinc-100 (nhẹ hơn V1 slate-200). Shimmer 1200ms linear via .skeleton utility.
 * Variant: rect (default rounded-md) / circle (rounded-full) / text (h-4 rounded-sm).
 * Shape: dùng `.skeleton` utility class trong globals.css (animation + gradient).
 * A11y: wrapper SkeletonGroup thêm role="status" aria-busy.
 */

export interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: "rect" | "circle" | "text";
  width?: string | number;
  height?: string | number;
}

export function Skeleton({
  className,
  variant = "rect",
  width,
  height,
  style,
  ...props
}: SkeletonProps) {
  const variantClass = {
    rect: "rounded-md",
    circle: "rounded-full",
    text: "h-4 rounded-sm",
  }[variant];

  return (
    <div
      className={cn("skeleton block", variantClass, className)}
      style={{
        width: width ?? undefined,
        height: height ?? undefined,
        ...style,
      }}
      aria-hidden="true"
      {...props}
    />
  );
}

/** Wrapper đọc được cho screen reader khi bắt đầu loading. */
export function SkeletonGroup({
  children,
  label = "Đang tải nội dung",
  className,
}: {
  children: React.ReactNode;
  label?: string;
  className?: string;
}) {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label={label}
      className={className}
    >
      {children}
      <span className="sr-only">{label}</span>
    </div>
  );
}
