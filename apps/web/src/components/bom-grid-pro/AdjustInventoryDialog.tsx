"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, PackagePlus, PackageMinus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

/**
 * V3.7.53 — Dialog điều chỉnh tồn kho từ BOM list popover (cho role warehouse).
 *
 * Flow:
 *   1. Chọn loại (PLUS / MINUS) — mặc định PLUS để bổ sung tồn vào kho
 *   2. Chọn bin (kệ-tầng-ô) từ /api/warehouse/layout
 *   3. Nhập qty + lot code (optional) + ghi chú
 *   4. POST /api/warehouse/bins/{binId}/adjust
 *   5. Invalidate queries để các tab kho cập nhật ngay
 *
 * Đồng bộ: Sơ đồ kho · Vật tư · Báo cáo kho cùng dùng inventory_txn ledger →
 * sau adjust, tất cả module kho tự refresh khi cache invalidate.
 */

interface BinRow {
  id: string;
  fullCode: string | null;
  area: string | null;
  rack: string | null;
  levelNo: number | null;
  position: string | null;
  zone: string | null;
  binCode: string | null;
  isActive: boolean;
  totalQty?: number;
  capacity?: number | null;
}

interface LayoutResponse {
  data: {
    bins: BinRow[];
    stats?: unknown;
  };
}

export interface AdjustInventoryDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  itemId: string;
  itemSku: string;
  itemName: string;
  /** Callback gọi khi adjust thành công (đóng popover ngoài, refresh data, ...) */
  onSuccess?: () => void;
}

type AdjustType = "PLUS" | "MINUS";

