"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AuditRow as AuditRowData } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

// Lazy-load diff viewer (heavy lib) + rollback dialog — chỉ load khi user mở row
const AuditDiffViewer = dynamic(
  () => import("./AuditDiffViewer").then((m) => m.AuditDiffViewer),
  {
    ssr: false,
    loading: () => (
      <div className="rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
        Đang tải diff viewer…
      </div>
    ),
  },
);
const RollbackPreviewDialog = dynamic(
  () =>
    import("./RollbackPreviewDialog").then((m) => m.RollbackPreviewDialog),
  { ssr: false },
);

const ACTION_COLORS: Record<string, string> = {
  CREATE: "bg-emerald-50 text-emerald-700 border-emerald-200",
  UPDATE: "bg-blue-50 text-blue-700 border-blue-200",
  DELETE: "bg-red-50 text-red-700 border-red-200",
  LOGIN: "bg-zinc-100 text-zinc-600 border-zinc-200",
  LOGOUT: "bg-zinc-100 text-zinc-600 border-zinc-200",
};

// Actions có thể sinh rollback SQL preview
const ROLLBACKABLE = new Set(["CREATE", "UPDATE", "DELETE"]);

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
  const [expanded, setExpanded] = React.useState(false);
  const [rollbackOpen, setRollbackOpen] = React.useState(false);

  const diff = diffSummary(row.beforeJson, row.afterJson);
  const hasDiff = diff.count > 0 || row.beforeJson !== null || row.afterJson !== null;
  const canRollback = ROLLBACKABLE.has(row.action) && row.objectId !== null;

  return (
    <div style={style} role="row" className="border-t border-zinc-100">
      <div
        className={cn(
          "grid min-h-[36px] items-center gap-3 px-4 py-1.5 text-xs transition-colors hover:bg-zinc-50",
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
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex items-center gap-1 rounded-sm border border-zinc-200 bg-white px-1.5 py-0.5 text-[10px] text-zinc-700 hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              aria-expanded={expanded}
              aria-label={expanded ? "Thu gọn diff" : "Mở rộng diff"}
            >
              {expanded ? (
                <ChevronDown className="h-3 w-3" aria-hidden="true" />
              ) : (
                <ChevronRight className="h-3 w-3" aria-hidden="true" />
              )}
              {diff.count > 0 ? `${diff.count} thay đổi` : "Xem diff"}
            </button>
          ) : row.notes ? (
            <span className="truncate text-zinc-500">{row.notes}</span>
          ) : (
            <span className="text-zinc-400">—</span>
          )}
        </div>
      </div>

      {expanded && hasDiff ? (
        <div className="space-y-2 border-t border-zinc-100 bg-zinc-50/50 px-4 py-3">
          {row.notes ? (
            <p className="text-[11px] text-zinc-600">
              <span className="font-semibold text-zinc-700">Ghi chú:</span>{" "}
              {row.notes}
            </p>
          ) : null}
          <AuditDiffViewer
            beforeJson={row.beforeJson}
            afterJson={row.afterJson}
          />
          {canRollback ? (
            <div className="flex justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setRollbackOpen(true)}
              >
                <History className="h-3.5 w-3.5" aria-hidden="true" />
                Xem SQL rollback
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {rollbackOpen ? (
        <RollbackPreviewDialog
          open={rollbackOpen}
          onOpenChange={setRollbackOpen}
          action={row.action}
          objectType={row.objectType}
          objectId={row.objectId}
          beforeJson={row.beforeJson}
          afterJson={row.afterJson}
        />
      ) : null}
    </div>
  );
}
