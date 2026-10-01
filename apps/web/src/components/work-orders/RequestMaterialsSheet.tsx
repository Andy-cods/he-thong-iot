"use client";

import * as React from "react";
import { AlertTriangle, Loader2, PackageCheck, ShoppingCart } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useRequestWoMaterials, useWoMaterialPlan } from "@/hooks/useWorkOrders";

/**
 * V4.4 (Việc 1) — "Xin vật tư theo BOM": tính nhu cầu = BOM (Section II của
 * chính LSX, hoặc bom_line gốc của bomTemplateId nếu chưa có Section II) ×
 * SL kế hoạch, TRỪ phần đã xin (ISR/PR gắn lệnh này) → tách phần kho đủ
 * (Yêu cầu xuất kho) và phần thiếu (Đề xuất vật tư) → xác nhận 1 lần tạo cả
 * hai. Bấm lần 2 chỉ còn phần chưa xin (server tính lại từ đầu mỗi lần).
 */

const EPS = 1e-6;
const fmt = (n: number) => formatQty(n);

export function RequestMaterialsSheet({
  open,
  onOpenChange,
  woId,
  woNo,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  woId: string;
  woNo: string;
}) {
  const plan = useWoMaterialPlan(open ? woId : null);
  const requestMaterials = useRequestWoMaterials(woId);

  const rows = plan.data?.data.rows ?? [];
  const totalToIssue = rows.reduce((s, r) => s + r.toIssueFromStock, 0);
  const totalShort = rows.reduce((s, r) => s + r.shortToBuy, 0);
  const totalRemaining = rows.reduce((s, r) => s + r.remaining, 0);
  const nothingToRequest = !plan.isLoading && totalRemaining <= EPS;

  const isrLineCount = rows.filter((r) => r.toIssueFromStock > EPS).length;
  const prLineCount = rows.filter((r) => r.shortToBuy > EPS).length;
  const actionLabel =
    isrLineCount > 0 && prLineCount > 0
      ? `Tạo 1 yêu cầu xuất (${isrLineCount} dòng) + 1 đề xuất mua (${prLineCount} dòng)`
      : isrLineCount > 0
        ? `Tạo 1 yêu cầu xuất kho (${isrLineCount} dòng)`
        : prLineCount > 0
          ? `Tạo 1 đề xuất mua (${prLineCount} dòng)`
          : "Không còn gì để xin";

  const handleConfirm = () => {
    requestMaterials.mutate(undefined, {
      onSuccess: (res) => {
        const { isr, pr } = res.data;
        const parts: string[] = [];
        if (isr) parts.push(`ISR ${isr.requestNo} (${fmt(isr.totalQty)})`);
        if (pr) parts.push(`PR ${pr.paperFormNo ?? pr.code} (${fmt(pr.totalQty)})`);
        toast.success(
          parts.length > 0
            ? `Đã tạo: ${parts.join(" · ")}`
            : "Đã xử lý yêu cầu vật tư.",
        );
        onOpenChange(false);
      },
      onError: (e) => toast.error(`Lỗi: ${(e as Error).message}`),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" hideCloseButton>
        <SheetHeaderNav
          title={`Xin vật tư — ${woNo}`}
          onCancel={() => onOpenChange(false)}
          action={{
            label: requestMaterials.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              actionLabel
            ),
            onClick: handleConfirm,
            disabled:
              plan.isLoading ||
              requestMaterials.isPending ||
              nothingToRequest ||
              rows.length === 0,
          }}
        />
        <SheetBody>
          {plan.isLoading ? (
            <p className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> Đang tính nhu cầu vật tư...
            </p>
          ) : plan.isError ? (
            <p className="text-sm text-red-600 dark:text-red-400">
              Không tải được nhu cầu vật tư: {(plan.error as Error).message}
            </p>
          ) : rows.length === 0 ? (
            <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Lệnh này chưa có vật tư BOM để xin — chưa nhập mục "II. Nguyên
              vật liệu (BOM)" hoặc chưa gắn BOM template.
            </div>
          ) : (
            <>
              {plan.data?.data.skippedRows ? (
                <p className="mb-3 flex items-start gap-1.5 rounded-md border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                  {plan.data.data.skippedRows} dòng vật tư chưa gắn mã hàng trong
                  danh mục — bỏ qua, không tính vào nhu cầu.
                </p>
              ) : null}

              {/* V4.4 UI nhóm E — chỉ báo cuộn ngang mobile (bảng 6 cột, min-w
                  640px chắc chắn tràn ở 390px). */}
              <p className="mb-1 text-xs text-zinc-400 md:hidden" aria-hidden="true">
                ← Vuốt ngang để xem đủ cột →
              </p>
              <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-700">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                      <th className="px-3 py-2 text-left">Mã / tên</th>
                      <th className="px-3 py-2 text-right">Cần</th>
                      <th className="px-3 py-2 text-right">Đã xin</th>
                      <th className="px-3 py-2 text-right">Tồn khả dụng</th>
                      <th className="px-3 py-2 text-right">Sẽ xuất từ kho</th>
                      <th className="px-3 py-2 text-right">Thiếu phải mua</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.itemId} className="border-b border-zinc-50 dark:border-zinc-800/60">
                        <td className="px-3 py-2.5">
                          <div className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                            {r.sku ?? r.itemId.slice(0, 8)}
                          </div>
                          <div className="max-w-[220px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                            {r.name ?? ""} {r.uom ? `(${r.uom})` : ""}
                          </div>
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">{fmt(r.required)}</td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums text-zinc-500 dark:text-zinc-400">
                          {fmt(r.alreadyRequested)}
                        </td>
                        <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                          {fmt(r.availableStock)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-mono tabular-nums",
                            r.toIssueFromStock > EPS
                              ? "font-semibold text-emerald-700 dark:text-emerald-400"
                              : "text-zinc-300 dark:text-zinc-600",
                          )}
                        >
                          {fmt(r.toIssueFromStock)}
                        </td>
                        <td
                          className={cn(
                            "px-3 py-2.5 text-right font-mono tabular-nums",
                            r.shortToBuy > EPS
                              ? "font-semibold text-amber-700 dark:text-amber-400"
                              : "text-zinc-300 dark:text-zinc-600",
                          )}
                        >
                          {fmt(r.shortToBuy)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {nothingToRequest ? (
                <p className="mt-3 flex items-center gap-1.5 text-sm text-emerald-700 dark:text-emerald-400">
                  <PackageCheck className="h-4 w-4" aria-hidden />
                  Đã xin đủ vật tư theo BOM cho lệnh này — không còn phần nào
                  cần xin thêm.
                </p>
              ) : (
                <div className="mt-3 space-y-1 text-sm">
                  {totalToIssue > EPS ? (
                    <p className="flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400">
                      <PackageCheck className="h-4 w-4" aria-hidden />
                      Kho đủ: tạo <strong>Yêu cầu xuất kho</strong> tổng {fmt(totalToIssue)} — đi
                      luồng Kho duyệt.
                    </p>
                  ) : null}
                  {totalShort > EPS ? (
                    <p className="flex items-center gap-1.5 text-amber-700 dark:text-amber-400">
                      <ShoppingCart className="h-4 w-4" aria-hidden />
                      Thiếu: tạo <strong>Đề xuất vật tư</strong> tổng {fmt(totalShort)} — đi luồng
                      duyệt PR hiện có.
                    </p>
                  ) : null}
                </div>
              )}
            </>
          )}
        </SheetBody>
      </SheetContent>
    </Sheet>
  );
}
