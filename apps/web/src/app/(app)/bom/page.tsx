"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Plus, Sparkles } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogConfirm } from "@/components/ui/dialog";
import { BulkActionBar } from "@/components/items/BulkActionBar";
import {
  BomFilterBar,
  type BomFilterBarState,
  type BomStatusMode,
} from "@/components/bom/BomFilterBar";
import { BomListTable, type BomRow } from "@/components/bom/BomListTable";
import { useBomList, useDeleteBomTemplate } from "@/hooks/useBom";
import {
  isSelected,
  selectionCount,
  useSelection,
  visibleSelectedIds,
} from "@/hooks/use-selection";
import type { BomFilter, ItemFilter } from "@/lib/query-keys";
import { useHotkey } from "@/lib/shortcuts";

const STATUS_MODES = ["all", "active", "draft-obsolete"] as const;

/**
 * V2 `/bom` list page — Linear compact, reuse pattern `/items`.
 *
 * - Virtualized table 36px + sticky code mono.
 * - URL nuqs state: q, statusMode, page, pageSize, sort.
 * - Bulk delete dialog type-to-confirm "XOA".
 * - Keyboard: /jke Space.
 */
export default function BomListPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      statusMode: parseAsStringEnum([...STATUS_MODES]).withDefault("all"),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      sort: parseAsString.withDefault("updatedAt"),
      sortDir: parseAsStringEnum(["asc", "desc"]).withDefault("desc"),
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

  React.useEffect(() => {
    if (urlState.q !== searchInput && urlState.q === "") {
      setSearchInput("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [urlState.q]);

  const statusMode = urlState.statusMode as BomStatusMode;

  const filterState: BomFilterBarState = {
    q: searchInput,
    statusMode,
  };

  const handleFilterChange = (patch: Partial<BomFilterBarState>) => {
    const next: Parameters<typeof setUrlState>[0] = { page: 1 };
    if (patch.q !== undefined) next.q = patch.q;
    if (patch.statusMode !== undefined) next.statusMode = patch.statusMode;
    void setUrlState(next);
  };

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({
      q: "",
      statusMode: "all",
      page: 1,
    });
  };

  const queryFilter: BomFilter = React.useMemo(() => {
    let status: BomFilter["status"];
    if (statusMode === "active") status = ["ACTIVE"];
    else if (statusMode === "draft-obsolete") status = ["DRAFT", "OBSOLETE"];
    return {
      q: urlState.q || undefined,
      status,
      page: urlState.page,
      pageSize: urlState.pageSize,
      sort: urlState.sort,
      sortDir: urlState.sortDir as "asc" | "desc",
    };
  }, [urlState, statusMode]);

  const query = useBomList(queryFilter);
  const total = query.data?.meta.total ?? 0;
  const rows: BomRow[] = React.useMemo(
    () =>
      (query.data?.data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        parentItemSku: r.parentItemSku,
        parentItemName: r.parentItemName,
        targetQty: r.targetQty,
        status: r.status,
        componentCount: r.componentCount,
        updatedAt: r.updatedAt,
      })),
    [query.data],
  );
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  // useSelection typed by ItemFilter, ta cast qua shape tương thích.
  const [selection, selectionActions] = useSelection(
    queryFilter as unknown as ItemFilter,
  );
  const selCount = selectionCount(selection, total);

  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const deleteBom = useDeleteBomTemplate();

  const searchRef = React.useRef<HTMLInputElement>(null);

  useHotkey("/", () => searchRef.current?.focus(), { preventDefault: true });
  useHotkey("j", () =>
    setFocusedIndex((i) => Math.min(rows.length - 1, Math.max(0, i) + 1)),
  );
  useHotkey("k", () =>
    setFocusedIndex((i) => Math.max(0, (i < 0 ? 0 : i) - 1)),
  );
  useHotkey("Escape", () => {
    selectionActions.clear();
    setFocusedIndex(-1);
  });
  useHotkey(" ", (e) => {
    if (focusedIndex >= 0 && rows[focusedIndex]) {
      e.preventDefault();
      selectionActions.toggleRow(rows[focusedIndex]!.id, true);
    }
  });
  useHotkey("Enter", () => {
    const r = rows[focusedIndex];
    if (r) router.push(`/bom/${r.id}`);
  });
  useHotkey("e", () => {
    const r = rows[focusedIndex];
    if (r) router.push(`/bom/${r.id}`);
  });

  const handleBulkDelete = async () => {
    const ids =
      selection.mode === "visible"
        ? visibleSelectedIds(selection)
        : selection.mode === "all-matching"
          ? rows.filter((r) => isSelected(selection, r.id)).map((r) => r.id)
          : [];
    if (ids.length === 0) return;

    const results = await Promise.allSettled(
      ids.map((id) => deleteBom.mutateAsync(id)),
    );
    let success = 0;
    const failed: Array<{ id: string; reason: string }> = [];
    results.forEach((r, i) => {
      if (r.status === "fulfilled") success++;
      else
        failed.push({
          id: ids[i]!,
          reason: (r.reason as Error)?.message ?? "Lỗi không xác định",
        });
    });
    if (failed.length === 0) {
      toast.success(`Đã xoá ${success} BOM.`);
    } else {
      toast.error(`Xoá ${success} thành công, ${failed.length} lỗi.`);
    }
    selectionActions.clear();
    setBulkDeleteOpen(false);
  };

  const handleExportStub = () => {
    toast.info("Xuất Excel: sẽ có ở V1.2.");
  };

  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter = urlState.q !== "" || statusMode !== "all";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            BOM List
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Danh sách BOM · {total.toLocaleString("vi-VN")} BOM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100">
            <Link href="/playground/univer">
              <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
              Thử Grid mới (Excel-like)
            </Link>
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/bom/import">
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              Nhập Excel
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/bom/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo BOM mới
            </Link>
          </Button>
        </div>
      </header>

      <BomFilterBar
        state={filterState}
        onChange={handleFilterChange}
        onReset={handleReset}
        totalCount={total}
        onSearchInput={setSearchInput}
        searchInputRef={searchRef}
      />

      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy BOM khớp bộ lọc"
              description="Thử thay đổi từ khoá hoặc xoá bộ lọc trạng thái."
              actions={
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có BOM nào"
              description="Tạo BOM mới hoặc nhập từ Excel để bắt đầu."
              actions={
                <>
                  <Button asChild size="sm">
                    <Link href="/bom/new">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Tạo BOM mới
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/bom/import">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Nhập Excel
                    </Link>
                  </Button>
                </>
              }
            />
          )
        ) : (
          <BomListTable
            rows={rows}
            loading={query.isLoading}
            selection={selection}
            onToggleRow={(id) => selectionActions.toggleRow(id, true)}
            onTogglePage={(ids) => selectionActions.togglePage(ids)}
            onEdit={(row) => router.push(`/bom/${row.id}`)}
            onPreview={(row) => router.push(`/bom/${row.id}`)}
            focusedIndex={focusedIndex}
          />
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-base">
        <div className="text-zinc-600">
          Hiển thị{" "}
          <span className="tabular-nums text-zinc-900">
            {rows.length === 0 ? 0 : (urlState.page - 1) * urlState.pageSize + 1}
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
            onClick={() => void setUrlState({ page: 1 })}
            aria-label="Trang đầu"
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
          <Button
            size="sm"
            variant="ghost"
            disabled={urlState.page >= pageCount}
            onClick={() => void setUrlState({ page: pageCount })}
            aria-label="Trang cuối"
          >
            ››
          </Button>
        </div>
      </footer>

      <BulkActionBar
        count={selCount}
        totalMatching={total}
        mode={selection.mode}
        onSelectAllMatching={
          selection.mode === "visible"
            ? () => selectionActions.selectAllMatching()
            : undefined
        }
        onDelete={() => setBulkDeleteOpen(true)}
        onExport={handleExportStub}
        onClear={() => selectionActions.clear()}
      />

      <DialogConfirm
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Xoá ${selCount} BOM?`}
        description={`BOM sẽ chuyển sang trạng thái OBSOLETE (soft-delete). Gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Xoá tất cả"
        loading={deleteBom.isPending}
        onConfirm={() => void handleBulkDelete()}
      />
    </div>
  );
}
