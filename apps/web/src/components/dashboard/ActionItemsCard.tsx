"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlarmClock,
  ArrowUpRight,
  ClipboardList,
  Factory,
  Inbox,
  Package,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import {
  NOTIFY_STREAM_WINDOW_EVENT,
  useNotificationStream,
  type NotifyStreamPayload,
} from "@/hooks/useNotificationStream";

/**
 * V3.2 ActionItemsCard — 3 row "Cần xử lý" cho Dashboard Tổng quan
 * (TASK-20260427-027). V4.4 (P0): đổi nguồn dữ liệu sang ĐÚNG cùng nhóm
 * "Cần bạn duyệt" của chuông thông báo — theo NGƯỜI ĐANG XEM, không còn đếm
 * lại trạng thái chứng từ riêng (trước đây thiếu PR bước DEPT_APPROVED,
 * không đếm ISR/BBGH/PO chờ duyệt → báo "Ổn định" sai).
 *
 * Data source: GET /api/dashboard/action-items (cache Redis 30s, theo user).
 *
 * 3 row (đều là việc CẦN BẠN xử lý tiếp, bấm vào mở /notifications):
 *  - PR chờ xử lý (đề xuất vật tư — mọi bước duyệt)
 *  - PO chờ xử lý (đơn mua — chốt giá/gửi duyệt/duyệt)
 *  - Việc khác chờ xử lý (Lệnh SX / xuất kho / BBGH / QC / hoá đơn…)
 *
 * Hành vi: zero state — show "Tất cả ổn" với check icon. Có ít nhất 1 row >0
 * thì mỗi row hiện count, link "Xem".
 */

interface ActionItem {
  count: number;
  href: string;
}

interface ActionItemsPayload {
  cachedAt: string;
  prDraft: ActionItem;
  poOverdue: ActionItem;
  woOverdue: ActionItem;
}

const POLL_MS = 60_000;
// TASK-notify-realtime — SSE kết nối → giãn poll làm lưới an toàn (component
// này dùng fetch tay, không phải React Query, nên vẫn cần tự poll + tự nghe
// NOTIFY_STREAM_WINDOW_EVENT để refetch tức thì khi server đẩy tín hiệu).
const POLL_MS_SSE = 5 * 60_000;

interface ActionItemsCardProps {
  className?: string;
}

export function ActionItemsCard({ className }: ActionItemsCardProps) {
  const [data, setData] = React.useState<ActionItemsPayload | null>(null);
  // V4.1 UI-05: giữ nguyên lỗi (có "HTTP xxx") để QueryError phân loại.
  const [error, setError] = React.useState<Error | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [retrying, setRetrying] = React.useState(false);

  const fetchData = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/dashboard/action-items", {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = (await res.json()) as ActionItemsPayload;
      setData(payload);
      setError(null);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
      setError(e as Error);
    } finally {
      setLoading(false);
    }
  }, []);

  // SSE kết nối → nhận tín hiệu "action" tức thời bên dưới, giãn poll ra 5
  // phút làm lưới an toàn thay vì 60s. SSE rớt/chưa kết nối → giữ 60s cũ.
  const sseConnected = useNotificationStream(true);

  React.useEffect(() => {
    const ctrl = new AbortController();
    void fetchData(ctrl.signal);
    const id = setInterval(() => fetchData(ctrl.signal), sseConnected ? POLL_MS_SSE : POLL_MS);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [fetchData, sseConnected]);

  // Cache action-items đã bị server xoá ngay khi phát/đọc thông báo "action"
  // (xem dashboard-cache.ts) → refetch ngay khi nhận tín hiệu, không đợi poll.
  React.useEffect(() => {
    const handler = (ev: Event) => {
      const payload = (ev as CustomEvent<NotifyStreamPayload>).detail;
      if (payload?.category === "action") {
        void fetchData();
      }
    };
    window.addEventListener(NOTIFY_STREAM_WINDOW_EVENT, handler);
    return () => window.removeEventListener(NOTIFY_STREAM_WINDOW_EVENT, handler);
  }, [fetchData]);

  const total = data
    ? data.prDraft.count + data.poOverdue.count + data.woOverdue.count
    : 0;

  return (
    <section
      className={cn(
        "dashboard-stagger-fade relative flex flex-col gap-4 overflow-hidden rounded-lg border border-zinc-200 bg-white p-4 dark:border-zinc-800 dark:bg-zinc-900 md:p-5",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100/80 text-amber-700 ring-1 ring-amber-200/60 dark:bg-amber-950/60 dark:text-amber-300 dark:ring-amber-800/60"
          >
            <AlarmClock className="h-4 w-4" strokeWidth={2} />
          </span>
          <h2 className="text-[14px] font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Cần xử lý
          </h2>
        </div>
        {!loading && data ? (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-wide",
              total > 0
                ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300",
            )}
          >
            {total > 0 ? `${total} mục` : "Ổn định"}
          </span>
        ) : null}
      </header>

      {error ? (
        <QueryError
          compact
          error={error}
          retrying={retrying}
          onRetry={() => {
            setRetrying(true);
            void fetchData().finally(() => setRetrying(false));
          }}
          title="Không tải được danh sách cần xử lý"
        />
      ) : null}

      {loading ? (
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full rounded-xl" />
          ))}
        </div>
      ) : data ? (
        total === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-emerald-200 bg-emerald-50/50 py-8 dark:border-emerald-900/60 dark:bg-emerald-950/30">
            <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white ring-1 ring-emerald-200/60 dark:bg-zinc-900 dark:ring-emerald-800/60">
              <ShieldCheck
                className="h-5 w-5 text-emerald-600 dark:text-emerald-400"
                strokeWidth={2}
              />
            </div>
            <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
              Tất cả đang ổn
            </p>
            <p className="text-[12px] text-zinc-500 dark:text-zinc-400">
              Chưa có việc cần xử lý gấp.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            <ActionRow
              icon={ClipboardList}
              tone="violet"
              label="PR chờ xử lý"
              hint="Đề xuất vật tư đang chờ bạn kiểm tồn/duyệt"
              count={data.prDraft.count}
              href={data.prDraft.href}
            />
            <ActionRow
              icon={Package}
              tone="amber"
              label="PO chờ xử lý"
              hint="Đơn mua đang chờ bạn chốt giá/gửi duyệt/duyệt"
              count={data.poOverdue.count}
              href={data.poOverdue.href}
            />
            <ActionRow
              icon={Factory}
              tone="rose"
              label="Việc khác chờ xử lý"
              hint="Lệnh SX / xuất kho / BBGH / QC / hoá đơn…"
              count={data.woOverdue.count}
              href={data.woOverdue.href}
            />
          </ul>
        )
      ) : error ? null : (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 py-8 dark:border-zinc-700 dark:bg-zinc-800/40">
          <Inbox className="h-5 w-5 text-zinc-400 dark:text-zinc-500" />
          <p className="text-sm text-zinc-500 dark:text-zinc-400">Chưa có dữ liệu</p>
        </div>
      )}
    </section>
  );
}

