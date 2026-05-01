"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Calendar, Loader2, Package, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * V3.7.20 — Dialog cho PIC update tiến độ row BOM.
 *
 * Fields:
 *   - received_qty: SL đã về
 *   - expected_eta: ngày NCC giao dự kiến
 *   - status_note: note ngắn ('đã đặt', 'về đủ', 'thiếu 5'...)
 *
 * Submit → POST /api/bom-lines/[id]/pic-update → invalidate bom queries.
 */

export interface PicEditDialogProps {
  open: boolean;
  onClose: () => void;
  line: {
    id: string;
    sku: string | null;
    componentName: string | null;
    qtyPerParent: string;
    /**
     * V3.7.49 — Tổng SL cần (từ Excel cột SL = metadata.totalQty,
     * vd 14 set băng tải). PIC compare receivedQty với totalQty này,
     * KHÔNG phải qtyPerParent (hệ số = 1).
     */
    totalQty?: number;
    assignedToFullName: string | null;
    receivedQty: string | null;
    expectedEta: string | null;
    statusNote: string | null;
  };
}

const COMMON_NOTES = [
  "Đã đặt hàng",
  "Đang sản xuất",
  "Đã giao một phần",
  "Về đủ",
  "Thiếu hàng",
  "Chậm giao",
] as const;

export function PicEditDialog({ open, onClose, line }: PicEditDialogProps) {
  const qc = useQueryClient();
  // V3.7.49 — Init = floor(receivedQty) integer
  const [receivedQty, setReceivedQty] = React.useState(
    line.receivedQty
      ? String(Math.floor(Number(line.receivedQty) || 0))
      : "",
  );
  const [expectedEta, setExpectedEta] = React.useState(line.expectedEta ?? "");
  const [statusNote, setStatusNote] = React.useState(line.statusNote ?? "");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset state when dialog opens for a new line
  React.useEffect(() => {
    if (open) {
      setReceivedQty(
        line.receivedQty
          ? String(Math.floor(Number(line.receivedQty) || 0))
          : "",
      );
      setExpectedEta(line.expectedEta ?? "");
      setStatusNote(line.statusNote ?? "");
    }
  }, [open, line.id, line.receivedQty, line.expectedEta, line.statusNote]);

  const handleSubmit = async () => {
    setSubmitting(true);
    try {
      const res = await fetch(`/api/bom-lines/${line.id}/pic-update`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          // V3.7.49 — submit integer value
          receivedQty:
            receivedQty === ""
              ? 0
              : Math.max(0, Math.floor(Number(receivedQty) || 0)),
          expectedEta: expectedEta || null,
          statusNote: statusNote || null,
        }),
      });
      const json = (await res.json()) as {
        data?: unknown;
        error?: { message?: string };
      };
      if (!res.ok) {
        toast.error(json.error?.message ?? "Lỗi cập nhật");
        return;
      }
      toast.success(`Đã cập nhật tiến độ ${line.sku ?? line.id.slice(0, 8)}`);
      void qc.invalidateQueries({ queryKey: ["bom"] });
      void qc.invalidateQueries({ queryKey: ["bom-template"] });
      onClose();
    } finally {
      setSubmitting(false);
    }
  };

  // V3.7.49 — "need" = SL Excel (totalQty), không phải hệ số.
  // Fallback qtyPerParent nếu thiếu data (legacy line).
  const need = line.totalQty && line.totalQty > 0
    ? line.totalQty
    : Number(line.qtyPerParent) || 1;
  const have = Number(receivedQty || 0);
  const remaining = Math.max(0, need - have);
  const completePct = need > 0 ? Math.min(100, Math.round((have / need) * 100)) : 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-4 w-4 text-indigo-600" />
            Cập nhật tiến độ
          </DialogTitle>
          <DialogDescription>
            <code className="font-mono text-sm font-semibold text-zinc-900">
              {line.sku ?? line.id.slice(0, 8)}
            </code>
            {line.componentName && (
              <span className="ml-2 text-xs text-zinc-600">
                {line.componentName}
              </span>
            )}
            {line.assignedToFullName && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                PIC: {line.assignedToFullName}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Received Qty */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Số lượng đã về
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <Input
                type="number"
                min={0}
                step={1}
                max={need}
                value={
                  receivedQty === ""
                    ? ""
                    : String(Math.floor(Number(receivedQty) || 0))
                }
                onChange={(e) => {
                  // Chỉ chấp nhận số nguyên dương
                  const raw = e.target.value;
                  if (raw === "") return setReceivedQty("");
                  const n = Math.max(0, Math.floor(Number(raw) || 0));
                  setReceivedQty(String(n));
                }}
                disabled={submitting}
                className="h-10 flex-1 text-right tabular-nums"
                placeholder="0"
              />
              <span className="text-sm text-zinc-500">/ {need} cần</span>
              {remaining > 0 ? (
                <span className="rounded bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                  Còn thiếu {remaining}
                </span>
              ) : (
                <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                  Đủ ({completePct}%)
                </span>
              )}
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-all"
                style={{ width: `${completePct}%` }}
              />
            </div>
          </div>

          {/* Expected ETA */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Ngày NCC giao (dự kiến)
            </label>
            <div className="relative mt-1.5">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                type="date"
                value={expectedEta}
                onChange={(e) => setExpectedEta(e.target.value)}
                disabled={submitting}
                className="h-10 pl-9"
              />
            </div>
          </div>

          {/* Status note + quick presets */}
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600">
              Ghi chú tiến độ
            </label>
            <Input
              value={statusNote}
              onChange={(e) => setStatusNote(e.target.value)}
              disabled={submitting}
              className="mt-1.5 h-10"
              placeholder="VD: Đã đặt 02/05, NCC confirm giao 10/05..."
              maxLength={255}
            />
            <div className="mt-1.5 flex flex-wrap gap-1">
              {COMMON_NOTES.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => setStatusNote(n)}
                  disabled={submitting}
                  className="rounded-full border border-zinc-200 bg-white px-2 py-0.5 text-[11px] text-zinc-600 transition-colors hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={submitting}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang lưu…
              </>
            ) : (
              <>
                <Package className="h-4 w-4" />
                Cập nhật
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
