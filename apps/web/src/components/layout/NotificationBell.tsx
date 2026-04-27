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
  Package,
  ShoppingCart,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * V3.3 — NotificationBell với dropdown panel.
 *
 * Polling /api/notifications mỗi 30s.
 * Badge count = chỉ direct (recipient_user = me & unread).
 * Dropdown hiện 10 mới nhất + "Đánh dấu đã đọc tất cả" + link "Xem tất cả".
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

const SEVERITY_CLS: Record<string, string> = {
  info:    "bg-blue-50 text-blue-600",
  success: "bg-emerald-50 text-emerald-600",
  warning: "bg-amber-50 text-amber-600",
  error:   "bg-red-50 text-red-600",
};

export function NotificationBell() {
  const [open, setOpen] = React.useState(false);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const qc = useQueryClient();

  const query = useQuery<NotificationsResponse>({
    queryKey: ["notifications", "list"],
    queryFn: async () => {
      const res = await fetch("/api/notifications?limit=15", {
        credentials: "include",
      });
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
      if (!res.ok) throw new Error("mark read failed");
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
      if (!res.ok) throw new Error("mark all failed");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  // Click outside to close
  React.useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const unreadCount = query.data?.meta.unreadCount ?? 0;
  const items = query.data?.data ?? [];

  return (
    <div ref={wrapRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`Thông báo (${unreadCount} chưa đọc)`}
        aria-expanded={open}
        className="relative inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900"
      >
        <Bell className="h-4 w-4" aria-hidden />
        {unreadCount > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          className="absolute right-0 top-10 z-dropdown w-[400px] origin-top-right overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-2xl shadow-zinc-900/10 ring-1 ring-zinc-900/5"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-zinc-100 bg-zinc-50/60 px-4 py-3">
            <div>
              <p className="text-sm font-semibold text-zinc-900">Thông báo</p>
              {unreadCount > 0 && (
                <p className="text-xs text-zinc-500">
                  <span className="font-semibold text-indigo-600">
                    {unreadCount}
                  </span>{" "}
                  chưa đọc
                </p>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                disabled={markAllRead.isPending}
                className="inline-flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                <CheckCheck className="h-3 w-3" aria-hidden />
                Đánh dấu tất cả đã đọc
              </button>
            )}
          </div>

          {/* List */}
          <div className="max-h-[480px] overflow-y-auto">
            {query.isLoading ? (
              <div className="flex items-center justify-center py-10 text-sm text-zinc-500">
                Đang tải…
              </div>
            ) : items.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-12 text-center">
                <Bell className="h-8 w-8 text-zinc-300" aria-hidden />
                <p className="text-sm font-medium text-zinc-700">
                  Không có thông báo nào
                </p>
                <p className="text-xs text-zinc-500">
                  Bạn sẽ nhận thông báo khi có hoạt động mới.
                </p>
              </div>
            ) : (
              <ul className="divide-y divide-zinc-50">
                {items.map((n) => (
                  <NotificationItemRow
                    key={n.id}
                    item={n}
                    onRead={(id) => markRead.mutate(id)}
                    onClick={() => setOpen(false)}
                  />
                ))}
              </ul>
            )}
          </div>

          {/* Footer */}
          <div className="border-t border-zinc-100 bg-zinc-50/60 px-4 py-2.5 text-center">
            <Link
              href="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
            >
              Xem tất cả thông báo →
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function NotificationItemRow({
  item,
  onRead,
  onClick,
}: {
  item: NotificationItem;
  onRead: (id: string) => void;
  onClick: () => void;
}) {
  const Icon = EVENT_ICON[item.eventType] ?? Bell;
  const sevCls = SEVERITY_CLS[item.severity] ?? SEVERITY_CLS.info!;
  const isUnread = item.isDirect && !item.readAt;

  const content = (
    <div
      className={cn(
        "flex gap-3 px-4 py-3 transition-colors hover:bg-zinc-50",
        isUnread && "bg-indigo-50/40",
      )}
    >
      <div
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
          sevCls,
        )}
      >
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm leading-snug",
            isUnread ? "font-semibold text-zinc-900" : "font-medium text-zinc-800",
          )}
        >
          {item.title}
        </p>
        {item.message && (
          <p className="mt-0.5 line-clamp-2 text-xs text-zinc-500">
            {item.message}
          </p>
        )}
        <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-400">
          <span>{relativeTime(item.createdAt)}</span>
          {item.actorUsername && (
            <>
              <span>·</span>
              <span>bởi {item.actorUsername}</span>
            </>
          )}
          {!item.isDirect && (
            <>
              <span>·</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-500">
                Bộ phận
              </span>
            </>
          )}
        </div>
      </div>
      {isUnread && (
        <span
          className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-indigo-500"
          aria-hidden
        />
      )}
    </div>
  );

  if (item.link) {
    return (
      <li>
        <Link
          href={item.link}
          onClick={() => {
            if (isUnread) onRead(item.id);
            onClick();
          }}
          className="block"
        >
          {content}
        </Link>
      </li>
    );
  }
  return (
    <li
      onClick={() => {
        if (isUnread) onRead(item.id);
      }}
      className="cursor-pointer"
    >
      {content}
    </li>
  );
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */
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
