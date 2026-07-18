"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Send } from "lucide-react";
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
 * V3.7.43 — Dialog "Tạo PO Đặt gia công ngoài" (Subcontract PO).
 *
 * Khác PRQuickDialog: tạo PO trực tiếp với poType=SUBCONTRACT (skip PR).
 * Đơn giá optional — TM-A chốt sau (decision 2026-05-01).
 *
 * Inputs:
 *   - supplierId (required, autocomplete NCC gia công)
 *   - orderedQty (auto từ metadata.totalQty SL Excel)
 *   - unitPrice (optional, default 0)
 *   - spec (auto từ metadata.size, editable)
 *   - expectedEta (optional ISO date)
 *   - notes
 */

interface SupplierOption {
  id: string;
  code: string;
  name: string;
}

export interface SubcontractPOQuickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templateCode: string;
  line: BomFlatRow | null;
}

export function SubcontractPOQuickDialog({
  open,
  onOpenChange,
  templateCode,
  line,
}: SubcontractPOQuickDialogProps) {
  const router = useRouter();
  const qc = useQueryClient();

  const meta = (line?.node.metadata ?? {}) as {
    totalQty?: string | number;
    size?: string;
    supplierId?: string;
  };
  const defaultQty = meta.totalQty ? Number(meta.totalQty) : 1;
  const defaultSpec = meta.size ? `Quy cách: ${meta.size}` : "";

  const [supplierId, setSupplierId] = React.useState<string>("");
  const [orderedQty, setOrderedQty] = React.useState(String(defaultQty));
  const [unitPrice, setUnitPrice] = React.useState("");
  const [spec, setSpec] = React.useState(defaultSpec);
  const [expectedEta, setExpectedEta] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [openAfter, setOpenAfter] = React.useState(true);

  // Fetch supplier list (max 100/page; nếu nhiều hơn → user có thể tạo NCC mới
  // ở /sales tab Suppliers rồi quay lại). isActive filter bỏ vì list endpoint
  // không support; tạm thời hiện tất cả.
  const suppliersQuery = useQuery({
    queryKey: ["suppliers", "for-subcontract"],
    queryFn: () =>
      apiRequest<{ data: SupplierOption[] }>(
        "/api/suppliers?pageSize=100&isActive=true",
      ),
    enabled: open,
    staleTime: 60_000,
  });
  const suppliers = suppliersQuery.data?.data ?? [];

  React.useEffect(() => {
    if (open && line) {
      const qty = (meta.totalQty ? Number(meta.totalQty) : null) ?? 1;
      setOrderedQty(String(qty));
      setUnitPrice("");
      setSpec(meta.size ? `Quy cách: ${meta.size}` : "");
      setExpectedEta("");
      setNotes("");
      // Pre-fill supplier from metadata if available
      setSupplierId(meta.supplierId ?? "");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, line?.id]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!line) throw new Error("NO_LINE");
      const qty = Number(orderedQty);
      if (!Number.isFinite(qty) || qty <= 0)
        throw new Error("Số lượng không hợp lệ");
      if (!supplierId) throw new Error("Vui lòng chọn nhà cung cấp gia công");
      const price = unitPrice.trim() ? Number(unitPrice) : 0;
      if (unitPrice.trim() && (!Number.isFinite(price) || price < 0))
        throw new Error("Đơn giá không hợp lệ");
      return apiRequest<{ data: { id: string; poNo: string } }>(
        `/api/purchase-orders/from-bom-line/${line.id}`,
        {
          method: "POST",
          body: JSON.stringify({
            supplierId,
            orderedQty: qty,
            unitPrice: price,
            spec: spec || null,
            expectedEta: expectedEta || null,
            notes: notes || null,
          }),
        },
      );
    },
    onSuccess: (res) => {
      const po = res.data;
      toast.success(`Đã tạo PO gia công ngoài ${po.poNo}`, {
        description: "TM-A sẽ chốt giá + duyệt + tải DDH PDF gửi NCC.",
      });
      qc.invalidateQueries({ queryKey: qk.bom.all });
      onOpenChange(false);
      if (openAfter) router.push(`/procurement/purchase-orders/${po.id}`);
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Không tạo được PO");
    },
  });

  if (!line) return null;
  const sku = line.node.componentSku ?? "—";
  const name = line.node.componentName ?? line.node.description ?? "";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-orange-600 dark:text-orange-400" aria-hidden />
            Tạo PO Đặt gia công ngoài
          </DialogTitle>
          <DialogDescription>
            BOM <span className="font-mono">{templateCode}</span> · Linh kiện{" "}
            <span className="font-mono">{sku}</span>
            {name ? ` — ${name}` : ""}
            <br />
            <span className="text-orange-700 font-medium dark:text-orange-400">
              PO này sẽ dùng template DDH-Mau khi tải PDF (sau khi TM-A duyệt).
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-3 py-2">
          {/* Supplier */}
          <div className="space-y-1.5">
            <Label htmlFor="sub-supplier" required>
              NCC gia công
            </Label>
            <Select value={supplierId} onValueChange={setSupplierId}>
              <SelectTrigger id="sub-supplier">
                <SelectValue placeholder="Chọn nhà cung cấp gia công…" />
              </SelectTrigger>
              <SelectContent>
                {suppliersQuery.isLoading ? (
                  <SelectItem value="__loading" disabled>
                    Đang tải danh sách NCC…
                  </SelectItem>
                ) : suppliers.length === 0 ? (
                  <SelectItem value="__empty" disabled>
                    Chưa có NCC. Vào /sales tab Suppliers để tạo.
                  </SelectItem>
                ) : (
                  suppliers.map((s: SupplierOption) => (
                    <SelectItem key={s.id} value={s.id}>
                      <span className="font-mono text-xs mr-2">{s.code}</span>
                      {s.name}
                    </SelectItem>
                  ))
                )}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              VD: Tân Tiến (cơ khí chính xác), AMA (gia công cơ khí)
            </p>
          </div>

          {/* qty + unit price */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sub-qty" required>
                Số lượng
              </Label>
              <Input
                id="sub-qty"
                type="number"
                step="1"
                min="1"
                value={orderedQty}
                onChange={(e) => setOrderedQty(e.target.value)}
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Default = SL Excel ({defaultQty})
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-price">
                Đơn giá <span className="text-zinc-400 dark:text-zinc-500">(optional)</span>
              </Label>
              <Input
                id="sub-price"
                type="number"
                step="1000"
                min="0"
                value={unitPrice}
                onChange={(e) => setUnitPrice(e.target.value)}
                placeholder="VND — TM-A chốt sau"
              />
              <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
                Để trống → TM-A liên hệ NCC chốt
              </p>
            </div>
          </div>

          {/* spec */}
          <div className="space-y-1.5">
            <Label htmlFor="sub-spec">Vật liệu / Quy cách</Label>
            <Input
              id="sub-spec"
              value={spec}
              onChange={(e) => setSpec(e.target.value)}
              maxLength={255}
              placeholder="VD: SUS304 25x53x51mm"
            />
            <p className="text-[11px] text-zinc-500 dark:text-zinc-400">
              Sẽ hiển thị cột "Vật liệu/Quy cách" trên DDH PDF
            </p>
          </div>

          {/* eta + notes */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sub-eta">Ngày giao dự kiến</Label>
              <Input
                id="sub-eta"
                type="date"
                value={expectedEta}
                onChange={(e) => setExpectedEta(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sub-notes">Yêu cầu kỹ thuật</Label>
              <Textarea
                id="sub-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="VD: SUS 304, điện hóa…"
                maxLength={2000}
              />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <Checkbox
              checked={openAfter}
              onCheckedChange={(v) => setOpenAfter(v === true)}
            />
            <span>Mở PO sau khi tạo (để TM-A chốt giá + duyệt)</span>
          </label>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || !supplierId}
            className="bg-orange-600 hover:bg-orange-700 dark:bg-orange-700 dark:hover:bg-orange-600"
          >
            {mutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Tạo PO gia công ngoài
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
