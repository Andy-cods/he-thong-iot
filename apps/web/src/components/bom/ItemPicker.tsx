"use client";

import * as React from "react";
import { Check, ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useItemsList } from "@/hooks/useItems";
import { cn } from "@/lib/utils";

interface ItemLike {
  id: string;
  sku: string;
  name: string;
  uom?: string;
  itemType?: string;
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

  const rows = query.data?.data ?? [];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild disabled={disabled}>
        <button
          id={id}
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          className={cn(
            "inline-flex h-9 w-full items-center justify-between rounded-md border border-zinc-300 bg-white px-3 text-base text-zinc-900 transition-colors",
            "hover:bg-zinc-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0",
            disabled && "cursor-not-allowed opacity-60",
          )}
        >
          {value ? (
            <span className="flex min-w-0 items-center gap-2">
              <span className="font-mono text-sm text-zinc-700">
                {value.sku}
              </span>
              <span className="truncate text-zinc-900">{value.name}</span>
            </span>
          ) : (
            <span className="text-zinc-400">{placeholder}</span>
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
                className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
                aria-label="Xoá lựa chọn"
              >
                <X className="h-3 w-3" aria-hidden="true" />
              </span>
            )}
            <ChevronDown
              className="h-3.5 w-3.5 text-zinc-500"
              aria-hidden="true"
            />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[360px] p-0" align="start">
        <div className="border-b border-zinc-100 p-2">
          <div className="relative">
            <Search
              className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
              aria-hidden="true"
            />
            <Input
              size="sm"
              autoFocus
              placeholder="Tìm SKU hoặc tên..."
              className="h-8 w-full pl-7"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </div>
        </div>
        <ul className="max-h-72 overflow-auto p-1" role="listbox">
          {query.isLoading && rows.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500">
              Đang tải...
            </li>
          )}
          {!query.isLoading && rows.length === 0 && (
            <li className="px-2 py-4 text-center text-sm text-zinc-500">
              Không có kết quả
            </li>
          )}
          {rows.map((r) => {
            const selected = value?.id === r.id;
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
                    "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-base transition-colors hover:bg-zinc-100",
                    selected && "bg-blue-50",
                  )}
                >
                  <span className="w-24 shrink-0 truncate font-mono text-sm text-zinc-700">
                    {r.sku}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-zinc-900">
                    {r.name}
                  </span>
                  {r.uom && (
                    <span className="text-xs text-zinc-400">{r.uom}</span>
                  )}
                  {selected && (
                    <Check
                      className="h-3.5 w-3.5 text-indigo-600"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