interface ActionRowProps {
  icon: typeof Factory;
  tone: "rose" | "amber" | "violet";
  label: string;
  hint: string;
  count: number;
  href: string;
}

function ActionRow({
  icon: Icon,
  tone,
  label,
  hint,
  count,
  href,
}: ActionRowProps) {
  const muted = count === 0;
  const toneCls = muted
    ? "bg-zinc-50 text-zinc-400 ring-zinc-200/60 dark:bg-zinc-800 dark:text-zinc-500 dark:ring-zinc-700"
    : tone === "rose"
      ? "bg-rose-50 text-rose-700 ring-rose-200/60 dark:bg-rose-950/50 dark:text-rose-300 dark:ring-rose-800/60"
      : tone === "amber"
        ? "bg-amber-50 text-amber-700 ring-amber-200/60 dark:bg-amber-950/50 dark:text-amber-300 dark:ring-amber-800/60"
        : "bg-indigo-50 text-indigo-700 ring-indigo-200/60 dark:bg-indigo-950/50 dark:text-indigo-300 dark:ring-indigo-800/60"; // V4.1 UI-24: tím → indigo
  const countCls = muted
    ? "text-zinc-400 dark:text-zinc-500"
    : tone === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : tone === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-indigo-700 dark:text-indigo-300";

  return (
    <li>
      <Link
        href={href}
        className={cn(
          "group flex items-center gap-3 rounded-xl border px-3 py-2.5 transition-all",
          muted
            ? "border-zinc-200/60 bg-white/60 hover:border-zinc-300 hover:bg-zinc-50/60 dark:border-zinc-800/60 dark:bg-zinc-900/60 dark:hover:border-zinc-700 dark:hover:bg-zinc-800/60"
            : "border-zinc-200/70 bg-white/80 hover:-translate-y-0.5 hover:border-indigo-300/70 hover:shadow-sm dark:border-zinc-800/70 dark:bg-zinc-900/80 dark:hover:border-indigo-700/70",
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            toneCls,
          )}
        >
          <Icon className="h-4 w-4" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p
            className={cn(
              "truncate text-[13px] font-semibold leading-tight",
              muted ? "text-zinc-500 dark:text-zinc-400" : "text-zinc-900 dark:text-zinc-50",
            )}
          >
            {label}
          </p>
          <p className="truncate text-[11.5px] text-zinc-500 dark:text-zinc-400">{hint}</p>
        </div>
        <span
          className={cn(
            "tabular-nums text-2xl font-bold leading-none",
            countCls,
          )}
        >
          {count}
        </span>
        <ArrowUpRight
          aria-hidden="true"
          className="h-4 w-4 text-zinc-400 transition-transform duration-150 ease-out group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:text-zinc-700 dark:text-zinc-500 dark:group-hover:text-zinc-200"
        />
      </Link>
    </li>
  );
}
