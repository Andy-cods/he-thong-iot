"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, Pencil, Plus, Search, X } from "lucide-react";
import {
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  useQueryStates,
} from "nuqs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { CodeText, DataTable, RowActionsMenu, type DataTableColumn } from "@/components/ui/data-table";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import { useHotkey } from "@/lib/shortcuts";
import { activeStatusCode, getStatus, statusLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

type ActiveMode = "all" | "active" | "inactive";

// V4.1 UI-07/08: NCC "Đang dùng" / "Ngừng dùng" — cùng nguồn lib/status với badge.
const ACTIVE_MODES: { value: ActiveMode; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: statusLabel("supplier", "ACTIVE") },
  { value: "inactive", label: statusLabel("supplier", "INACTIVE") },
];

/**
 * V2 /suppliers — Linear-inspired compact (design-spec §2.7, kế thừa /items V2).
 *
 * - Header: H1 text-xl font-semibold "Nhà cung cấp" + subtitle count, action
 *   "Tạo mới" button size sm top-right.
 * - Filter bar h-11 compact: search h-8 w-[280px] + segmented h-8 (3 mode).
 * - Table row h-9 36px no zebra, columns Code (mono 12) · Name · Phone · Email
 *   · Active StatusBadge sm, actions Eye preview + Pencil edit.
 * - EmptyState preset no-data + no-filter-match.
 * - URL state nuqs giữ V1, hotkey / j k e Enter Esc giữ V1.
 */
