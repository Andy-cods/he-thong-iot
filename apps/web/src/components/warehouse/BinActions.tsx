"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowDownToLine,
  ArrowRightLeft,
  ArrowUpFromLine,
  Loader2,
  Minus,
  Plus,
  Search,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { BinSuggestCombobox } from "@/components/warehouse/BinSuggestCombobox";

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

export interface BinContent {
  lotSerialId: string;
  lotCode: string | null;
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  qty: number;
  status: string;
}

export interface BinNode {
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
  const [mode, setMode] = React.useState<BinQuickMode>("in");
  const [addOpen, setAddOpen] = React.useState(false);
  const [transferTarget, setTransferTarget] = React.useState<BinContent | null>(
    null,
  );
  const [removeTarget, setRemoveTarget] = React.useState<BinContent | null>(
    null,
  );

  return (
    <>
      {/* Segmented control Nhập ⇄ Xuất — dùng chung Tabs variant="segmented"
          (N7/A12), nhất quán với MovementTab + popover sơ đồ kho. */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as BinQuickMode)}>
        <TabsList variant="segmented" aria-label="Chế độ Nhập/Xuất tại vị trí" className="mb-2 w-full">
          <TabsTrigger value="in" className="flex-1 gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> Nhập
          </TabsTrigger>
          <TabsTrigger value="out" className="flex-1 gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden /> Xuất
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "in" ? (
        <Button
          size="sm"
          onClick={() => setAddOpen(true)}
          className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        >
          {/* V4.4 A7 — "bin" tiếng Anh → "ô/kệ". */}
          <Plus className="h-3.5 w-3.5" /> Thêm hàng vào ô/kệ
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
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
      )}

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
/* PHASE E — QUICK ACTIONS POPOVER (thao tác nhanh tại bin)     */
/* ============================================================ */

export type BinQuickMode = "in" | "out";

/**
 * Phase E — bản compact của `BinActionsBar` dùng trong popover mini mở từ
 * sơ đồ kho (click-phải / long-press 1 ô bin). Dùng cùng segmented control
 * Nhập ⇄ Xuất như `MovementTab` để nhất quán trải nghiệm, nhưng tái dùng
 * 100% dialog + API sẵn có (`AddStockDialog`/`RemoveStockDialog`/`TransferDialog`)
 * — không viết API mới.
 */
