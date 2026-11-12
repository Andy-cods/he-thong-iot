"use client";

import * as React from "react";
import { toast } from "sonner";
import { Command as CommandPrimitive } from "cmdk";
import { Check, Loader2, Plus, Search, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useChangeLineSupplier } from "@/hooks/useBom";
import { useSuppliersList } from "@/hooks/useSuppliers";
import {
  resolveLineSupplier,
  type LineSupplierInput,
  type ResolvedLineSupplier,
} from "@/lib/bom-line-supplier";
import { cn } from "@/lib/utils";

/**
 * BOM V5 / WP2 — ô NCC sửa trực tiếp (lưới + BomLineSheet).
 *  - Hiển thị qua resolveLineSupplier (supplier_id → metadata → pending).
 *  - Dòng còn text chờ chốt: chip "Chọn 1 NCC" + text gốc.
 *  - Gõ tên chưa có → "+ Tạo NCC mới" (NCC needs_review).
 *  - Lưu ngay (PATCH .../supplier) kèm expectedVersion; 409 → toast + refetch.
 */

export interface SupplierCellProps {
  templateId: string;
  lineId: string;
  line: LineSupplierInput;
  /** row_version tại lúc render (lấy từ tree). */
  rowVersion: number;
  /** "cell" gọn trong lưới; "field" cao 36px cho form. */
  variant?: "cell" | "field";
  disabled?: boolean;
  /** Gọi sau khi lưu thành công — chủ sheet cập nhật version cục bộ. */
  onChanged?: (next: { rowVersion: number; supplierId: string | null }) => void;
}

interface Override {
  rowVersion: number;
  resolved: ResolvedLineSupplier;
}

