"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
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
import { useCreatePurchaseRequest } from "@/hooks/usePurchaseRequests";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";

/**
 * V1.7-beta.2 Phase C2 — Dialog "Đặt mua nhanh" từ BOM line.
 *
 * Prefill:
 *  - itemId = line.componentItemId
 *  - qty    = qtyPerParent × parentQty × 1.1 (+10% dự phòng, làm tròn up)
 *  - notes  = "Từ BOM {code} dòng {sku}"
 * Submit → POST /api/purchase-requests. Success → toast + optional redirect
 * đến PR detail page.
 */

export interface PRQuickDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateCode: string;
  parentQty: number;
  line: BomFlatRow | null;
}

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

const PRIORITY_LABELS: Record<Priority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Gấp",
};

function computeSuggestedQty(line: BomFlatRow | null, parentQty: number): number {
  if (!line) return 1;
  const perParent = Number(line.node.qtyPerParent) || 0;
  const total = perParent * (parentQty || 1) * 1.1;
  return Math.max(Math.ceil(total * 1000) / 1000, perParent || 1);
}

export function PRQuickDialog({
  open,
  onOpenChange,
  templateId: _templateId,
  templateCode,
  parentQty,
  line,
}: PRQuickDialogProps) {
  const router = useRouter();
  const createPR = useCreatePurchaseRequest();

  const sku = line?.node.componentSku ?? "";
  const name = line?.node.componentName ?? "(chưa có tên)";

  const [qty, setQty] = React.useState<string>("1");
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [notes, setNotes] = React.useState<string>("");
  const [openAfterCreate, setOpenAfterCreate] = React.useState(true);
  const [qtyError, setQtyError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open && line) {
      const suggested = computeSuggestedQty(line, parentQty);
      setQty(String(suggested));
      setPriority("NORMAL");
      setNotes(`Từ BOM ${templateCode} — dòng ${sku}`);
      setOpenAfterCreate(true);
      setQtyError(null);
    }
  }, [open, line, parentQty, templateCode, sku]);

  const minQty = Number(line?.node.qtyPerParent ?? 0) || 0.01;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setQtyError("Số lượng phải > 0");
      return;
    }
    if (qtyNum < minQty) {
      setQtyError(`Tối thiểu ${minQty}`);
      return;
    }
    setQtyError(null);

    try {
      const prNotes =
        priority === "NORMAL"
          ? notes.trim() || null
          : `[${PRIORITY_LABELS[priority]}] ${notes.trim()}`.trim();

      const res = await createPR.mutateAsync({
        title: `Đặt mua nhanh — ${sku || "linh kiện"}`,
        source: "MANUAL",
        linkedOrderId: null,
        notes: prNotes,
        lines: [
          {
            itemId: line.node.componentItemId,
            qty: qtyNum,
            snapshotLineId: line.id,
            preferredSupplierId: null,
            neededBy: null,
            notes: null,
          },
        ],
      });

      const created = res.data;
      toast.success(`Đã tạo PR ${created.code ?? ""}`);
      onOpenChange(false);

      if (openAfterCreate && created.id) {
        router.push(`/procurement/purchase-requests/${created.id}`);
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? "Không tạo được PR");
    }
  };

  const pending = createPR.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Đặt mua nhanh {sku ? `— ${sku}` : ""}
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Tạo Purchase Request (DRAFT) cho linh kiện này. Admin/planner duyệt sẽ
            chuyển sang APPROVED.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label>Linh kiện</Label>
            <div className="flex items-center gap-2 rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-[13px]">
              <span className="font-mono text-xs font-semibold text-zinc-800">
                {sku || "—"}
              </span>
              <span className="truncate text-zinc-600">{name}</span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="pr-qty" required>
                Số lượng đề xuất
              </Label>
              <Input
                id="pr-qty"
                type="number"
                step="0.001"
                min={minQty}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                error={!!qtyError}
              />
              {qtyError ? (
                <p className="text-[11px] text-red-600">{qtyError}</p>
              ) : (
                <p className="text-[11px] text-zinc-400">
                  Gợi ý = SL/bộ × parent × 1.1 (dự phòng 10%).
                </p>
              )}
            </div>
            <div className="space-y-1">
              <Label htmlFor="pr-priority">Ưu tiên</Label>
              <select
                id="pr-priority"
                className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 focus:border-indigo-500 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-indigo-500"
                value={priority}
                onChange={(e) => setPriority(e.target.value as Priority)}
              >
                <option value="LOW">{PRIORITY_LABELS.LOW}</option>
                <option value="NORMAL">{PRIORITY_LABELS.NORMAL}</option>
                <option value="HIGH">{PRIORITY_LABELS.HIGH}</option>
                <option value="URGENT">{PRIORITY_LABELS.URGENT}</option>
              </select>
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pr-notes">Ghi chú</Label>
            <Textarea
              id="pr-notes"
              rows={3}
              maxLength={500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-[12px] text-zinc-700">
            <input
              type="checkbox"
              className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
              checked={openAfterCreate}
              onChange={(e) => setOpenAfterCreate(e.target.checked)}
            />
            Mở PR sau khi tạo
          </label>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Tạo PR
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
