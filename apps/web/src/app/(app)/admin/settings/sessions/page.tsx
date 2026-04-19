"use client";

import * as React from "react";
import Link from "next/link";
import {
  ChevronRight,
  Laptop,
  LogOut,
  RefreshCw,
  Smartphone,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  useMySessions,
  useRevokeAllOtherSessions,
  useRevokeSession,
} from "@/hooks/useSessions";
import { parseUserAgent } from "@/lib/user-agent";
import { cn } from "@/lib/utils";

function fmtRelative(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const diff = Date.now() - d.getTime();
  if (Number.isNaN(diff)) return iso;
  const min = Math.floor(diff / 60_000);
  if (min < 1) return "vài giây trước";
  if (min < 60) return `${min} phút trước`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} giờ trước`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} ngày trước`;
  return d.toLocaleDateString("vi-VN");
}

function fmtAbs(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function SessionsPage() {
  const query = useMySessions();
  const revokeOne = useRevokeSession();
  const revokeAll = useRevokeAllOtherSessions();
  const [confirmRevokeAllOpen, setConfirmRevokeAllOpen] = React.useState(false);

  const sessions = query.data?.data ?? [];
  const otherCount = sessions.filter((s) => !s.isCurrent).length;

  const handleRevoke = async (id: string) => {
    try {
      await revokeOne.mutateAsync(id);
      toast.success("Đã thu hồi phiên đăng nhập.");
    } catch (err) {
      toast.error(
        `Thu hồi thất bại: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  };

  const handleRevokeAll = async () => {
    try {
      const r = await revokeAll.mutateAsync();
      toast.success(`Đã đăng xuất ${r.revoked} thiết bị khác.`);
      setConfirmRevokeAllOpen(false);
    } catch (err) {
      toast.error(
        `Thu hồi thất bại: ${err instanceof Error ? err.message : "unknown"}`,
      );
    }
  };

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin" className="hover:text-zinc-900">
          Quản trị
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <Link href="/admin/settings" className="hover:text-zinc-900">
          Cài đặt cá nhân
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-zinc-900">Phiên đăng nhập</span>
      </nav>

      <header className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Phiên đăng nhập
          </h1>
          <p className="mt-0.5 max-w-2xl text-xs text-zinc-500">
            Danh sách thiết bị đang đăng nhập với tài khoản của bạn. Thu hồi sẽ
            chặn refresh token; access token hiện tại có thể còn hiệu lực tối
            đa 15 phút.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={cn("h-3.5 w-3.5", query.isFetching && "animate-spin")}
              aria-hidden="true"
            />
            Làm mới
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setConfirmRevokeAllOpen(true)}
            disabled={otherCount === 0}
          >
            <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
            Đăng xuất thiết bị khác ({otherCount})
          </Button>
        </div>
      </header>

      <div className="rounded-md border border-zinc-200 bg-white">
        {query.isLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Đang tải…
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-4">
            <EmptyState
              preset="no-data"
              title="Không có phiên nào đang hoạt động"
              description="Khi bạn đăng nhập ở thiết bị khác, phiên sẽ hiện tại đây."
            />
          </div>
        ) : (
          <ul className="divide-y divide-zinc-100">
            {sessions.map((s) => {
              const ua = parseUserAgent(s.userAgent);
              const Icon = ua.isMobile ? Smartphone : Laptop;
              return (
                <li
                  key={s.id}
                  className="flex items-center gap-4 px-4 py-3 hover:bg-zinc-50"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-zinc-600">
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-zinc-900">
                        {ua.summary}
                      </span>
                      {s.isCurrent ? (
                        <span className="inline-flex h-5 items-center rounded-sm border border-emerald-200 bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">
                          Phiên hiện tại
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                      <span className="font-mono">
                        IP: {s.ipAddress ?? "—"}
                      </span>
                      <span>Đăng nhập: {fmtAbs(s.issuedAt)}</span>
                      <span>
                        Hoạt động: {fmtRelative(s.lastSeenAt ?? s.issuedAt)}
                      </span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    {s.isCurrent ? (
                      <span className="text-[11px] text-zinc-400">
                        (đang sử dụng)
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRevoke(s.id)}
                        disabled={revokeOne.isPending}
                        className="text-red-600 hover:bg-red-50 hover:text-red-700"
                      >
                        Thu hồi
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Confirm dialog cho revoke-all-others */}
      <Dialog
        open={confirmRevokeAllOpen}
        onOpenChange={setConfirmRevokeAllOpen}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Đăng xuất mọi thiết bị khác?</DialogTitle>
            <DialogDescription>
              Tất cả {otherCount} thiết bị khác sẽ bị thu hồi phiên. Phiên hiện
              tại của bạn vẫn giữ nguyên.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmRevokeAllOpen(false)}
            >
              Huỷ
            </Button>
            <Button
              onClick={() => void handleRevokeAll()}
              disabled={revokeAll.isPending}
            >
              {revokeAll.isPending ? "Đang thu hồi…" : "Xác nhận"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
