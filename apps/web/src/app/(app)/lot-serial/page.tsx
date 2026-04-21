"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search, X } from "lucide-react";
import {
  parseAsInteger,
  parseAsString,
  parseAsStringEnum,
  useQueryStates,
} from "nuqs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useLotSerialList,
  type LotSerialListRow,
  type LotStatus,
} from "@/hooks/useLotSerial";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V1.7-beta.2.1 — `/lot-serial` list page.
 *
 * Landing page khi click "Xem tất cả lot" ở InventoryPopover. Hỗ trợ:
 *   - `?itemId=X` → auto filter theo item, hiển thị chip có thể xoá.
 *   - Search ILIKE lot_code / serial_code / item_sku.
 *   - Filter status: AVAILABLE · HOLD · CONSUMED · EXPIRED · tất cả.
 *   - Pagination.
 *   - Row click → `/lot-serial/[id]` (detail đã có sẵn).
 */

const STATUS_MODES = [
  "all",
  "AVAILABLE",
  "HOLD",
  "CONSUMED",
  "EXPIRED",
] as const;

const STATUS_LABEL: Record<LotStatus, string> = {
  AVAILABLE: "Sẵn dùng",
  HOLD: "Giữ QC",
  CONSUMED: "Đã dùng",
  EXPIRED: "Hết hạn",
};

const STATUS_VARIANT: Record<
  LotStatus,
  "success" | "warning" | "neutral" | "danger"
> = {
  AVAILABLE: "success",
  HOLD: "warning",
  CONSUMED: "neutral",
  EXPIRED: "danger",
};

function StatusBadge({ status }: { status: string }) {
  const v = STATUS_VARIANT[status as LotStatus] ?? "neutral";
  const label = STATUS_LABEL[status as LotStatus] ?? status;
  return (
    <Badge variant={v} size="sm">
      {label}
    </Badge>
  );
}

export default function LotSerialListPage() {
  const router = useRouter();

  const [urlState, setUrlState] = useQueryStates(
    {
      q: parseAsString.withDefault(""),
      itemId: parseAsString.withDefault(""),
      statusMode: parseAsStringEnum([...STATUS_MODES]).withDefault("all"),
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

  const filter = React.useMemo(
    () => ({
      q: urlState.q || undefined,
      itemId: urlState.itemId || undefined,
      status:
        urlState.statusMode === "all"
          ? undefined
          : (urlState.statusMode as LotStatus),
      page: urlState.page,
      pageSize: urlState.pageSize,
    }),
    [urlState],
  );

  const query = useLotSerialList(filter);
  const rows: LotSerialListRow[] = query.data?.data ?? [];
  const total = query.data?.meta.total ?? 0;
  const pageCount = Math.max(1, Math.ceil(total / urlState.pageSize));

  // Lấy itemSku đầu tiên để hiển thị chip filter (server trả data kèm item info)
  const firstItemSku = rows[0]?.itemSku ?? null;

  const handleResetItem = () => {
    void setUrlState({ itemId: "", page: 1 });
  };

  const handleResetAll = () => {
    setSearchInput("");
    void setUrlState({
      q: "",
      itemId: "",
      statusMode: "all",
      page: 1,
    });
  };

  const hasFilter =
    urlState.q !== "" ||
    urlState.itemId !== "" ||
    urlState.statusMode !== "all";

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link href="/" className="hover:text-zinc-900 hover:underline">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-500">Kho</span>
            {" / "}
            <span className="text-zinc-900">Lô &amp; Serial</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Lô &amp; Serial
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500">
            Danh sách lot/serial trong kho · {total.toLocaleString("vi-VN")} lot
          </p>
        </div>
      </header>

      <div className="flex items-center gap-2 border-b border-zinc-200 bg-white px-4 py-2">
        <div className="relative w-72">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            placeholder="Tìm theo lot code, serial, SKU…"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="h-8 pl-7 text-xs"
          />
        </div>

        <div className="flex items-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-0.5">
          {STATUS_MODES.map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => void setUrlState({ statusMode: m, page: 1 })}
              className={cn(
                "h-6 rounded px-2 text-[11px] font-medium transition-colors",
                urlState.statusMode === m
                  ? "bg-white text-zinc-900 shadow-sm ring-1 ring-zinc-200"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              {m === "all" ? "Tất cả" : (STATUS_LABEL[m as LotStatus] ?? m)}
            </button>
          ))}
        </div>

        {hasFilter && (
          <Button variant="ghost" size="sm" onClick={handleResetAll}>
            Xoá bộ lọc
          </Button>
        )}
      </div>

      {urlState.itemId ? (
        <div className="flex items-center gap-2 border-b border-zinc-100 bg-indigo-50/50 px-4 py-1.5 text-xs">
          <span className="text-zinc-500">Đang lọc theo item:</span>
          <span className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-0.5 font-mono text-[11px] text-indigo-700 ring-1 ring-indigo-200">
            {firstItemSku ?? urlState.itemId.slice(0, 8)}
            <button
              type="button"
              onClick={handleResetItem}
              className="ml-1 rounded p-0.5 hover:bg-indigo-100"
              aria-label="Xoá filter item"
            >
              <X className="h-3 w-3" aria-hidden />
            </button>
          </span>
        </div>
      ) : null}

      <div className="flex-1 overflow-auto p-4">
        {query.isLoading ? (
          <div className="py-16 text-center text-sm text-zinc-500">
            Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-filter-match"
            title={hasFilter ? "Không tìm thấy lot khớp bộ lọc" : "Chưa có lot nào"}
            description={
              hasFilter
                ? "Thử thay đổi từ khoá hoặc trạng thái."
                : "Lot sẽ xuất hiện khi có phiếu nhập kho đầu tiên."
            }
            actions={
              hasFilter ? (
                <Button variant="ghost" size="sm" onClick={handleResetAll}>
                  Xoá bộ lọc
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full border-separate border-spacing-0 text-sm">
              <thead className="bg-zinc-50 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
                <tr className="h-8">
                  <th className="border-b border-zinc-200 px-3 text-left">
                    Lot / Serial
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-left">
                    Item
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-right">
                    On-hand
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-left">
                    Trạng thái
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-left">
                    NSX / HSD
                  </th>
                  <th className="border-b border-zinc-200 px-3 text-left">
                    Ngày tạo
                  </th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => router.push(`/lot-serial/${r.id}`)}
                    className="cursor-pointer border-b border-zinc-100 transition-colors hover:bg-zinc-50"
                  >
                    <td className="px-3 py-2 font-mono text-[12px] font-medium text-zinc-900">
                      {r.lotCode ?? r.serialCode ?? (
                        <span className="italic text-zinc-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <div className="font-mono text-[11px] text-zinc-700">
                        {r.itemSku ?? "—"}
                      </div>
                      <div className="truncate text-[11px] text-zinc-500">
                        {r.itemName ?? ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right font-mono text-[12px] tabular-nums text-zinc-900">
                      {formatNumber(r.onHandQty)}{" "}
                      <span className="text-[10px] text-zinc-400">
                        {r.itemUom ?? ""}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-600">
                      {r.mfgDate ?? "—"}
                      <span className="text-zinc-300"> / </span>
                      {r.expDate ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-[11px] text-zinc-500">
                      {new Date(r.createdAt).toLocaleDateString("vi-VN")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <footer className="flex h-9 items-center justify-between border-t border-zinc-200 bg-white px-4 text-sm">
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
    </div>
  );
}
