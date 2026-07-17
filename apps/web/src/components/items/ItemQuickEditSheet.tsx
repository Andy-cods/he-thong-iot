"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Loader2, Lock, Unlock, X } from "lucide-react";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
import {
  useLotSerialList,
  useHoldLot,
  useReleaseLot,
} from "@/hooks/useLotSerial";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemForm } from "@/components/items/ItemForm";
import { useItem, useUpdateItem, type RequestError } from "@/hooks/useItems";
import { cn } from "@/lib/utils";

type ItemDetail = {
  id: string;
  sku: string;
  name: string;
  itemType: ItemCreate["itemType"];
  uom: ItemCreate["uom"];
  status: ItemCreate["status"];
  category: string | null;
  description: string | null;
  minStockQty: string | number;
  reorderQty: string | number;
  leadTimeDays: number;
  isLotTracked: boolean;
  isSerialTracked: boolean;
  isActive: boolean;
  /** V3.7 — slotting bin mặc định */
  defaultBinId?: string | null;
  updatedAt?: string;
};

interface BinOption {
  id: string;
  fullCode: string;
  isActive: boolean;
}

export interface ItemQuickEditSheetProps {
  itemId: string | null;
  onClose: () => void;
  onSaved?: (item: unknown) => void;
}

/**
 * V2 ItemQuickEditSheet — Linear-inspired 400px (design-spec §2.5 + impl-plan §8.T8).
 *
 * - Sheet width w-[400px] (thay 420 default V2 / 480 V1, ultra compact).
 * - Header padding 16 border-b zinc-100: title "Chỉnh sửa · {SKU}"
 *   text-base (13px) font-medium + close button ghost h-7 w-7.
 * - Body padding 20 — reuse ItemForm (form set hideFormActions, formId).
 * - Footer padding 16 border-t zinc-100: Cancel ghost + Save primary blue-500.
 * - Unsaved changes Dialog: title text-base font-medium, body text-sm.
 * - 409 conflict Dialog: show current vs server values (simple — không diff merge).
 *
 * Optimistic update qua useUpdateItem (giữ V1 logic).
 */
