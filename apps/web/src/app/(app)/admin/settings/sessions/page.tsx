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
  useAllSessions,
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
  // V4.1 AD-14 — admin xem + thu hồi phiên của người khác.
  const allQuery = useAllSessions();
  const [userFilter, setUserFilter] = React.useState("");
  const revokeOne = useRevokeSession();
  const revokeAll = useRevokeAllOtherSessions();
  const [confirmRevokeAllOpen, setConfirmRevokeAllOpen] = React.useState(false);

  const sessions = query.data?.data ?? [];
  const otherCount = sessions.filter((s) => !s.isCurrent).length;
  const allSessions = allQuery.data?.data ?? [];
  const needle = userFilter.trim().toLowerCase();
  const filteredAll = needle
    ? allSessions.filter(
        (s) =>
          s.username.toLowerCase().includes(needle) ||
          (s.fullName ?? "").toLowerCase().includes(needle),
      )
    : allSessions;

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
      description="Phiên có hiệu lực 4 giờ kể từ lúc đăng nhập (máy chiếu TV: 24 giờ). Thu hồi có hiệu lực trong vòng 30 giây: thiết bị đó phải đăng nhập lại."
      actions={
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              void query.refetch();
              void allQuery.refetch();
            }}
            disabled={query.isFetching || allQuery.isFetching}
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
      <h2 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        Thiết bị của bạn
      </h2>
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        {query.isLoading ? (
          <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
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
          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {sessions.map((s) => {
              const ua = parseUserAgent(s.userAgent);
              const Icon = ua.isMobile ? Smartphone : Laptop;
              return (
                <li
                  key={s.id}
                  className={cn(
                    "flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-zinc-50/70 dark:hover:bg-zinc-800/60",
                    s.isCurrent &&
                      "border-l-4 border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/50",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
                      s.isCurrent
                        ? "bg-indigo-50 text-indigo-600 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800"
                        : "bg-zinc-50 text-zinc-600 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
                    )}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium tracking-tight text-zinc-900 dark:text-zinc-50">
                        {ua.summary}
                      </span>
                      {s.isCurrent ? (
                        <span className="inline-flex h-5 items-center gap-1 rounded-full bg-emerald-50 px-1.5 text-[10px] font-semibold uppercase tracking-normal text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800">
                          <span
                            className="h-1.5 w-1.5 rounded-full bg-emerald-500"
                            aria-hidden="true"
                          />
                          Phiên hiện tại
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-zinc-500 dark:text-zinc-400">
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
                      <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                        (đang sử dụng)
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRevoke(s.id)}
                        disabled={revokeOne.isPending}
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
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

      {/* V4.1 AD-14 — phiên của mọi người dùng */}
      <section className="mt-6">
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Phiên của mọi người dùng
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {allSessions.length} phiên còn hiệu lực · sắp theo lần hoạt động gần nhất
              (cập nhật khoảng mỗi 30 giây khi người dùng thao tác).
            </p>
          </div>
          <input
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
            placeholder="Lọc theo tài khoản / họ tên"
            aria-label="Lọc phiên theo tài khoản"
            className="h-9 w-full max-w-[260px] rounded-md border border-zinc-200 bg-white px-3 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </div>
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          {allQuery.isLoading ? (
            <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Đang tải…
            </div>
          ) : allQuery.isError ? (
            <div className="p-6 text-center text-sm text-rose-600 dark:text-rose-400">
              Không tải được danh sách phiên.{" "}
              <button
                type="button"
                className="underline"
                onClick={() => void allQuery.refetch()}
              >
                Thử lại
              </button>
            </div>
          ) : filteredAll.length === 0 ? (
            <div className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Không có phiên nào khớp.
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filteredAll.map((s) => {
                const ua = parseUserAgent(s.userAgent);
                return (
                  <li
                    key={s.id}
                    className="flex flex-wrap items-center gap-x-4 gap-y-1 px-5 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-zinc-900 dark:text-zinc-50">
                        <span className="font-medium">{s.username}</span>
                        {s.fullName ? (
                          <span className="text-zinc-500 dark:text-zinc-400"> · {s.fullName}</span>
                        ) : null}
                        {s.isCurrent ? (
                          <span className="ml-2 text-xs text-emerald-700 dark:text-emerald-400">
                            (phiên của bạn)
                          </span>
                        ) : null}
                      </p>
                      <p className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-zinc-500 dark:text-zinc-400">
                        <span>{ua.summary}</span>
                        <span className="font-mono">IP: {s.ipAddress ?? "—"}</span>
                        <span>Đăng nhập: {fmtAbs(s.issuedAt)}</span>
                        <span>Hoạt động: {fmtRelative(s.lastSeenAt ?? s.issuedAt)}</span>
                        <span>Hết hạn: {fmtAbs(s.expiresAt)}</span>
                      </p>
                    </div>
                    {s.isCurrent ? null : (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => void handleRevoke(s.id)}
                        disabled={revokeOne.isPending}
                        className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 dark:text-rose-400 dark:hover:bg-rose-950/40 dark:hover:text-rose-300"
                      >
                        Thu hồi
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>

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
