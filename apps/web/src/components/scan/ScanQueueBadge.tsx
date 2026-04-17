"use client";

import * as React from "react";
import { AlertCircle, RefreshCw, Trash2, WifiOff } from "lucide-react";
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
 * V2 ScanQueueBadge — design-spec §3.7.3.
 *
 * - Floating top-right bg-white border zinc-200 rounded-md shadow-sm
 *   padding 8 12px.
 * - Count badge h-5 px-1.5 text-xs font-mono tabular-nums.
 * - Offline tone amber-50/amber-700, normal tone zinc-50/zinc-700, overflow
 *   red-50/red-700.
 * - Click mở Sheet width 360px list pending events + retry/delete each.
 * - Auto-refresh 5s (logic V1).
 */
export function ScanQueueBadge({ poId }: { poId?: string }) {
  const [count, setCount] = React.useState(0);
  const [open, setOpen] = React.useState(false);
  const [events, setEvents] = React.useState<ScanEvent[]>([]);
  const [online, setOnline] = React.useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

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
      // ignore SSR
    }
  }, [poId, open]);

  React.useEffect(() => {
    void refresh();
    const t = window.setInterval(() => void refresh(), 5000);
    return () => window.clearInterval(t);
  }, [refresh]);

  const label = `Hàng đợi quét: ${count} sự kiện${!online ? " (offline)" : ""}`;

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

  const tone = !online
    ? "bg-amber-50 border-amber-200 text-amber-800"
    : count > 50
      ? "bg-red-50 border-red-200 text-red-700"
      : count > 10
        ? "bg-amber-50 border-amber-200 text-amber-800"
        : "bg-white border-zinc-200 text-zinc-700";

  const dotTone = !online
    ? "bg-amber-500"
    : count > 50
      ? "bg-red-500"
      : count > 10
        ? "bg-amber-500"
        : count > 0
          ? "bg-blue-500"
          : "bg-zinc-400";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={label}
        className={cn(
          "fixed right-3 top-3 z-sticky inline-flex items-center gap-2 rounded-md border px-3 py-2 shadow-sm transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500",
          tone,
        )}
      >
        {!online ? (
          <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <span
            aria-hidden="true"
            className={cn("h-2 w-2 rounded-full", dotTone)}
          />
        )}
        <span className="text-xs font-medium">Hàng đợi</span>
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-sm bg-white/70 px-1.5 text-xs font-mono font-semibold tabular-nums",
            count === 0 && "text-zinc-500",
          )}
        >
          {count}
        </span>
        <span className="sr-only">{label}</span>
      </button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="right" size="md">
          <SheetHeader>
            <SheetTitle>Hàng đợi quét ({count})</SheetTitle>
          </SheetHeader>
          <SheetBody>
            {events.length === 0 ? (
              <p className="text-sm text-zinc-500">
                Không có sự kiện chờ đồng bộ.
              </p>
            ) : (
              <ul className="space-y-2">
                {events.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-md border border-zinc-200 bg-white p-3"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm font-medium text-zinc-900">
                            {ev.code}
                          </code>
                          {ev.status === "failed" ? (
                            <span className="inline-flex items-center gap-1 rounded-sm bg-red-50 px-1.5 py-0.5 text-xs font-medium text-red-700">
                              <AlertCircle
                                className="h-3 w-3"
                                aria-hidden="true"
                              />
                              Thất bại ×{ev.retryCount}
                            </span>
                          ) : (
                            <span className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                              Chờ
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 tabular-nums">
                          qty {ev.qty.toLocaleString("vi-VN")}
                          {ev.lotNo ? ` · lot ${ev.lotNo}` : ""} ·{" "}
                          {new Date(ev.createdAt).toLocaleTimeString("vi-VN")}
                        </p>
                        {ev.lastError ? (
                          <p className="mt-1 text-xs text-red-700">
                            {ev.lastError}
                          </p>
                        ) : null}
                      </div>
                      <div className="flex gap-1">
                        {ev.status === "failed" ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="icon-sm"
                            onClick={() => void handleRetry(ev.id)}
                            aria-label="Thử lại"
                          >
                            <RefreshCw
                              className="h-3.5 w-3.5"
                              aria-hidden="true"
                            />
                          </Button>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="icon-sm"
                          onClick={() => void handleDelete(ev.id)}
                          aria-label="Xoá"
                        >
                          <Trash2
                            className="h-3.5 w-3.5"
                            aria-hidden="true"
                          />
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
