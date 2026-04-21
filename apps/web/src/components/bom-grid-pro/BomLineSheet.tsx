"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useUpdateBomLine } from "@/hooks/useBom";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";

/**
 * V1.7-beta.2 Phase C1 — Side sheet chỉnh sửa 1 BOM line chi tiết.
 *
 * Fields: qty/scrap/uom/description/supplierItemCode + metadata.size.
 * Gọi useUpdateBomLine → PATCH `/api/bom/templates/{id}/lines/{lid}`.
 * Invalidate cache → row refresh tự động.
 */

export interface BomLineSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateCode: string;
  line: BomFlatRow | null;
}

interface FormState {
  qtyPerParent: string;
  scrapPercent: string;
  uom: string;
  description: string;
  supplierItemCode: string;
  size: string;
}

function buildInitial(line: BomFlatRow | null): FormState {
  if (!line)
    return {
      qtyPerParent: "1",
      scrapPercent: "0",
      uom: "",
      description: "",
      supplierItemCode: "",
      size: "",
    };
  const meta = (line.node.metadata ?? {}) as { size?: unknown };
  return {
    qtyPerParent: String(line.node.qtyPerParent ?? "1"),
    scrapPercent: String(line.node.scrapPercent ?? "0"),
    uom: line.node.uom ?? "",
    description: line.node.description ?? "",
    supplierItemCode: line.node.supplierItemCode ?? "",
    size: typeof meta.size === "string" ? meta.size : "",
  };
}

