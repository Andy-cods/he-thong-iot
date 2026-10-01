"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  Loader2,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { notificationIcon } from "@/components/layout/notification-icons";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { cn } from "@/lib/utils";
import { formatRelative } from "@/lib/format";
import { notifTypeLabel } from "@/lib/status";
import { groupNotificationsByCategory, type NotifyCategory } from "@/lib/notification-groups";
import { PushNotificationToggle } from "@/components/layout/PushNotificationToggle";

/**
 * V3.3 — Trang `/notifications` full list với filter unread/all + role broadcast.
 */

interface NotificationItem {
  id: string;
  recipientUser: string | null;
  recipientRole: string | null;
  actorUsername: string | null;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  entityCode: string | null;
  title: string;
  message: string | null;
  link: string | null;
  severity: "info" | "success" | "warning" | "error";
  readAt: string | null;
  createdAt: string;
  isDirect: boolean;
  category: NotifyCategory;
}

interface NotificationsResponse {
  data: NotificationItem[];
  meta: { hasMore: boolean; nextCursor: string | null; unreadCount: number; unreadTotal: number };
}


// V4.1 UI-27: nhãn chip loại thông báo lấy từ lib/status.ts (notifTypeLabel) —
// mã lạ hiện "Thông báo", KHÔNG BAO GIỜ lộ mã thô kiểu PR_PENDING_REMINDER.

const SEVERITY_CLS: Record<string, string> = {
  info:    "bg-blue-50 text-blue-600 ring-blue-200",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  warning: "bg-amber-50 text-amber-600 ring-amber-200",
  error:   "bg-red-50 text-red-600 ring-red-200",
};

/**
 * V4.4 (G2, UI_INVENTORY §0 "Loại 1"/"Loại 2") — gộp hiển thị thông báo trùng
 * lặp, KHÔNG đổi logic tạo/đọc thông báo (chỉ transform tại tầng render):
 *
 * - "Loại 1" (P1, ĐÚNG THIẾT KẾ nhưng UI gây hiểu lầm spam) — worker nhắc lại
 *   mỗi 24h cho cùng 1 phiếu còn treo (`PR_PENDING_REMINDER`…) → 4 thông báo
 *   giống hệt nhau ngoại trừ mốc thời gian. Gộp theo (entity, loại sự kiện)
 *   KHÔNG giới hạn ngày — giữ bản MỚI NHẤT làm đại diện + đếm "đã nhắc N lần".
 * - "Loại 2" (P2, khuyến nghị phòng tái diễn dù chưa chắc root cause) — vài
 *   cặp thông báo lặp 5-6 lần CÙNG NGÀY (nghi ngờ insert trùng ở seed/E2E).
 *   Gộp theo (entity, loại sự kiện, ngày) cho các nhóm KHÁC "reminder" —
 *   an toàn vì cùng ngày + cùng entity + cùng loại sự kiện gần như chắc chắn
 *   là bản ghi lặp, không phải 2 sự kiện nghiệp vụ khác nhau thật.
 */
interface DisplayNotification extends NotificationItem {
  repeatCount: number;
  groupedIds: string[];
}

function foldNotification(
  existing: DisplayNotification,
  incoming: NotificationItem,
): DisplayNotification {
  const incomingIsNewer =
    new Date(incoming.createdAt).getTime() > new Date(existing.createdAt).getTime();
  const base = incomingIsNewer ? incoming : existing;
  const anyUnread =
    (existing.isDirect && !existing.readAt) || (incoming.isDirect && !incoming.readAt);
  return {
    ...base,
    readAt: anyUnread ? null : base.readAt,
    repeatCount: existing.repeatCount + 1,
    groupedIds: [...existing.groupedIds, incoming.id],
  };
}

function collapseNotifications(
  items: NotificationItem[],
  keyOf: (n: NotificationItem) => string,
): DisplayNotification[] {
  const seen = new Map<string, DisplayNotification>();
  const order: string[] = [];
  for (const n of items) {
    const key = n.entityId ? keyOf(n) : `id:${n.id}`;
    const existing = seen.get(key);
    if (!existing) {
      seen.set(key, { ...n, repeatCount: 1, groupedIds: [n.id] });
      order.push(key);
    } else {
      seen.set(key, foldNotification(existing, n));
    }
  }
  return order.map((k) => seen.get(k)!);
}

