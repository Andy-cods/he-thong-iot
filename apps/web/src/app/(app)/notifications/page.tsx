"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCheck,
  CheckCircle2,
  Clock,
  Factory,
  FileText,
  Loader2,
  Package,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
}

interface NotificationsResponse {
  data: NotificationItem[];
  meta: { hasMore: boolean; nextCursor: string | null; unreadCount: number };
}

const EVENT_ICON: Record<string, React.ElementType> = {
  PR_SUBMITTED: ShoppingCart,
  PR_APPROVED: CheckCircle2,
  PR_REJECTED: XCircle,
  PO_SENT: Package,
  PO_RECEIVED_PARTIAL: Package,
  PO_RECEIVED_FULL: CheckCircle2,
  WO_RELEASED: Factory,
  WO_COMPLETED: CheckCircle2,
  MATERIAL_REQUEST_NEW: FileText,
  MATERIAL_REQUEST_PICKING: Clock,
  MATERIAL_REQUEST_READY: CheckCircle2,
  MATERIAL_REQUEST_DELIVERED: CheckCheck,
};

const EVENT_LABEL: Record<string, string> = {
  PR_SUBMITTED: "Yêu cầu mua mới",
  PR_APPROVED: "PR được duyệt",
  PR_REJECTED: "PR bị từ chối",
  PO_SENT: "PO đã gửi",
  PO_RECEIVED_PARTIAL: "PO nhận một phần",
  PO_RECEIVED_FULL: "PO nhận đủ",
  WO_RELEASED: "WO mới",
  WO_COMPLETED: "WO hoàn thành",
  MATERIAL_REQUEST_NEW: "Yêu cầu xuất kho",
  MATERIAL_REQUEST_PICKING: "Đang chuẩn bị",
  MATERIAL_REQUEST_READY: "Đã chuẩn bị xong",
  MATERIAL_REQUEST_DELIVERED: "Đã giao",
};

const SEVERITY_CLS: Record<string, string> = {
  info:    "bg-blue-50 text-blue-600 ring-blue-200",
  success: "bg-emerald-50 text-emerald-600 ring-emerald-200",
  warning: "bg-amber-50 text-amber-600 ring-amber-200",
  error:   "bg-red-50 text-red-600 ring-red-200",
};

export default function NotificationsPage() {
  const [filter, setFilter] = React.useState<"all" | "unread" | "direct" | "broadcast">("all");
  const qc = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey: ["notifications", "page", filter],
    queryFn: async () => {
      const url = filter === "unread" ? "/api/notifications?unread=1&limit=100" : "/api/notifications?limit=100";
      const res = await fetch(url, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
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

  const unreadCount = query.data?.meta.unreadCount ?? 0;

  return (
    <div className="flex flex-col bg-zinc-50/30 md:h-full dark:bg-zinc-950">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 md:px-6 md:py-5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
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
            >
              <CheckCheck className="h-3.5 w-3.5" aria-hidden />
              <span className="hidden sm:inline">Đánh dấu tất cả đã đọc</span>
              <span className="sm:hidden">Đã đọc hết</span>
            </Button>
          )}
        </div>
      </header>

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
          <div className="mx-auto max-w-3xl space-y-2">
            {items.map((n) => {
              const Icon = EVENT_ICON[n.eventType] ?? Bell;
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
                  <div className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset md:h-11 md:w-11",
                    sevCls,
                  )}>
                    <Icon className="h-4 w-4 md:h-5 md:w-5" aria-hidden />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={cn(
                        "line-clamp-2 text-sm leading-snug md:text-base",
                        isUnread
                          ? "font-bold text-zinc-900 dark:text-zinc-50"
                          : "font-semibold text-zinc-800 dark:text-zinc-200",
                      )}>
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
                        {EVENT_LABEL[n.eventType] ?? n.eventType}
                      </span>
                      <span>{relativeTime(n.createdAt)}</span>
                      {n.actorUsername && <span>· bởi {n.actorUsername}</span>}
                      {!n.isDirect && (
                        <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-600 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-800">
                          Cho bộ phận
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
              return n.link ? (
                <Link
                  key={n.id}
                  href={n.link}
                  onClick={() => { if (isUnread) markRead.mutate(n.id); }}
                  className="block"
                >
                  {card}
                </Link>
              ) : (
                <div key={n.id}>{card}</div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return iso;
  const now = Date.now();
  const diff = Math.floor((now - then) / 1000);
  if (diff < 60) return "Vừa xong";
  if (diff < 3600) return `${Math.floor(diff / 60)} phút trước`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} giờ trước`;
  if (diff < 604800) return `${Math.floor(diff / 86400)} ngày trước`;
  return new Date(iso).toLocaleDateString("vi-VN");
}
