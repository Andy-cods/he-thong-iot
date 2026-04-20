"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, GitBranch, Plus } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import { useBomDetail } from "@/hooks/useBom";
import { useEcoList, type EcoStatus } from "@/hooks/useEco";
import { formatDate, formatNumber } from "@/lib/format";

const ECO_STATUS_LABELS: Record<EcoStatus, string> = {
  DRAFT: "Nháp",
  SUBMITTED: "Đã trình",
  APPROVED: "Đã duyệt",
  APPLIED: "Đã áp dụng",
  REJECTED: "Từ chối",
};

function ecoStatusToBadge(status: EcoStatus): BadgeStatus {
  switch (status) {
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

export default function BomWorkspaceEcoPage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;

  const ecoList = useEcoList({
    bomTemplateId: bomId,
    page: 1,
    pageSize: 50,
  });
  const rows = ecoList.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "ECO" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <GitBranch
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Engineering Change Order (ECO)
              {ecoList.data?.meta ? (
                <span className="ml-1 text-sm font-normal text-zinc-500">
                  ({formatNumber(ecoList.data.meta.total)})
                </span>
              ) : null}
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Yêu cầu thay đổi kỹ thuật áp dụng lên BOM{" "}
              <span className="font-mono text-zinc-700">
                {template?.code ?? "…"}
              </span>
              .
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button asChild size="sm">
              <Link href={`/eco/new?bomTemplateId=${bomId}`}>
                <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                Tạo ECO
              </Link>
            </Button>
            <Button asChild size="sm" variant="outline">
              <Link href={`/eco?bomTemplateId=${bomId}`}>
                Toàn cục
                <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {ecoList.isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full" />
            ))}
          </div>
        ) : ecoList.isError ? (
          <EmptyState
            preset="error"
            title="Không tải được ECO"
            description={(ecoList.error as Error)?.message ?? "Lỗi không xác định"}
          />
        ) : rows.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Chưa có ECO cho BOM này"
            description="Tạo ECO khi cần thay đổi thành phần, số lượng hoặc quy trình sản xuất."
            actions={
              <Button asChild size="sm">
                <Link href={`/eco/new?bomTemplateId=${bomId}`}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Tạo ECO đầu tiên
                </Link>
              </Button>
            }
          />
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-200 bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 text-left font-medium">Mã</th>
                  <th className="px-3 py-2 text-left font-medium">Tiêu đề</th>
                  <th className="px-3 py-2 text-right font-medium">Orders ảnh hưởng</th>
                  <th className="px-3 py-2 text-left font-medium">Trạng thái</th>
                  <th className="px-3 py-2 text-left font-medium">Tạo</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {rows.map((row) => (
                  <tr key={row.id} className="h-9 hover:bg-zinc-50">
                    <td className="px-3">
                      <Link
                        href={`/eco/${row.code}`}
                        className="font-mono text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                      >
                        {row.code}
                      </Link>
                    </td>
                    <td className="px-3 text-zinc-700">{row.title}</td>
                    <td className="px-3 text-right font-mono text-xs tabular-nums text-zinc-700">
                      {row.affectedOrdersCount}
                    </td>
                    <td className="px-3">
                      <StatusBadge
                        status={ecoStatusToBadge(row.status)}
                        size="sm"
                        label={ECO_STATUS_LABELS[row.status]}
                      />
                    </td>
                    <td className="px-3 text-xs text-zinc-500">
                      {formatDate(row.createdAt, "dd/MM/yyyy")}
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
