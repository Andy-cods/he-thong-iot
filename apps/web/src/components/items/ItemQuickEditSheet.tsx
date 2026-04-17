"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import type { ItemCreate } from "@iot/shared";
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
  updatedAt?: string;
};

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
          <div className="flex h-12 shrink-0 items-center justify-between border-b border-zinc-100 px-4">
            <h2 className="text-base font-medium text-zinc-900">
              {item ? (
                <>
                  Chỉnh sửa ·{" "}
                  <span className="font-mono text-zinc-700">{item.sku}</span>
                </>
              ) : (
                "Chỉnh sửa"
              )}
            </h2>
            <button
              type="button"
              onClick={attemptClose}
              aria-label="Đóng"
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 transition-colors hover:bg-zinc-100 hover:text-zinc-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 focus-visible:outline-offset-0"
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
            )}
          </div>

          {/* V2 footer padding 16 border-t */}
          <div className="flex h-14 shrink-0 items-center justify-end gap-2 border-t border-zinc-100 px-4">
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
            <DialogDescription className="text-base text-zinc-600">
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
            <DialogDescription className="text-base text-zinc-600">
              Vật tư này vừa được người khác chỉnh sửa sau khi bạn mở. Bạn
              cần tải lại bản mới nhất trước khi lưu.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
            <p className="font-medium">Gợi ý V1:</p>
            <p className="text-amber-800">
              Tải lại để xem bản mới. Diff merge chi tiết sẽ có ở V1.1.
            </p>
            {conflict?.baseUpdatedAt && (
              <p className="mt-1 font-mono text-xs text-amber-700">
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
