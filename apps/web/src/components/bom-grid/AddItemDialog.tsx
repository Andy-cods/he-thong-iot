"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Command as CommandPrimitive } from "cmdk";
import { Factory, Package, Search, ShoppingCart, X } from "lucide-react";
import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { cn } from "@/lib/utils";

/**
 * V1.5 Trụ cột 2 — "Thêm linh kiện từ master" dialog.
 *
 * - Mở bằng nút toolbar "+ Thêm linh kiện" hoặc hotkey `Ctrl+Shift+A`.
 * - Search /api/items?q={term}&pageSize=20, debounce 200ms.
 * - Pick 1 item → gọi `onSelect(item)` → parent insert row vào Grid.
 * - Keyboard: ↑↓ di chuyển, Enter chọn, Esc đóng.
 */

export interface MasterItem {
  id: string;
  sku: string;
  name: string;
  itemType: string;
  category: string | null;
  uom: string;
}

interface ApiResponse {
  data: MasterItem[];
  meta: { total: number };
}

export interface AddItemDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (item: MasterItem) => void;
}

export function AddItemDialog({
  open,
  onOpenChange,
  onSelect,
}: AddItemDialogProps) {
  const [rawQuery, setRawQuery] = React.useState("");
  const [debouncedQuery, setDebouncedQuery] = React.useState("");

  // Debounce 200ms
  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(rawQuery.trim()), 200);
    return () => clearTimeout(t);
  }, [rawQuery]);

  // Reset khi đóng
  React.useEffect(() => {
    if (!open) {
      setRawQuery("");
      setDebouncedQuery("");
    }
  }, [open]);

  const query = useQuery<ApiResponse>({
    queryKey: ["items-search", debouncedQuery],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (debouncedQuery) p.set("q", debouncedQuery);
      p.set("pageSize", "20");
      const res = await fetch(`/api/items?${p.toString()}`);
      if (!res.ok) throw new Error("Không tải được danh sách linh kiện");
      return (await res.json()) as ApiResponse;
    },
    enabled: open,
    placeholderData: keepPreviousData,
    staleTime: 30_000,
  });

  const items = query.data?.data ?? [];

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-sm" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-2xl">
          <Dialog.Title className="sr-only">Thêm linh kiện từ danh mục</Dialog.Title>
          <Dialog.Description className="sr-only">
            Tìm linh kiện từ danh mục vật tư của xưởng và thêm vào BOM
          </Dialog.Description>

          <CommandPrimitive
            shouldFilter={false}
            className="flex flex-col"
            loop
          >
            <div className="flex items-center border-b border-zinc-200 px-4 py-3">
              <Search className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />
              <CommandPrimitive.Input
                autoFocus
                value={rawQuery}
                onValueChange={setRawQuery}
                placeholder="Tìm linh kiện theo mã SKU hoặc tên…"
                className="flex-1 bg-transparent px-3 text-base text-zinc-900 outline-none placeholder:text-zinc-400"
              />
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
                aria-label="Đóng"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <CommandPrimitive.List className="max-h-[400px] overflow-y-auto p-2">
              {query.isLoading ? (
                <div className="px-3 py-6 text-center text-sm text-zinc-500">
                  Đang tải…
                </div>
              ) : query.isError ? (
                <div className="px-3 py-6 text-center text-sm text-red-600">
                  Lỗi khi tải danh sách.
                </div>
              ) : items.length === 0 ? (
                <CommandPrimitive.Empty className="px-3 py-6 text-center text-sm text-zinc-500">
                  {debouncedQuery
                    ? `Không tìm thấy "${debouncedQuery}".`
                    : "Gõ để tìm linh kiện…"}
                </CommandPrimitive.Empty>
              ) : (
                <CommandPrimitive.Group heading="Kết quả">
                  {items.map((item) => (
                    <CommandPrimitive.Item
                      key={item.id}
                      value={`${item.sku} ${item.name}`}
                      onSelect={() => {
                        onSelect(item);
                        onOpenChange(false);
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-sm",
                        "aria-selected:bg-zinc-100",
                      )}
                    >
                      <ItemTypeIcon type={item.itemType} />
                      <div className="flex flex-1 items-baseline gap-2 truncate">
                        <span className="font-mono text-xs font-medium text-zinc-900">
                          {item.sku}
                        </span>
                        <span className="truncate text-zinc-700">
                          {item.name}
                        </span>
                      </div>
                      <span className="shrink-0 text-xs text-zinc-500">
                        {item.category ?? "—"} · {item.uom}
                      </span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}
            </CommandPrimitive.List>

            <footer className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50 px-4 py-2 text-xs text-zinc-500">
              <span>
                ↑↓ di chuyển · Enter chọn · Esc đóng
              </span>
              <span>
                {items.length > 0
                  ? `${items.length} / ${query.data?.meta.total ?? 0}`
                  : ""}
              </span>
            </footer>
          </CommandPrimitive>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function ItemTypeIcon({ type }: { type: string }) {
  const upper = type.toUpperCase();
  if (upper === "FABRICATED" || upper === "SUB_ASSEMBLY") {
    return (
      <Factory
        className="h-4 w-4 shrink-0 text-emerald-600"
        aria-label="Gia công"
      />
    );
  }
  if (upper === "PURCHASED" || upper === "RAW" || upper === "CONSUMABLE") {
    return (
      <ShoppingCart
        className="h-4 w-4 shrink-0 text-blue-600"
        aria-label="Thương mại"
      />
    );
  }
  return <Package className="h-4 w-4 shrink-0 text-zinc-400" aria-hidden />;
}
