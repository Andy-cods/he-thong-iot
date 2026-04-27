"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { toast } from "sonner";
import { useItemsList } from "@/hooks/useItems";
import { useAddBomLine } from "@/hooks/useBom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface ItemRow {
  id: string;
  sku: string;
  name: string;
  type?: string;
  uom?: string;
}

export interface AddBomLineDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  /** Nếu set → dòng mới sẽ là con của group này. */
  parentLineId?: string | null;
}

export function AddBomLineDialog({
  open,
  onOpenChange,
  templateId,
  parentLineId,
}: AddBomLineDialogProps) {
  const [q, setQ] = React.useState("");
  const [debouncedQ, setDebouncedQ] = React.useState("");
  const [selected, setSelected] = React.useState<ItemRow | null>(null);
  const [qty, setQty] = React.useState("1");
  const [scrap, setScrap] = React.useState("0");

  React.useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  const itemsQuery = useItemsList<ItemRow>({
    q: debouncedQ || undefined,
    pageSize: 30,
    page: 1,
  });

  const items: ItemRow[] = React.useMemo(
    () =>
      ((itemsQuery.data as { data?: ItemRow[] } | undefined)?.data ?? []).map(
        (i) => ({
          id: i.id,
          sku: i.sku,
          name: i.name,
          type: i.type,
          uom: i.uom,
        }),
      ),
    [itemsQuery.data],
  );

  const addLine = useAddBomLine(templateId);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    const qtyNum = parseFloat(qty);
    if (!qtyNum || qtyNum <= 0) {
      toast.error("Số lượng phải lớn hơn 0");
      return;
    }
    await addLine.mutateAsync(
      {
        componentItemId: selected.id,
        qtyPerParent: qtyNum,
        scrapPercent: parseFloat(scrap) || 0,
        parentLineId: parentLineId ?? null,
        uom: selected.uom ?? undefined,
      },
      {
        onSuccess: () => {
          toast.success(`Đã thêm ${selected.sku} vào BOM.`);
          handleClose();
        },
        onError: (err) => {
          toast.error((err as Error).message ?? "Thêm dòng thất bại");
        },
      },
    );
  };

  const handleClose = () => {
    setQ("");
    setDebouncedQ("");
    setSelected(null);
    setQty("1");
    setScrap("0");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Thêm linh kiện vào BOM</DialogTitle>
        </DialogHeader>

        <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
          {/* Search item */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-zinc-700">
              Tìm linh kiện <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" aria-hidden />
              <input
                type="text"
                value={q}
                onChange={(e) => {
                  setQ(e.target.value);
                  setSelected(null);
                }}
                placeholder="Nhập mã hoặc tên linh kiện..."
                className="w-full rounded-md border border-zinc-200 bg-white py-1.5 pl-8 pr-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* Results list */}
            {(items.length > 0 || itemsQuery.isLoading) && !selected && (
              <div className="max-h-48 overflow-y-auto rounded-md border border-zinc-200 bg-white shadow-sm">
                {itemsQuery.isLoading && (
                  <div className="px-3 py-2 text-xs text-zinc-400">Đang tìm...</div>
                )}
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setQ(item.sku);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-indigo-50"
                  >
                    <span className="font-mono text-xs font-medium text-indigo-700 shrink-0">
                      {item.sku}
                    </span>
                    <span className="truncate text-zinc-700">{item.name}</span>
                    {item.uom && (
                      <span className="ml-auto shrink-0 text-[10px] text-zinc-400">
                        {item.uom}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* Selected badge */}
            {selected && (
              <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-2 ring-1 ring-indigo-200">
                <span className="font-mono text-xs font-semibold text-indigo-700">
                  {selected.sku}
                </span>
                <span className="truncate text-sm text-zinc-700">{selected.name}</span>
                <button
                  type="button"
                  onClick={() => { setSelected(null); setQ(""); }}
                  className="ml-auto text-xs text-zinc-400 hover:text-zinc-700"
                >
                  ✕
                </button>
              </div>
            )}
          </div>

          {/* Qty + Scrap */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700">
                SL/bộ <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min="0.001"
                step="any"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium text-zinc-700">
                Hao hụt (%)
              </label>
              <input
                type="number"
                min="0"
                max="100"
                step="0.1"
                value={scrap}
                onChange={(e) => setScrap(e.target.value)}
                className="rounded-md border border-zinc-200 bg-white px-3 py-1.5 text-right font-mono text-sm focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" size="sm" onClick={handleClose}>
              Huỷ
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={!selected || addLine.isPending}
              className={cn(!selected && "opacity-50")}
            >
              {addLine.isPending ? "Đang thêm..." : "Thêm vào BOM"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
