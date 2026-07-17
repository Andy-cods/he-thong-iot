"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2, Minus, Plus, Search, ArrowRightLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

/**
 * V3.7.4 — Bin actions: + thêm / - rút / chuyển bin.
 *
 * Tương tác trực tiếp với bin:
 *   - PLUS: chọn SKU + qty + lot (optional) → POST /adjust
 *   - MINUS: chọn lot trong bin + qty → POST /adjust
 *   - TRANSFER: chọn lot + bin đích + qty → POST /transfer
 *
 * Sau mutation: invalidate ["warehouse"] queries → 3D + drawer + stats refresh.
 */

interface BinContent {
  lotSerialId: string;
  lotCode: string | null;
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  qty: number;
  status: string;
}

interface BinNode {
  id: string;
  fullCode: string;
  isActive: boolean;
  capacity: string | null;
  totalQty: number;
}

export function BinActionsBar({
  bin,
  contents,
  allBins,
  onMutated,
}: {
  bin: BinNode;
  contents: BinContent[];
  allBins: BinNode[];
  onMutated: () => void;
}) {
  const [addOpen, setAddOpen] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState<BinContent | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = React.useState<BinContent | null>(
    null,
  );

  return (
    <>
      <div className="grid grid-cols-3 gap-2">
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="h-3.5 w-3.5" /> Thêm hàng
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={contents.length === 0}
          onClick={() => contents[0] && setRemoveTarget(contents[0])}
        >
          <Minus className="h-3.5 w-3.5" /> Rút hàng
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={contents.length === 0}
          onClick={() => contents[0] && setTransferTarget(contents[0])}
        >
          <ArrowRightLeft className="h-3.5 w-3.5" /> Chuyển
        </Button>
      </div>

      {addOpen && (
        <AddStockDialog
          bin={bin}
          onClose={() => setAddOpen(false)}
          onSuccess={() => {
            setAddOpen(false);
            onMutated();
          }}
        />
      )}

      {removeTarget && (
        <RemoveStockDialog
          bin={bin}
          contents={contents}
          initialLot={removeTarget}
          onClose={() => setRemoveTarget(null)}
          onSuccess={() => {
            setRemoveTarget(null);
            onMutated();
          }}
        />
      )}

      {transferTarget && (
        <TransferDialog
          bin={bin}
          contents={contents}
          initialLot={transferTarget}
          allBins={allBins}
          onClose={() => setTransferTarget(null)}
          onSuccess={() => {
            setTransferTarget(null);
            onMutated();
          }}
        />
      )}
    </>
  );
}

/* ============================================================ */
/* + ADD STOCK DIALOG                                           */
/* ============================================================ */

