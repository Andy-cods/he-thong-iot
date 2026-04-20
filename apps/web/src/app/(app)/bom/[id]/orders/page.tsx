"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ClipboardList, ExternalLink } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useBomDetail } from "@/hooks/useBom";

/**
 * BOM Workspace · sub-route /bom/[id]/orders.
 *
 * V1.6 Phase 3 — Stub UI. Phase 4 sẽ:
 *  - Reuse <OrderListTable /> với `bomTemplateId` filter.
 *  - Reuse <OrderFilterBar /> với chip "BOM: {code}".
 *  - Fetch `/api/orders?bomTemplateId=X` (cần update repo listOrders).
 */
export default function BomWorkspaceOrdersPage() {
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
            { label: "Đơn hàng" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <ClipboardList
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Đơn hàng dùng BOM này
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Danh sách Sales Orders tham chiếu đến{" "}
              <span className="font-mono text-zinc-700">
                {template?.code ?? "…"}
              </span>
              . Phase 4 sẽ wire API filter.
            </p>
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href={`/orders?bomTemplateId=${bomId}`}>
              Xem trong trang toàn cục
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <EmptyState
          preset="no-data"
          title="Chưa có đơn hàng cho BOM này"
          description="V1.6 Phase 4 sẽ filter Sales Orders theo bomTemplateId qua API. Tạm thời, bấm nút bên trên để xem trong danh sách đơn hàng toàn cục."
          actions={
            <Button asChild size="sm">
              <Link href={`/orders/new?bomTemplateId=${bomId}`}>
                Tạo đơn hàng mới cho BOM này
              </Link>
            </Button>
          }
        />
      </div>
    </div>
  );
}
