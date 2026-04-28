"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Command as CommandPrimitive } from "cmdk";
import {
  AlertTriangle,
  Check,
  ChevronsUpDown,
  Info,
  Loader2,
  Search,
  X,
} from "lucide-react";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useCreatePurchaseRequest } from "@/hooks/usePurchaseRequests";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";

/**
 * V1.7-beta.2.4 — Dialog "Đặt mua nhanh" từ BOM line, enriched Supplier +
 * sourcing hints.
 *
 * Prefill:
 *  - itemId = line.componentItemId
 *  - supplierId = metadata.sourcing.supplierId (hoặc null, user chọn)
 *  - qty = max(qtyPerParent × parentQty × 1.1, moq nếu có)
 *  - notes = "Từ BOM {code} dòng {sku}" + lead time hint
 * Submit → POST /api/purchase-requests với `preferredSupplierId` (schema V1.2
 * đã có field này per-line). `estimatedPrice` không có trong schema PR V1.2 →
 * gộp vào notes (PO tạo sau sẽ dùng làm input unitPrice).
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

interface SourcingMeta {
  supplierId?: string;
  supplierCode?: string;
  supplierName?: string;
  supplierPartNumber?: string;
  leadTimeDays?: number;
  moq?: number;
  estimatedPrice?: number;
  paymentTerms?: string;
}

function readSourcing(line: BomFlatRow | null): SourcingMeta {
  if (!line) return {};
  const meta = (line.node.metadata ?? {}) as { sourcing?: Record<string, unknown> };
  const s = meta.sourcing ?? {};
  const out: SourcingMeta = {};
  if (typeof s.supplierId === "string") out.supplierId = s.supplierId;
  if (typeof s.supplierCode === "string") out.supplierCode = s.supplierCode;
  if (typeof s.supplierName === "string") out.supplierName = s.supplierName;
  if (typeof s.supplierPartNumber === "string")
    out.supplierPartNumber = s.supplierPartNumber;
  if (typeof s.leadTimeDays === "number") out.leadTimeDays = s.leadTimeDays;
  if (typeof s.moq === "number") out.moq = s.moq;
  if (typeof s.estimatedPrice === "number")
    out.estimatedPrice = s.estimatedPrice;
  if (typeof s.paymentTerms === "string") out.paymentTerms = s.paymentTerms;
  return out;
}

function computeSuggestedQty(
  line: BomFlatRow | null,
  parentQty: number,
  moq?: number,
): number {
  if (!line) return 1;
  const perParent = Number(line.node.qtyPerParent) || 0;
  const total = perParent * (parentQty || 1) * 1.1;
  const rounded = Math.max(Math.ceil(total * 1000) / 1000, perParent || 1);
  if (moq && moq > rounded) return moq;
  return rounded;
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
  const sourcing = React.useMemo(() => readSourcing(line), [line]);

  const [qty, setQty] = React.useState<string>("1");
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [notes, setNotes] = React.useState<string>("");
  const [openAfterCreate, setOpenAfterCreate] = React.useState(true);
  const [qtyError, setQtyError] = React.useState<string | null>(null);
  const [supplier, setSupplierState] = React.useState<{
    id: string;
    code: string;
    name: string;
  }>({ id: "", code: "", name: "" });

  React.useEffect(() => {
    if (open && line) {
      const suggested = computeSuggestedQty(line, parentQty, sourcing.moq);
      setQty(String(suggested));
      setPriority("NORMAL");
      const leadHint = sourcing.leadTimeDays
        ? ` · Lead time ${sourcing.leadTimeDays} ngày`
        : "";
      setNotes(`Từ BOM ${templateCode} — dòng ${sku}${leadHint}`);
      setOpenAfterCreate(true);
      setQtyError(null);
      setSupplierState({
        id: sourcing.supplierId ?? "",
        code: sourcing.supplierCode ?? "",
        name: sourcing.supplierName ?? "",
      });
    }
  }, [open, line, parentQty, templateCode, sku, sourcing]);

  const minQty = Number(line?.node.qtyPerParent ?? 0) || 0.01;
  const moq = sourcing.moq ?? null;
  const qtyNum = Number(qty);
  const belowMoq = moq !== null && Number.isFinite(qtyNum) && qtyNum < moq;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!line) return;
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      setQtyError("Số lượng phải > 0");
      return;
    }
    if (qtyNum < minQty) {
      setQtyError(`Tối thiểu ${minQty}`);
      return;
    }
    // V3.4 — bắt buộc chọn supplier để PR có thể convert sang PO sau khi duyệt
    if (!supplier.id) {
      toast.error("Vui lòng chọn Nhà cung cấp", {
        description: "Cần có NCC ưu tiên để tạo được PO sau khi duyệt PR.",
      });
      return;
    }
    setQtyError(null);

    try {
      const extraNotes: string[] = [];
      if (priority !== "NORMAL")
        extraNotes.push(`[${PRIORITY_LABELS[priority]}]`);
      if (notes.trim()) extraNotes.push(notes.trim());
      if (sourcing.estimatedPrice) {
        extraNotes.push(
          `Giá tham khảo ${formatNumber(sourcing.estimatedPrice)}₫/đơn vị`,
        );
      }
      if (sourcing.supplierPartNumber) {
        extraNotes.push(`Mã NCC: ${sourcing.supplierPartNumber}`);
      }
      const prNotes = extraNotes.join(" · ") || null;

      // V1.7-beta.2.5 fix: KHÔNG truyền snapshotLineId vì `line.id` là ID của
      // bom_line (BOM TEMPLATE) chứ không phải bom_snapshot_line — truyền sẽ
      // FK violation → DB insert fail → 500 "Không tạo được...".
      // PR tạo từ BOM template không có snapshot context nên để null hợp lý.
      const res = await createPR.mutateAsync({
        title: `Đặt mua nhanh — ${sku || "linh kiện"}`,
        source: "MANUAL",
        linkedOrderId: null,
        notes: prNotes,
        lines: [
          {
            itemId: line.node.componentItemId,
            qty: qtyNum,
            preferredSupplierId: supplier.id || null,
          },
        ],
      });

      const created = res.data;
      const prHref = created.id
        ? `/procurement/purchase-requests/${created.id}`
        : null;

      toast.success(
        `Đã tạo PR ${created.code ?? ""}`.trim(),
        prHref
          ? {
              action: {
                label: "Mở PR ngay",
                onClick: () => router.push(prHref),
              },
            }
          : undefined,
      );
      onOpenChange(false);

      if (openAfterCreate && prHref) {
        router.push(prHref);
      }
    } catch (err) {
      toast.error((err as Error)?.message ?? "Không tạo được PR");
    }
  };

  const pending = createPR.isPending;

  const setSupplier = (s: SupplierRow | null) => {
    setSupplierState({
      id: s?.id ?? "",
      code: s?.code ?? "",
      name: s?.name ?? "",
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md" className="max-w-[560px]">
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

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Left column — Qty + Priority */}
            <div className="space-y-3">
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
                  error={!!qtyError || belowMoq}
                />
                {qtyError ? (
                  <p className="text-[11px] text-red-600">{qtyError}</p>
                ) : belowMoq ? (
                  <p className="flex items-center gap-1 text-[11px] text-amber-700">
                    <AlertTriangle className="h-3 w-3" aria-hidden />
                    Dưới MOQ {formatNumber(moq!)} — NCC có thể từ chối.
                  </p>
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

            {/* Right column — Supplier + sourcing hints */}
            <div className="space-y-3">
              <div className="space-y-1">
                <Label required>Nhà cung cấp</Label>
                <SupplierCombobox
                  value={supplier}
                  onChange={setSupplier}
                />
                <p className="text-[11px] text-zinc-400">
                  Bắt buộc — cần có NCC để convert PR → PO sau khi duyệt.
                </p>
              </div>

              <SourcingInfoBox sourcing={sourcing} />
            </div>
          </div>

          <div className="space-y-1">
            <Label htmlFor="pr-notes">Ghi chú</Label>
            <Textarea
              id="pr-notes"
              rows={2}
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

/* ─────────────────────────── Sourcing info box ─────────────────────────── */

function SourcingInfoBox({ sourcing }: { sourcing: SourcingMeta }) {
  const hasAny =
    sourcing.leadTimeDays !== undefined ||
    sourcing.moq !== undefined ||
    sourcing.estimatedPrice !== undefined ||
    !!sourcing.supplierPartNumber ||
    !!sourcing.paymentTerms;

  if (!hasAny) {
    return (
      <div className="flex items-start gap-1.5 rounded-md border border-dashed border-zinc-200 bg-zinc-50/40 px-2.5 py-2 text-[11px] text-zinc-500">
        <Info className="mt-0.5 h-3 w-3 shrink-0 text-zinc-400" aria-hidden />
        <span>
          Chưa có thông tin sourcing. Cập nhật tại Sửa linh kiện →{" "}
          <span className="font-medium">Thương mại</span>.
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-1 rounded-md border border-blue-100 bg-blue-50/40 px-2.5 py-2 text-[11px]">
      <div className="mb-0.5 flex items-center gap-1 font-medium uppercase tracking-wide text-blue-700">
        <Info className="h-3 w-3" aria-hidden />
        Sourcing từ BOM
      </div>
      {sourcing.leadTimeDays !== undefined ? (
        <Row
          label="Lead time"
          value={`${formatNumber(sourcing.leadTimeDays)} ngày`}
        />
      ) : null}
      {sourcing.moq !== undefined ? (
        <Row label="MOQ" value={formatNumber(sourcing.moq)} />
      ) : null}
      {sourcing.estimatedPrice !== undefined ? (
        <Row
          label="Giá tham khảo"
          value={`${formatNumber(sourcing.estimatedPrice)}₫/đơn vị`}
        />
      ) : null}
      {sourcing.supplierPartNumber ? (
        <Row label="Mã NCC" value={sourcing.supplierPartNumber} mono />
      ) : null}
      {sourcing.paymentTerms ? (
        <Row label="Điều khoản" value={sourcing.paymentTerms} />
      ) : null}
    </div>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-zinc-500">{label}</span>
      <span
        className={cn(
          "text-right text-zinc-800",
          mono && "font-mono text-[11px]",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/* ─────────────────────────── Supplier combobox ─────────────────────────── */

interface SupplierComboboxProps {
  value: { id: string; code: string; name: string };
  onChange: (s: SupplierRow | null) => void;
}

function SupplierCombobox({ value, onChange }: SupplierComboboxProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const suppliersQuery = useSuppliersList({
    q: query,
    pageSize: 50,
    isActive: true,
  });
  const suppliers = suppliersQuery.data?.data ?? [];

  const display = value.code
    ? `${value.code}${value.name ? ` — ${value.name}` : ""}`
    : "";

  return (
    <div className="flex items-center gap-1.5">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-zinc-200 bg-white px-3 text-left text-[13px] transition-colors",
              "hover:bg-zinc-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
            )}
          >
            <span
              className={cn(
                "truncate",
                display ? "text-zinc-800" : "text-zinc-400",
              )}
            >
              {display || "Chọn NCC…"}
            </span>
            <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-zinc-400" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-[360px] p-0"
          sideOffset={4}
        >
          <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
            <div className="flex items-center border-b border-zinc-200 px-3 py-2">
              <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
              <CommandPrimitive.Input
                autoFocus
                value={query}
                onValueChange={setQuery}
                placeholder="Tìm NCC theo mã / tên…"
                className="flex-1 bg-transparent px-2 text-[13px] outline-none placeholder:text-zinc-400"
              />
            </div>
            <CommandPrimitive.List className="max-h-[240px] overflow-y-auto p-1">
              {suppliersQuery.isLoading ? (
                <div className="px-3 py-4 text-center text-xs text-zinc-500">
                  Đang tải…
                </div>
              ) : suppliers.length === 0 ? (
                <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500">
                  {query
                    ? `Không tìm thấy "${query}".`
                    : "Chưa có NCC trong danh mục."}
                </CommandPrimitive.Empty>
              ) : (
                <CommandPrimitive.Group>
                  {suppliers.map((s) => (
                    <CommandPrimitive.Item
                      key={s.id}
                      value={`${s.code} ${s.name}`}
                      onSelect={() => {
                        onChange(s);
                        setOpen(false);
                        setQuery("");
                      }}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px]",
                        "aria-selected:bg-zinc-100",
                      )}
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          s.id === value.id
                            ? "text-indigo-600"
                            : "text-transparent",
                        )}
                      />
                      <span className="font-mono text-xs font-medium text-zinc-800">
                        {s.code}
                      </span>
                      <span className="truncate text-zinc-700">{s.name}</span>
                    </CommandPrimitive.Item>
                  ))}
                </CommandPrimitive.Group>
              )}
            </CommandPrimitive.List>
          </CommandPrimitive>
        </PopoverContent>
      </Popover>
      {value.id || value.code ? (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-zinc-200 text-zinc-400 transition-colors hover:bg-zinc-50 hover:text-zinc-700"
          title="Bỏ chọn NCC"
          aria-label="Bỏ chọn NCC"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