export function ItemQuickEditSheet({
  itemId,
  onClose,
  onSaved,
}: ItemQuickEditSheetProps) {
  const open = itemId !== null;
  const { data, isLoading, refetch } = useItem(itemId);
  const item = (data?.data as ItemDetail | undefined) ?? null;
  const update = useUpdateItem(itemId ?? "");

  const [isDirty, setIsDirty] = React.useState(false);
  const [warnOpen, setWarnOpen] = React.useState(false);
  const [conflict, setConflict] = React.useState<{
    baseUpdatedAt: string | null;
  } | null>(null);

  // Reset dirty khi đổi item hoặc đóng
  React.useEffect(() => {
    setIsDirty(false);
    setConflict(null);
  }, [itemId]);

  const attemptClose = React.useCallback(() => {
    if (isDirty) {
      setWarnOpen(true);
    } else {
      onClose();
    }
  }, [isDirty, onClose]);

  const handleOpenChange = (next: boolean) => {
    if (!next) attemptClose();
  };

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent
          side="right"
          size="md"
          hideCloseButton
          onInteractOutside={(e) => {
            if (isDirty) {
              e.preventDefault();
              setWarnOpen(true);
            }
          }}
          onEscapeKeyDown={(e) => {
            if (isDirty) {
              e.preventDefault();
              setWarnOpen(true);
            }
          }}
          // Override default 420 → 400 V2 ultra compact
          className={cn("flex flex-col md:!w-[400px]")}
        >
          {/* V2 header padding 16 border-b */}
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-100 px-4 dark:border-zinc-800">
            <h2 className="text-base font-medium text-zinc-900 dark:text-zinc-50">
              {item ? (
                <>
                  Chỉnh sửa ·{" "}
                  <span className="font-mono text-zinc-700 dark:text-zinc-300">{item.sku}</span>
                </>
              ) : (
                "Chỉnh sửa"
              )}
            </h2>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Đóng"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50"
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>

          {/* V2 body padding 20 overflow-y-auto */}
          <div className="flex-1 overflow-y-auto p-5">
            {isLoading || !item ? (
              <div className="space-y-3">
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-full" />
                <Skeleton className="h-9 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <>
                <ItemForm
                  mode="edit"
                  submitting={update.isPending}
                  onDirtyChange={setIsDirty}
                  hideFormActions
                  defaultValues={{
                    sku: item.sku,
                    name: item.name,
                    itemType: item.itemType,
                    uom: item.uom,
                    status: item.status,
                    category: item.category ?? "",
                    description: item.description ?? "",
                    minStockQty: Number(item.minStockQty ?? 0),
                    reorderQty: Number(item.reorderQty ?? 0),
                    leadTimeDays: item.leadTimeDays,
                    isLotTracked: item.isLotTracked,
                    isSerialTracked: item.isSerialTracked,
                  }}
                  onSubmit={async (values) => {
                    try {
                      const res = await update.mutateAsync({
                        data: values,
                        baseUpdatedAt: item.updatedAt ?? null,
                      });
                      toast.success("Đã cập nhật.");
                      setIsDirty(false);
                      onSaved?.(res.data);
                      onClose();
                    } catch (err) {
                      const e = err as RequestError;
                      if (e.status === 409) {
                        setConflict({
                          baseUpdatedAt: item.updatedAt ?? null,
                        });
                      } else {
                        toast.error(e.message);
                      }
                    }
                  }}
                  formId="item-quick-edit-form"
                />
                <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-800 dark:bg-zinc-800">
                  <SlottingPanel
                    itemId={item.id}
                    currentBinId={item.defaultBinId ?? null}
                    onSaved={() => {
                      void refetch();
                      onSaved?.(null);
                    }}
                  />
                </div>
                <div className="mt-3 rounded-md border border-zinc-200 bg-white p-3 dark:border-zinc-800 dark:bg-zinc-900">
                  <LotsPanel itemId={item.id} />
                </div>
              </>
            )}
          </div>

          {/* V2 footer padding 16 border-t */}
          <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-zinc-100 px-4 dark:border-zinc-800">
            <Button variant="ghost" size="md" onClick={attemptClose}>
              Huỷ
            </Button>
            {item && (
              <Button asChild variant="outline" size="md">
                <Link href={`/items/${item.id}`}>
                  <ExternalLink
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Mở full
                </Link>
              </Button>
            )}
            <Button
              form="item-quick-edit-form"
              type="submit"
              size="md"
              disabled={!item || update.isPending}
            >
              {update.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* V2 Unsaved changes warning — title 13px, body 13px */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              Bỏ thay đổi chưa lưu?
            </DialogTitle>
            <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400">
              Bạn có thay đổi chưa được lưu. Đóng bảng sẽ mất các thay đổi
              này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="md" onClick={() => setWarnOpen(false)}>
              Tiếp tục chỉnh sửa
            </Button>
            <Button
              variant="destructive"
              size="md"
              onClick={() => {
                setWarnOpen(false);
                setIsDirty(false);
                onClose();
              }}
            >
              Bỏ thay đổi
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* V2 409 Conflict resolver — simple V1 "reload" (không diff merge) */}
      <Dialog
        open={conflict !== null}
        onOpenChange={(o) => !o && setConflict(null)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="text-base font-medium">
              Dữ liệu đã bị thay đổi
            </DialogTitle>
            <DialogDescription className="text-base text-zinc-600 dark:text-zinc-400">
              Vật tư này vừa được người khác chỉnh sửa sau khi bạn mở. Bạn
              cần tải lại bản mới nhất trước khi lưu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <p className="font-medium">Gợi ý V1:</p>
            <p className="text-amber-800 dark:text-amber-300">
              Tải lại để xem bản mới. Diff merge chi tiết sẽ có ở V1.1.
            </p>
            {conflict?.baseUpdatedAt && (
              <p className="mt-1 font-mono text-xs text-amber-700 dark:text-amber-400">
                base updatedAt: {conflict.baseUpdatedAt}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" size="md" onClick={() => setConflict(null)}>
              Huỷ
            </Button>
            <Button
              size="md"
              onClick={() => {
                void refetch();
                setConflict(null);
              }}
            >
              Tải lại bản mới
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * V3.7 — Slotting panel: gán bin mặc định cho SKU.
 * - Fetch tất cả bin active từ /api/warehouse/layout
 * - Group theo area-rack-level
 * - Save → PATCH /api/items/[id] với defaultBinId
 */
function SlottingPanel({
  itemId,
  currentBinId,
  onSaved,
}: {
  itemId: string;
  currentBinId: string | null;
  onSaved: () => void;
}) {
  const [bins, setBins] = React.useState<BinOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [selected, setSelected] = React.useState<string>(currentBinId ?? "");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    setSelected(currentBinId ?? "");
  }, [currentBinId, itemId]);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/warehouse/layout");
        const json = (await res.json()) as { data?: { bins?: BinOption[] } };
        if (!cancelled) {
          const list = (json.data?.bins ?? []).filter((b) => b.isActive);
          setBins(list);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/items/${itemId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ defaultBinId: selected || null }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => null)) as
          | { message?: string }
          | null;
        throw new Error(err?.message ?? "Lỗi cập nhật bin.");
      }
      const newCode = bins.find((b) => b.id === selected)?.fullCode ?? null;
      toast.success(
        newCode ? `Đã gán bin ${newCode}.` : "Đã bỏ gán bin mặc định.",
      );
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật.");
    } finally {
      setSaving(false);
    }
  };

  const dirty = (currentBinId ?? "") !== selected;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Vị trí kho mặc định
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          (auto-putaway khi nhận hàng)
        </span>
      </div>
      <div className="flex items-center gap-2">
        <select
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={loading || saving}
          className="flex-1 rounded-md border border-zinc-300 bg-white px-2 py-1.5 font-mono text-sm text-zinc-700 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:disabled:bg-zinc-800"
        >
          <option value="">— Không gán —</option>
          {bins.map((b) => (
            <option key={b.id} value={b.id}>
              {b.fullCode}
            </option>
          ))}
        </select>
        <Button
          size="sm"
          disabled={!dirty || saving || loading}
          onClick={handleSave}
        >
          {saving ? "..." : "Gán"}
        </Button>
      </div>
      {loading && (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Đang tải danh sách bin…</p>
      )}
    </div>
  );
}

