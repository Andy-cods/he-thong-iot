"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ExternalLink, Wrench } from "lucide-react";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { useBomDetail } from "@/hooks/useBom";

export default function BomWorkspaceAssemblyPage() {
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
            { label: "Lắp ráp" },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <Wrench
                className="h-5 w-5 text-indigo-500"
                aria-hidden="true"
              />
              Lắp ráp (Assembly Progress)
            </h1>
            <p className="mt-1 text-xs text-zinc-500">
              Tiến độ lắp ráp aggregate từ các Work Orders của BOM này.
            </p>
          </div>

          <Button asChild size="sm" variant="outline">
            <Link href={`/work-orders?bomTemplateId=${bomId}`}>
              Xem WO toàn cục
              <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <EmptyState
          preset="no-data"
          title="Chưa có assembly data"
          description="Phase 4 sẽ reuse <ProductionProgressPanel /> multi-WO mode aggregate theo BOM."
        />
      </div>
    </div>
  );
}
