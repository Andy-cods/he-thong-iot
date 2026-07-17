"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowRight, ChevronDown, ChevronRight, Layers } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  useItemBomUsages,
  type ItemBomUsageTemplate,
} from "@/hooks/useItems";

/**
 * V1.8 Batch 3 — Tab "Dùng trong BOM" trong /items/[id].
 *
 * Hiển thị mọi `bom_template` đang dùng linh kiện này + từng line cụ thể.
 * Click template header → expand/collapse; click "Mở BOM" → điều hướng
 * `/bom/[id]/grid?highlightLine=[lineId]` để tô sáng dòng tương ứng.
 */

export interface ItemBomUsagesPanelProps {
  itemId: string;
}

function mapStatusToBadge(
  status: ItemBomUsageTemplate["templateStatus"],
): BadgeStatus {
  switch (status) {
    case "ACTIVE":
      return "active";
    case "DRAFT":
      return "draft";
    case "OBSOLETE":
      return "inactive";
  }
}

function statusLabel(status: ItemBomUsageTemplate["templateStatus"]): string {
  switch (status) {
    case "ACTIVE":
      return "Đang dùng";
    case "DRAFT":
      return "Nháp";
    case "OBSOLETE":
      return "Ngừng";
  }
}

export function ItemBomUsagesPanel({ itemId }: ItemBomUsagesPanelProps) {
  const query = useItemBomUsages(itemId);
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());

  const data = query.data?.data;

  // Expand template đầu tiên mặc định khi load xong.
  React.useEffect(() => {
    if (data?.byTemplate.length && expanded.size === 0) {
      setExpanded(new Set([data.byTemplate[0]!.templateId]));
    }
  }, [data, expanded.size]);

  const toggle = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (query.isLoading) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <Skeleton className="mb-3 h-5 w-64" />
        <div className="space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-3/4" />
        </div>
      </div>
    );
  }

  if (query.isError) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EmptyState
          preset="error"
          title="Không tải được danh sách BOM"
          description={(query.error as Error)?.message ?? "Thử lại sau."}
        />
      </div>
    );
  }

  if (!data || data.totalUsages === 0) {
    return (
      <div className="rounded-md border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
        <EmptyState
          preset="no-data"
          title="Chưa được dùng trong BOM nào"
          description="Linh kiện này hiện chưa xuất hiện trong bất kỳ BOM nào. Vào mục BOM List để thêm."
          actions={
            <Button asChild size="sm" variant="outline">
              <Link href="/bom">Đi tới BOM List</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Summary card */}
      <div className="flex items-center gap-3 rounded-md border border-indigo-200 bg-indigo-50/60 px-4 py-3 dark:border-indigo-800 dark:bg-indigo-950/40">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400">
          <Layers className="h-4 w-4" aria-hidden="true" />
        </div>
        <div className="flex-1">
          <div className="text-sm font-medium text-zinc-900 dark:text-zinc-50">
            Linh kiện này được dùng trong{" "}
            <span className="font-semibold text-indigo-700 dark:text-indigo-400">
              {data.byTemplate.length} BOM
            </span>
            ,{" "}
            <span className="font-semibold text-indigo-700 dark:text-indigo-400">
              {data.totalUsages} lines
            </span>{" "}
            tổng.
          </div>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Click vào template để xem chi tiết từng vị trí sử dụng. Nút
            &ldquo;Mở BOM&rdquo; sẽ tô sáng dòng trong lưới BOM.
          </p>
        </div>
      </div>

      {/* Accordion by template */}
      <div className="divide-y divide-zinc-200 overflow-hidden rounded-md border border-zinc-200 bg-white dark:divide-zinc-800 dark:border-zinc-800 dark:bg-zinc-900">
        {data.byTemplate.map((tpl) => {
          const isOpen = expanded.has(tpl.templateId);
          return (
            <div key={tpl.templateId} className="bg-white dark:bg-zinc-900">
              <button
                type="button"
                onClick={() => toggle(tpl.templateId)}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                  "hover:bg-zinc-50 dark:hover:bg-zinc-800/60",
                  isOpen && "bg-zinc-50 dark:bg-zinc-800/60",
                )}
              >
                {isOpen ? (
                  <ChevronDown
                    className="h-4 w-4 text-zinc-400 dark:text-zinc-500"
                    aria-hidden="true"
                  />
                ) : (
                  <ChevronRight
                    className="h-4 w-4 text-zinc-400 dark:text-zinc-500"
                    aria-hidden="true"
                  />
                )}
                <span className="font-mono text-sm font-medium text-zinc-900 dark:text-zinc-50">
                  {tpl.templateCode}
                </span>
                <span className="flex-1 truncate text-sm text-zinc-700 dark:text-zinc-300">
                  {tpl.templateName}
                </span>
                <StatusBadge
                  status={mapStatusToBadge(tpl.templateStatus)}
                  label={statusLabel(tpl.templateStatus)}
                  size="sm"
                />
                <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[11px] tabular-nums text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                  {tpl.usages.length} line{tpl.usages.length > 1 ? "s" : ""}
                </span>
                <Button
                  asChild
                  size="sm"
                  variant="outline"
                  className="h-7 gap-1 text-xs"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Link
                    href={`/bom/${tpl.templateId}/grid?highlightLine=${tpl.usages[0]?.lineId ?? ""}`}
                  >
                    Mở BOM
                    <ArrowRight className="h-3 w-3" aria-hidden="true" />
                  </Link>
                </Button>
              </button>

              {isOpen && (
                <div className="border-t border-zinc-100 bg-zinc-50/40 dark:border-zinc-800 dark:bg-zinc-800/40">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10px] font-medium uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                        <th className="px-4 py-2 text-left">Dòng</th>
                        <th className="px-2 py-2 text-right">SL/bộ</th>
                        <th className="px-2 py-2 text-right">Hao hụt</th>
                        <th className="px-2 py-2 text-left">Thuộc cụm</th>
                        <th className="px-2 py-2 text-right">Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tpl.usages.map((u, idx) => (
                        <tr
                          key={u.lineId}
                          className="border-t border-zinc-100 hover:bg-white dark:border-zinc-800 dark:hover:bg-zinc-900"
                        >
                          <td className="px-4 py-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
                            #{idx + 1}
                            <span className="ml-2 text-[10px] text-zinc-400 dark:text-zinc-500">
                              {u.lineId.slice(0, 8)}
                            </span>
                            {u.childCount > 0 && (
                              <span className="ml-2 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800">
                                cụm · {u.childCount} con
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-zinc-800 dark:text-zinc-200">
                            {formatNumber(u.quantityPer)}
                          </td>
                          <td className="px-2 py-2 text-right font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400">
                            {u.scrapPct > 0
                              ? `${u.scrapPct.toFixed(1)}%`
                              : "—"}
                          </td>
                          <td className="px-2 py-2 text-xs text-zinc-500 dark:text-zinc-400">
                            {u.parentItemId ? (
                              <Link
                                href={`/items/${u.parentItemId}`}
                                className="font-mono text-indigo-700 hover:underline dark:text-indigo-400"
                              >
                                {u.parentItemId.slice(0, 8)}…
                              </Link>
                            ) : (
                              <span className="italic text-zinc-400 dark:text-zinc-500">
                                gốc
                              </span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-right">
                            <Button
                              asChild
                              size="sm"
                              variant="ghost"
                              className="h-7 gap-1 text-xs"
                            >
                              <Link
                                href={`/bom/${tpl.templateId}/grid?highlightLine=${u.lineId}`}
                              >
                                Xem dòng
                                <ArrowRight
                                  className="h-3 w-3"
                                  aria-hidden="true"
                                />
                              </Link>
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
