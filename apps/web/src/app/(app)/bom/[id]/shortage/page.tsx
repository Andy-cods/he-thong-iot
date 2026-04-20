"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ExternalLink, RefreshCw } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useBomDetail } from "@/hooks/useBom";
import { useShortageList } from "@/hooks/useShortage";
import { formatNumber } from "@/lib/format";

export default function BomWorkspaceShortagePage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;

  const shortage = useShortageList({
    bomTemplateId: bomId,
    limit: 500,
  });
  const rows = shortage.data?.data ?? [];
  const totalShort = rows.reduce((s, r) => s + r.totalShort, 0);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "Thiếu hàng" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <AlertCircle
                className="h-5 w-5 text-orange-500"
                aria-hidden="true"
              />
              Thiếu hàng
              {rows.length > 0 ? (
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  ({formatNumber(rows.length)} loại · tổng thiếu{" "}
                  {formatNumber(totalShort)} qty)
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Aggregate shortage từ các orders đang dùng BOM{" "}
              <span className="font-mono text-zinc-700">
                {template?.code ?? "…"}
              </span>
              . On-fly query, bypass materialized view.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => shortage.refetch()}
              disabled={shortage.isFetching}
            >
              <RefreshCw
                className={
                  shortage.isFetching
                    ? "h-3.5 w-3.5 animate-spin"
                    : "h-3.5 w-3.5"
                }
                aria-hidden="true"
              />
              Làm mới
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/shortage?bomTemplateId=${bomId}`}>
                Toàn cục
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {shortage.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : shortage.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được shortage"
            description={(shortage.error as Error)?.message ?? "Lỗi không xác định"}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Không có thiếu hàng"
            description="Tất cả linh kiện đủ hàng hoặc đã có PO mua đủ. Tuyệt!"
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Tên</th>
                  <th className="px-3 py-2 text-right font-medium">Cần</th>
                  <th className="px-3 py-2 text-right font-medium">Có</th>
                  <th className="px-3 py-2 text-right font-medium">Đang mua</th>
                  <th className="px-3 py-2 text-right font-medium text-red-600">
                    Thiếu
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Đơn</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <tr
                    key={r.componentItemId}
                    className="h-9 hover:bg-zinc-50"
                  >
                    <td className="px-3 font-mono text-xs font-semibold text-zinc-700">
                      {r.componentSku}
                    </td>
                    <td className="px-3 text-zinc-700">{r.componentName}</td>
                    <td className="px-3 text-right font-mono text-xs tabular-nums">
                      {formatNumber(r.totalRequired)}
                    </td>
                    <td className="px-3 text-right font-mono text-xs tabular-nums text-emerald-700">
                      {formatNumber(r.totalAvailable)}
                    </td>
                    <td className="px-3 text-right font-mono text-xs tabular-nums text-blue-700">
                      {formatNumber(r.totalOnOrder)}
                    </td>
                    <td className="px-3 text-right font-mono text-xs font-semibold tabular-nums text-red-600">
                      {formatNumber(r.totalShort)}
                    </td>
                    <td className="px-3 text-right font-mono text-xs tabular-nums text-zinc-500">
                      {r.orderCount}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
