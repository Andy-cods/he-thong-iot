"use client";

import * as React from "react";
import { AlertTriangle, CloudOff, RefreshCw, Trash2, UploadCloud } from "lucide-react";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { loadQueue, OFFLINE_QUEUE_EVENT, OFFLINE_QUEUE_KEY } from "@/lib/shift-output/offline-queue";
import type { useOfflineQueue } from "@/hooks/useShiftOutput";

/**
 * V4.10 — hiển thị hàng đợi offline ("Chờ gửi"): đếm, gửi lại, dòng lỗi (409 trùng
 * ca, 422…) có nút bỏ. Không ẩn lỗi: dòng hỏng nằm lại tới khi người nhập xử lý.
 */
export function OfflineQueuePanel({ queue }: { queue: ReturnType<typeof useOfflineQueue> }) {
  const confirm = useConfirm();
  if (queue.queue.length === 0 && queue.online) return null;
  return (
    <section
      aria-live="polite"
      className={cn(
        "rounded-xl px-3.5 py-3",
        queue.failedCount > 0
          ? "bg-red-50 text-red-900 dark:bg-red-950/40 dark:text-red-200"
          : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
      )}
    >
      <div className="flex items-center gap-2">
        {queue.online ? <UploadCloud className="h-5 w-5 shrink-0" aria-hidden="true" /> : <CloudOff className="h-5 w-5 shrink-0" aria-hidden="true" />}
        <div className="min-w-0 flex-1 text-md">
          <div className="font-semibold">
            {queue.online ? "Có mạng" : "Mất mạng — vẫn lưu được trên máy"}
            {queue.pendingCount > 0 ? ` · Chờ gửi ${queue.pendingCount}` : ""}
            {queue.failedCount > 0 ? ` · Lỗi ${queue.failedCount}` : ""}
          </div>
          {queue.pendingCount > 0 ? <div className="text-sm opacity-80">Tự gửi khi có mạng (mỗi 30 giây).</div> : null}
        </div>
        {queue.pendingCount > 0 ? (
          <button
            type="button"
            onClick={() => void queue.flush()}
            disabled={queue.flushing}
            className="inline-flex min-h-11 items-center gap-1.5 rounded-lg bg-white px-3 text-md font-medium text-zinc-900 shadow-xs disabled:opacity-60 dark:bg-zinc-900 dark:text-zinc-50"
          >
            <RefreshCw className={cn("h-4 w-4", queue.flushing && "animate-spin")} aria-hidden="true" />
            Gửi lại
          </button>
        ) : null}
      </div>
      {queue.queue.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {queue.queue.map((q) => (
            <li key={q.clientUuid} className="flex items-start gap-2 rounded-lg bg-white/70 px-2.5 py-2 text-sm dark:bg-zinc-900/60">
              {q.status === "failed" ? (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-600" aria-hidden="true" />
              ) : (
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
              )}
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium text-zinc-900 dark:text-zinc-50">{q.label ?? q.clientUuid.slice(0, 8)}</div>
                <div className="text-zinc-600 dark:text-zinc-400">
                  {q.status === "failed" ? (q.error?.message ?? "Không gửi được") : "Chờ gửi"}
                </div>
              </div>
              {q.status === "failed" ? (
                <div className="flex shrink-0 gap-1">
                  {q.error?.status !== 409 ? (
                    <button type="button" className="min-h-9 rounded-md px-2 font-medium text-indigo-700" onClick={() => queue.retry(q.clientUuid)}>
                      Thử lại
                    </button>
                  ) : null}
                  <button
                    type="button"
                    aria-label="Bỏ dòng này"
                    className="min-h-9 rounded-md px-2 text-red-700"
                    onClick={async () => {
                      if (await confirm({ title: "Bỏ dòng chờ gửi?", description: "Dòng này sẽ không được gửi lên hệ thống.", tone: "danger", confirmLabel: "Bỏ" })) {
                        queue.remove(q.clientUuid);
                      }
                    }}
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/** Badge "Chờ gửi N" gọn cho thanh tab — chỉ ĐỌC localStorage (không tự gửi). */
export function QueueBadge() {
  const [count, setCount] = React.useState(0);
  React.useEffect(() => {
    const read = () => setCount(loadQueue().length);
    read();
    const onStorage = (e: StorageEvent) => {
      if (e.key === OFFLINE_QUEUE_KEY) read();
    };
    window.addEventListener(OFFLINE_QUEUE_EVENT, read);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(OFFLINE_QUEUE_EVENT, read);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  if (count === 0) return null;
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-sm font-semibold text-amber-800 dark:bg-amber-900/50 dark:text-amber-200">
      <CloudOff className="h-3.5 w-3.5" aria-hidden="true" />
      Chờ gửi {count}
    </span>
  );
}
