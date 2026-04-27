// DEPRECATED: removed from BOM tabs 2026-04-27 (TASK-016). Kept for potential restore.
"use client";

import * as React from "react";
import Link from "next/link";
import { ExternalLink, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { useEcoList, type EcoStatus } from "@/hooks/useEco";
import { formatDate } from "@/lib/format";

const ECO_STATUS_LABELS: Record<EcoStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Đã trình",
  APPROVED: "Đã duyệt",
  APPLIED: "Đã áp dụng",
  REJECTED: "Từ chối",
};

function statusToBadge(s: EcoStatus): BadgeStatus {
  switch (s) {
    case "DRAFT":
      return "draft";
    case "SUBMITTED":
      return "info";
    case "APPROVED":
      return "warning";
    case "APPLIED":
      return "success";
    case "REJECTED":
      return "danger";
    default:
      return "info";
  }
}

export function EcoPanel({ bomId }: { bomId: string }) {
  const query = useEcoList({ bomTemplateId: bomId, page: 1, pageSize: 50 });
  const rows = query.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Inline toolbar */}
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <div className="text-[11px] uppercase tracking-wide text-zinc-500">
          {query.isLoading
            ? "Đang tải ECO…"
            : `${rows.length} ECO gắn với BOM này`}
        </div>
        {/*
         * V2.0 P2 W6 — TASK-20260427-015 NOTE:
         *
         * ECO form (`/eco/new`) là multi-step (chọn BOM, ảnh hưởng orders,
         * kế hoạch áp dụng) — giữ Link sang page riêng vì wire dialog inline
         * sẽ duplicate hơn 200 dòng logic không lợi ích. Click Link mở tab
         * mới → user vẫn không mất context BOM workspace hiện tại.
         */}
        <Button size="sm" variant="outline" asChild>
          <Link
            href={`/eco/new?bomTemplateId=${bomId}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Tạo ECO
          </Link>
        </Button>
      </div>

      <div className="flex-1 overflow-auto">
        {query.isLoading ? (
          <div className="space-y-1 p-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-full items-center justify-center p-6 text-xs text-zinc-500">
            Chưa có ECO cho BOM này.
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
              <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
                <th className="px-3 py-1.5 text-left font-medium">Mã</th>
                <th className="px-3 py-1.5 text-left font-medium">Tiêu đề</th>
                <th className="px-3 py-1.5 text-right font-medium">Orders</th>
                <th className="px-3 py-1.5 text-left font-medium">
                  Trạng thái
                </th>
                <th className="px-3 py-1.5 text-left font-medium">Tạo</th>
                <th className="px-3 py-1.5 w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {rows.map((row) => (
                <tr key={row.id} className="h-8 hover:bg-zinc-50">
                  <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                    {row.code}
                  </td>
                  <td className="px-3 text-zinc-700">{row.title}</td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                    {row.affectedOrdersCount}
                  </td>
                  <td className="px-3">
                    <StatusBadge
                      status={statusToBadge(row.status)}
                      size="sm"
                      label={ECO_STATUS_LABELS[row.status]}
                    />
                  </td>
                  <td className="px-3 text-zinc-500">
                    {formatDate(row.createdAt, "dd/MM/yyyy")}
                  </td>
                  <td className="px-1">
                    <Link
                      href={`/eco/${row.code}`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                      title="Mở ECO"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