export function SupplierCell({
  templateId,
  lineId,
  line,
  rowVersion,
  variant = "cell",
  disabled,
  onChanged,
}: SupplierCellProps) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  // Kết quả vừa lưu — che dữ liệu cũ cho tới khi tree refetch xong (sheet giữ
  // snapshot dòng nên props có thể cũ hơn).
  const [override, setOverride] = React.useState<Override | null>(null);
  const mutation = useChangeLineSupplier(templateId);

  const useOverride = !!override && override.rowVersion > rowVersion;
  const version = useOverride ? override!.rowVersion : rowVersion;
  const resolved = useOverride ? override!.resolved : resolveLineSupplier(line);

  const suppliersQuery = useSuppliersList({
    q: query.trim() || undefined,
    pageSize: 30,
    isActive: true,
  });
  const suppliers = suppliersQuery.data?.data ?? [];
  const typed = query.trim();
  const exact = suppliers.some(
    (s) => s.name.trim().toLowerCase() === typed.toLowerCase(),
  );
  const canCreate = typed.length >= 2 && !exact && !suppliersQuery.isLoading;

  const commit = async (
    vars: { supplierId?: string | null; newSupplier?: { name: string } },
  ) => {
    setOpen(false);
    setQuery("");
    try {
      const res = await mutation.mutateAsync({
        lineId,
        expectedVersion: version,
        ...vars,
      });
      const d = res.data;
      setOverride({
        rowVersion: d.line.rowVersion,
        resolved: d.supplier
          ? {
              source: "column",
              id: d.supplier.id,
              name: d.supplier.name,
              code: d.supplier.code,
              pending: null,
            }
          : {
              source: d.line.supplierPending ? "pending" : "none",
              id: null,
              name: null,
              code: null,
              pending: d.line.supplierPending,
            },
      });
      onChanged?.({ rowVersion: d.line.rowVersion, supplierId: d.line.supplierId });
      if (d.createdSupplier) {
        toast.success(`Đã tạo NCC "${d.supplier?.name}" (chờ rà soát)`);
      }
    } catch (err) {
      const e = err as Error & {
        status?: number;
        code?: string;
        details?: {
          supplier?: { name?: string } | null;
          changedBy?: string | null;
        };
      };
      if (e.status === 409 && e.code === "VERSION_CONFLICT") {
        const who = e.details?.changedBy ?? "Người khác";
        const now = e.details?.supplier?.name ?? "(chưa chọn)";
        toast.error(`${who} vừa đổi NCC thành ${now}`);
        setOverride(null);
      } else {
        toast.error(e.message || "Không đổi được NCC");
      }
    }
  };

  const busy = mutation.isPending;
  const isPending = resolved.source === "pending";
  const label = resolved.name ?? resolved.code;

  const trigger = (
    <button
      type="button"
      disabled={disabled || busy}
      title={
        isPending
          ? `Excel ghi: "${resolved.pending}" — chọn 1 NCC`
          : (label ?? "Chọn NCC")
      }
      className={cn(
        "group flex w-full min-w-0 items-center gap-1.5 text-left transition-colors",
        "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
        variant === "cell"
          ? "h-7 rounded-md px-1.5 text-[13px] hover:bg-zinc-100 dark:hover:bg-zinc-800/60"
          : "h-9 rounded-xl bg-zinc-100/70 px-3 text-[13px] hover:bg-zinc-100 dark:bg-zinc-800/60 dark:hover:bg-zinc-800",
        (disabled || busy) && "cursor-default opacity-70",
      )}
    >
      {busy ? (
        <Loader2 className="h-3 w-3 shrink-0 animate-spin text-zinc-400" />
      ) : null}
      {isPending ? (
        <>
          <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
            Chọn 1 NCC
          </span>
          <span className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {resolved.pending}
          </span>
        </>
      ) : label ? (
        <span className="truncate text-zinc-800 dark:text-zinc-200">{label}</span>
      ) : (
        <span className="truncate text-zinc-400 dark:text-zinc-500">
          {variant === "cell" ? "—" : "Chọn nhà cung cấp…"}
        </span>
      )}
    </button>
  );

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) setQuery("");
      }}
    >
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        className="w-[320px] rounded-2xl border-0 p-1.5 shadow-xl ring-1 ring-black/5"
      >
        <CommandPrimitive shouldFilter={false} className="flex flex-col" loop>
          <div className="flex items-center gap-2 rounded-xl bg-zinc-100 px-3 py-2 dark:bg-zinc-800">
            <Search className="h-3.5 w-3.5 text-zinc-400" aria-hidden />
            <CommandPrimitive.Input
              autoFocus
              value={query}
              onValueChange={setQuery}
              placeholder="Tìm hoặc gõ tên NCC mới…"
              className="flex-1 bg-transparent text-[13px] outline-none placeholder:text-zinc-400 dark:text-zinc-50"
            />
          </div>
          <CommandPrimitive.List className="mt-1 max-h-[260px] overflow-y-auto">
            {suppliersQuery.isLoading ? (
              <div className="px-3 py-4 text-center text-xs text-zinc-500">Đang tải…</div>
            ) : (
              <>
                {suppliers.map((s) => (
                  <CommandPrimitive.Item
                    key={s.id}
                    value={`${s.code} ${s.name}`}
                    onSelect={() => commit({ supplierId: s.id })}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
                  >
                    <Check
                      className={cn(
                        "h-3.5 w-3.5 shrink-0",
                        s.id === resolved.id ? "text-indigo-600" : "text-transparent",
                      )}
                    />
                    <span className="truncate text-zinc-800 dark:text-zinc-200">{s.name}</span>
                    <span className="ml-auto shrink-0 font-mono text-[11px] text-zinc-400">
                      {s.code}
                    </span>
                  </CommandPrimitive.Item>
                ))}
                {suppliers.length === 0 && !canCreate ? (
                  <div className="px-3 py-4 text-center text-xs text-zinc-500">
                    {typed ? `Không thấy "${typed}".` : "Chưa có NCC trong danh mục."}
                  </div>
                ) : null}
                {canCreate ? (
                  <CommandPrimitive.Item
                    value={`__create__${typed}`}
                    onSelect={() => commit({ newSupplier: { name: typed } })}
                    className="mt-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] font-medium text-indigo-700 aria-selected:bg-indigo-50 dark:text-indigo-300 dark:aria-selected:bg-indigo-950/40"
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" />
                    <span className="truncate">Tạo NCC mới “{typed}”</span>
                  </CommandPrimitive.Item>
                ) : null}
                {resolved.id ? (
                  <CommandPrimitive.Item
                    value="__clear__"
                    onSelect={() => commit({ supplierId: null })}
                    className="mt-0.5 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[13px] text-zinc-500 aria-selected:bg-zinc-100 dark:aria-selected:bg-zinc-800"
                  >
                    <X className="h-3.5 w-3.5 shrink-0" />
                    Bỏ chọn NCC
                  </CommandPrimitive.Item>
                ) : null}
              </>
            )}
          </CommandPrimitive.List>
        </CommandPrimitive>
      </PopoverContent>
    </Popover>
  );
}