export function SuppliersTab() {
  const router = useRouter();
  const searchRef = React.useRef<HTMLInputElement>(null);

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      active: parseAsBoolean,
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(20),
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

  const query = useSuppliersList({
    q: urlState.q || undefined,
    isActive: urlState.active ?? undefined,
    page: urlState.page,
    pageSize: urlState.pageSize,
  });

  const rows: SupplierRow[] = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  useHotkey("/", () => searchRef.current?.focus(), { preventDefault: true });
  useHotkey("j", () =>
    setFocusedIndex((i) => Math.min(rows.length - 1, Math.max(0, i) + 1)),
  );
  useHotkey("k", () =>
    setFocusedIndex((i) => Math.max(0, (i < 0 ? 0 : i) - 1)),
  );
  useHotkey("e", () => {
    const row = rows[focusedIndex];
    if (row) router.push(`/suppliers/${row.id}`);
  });
  useHotkey("Enter", () => {
    const row = rows[focusedIndex];
    if (row) router.push(`/suppliers/${row.id}`);
  });
  useHotkey("Escape", () => setFocusedIndex(-1));

  // V4.1 UI-05: tách lỗi khỏi rỗng — lỗi API không được hiện "Tạo NCC đầu tiên".
  const isListError = query.isError && rows.length === 0;
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;
  const hasFilter = urlState.q !== "" || urlState.active !== null;

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({ q: "", active: null, page: 1 });
  };

  const activeMode: ActiveMode =
    urlState.active === null ? "all" : urlState.active ? "active" : "inactive";

  const columns: DataTableColumn<SupplierRow>[] = [
    {
      id: "code",
      header: "Mã",
      kind: "code",
      mobile: "primary",
      width: 140,
      cell: (r) => <CodeText value={r.code} className="text-zinc-900 dark:text-zinc-50" maxWidth="9rem" />,
    },
    {
      id: "name",
      header: "Tên",
      mobileLabel: "Tên NCC",
      cell: (r) => (
        <span className="block max-w-[24rem] truncate text-zinc-900 dark:text-zinc-50" title={r.name}>
          {r.name}
        </span>
      ),
    },
    {
      id: "phone",
      header: "Điện thoại",
      width: 140,
      cell: (r) => <span className="tabular-nums text-zinc-600 dark:text-zinc-400">{r.phone ?? "—"}</span>,
    },
    {
      id: "email",
      header: "Email",
      width: 220,
      cell: (r) => (
        <span className="block max-w-[14rem] truncate text-zinc-600 dark:text-zinc-400" title={r.email ?? undefined}>
          {r.email ?? "—"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      kind: "status",
      width: 120,
      cell: (r) => {
        const st = getStatus("supplier", activeStatusCode(r.isActive));
        return <StatusBadge status={st.tone} label={st.label} size="sm" />;
      },
    },
    {
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      kind: "actions",
      width: 56,
      cell: (r) => (
        <RowActionsMenu
          label={`Thao tác NCC ${r.code}`}
          actions={[
            { label: "Xem chi tiết", icon: Eye, onSelect: () => router.push(`/suppliers/${r.id}`) },
            { label: "Sửa", icon: Pencil, onSelect: () => router.push(`/suppliers/${r.id}`) },
          ]}
        />
      ),
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/30 dark:bg-zinc-950/30">
      {/* V2 compact header: Breadcrumb + H1 xl + Tạo mới top-right */}
      <header className="border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        {/* V4.1 UI-09 (X6): bỏ breadcrumb thân trang — topbar đã hiện cùng đường dẫn (+ nhãn tab). */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl md:text-4xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Nhà cung cấp
            </h1>
            <p className="mt-0.5 text-base text-zinc-500 dark:text-zinc-400">
              {isListError ? "—" : total.toLocaleString("vi-VN")} NCC
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/suppliers/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo mới
            </Link>
          </Button>
        </div>
      </header>

      {/* Filter bar compact h-11 */}
      <div className="flex min-h-11 flex-wrap items-center gap-2 border-b border-zinc-200 bg-white px-4 py-1.5 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="relative w-full sm:w-[280px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
            aria-hidden="true"
          />
          <Input
            ref={searchRef}
            size="sm"
            placeholder="Tìm theo mã / tên NCC (phím /)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="pl-8"
            aria-label="Tìm nhà cung cấp"
          />
          {searchInput ? (
            <button
              type="button"
              onClick={() => setSearchInput("")}
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300"
              aria-label="Xoá tìm kiếm"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* Segmented 3-mode active (h-8) */}
        <div className="inline-flex h-8 overflow-hidden rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
          {ACTIVE_MODES.map((m, i) => (
            <button
              key={m.value}
              type="button"
              onClick={() =>
                void setUrlState({
                  active:
                    m.value === "all" ? null : m.value === "active" ? true : false,
                  page: 1,
                })
              }
              className={cn(
                "inline-flex h-full items-center px-3 text-base font-medium transition-colors",
                i > 0 && "border-l border-zinc-200 dark:border-zinc-700",
                activeMode === m.value
                  ? "bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900"
                  : "bg-white text-zinc-700 hover:bg-zinc-50 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800/60",
              )}
              aria-pressed={activeMode === m.value}
            >
              {m.label}
            </button>
          ))}
        </div>

        {hasFilter ? (
          <button
            type="button"
            onClick={handleReset}
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
          >
            Xoá bộ lọc
          </button>
        ) : null}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : isListError ? (
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh sách nhà cung cấp"
          />
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy NCC khớp bộ lọc"
              description="Thử xoá bộ lọc hoặc đổi từ khoá tìm kiếm."
              actions={
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Xoá tất cả bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-data"
              title="Chưa có nhà cung cấp"
              description="Thêm NCC đầu tiên để gắn vật tư với nguồn cung."
              actions={
                <Button asChild size="sm">
                  <Link href="/suppliers/new">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Tạo nhà cung cấp đầu tiên
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          // V4.1 UI-11 (Đợt 6C): ui/data-table — điện thoại dạng thẻ; nút Xem/Sửa
          // (trước chỉ hiện khi hover — không dùng được trên cảm ứng) vào menu ⋯.
          <DataTable
            columns={columns}
            rows={rows}
            getRowKey={(r) => r.id}
            ariaLabel="Danh sách nhà cung cấp"
            className="max-h-full"
            minWidth={760}
            onRowClick={(r) => router.push(`/suppliers/${r.id}`)}
            rowClassName={(_, i) =>
              focusedIndex === i
                ? "bg-indigo-50 outline outline-2 -outline-offset-2 outline-indigo-500 dark:bg-indigo-950/40"
                : undefined
            }
          />
        )}
      </div>

      {!isEmpty && !isListError ? (
        <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base dark:border-zinc-800 dark:bg-zinc-900">
          <div className="text-zinc-600 dark:text-zinc-400">
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
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: urlState.page - 1 })}
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
              onClick={() => void setUrlState({ page: urlState.page + 1 })}
              aria-label="Trang sau"
            >
              ›
            </Button>
          </div>
        </footer>
      ) : null}
    </div>
  );
}
