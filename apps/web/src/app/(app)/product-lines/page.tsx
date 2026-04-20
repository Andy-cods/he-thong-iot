"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FolderKanban, LayoutGrid, Plus } from "lucide-react";
import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { formatDate } from "@/lib/format";
import { useProductLineList } from "@/hooks/useProductLines";

/**
 * V1.5 Trụ cột 3 — /product-lines
 *
 * Danh sách dòng sản phẩm. Mỗi dòng là 1 nhóm mã Z + hub kết nối
 * đơn hàng / mua sắm / sản xuất.
 */
export default function ProductLinesPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(20),
    },
    { history: "replace", shallow: true },
  );

  const [searchInput, setSearchInput] = React.useState(urlState.q);
  React.useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== urlState.q) void setUrlState({ q: searchInput, page: 1 });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const query = useProductLineList({
    q: urlState.q || undefined,
    page: urlState.page,
    pageSize: urlState.pageSize,
  });

  const rows = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));
  const isEmpty = !query.isLoading && rows.length === 0;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Dòng sản phẩm
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Nhóm mã Z · Hub đơn hàng · Mua sắm · Sản xuất ·{" "}
            <span className="tabular-nums">{total.toLocaleString("vi-VN")}</span>{" "}
            dòng
          </p>
        </div>
        <Button asChild size="sm">
          <Link href="/product-lines/new">
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Tạo dòng sản phẩm
          </Link>
        </Button>
      </header>

      {/* Search bar */}
      <div className="flex items-center gap-2 border-b border-zinc-100 bg-white px-6 py-2">
        <input
          type="search"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          placeholder="Tìm theo mã hoặc tên dòng sản phẩm…"
          className="h-8 w-72 rounded-md border border-zinc-200 bg-white px-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        ) : isEmpty ? (
          urlState.q ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy dòng sản phẩm khớp"
              description="Thử thay đổi từ khoá tìm kiếm."
              actions={
                <Button variant="ghost" size="sm" onClick={() => setSearchInput("")}>
                  Xoá tìm kiếm
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có dòng sản phẩm nào"
              description="Tạo dòng sản phẩm đầu tiên để nhóm các mã Z lại."
              actions={
                <Button asChild size="sm">
                  <Link href="/product-lines/new">
                    <Plus className="h-3.5 w-3.5" />
                    Tạo dòng sản phẩm
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {rows.map((row) => (
              <ProductLineCard
                key={row.id}
                row={row}
                onClick={() => router.push(`/product-lines/${row.id}`)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Pagination */}
      {!isEmpty && (
        <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-xs text-zinc-500">
          <span>
            {rows.length === 0
              ? 0
              : (urlState.page - 1) * urlState.pageSize + 1}
            –{(urlState.page - 1) * urlState.pageSize + rows.length} /{" "}
            {total.toLocaleString("vi-VN")}
          </span>
          <div className="flex items-center gap-1">
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page <= 1}
              onClick={() => void setUrlState({ page: 1 })}
            >
              ‹‹
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page <= 1}
              onClick={() =>
                void setUrlState({ page: Math.max(1, urlState.page - 1) })
              }
            >
              ‹
            </Button>
            <span className="px-2 tabular-nums">
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
            >
              ›
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={urlState.page >= pageCount}
              onClick={() => void setUrlState({ page: pageCount })}
            >
              ››
            </Button>
          </div>
        </footer>
      )}
    </div>
  );
}

function ProductLineCard({
  row,
  onClick,
}: {
  row: ReturnType<typeof useProductLineList>["data"] extends
    | { data: (infer R)[] }
    | undefined
    ? R
    : never;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex flex-col gap-3 rounded-lg border border-zinc-200 bg-white p-4 text-left shadow-sm transition-shadow hover:border-blue-300 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-blue-50 text-blue-600">
            <FolderKanban className="h-4 w-4" aria-hidden />
          </div>
          <div>
            <p className="font-mono text-xs font-semibold text-zinc-900">
              {row.code}
            </p>
            <p className="mt-0.5 text-sm font-medium text-zinc-800 group-hover:text-blue-700">
              {row.name}
            </p>
          </div>
        </div>
        <StatusBadge
          status={row.status === "ACTIVE" ? "success" : "neutral"}
          label={row.status === "ACTIVE" ? "Hoạt động" : "Lưu trữ"}
          size="sm"
        />
      </div>

      {row.description && (
        <p className="text-xs text-zinc-500 line-clamp-2">{row.description}</p>
      )}

      <div className="flex items-center justify-between border-t border-zinc-100 pt-2">
        <div className="flex items-center gap-1 text-xs text-zinc-500">
          <LayoutGrid className="h-3 w-3" aria-hidden />
          <span className="tabular-nums">{row.memberCount}</span> mã Z
        </div>
        <span className="text-xs text-zinc-400">
          {formatDate(row.updatedAt, "dd/MM/yyyy")}
        </span>
      </div>
    </button>
  );
}
