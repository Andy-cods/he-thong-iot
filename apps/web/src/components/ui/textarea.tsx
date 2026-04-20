import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * V2 Textarea — Linear-inspired.
 * Font 13px (text-base V2), min-h 72px (giảm từ V1 80), padding y-2 x-3 (8/12).
 * Focus blue-500 CSS outline thuần. Error prop → border red-500.
 */

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, error, ...props }, ref) => (
    <textarea
      ref={ref}
      aria-invalid={error || props["aria-invalid"]}
      className={cn(
        "flex min-h-[72px] w-full rounded-md border bg-white px-3 py-2 text-base text-zinc-900 leading-[1.4] placeholder:text-zinc-400 transition-colors duration-150 ease-out resize-y",
        "focus:outline-none disabled:cursor-not-allowed disabled:bg-zinc-50 disabled:text-zinc-400",
        error
          ? "border-red-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-red-500 focus-visible:outline-offset-0"
          : "border-zinc-200 focus:border-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500 focus-visible:outline-offset-0",
        "aria-[invalid=true]:border-red-500",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