export function BinQuickActionsPopover({
  bin,
  contents,
  contentsLoading,
  allBins,
  onMutated,
  onViewDetail,
}: {
  bin: BinNode;
  contents: BinContent[];
  contentsLoading?: boolean;
  allBins: BinNode[];
  onMutated: () => void;
  onViewDetail: () => void;
}) {
  const [mode, setMode] = React.useState<BinQuickMode>("in");
  const [addOpen, setAddOpen] = React.useState(false);
  const [removeTarget, setRemoveTarget] = React.useState<BinContent | null>(null);
  const [transferTarget, setTransferTarget] = React.useState<BinContent | null>(null);

  // V4.5 QA-B P2: cảnh báo quá tải rõ ràng (không chỉ dựa vào số thô) — cùng
  // ngưỡng với thẻ ô kệ/sơ đồ kho (WarehouseLayout3D.getBinTheme).
  const cap = bin.capacity ? Number(bin.capacity) : 0;
  const isOverloaded = cap > 0 && bin.totalQty > cap;
  const overloadPct = cap > 0 ? Math.round((bin.totalQty / cap) * 100) : 0;

  return (
    <div className="w-72">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <p className="text-xs uppercase tracking-wider text-zinc-500 dark:text-zinc-400">Thao tác nhanh</p>
          <p className="font-mono text-sm font-bold text-zinc-900 dark:text-zinc-50">{bin.fullCode}</p>
        </div>
        <div className="text-right">
          <p
            className={cn(
              "font-mono text-base font-bold tabular-nums",
              isOverloaded ? "text-rose-600 dark:text-rose-400" : "text-zinc-900 dark:text-zinc-50",
            )}
          >
            {formatQty(bin.totalQty)}
            <span className="ml-1 text-xs font-normal text-zinc-400 dark:text-zinc-500">
              / {bin.capacity ? formatQty(Number(bin.capacity)) : "—"}
            </span>
          </p>
          {isOverloaded ? (
            <p className="text-xs font-semibold text-rose-600 dark:text-rose-400">
              Quá tải · {overloadPct}%
            </p>
          ) : (
            <p className="text-xs text-zinc-500 dark:text-zinc-400">tồn / sức chứa</p>
          )}
        </div>
      </div>

      {/* Segmented control Nhập ⇄ Xuất — dùng chung Tabs variant="segmented" (N7/A12), nhất quán với MovementTab */}
      <Tabs value={mode} onValueChange={(v) => setMode(v as BinQuickMode)}>
        <TabsList variant="segmented" aria-label="Chế độ Nhập/Xuất tại vị trí" className="mb-3 w-full">
          <TabsTrigger value="in" className="flex-1 gap-1.5">
            <ArrowDownToLine className="h-3.5 w-3.5" aria-hidden /> Nhập
          </TabsTrigger>
          <TabsTrigger value="out" className="flex-1 gap-1.5">
            <ArrowUpFromLine className="h-3.5 w-3.5" aria-hidden /> Xuất
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === "in" ? (
        <Button
          size="sm"
          className="w-full bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          onClick={() => setAddOpen(true)}
        >
          {/* V4.4 A7 — "bin" tiếng Anh → "ô/kệ". */}
          <Plus className="h-3.5 w-3.5" /> Thêm hàng vào ô/kệ
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button
            size="sm"
            variant="outline"
            disabled={contentsLoading || contents.length === 0}
            onClick={() => contents[0] && setRemoveTarget(contents[0])}
          >
            <Minus className="h-3.5 w-3.5" /> Rút hàng
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={contentsLoading || contents.length === 0}
            onClick={() => contents[0] && setTransferTarget(contents[0])}
          >
            <ArrowRightLeft className="h-3.5 w-3.5" /> Chuyển
          </Button>
        </div>
      )}

      {mode === "out" && !contentsLoading && contents.length === 0 && (
        <p className="mt-2 text-center text-xs text-zinc-500 dark:text-zinc-400">Ô kệ đang trống, không có gì để rút.</p>
      )}
      {contentsLoading && (
        <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải nội dung bin…
        </p>
      )}

      <button
        type="button"
        onClick={onViewDetail}
        className="mt-3 w-full text-center text-xs font-semibold text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Xem chi tiết đầy đủ →
      </button>

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
    </div>
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
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={
            <>
              Thêm hàng vào{" "}
              <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
            </>
          }
          onCancel={onClose}
        />
        <SheetBody className="space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Nhập SKU + số lượng. Sẽ tạo một lô mới (hoặc dùng lô có sẵn nếu nhập mã lô khớp).
          </p>
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
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!selectedItem || !qty || submitting}
            className="bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
          >
            {/* V4.4 Đợt 2 mục 5 — nút xác nhận ghi rõ việc sẽ làm. */}
            {submitting ? "Đang lưu…" : `Thêm vào ${bin.fullCode}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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
          // V4.1 KHO-11 — gửi ĐÚNG lô user chọn (trước đây không gửi → server
          // trừ nhầm lô lớn nhất trong bin).
          lotSerialId: lot.lotSerialId,
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
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={
            <>
              Rút hàng khỏi{" "}
              <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
            </>
          }
          onCancel={onClose}
        />
        <SheetBody className="space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Chọn lô và số lượng cần rút. Hệ thống tạo giao dịch rút hàng (ADJUST_MINUS).
          </p>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Lô / SKU trong ô kệ
            </label>
            <select
              value={selectedLotId}
              onChange={(e) => setSelectedLotId(e.target.value)}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {contents.map((c) => (
                <option key={c.lotSerialId} value={c.lotSerialId}>
                  {c.itemSku} · {c.lotCode ?? "anon"} · tồn {formatQty(c.qty)}
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
              <span className="font-semibold tabular-nums">{formatQty(lot.qty, lot.itemUom)}</span>
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
              Rút hết ({formatQty(lot.qty)})
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
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!qty || submitting}
            className="bg-rose-600 hover:bg-rose-700 dark:bg-rose-700 dark:hover:bg-rose-600"
          >
            {/* V4.4 Đợt 2 mục 5 — nút xác nhận ghi rõ việc sẽ làm. */}
            {submitting ? "Đang rút…" : `Rút khỏi ${bin.fullCode}`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

/* ============================================================ */
/* TRANSFER DIALOG                                              */
/* ============================================================ */

export function TransferDialog({
  bin,
  contents,
  initialLot,
  allBins,
  /** V4.3 mục 4.1.3 — prefill bin đích = gợi ý #1 (tab "Việc cần làm hôm nay" → "Xếp kệ"). */
  initialToBinId,
  onClose,
  onSuccess,
}: {
  bin: BinNode;
  contents: BinContent[];
  initialLot: BinContent;
  allBins: BinNode[];
  initialToBinId?: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [selectedLotId, setSelectedLotId] = React.useState(
    initialLot.lotSerialId,
  );
  const [toBinId, setToBinId] = React.useState(initialToBinId ?? "");
  // V4.3 fix LOOP_E2E vướng #1 — tự điền SL = TOÀN BỘ tồn của lô đang chọn
  // (trước đây để trống dù label đã ghi rõ "tối đa X" → người dùng phải tự
  // gõ lại số đã hiển thị ngay trên dòng). Vẫn cho sửa tay bình thường.
  const [qty, setQty] = React.useState(String(initialLot.qty));
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
      toast.error("Chọn vị trí đích.");
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
        toast.error(json.error?.message ?? "Lỗi chuyển vị trí");
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
    <Sheet open onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" size="md" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={
            <>
              Chuyển hàng từ{" "}
              <code className="font-mono text-indigo-700 dark:text-indigo-400">{bin.fullCode}</code>
            </>
          }
          onCancel={onClose}
        />
        <SheetBody className="space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Chọn lô, vị trí đích và số lượng. Hệ thống tạo giao dịch chuyển kho (TRANSFER).
          </p>

          <div>
            {/* V4.4 — nhãn trước đây to bất thường (text-lg) so với 2 sheet
                Thêm/Rút cùng bộ (text-xs), đồng bộ lại cho nhất quán. */}
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Lô / SKU
            </label>
            <select
              value={selectedLotId}
              onChange={(e) => {
                const nextId = e.target.value;
                setSelectedLotId(nextId);
                // V4.3 fix LOOP_E2E vướng #1 — đổi lô thì điền lại SL = tồn
                // của lô mới (tránh giữ số cũ sai lô khi bin có nhiều lô).
                const nextLot = contents.find((c) => c.lotSerialId === nextId);
                if (nextLot) setQty(String(nextLot.qty));
              }}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {contents.map((c) => (
                <option key={c.lotSerialId} value={c.lotSerialId}>
                  {c.itemSku} · {c.lotCode ?? "anon"} · tồn {formatQty(c.qty)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Vị trí đích
            </label>
            {/* V4.3 Đợt 2 — dùng BinSuggestCombobox (gợi ý vị trí putaway có sẵn)
                thay <select> phẳng, khớp mẫu B "Gợi ý vị trí" trong sheet Xếp kệ. */}
            <BinSuggestCombobox
              itemId={lot.itemId}
              qty={Number(qty) || lot.qty}
              bins={targetOptions}
              value={toBinId}
              onChange={setToBinId}
              placeholder="— Chọn vị trí —"
              className="mt-1"
              aria-label="Vị trí đích"
            />
          </div>

          <div>
            <label className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Số lượng chuyển (tối đa {formatQty(lot.qty)})
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
        </SheetBody>

        <SheetFooter>
          <Button variant="ghost" onClick={onClose}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!qty || !toBinId || submitting}
          >
            {/* V4.3 Đợt 2 mục 5 — nút xác nhận ghi rõ việc sẽ làm thay vì
                chữ "Chuyển" chung chung. */}
            {submitting
              ? "Đang chuyển…"
              : qty && toBinId
                ? `Chuyển ${formatQty(Number(qty) || 0, lot.itemUom)} → ${
                    targetOptions.find((b) => b.id === toBinId)?.fullCode ?? "?"
                  }`
                : "Chuyển"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
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

