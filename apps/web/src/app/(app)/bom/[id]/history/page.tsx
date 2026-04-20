"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { History } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { EmptyState } from "@/components/ui/empty-state";
import { useActivityLog, useBomDetail } from "@/hooks/useBom";

export default function BomWorkspaceHistoryPage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;
  const activityQuery = useActivityLog("bom_template", bomId, !!bomId);
  const entries = activityQuery.data?.data ?? [];

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "Lịch sử" },
          ]}
        />
        <div className="mt-2">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <History className="h-5 w-5 text-indigo-500" aria-hidden="true" />
            Lịch sử thay đổi
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Merged timeline: BOM revisions + activity log. V1.6 tách riêng khỏi
            tab &quot;Lịch sử&quot; trong trang Tổng quan.
          </p>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        {activityQuery.isLoading ? (
          <p className="text-sm text-zinc-500">Đang tải lịch sử…</p>
        ) : entries.length === 0 ? (
          <EmptyState
            preset="no-data"
            title="Chưa có lịch sử thay đổi"
            description="Log sẽ xuất hiện khi BOM được tạo, chỉnh sửa, release hoặc consume."
          />
        ) : (
          <ol className="max-w-2xl space-y-3">
            {entries.map((entry) => (
              <li key={entry.id} className="flex gap-3">
                <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-indigo-300" />
                <div>
                  <p className="text-sm font-medium text-zinc-800">
                    {entry.action}
                  </p>
                  <p className="text-xs text-zinc-400">
                    {new Date(entry.at).toLocaleString("vi-VN")}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
