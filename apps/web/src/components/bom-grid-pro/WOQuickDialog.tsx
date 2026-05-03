"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Factory, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { qk } from "@/lib/query-keys";

async function apiRequest<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

/**
 * V3.7.43 → V3.7.46 — Dialog "Gửi yêu cầu sản xuất" cho BOM line Category="GTAM".
 *
 * V3.7.46 thay đổi: Tạo YÊU CẦU SX (status=DRAFT) thay vì lệnh chính thức.
 * VH-A duyệt mới chuyển sang LỆNH SX (RELEASED) bắt đầu sản xuất.
 *
 * Inputs:
 *   - plannedQty (auto từ metadata.totalQty SL Excel, override được)
 *   - priority (LOW/NORMAL/HIGH/URGENT)
 *   - plannedStart / plannedEnd (optional)
 *   - notes
 */

const PRIORITIES = [
  { v: "LOW", label: "Thấp" },
  { v: "NORMAL", label: "Bình thường" },
  { v: "HIGH", label: "Cao" },
  { v: "URGENT", label: "Khẩn" },
] as const;

export interface WOQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateCode: string;
  line: BomFlatRow | null;
}

export function WOQuickDialog({
  open,
  onOpenChange,
  templateCode,
  line,
}: WOQuickDialogProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const meta = (line?.node.metadata ?? {}) as {
    totalQty?: string | number;
    size?: string;
    routing?: { materialCode?: string; processRoute?: string[] };
  };
  const defaultQty = meta.totalQty ? Number(meta.totalQty) : 1;

  const [plannedQty, setPlannedQty] = React.useState(String(defaultQty));
  const [priority, setPriority] = React.useState<string>("NORMAL");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [openAfter, setOpenAfter] = React.useState(true);

  React.useEffect(() => {
    if (open && line) {
      const qty = (meta.totalQty ? Number(meta.totalQty) : null) ?? 1;
      setPlannedQty(String(qty));
      setPriority("NORMAL");
      setPlannedStart("");
      setPlannedEnd("");
      setNotes("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!line) throw new Error("NO_LINE");
      const qty = Number(plannedQty);
      if (!Number.isFinite(qty) || qty <= 0) throw new Error("Số lượng không hợp lệ");
      return apiRequest<{ data: { id: string; woNo: string } }>(
        `/api/work-orders/from-bom-line/${line.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            plannedQty: qty,
            priority,
            plannedStart: plannedStart || null,
            plannedEnd: plannedEnd || null,
            notes: notes || null,
          }),
        },
      );
    },
    onSuccess: (res) => {
      const wo = res.data;
      toast.success(`Đã gửi yêu cầu sản xuất ${wo.woNo}`, {
        description: "Bộ phận Gia công sẽ xem xét + duyệt.",
      });
      qc.invalidateQueries({ queryKey: qk.bom.all });
      onOpenChange(false);
      if (openAfter) router.push(`/work-orders/${wo.id}`);
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Không tạo được WO");
    },
  });

  if (!line) return null;
  const sku = line.node.componentSku ?? "—";
  const name = line.node.componentName ?? line.node.description ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Factory className="h-5 w-5 text-purple-600" aria-hidden />
            Gửi yêu cầu sản xuất GTAM
          </DialogTitle>
          <DialogDescription>
            BOM <span className="font-mono">{templateCode}</span> · Linh kiện{" "}
            <span className="font-mono">{sku}</span>
            {name ? ` — ${name}` : ""}
            <br />
            <span className="text-purple-700 font-medium text-xs">
              ℹ️ Đây là <strong>yêu cầu sản xuất</strong> — Bộ phận Gia công sẽ
              duyệt rồi mới chuyển thành lệnh sản xuất chính thức.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Info readonly */}
          <div className="rounded-md border border-zinc-100 bg-zinc-50 p-3 text-xs space-y-1">
            <div className="flex justify-between">
              <span className="text-zinc-500">SKU sản phẩm:</span>
              <span className="font-mono">{sku}</span>
            </div>
            {meta.size && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Quy cách:</span>
                <span className="font-mono">{meta.size}</span>
              </div>
            )}
            {meta.routing?.materialCode && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Vật liệu:</span>
                <span className="font-mono">{meta.routing.materialCode}</span>
              </div>
            )}
            {meta.routing?.processRoute && meta.routing.processRoute.length > 0 && (
              <div className="flex justify-between">
                <span className="text-zinc-500">Quy trình:</span>
                <span className="font-mono text-[11px]">
                  {meta.routing.processRoute.join(" → ")}
                </span>
              </div>
            )}
            {!meta.routing && (
              <p className="mt-1 text-amber-700 text-[11px]">
                ℹ️ BOM line chưa cấu hình routing/material. Yêu cầu Simple —
                VH-A tự xử lý phôi nếu duyệt. Có thể bổ sung sau qua Edit linh kiện.
              </p>
            )}
          </div>

          {/* plannedQty */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wo-qty" required>
                Số lượng SX
              </Label>
              <Input
                id="wo-qty"
                type="number"
                step="1"
                min="1"
                value={plannedQty}
                onChange={(e) => setPlannedQty(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500">
                Default = SL Excel ({defaultQty})
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wo-priority">Ưu tiên</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger id="wo-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRIORITIES.map((p) => (
                    <SelectItem key={p.v} value={p.v}>
                      {p.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* dates */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="wo-start">Bắt đầu dự kiến</Label>
              <Input
                id="wo-start"
                type="date"
                value={plannedStart}
                onChange={(e) => setPlannedStart(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="wo-end">Kết thúc dự kiến</Label>
              <Input
                id="wo-end"
                type="date"
                value={plannedEnd}
                onChange={(e) => setPlannedEnd(e.target.value)}
              />
            </div>
          </div>

          {/* notes */}
          <div className="space-y-1.5">
            <Label htmlFor="wo-notes">Ghi chú</Label>
            <Textarea
              id="wo-notes"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Yêu cầu kỹ thuật, ghi chú bổ sung…"
              maxLength={2000}
            />
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={openAfter}
              onCheckedChange={(v) => setOpenAfter(v === true)}
            />
            <span>Mở yêu cầu sau khi gửi (theo dõi VH-A duyệt)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
            className="bg-purple-600 hover:bg-purple-700"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Factory className="h-3.5 w-3.5" />
            )}
            Gửi yêu cầu sản xuất
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
