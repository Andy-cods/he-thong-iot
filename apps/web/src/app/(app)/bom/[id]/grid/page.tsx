"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBomDerivedStatus,
  useBomDetail,
  useBomTree,
  useBomWorkspaceSummary,
} from "@/hooks/useBom";
import {
  BomGridPro,
  type MaterialStatus,
} from "@/components/bom-grid-pro";
import {
  AssemblyPanel,
  BomWorkspaceTopbar,
  BottomPanel,
  EcoPanel,
  HistoryDrawer,
  OrdersPanel,
  ProcurementPanel,
  ShortagePanel,
  WorkOrdersPanel,
  useBottomPanelState,
  type PanelKey,
} from "@/components/bom-workspace";

/**
 * V1.7-beta.2.3 — Integrated BOM Grid Workspace (BomGridPro only).
 *
 * Layout: [BomWorkspaceTopbar h-12] → [BomGridPro flex-1] → [BottomPanel]
 *         → [HistoryDrawer right 440px].
 *
 * Univer retired (V1.7-beta.2 Phase D) — chỉ còn Pro Grid (Tanstack table +
 * custom rendering + BomLineSheet edit). Bundle giảm đáng kể (≈24KB → <5KB).
 */
export default function BomGridPage() {
  const { id } = useParams<{ id: string }>();

  const detailQuery = useBomDetail(id);
  const treeQuery = useBomTree(id);
  const summaryQuery = useBomWorkspaceSummary(id);
  const derivedStatusQuery = useBomDerivedStatus(id, !!id);

  const template = detailQuery.data?.data?.template;
  const tree = treeQuery.data?.data?.tree ?? [];
  const summary = summaryQuery.data?.data;

  const panel = useBottomPanelState();

  // Ctrl+Shift+A hotkey — V1.7-beta.2.3: luồng "Thêm linh kiện" dedicated
  // chưa có trong Pro Grid (Univer add dialog đã retire). Toast info đến
  // khi AddComponentDialog hoàn thiện V1.8.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        toast.info(
          "Thêm linh kiện: dùng Actions cell trên dòng hiện có (Nhân bản) để tạo bản sao, hoặc chờ V1.8 có AddComponentDialog riêng.",
        );
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isLoading = detailQuery.isLoading || treeQuery.isLoading;
  const isObsolete = template?.status === "OBSOLETE";

  // BottomPanel render helper
  const renderPanel = (key: PanelKey) => {
    if (!id) return null;
    switch (key) {
      case "orders":
        return <OrdersPanel bomId={id} />;
      case "work-orders":
        return <WorkOrdersPanel bomId={id} />;
      case "procurement":
        return <ProcurementPanel bomId={id} />;
      case "shortage":
        return <ShortagePanel bomId={id} />;
      case "eco":
        return <EcoPanel bomId={id} />;
      case "assembly":
        return <AssemblyPanel bomId={id} />;
    }
  };

  const panelCounts = summary
    ? {
        orders: summary.ordersActive,
        "work-orders": summary.workOrdersActive,
        shortage: summary.shortageComponents,
        eco: summary.ecoActive,
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {template && (
        <BomWorkspaceTopbar
          template={template}
          onOpenPanel={panel.setActivePanel}
          onOpenHistory={() => panel.setDrawerHistory(true)}
        />
      )}

      {/* Grid area flex-1 — strip actions đã retire (Univer save/undo); BomGridPro
          có header riêng render BOM title + parent qty chip. */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-zinc-50">
        <div className="flex-1 overflow-hidden p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải BOM…
            </div>
          ) : template ? (
            <BomGridPro
              templateId={template.id}
              templateName={template.name}
              templateCode={template.code}
              parentQty={Number(template.targetQty) || 1}
              tree={tree}
              statusMap={buildStatusMap(derivedStatusQuery.data?.data)}
              readOnly={isObsolete}
              onHistoryLine={() => panel.setDrawerHistory(true)}
            />
          ) : (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-500">
              Không tải được dữ liệu BOM.
            </div>
          )}
        </div>
      </div>

      {/* Bottom Panel — 6 tabs: orders/WO/procurement/shortage/eco/assembly */}
      <BottomPanel
        activePanel={panel.activePanel}
        collapsed={panel.collapsed}
        height={panel.height}
        onSelectPanel={panel.setActivePanel}
        onToggleCollapsed={panel.toggleCollapsed}
        onSetHeight={panel.setHeight}
        renderPanel={renderPanel}
        counts={panelCounts}
      />

      {id && (
        <HistoryDrawer
          bomId={id}
          open={panel.drawerHistory}
          onOpenChange={panel.setDrawerHistory}
        />
      )}
    </div>
  );
}

/**
 * V1.7-beta.2 — map componentItemId → MaterialStatus từ derivedStatus API.
 * Trả undefined cho component chưa có data → BomGridPro dùng default PLANNED.
 */
function buildStatusMap(
  summary:
    | { componentStatuses: Array<{ componentItemId: string; status: string }> }
    | undefined,
): Record<string, MaterialStatus> | undefined {
  if (!summary?.componentStatuses) return undefined;
  const map: Record<string, MaterialStatus> = {};
  for (const c of summary.componentStatuses) {
    map[c.componentItemId] = c.status as MaterialStatus;
  }
  return map;
}
