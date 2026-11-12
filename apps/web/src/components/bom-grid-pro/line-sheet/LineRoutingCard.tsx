"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { PROCESS_MAP } from "./constants";
import { hasRoutingData, type FormState } from "./model";

/** Card "Thông tin gia công" (xem): thu gọn mặc định, ẩn hẳn nếu không có dữ liệu. */
export function LineRoutingCard({ form }: { form: FormState }) {
  const [open, setOpen] = React.useState(false);
  if (!hasRoutingData(form)) return null;
  const rows: Array<[string, React.ReactNode]> = [];
  if (form.materialCode)
    rows.push(["Vật liệu gốc", form.materialName ? `${form.materialCode} — ${form.materialName}` : form.materialCode]);
  if (form.estimatedHours) rows.push(["Thời gian ước tính", `${form.estimatedHours} giờ`]);
  if (form.technicalNotes) rows.push(["Ghi chú kỹ thuật", form.technicalNotes]);
  return (
    <section className="rounded-2xl bg-zinc-50 dark:bg-zinc-800/40">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-2xl px-4 py-3.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
      >
        <span className="text-[13px] font-semibold text-zinc-900 dark:text-zinc-50">
          Thông tin gia công
        </span>
        <ChevronDown
          className={cn("h-4 w-4 text-zinc-400 transition-transform", open && "rotate-180")}
          aria-hidden
        />
      </button>
      {open && (
        <div className="space-y-3 px-4 pb-4">
          {form.processRoute.length > 0 && (
            <ol className="flex flex-wrap items-center gap-1.5">
              {form.processRoute.map((c, i) => (
                <li
                  key={c}
                  className="inline-flex items-center gap-1 rounded-full bg-white px-2.5 py-1 text-[12px] text-zinc-700 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700"
                >
                  <span className="font-mono text-[11px] text-zinc-400">{i + 1}</span>
                  {PROCESS_MAP.get(c)?.name ?? c}
                </li>
              ))}
            </ol>
          )}
          <dl className="space-y-2">
            {rows.map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-4">
                <dt className="shrink-0 text-[12px] text-zinc-500 dark:text-zinc-400">{k}</dt>
                <dd className="min-w-0 break-words text-right text-[13px] text-zinc-900 dark:text-zinc-50">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </section>
  );
}
