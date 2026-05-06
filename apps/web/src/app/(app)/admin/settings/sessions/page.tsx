"use client";

import * as React from "react";
import { Laptop, LogOut, RefreshCw, Smartphone } from "lucide-react";
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
import { AdminPageShell } from "@/components/admin/AdminPageShell";
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
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Cài đặt", href: "/admin/settings" },
        { label: "Phiên đăng nhập" },
      ]}
      title="Phiên đăng nhập"
      description="Danh sách thiết bị đang đăng nhập với tài khoản của bạn. Thu hồi sẽ chặn refresh token; access token hiện tại có thể còn hiệu lực tối đa 15 phút."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => query.refetch()}
            disabled={query.isFetching}
          >
            <RefreshCw
              className={cn(
                "h-3.5 w-3.5",
                query.isFetching && "animate-spin",
              )}
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
            Đăng xuất {otherCount} thiết bị khác
          </Button>
        </div>
      }
    >
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-zinc-500">
            Đang tải…
          </div>
        ) : sessions.length === 0 ? (
          <div className="p-6">
            <EmptyState
              preset="no-data"
              title="Không có phiên nào đang hoạt động"
              description="Khi bạn đăng nhập ở thiết bị khác, phiên sẽ hiển thị tại đây."
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
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50/70",
                    s.isCurrent &&
                      "border-l-4 border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      s.isCurrent
                        ? "bg-indigo-50 text-indigo-600 ring-indigo-200"
                        : "bg-zinc-50 text-zinc-600 ring-zinc-200",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium tracking-tight text-zinc-900">
                        {ua.summary}
                      </span>
                      {s.isCurrent ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase tracking-normal text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          Phiên hiện tại
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500">
                      <span className="font-mono tracking-normal">
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
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
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
    </AdminPageShell>
  );
}
