"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Search } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import { useHotkey } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

/**
 * /suppliers — list stub (T9a).
 *
 * Direction B design-spec §2.7 — bám pattern /items nhưng columns gọn:
 * Code · Name · Phone · Email · Status.
 * URL state: `q` + `active`. Phím `/` focus search, `e` edit selected.
 * EmptyState có-/ không filter tách riêng.
 */
export default function SuppliersListPage() {
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

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div>
          <Breadcrumb
            items={[
              { label: "Trang chủ", href: "/" },
              { label: "Nhà cung cấp" },
            ]}
            className="mb-0.5"
          />
          <h1 className="font-heading text-xl font-semibold text-slate-900">
            Nhà cung cấp
          </h1>
        </div>
        <Button asChild>
          <Link href="/suppliers/new">
            <Plus className="h-4 w-4" aria-hidden />
            Tạo mới
          </Link>
        </Button>
      </header>

      <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2">
        <div className="relative flex-1 max-w-md">
          <Search
            className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            aria-hidden
          />
          <Input
            ref={searchRef}
            placeholder="Tìm theo mã / tên NCC (phím /)"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-9 pl-8 sm:h-9"
          />
        </div>
        <Select
          value={
            urlState.active === null
              ? "all"
              : urlState.active
                ? "active"
                : "inactive"
          }
          onValueChange={(v) =>
            void setUrlState({
              active: v === "all" ? null : v === "active",
              page: 1,
            })
          }
        >
          <SelectTrigger className="h-9 w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tất cả trạng thái</SelectItem>
            <SelectItem value="active">Đang hoạt động</SelectItem>
            <SelectItem value="inactive">Ngưng hoạt động</SelectItem>
          </SelectContent>
        </Select>
        <div className="ml-auto text-xs text-slate-500 tabular-nums">
          {total.toLocaleString("vi-VN")} NCC
        </div>
      </div>

      <div className="flex-1 overflow-auto p-3">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy NCC khớp bộ lọc"
              description="Thử xoá bộ lọc hoặc đổi từ khoá tìm kiếm."
              actions={
                <Button variant="outline" onClick={handleReset}>
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-data"
              title="Chưa có nhà cung cấp"
              description="Thêm NCC đầu tiên để gắn vật tư với nguồn cung."
              actions={
                <Button asChild>
                  <Link href="/suppliers/new">
                    <Plus className="h-4 w-4" aria-hidden />
                    Tạo mới
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50 text-left text-xs font-medium uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2 w-32">Mã</th>
                  <th className="px-3 py-2">Tên</th>
                  <th className="px-3 py-2 w-40">Điện thoại</th>
                  <th className="px-3 py-2">Email</th>
                  <th className="px-3 py-2 w-36">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                      "cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-100 focus:outline-none",
                      focusedIndex === i && "bg-slate-100",
                    )}
                  >
                    <td className="px-3 py-2 font-mono font-medium text-slate-900">
                      {r.code}
                    </td>
                    <td className="px-3 py-2 text-slate-900">{r.name}</td>
                    <td className="px-3 py-2 text-slate-600 tabular-nums">
                      {r.phone ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-slate-600 truncate max-w-xs">
                      {r.email ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge
                        status={r.isActive ? "active" : "inactive"}
                        size="sm"
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!isEmpty ? (
        <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-sm">
          <div className="text-slate-600">
            Trang <span className="tabular-nums">{urlState.page}</span> /{" "}
            <span className="tabular-nums">{pageCount}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="outline"
              disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: urlState.page - 1 })}
              aria-label="Trang trước"
            >
              ‹
            </Button>
            <Button
              size="sm"
              variant="outline"
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
