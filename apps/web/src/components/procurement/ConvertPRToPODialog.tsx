"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Command as CommandPrimitive } from "cmdk";
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronsUpDown,
  Loader2,
  Search,
} from "lucide-react";
import { toast } from "sonner";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useSuppliersList, type SupplierRow } from "@/hooks/useSuppliers";
import { useConvertPRToPOs } from "@/hooks/usePurchaseOrders";
import { cn } from "@/lib/utils";

/**
 * V3.4 — ConvertPRToPODialog.
 *
 * Khi user bấm "Tạo PO" trên PR detail, nếu có line chưa có preferred_supplier:
 *   - Mở dialog này với list lines, mỗi line có combobox chọn supplier
 *   - Lines đã có supplier hiện disabled (giữ nguyên)
 *   - Submit gọi POST /from-pr/[id] với supplierOverrides map
 *
 * Nếu tất cả lines đều có supplier → có thể skip dialog gọi convert luôn.
 */

export interface ConvertPRLine {
  id: string;
  lineNo: number;
  sku: string | null;
  name: string | null;
  qty: string;
  preferredSupplierId: string | null;
}

export interface ConvertPRToPODialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  prId: string;
  prCode: string;
  lines: ConvertPRLine[];
  onSuccess?: (createdPOIds: string[]) => void;
}

export function ConvertPRToPODialog({
  open,
  onOpenChange,
  prId,
  prCode,
  lines,
  onSuccess,
}: ConvertPRToPODialogProps) {
  const router = useRouter();
  const convert = useConvertPRToPOs();
  const [overrides, setOverrides] = React.useState<Record<string, string>>({});

  // Reset khi open
  React.useEffect(() => {
    if (open) setOverrides({});
  }, [open]);

  const linesWithoutSupplier = lines.filter((l) => !l.preferredSupplierId);
  const allHaveSupplier = linesWithoutSupplier.every(
    (l) => overrides[l.id],
  );

  const handleSubmit = async () => {
    if (linesWithoutSupplier.length > 0 && !allHaveSupplier) {
      toast.error(
        `Còn ${
          linesWithoutSupplier.filter((l) => !overrides[l.id]).length
        } dòng chưa chọn NCC`,
      );
      return;
    }
    try {
      const res = await convert.mutateAsync({
        prId,
        supplierOverrides:
          Object.keys(overrides).length > 0 ? overrides : undefined,
      });
      const ids = res.data.createdPOs.map((p) => p.id);
      const count = ids.length;
      toast.success(`Đã tạo ${count} PO từ ${prCode}`, {
        description:
          count === 1
            ? `Mở PO ${res.data.createdPOs[0]?.poNo} ngay…`
            : "Mở danh sách PO…",
      });
      onOpenChange(false);
      if (onSuccess) onSuccess(ids);
      else if (count === 1 && ids[0]) {
        router.push(`/procurement/purchase-orders/${ids[0]}`);
      } else {
        router.push("/sales?tab=po");
      }
    } catch (err) {
      toast.error(`Tạo PO thất bại: ${(err as Error).message}`);
    }
  };

  const supplierGrouping = React.useMemo(() => {
    // Tính số PO sẽ được tạo: group by effective supplier (existing + override)
    const supplierIds = new Set<string>();
    for (const l of lines) {
      const sid = l.preferredSupplierId || overrides[l.id];
      if (sid) supplierIds.add(sid);
    }
    return supplierIds.size;
  }, [lines, overrides]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-indigo-600" />
            Tạo PO từ {prCode}
          </DialogTitle>
          <DialogDescription>
            Chọn nhà cung cấp cho từng dòng. Hệ thống sẽ tự động group các dòng
            cùng NCC vào 1 PO.
          </DialogDescription>
        </DialogHeader>

        {linesWithoutSupplier.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800">
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" />
              {linesWithoutSupplier.length} dòng chưa có NCC ưu tiên
            </p>
            <p className="mt-1 text-xs">
              Vui lòng chọn NCC cho từng dòng bên dưới. Lựa chọn sẽ được lưu vào
              PR + dùng để tạo PO.
            </p>
          </div>
        )}

        <div className="max-h-[400px] overflow-y-auto rounded-xl border border-zinc-200">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur">
              <tr className="border-b border-zinc-100">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-10">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Linh kiện
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  SL
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  Nhà cung cấp
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const hasSupplier = !!l.preferredSupplierId;
                const overrideId = overrides[l.id];
                return (
                  <tr key={l.id} className="border-b border-zinc-50">
                    <td className="px-3 py-3 text-sm text-zinc-500">
                      {l.lineNo}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-semibold text-indigo-600">
                          {l.sku ?? "—"}
                        </span>
                        <span className="text-xs text-zinc-500 truncate max-w-xs">
                          {l.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm font-semibold text-zinc-800">
                      {Number(l.qty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-3">
                      {hasSupplier ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200">
                          <Check className="h-3 w-3" />
                          Đã có NCC
                        </span>
                      ) : (
                        <SupplierPicker
                          value={overrideId}
                          onChange={(sid) =>
                            setOverrides((prev) => ({
                              ...prev,
                              [l.id]: sid,
                            }))
                          }
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <div className="flex items-center justify-between rounded-xl bg-indigo-50/60 px-4 py-3 text-sm">
          <span className="text-zinc-600">Sẽ tạo:</span>
          <span className="font-semibold text-indigo-700">
            {supplierGrouping} PO ({lines.length} dòng tổng)
          </span>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Huỷ
          </Button>
          <Button
            onClick={() => void handleSubmit()}
            disabled={
              convert.isPending ||
              (linesWithoutSupplier.length > 0 && !allHaveSupplier)
            }
          >
            {convert.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowRight className="h-3.5 w-3.5" />
            )}
            Tạo PO
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── Supplier picker (compact) ──────────────────────────────────────────── */

function SupplierPicker({
  value,
  onChange,
}: {
  value: string | undefined;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const suppliersQuery = useSuppliersList({
    q: query,
    pageSize: 50,
    isActive: true,
  });
  const suppliers = (suppliersQuery.data?.data ?? []) as SupplierRow[];
  const selected = suppliers.find((s) => s.id === value);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-white px-2.5 text-left text-sm transition-colors",
            value
              ? "border-indigo-200 bg-indigo-50/40 text-indigo-700"
              : "border-amber-200 bg-amber-50/40 text-amber-700 hover:border-amber-300",
          )}
        >
          <span className="truncate">
            {selected ? `${selected.code} — ${selected.name}` : "⚠ Chọn NCC…"}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0" sideOffset={4}>
        <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center border-b border-zinc-200 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-zinc-400" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm NCC..."
              className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-zinc-400"
            />
          </div>
          <CommandPrimitive.List className="max-h-[240px] overflow-y-auto p-1">
            {suppliersQuery.isLoading ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">
                Đang tải…
              </div>
            ) : suppliers.length === 0 ? (
              <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500">
                Không tìm thấy
              </CommandPrimitive.Empty>
            ) : (
              <CommandPrimitive.Group>
                {suppliers.map((s) => (
                  <CommandPrimitive.Item
                    key={s.id}
                    value={`${s.code} ${s.name}`}
                    onSelect={() => {
                      onChange(s.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-indigo-50"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        s.id === value ? "text-indigo-600" : "text-transparent",
                      )}
                    />
                    <span className="font-mono text-xs font-semibold text-zinc-800">
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
  );
}
