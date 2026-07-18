// DEPRECATED: removed from BOM tabs 2026-04-27 (TASK-016). Kept for potential restore.
"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Package2 } from "lucide-react";
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
import { Skeleton } from "@/components/ui/skeleton";
import { useShortageList } from "@/hooks/useShortage";
import { useCreatePRFromShortage } from "@/hooks/usePurchaseRequests";
import { formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";

export function ShortagePanel({
  bomId,
  bomCode,
}: {
  bomId: string;
  bomCode?: string;
}) {
  const query = useShortageList({ bomTemplateId: bomId, limit: 500 });
  const rows = query.data?.data ?? [];

  const [minThreshold, setMinThreshold] = React.useState<string>("0");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const router = useRouter();
  const createPR = useCreatePRFromShortage();

  const filtered = React.useMemo(() => {
    const t = Number(minThreshold) || 0;
    if (t <= 0) return rows;
    return rows.filter((r) => r.totalShort >= t);
  }, [rows, minThreshold]);

  const handleBulkPR = async () => {
    const itemIds = filtered.map((r) => r.componentItemId);
    if (itemIds.length === 0) {
      toast.error("Không có item nào trong filter để tạo PR.");
      return;
    }
    try {
      const res = await createPR.mutateAsync({
        itemIds,
        title: bomCode
          ? `Bù shortage BOM ${bomCode} (${itemIds.length} mã)`
          : `Bù shortage (${itemIds.length} mã)`,
        notes: `Tạo bulk từ tab Thiếu vật tư của BOM workspace.`,
      });
      const created = res.data;
      toast.success(
        `Đã tạo PR ${created.code ?? ""} cho ${itemIds.length} mã thiếu.`,
        created.id
          ? {
              action: {
                label: "Mở PR",
                onClick: () =>
                  router.push(`/procurement/purchase-requests/${created.id}`),
              },
            }
          : undefined,
      );
      setConfirmOpen(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Không tạo được PR bulk.");
    }
  };

  const total = filtered.reduce((s, r) => s + r.totalShort, 0);

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar */}
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/60">
        <label className="flex items-center gap-1.5 text-[11px] text-zinc-600 dark:text-zinc-400">
          Thiếu ≥
          <input
            type="number"
            min={0}
            step={1}
            value={minThreshold}
            onChange={(e) => setMinThreshold(e.target.value)}
            className="h-6 w-16 rounded-sm border border-zinc-200 bg-white px-1.5 text-[11px] tabular-nums focus:border-indigo-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
          />
        </label>
        <span className="text-[11px] text-zinc-500 dark:text-zinc-400">
          {filtered.length} loại · Tổng{" "}
          <span className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
            {formatNumber(total)}
          </span>
        </span>

        <div className="ml-auto">
          <Button
            size="sm"
            variant="outline"
            onClick={() => setConfirmOpen(true)}
            disabled={filtered.length === 0 || createPR.isPending}
          >
            {createPR.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
            ) : (
              <Package2 className="h-3.5 w-3.5" aria-hidden />
            )}
            Tạo PR cho tất cả thiếu
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500 dark:text-zinc-400">
            Không có linh kiện thiếu — đủ vật tư cho BOM này.
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500 dark:text-zinc-400">
            Không có item nào thiếu ≥ {minThreshold}.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm dark:bg-zinc-800/80">
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                <th className="px-3 py-1.5 text-left font-medium">SKU</th>
                <th className="px-3 py-1.5 text-left font-medium">Tên</th>
                <th className="px-3 py-1.5 text-right font-medium">Cần</th>
                <th className="px-3 py-1.5 text-right font-medium">Có</th>
                <th className="px-3 py-1.5 text-right font-medium">
                  Đang mua
                </th>
                <th className="px-3 py-1.5 text-right font-medium text-red-600 dark:text-red-400">
                  Thiếu
                </th>
                <th className="px-3 py-1.5 text-right font-medium">Đơn</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
              {filtered.map((r) => (
                <tr key={r.componentItemId} className="h-8 hover:bg-zinc-50 dark:hover:bg-zinc-800/60">
                  <td className="px-3 font-mono text-[11px] font-semibold text-zinc-700 dark:text-zinc-300">
                    {r.componentSku}
                  </td>
                  <td className="px-3 text-zinc-700 dark:text-zinc-300">{r.componentName}</td>
                  <td className="px-3 text-right font-mono tabular-nums dark:text-zinc-300">
                    {formatNumber(r.totalRequired)}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-emerald-700 dark:text-emerald-400">
                    {formatNumber(r.totalAvailable)}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-blue-700 dark:text-blue-400">
                    {formatNumber(r.totalOnOrder)}
                  </td>
                  <td
                    className={cn(
                      "px-3 text-right font-mono font-semibold tabular-nums text-red-600 dark:text-red-400",
                    )}
                  >
                    {formatNumber(r.totalShort)}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                    {r.orderCount}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle className="text-[15px]">
              Tạo PR cho {filtered.length} item thiếu?
            </DialogTitle>
            <DialogDescription className="text-xs text-zinc-500 dark:text-zinc-400">
              Hệ thống sẽ tạo 1 PR (DRAFT) gộp tất cả {filtered.length} item
              thiếu (≥ {minThreshold}) trong filter hiện tại. Repo tự tính số
              lượng = remaining_short × 1.1 và lookup preferred supplier.
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-md border border-zinc-100 bg-zinc-50 px-3 py-2 text-[12px] text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800 dark:text-zinc-300">
            Tổng số lượng cần bù:{" "}
            <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-50">
              {formatNumber(total)}
            </span>
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={createPR.isPending}
            >
              Huỷ
            </Button>
            <Button
              onClick={() => void handleBulkPR()}
              disabled={createPR.isPending}
            >
              {createPR.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Tạo PR
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