function AddStockDialog({
  bin,
  onClose,
  onSuccess,
}: {
  bin: BinNode;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [searchResults, setSearchResults] = React.useState<
    Array<{ id: string; sku: string; name: string; uom: string }>
  >([]);
  const [searching, setSearching] = React.useState(false);
  const [selectedItem, setSelectedItem] = React.useState<{
    id: string;
    sku: string;
    name: string;
    uom: string;
  } | null>(null);
  const [qty, setQty] = React.useState("");
  const [lotCode, setLotCode] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Search items
  React.useEffect(() => {
    const t = searchTerm.trim();
    if (t.length < 2) {
      setSearchResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/items?q=${encodeURIComponent(t)}&pageSize=8`,
        );
        const json = (await res.json()) as {
          data: Array<{ id: string; sku: string; name: string; uom: string }>;
        };
        if (!cancelled) setSearchResults(json.data ?? []);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  const handleSubmit = async () => {
    if (!selectedItem) {
      toast.error("Chọn SKU trước.");
      return;
    }
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/warehouse/bins/${bin.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedItem.id,
          qty: q,
          type: "PLUS",
          lotCode: lotCode.trim() || null,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json.error?.message ?? "Lỗi cập nhật");
        return;
      }
      toast.success(
        `Đã thêm ${q} ${selectedItem.uom} (${selectedItem.sku}) vào ${bin.fullCode}.`,
      );
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Thêm hàng vào{" "}
            <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
          </DialogTitle>
          <DialogDescription>
            Nhập SKU + số lượng. Sẽ tạo một lot mới (hoặc dùng lot có sẵn nếu nhập mã lot khớp).
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          {/* Item search */}
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Vật tư (SKU)
            </label>
            {!selectedItem ? (
              <>
                <div className="relative mt-1">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
                  <Input
                    autoFocus
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Tìm SKU hoặc tên (≥ 2 ký tự)…"
                    className="pl-8"
                  />
                </div>
                {searching && (
                  <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                    <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm…
                  </p>
                )}
                {searchResults.length > 0 && (
                  <ul className="mt-1 max-h-48 divide-y divide-zinc-100 overflow-auto rounded-md border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
                    {searchResults.map((r) => (
                      <li key={r.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItem(r);
                            setSearchTerm("");
                            setSearchResults([]);
                          }}
                          className="block w-full px-3 py-1.5 text-left text-sm hover:bg-zinc-50 dark:hover:bg-zinc-800/60"
                        >
                          <code className="font-mono text-xs font-semibold text-zinc-900 dark:text-zinc-50">
                            {r.sku}
                          </code>
                          <span className="ml-2 text-xs text-zinc-600 dark:text-zinc-400">
                            {r.name}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            ) : (
              <div className="mt-1 flex items-center justify-between rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2 dark:border-indigo-800 dark:bg-indigo-950/40">
                <div className="min-w-0">
                  <code className="font-mono text-sm font-semibold text-indigo-900 dark:text-indigo-300">
                    {selectedItem.sku}
                  </code>
                  <p className="truncate text-xs text-indigo-700 dark:text-indigo-400">
                    {selectedItem.name}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-xs text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
                >
                  Đổi
                </button>
              </div>
            )}
          </div>

          {/* Qty */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Số lượng
              </label>
              <Input
                type="number"
                min={0}
                step={0.0001}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="mt-1 text-right tabular-nums"
                placeholder="0"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Mã lô (tuỳ chọn)
              </label>
              <Input
                value={lotCode}
                onChange={(e) => setLotCode(e.target.value)}
                className="mt-1 font-mono"
                placeholder="LOT-..."
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Ghi chú (tuỳ chọn)
            </label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="VD: nhập từ tồn cũ, kiểm kho..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedItem || !qty || submitting}
            className="bg-emerald-600 hover:bg-emerald-700"
          >
            {submitting ? "Đang lưu…" : "Thêm vào bin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/* - REMOVE STOCK DIALOG                                        */
/* ============================================================ */

function RemoveStockDialog({
  bin,
  contents,
  initialLot,
  onClose,
  onSuccess,
}: {
  bin: BinNode;
  contents: BinContent[];
  initialLot: BinContent;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedLotId, setSelectedLotId] = React.useState(
    initialLot.lotSerialId,
  );
  const [qty, setQty] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const lot = contents.find((c) => c.lotSerialId === selectedLotId) ?? initialLot;

  const handleSubmit = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    if (q > lot.qty) {
      toast.error(`Tồn ${lot.qty} < yêu cầu rút ${q}.`);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/warehouse/bins/${bin.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: lot.itemId,
          qty: q,
          type: "MINUS",
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json.error?.message ?? "Lỗi cập nhật");
        return;
      }
      toast.success(`Đã rút ${q} ${lot.itemUom} khỏi ${bin.fullCode}.`);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Rút hàng khỏi{" "}
            <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
          </DialogTitle>
          <DialogDescription>
            Chọn lot và số lượng cần rút. Hệ thống tạo ADJUST_MINUS transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Lô / SKU trong bin
            </label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {contents.map((c) => (
                <option key={c.lotSerialId} value={c.lotSerialId}>
                  {c.itemSku} · {c.lotCode ?? "anon"} · tồn {c.qty}
                </option>
              ))}
            </select>
          </div>

          <div className="rounded-md bg-zinc-50 p-3 text-xs dark:bg-zinc-800">
            <div className="flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">SKU:</span>
              <code className="font-mono font-semibold">{lot.itemSku}</code>
            </div>
            <div className="mt-1 flex justify-between">
              <span className="text-zinc-500 dark:text-zinc-400">Tồn hiện tại:</span>
              <span className="font-semibold tabular-nums">
                {lot.qty.toLocaleString("vi-VN")} {lot.itemUom}
              </span>
            </div>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Số lượng rút
            </label>
            <Input
              type="number"
              min={0}
              max={lot.qty}
              step={0.0001}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 text-right tabular-nums"
              placeholder="0"
            />
            <button
              type="button"
              className="mt-1 text-xs text-indigo-600 hover:underline dark:text-indigo-400"
              onClick={() => setQty(String(lot.qty))}
            >
              Rút hết ({lot.qty})
            </button>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Ghi chú</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="VD: hỏng, mất, kiểm kho lệch..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!qty || submitting}
            className="bg-rose-600 hover:bg-rose-700"
          >
            {submitting ? "Đang rút…" : "Rút khỏi bin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/* TRANSFER DIALOG                                              */
/* ============================================================ */

function TransferDialog({
  bin,
  contents,
  initialLot,
  allBins,
  onClose,
  onSuccess,
}: {
  bin: BinNode;
  contents: BinContent[];
  initialLot: BinContent;
  allBins: BinNode[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedLotId, setSelectedLotId] = React.useState(
    initialLot.lotSerialId,
  );
  const [toBinId, setToBinId] = React.useState("");
  const [qty, setQty] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const lot = contents.find((c) => c.lotSerialId === selectedLotId) ?? initialLot;
  const targetOptions = allBins.filter((b) => b.id !== bin.id && b.isActive);

  const handleSubmit = async () => {
    const q = Number(qty);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    if (q > lot.qty) {
      toast.error(`Tồn ${lot.qty} < yêu cầu chuyển ${q}.`);
      return;
    }
    if (!toBinId) {
      toast.error("Chọn bin đích.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/warehouse/bins/${bin.id}/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lotSerialId: lot.lotSerialId,
          itemId: lot.itemId,
          toBinId,
          qty: q,
          notes: notes.trim() || null,
        }),
      });
      const json = (await res.json()) as { error?: { message?: string } };
      if (!res.ok) {
        toast.error(json.error?.message ?? "Lỗi chuyển bin");
        return;
      }
      const toCode = allBins.find((b) => b.id === toBinId)?.fullCode ?? "?";
      toast.success(`Đã chuyển ${q} ${lot.itemUom} → ${toCode}.`);
      onSuccess();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>
            Chuyển hàng từ{" "}
            <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
          </DialogTitle>
          <DialogDescription>
            Chọn lot, bin đích và số lượng. Hệ thống tạo TRANSFER transaction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Lô / SKU
            </label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {contents.map((c) => (
                <option key={c.lotSerialId} value={c.lotSerialId}>
                  {c.itemSku} · {c.lotCode ?? "anon"} · tồn {c.qty}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Bin đích
            </label>
            <select
              value={toBinId}
              onChange={(e) => setToBinId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              <option value="">— Chọn bin —</option>
              {targetOptions.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.fullCode}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Số lượng chuyển (tối đa {lot.qty})
            </label>
            <Input
              type="number"
              min={0}
              max={lot.qty}
              step={0.0001}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="mt-1 text-right tabular-nums"
              placeholder="0"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">Ghi chú</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1"
              placeholder="Lý do chuyển..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!qty || !toBinId || submitting}
          >
            {submitting ? "Đang chuyển…" : "Chuyển"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ============================================================ */
/* useBinMutationRefresh — invalidate queries sau mutation       */
/* ============================================================ */

export function useBinMutationRefresh() {
  const qc = useQueryClient();
  return React.useCallback(() => {
    void qc.invalidateQueries({ queryKey: ["warehouse"] });
  }, [qc]);
}

