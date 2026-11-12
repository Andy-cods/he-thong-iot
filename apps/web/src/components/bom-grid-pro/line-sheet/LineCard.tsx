import * as React from "react";
import { cn } from "@/lib/utils";

/** Card kiểu Apple: bo 16px, nền xám rất nhạt, tiêu đề nhỏ + hành động bên phải. */
export function LineCard({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("rounded-2xl bg-zinc-50 p-4 dark:bg-zinc-800/40", className)}>
      <div className="mb-3 flex min-h-6 items-center justify-between gap-2">
        <h3 className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}
