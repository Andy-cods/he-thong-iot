"use client";

import * as React from "react";
import { Loader2, Zap } from "lucide-react";
import { toast } from "sonner";
import {
  BOM_REVISION_STATUS_LABELS,
  type BomRevisionStatus,
} from "@iot/shared";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useBomRevisions } from "@/hooks/useBomRevisions";
import { useExplodeSnapshot } from "@/hooks/useSnapshots";
import { formatDate } from "@/lib/format";

/**
 * ExplodeSnapshotDialog — chọn revision RELEASED + target qty → explode
 * tạo snapshot lines tree cho order.
 *
 * Guard: order phải gắn bomTemplateId + template có ít nhất 1 revision
 * RELEASED. Nếu chưa có → empty state link "/bom/[id]" để release.
 */
export interface ExplodeSnapshotDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderCode: string;
  orderQty: number;
  bomTemplateId: string | null;
}

export function ExplodeSnapshotDialog({
  open,
  onOpenChange,
  orderCode,
  orderQty,
  bomTemplateId,
}: ExplodeSnapshotDialogProps) {
  const revisionsQuery = useBomRevisions(bomTemplateId);
  const explode = useExplodeSnapshot(orderCode);

  const revisions = revisionsQuery.data?.data ?? [];
  const releasedRevisions = revisions.filter(
    (r) => (r.status as BomRevisionStatus) === "RELEASED",
  );

  const [revisionId, setRevisionId] = React.useState<string>("");
  const [targetQty, setTargetQty] = React.useState<string>(String(orderQty));

  React.useEffect(() => {
    if (!open) {
      setRevisionId("");
      setTargetQty(String(orderQty));
    }
  }, [open, orderQty]);

  React.useEffect(() => {
    // Auto-select revision RELEASED mới nhất khi mở dialog
    if (open && !revisionId && releasedRevisions.length > 0) {
      setRevisionId(releasedRevisions[0]!.id);
    }
  }, [open, releasedRevisions, revisionId]);

  const disabled =
    !revisionId ||
    Number.parseFloat(targetQty) <= 0 ||
    Number.isNaN(Number.parseFloat(targetQty)) ||
    explode.isPending;

  const handleSubmit = async () => {
    if (disabled) return;
    try {
      const res = await explode.mutateAsync({
        revisionId,
        targetQty: Number.parseFloat(targetQty),
      });
      toast.success(
        `Đã explode ${res.data.linesCreated} linh kiện (depth ${res.data.maxDepth}, ${res.data.durationMs}ms).`,
      );
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Explode snapshot thất bại");
    }
  };

  if (!bomTemplateId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Đơn hàng chưa gắn BOM template</DialogTitle>
            <DialogDescription>
              Vui lòng vào tab "Thông tin" để chọn BOM template cho đơn hàng
              trước khi explode snapshot.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button onClick={() => onOpenChange(false)}>Đóng</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Explode snapshot cho {orderCode}</DialogTitle>
          <DialogDescription>
            Chọn revision và số lượng đích. Snapshot sẽ nhân rộng qty theo cây
            BOM + cumulative scrap multiplier.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="revision" uppercase required>
              Revision
            </Label>
            {revisionsQuery.isLoading ? (
              <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
                <Loader2
                  className="h-3.5 w-3.5 animate-spin"
                  aria-hidden="true"
                />
                Đang tải revisions...
              </div>
            ) : releasedRevisions.length === 0 ? (
              <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
                BOM này chưa có revision RELEASED nào. Vào trang BOM để release
                trước khi explode snapshot.
              </div>
            ) : (
              <Select value={revisionId} onValueChange={setRevisionId}>
                <SelectTrigger id="revision">
                  <SelectValue placeholder="— Chọn revision —" />
                </SelectTrigger>
                <SelectContent>
                  {releasedRevisions.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      <span className="font-mono">{r.revisionNo}</span>
                      {" · "}
                      {BOM_REVISION_STATUS_LABELS[r.status as BomRevisionStatus]}
                      {r.releasedAt
                        ? ` · ${formatDate(r.releasedAt, "dd/MM/yyyy")}`
                        : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-qty" uppercase required>
              Target Qty (số thành phẩm)
            </Label>
            <Input
              id="target-qty"
              type="number"
              min="0"
              step="0.001"
              value={targetQty}
              onChange={(e) => setTargetQty(e.target.value)}
              className="tabular-nums"
            />
            <p className="text-xs text-zinc-500">
              Mặc định = order_qty ({orderQty}). Thay nếu cần explode riêng
              từng partial.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={explode.isPending}
          >
            Huỷ
          </Button>
          <Button onClick={() => void handleSubmit()} disabled={disabled}>
            {explode.isPending ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Đang explode...
              </>
            ) : (
              <>
                <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                Explode snapshot
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
