"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, Search, X } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import type { Role } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { useUsersList } from "@/hooks/useAdmin";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { cn } from "@/lib/utils";

const ACTIVE_MODES = ["all", "active", "inactive"] as const;
type ActiveMode = (typeof ACTIVE_MODES)[number];

const ROLE_OPTIONS: { code: Role | "all"; label: string }[] = [
  { code: "all", label: "Tất cả vai trò" },
  { code: "admin", label: "Admin" },
  { code: "planner", label: "Bộ phận Thiết kế" },
  { code: "purchaser", label: "Bộ phận Thu mua" },
  { code: "warehouse", label: "Bộ phận Kho" },
  { code: "operator", label: "Bộ phận Gia công" },
  { code: "qc", label: "Tổ QC / KCS" },
  { code: "display", label: "Màn hình TV" },
  { code: "accountant", label: "Bộ phận Kế toán" },
];

const ROLE_BADGE: Record<Role, string> = {
  admin: "bg-violet-50 text-violet-700 ring-violet-200 dark:bg-violet-950/40 dark:text-violet-400 dark:ring-violet-800",
  planner: "bg-indigo-50 text-indigo-700 ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800",
  purchaser: "bg-rose-50 text-rose-700 ring-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:ring-rose-800",
  warehouse: "bg-amber-50 text-amber-700 ring-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:ring-amber-800",
  operator: "bg-zinc-100 text-zinc-700 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-300 dark:ring-zinc-700",
  qc: "bg-teal-50 text-teal-700 ring-teal-200 dark:bg-teal-950/40 dark:text-teal-400 dark:ring-teal-800",
  display: "bg-sky-50 text-sky-700 ring-sky-200 dark:bg-sky-950/40 dark:text-sky-400 dark:ring-sky-800",
  accountant: "bg-lime-50 text-lime-700 ring-lime-200 dark:bg-lime-950/40 dark:text-lime-400 dark:ring-lime-800",
};

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function AdminUsersPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      role: parseAsString.withDefault("all"),
      active: parseAsStringEnum([...ACTIVE_MODES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q) {
        void setUrlState({ q: searchInput, page: 1 });
      }
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const activeMode = urlState.active as ActiveMode;
  const query = useUsersList({
    q: urlState.q || undefined,
    role: urlState.role !== "all" ? (urlState.role as Role) : undefined,
    isActive:
      activeMode === "active"
        ? true
        : activeMode === "inactive"
          ? false
          : undefined,
    page: urlState.page,
    pageSize: urlState.pageSize,
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const hasFilter =
    urlState.q !== "" || urlState.role !== "all" || activeMode !== "all";

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({ q: "", role: "all", active: "all", page: 1 });
  };

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Người dùng" },
      ]}
      title="Danh sách người dùng"
      description={
        <>
          Quản lý tài khoản, phân vai trò và theo dõi trạng thái hoạt động.{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {total.toLocaleString("vi-VN")} tài khoản
          </span>
          .
        </>
      }
      actions={
        <Button asChild size="sm">
          <Link href="/admin/users/new">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tạo người dùng
          </Link>
        </Button>
      }
    >
      <div className="flex flex-col gap-4">
        {/* Filter bar */}
        <section className="flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-white p-3 shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="relative min-w-[240px] flex-1">
            <Search
              className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm theo username / họ tên / email…"
              className="h-9 pl-8"
            />
          </div>

          <div
            role="tablist"
            aria-label="Lọc vai trò"
            className="flex flex-wrap items-center gap-1"
          >
            {ROLE_OPTIONS.map((o) => {
              const active = urlState.role === o.code;
              return (
                <button
                  key={o.code}
                  role="tab"
                  aria-selected={active}
                  onClick={() =>
                    void setUrlState({ role: o.code, page: 1 })
                  }
                  className={cn(
                    "inline-flex h-8 items-center rounded-full border px-3 text-xs font-medium tracking-normal transition-colors",
                    active
                      ? "border-indigo-200 bg-indigo-50 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400"
                      : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800/60",
                  )}
                >
                  {o.label}
                </button>
              );
            })}
          </div>

          <div
            role="tablist"
            aria-label="Lọc trạng thái"
            className="inline-flex items-center rounded-md border border-zinc-200 bg-white p-0.5 dark:border-zinc-700 dark:bg-zinc-900"
          >
            {(
              [
                { m: "all", label: "Tất cả" },
                { m: "active", label: "Hoạt động" },
                { m: "inactive", label: "Vô hiệu" },
              ] as const
            ).map((t) => (
              <button
                key={t.m}
                role="tab"
                aria-selected={activeMode === t.m}
                onClick={() => void setUrlState({ active: t.m, page: 1 })}
                className={cn(
                  "h-7 rounded-sm px-2.5 text-xs font-medium transition-colors",
                  activeMode === t.m
                    ? "bg-indigo-600 text-white"
                    : "text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>

          {hasFilter ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleReset}
              aria-label="Xoá bộ lọc"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Xoá lọc
            </Button>
          ) : null}
        </section>

        {/* Table */}
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
          <div className="grid h-9 grid-cols-[1fr,1.2fr,100px] items-center gap-3 border-b border-zinc-200 bg-zinc-50/70 px-4 text-[11px] font-semibold uppercase tracking-normal text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-400 md:grid-cols-[1fr,1.2fr,1.3fr,1.4fr,100px,120px,90px]">
            <span>Username</span>
            <span>Họ tên</span>
            <span className="hidden md:block">Email</span>
            <span className="hidden md:block">Vai trò</span>
            <span className="text-center">Trạng thái</span>
            <span className="hidden md:block">Đăng nhập cuối</span>
            <span className="hidden text-right md:block">Hành động</span>
          </div>

          {query.isLoading ? (
            <div className="p-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Đang tải…
            </div>
          ) : rows.length === 0 ? (
            <div className="p-6">
              {hasFilter ? (
                <EmptyState
                  preset="no-filter-match"
                  title="Không tìm thấy user khớp bộ lọc"
                  description="Thử thay đổi từ khoá hoặc xoá bộ lọc."
                  actions={
                    <Button variant="ghost" size="sm" onClick={handleReset}>
                      Xoá bộ lọc
                    </Button>
                  }
                />
              ) : (
                <EmptyState
                  preset="no-data"
                  title="Chưa có người dùng nào"
                  description="Tạo tài khoản đầu tiên để bắt đầu sử dụng hệ thống."
                  actions={
                    <Button asChild size="sm">
                      <Link href="/admin/users/new">
                        <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                        Tạo user đầu tiên
                      </Link>
                    </Button>
                  }
                />
              )}
            </div>
          ) : (
            <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {rows.map((u) => (
                <li
                  key={u.id}
                  className="group grid min-h-[40px] grid-cols-[1fr,1.2fr,100px] items-center gap-3 px-4 py-2 transition-colors hover:bg-indigo-50/40 dark:hover:bg-indigo-950/30 md:grid-cols-[1fr,1.2fr,1.3fr,1.4fr,100px,120px,90px]"
                >
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="truncate font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
                  >
                    {u.username}
                  </Link>
                  <span className="truncate text-sm text-zinc-900 dark:text-zinc-50">
                    {u.fullName}
                  </span>
                  <span className="hidden truncate text-sm text-zinc-600 dark:text-zinc-400 md:block">
                    {u.email ?? "—"}
                  </span>
                  <div className="hidden flex-wrap gap-1 md:flex">
                    {u.roles.length === 0 ? (
                      <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
                    ) : (
                      u.roles.map((r) => (
                        <span
                          key={r}
                          className={cn(
                            "inline-flex h-5 items-center rounded-full px-1.5 font-mono text-[10px] font-semibold uppercase ring-1 ring-inset",
                            ROLE_BADGE[r],
                          )}
                        >
                          {r}
                        </span>
                      ))
                    )}
                  </div>
                  <span className="text-center">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center gap-1 rounded-full px-1.5 text-[10px] font-semibold uppercase ring-1 ring-inset",
                        u.isActive
                          ? "bg-emerald-50 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800"
                          : "bg-zinc-100 text-zinc-500 ring-zinc-200 dark:bg-zinc-800 dark:text-zinc-400 dark:ring-zinc-700",
                      )}
                    >
                      <span
                        className={cn(
                          "h-1.5 w-1.5 rounded-full",
                          u.isActive ? "bg-emerald-500" : "bg-zinc-400",
                        )}
                        aria-hidden="true"
                      />
                      {u.isActive ? "Active" : "Disabled"}
                    </span>
                  </span>
                  <span className="hidden truncate text-xs text-zinc-500 tabular-nums dark:text-zinc-400 md:block">
                    {formatDate(u.lastLoginAt)}
                  </span>
                  <div className="hidden justify-end gap-1 md:flex">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => router.push(`/admin/users/${u.id}`)}
                      aria-label={`Xem ${u.username}`}
                    >
                      <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => router.push(`/admin/users/${u.id}`)}
                      aria-label={`Sửa ${u.username}`}
                    >
                      <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Pagination */}
        <footer className="flex items-center justify-between text-xs">
          <span className="text-zinc-600 dark:text-zinc-400">
            Hiển thị{" "}
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
              {rows.length === 0
                ? 0
                : (urlState.page - 1) * urlState.pageSize + 1}
              –{(urlState.page - 1) * urlState.pageSize + rows.length}
            </span>{" "}
            /{" "}
            <span className="tabular-nums text-zinc-900 dark:text-zinc-50">
              {total.toLocaleString("vi-VN")}
            </span>
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page <= 1}
              onClick={() =>
                void setUrlState({ page: Math.max(1, urlState.page - 1) })
              }
              aria-label="Trang trước"
            >
              ‹
            </Button>
            <span className="px-2 text-zinc-600 tabular-nums dark:text-zinc-400">
              {urlState.page} / {pageCount}
            </span>
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page >= pageCount}
              onClick={() =>
                void setUrlState({
                  page: Math.min(pageCount, urlState.page + 1),
                })
              }
              aria-label="Trang sau"
            >
              ›
            </Button>
          </div>
        </footer>
      </div>
    </AdminPageShell>
  );
}
