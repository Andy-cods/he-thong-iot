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
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import { useHotkey } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

type ActiveMode = "all" | "active" | "inactive";

const ACTIVE_MODES: { value: ActiveMode; label: string }[] = [
  { value: "all", label: "Tất cả" },
  { value: "active", label: "Đang dùng" },
  { value: "inactive", label: "Ngưng" },
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

  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter = urlState.q !== "" || urlState.active !== null;

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({ q: "", active: null, page: 1 });
  };

  const activeMode: ActiveMode =
    urlState.active === null ? "all" : urlState.active ? "active" : "inactive";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* V2 compact header: Breadcrumb + H1 xl + Tạo mới top-right */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[{ label: "Trang chủ", href: "/" }, { label: "Nhà cung cấp" }]}
          className="mb-0.5"
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              Nhà cung cấp
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              {total.toLocaleString("vi-VN")} NCC
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
      <div className="flex h-11 items-center gap-2 border-b border-zinc-200 bg-white px-4">
        <div className="relative w-[280px]">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
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
              className="absolute right-1.5 top-1/2 inline-flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Xoá tìm kiếm"
            >
              <X className="h-3 w-3" aria-hidden="true" />
            </button>
          ) : null}
        </div>

        {/* Segmented 3-mode active (h-8) */}
        <div className="inline-flex h-8 overflow-hidden rounded-md border border-zinc-200 bg-white">
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
                i > 0 && "border-l border-zinc-200",
                activeMode === m.value
                  ? "bg-zinc-900 text-white"
                  : "bg-white text-zinc-700 hover:bg-zinc-50",
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
            className="ml-auto text-xs font-medium text-blue-600 hover:text-blue-700"
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
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="min-w-full border-collapse text-base">
              <thead className="bg-zinc-50">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-zinc-500">
                  <th className="h-8 px-3 w-[128px]">Mã</th>
                  <th className="h-8 px-3">Tên</th>
                  <th className="h-8 px-3 w-[140px]">Điện thoại</th>
                  <th className="h-8 px-3 w-[220px]">Email</th>
                  <th className="h-8 px-3 w-[100px]">Trạng thái</th>
                  <th className="h-8 px-3 w-[80px] text-right">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr
                    key={r.id}
                    tabIndex={0}
                    role="link"
                    aria-label={`Mở NCC ${r.code}`}
                    onClick={() => router.push(`/suppliers/${r.id}`)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(`/suppliers/${r.id}`);
                      }
                    }}
                    className={cn(
                      "group h-9 cursor-pointer border-t border-zinc-100 transition-colors hover:bg-zinc-50 focus:outline-none",
                      focusedIndex === i &&
                        "bg-blue-50 outline outline-2 -outline-offset-2 outline-blue-500",
                    )}
                  >
                    <td className="px-3 font-mono text-sm text-zinc-900">
                      {r.code}
                    </td>
                    <td className="px-3 text-zinc-900">{r.name}</td>
                    <td className="px-3 text-zinc-600 tabular-nums">
                      {r.phone ?? "—"}
                    </td>
                    <td className="max-w-xs truncate px-3 text-zinc-600">
                      {r.email ?? "—"}
                    </td>
                    <td className="px-3">
                      <StatusBadge
                        status={r.isActive ? "active" : "inactive"}
                        size="sm"
                      />
                    </td>
                    <td className="px-3 text-right">
                      <div className="inline-flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Xem NCC ${r.code}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/suppliers/${r.id}`}>
                            <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                        <Button
                          asChild
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Sửa NCC ${r.code}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <Link href={`/suppliers/${r.id}`}>
                            <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          </Link>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isEmpty ? (
        <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base">
          <div className="text-zinc-600">
            Hiển thị{" "}
            <span className="tabular-nums text-zinc-900">
              {rows.length === 0
                ? 0
                : (urlState.page - 1) * urlState.pageSize + 1}
              –{(urlState.page - 1) * urlState.pageSize + rows.length}
            </span>{" "}
            /{" "}
            <span className="tabular-nums text-zinc-900">
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
            <span className="px-2 text-zinc-600 tabular-nums">
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
