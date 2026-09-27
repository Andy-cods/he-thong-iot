"use client";

import * as React from "react";
import { Check, Minus, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { buildPoSteps, type PoStep, type PoStepInput } from "@/lib/po-detail";
import { cn } from "@/lib/utils";

/**
 * V4.1 PO-UI: tiến trình PO dạng mini stepper dọc (thay 4 khối màu lớn của
 * PoApprovalWorkflow cũ). Mỗi bước 1 dòng: chấm trạng thái · nhãn · giờ ·
 * người thao tác. Thao tác duyệt nằm ở đầu trang.
 */

const DOT: Record<PoStep["state"], string> = {
  done: "bg-indigo-600 text-white dark:bg-indigo-500",
  current: "bg-white text-indigo-600 ring-2 ring-indigo-500 dark:bg-zinc-900",
  todo: "bg-white ring-1 ring-zinc-300 dark:bg-zinc-900 dark:ring-zinc-700",
  skipped: "bg-zinc-100 text-zinc-400 ring-1 ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700",
  rejected: "bg-red-600 text-white",
  cancelled: "bg-zinc-500 text-white",
};

export function PoProgressStepper({
  input,
  actorNames,
}: {
  input: PoStepInput;
  actorNames?: Record<string, string>;
}) {
  const steps = buildPoSteps(input);
  const actor = (id: string | null | undefined) =>
    id ? (actorNames?.[id] ?? `${id.slice(0, 8)}…`) : null;

  return (
    <section className="rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <h2 className="border-b border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-900 dark:border-zinc-800 dark:text-zinc-50">
        Tiến trình
      </h2>
      <ol className="px-4 py-3">
        {steps.map((s, i) => {
          const last = i === steps.length - 1;
          const who = actor(s.actorId);
          return (
            <li key={s.key} className="relative flex gap-2.5 pb-2.5 last:pb-0">
              {!last && (
                <span
                  aria-hidden
                  className={cn(
                    "absolute left-[7px] top-4 h-[calc(100%-0.75rem)] w-px",
                    s.state === "done" ? "bg-indigo-300 dark:bg-indigo-800" : "bg-zinc-200 dark:bg-zinc-700",
                  )}
                />
              )}
              <span
                aria-hidden
                className={cn(
                  "relative mt-0.5 flex h-[15px] w-[15px] shrink-0 items-center justify-center rounded-full",
                  DOT[s.state],
                )}
              >
                {s.state === "done" && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
                {s.state === "rejected" && <X className="h-2.5 w-2.5" strokeWidth={3} />}
                {s.state === "cancelled" && <X className="h-2.5 w-2.5" strokeWidth={3} />}
                {s.state === "skipped" && <Minus className="h-2.5 w-2.5" strokeWidth={3} />}
                {s.state === "current" && <span className="h-1.5 w-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />}
              </span>
              <div className="min-w-0 flex-1 text-sm leading-tight">
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={cn(
                      s.state === "todo" || s.state === "skipped"
                        ? "text-zinc-400 dark:text-zinc-500"
                        : s.state === "rejected"
                          ? "font-medium text-red-700 dark:text-red-400"
                          : s.state === "current"
                            ? "font-medium text-indigo-700 dark:text-indigo-300"
                            : "text-zinc-800 dark:text-zinc-200",
                    )}
                  >
                    {s.label}
                    {s.state === "skipped" ? <span className="text-xs"> (bỏ qua)</span> : null}
                  </span>
                  {s.at ? (
                    <span className="shrink-0 text-xs tabular-nums text-zinc-500 dark:text-zinc-400">
                      {formatDate(s.at, s.at.length > 10 ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy")}
                    </span>
                  ) : null}
                </div>
                {(who || s.note) && (
                  <p className="mt-0.5 break-words text-xs text-zinc-500 dark:text-zinc-400">
                    {[who, s.note].filter(Boolean).join(" · ")}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