export function BomLineSheet({
  open,
  onOpenChange,
  templateId,
  templateCode,
  line,
}: BomLineSheetProps) {
  const [form, setForm] = React.useState<FormState>(() => buildInitial(line));
  const [errors, setErrors] = React.useState<Partial<Record<keyof FormState, string>>>({});
  const mutation = useUpdateBomLine(templateId);

  // Re-seed form khi mở sheet với line mới (hoặc line thay đổi reference).
  React.useEffect(() => {
    if (open && line) {
      setForm(buildInitial(line));
      setErrors({});
    }
  }, [open, line]);

  const update = (k: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setForm((prev) => ({ ...prev, [k]: e.target.value }));
    if (errors[k]) setErrors((prev) => ({ ...prev, [k]: undefined }));
  };

  const validate = (): boolean => {
    const next: Partial<Record<keyof FormState, string>> = {};
    const qty = Number(form.qtyPerParent);
    if (!Number.isFinite(qty) || qty < 0.01) {
      next.qtyPerParent = "Số lượng phải ≥ 0.01";
    }
    const scrap = Number(form.scrapPercent);
    if (!Number.isFinite(scrap) || scrap < 0 || scrap > 100) {
      next.scrapPercent = "Hao hụt 0-100%";
    }
    if (form.uom.length > 16) next.uom = "ĐVT tối đa 16 ký tự";
    if (form.description.length > 500) next.description = "Mô tả tối đa 500 ký tự";
    if (form.supplierItemCode.length > 64) next.supplierItemCode = "Mã NCC tối đa 64 ký tự";
    if (form.size.length > 32) next.size = "Kích thước tối đa 32 ký tự";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    if (!validate()) return;

    const existingMeta = (line.node.metadata ?? {}) as Record<string, unknown>;
    const nextMeta: Record<string, unknown> = { ...existingMeta };
    if (form.size.trim()) {
      nextMeta.size = form.size.trim();
    } else {
      delete nextMeta.size;
    }

    try {
      await mutation.mutateAsync({
        lineId: line.id,
        data: {
          qtyPerParent: Number(form.qtyPerParent),
          scrapPercent: Number(form.scrapPercent),
          uom: form.uom.trim() || null,
          description: form.description.trim() || null,
          supplierItemCode: form.supplierItemCode.trim() || null,
          metadata: nextMeta,
        },
      });
      toast.success("Đã lưu thay đổi");
      onOpenChange(false);
    } catch (err) {
      toast.error((err as Error)?.message ?? "Không cập nhật được linh kiện");
    }
  };

  const pending = mutation.isPending;
  const sku = line?.node.componentSku ?? "—";
  const name = line?.node.componentName ?? "(chưa có tên)";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent size="md" className="md:w-[480px]">
        <SheetHeader>
          <div className="flex flex-col">
            <SheetTitle className="text-[15px]">Chỉnh sửa linh kiện</SheetTitle>
            <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-zinc-500">
              <span>{templateCode}</span>
              <span>·</span>
              <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-zinc-700">{sku}</span>
            </div>
          </div>
        </SheetHeader>
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <SheetBody className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2 space-y-1">
                <Label>SKU</Label>
                <div className="flex h-9 items-center rounded-md border border-zinc-100 bg-zinc-50 px-3 font-mono text-[13px] text-zinc-500">
                  {sku}
                </div>
              </div>
              <div className="col-span-2 space-y-1">
                <Label>Tên linh kiện</Label>
                <div className="flex min-h-9 items-center rounded-md border border-zinc-100 bg-zinc-50 px-3 text-[13px] text-zinc-600">
                  {name}
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="bls-qty" required>
                  Số lượng / bộ
                </Label>
                <Input
                  id="bls-qty"
                  type="number"
                  step="0.001"
                  min="0.01"
                  value={form.qtyPerParent}
                  onChange={update("qtyPerParent")}
                  error={!!errors.qtyPerParent}
                />
                {errors.qtyPerParent && (
                  <p className="text-[11px] text-red-600">{errors.qtyPerParent}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bls-scrap">Hao hụt (%)</Label>
                <Input
                  id="bls-scrap"
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={form.scrapPercent}
                  onChange={update("scrapPercent")}
                  error={!!errors.scrapPercent}
                />
                {errors.scrapPercent && (
                  <p className="text-[11px] text-red-600">{errors.scrapPercent}</p>
                )}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bls-uom">ĐVT</Label>
                <Input
                  id="bls-uom"
                  maxLength={16}
                  value={form.uom}
                  onChange={update("uom")}
                  placeholder="cái, kg, m..."
                  error={!!errors.uom}
                />
                {errors.uom && <p className="text-[11px] text-red-600">{errors.uom}</p>}
              </div>

              <div className="space-y-1">
                <Label htmlFor="bls-size">Kích thước phôi</Label>
                <Input
                  id="bls-size"
                  maxLength={32}
                  value={form.size}
                  onChange={update("size")}
                  placeholder="50x50x10"
                  error={!!errors.size}
                />
                {errors.size && <p className="text-[11px] text-red-600">{errors.size}</p>}
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="bls-supplier">Mã NCC</Label>
                <Input
                  id="bls-supplier"
                  maxLength={64}
                  value={form.supplierItemCode}
                  onChange={update("supplierItemCode")}
                  placeholder="VD: SUP-A123"
                  error={!!errors.supplierItemCode}
                />
                {errors.supplierItemCode && (
                  <p className="text-[11px] text-red-600">{errors.supplierItemCode}</p>
                )}
              </div>

              <div className="col-span-2 space-y-1">
                <Label htmlFor="bls-desc">Mô tả</Label>
                <Textarea
                  id="bls-desc"
                  maxLength={500}
                  rows={3}
                  value={form.description}
                  onChange={update("description")}
                  placeholder="Ghi chú chi tiết về linh kiện…"
                  error={!!errors.description}
                />
                <div className="flex items-center justify-between text-[11px]">
                  {errors.description ? (
                    <span className="text-red-600">{errors.description}</span>
                  ) : (
                    <span className="text-zinc-400">Tối đa 500 ký tự.</span>
                  )}
                  <span className="font-mono text-zinc-400">{form.description.length}/500</span>
                </div>
              </div>
            </div>
          </SheetBody>
          <SheetFooter>
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
              Lưu
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}
