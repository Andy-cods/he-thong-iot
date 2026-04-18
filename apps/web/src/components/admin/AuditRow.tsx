"use client";

import * as React from "react";
import { Info } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { AuditRow as AuditRowData } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
  LOGIN: "bg-zinc-100 text-zinc-600 border-zinc-200",
  LOGOUT: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

function fmtTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function diffSummary(
  before: unknown,
  after: unknown,
): { count: number; keys: string[] } {
  if (!before && !after) return { count: 0, keys: [] };
  const bObj = (before as Record<string, unknown>) ?? {};
  const aObj = (after as Record<string, unknown>) ?? {};
  const keys = new Set<string>([...Object.keys(bObj), ...Object.keys(aObj)]);
  const changed: string[] = [];
  for (const k of keys) {
    if (JSON.stringify(bObj[k]) !== JSON.stringify(aObj[k])) {
      changed.push(k);
    }
  }
  return { count: changed.length, keys: changed };
}

export interface AuditRowProps {
  row: AuditRowData;
  style?: React.CSSProperties;
  gridCols: string;
}

export function AuditRow({ row, style, gridCols }: AuditRowProps) {
  const diff = diffSummary(row.beforeJson, row.afterJson);
  const hasDiff = diff.count > 0;

  return (
    <div
      style={style}
      role="row"
      className={cn(
        "grid min-h-[36px] items-center gap-3 border-t border-zinc-100 px-4 py-1.5 text-xs transition-colors hover:bg-zinc-50",
        gridCols,
      )}
    >
      <span className="truncate font-mono text-[11px] text-zinc-500 tabular-nums">
        {fmtTime(row.occurredAt)}
      </span>
      <span className="truncate text-zinc-700">
        {row.actorUsername ?? (
          <span className="italic text-zinc-400">system</span>
        )}
      </span>
      <span
        className={cn(
          "inline-flex h-5 w-fit items-center justify-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase",
          ACTION_COLORS[row.action] ?? ACTION_COLORS.UPDATE,
        )}
      >
        {row.action}
      </span>
      <span className="truncate text-zinc-700">{row.objectType}</span>
      <code className="hidden truncate font-mono text-[10px] text-zinc-500 md:block">
        {row.objectId ? row.objectId.slice(0, 8) : "—"}
      </code>
      <div className="hidden items-center gap-1.5 md:flex">
        {hasDiff ? (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
                aria-label={`Xem chi tiết ${diff.count} thay đổi`}
              >
                <Info className="h-3 w-3" aria-hidden="true" />
                {diff.count} thay đổi
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-[360px] p-3">
              <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Chi tiết diff
              </h4>
              <div className="space-y-2">
                {diff.keys.map((k) => {
                  const b = (row.beforeJson as Record<string, unknown>)?.[k];
                  const a = (row.afterJson as Record<string, unknown>)?.[k];
                  return (
                    <div
                      key={k}
                      className="rounded-sm border border-zinc-200 bg-zinc-50 p-2"
                    >
                      <div className="mb-1 font-mono text-[10px] font-semibold text-zinc-700">
                        {k}
                      </div>
                      <div className="flex flex-col gap-1 text-xs">
                        <span className="truncate text-red-600">
                          - {JSON.stringify(b)}
                        </span>
                        <span className="truncate text-emerald-600">
                          + {JSON.stringify(a)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
              {row.notes ? (
                <p className="mt-2 border-t border-zinc-200 pt-2 text-xs text-zinc-500">
                  {row.notes}
                </p>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : row.notes ? (
          <span className="truncate text-zinc-500">{row.notes}</span>
        ) : (
          <span className="text-zinc-400">—</span>
        )}
      </div>
    </div>
  );
}