export function AdjustInventoryDialog({
  open,
  onOpenChange,
  itemId,
  itemSku,
  itemName,
  onSuccess,
}: AdjustInventoryDialogProps) {
  const qc = useQueryClient();
  const [type, setType] = React.useState<AdjustType>("PLUS");
  const [binId, setBinId] = React.useState<string>("");
  const [qty, setQty] = React.useState<string>("1");
  const [lotCode, setLotCode] = React.useState<string>("");
  const [notes, setNotes] = React.useState<string>("");
  const [error, setError] = React.useState<string | null>(null);

  // Reset state khi dialog open
  React.useEffect(() => {
    if (open) {
      setType("PLUS");
      setBinId("");
      setQty("1");
      setLotCode("");
      setNotes("");
      setError(null);
    }
  }, [open]);

  // Load danh sách bins
  const binsQuery = useQuery<LayoutResponse>({
    queryKey: ["warehouse", "layout", "bins-for-adjust"],
    queryFn: async () => {
      const res = await fetch("/api/warehouse/layout", {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được danh sách kệ");
      return (await res.json()) as LayoutResponse;
    },
    enabled: open,
    staleTime: 30_000,
  });

  const bins = React.useMemo(() => {
    const list = binsQuery.data?.data.bins ?? [];
    return list
      .filter((b) => b.isActive)
      .sort((a, b) => (a.fullCode ?? "").localeCompare(b.fullCode ?? ""));
  }, [binsQuery.data]);

  // Group theo rack để dễ chọn
  const binGroups = React.useMemo(() => {
    const map = new Map<string, BinRow[]>();
    for (const b of bins) {
      const key = `${b.area ?? "-"}-${b.rack ?? "-"}`;
      const arr = map.get(key) ?? [];
      arr.push(b);
      map.set(key, arr);
    }
    return Array.from(map.entries()).map(([k, list]) => ({ key: k, list }));
  }, [bins]);

  const adjustMutation = useMutation({
    mutationFn: async (payload: {
      binId: string;
      itemId: string;
      qty: number;
      type: AdjustType;
      lotCode?: string;
      notes?: string;
    }) => {
      const res = await fetch(
        `/api/warehouse/bins/${payload.binId}/adjust`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            itemId: payload.itemId,
            qty: payload.qty,
            type: payload.type,
            lotCode: payload.lotCode || undefined,
            notes: payload.notes || undefined,
          }),
        },
      );
      const body = (await res.json().catch(() => ({}))) as {
        data?: { txnId: string; lotSerialId: string };
        error?: { message?: string; code?: string };
      };
      if (!res.ok) {
        throw new Error(
          body.error?.message ?? `HTTP ${res.status} — adjust failed`,
        );
      }
      return body.data!;
    },
    onSuccess: () => {
      // V3.7.53 — invalidate tất cả query liên quan để 4 module đồng bộ:
      // 1. InventoryPopover (BOM list)
      qc.invalidateQueries({ queryKey: ["inventory-summary", itemId] });
      // 2. Sơ đồ kho (warehouse layout)
      qc.invalidateQueries({ queryKey: ["warehouse", "layout"] });
      // 3. Vật tư (item list + bin inventory)
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["lot-serial"] });
      qc.invalidateQueries({ queryKey: ["inventory"] });
      // 4. Báo cáo kho
      qc.invalidateQueries({ queryKey: ["warehouse", "report"] });
      // 5. BOM derived status (KPI cards trên BOM grid)
      qc.invalidateQueries({ queryKey: ["bom"] });
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setError("Số lượng phải > 0");
      return;
    }
    if (!binId) {
      setError("Vui lòng chọn ô kệ");
      return;
    }

    try {
      const result = await adjustMutation.mutateAsync({
        binId,
        itemId,
        qty: qtyNum,
        type,
        lotCode: lotCode.trim() || undefined,
        notes: notes.trim() || undefined,
      });
      const verb = type === "PLUS" ? "bổ sung" : "giảm";
      toast.success(`Đã ${verb} ${qtyNum} ${itemSku} vào kho`, {
        description: `Lot ID: ${result.lotSerialId.slice(0, 8)}…`,
      });
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      const msg = (err as Error).message ?? "Adjust thất bại";
      setError(msg);
    }
  };

  const pending = adjustMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Điều chỉnh tồn kho — {itemSku}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            {itemName} · ghi nhận trực tiếp vào sổ kho (inventory_txn).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type toggle */}
          <div className="space-y-1">
            <Label>Loại điều chỉnh</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setType("PLUS")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors",
                  type === "PLUS"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                )}
              >
                <PackagePlus className="h-4 w-4" /> Bổ sung tồn
              </button>
              <button
                type="button"
                onClick={() => setType("MINUS")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-md border-2 px-3 py-2 text-sm font-medium transition-colors",
                  type === "MINUS"
                    ? "border-rose-500 bg-rose-50 text-rose-700"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                )}
              >
                <PackageMinus className="h-4 w-4" /> Giảm tồn
              </button>
            </div>
          </div>

          {/* Bin select */}
          <div className="space-y-1">
            <Label htmlFor="adjust-bin" required>
              Ô kệ
            </Label>
            <select
              id="adjust-bin"
              value={binId}
              onChange={(e) => setBinId(e.target.value)}
              disabled={binsQuery.isLoading}
              className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] focus:border-indigo-500 focus:outline-none"
              required
            >
              <option value="">
                {binsQuery.isLoading
                  ? "Đang tải kệ…"
                  : `Chọn kệ (${bins.length} ô khả dụng)`}
              </option>
              {binGroups.map((g) => (
                <optgroup key={g.key} label={`Khu ${g.key}`}>
                  {g.list.map((b) => {
                    const code = b.fullCode ?? b.binCode ?? b.id.slice(0, 8);
                    const stock =
                      b.totalQty != null && b.totalQty > 0
                        ? ` (đang có ${b.totalQty})`
                        : "";
                    return (
                      <option key={b.id} value={b.id}>
                        {code}
                        {stock}
                      </option>
                    );
                  })}
                </optgroup>
              ))}
            </select>
          </div>

          {/* Qty + Lot grid */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="adjust-qty" required>
                Số lượng
              </Label>
              <Input
                id="adjust-qty"
                type="number"
                step="0.001"
                min="0.001"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                placeholder="VD: 100"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="adjust-lot">Mã lot (tùy chọn)</Label>
              <Input
                id="adjust-lot"
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                placeholder="LOT-2026-A01"
                disabled={type === "MINUS"}
                className="font-mono text-xs"
              />
              {type === "MINUS" ? (
                <p className="text-[10px] text-zinc-400">
                  MINUS: tự pick lot trong ô có sẵn.
                </p>
              ) : null}
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-1">
            <Label htmlFor="adjust-notes">Ghi chú</Label>
            <Textarea
              id="adjust-notes"
              rows={2}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="VD: Kiểm kê thực tế cuối tháng / Bổ sung từ kho khác"
            />
          </div>

          {/* Error message */}
          {error ? (
            <div className="rounded-md bg-rose-50 px-3 py-2 text-xs text-rose-700 ring-1 ring-rose-200">
              {error}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={pending || !binId}
              className={cn(
                type === "PLUS"
                  ? "bg-emerald-600 hover:bg-emerald-700"
                  : "bg-rose-600 hover:bg-rose-700",
              )}
            >
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : type === "PLUS" ? (
                <PackagePlus className="h-3.5 w-3.5" />
              ) : (
                <PackageMinus className="h-3.5 w-3.5" />
              )}
              {type === "PLUS" ? "Bổ sung tồn" : "Giảm tồn"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
