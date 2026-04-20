"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { toast } from "sonner";
import type { SalesOrderStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { BulkActionBar } from "@/components/items/BulkActionBar";
import {
  OrderFilterBar,
  type OrderFilterBarState,
  type OrderStatusMode,
  orderStatusFromMode,
} from "@/components/orders/OrderFilterBar";
import {
  OrderListTable,
  type OrderRow,
} from "@/components/orders/OrderListTable";
import { useOrdersList } from "@/hooks/useOrders";
import { BomFilterChip } from "@/components/bom/BomFilterChip";
import {
  selectionCount,
  useSelection,
} from "@/hooks/use-selection";
import type { ItemFilter, OrderFilter } from "@/lib/query-keys";
import { useHotkey } from "@/lib/shortcuts";

const STATUS_MODES = [
  "all",
  "DRAFT",
  "CONFIRMED",
  "IN_PROGRESS",
  "CLOSED",
] as const;

/**
 * V1.2 `/orders` list page — Linear compact, pattern `/bom/page.tsx`.
 *
 * - Virtualized table 36px + sticky code mono.
 * - URL nuqs state: q, statusMode, dateFrom/To, page, pageSize, sort.
 * - Bulk actions: Xuất Excel stub / Huỷ.
 * - Keyboard: /jke Space.
 */
export default function OrdersListPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      statusMode: parseAsStringEnum([...STATUS_MODES]).withDefault("all"),
      dateFrom: parseAsString.withDefault(""),
      dateTo: parseAsString.withDefault(""),
      bomTemplateId: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
      pageSize: parseAsInteger.withDefault(50),
      sort: parseAsString.withDefault("createdAt"),
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

  const statusMode = urlState.statusMode as OrderStatusMode;

  const filterState: OrderFilterBarState = {
    q: searchInput,
    statusMode,
    dateFrom: urlState.dateFrom,
    dateTo: urlState.dateTo,
  };

  const handleFilterChange = (patch: Partial<OrderFilterBarState>) => {
    const next: Parameters<typeof setUrlState>[0] = { page: 1 };
    if (patch.q !== undefined) next.q = patch.q;
    if (patch.statusMode !== undefined) next.statusMode = patch.statusMode;
    if (patch.dateFrom !== undefined) next.dateFrom = patch.dateFrom;
    if (patch.dateTo !== undefined) next.dateTo = patch.dateTo;
    void setUrlState(next);
  };

  const handleReset = () => {
    setSearchInput("");
    void setUrlState({
      q: "",
      statusMode: "all",
      dateFrom: "",
      dateTo: "",
      page: 1,
    });
  };

  const queryFilter: OrderFilter = React.useMemo(() => {
    const status = orderStatusFromMode(statusMode) as
      | SalesOrderStatus[]
      | undefined;
    return {
      q: urlState.q || undefined,
      status,
      dateFrom: urlState.dateFrom || undefined,
      dateTo: urlState.dateTo || undefined,
      bomTemplateId: urlState.bomTemplateId || undefined,
      page: urlState.page,
      pageSize: urlState.pageSize,
      sort: urlState.sort,
      sortDir: urlState.sortDir as "asc" | "desc",
    };
  }, [urlState, statusMode]);

  const query = useOrdersList(queryFilter);
  const total = query.data?.meta.total ?? 0;

  const rows: OrderRow[] = React.useMemo(
    () =>
      (query.data?.data ?? []).map((r) => ({
        id: r.id,
        orderNo: r.orderNo,
        customerName: r.customerName,
        productName: null, // V1.2 Phase B2 sẽ join item.name
        orderQty: r.orderQty,
        dueDate: r.dueDate,
        status: r.status,
        priority: undefined, // placeholder cho field priority (Phase B2)
        readinessPercent: undefined, // Phase B2 sau snapshot explode
        updatedAt: r.updatedAt,
      })),
    [query.data],
  );

  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  const [selection, selectionActions] = useSelection(
    queryFilter as unknown as ItemFilter,
  );
  const selCount = selectionCount(selection, total);

  const [focusedIndex, setFocusedIndex] = React.useState(-1);

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
    if (r) router.push(`/orders/${r.orderNo}`);
  });

  const handleExportStub = () => {
    toast.info("Xuất Excel: sẽ có ở V1.2 Phase sau.");
  };
  const handleBulkCancelStub = () => {
    toast.info("Huỷ hàng loạt: sẽ có ở V1.2 Phase sau.");
  };

  const isEmpty = !query.isLoading && rows.length === 0;
  const hasFilter =
    urlState.q !== "" ||
    statusMode !== "all" ||
    urlState.dateFrom !== "" ||
    urlState.dateTo !== "";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-900">Đơn hàng</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Đơn hàng
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Quản lý đơn hàng · {total.toLocaleString("vi-VN")} đơn
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm">
            <Link href="/orders/new">
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo đơn hàng
            </Link>
          </Button>
        </div>
      </header>

      <OrderFilterBar
        state={filterState}
        onChange={handleFilterChange}
        onReset={handleReset}
        totalCount={total}
        onSearchInput={setSearchInput}
        searchInputRef={searchRef}
      />

      {/* V1.6 — BOM filter chip khi URL có ?bomTemplateId=X */}
      {urlState.bomTemplateId ? (
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-zinc-50 px-4 py-2">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Đang lọc theo BOM:
          </span>
          <BomFilterChip
            bomTemplateId={urlState.bomTemplateId}
            onDismiss={() => void setUrlState({ bomTemplateId: "", page: 1 })}
          />
        </div>
      ) : null}

      <div className="flex-1 overflow-hidden p-4">
        {isEmpty ? (
          hasFilter ? (
            <EmptyState
              preset="no-filter-match"
              title="Không tìm thấy đơn hàng khớp bộ lọc"
              description="Thử thay đổi từ khoá, trạng thái hoặc khoảng ngày."
              actions={
                <Button variant="ghost" size="sm" onClick={handleReset}>
                  Xoá bộ lọc
                </Button>
              }
            />
          ) : (
            <EmptyState
              preset="no-bom"
              title="Chưa có đơn hàng nào"
              description="Tạo đơn hàng đầu tiên để bắt đầu quản lý."
              actions={
                <Button asChild size="sm">
                  <Link href="/orders/new">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Tạo đơn hàng
                  </Link>
                </Button>
              }
            />
          )
        ) : (
          <OrderListTable
            rows={rows}
            loading={query.isLoading}
            selection={selection}
            onToggleRow={(id) => selectionActions.toggleRow(id, true)}
            onTogglePage={(ids) => selectionActions.togglePage(ids)}
            onPreview={(row) => router.push(`/orders/${row.orderNo}`)}
            onEdit={(row) => router.push(`/orders/${row.orderNo}`)}
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
        onDelete={handleBulkCancelStub}
        onExport={handleExportStub}
        onClear={() => selectionActions.clear()}
      />
    </div>
  );
}
