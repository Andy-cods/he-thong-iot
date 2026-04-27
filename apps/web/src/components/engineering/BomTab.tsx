"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, FileUp, Layers, Plus, Sparkles } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";
import { type BomStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { DialogConfirm } from "@/components/ui/dialog";
import { BulkActionBar } from "@/components/items/BulkActionBar";
import {
  BomFilterBarPlus,
  initialBomFilterPlusState,
  type BomFilterPlusState,
  type BomSortKey,
  type BomViewMode,
} from "@/components/bom/BomFilterBarPlus";
import {
  BomListTable,
  type BomRow,
  type BomSortField,
} from "@/components/bom/BomListTable";
import { BomCardGrid, type BomCardItem } from "@/components/bom/BomCardGrid";
import { useBomList, useDeleteBomTemplate } from "@/hooks/useBom";
import {
  isSelected,
  selectionCount,
  useSelection,
  visibleSelectedIds,
} from "@/hooks/use-selection";
import type { BomFilter, ItemFilter } from "@/lib/query-keys";
import { useHotkey } from "@/lib/shortcuts";

const VIEW_MODES = ["table", "card"] as const;
const SORT_KEYS = [
  "updatedAt:desc",
  "updatedAt:asc",
  "name:asc",
  "name:desc",
  "componentCount:desc",
  "componentCount:asc",
] as const;

/**
 * V2.1 BomTab — TASK-20260427-029.
 *
 * Engineering hub `/engineering?tab=bom` BOM List redesign:
 * - Toggle table ↔ card view (URL `?view=`).
 * - Filter rich: search + multi-status chips + dateRange + minComponents
 *   slider + hasSheet boolean (URL persisted).
 * - Sort dropdown 6 modes.
 * - Hover preview tooltip (in table mode).
 * - Empty state pro với CTA Tạo + Import + Hướng dẫn.
 *
 * Filter mapping:
 * - q, statuses, hasSheet → SERVER (BomFilter API).
 * - dateFrom, dateTo, minComponents → CLIENT-side (API chưa hỗ trợ).
 */
export function BomTab() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      statuses: parseAsString.withDefault(""), // CSV "DRAFT,ACTIVE"
      view: parseAsStringEnum([...VIEW_MODES]).withDefault("table"),
      sort: parseAsStringEnum([...SORT_KEYS]).withDefault("updatedAt:desc"),
      dateFrom: parseAsString.withDefault(""),
      dateTo: parseAsString.withDefault(""),
      minComponents: parseAsInteger.withDefault(0),
      hasSheet: parseAsString.withDefault(""), // "1" or ""
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
    },
    { history: "replace", shallow: true, throttleMs: 250 },
  );

  const view = urlState.view as BomViewMode;
  const sort = urlState.sort as BomSortKey;

  const filterState: BomFilterPlusState = React.useMemo(() => {
    const statuses = urlState.statuses
      ? (urlState.statuses.split(",").filter(Boolean) as BomStatus[])
      : [];
    return {
      q: urlState.q,
      statuses,
      dateFrom: urlState.dateFrom,
      dateTo: urlState.dateTo,
      minComponents: urlState.minComponents,
      hasSheet: urlState.hasSheet === "1",
    };
  }, [urlState]);

  const [searchInput, setSearchInput] = React.useState(filterState.q);
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

  const handleFilterChange = (patch: Partial<BomFilterPlusState>) => {
    const next: Parameters<typeof setUrlState>[0] = { page: 1 };
    if (patch.q !== undefined) next.q = patch.q;
    if (patch.statuses !== undefined)
      next.statuses = patch.statuses.join(",");
    if (patch.dateFrom !== undefined) next.dateFrom = patch.dateFrom;
    if (patch.dateTo !== undefined) next.dateTo = patch.dateTo;
    if (patch.minComponents !== undefined)
      next.minComponents = patch.minComponents;
    if (patch.hasSheet !== undefined) next.hasSheet = patch.hasSheet ? "1" : "";
    void setUrlState(next);
  };

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({
      q: "",
      statuses: "",
      dateFrom: "",
      dateTo: "",
      minComponents: 0,
      hasSheet: "",
      page: 1,
    });
  };

  // Map sort key → server params.
  const [sortField, sortDir] = sort.split(":") as [BomSortField, "asc" | "desc"];

  const queryFilter: BomFilter = React.useMemo(
    () => ({
      q: filterState.q || undefined,
      status: filterState.statuses.length > 0 ? filterState.statuses : undefined,
      hasComponents: filterState.hasSheet ? true : undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
      sort: sortField,
      sortDir,
    }),
    [filterState, urlState.page, urlState.pageSize, sortField, sortDir],
  );

  const query = useBomList(queryFilter);
  const totalRaw = query.data?.meta.total ?? 0;
  const rowsRaw: BomRow[] = React.useMemo(
    () =>
      (query.data?.data ?? []).map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        parentItemSku: r.parentItemSku,
        parentItemName: r.parentItemName,
        targetQty: r.targetQty,
        status: r.status,
        componentCount: r.componentCount,
        updatedAt: r.updatedAt,
      })),
    [query.data],
  );

  // CLIENT-side post-filter: dateRange + minComponents (API chưa hỗ trợ).
  const rows: BomRow[] = React.useMemo(() => {
    const fromTs = filterState.dateFrom
      ? new Date(filterState.dateFrom).getTime()
      : null;
    const toTs = filterState.dateTo
      ? new Date(filterState.dateTo).getTime() + 24 * 60 * 60 * 1000 // inclusive end-of-day
      : null;
    return rowsRaw.filter((r) => {
      if (filterState.minComponents > 0 && r.componentCount < filterState.minComponents) {
        return false;
      }
      if (fromTs !== null || toTs !== null) {
        // updatedAt as proxy for "thời điểm tạo/cập nhật"
        const t = new Date(r.updatedAt).getTime();
        if (fromTs !== null && t < fromTs) return false;
        if (toTs !== null && t > toTs) return false;
      }
      return true;
    });
  }, [rowsRaw, filterState.minComponents, filterState.dateFrom, filterState.dateTo]);

  const total = rows.length === rowsRaw.length ? totalRaw : rows.length;
  const pageCount = Math.max(1, Math.ceil(totalRaw / urlState.pageSize));

  const [selection, selectionActions] = useSelection(
    queryFilter as unknown as ItemFilter,
  );
  const selCount = selectionCount(selection, total);

  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const [singleDeleteRow, setSingleDeleteRow] = React.useState<BomRow | null>(
    null,
  );
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

  const handleSingleDelete = async () => {
    if (!singleDeleteRow) return;
    try {
      await deleteBom.mutateAsync(singleDeleteRow.id);
      toast.success(`Đã xoá BOM ${singleDeleteRow.code}.`);
    } catch (err) {
      toast.error(
        (err as Error)?.message ?? "Không xoá được BOM. Vui lòng thử lại.",
      );
    } finally {
      setSingleDeleteRow(null);
    }
  };

  const handleExportStub = () => {
    toast.info("Xuất Excel: sẽ có ở V1.2.");
  };

  const handleSortHeaderClick = (field: BomSortField) => {
    // Toggle direction when clicking same field, else default desc.
    const isSame = field === sortField;
    const nextDir: "asc" | "desc" = isSame
      ? sortDir === "asc"
        ? "desc"
        : "asc"
      : "desc";
    void setUrlState({ sort: `${field}:${nextDir}` as BomSortKey, page: 1 });
  };

  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    filterState.q !== "" ||
    filterState.statuses.length > 0 ||
    filterState.dateFrom !== "" ||
    filterState.dateTo !== "" ||
    filterState.minComponents > 0 ||
    filterState.hasSheet;

  // Card-view items
  const cardItems: BomCardItem[] = React.useMemo(
    () =>
      rows.map((r) => ({
        id: r.id,
        code: r.code,
        name: r.name,
        description: r.description,
        parentItemSku: r.parentItemSku,
        status: r.status,
        componentCount: r.componentCount,
        sheetCount: r.componentCount > 0 ? 1 : 0, // proxy
        updatedAt: r.updatedAt,
      })),
    [rows],
  );

  return (
    <div className="flex h-full flex-col overflow-hidden bg-zinc-50/40">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            BOM List
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Danh sách BOM ·{" "}
            <span className="tabular-nums">
              {totalRaw.toLocaleString("vi-VN")}
            </span>{" "}
            BOM
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            asChild
            variant="outline"
            size="sm"
            className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
          >
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

      <BomFilterBarPlus
        state={filterState}
        onChange={handleFilterChange}
        onReset={handleReset}
        onSearchInput={(v) => setSearchInput(v)}
        searchInputRef={searchRef}
        totalCount={total}
        view={view}
        onViewChange={(v) => void setUrlState({ view: v })}
        sort={sort}
        onSortChange={(s) => void setUrlState({ sort: s, page: 1 })}
      />

      <div className="flex-1 overflow-auto p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy BOM khớp bộ lọc"
              description="Thử thay đổi từ khoá hoặc xoá bộ lọc đang áp dụng."
              actions={
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              icon={
                <Layers
                  className="text-indigo-300"
                  size={56}
                  strokeWidth={1.5}
                  aria-hidden="true"
                />
              }
              title="Chưa có BOM nào"
              description="Tạo BOM đầu tiên hoặc nhập từ Excel — mỗi BOM bao gồm danh sách linh kiện, sheet vật liệu và quy trình sản xuất."
              actions={
                <>
                  <Button asChild size="sm">
                    <Link href="/bom/new">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Tạo BOM mới
                    </Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link href="/bom/import">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Import Excel
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/docs/context-part-2.md" target="_blank">
                      <BookOpen className="h-3.5 w-3.5" aria-hidden="true" />
                      Xem hướng dẫn
                    </Link>
                  </Button>
                </>
              }
            />
          )
        ) : view === "card" ? (
          <BomCardGrid
            rows={cardItems}
            loading={query.isLoading}
            onOpen={(r) => router.push(`/bom/${r.id}/grid`)}
            onClone={(r) => router.push(`/bom/${r.id}`)}
            onDelete={(r) => {
              const match = rows.find((x) => x.id === r.id);
              if (match) setSingleDeleteRow(match);
            }}
          />
        ) : (
          <div className="h-full">
            <BomListTable
              rows={rows}
              loading={query.isLoading}
              selection={selection}
              onToggleRow={(id) => selectionActions.toggleRow(id, true)}
              onTogglePage={(ids) => selectionActions.togglePage(ids)}
              onEdit={(row) => router.push(`/bom/${row.id}`)}
              onPreview={(row) => router.push(`/bom/${row.id}`)}
              onDelete={(row) => setSingleDeleteRow(row)}
              focusedIndex={focusedIndex}
              sortField={sortField}
              sortDir={sortDir}
              onSortChange={handleSortHeaderClick}
            />
          </div>
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
            {totalRaw.toLocaleString("vi-VN")}
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

      <DialogConfirm
        open={singleDeleteRow !== null}
        onOpenChange={(open) => {
          if (!open) setSingleDeleteRow(null);
        }}
        title={
          singleDeleteRow
            ? `Xoá BOM ${singleDeleteRow.code}?`
            : "Xoá BOM"
        }
        description={`BOM sẽ chuyển sang trạng thái OBSOLETE (soft-delete) và không hiện trong danh sách. Gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Xoá BOM"
        loading={deleteBom.isPending}
        onConfirm={() => void handleSingleDelete()}
      />
    </div>
  );
}

// Re-export for back-compat with potential consumers.
export { initialBomFilterPlusState };
