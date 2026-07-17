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
  Plus,
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
 * V3.10.2 — NCC ngoài chọn từ dropdown còn có thể GÕ TAY tên NCC mới. Tên mới
 * gửi qua `newSupplierNames`; backend find-or-create supplier rồi tạo PO.
 * Dòng vật tư nhập tay (không có item master) nay cũng convert được — backend
 * tự chuẩn hoá sang danh mục Item.
 */

export interface ConvertPRLine {
  id: string;
  lineNo: number;
  itemId?: string | null;
  sku: string | null;
  name: string | null;
  qty: string;
  preferredSupplierId: string | null;
}

/** Lựa chọn NCC cho 1 dòng: chọn NCC có sẵn hoặc gõ tên NCC mới. */
type SupplierSelection =
  | { kind: "existing"; id: string; label: string }
  | { kind: "new"; name: string };

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
  const [sel, setSel] = React.useState<Record<string, SupplierSelection>>({});

  // Reset khi open
  React.useEffect(() => {
    if (open) setSel({});
  }, [open]);

  const linesWithoutSupplier = lines.filter((l) => !l.preferredSupplierId);
  const allResolved = linesWithoutSupplier.every((l) => sel[l.id]);

  const handleSubmit = async () => {
    if (linesWithoutSupplier.length > 0 && !allResolved) {
      toast.error(
        `Còn ${
          linesWithoutSupplier.filter((l) => !sel[l.id]).length
        } dòng chưa chọn NCC`,
      );
      return;
    }
    // Tách lựa chọn thành 2 map: NCC có sẵn (id) và NCC nhập tay (tên).
    const supplierOverrides: Record<string, string> = {};
    const newSupplierNames: Record<string, string> = {};
    for (const [lineId, s] of Object.entries(sel)) {
      if (s.kind === "existing") supplierOverrides[lineId] = s.id;
      else if (s.name.trim()) newSupplierNames[lineId] = s.name.trim();
    }
    try {
      const res = await convert.mutateAsync({
        prId,
        supplierOverrides:
          Object.keys(supplierOverrides).length > 0
            ? supplierOverrides
            : undefined,
        newSupplierNames:
          Object.keys(newSupplierNames).length > 0
            ? newSupplierNames
            : undefined,
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
    // Số PO sẽ tạo = số NCC hiệu lực khác nhau (có sẵn theo id, nhập tay theo tên).
    const keys = new Set<string>();
    for (const l of lines) {
      if (l.preferredSupplierId) {
        keys.add(`id:${l.preferredSupplierId}`);
        continue;
      }
      const s = sel[l.id];
      if (!s) continue;
      keys.add(
        s.kind === "existing"
          ? `id:${s.id}`
          : `new:${s.name.trim().toLowerCase()}`,
      );
    }
    return keys.size;
  }, [lines, sel]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowRight className="h-5 w-5 text-indigo-600" />
            Tạo PO từ {prCode}
          </DialogTitle>
          <DialogDescription>
            Chọn nhà cung cấp cho từng dòng (có thể gõ tên NCC mới). Hệ thống tự
            động group các dòng cùng NCC vào 1 PO.
          </DialogDescription>
        </DialogHeader>

        {linesWithoutSupplier.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400">
            <p className="flex items-center gap-2 font-semibold">
              <AlertCircle className="h-4 w-4" />
              {linesWithoutSupplier.length} dòng chưa có NCC ưu tiên
            </p>
            <p className="mt-1 text-xs">
              Chọn NCC có sẵn hoặc gõ tên NCC mới cho từng dòng. Lựa chọn được
              lưu vào PR + dùng để tạo PO.
            </p>
          </div>
        )}

        <div className="max-h-[400px] overflow-y-auto rounded-xl border border-zinc-200 dark:border-zinc-800">
          <table className="w-full">
            <thead className="sticky top-0 bg-zinc-50/95 backdrop-blur dark:bg-zinc-800/95">
              <tr className="border-b border-zinc-100 dark:border-zinc-800">
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 w-10 dark:text-zinc-500">
                  #
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Linh kiện
                </th>
                <th className="px-3 py-2.5 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  SL
                </th>
                <th className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                  Nhà cung cấp
                </th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const hasSupplier = !!l.preferredSupplierId;
                return (
                  <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/50">
                    <td className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">
                      {l.lineNo}
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex flex-col">
                        <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                          {l.sku || "—"}
                        </span>
                        <span className="text-xs text-zinc-500 truncate max-w-xs dark:text-zinc-400">
                          {l.name ?? "—"}
                        </span>
                      </div>
                    </td>
                    <td className="px-3 py-3 text-right font-mono text-sm font-semibold text-zinc-800 dark:text-zinc-200">
                      {Number(l.qty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-3">
                      {hasSupplier ? (
                        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-inset ring-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:ring-emerald-800">
                          <Check className="h-3 w-3" />
                          Đã có NCC
                        </span>
                      ) : (
                        <SupplierPicker
                          selection={sel[l.id]}
                          onSelect={(s) =>
                            setSel((prev) => ({ ...prev, [l.id]: s }))
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

        <div className="flex items-center justify-between rounded-xl bg-indigo-50/60 px-4 py-3 text-sm dark:bg-indigo-950/40">
          <span className="text-zinc-600 dark:text-zinc-400">Sẽ tạo:</span>
          <span className="font-semibold text-indigo-700 dark:text-indigo-400">
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
              (linesWithoutSupplier.length > 0 && !allResolved)
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

/* ── Supplier picker (compact) — chọn NCC có sẵn hoặc gõ tên NCC mới ──────── */

function SupplierPicker({
  selection,
  onSelect,
}: {
  selection: SupplierSelection | undefined;
  onSelect: (s: SupplierSelection) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const suppliersQuery = useSuppliersList({
    q: query,
    pageSize: 50,
    isActive: true,
  });
  const suppliers = (suppliersQuery.data?.data ?? []) as SupplierRow[];

  const q = query.trim();
  const hasExact = suppliers.some(
    (s) =>
      s.name.toLowerCase() === q.toLowerCase() ||
      s.code.toLowerCase() === q.toLowerCase(),
  );
  const showCreate = q.length > 0 && !hasExact;

  const triggerLabel = selection
    ? selection.kind === "existing"
      ? selection.label
      : selection.name
    : "⚠ Chọn NCC…";
  const isNew = selection?.kind === "new";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            "flex h-8 w-full items-center justify-between gap-2 rounded-md border bg-white px-2.5 text-left text-sm transition-colors dark:bg-zinc-900",
            selection
              ? "border-indigo-200 bg-indigo-50/40 text-indigo-700 dark:border-indigo-800 dark:bg-indigo-950/40 dark:text-indigo-400"
              : "border-amber-200 bg-amber-50/40 text-amber-700 hover:border-amber-300 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400",
          )}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <span className="truncate">{triggerLabel}</span>
            {isNew ? (
              <span className="shrink-0 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                mới
              </span>
            ) : null}
          </span>
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[320px] p-0" sideOffset={4}>
        <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center border-b border-zinc-200 px-3 py-2 dark:border-zinc-700">
            <Search className="h-3.5 w-3.5 text-zinc-400 dark:text-zinc-500" />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm hoặc gõ tên NCC mới…"
              className="flex-1 bg-transparent px-2 text-sm outline-none placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
            />
          </div>
          <CommandPrimitive.List className="max-h-[240px] overflow-y-auto p-1">
            {suppliersQuery.isLoading ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                Đang tải…
              </div>
            ) : (
              <>
                {suppliers.length === 0 && !showCreate ? (
                  <CommandPrimitive.Empty className="px-3 py-4 text-center text-xs text-zinc-500 dark:text-zinc-400">
                    Nhập tên để tạo NCC mới…
                  </CommandPrimitive.Empty>
                ) : null}
                {showCreate ? (
                  <CommandPrimitive.Item
                    key="__create_new__"
                    value={`__create__${q}`}
                    onSelect={() => {
                      onSelect({ kind: "new", name: q });
                      setOpen(false);
                      setQuery("");
                    }}
                    className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-emerald-700 aria-selected:bg-emerald-50 dark:text-emerald-400 dark:aria-selected:bg-emerald-950/40"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">
                      Dùng NCC mới: <span className="font-semibold">“{q}”</span>
                    </span>
                  </CommandPrimitive.Item>
                ) : null}
                {suppliers.map((s) => {
                  const selectedExisting =
                    selection?.kind === "existing" && selection.id === s.id;
                  return (
                    <CommandPrimitive.Item
                      key={s.id}
                      value={`${s.code} ${s.name}`}
                      onSelect={() => {
                        onSelect({
                          kind: "existing",
                          id: s.id,
                          label: `${s.code} — ${s.name}`,
                        });
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-950/40"
                    >
                      <Check
                        className={cn(
                          "h-3.5 w-3.5 shrink-0",
                          selectedExisting
                            ? "text-indigo-600 dark:text-indigo-400"
                            : "text-transparent",
                        )}
                      />
                      <span className="font-mono text-xs font-semibold text-zinc-800 dark:text-zinc-200">
                        {s.code}
                      </span>
                      <span className="truncate text-zinc-700 dark:text-zinc-300">{s.name}</span>
                    </CommandPrimitive.Item>
                  );
                })}
              </>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
