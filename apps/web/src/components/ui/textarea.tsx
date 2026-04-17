import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => (
    <textarea
      ref={ref}
      className={cn(
        "flex min-h-[80px] w-full rounded border border-slate-300 bg-white px-2 py-1 text-base text-slate-900 placeholder:text-slate-500 focus:border-info focus:outline-none focus:ring-2 focus:ring-info/35 disabled:cursor-not-allowed disabled:bg-slate-100",
        className,
      )}
      {...props}
    />
  ),
);
Textarea.displayName = "Textarea";
