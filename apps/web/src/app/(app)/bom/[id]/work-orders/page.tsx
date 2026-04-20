"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Factory } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useBomDetail } from "@/hooks/useBom";

export default function BomWorkspaceWorkOrdersPage() {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? "";
  const detail = useBomDetail(bomId);
  const template = detail.data?.data?.template;

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "BOM", href: "/bom" },
            { label: template?.code ?? "…", href: `/bom/${bomId}` },
            { label: "Lệnh sản xuất" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <Factory
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Lệnh sản xuất (WO)
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Danh sách Work Orders tham chiếu đến BOM này (JOIN qua sales_order).
              Phase 4 wire API.
            </p>
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href={`/work-orders?bomTemplateId=${bomId}`}>
              Xem trong trang toàn cục
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <EmptyState
          preset="no-data"
          title="Chưa có WO cho BOM này"
          description="V1.6 Phase 4 sẽ filter Work Orders theo bomTemplateId qua JOIN sales_order."
        />
      </div>
    </div>
  );
}