/**
 * V3.7.8 — Panel danh sách Lô / Serial của 1 SKU bên trong drawer Vật tư.
 * Thay cho tab Lô & Serial cũ (đã gộp vào).
 *
 * Tính năng:
 *   - List lots filtered theo itemId
 *   - Hold (lý do bắt buộc) / Release inline
 *   - Auto-refresh sau mutation
 */
function LotsPanel({ itemId }: { itemId: string }) {
  const { data, isLoading, refetch } = useLotSerialList({
    itemId,
    page: 1,
    pageSize: 50,
  });
  const holdMut = useHoldLot();
  const releaseMut = useReleaseLot();
  const rows = data?.data ?? [];

  const handleHold = async (lotId: string, lotCode: string | null) => {
    const reason = window.prompt(
      `Lý do hold lot ${lotCode ?? lotId.slice(0, 8)}?`,
    );
    if (!reason || !reason.trim()) return;
    try {
      await holdMut.mutateAsync({ id: lotId, reason: reason.trim() });
      toast.success("Đã HOLD lot.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi hold");
    }
  };

  const handleRelease = async (lotId: string) => {
    try {
      await releaseMut.mutateAsync({ id: lotId });
      toast.success("Đã release lot → AVAILABLE.");
      void refetch();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi release");
    }
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          Lô &amp; Serial ({rows.length})
        </span>
        <span className="text-xs text-zinc-500 dark:text-zinc-400">Hold / Release inline</span>
      </div>

      {isLoading ? (
        <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-zinc-200 bg-zinc-50 px-3 py-3 text-center text-xs text-zinc-500 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-400">
          SKU này chưa có lot nào.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border border-zinc-200 dark:border-zinc-800">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/60 dark:text-zinc-400">
              <tr>
                <th className="px-2 py-1.5 text-left">Lô / Serial</th>
                <th className="px-2 py-1.5 text-right">Tồn</th>
                <th className="px-2 py-1.5 text-left">Trạng thái</th>
                <th className="px-2 py-1.5 text-center w-16">Hành động</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-zinc-100 dark:border-zinc-800">
                  <td className="px-2 py-1.5">
                    <code className="font-mono text-[11px] font-medium text-zinc-900 dark:text-zinc-50">
                      {r.lotCode ?? r.serialCode ?? r.id.slice(0, 8)}
                    </code>
                    {r.expDate && (
                      <span className="ml-1 text-[10px] text-zinc-500 dark:text-zinc-400">
                        HSD {new Date(r.expDate).toLocaleDateString("vi-VN")}
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums font-semibold text-emerald-700 dark:text-emerald-400">
                    {r.onHandQty.toLocaleString("vi-VN")}
                  </td>
                  <td className="px-2 py-1.5">
                    <span
                      className={
                        r.status === "AVAILABLE"
                          ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                          : r.status === "HOLD"
                            ? "rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
                            : r.status === "CONSUMED"
                              ? "rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400"
                              : "rounded bg-rose-50 px-1.5 py-0.5 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400"
                      }
                    >
                      {r.status}
                    </span>
                    {r.holdReason && (
                      <span
                        className="ml-1 cursor-help text-[10px] text-amber-600 dark:text-amber-400"
                        title={r.holdReason}
                      >
                        ⓘ
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-center">
                    {r.status === "AVAILABLE" ? (
                      <button
                        type="button"
                        onClick={() => handleHold(r.id, r.lotCode)}
                        disabled={holdMut.isPending}
                        className="inline-flex h-6 items-center gap-0.5 rounded bg-amber-50 px-1.5 text-[10px] font-medium text-amber-700 hover:bg-amber-100 disabled:opacity-50 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-900/40"
                        title="Hold (giữ lại — không pick)"
                      >
                        <Lock className="h-3 w-3" /> Hold
                      </button>
                    ) : r.status === "HOLD" ? (
                      <button
                        type="button"
                        onClick={() => handleRelease(r.id)}
                        disabled={releaseMut.isPending}
                        className="inline-flex h-6 items-center gap-0.5 rounded bg-emerald-50 px-1.5 text-[10px] font-medium text-emerald-700 hover:bg-emerald-100 disabled:opacity-50 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40"
                        title="Release → AVAILABLE"
                      >
                        <Unlock className="h-3 w-3" /> Release
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
