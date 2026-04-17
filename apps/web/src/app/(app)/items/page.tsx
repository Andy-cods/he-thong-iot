"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileUp, Plus, Rows3, Rows4 } from "lucide-react";
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
import { useItemsList, useBulkDeleteItems } from "@/hooks/useItems";
import {
  isSelected,
  selectionCount,
  useSelection,
  visibleSelectedIds,
} from "@/hooks/use-selection";
import type { ItemFilter } from "@/lib/query-keys";
import { useHotkey } from "@/lib/shortcuts";
import { cn } from "@/lib/utils";

const TRACKING_VALUES = ["lot", "serial", "none"] as const;

/**
 * /items — redesigned (design-spec §2.4, T5-T6).
 *
 * - URL-state qua nuqs (q, type, uom, active, tracking, category, page, pageSize, sort).
 * - Debounce q 300ms.
 * - Selection state machine (3 mode) qua useSelection.
 * - BulkActionBar sticky bottom khi count > 0.
 * - QuickEditSheet mở từ row action "Edit" (giữ scroll position).
 * - Keyboard: `/` focus search, `j/k` next/prev row, `Space` toggle,
 *   `Enter` mở detail, `e` edit, `Escape` clear selection.
 */
export default function ItemsPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
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

  // Debounce search input (brainstorm-deep §1.5: throttleMs=250 + debounce input 300ms).
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

  // Sync external reset (onReset) về input
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

  // Density (localStorage)
  const [density, setDensity] = React.useState<"compact" | "comfort">(
    "compact",
  );
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const v = window.localStorage.getItem("iot:items:density");
    if (v === "40") setDensity("compact");
    else if (v === "56") setDensity("comfort");
  }, []);
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      "iot:items:density",
      density === "compact" ? "40" : "56",
    );
  }, [density]);

  // Filter for react-query key
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

  // Selection state machine
  const [selection, selectionActions] = useSelection(queryFilter);
  const selCount = selectionCount(selection, total);

  // Quick edit sheet state
  const [editingId, setEditingId] = React.useState<string | null>(null);

  // Focused row (keyboard)
  const [focusedIndex, setFocusedIndex] = React.useState(-1);

  // Bulk delete dialog
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false);
  const bulkDelete = useBulkDeleteItems();

  const searchRef = React.useRef<HTMLInputElement>(null);

  // Keyboard shortcuts
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

  const isEmpty = !query.isLoading && rows.length === 0;
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
      <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-4">
        <div>
          <h1 className="font-heading text-xl font-semibold text-slate-900">
            Danh mục vật tư
          </h1>
          <p className="text-xs text-slate-500">
            {total.toLocaleString("vi-VN")} vật tư · cập nhật theo realtime
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="hidden items-center gap-1 rounded border border-slate-200 p-0.5 md:flex">
            <button
              type="button"
              onClick={() => setDensity("compact")}
              aria-label="Mật độ gọn"
              aria-pressed={density === "compact"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100",
                density === "compact" && "bg-slate-200 text-slate-900",
              )}
            >
              <Rows4 className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => setDensity("comfort")}
              aria-label="Mật độ thoáng"
              aria-pressed={density === "comfort"}
              className={cn(
                "inline-flex h-7 w-7 items-center justify-center rounded-sm text-slate-500 hover:bg-slate-100",
                density === "comfort" && "bg-slate-200 text-slate-900",
              )}
            >
              <Rows3 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
          <Button asChild variant="outline">
            <Link href="/items/import">
              <FileUp className="h-4 w-4" aria-hidden />
              Nhập Excel
            </Link>
          </Button>
          <Button asChild>
            <Link href="/items/new">
              <Plus className="h-4 w-4" aria-hidden />
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

      <div className="flex-1 overflow-hidden p-3">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy vật tư khớp bộ lọc"
              description="Thử thay đổi tiêu chí tìm kiếm hoặc xoá bớt bộ lọc."
              actions={
                <Button variant="outline" onClick={handleReset}>
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
                  <Button asChild>
                    <Link href="/items/new">
                      <Plus className="h-4 w-4" aria-hidden="true" />
                      Tạo mới
                    </Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link href="/items/import">
                      <FileUp className="h-4 w-4" aria-hidden="true" />
                      Import Excel
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
            density={density}
            focusedIndex={focusedIndex}
          />
        )}
      </div>

      <footer className="flex items-center justify-between border-t border-slate-200 bg-white px-4 py-2 text-sm">
        <div className="text-slate-600">
          Hiển thị{" "}
          <span className="tabular-nums">
            {rows.length === 0
              ? 0
              : (urlState.page - 1) * urlState.pageSize + 1}
            –{(urlState.page - 1) * urlState.pageSize + rows.length}
          </span>{" "}
          / <span className="tabular-nums">{total.toLocaleString("vi-VN")}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={urlState.page <= 1}
            onClick={() => void setUrlState({ page: 1 })}
            aria-label="Trang đầu"
          >
            ‹‹
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={urlState.page <= 1}
            onClick={() =>
              void setUrlState({ page: Math.max(1, urlState.page - 1) })
            }
            aria-label="Trang trước"
          >
            ‹
          </Button>
          <span className="px-2 text-slate-600">
            {urlState.page} / {pageCount}
          </span>
          <Button
            size="sm"
            variant="outline"
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
            variant="outline"
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
    </div>
  );
}
