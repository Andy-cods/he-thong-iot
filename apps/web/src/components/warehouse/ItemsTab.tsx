"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, MapPin, Plus } from "lucide-react";
import {
  parseAsArrayOf,
  parseAsBoolean,
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";
import {
  ITEM_TYPES,
  UOMS,
  type ItemType,
  type Uom,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { DialogConfirm } from "@/components/ui/dialog";
import { BulkActionBar } from "@/components/items/BulkActionBar";
import {
  FilterBar,
  type FilterBarState,
} from "@/components/items/FilterBar";
import {
  ItemListTable,
  type ItemRow,
} from "@/components/items/ItemListTable";
import { ItemQuickEditSheet } from "@/components/items/ItemQuickEditSheet";
import { DefaultBinSuggestionSheet } from "@/components/warehouse/DefaultBinSuggestionSheet";
import { useItemsList, useBulkDeleteItems } from "@/hooks/useItems";
import {
  isSelected,
  selectionCount,
  useSelection,
  visibleSelectedIds,
} from "@/hooks/use-selection";
import type { ItemFilter } from "@/lib/query-keys";
import { useHotkey } from "@/lib/shortcuts";

const TRACKING_VALUES = ["lot", "serial", "none"] as const;

/**
 * V3 (TASK-20260427-014) — `<ItemsTab>` cho `/warehouse?tab=items`.
 *
 * Logic copy nguyên từ `/items` page V2 cũ (đã redirect). URL state nuqs,
 * debounce search 300ms, selection 3-mode, bulk delete optimistic, hotkey
 * `/jkeSpace`, quick-edit sheet. KHÔNG import từ page cũ — copy logic để
 * page cũ có thể bị xoá an toàn (đã redirect).
 */
export function ItemsTab() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      // Giữ tab param không reset
      tab: parseAsString.withDefault("items"),
      q: parseAsString.withDefault(""),
      type: parseAsArrayOf(parseAsStringEnum([...ITEM_TYPES])).withDefault([]),
      uom: parseAsArrayOf(parseAsStringEnum([...UOMS])).withDefault([]),
      active: parseAsBoolean,
      tracking: parseAsStringEnum([...TRACKING_VALUES]),
      category: parseAsString.withDefault(""),
      supplier: parseAsString.withDefault(""),
      minStockViolation: parseAsBoolean.withDefault(false),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      sort: parseAsString.withDefault("-updatedAt"),
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

  const filterState: FilterBarState = {
    q: searchInput,
    type: urlState.type as ItemType[],
    uom: urlState.uom as Uom[],
    active: urlState.active,
    tracking: urlState.tracking,
    category: urlState.category,
    supplierId: urlState.supplier,
    minStockViolation: urlState.minStockViolation,
  };

  const handleFilterChange = (patch: Partial<FilterBarState>) => {
    const next: Parameters<typeof setUrlState>[0] = { page: 1 };
    if (patch.q !== undefined) next.q = patch.q;
    if (patch.type !== undefined) next.type = patch.type;
    if (patch.uom !== undefined) next.uom = patch.uom;
    if (patch.active !== undefined) next.active = patch.active;
    if (patch.tracking !== undefined) next.tracking = patch.tracking;
    if (patch.category !== undefined) next.category = patch.category;
    if (patch.supplierId !== undefined) next.supplier = patch.supplierId;
    if (patch.minStockViolation !== undefined)
      next.minStockViolation = patch.minStockViolation;
    void setUrlState(next);
  };

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({
      q: "",
      type: [],
      uom: [],
      active: null,
      tracking: null,
      category: "",
      supplier: "",
      minStockViolation: false,
      page: 1,
    });
  };

  const queryFilter: ItemFilter = React.useMemo(
    () => ({
      q: urlState.q || undefined,
      type: urlState.type.length > 0 ? (urlState.type as string[]) : undefined,
      uom: urlState.uom.length > 0 ? (urlState.uom as string[]) : undefined,
      active: urlState.active ?? undefined,
      category: urlState.category || undefined,
      supplierId: urlState.supplier || undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
      sort: urlState.sort,
    }),
    [urlState],
  );

  const query = useItemsList<ItemRow>(queryFilter);
  const total = query.data?.meta.total ?? 0;
  const rows = query.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const [selection, selectionActions] = useSelection(queryFilter);
  const selCount = selectionCount(selection, total);

  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = React.useState(-1);
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const bulkDelete = useBulkDeleteItems();
  const [suggestOpen, setSuggestOpen] = React.useState(false);

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
    if (r) router.push(`/items/${r.id}`);
  });
  useHotkey("e", () => {
    const r = rows[focusedIndex];
    if (r) setEditingId(r.id);
  });

  const handleBulkDelete = async () => {
    const ids =
      selection.mode === "visible"
        ? visibleSelectedIds(selection)
        : selection.mode === "all-matching"
          ? rows.filter((r) => isSelected(selection, r.id)).map((r) => r.id)
          : [];
    if (ids.length === 0) return;
    try {
      const res = await bulkDelete.mutateAsync(ids);
      if (res.failed.length === 0) {
        toast.success(`Đã xoá ${res.success} vật tư.`);
      } else {
        toast.error(
          `Xoá ${res.success} thành công, ${res.failed.length} lỗi.`,
        );
      }
      selectionActions.clear();
      setBulkDeleteOpen(false);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleExportPlaceholder = () => {
    toast.info("Xuất Excel: sẽ có ở V1.1.");
  };

  // V4.1 UI-05: lỗi API không được coi là "chưa có vật tư".
  const isEmpty = !query.isLoading && !query.isError && rows.length === 0;
  const hasFilter =
    urlState.q !== "" ||
    urlState.type.length > 0 ||
    urlState.uom.length > 0 ||
    urlState.active !== null ||
    urlState.tracking !== null ||
    urlState.category !== "" ||
    urlState.supplier !== "" ||
    urlState.minStockViolation;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* V4.3 Đợt 2 mục 1 — bare trên nền trang xám (đây là sub-tab trong hub
          Kho, Large Title "Quản lí kho" đã ở page.tsx phía trên).
          V4.1 UI-X6: header chuẩn flex-wrap + min-w-0 — điện thoại nút xuống dòng, không tràn/gãy chữ. */}
      <header className="flex flex-wrap items-center justify-between gap-3 px-4 pb-3 pt-4 md:px-6">
        <div className="min-w-0 flex-1 basis-48">
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Danh mục vật tư
          </h2>
          <p className="mt-0.5 text-base text-zinc-500 dark:text-zinc-400">
            {query.isError ? "—" : total.toLocaleString("vi-VN")} vật tư · cập nhật tức thời
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setSuggestOpen(true)}>
            <MapPin className="h-3.5 w-3.5" aria-hidden="true" />
            Đề xuất vị trí mặc định
          </Button>
          <Button asChild variant="ghost" size="sm">
            <Link href="/items/import" className="whitespace-nowrap">
              <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
              Nhập Excel
            </Link>
          </Button>
          <Button asChild size="sm">
            <Link href="/items/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo mới
            </Link>
          </Button>
        </div>
      </header>

      <FilterBar
        state={filterState}
        onChange={handleFilterChange}
        onReset={handleReset}
        totalCount={total}
        onSearchInput={setSearchInput}
        searchInputRef={searchRef}
      />

      <div className="flex-1 overflow-auto p-4 md:overflow-hidden">
        {query.isError && rows.length === 0 ? (
          <QueryError
            error={query.error}
            onRetry={() => void query.refetch()}
            retrying={query.isFetching}
            title="Không tải được danh mục vật tư"
          />
        ) : isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy vật tư khớp bộ lọc"
              description="Thử thay đổi tiêu chí tìm kiếm hoặc xoá bớt bộ lọc."
              actions={
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Xoá tất cả bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-data"
              title="Chưa có vật tư nào"
              description="Nhập danh mục từ Excel hoặc tạo thủ công để bắt đầu quản lý kho."
              actions={
                <>
                  <Button asChild size="sm">
                    <Link href="/items/new">
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Tạo mới
                    </Link>
                  </Button>
                  <Button asChild variant="ghost" size="sm">
                    <Link href="/items/import">
                      <FileUp className="h-3.5 w-3.5" aria-hidden="true" />
                      Nhập Excel
                    </Link>
                  </Button>
                </>
              }
            />
          )
        ) : (
          <ItemListTable
            rows={rows}
            loading={query.isLoading}
            selection={selection}
            onToggleRow={(id) => selectionActions.toggleRow(id, true)}
            onTogglePage={(ids) => selectionActions.togglePage(ids)}
            onEdit={(row) => setEditingId(row.id)}
            onPreview={(row) => router.push(`/items/${row.id}`)}
            density="compact"
            focusedIndex={focusedIndex}
          />
        )}
      </div>

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
        onExport={handleExportPlaceholder}
        onClear={() => selectionActions.clear()}
      />

      {editingId && (
        <ItemQuickEditSheet
          itemId={editingId}
          onClose={() => setEditingId(null)}
        />
      )}

      <DialogConfirm
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title={`Xoá ${selCount} vật tư?`}
        description={`Bạn sẽ xoá ${selCount} vật tư. Hành động này không thể hoàn tác ngay; gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Xoá tất cả"
        loading={bulkDelete.isPending}
        onConfirm={() => void handleBulkDelete()}
      />

      <DefaultBinSuggestionSheet
        open={suggestOpen}
        onOpenChange={setSuggestOpen}
        onApplied={() => void query.refetch()}
      />
    </div>
  );
}
