"use client";

import * as React from "react";
import { Check, ChevronDown, Plus, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useItemsList } from "@/hooks/useItems";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

interface ItemLike {
  id: string;
  sku: string;
  name: string;
  uom?: string;
  itemType?: string;
  /**
   * V4.4 (Việc 3) — tồn khả dụng, hiện khi `showStock`. `GET /api/items` trả
   * `inventorySummary.availableQty` (xem `listItems`), không phải field phẳng
   * — chấp cả 2 dạng để phòng API khác trả phẳng.
   */
  availableQty?: number;
  inventorySummary?: { availableQty?: number };
}

export interface ItemPickerValue {
  id: string;
  sku: string;
  name: string;
  uom?: string;
}

export interface ItemPickerProps {
  value: ItemPickerValue | null;
  onChange: (v: ItemPickerValue | null) => void;
  placeholder?: string;
  allowClear?: boolean;
  disabled?: boolean;
  /** aria id để link label. */
  id?: string;
  /** Lọc theo item type, mặc định không lọc. */
  itemTypes?: string[];
  /** V4.4 (Việc 3) — hiện cột "Tồn" bên cạnh ĐVT trong danh sách kết quả. */
  showStock?: boolean;
  /**
   * V4.4 (Việc 3) — hiện "+ Tạo vật tư mới" cuối danh sách; nhận lại chuỗi
   * đang gõ tìm kiếm để form cha prefill tên khi mở Sheet tạo nhanh.
   */
  onCreateNew?: (searchText: string) => void;
}

/**
 * ItemPicker — Popover search item (SKU / tên) dùng cho:
 *   - BOM parent_item_id
 *   - BOM line component_item_id
 *
 * Pattern: Popover trigger = read-only Input → content: search + list 8 items
 * max, hiển thị "SKU — Tên" với mono + regular.
 */
export function ItemPicker({
  value,
  onChange,
  placeholder = "Chọn vật tư...",
  allowClear = true,
  disabled,
  id,
  itemTypes,
  showStock,
  onCreateNew,
}: ItemPickerProps) {
  const [open, setOpen] = React.useState(false);
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q.trim()), 200);
    return () => clearTimeout(t);
  }, [q]);

  const query = useItemsList<ItemLike>({
    q: debouncedQ || undefined,
    type: itemTypes,
    pageSize: 20,
    page: 1,
    sort: "sku",
    active: true,
  });

  // V4.6 (QA PO_FLOW_E2E.md P3) — `useItemsList` giữ `placeholderData: prev
  // => prev` để tránh nháy UI khi đổi `debouncedQ` → trong lúc gõ NHANH ở
  // nhiều dòng liên tiếp (test + có thể người dùng thật dán nhiều dòng), danh
  // sách CŨ (của lần tìm trước) vẫn hiện VÀ bấm được trong khoảng ~200ms chờ
  // debounce + fetch của lần tìm MỚI — click rơi đúng lúc đó sẽ chốt nhầm kết
  // quả cũ. `query.isPlaceholderData` = true đúng trong khoảng này (dữ liệu
  // đang hiện CHƯA khớp `debouncedQ` hiện tại) → ẩn hẳn danh sách cũ, hiện
  // "Đang tải..." thay vì vẫn cho bấm, đảm bảo CHỈ chốt được kết quả của truy
  // vấn mới nhất của chính ô này.
  const resultsStale = query.isPlaceholderData;
  const rows = resultsStale ? [] : (query.data?.data ?? []);
  const showLoadingRow = query.isLoading || resultsStale;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 transition-colors dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50",
            "hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0 dark:hover:bg-zinc-800/60",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm text-zinc-700 dark:text-zinc-300">
                {value.sku}
              </span>
              <span className="truncate text-zinc-900 dark:text-zinc-50">{value.name}</span>
            </span>
          ) : (
            <span className="text-zinc-400 dark:text-zinc-500">{placeholder}</span>
          )}
          <span className="flex items-center gap-1">
            {value && allowClear && !disabled && (
              <span
                role="button"
                tabIndex={-1}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
                aria-label="Xoá lựa chọn"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
            <ChevronDown
              className="h-3.5 w-3.5 text-zinc-500 dark:text-zinc-400"
              aria-hidden="true"
            />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0 dark:bg-zinc-900 dark:border-zinc-700" align="start">
        <div className="border-b border-zinc-100 p-2 dark:border-zinc-800">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500"
              aria-hidden="true"
            />
            <Input
              size="sm"
              autoFocus
              placeholder="Tìm SKU hoặc tên..."
              className="h-8 w-full pl-7 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-50 dark:placeholder:text-zinc-500"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <ul className="max-h-72 overflow-auto p-1" role="listbox">
          {showLoadingRow && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Đang tải...
            </li>
          )}
          {!showLoadingRow && rows.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500 dark:text-zinc-400">
              Không có kết quả
            </li>
          )}
          {rows.map((r) => {
            const selected = value?.id === r.id;
            const stockQty = r.inventorySummary?.availableQty ?? r.availableQty ?? 0;
            return (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => {
                    onChange({
                      id: r.id,
                      sku: r.sku,
                      name: r.name,
                      uom: r.uom,
                    });
                    setOpen(false);
                    setQ("");
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-base transition-colors hover:bg-zinc-100 dark:hover:bg-zinc-800",
                    selected && "bg-blue-50 dark:bg-blue-950/40",
                  )}
                >
                  <span className="w-24 shrink-0 truncate font-mono text-sm text-zinc-700 dark:text-zinc-300">
                    {r.sku}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-900 dark:text-zinc-50">
                    {r.name}
                  </span>
                  {r.uom && (
                    <span className="text-xs text-zinc-400 dark:text-zinc-500">{r.uom}</span>
                  )}
                  {showStock && (
                    <span
                      className={cn(
                        "shrink-0 font-mono text-xs tabular-nums",
                        stockQty > 0
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-zinc-400 dark:text-zinc-500",
                      )}
                      title="Tồn khả dụng"
                    >
                      {formatQty(stockQty)}
                    </span>
                  )}
                  {selected && (
                    <Check
                      className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
        {onCreateNew && (
          <div className="border-t border-zinc-100 p-1 dark:border-zinc-800">
            <button
              type="button"
              onClick={() => {
                onCreateNew(q);
                setOpen(false);
              }}
              className="flex w-full items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-sm font-medium text-indigo-600 transition-colors hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo vật tư mới{q.trim() ? ` "${q.trim()}"` : ""}
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
