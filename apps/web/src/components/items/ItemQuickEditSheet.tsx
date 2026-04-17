"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink } from "lucide-react";
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
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { ItemForm } from "@/components/items/ItemForm";
import { useItem, useUpdateItem, type RequestError } from "@/hooks/useItems";

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
 * ItemQuickEditSheet — design-spec §3.15.
 *
 * - Sheet right 480px, wrap ItemForm.
 * - Unsaved changes warn qua AlertDialog khi close/Esc/click outside.
 * - Optimistic update (trong hook useUpdateItem).
 * - 409 conflict detection: server trả 409 → Dialog "Tải lại bản mới"
 *   (brainstorm-deep §2.3). V1 không diff merge (D11).
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
          className="flex flex-col"
        >
          <SheetHeader>
            <div className="flex flex-col">
              <SheetTitle>
                {item ? `Sửa nhanh: ${item.sku}` : "Sửa nhanh"}
              </SheetTitle>
            </div>
          </SheetHeader>

          <SheetBody className="p-0">
            {isLoading || !item ? (
              <div className="space-y-3 p-6">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-3/4" />
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="p-6">
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
                        setConflict({ baseUpdatedAt: item.updatedAt ?? null });
                      } else {
                        toast.error(e.message);
                      }
                    }
                  }}
                  formId="item-quick-edit-form"
                />
              </div>
            )}
          </SheetBody>

          <SheetFooter>
            <Button variant="ghost" onClick={attemptClose}>
              Huỷ
            </Button>
            {item && (
              <Button asChild variant="outline">
                <Link href={`/items/${item.id}`}>
                  <ExternalLink className="h-4 w-4" aria-hidden="true" />
                  Mở full
                </Link>
              </Button>
            )}
            <Button
              form="item-quick-edit-form"
              type="submit"
              disabled={!item || update.isPending}
            >
              {update.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>

      {/* Unsaved changes warning */}
      <Dialog open={warnOpen} onOpenChange={setWarnOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Bỏ thay đổi chưa lưu?</DialogTitle>
            <DialogDescription>
              Bạn có thay đổi chưa được lưu. Đóng bảng sẽ mất hết các thay
              đổi này.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setWarnOpen(false)}>
              Tiếp tục chỉnh sửa
            </Button>
            <Button
              variant="danger"
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

      {/* 409 Conflict resolver (brainstorm-deep §2.3) */}
      <Dialog
        open={conflict !== null}
        onOpenChange={(o) => !o && setConflict(null)}
      >
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Dữ liệu đã bị thay đổi</DialogTitle>
            <DialogDescription>
              Vật tư này vừa được người khác chỉnh sửa sau khi bạn mở. Bạn
              cần tải lại bản mới nhất trước khi lưu.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-sm bg-slate-50 p-3 text-xs text-slate-600">
            <p className="font-medium text-slate-700">Gợi ý V1:</p>
            <p className="mt-1">
              Tải lại để xem bản mới. Diff merge chi tiết sẽ có ở V1.1.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConflict(null)}>
              Huỷ
            </Button>
            <Button
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
