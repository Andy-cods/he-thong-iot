"use client";

import * as React from "react";
import { AlertCircle, RefreshCw, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { countPendingScans, getDB, type ScanEvent } from "@/lib/dexie";
import { cn } from "@/lib/utils";

/**
 * ScanQueueBadge — floating button top-right, show count events chưa sync.
 * Click → mở Sheet với list pending events + retry/delete per event.
 *
 * Design-spec §3.18.1 + brainstorm-deep §2.5 D19 FIFO.
 * Auto-refresh 5s — đủ cho workload V1 (không cần Dexie liveQuery overhead).
 */
export function ScanQueueBadge({ poId }: { poId?: string }) {
  const [count, setCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<ScanEvent[]>([]);

  const refresh = React.useCallback(async () => {
    try {
      const c = await countPendingScans(poId);
      setCount(c);
      if (open) {
        const db = getDB();
        const list = await db.scanQueue
          .orderBy("createdAt")
          .filter(
            (e) =>
              (poId ? e.poId === poId : true) &&
              (e.status === "pending" || e.status === "failed"),
          )
          .toArray();
        setEvents(list);
      }
    } catch {
      // ignore — SSR or Dexie not ready
    }
  }, [poId, open]);

  React.useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const tone =
    count === 0
      ? "bg-slate-100 text-slate-600"
      : count > 50
        ? "bg-danger-soft text-danger-strong"
        : count > 10
          ? "bg-warning-soft text-warning-strong"
          : "bg-info-soft text-info-strong";

  const label = `Hàng đợi quét: ${count} ${count > 50 ? "(tải cao)" : count > 10 ? "(đầy)" : ""}`;

  const handleRetry = async (id: string) => {
    const db = getDB();
    await db.scanQueue.update(id, { status: "pending", lastError: null });
    await refresh();
  };

  const handleDelete = async (id: string) => {
    const db = getDB();
    await db.scanQueue.delete(id);
    await refresh();
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={cn(
          "fixed right-3 top-3 z-sticky inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-sm font-medium shadow-md focus:outline-none focus-visible:shadow-focus-strong",
          tone,
        )}
      >
        <span
          aria-hidden
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            count > 50
              ? "bg-danger"
              : count > 10
                ? "bg-warning"
                : count > 0
                  ? "bg-info"
                  : "bg-slate-400",
          )}
        />
        <span className="tabular-nums">{count}</span>
        <span className="sr-only">{label}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size="md">
          <SheetHeader>
            <SheetTitle>Hàng đợi quét ({count})</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {events.length === 0 ? (
              <p className="text-sm text-slate-500">
                Không có sự kiện chờ đồng bộ.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-md border border-slate-200 p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm font-medium text-slate-900">
                            {ev.code}
                          </code>
                          {ev.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 rounded bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger-strong">
                              <AlertCircle
                                className="h-3 w-3"
                                aria-hidden
                              />
                              Thất bại ×{ev.retryCount}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info-strong">
                              Chờ
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 tabular-nums">
                          qty {ev.qty}
                          {ev.lotNo ? ` · lot ${ev.lotNo}` : ""} ·{" "}
                          {new Date(ev.createdAt).toLocaleTimeString("vi-VN")}
                        </p>
                        {ev.lastError ? (
                          <p className="mt-1 text-xs text-danger-strong">
                            {ev.lastError}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        {ev.status === "failed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => void handleRetry(ev.id)}
                            aria-label="Thử lại"
                          >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void handleDelete(ev.id)}
                          aria-label="Xoá"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </SheetBody>
        </SheetContent>
      </Sheet>
    </>
  );
}
