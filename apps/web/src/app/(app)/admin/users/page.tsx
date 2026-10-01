"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Plus, Search, X } from "lucide-react";
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
import { QueryError } from "@/components/ui/query-error";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { useUsersList, type AdminUserListRow } from "@/hooks/useAdmin";
import { AdminPageShell } from "@/components/admin/AdminPageShell";
import { ALL_ROLES, ROLE_BADGE_CLASSES, ROLE_LABELS } from "@/components/admin/UserForm";
import { cn } from "@/lib/utils";
import { StatusPill } from "@/components/ui/status-badge";
import { formatDate as formatDateVN, formatNumber } from "@/lib/format";
import { activeStatusCode, statusLabel } from "@/lib/status";

const ACTIVE_MODES = ["all", "active", "inactive"] as const;
type ActiveMode = (typeof ACTIVE_MODES)[number];

// V4.4 (NHÓM G, DRY) — lấy từ `UserForm.ALL_ROLES` (nguồn DUY NHẤT nhãn vai
// trò), chỉ thêm option "Tất cả vai trò" riêng cho bộ lọc trang này.
const ROLE_OPTIONS: { code: Role | "all"; label: string }[] = [
  { code: "all", label: "Tất cả vai trò" },
  ...ALL_ROLES.map((r) => ({ code: r.code, label: r.label })),
];

type UserRow = AdminUserListRow;

// V4.1 UI-15: ngày theo giờ VN qua lib/format.
function formatDate(iso: string | null): string {
  return formatDateVN(iso, "dd/MM/yyyy");
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

  // V4.4 (NHÓM G, A16) — chuyển sang `DataTable` dùng chung: trước đây tự vẽ
  // `<div role="grid">` + ẩn Vai trò/Đăng nhập cuối/Hành động trên mobile bằng
  // `hidden md:block` → MẤT HẲN thông tin trên điện thoại. `DataTable` tự
  // chuyển card-list đầy đủ trường dưới `md`, không cần tự tay ẩn cột nào.
  const columns = React.useMemo<DataTableColumn<UserRow>[]>(
    () => [
      {
        id: "username",
        header: "Tên đăng nhập",
        kind: "code",
        mobile: "primary",
        cell: (u) => (
          <Link
            href={`/admin/users/${u.id}`}
            className="truncate font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-700 hover:underline dark:text-indigo-400 dark:hover:text-indigo-300"
          >
            {u.username}
          </Link>
        ),
      },
      {
        id: "fullName",
        header: "Họ tên",
        mobile: "primary",
        cell: (u) => (
          <span className="truncate text-sm text-zinc-900 dark:text-zinc-50">{u.fullName}</span>
        ),
      },
      {
        id: "email",
        header: "Email",
        cell: (u) => (
          <span className="truncate text-sm text-zinc-600 dark:text-zinc-400">{u.email ?? "—"}</span>
        ),
      },
      {
        id: "roles",
        header: "Vai trò",
        cell: (u) =>
          u.roles.length === 0 ? (
            <span className="text-xs text-zinc-400 dark:text-zinc-500">—</span>
          ) : (
            <div className="flex flex-wrap gap-1">
              {u.roles.map((r) => (
                <span
                  key={r}
                  className={cn(
                    "inline-flex h-5 items-center whitespace-nowrap rounded-full px-2 text-xs font-medium ring-1 ring-inset",
                    ROLE_BADGE_CLASSES[r],
                  )}
                >
                  {ROLE_LABELS[r] ?? r}
                </span>
              ))}
            </div>
          ),
      },
      {
        id: "status",
        header: "Trạng thái",
        kind: "status",
        cell: (u) => (
          // V4.1 UI-07/08: "Hoạt động" / "Vô hiệu hoá" (bỏ "Active/Disabled").
          <StatusPill domain="user" code={activeStatusCode(u.isActive)} dot />
        ),
      },
      {
        id: "lastLogin",
        header: "Đăng nhập cuối",
        kind: "date",
        cell: (u) => formatDate(u.lastLoginAt),
      },
      {
        id: "actions",
        header: "Hành động",
        kind: "actions",
        cell: (u) => (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => router.push(`/admin/users/${u.id}`)}
            aria-label={`Xem chi tiết ${u.username}`}
          >
            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ),
      },
    ],
    [router],
  );

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Tổng quan", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Người dùng" },
      ]}
      title="Danh sách người dùng"
      description={
        <>
          Quản lý tài khoản, phân vai trò và theo dõi trạng thái hoạt động.{" "}
          <span className="font-medium text-zinc-700 dark:text-zinc-300">
            {/* V4.1 UI-05: lỗi tải → "—" thay vì "0 tài khoản" */}
            {query.isError && !query.data ? "—" : formatNumber(total)} tài khoản
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
        <section className="flex flex-wrap items-center gap-2 rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900">
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
                // V4.1 UI-07: nhãn chip = nhãn badge (lib/status.ts domain user).
                { m: "active", label: statusLabel("user", "ACTIVE") },
                { m: "inactive", label: statusLabel("user", "INACTIVE") },
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
        {query.isError && rows.length === 0 ? (
          // V4.1 UI-05: API lỗi (429/500/403) → KHÔNG hiện "Tạo user đầu tiên".
          <div className="overflow-hidden rounded-xl bg-white shadow-xs dark:bg-zinc-900">
            <QueryError
              error={query.error}
              onRetry={() => void query.refetch()}
              retrying={query.isFetching}
              title="Không tải được danh sách người dùng"
            />
          </div>
        ) : !query.isLoading && rows.length === 0 ? (
          <div className="overflow-hidden rounded-xl bg-white p-6 shadow-xs dark:bg-zinc-900">
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
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(u) => u.id}
            loading={query.isLoading}
            ariaLabel="Danh sách người dùng"
            minWidth={760}
            onRowClick={(u) => router.push(`/admin/users/${u.id}`)}
          />
        )}

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
              {query.isError && !query.data ? "—" : formatNumber(total)}
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