function collapseForDisplay(category: NotifyCategory, items: NotificationItem[]): DisplayNotification[] {
  if (category === "reminder") {
    return collapseNotifications(items, (n) => `${n.entityType ?? ""}:${n.entityId}:${n.eventType}`);
  }
  return collapseNotifications(
    items,
    (n) => `${n.entityType ?? ""}:${n.entityId}:${n.eventType}:${n.createdAt.slice(0, 10)}`,
  );
}

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<"all" | "unread" | "direct" | "broadcast">("all");
  const qc = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey: ["notifications", "page", filter],
    queryFn: async () => {
      const url = filter === "unread" ? "/api/notifications?unread=1&limit=100" : "/api/notifications?limit=100";
      const res = await fetch(url, { credentials: "include" });
      // V4.1 UI-05: kèm mã HTTP để QueryError phân biệt 429/403/5xx.
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    refetchInterval: 30_000,
    staleTime: 25_000,
  });

  const markRead = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/notifications/${id}/read`, {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllRead = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/notifications/read-all", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) throw new Error();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  let items = query.data?.data ?? [];
  if (filter === "direct") items = items.filter((i) => i.isDirect);
  if (filter === "broadcast") items = items.filter((i) => !i.isDirect);
  const groups = groupNotificationsByCategory(items);

  const unreadCount = query.data?.meta.unreadCount ?? 0;

  return (
    <div className="flex flex-col bg-zinc-50/30 md:h-full dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6 md:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <nav aria-label="Đường dẫn" className="text-xs text-zinc-500 dark:text-zinc-400">
              <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-50">Tổng quan</Link>
              <span className="mx-1.5 text-zinc-300 dark:text-zinc-600">›</span>
              <span className="font-medium text-zinc-900 dark:text-zinc-50">Thông báo</span>
            </nav>
            <h1 className="mt-2 flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 md:text-2xl dark:text-zinc-50">
              <Bell className="h-5 w-5 text-indigo-600 md:h-6 md:w-6 dark:text-indigo-400" aria-hidden />
              Thông báo
            </h1>
            <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
              Thông báo công việc
              <span className="hidden sm:inline">
                {" "}— cho bạn + theo bộ phận
              </span>
              {unreadCount > 0 && (
                <> · <span className="font-semibold text-indigo-600 dark:text-indigo-400">{unreadCount}</span> chưa đọc</>
              )}
            </p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => markAllRead.mutate()}
              disabled={markAllRead.isPending}
              title="Đánh dấu tất cả đã đọc"
              aria-label="Đánh dấu tất cả đã đọc"
              className="shrink-0 whitespace-nowrap"
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              {/* V4.1: nhãn ngắn trên phone để nút không gãy 2 dòng. */}
              <span className="hidden sm:inline" aria-hidden>Đánh dấu tất cả đã đọc</span>
              <span className="sm:hidden" aria-hidden>Đọc hết</span>
            </Button>
          )}
        </div>
      </header>

      {/* Web Push toggle (V4.4) */}
      <div className="px-4 pt-3 md:px-6">
        <PushNotificationToggle />
      </div>

      {/* Filter pills */}
      <div className="flex items-center gap-2 overflow-x-auto border-b border-zinc-200 bg-white px-4 py-3 md:px-6 dark:border-zinc-800 dark:bg-zinc-900">
        {[
          { v: "all" as const, label: "Tất cả" },
          { v: "unread" as const, label: "Chưa đọc" },
          { v: "direct" as const, label: "Cho cá nhân" },
          { v: "broadcast" as const, label: "Theo bộ phận" },
        ].map((opt) => (
          <button
            key={opt.v}
            type="button"
            onClick={() => setFilter(opt.v)}
            className={cn(
              "inline-flex h-8 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition-colors",
              filter === opt.v
                ? "border-indigo-300 bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:border-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-800"
                : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-zinc-600 dark:hover:bg-zinc-800/60",
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 p-3 md:overflow-auto md:p-6">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : query.isError && !query.data ? (
          // V4.1 UI-05: API lỗi → khối lỗi + "Thử lại", không phải "Chưa có thông báo".
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được thông báo"
          />
        ) : items.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center md:p-12 dark:border-zinc-700 dark:bg-zinc-900">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
              <Bell className="h-7 w-7 text-zinc-400 dark:text-zinc-500" aria-hidden />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-900 dark:text-zinc-50">
              {filter === "unread" ? "Không có thông báo chưa đọc" : "Chưa có thông báo nào"}
            </h3>
            <p className="mt-1.5 text-sm text-zinc-500 dark:text-zinc-400">
              Bạn sẽ nhận thông báo khi có hoạt động mới.
            </p>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl space-y-5">
            {groups.map((g) => {
              // V4.4 — gộp trùng lặp TẠI TẦNG HIỂN THỊ, dữ liệu gốc `g.items`
              // giữ nguyên (đếm unread, cursor phân trang không đổi).
              const displayed = collapseForDisplay(g.key, g.items);
              return (
                <section key={g.key}>
                  <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-zinc-400 dark:text-zinc-500">
                    {g.label}
                    <span className="ml-1.5 font-normal normal-case text-zinc-400 dark:text-zinc-500">
                      ({displayed.length})
                    </span>
                  </h2>
                  <div className="space-y-2">
                    {displayed.map((n) => (
                      <NotificationCard
                        key={n.id}
                        item={n}
                        onRead={(ids) => ids.forEach((id) => markRead.mutate(id))}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// V4.1 UI-15: thời gian tương đối qua lib/format (≥ 7 ngày → dd/MM/yyyy giờ VN).
function relativeTime(iso: string): string {
  return formatRelative(iso, { justNow: "Vừa xong" });
}

/** 1 thẻ thông báo trên trang /notifications — tách khỏi vòng lặp nhóm (V4.4). */
function NotificationCard({
  item: n,
  onRead,
}: {
  item: DisplayNotification;
  onRead: (ids: string[]) => void;
}) {
  const Icon = notificationIcon(n.eventType);
  const sevCls = SEVERITY_CLS[n.severity] ?? SEVERITY_CLS.info!;
  const isUnread = n.isDirect && !n.readAt;
  const card = (
    <div
      className={cn(
        "flex gap-3 rounded-2xl border bg-white p-3 transition-shadow hover:shadow-md md:gap-4 md:p-4 dark:bg-zinc-900",
        isUnread
          ? "border-indigo-300 shadow-sm dark:border-indigo-700"
          : "border-zinc-200 dark:border-zinc-800",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset md:h-11 md:w-11",
          sevCls,
        )}
      >
        <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={cn(
              "line-clamp-2 text-sm leading-snug md:text-base",
              isUnread
                ? "font-bold text-zinc-900 dark:text-zinc-50"
                : "font-semibold text-zinc-800 dark:text-zinc-200",
            )}
          >
            {n.title}
          </p>
          {isUnread && (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500" aria-hidden />
          )}
        </div>
        {n.message && (
          <p className="mt-1 line-clamp-3 text-sm text-zinc-600 dark:text-zinc-400">{n.message}</p>
        )}
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
          <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
            {notifTypeLabel(n.eventType)}
          </span>
          <span>{relativeTime(n.createdAt)}</span>
          {n.actorUsername && <span>· bởi {n.actorUsername}</span>}
          {!n.isDirect && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-xs font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-800">
              Cho bộ phận
            </span>
          )}
          {n.repeatCount > 1 && (
            <span
              className="rounded bg-amber-50 px-1.5 py-0.5 font-medium text-amber-700 ring-1 ring-inset ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800"
              title="Cùng 1 chứng từ, hệ thống nhắc lại theo chu kỳ — đã gộp hiển thị"
            >
              Đã nhắc {n.repeatCount} lần
            </span>
          )}
        </div>
      </div>
    </div>
  );
  return n.link ? (
    <Link
      href={n.link}
      onClick={() => {
        // Thẻ đã gộp (repeatCount > 1) → đánh dấu đã đọc TOÀN BỘ id gốc, không
        // chỉ bản đại diện đang hiện, để chuông thông báo/unreadCount khớp.
        if (isUnread) onRead(n.groupedIds);
      }}
      className="block"
    >
      {card}
    </Link>
  ) : (
    <div>{card}</div>
  );
}
