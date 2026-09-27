"use client";

import * as React from "react";
import { Plus, Search, Trash2 } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { formatMoney, formatUom } from "@/lib/format";
import { PO_VAT_RATES } from "@/lib/procurement-policy";
import { cn } from "@/lib/utils";
import { parseTaxRate, type EditableLine } from "./types";

/**
 * V4.1 PO-UI: sửa dòng PO NHÁP (thêm / xoá vật tư, SL, giá, VAT). Lưu cùng
 * phần đầu PO bằng nút "Lưu thay đổi" ở đầu trang (PATCH /api/purchase-orders/[id]).
 * Người không có quyền giá (Kế hoạch…) thấy ô giá chỉ đọc.
 */

interface ItemSearch {
  id: string;
  sku: string;
  name: string;
  uom?: string;
}

const inputCls =
  "h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-right text-sm tabular-nums focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 read-only:bg-zinc-100 read-only:text-zinc-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:read-only:bg-zinc-800";

export function PoDraftLinesEditor({
  lines,
  onChange,
  canPrice,
}: {
  lines: EditableLine[];
  onChange: React.Dispatch<React.SetStateAction<EditableLine[]>>;
  canPrice: boolean;
}) {
  const [searchOpen, setSearchOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(search), 300);
    return () => clearTimeout(t);
  }, [search]);

  const itemsQuery = useQuery({
    queryKey: ["items-search", debouncedQ],
    queryFn: async () => {
      const res = await fetch(`/api/items?q=${encodeURIComponent(debouncedQ)}&pageSize=15`, { credentials: "include" });
      // V4.1 UI-05: kèm mã HTTP để khối lỗi báo đúng.
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { status: res.status });
      return res.json() as Promise<{ data: ItemSearch[] }>;
    },
    enabled: searchOpen && debouncedQ.length >= 1,
    staleTime: 30_000,
  });

  const addItem = (it: ItemSearch) => {
    if (lines.find((l) => l.itemId === it.id)) {
      toast.info("Linh kiện này đã có");
      return;
    }
    onChange((prev) => [
      ...prev,
      {
        itemId: it.id,
        sku: it.sku,
        itemName: it.name,
        uom: it.uom,
        orderedQty: "1",
        unitPrice: "0",
        taxRate: "8",
        notes: "",
        snapshotLineId: null,
        spec: null,
        expectedEta: null,
      },
    ]);
    setSearch("");
    setSearchOpen(false);
  };

  const update = (idx: number, patch: Partial<EditableLine>) =>
    onChange((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  const remove = (idx: number) => onChange((prev) => prev.filter((_, i) => i !== idx));

  let subtotal = 0;
  let vat = 0;
  for (const l of lines) {
    const pre = (Number(l.orderedQty) || 0) * (Number(l.unitPrice) || 0);
    subtotal += pre;
    vat += (pre * parseTaxRate(l.taxRate)) / 100;
  }

  return (
    <section
      aria-label="Sửa dòng hàng"
      className="min-w-0 overflow-hidden rounded-lg border border-indigo-200 bg-white dark:border-indigo-900 dark:bg-zinc-900"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 px-4 py-2 dark:border-zinc-800">
        <h2 className="text-sm font-semibold text-zinc-900 dark:text-zinc-50">
          Sửa dòng hàng <span className="font-normal text-zinc-500 dark:text-zinc-400">({lines.length})</span>
        </h2>
        <Button size="sm" variant="outline" onClick={() => setSearchOpen((v) => !v)}>
          <Plus className="h-3.5 w-3.5" /> Thêm dòng
        </Button>
      </div>

      {searchOpen && (
        <div className="border-b border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-800 dark:bg-zinc-800/30">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setSearchOpen(false);
              }}
              placeholder="Tìm mã hoặc tên vật tư…"
              autoFocus
              className="h-9 w-full rounded-md border border-zinc-300 bg-white pl-8 pr-3 text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            />
          </div>
          {debouncedQ && (
            <div className="mt-2 max-h-60 overflow-y-auto rounded-md border border-zinc-200 bg-white dark:border-zinc-700 dark:bg-zinc-900">
              {itemsQuery.isLoading ? (
                <p className="px-3 py-3 text-center text-xs text-zinc-500">Đang tìm…</p>
              ) : itemsQuery.isError && !itemsQuery.data ? (
                <QueryError
                  compact
                  className="m-2"
                  error={itemsQuery.error}
                  onRetry={() => void itemsQuery.refetch()}
                  retrying={itemsQuery.isFetching}
                  title="Không tìm được vật tư"
                />
              ) : (itemsQuery.data?.data ?? []).length === 0 ? (
                <p className="px-3 py-3 text-center text-xs text-zinc-500">Không tìm thấy</p>
              ) : (
                <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {(itemsQuery.data?.data ?? []).map((it) => (
                    <li key={it.id}>
                      <button
                        type="button"
                        onClick={() => addItem(it)}
                        className="flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
                      >
                        <span className="font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">{it.sku}</span>
                        <span className="flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">{it.name}</span>
                        <Plus className="h-3.5 w-3.5 text-zinc-400" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}

      {lines.length === 0 ? (
        <p className="px-4 py-8 text-center text-sm text-zinc-500">PO cần ít nhất 1 dòng — bấm “Thêm dòng”.</p>
      ) : (
        <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
          {lines.map((l, i) => {
            const qty = Number(l.orderedQty) || 0;
            const pre = qty * (Number(l.unitPrice) || 0);
            return (
              <li
                key={l.itemId}
                className="grid grid-cols-2 items-end gap-2 px-4 py-2.5 sm:grid-cols-[minmax(0,1fr)_5.5rem_8.5rem_5rem_7.5rem_2rem]"
              >
                <div className="col-span-2 min-w-0 sm:col-span-1">
                  <p className="truncate font-mono text-xs font-medium text-zinc-900 dark:text-zinc-100">
                    {i + 1}. {l.sku}
                  </p>
                  <p className="truncate text-sm text-zinc-700 dark:text-zinc-300" title={l.itemName}>
                    {l.itemName}
                    {l.uom ? <span className="text-xs text-zinc-500"> · {formatUom(l.uom)}</span> : null}
                  </p>
                </div>
                <label className="text-xs text-zinc-500 dark:text-zinc-400">
                  SL đặt
                  <input
                    type="number"
                    min="0.01"
                    step="any"
                    value={l.orderedQty}
                    onChange={(e) => update(i, { orderedQty: e.target.value })}
                    className={cn(inputCls, "mt-0.5")}
                  />
                </label>
                <label className="text-xs text-zinc-500 dark:text-zinc-400">
                  Đơn giá
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={l.unitPrice}
                    onChange={(e) => update(i, { unitPrice: e.target.value })}
                    readOnly={!canPrice}
                    title={canPrice ? undefined : "Chỉ Thu mua / Giám đốc sửa đơn giá"}
                    className={cn(inputCls, "mt-0.5")}
                  />
                </label>
                <label className="text-xs text-zinc-500 dark:text-zinc-400">
                  VAT
                  <select
                    value={l.taxRate}
                    onChange={(e) => update(i, { taxRate: e.target.value })}
                    disabled={!canPrice}
                    className={cn(inputCls, "mt-0.5 px-1 disabled:bg-zinc-100 disabled:text-zinc-500 dark:disabled:bg-zinc-800")}
                  >
                    {Array.from(new Set([...PO_VAT_RATES, parseTaxRate(l.taxRate)]))
                      .sort((a, b) => a - b)
                      .map((r) => (
                        <option key={r} value={String(r)}>
                          {r}%
                        </option>
                      ))}
                  </select>
                </label>
                <div className="text-right text-xs text-zinc-500 dark:text-zinc-400">
                  Thành tiền
                  <p className="h-8 pt-1.5 text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100">
                    {formatMoney(pre, { unit: "none" })}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => remove(i)}
                  aria-label={`Xoá dòng ${i + 1}`}
                  title="Xoá dòng"
                  className="inline-flex h-8 w-8 items-center justify-center justify-self-end rounded-md text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/40 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <div className="border-t border-zinc-200 bg-zinc-50/60 px-4 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/30">
        <dl className="ml-auto grid w-full max-w-xs grid-cols-[1fr_auto] gap-x-6 gap-y-0.5 text-sm">
          <dt className="text-zinc-500 dark:text-zinc-400">Tạm tính</dt>
          <dd className="text-right tabular-nums">{formatMoney(subtotal)}</dd>
          <dt className="text-zinc-500 dark:text-zinc-400">Thuế VAT</dt>
          <dd className="text-right tabular-nums">{formatMoney(vat)}</dd>
          <dt className="font-semibold">Tổng cộng</dt>
          <dd className="text-right font-semibold tabular-nums">{formatMoney(subtotal + vat)}</dd>
        </dl>
      </div>
    </section>
  );
}
