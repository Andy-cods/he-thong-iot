"use client";

import * as React from "react";
import { Download, FileSpreadsheet } from "lucide-react";
import { toast } from "sonner";
import {
  PO_STATUSES,
  PO_STATUS_LABELS,
  type POStatus,
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
import { useExportPOExcel } from "@/hooks/usePurchaseOrders";
import { cn } from "@/lib/utils";

export interface PoExportDialogProps {
  trigger?: React.ReactNode;
}

/**
 * V1.9-P9 — PoExportDialog.
 * Cho phép kế toán/admin chọn filter rồi download Excel.
 */
export function PoExportDialog({ trigger }: PoExportDialogProps) {
  const [open, setOpen] = React.useState(false);
  const [statuses, setStatuses] = React.useState<POStatus[]>([]);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");

  const exporter = useExportPOExcel();

  const toggle = (s: POStatus) => {
    setStatuses((cur) =>
      cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s],
    );
  };

  const handleExport = async () => {
    try {
      const res = await exporter.mutateAsync({
        status: statuses.length > 0 ? statuses : undefined,
        from: from || undefined,
        to: to || undefined,
      });
      toast.success(
        `Đã tải file Excel ${res.count} dòng cho kế toán.`,
      );
      setOpen(false);
    } catch (err) {
      toast.error(`Xuất Excel thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? (
        <div onClick={() => setOpen(true)}>{trigger}</div>
      ) : (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setOpen(true)}
          type="button"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" aria-hidden="true" />
          Xuất Excel
        </Button>
      )}
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle>Xuất PO sang Excel (kế toán)</DialogTitle>
          <DialogDescription>
            Chọn filter để lọc dữ liệu xuất. Bỏ trống để xuất toàn bộ.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label uppercase>Trạng thái</Label>
            <div className="flex flex-wrap gap-1.5">
              {PO_STATUSES.map((s) => {
                const active = statuses.includes(s);
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => toggle(s)}
                    className={cn(
                      "h-7 rounded-md px-2.5 text-xs font-medium transition-colors",
                      active
                        ? "bg-indigo-600 text-white"
                        : "bg-zinc-100 text-zinc-700 hover:bg-zinc-200",
                    )}
                  >
                    {PO_STATUS_LABELS[s]}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="exp-from" uppercase>
                Từ ngày
              </Label>
              <Input
                id="exp-from"
                type="date"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="exp-to" uppercase>
                Đến ngày
              </Label>
              <Input
                id="exp-to"
                type="date"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setOpen(false)}
            type="button"
          >
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={() => void handleExport()}
            disabled={exporter.isPending}
            type="button"
          >
            <Download className="h-3.5 w-3.5" aria-hidden="true" />
            {exporter.isPending ? "Đang xuất…" : "Tải Excel"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
