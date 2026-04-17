"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Eye, Pencil, Plus, Search, X } from "lucide-react";
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
import { cn } from "@/lib/utils";

const ACTIVE_MODES = ["all", "active", "inactive"] as const;
type ActiveMode = (typeof ACTIVE_MODES)[number];

const ROLE_OPTIONS: { code: Role | "all"; label: string }[] = [
  { code: "all", label: "Tất cả vai trò" },
  { code: "admin", label: "Admin" },
  { code: "planner", label: "Planner" },
  { code: "warehouse", label: "Warehouse" },
  { code: "operator", label: "Operator" },
];

const ROLE_COLORS: Record<Role, string> = {
  admin: "bg-purple-50 text-purple-700 border-purple-200",
  planner: "bg-blue-50 text-blue-700 border-blue-200",
  warehouse: "bg-amber-50 text-amber-700 border-amber-200",
  operator: "bg-zinc-100 text-zinc-700 border-zinc-200",
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
    <div className="flex flex-col gap-4">
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
        <span className="text-zinc-900">Người dùng</span>
      </nav>

      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Danh sách người dùng
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            {total.toLocaleString("vi-VN")} tài khoản
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/admin/users/new">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" />
            Tạo mới
          </Link>
        </Button>
      </header>

      {/* Filter bar */}
      <section className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-3 py-2">
        <div className="relative min-w-[240px] flex-1">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Tìm theo username / họ tên / email…"
            className="h-8 pl-7"
          />
        </div>

        <select
          value={urlState.role}
          onChange={(e) =>
            void setUrlState({ role: e.target.value, page: 1 })
          }
          className="h-8 rounded-md border border-zinc-300 bg-white px-2 text-sm text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          aria-label="Lọc vai trò"
        >
          {ROLE_OPTIONS.map((o) => (
            <option key={o.code} value={o.code}>
              {o.label}
            </option>
          ))}
        </select>

        <div
          role="tablist"
          aria-label="Lọc trạng thái"
          className="inline-flex items-center rounded-md border border-zinc-300 bg-white p-0.5"
        >
          {(
            [
              { m: "all", label: "Tất cả" },
              { m: "active", label: "Đang hoạt động" },
              { m: "inactive", label: "Vô hiệu hoá" },
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
                  ? "bg-blue-500 text-white"
                  : "text-zinc-600 hover:bg-zinc-100",
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
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <div className="grid h-8 grid-cols-[1fr,1.2fr,1.3fr,1.4fr,100px,120px,90px] items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <span>Username</span>
          <span>Họ tên</span>
          <span>Email</span>
          <span>Vai trò</span>
          <span className="text-center">Trạng thái</span>
          <span>Đăng nhập cuối</span>
          <span className="text-right">Hành động</span>
        </div>

        {query.isLoading ? (
          <div className="p-6 text-center text-sm text-zinc-500">
            Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <div className="p-4">
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
                description="Tạo tài khoản đầu tiên để bắt đầu."
                actions={
                  <Button asChild size="sm">
                    <Link href="/admin/users/new">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Tạo mới
                    </Link>
                  </Button>
                }
              />
            )}
          </div>
        ) : (
          <ul>
            {rows.map((u) => (
              <li
                key={u.id}
                className="grid min-h-[36px] grid-cols-[1fr,1.2fr,1.3fr,1.4fr,100px,120px,90px] items-center gap-3 border-t border-zinc-100 px-4 py-1.5 transition-colors hover:bg-zinc-50"
              >
                <Link
                  href={`/admin/users/${u.id}`}
                  className="truncate font-mono text-xs font-semibold text-blue-600 hover:underline"
                >
                  {u.username}
                </Link>
                <span className="truncate text-sm text-zinc-900">
                  {u.fullName}
                </span>
                <span className="truncate text-sm text-zinc-600">
                  {u.email ?? "—"}
                </span>
                <div className="flex flex-wrap gap-1">
                  {u.roles.length === 0 ? (
                    <span className="text-xs text-zinc-400">—</span>
                  ) : (
                    u.roles.map((r) => (
                      <span
                        key={r}
                        className={cn(
                          "inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase",
                          ROLE_COLORS[r],
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
                      "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-semibold uppercase",
                      u.isActive
                        ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                        : "border-zinc-200 bg-zinc-100 text-zinc-500",
                    )}
                  >
                    {u.isActive ? "Active" : "Disabled"}
                  </span>
                </span>
                <span className="truncate text-xs text-zinc-500 tabular-nums">
                  {formatDate(u.lastLoginAt)}
                </span>
                <div className="flex justify-end gap-1">
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
        <span className="text-zinc-600">
          Hiển thị{" "}
          <span className="tabular-nums text-zinc-900">
            {rows.length === 0 ? 0 : (urlState.page - 1) * urlState.pageSize + 1}
            –{(urlState.page - 1) * urlState.pageSize + rows.length}
          </span>{" "}
          /{" "}
          <span className="tabular-nums text-zinc-900">
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
          <span className="px-2 text-zinc-600 tabular-nums">
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
  );
}
