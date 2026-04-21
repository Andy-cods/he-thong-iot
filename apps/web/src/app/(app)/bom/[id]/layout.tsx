"use client";

import * as React from "react";
import { useParams } from "next/navigation";
import { useBomDetail } from "@/hooks/useBom";
import { Skeleton } from "@/components/ui/skeleton";
import { BomWorkspaceTopbar } from "@/components/bom-workspace/BomWorkspaceTopbar";
import {
  useBottomPanelState,
  type PanelKey,
} from "@/components/bom-workspace/useBottomPanelState";
import { HistoryDrawer } from "@/components/bom-workspace/HistoryDrawer";

/**
 * BOM Workspace Layout V1.7-beta (brainstorm §2 Pattern B).
 *
 * Thay thế ContextualSidebar V1.6 bằng BomWorkspaceTopbar h-12 ở trên
 * cùng. Children (grid/tree/import/...) fill phần còn lại. Bottom Panel
 * được render bên trong grid/page.tsx (gần state edit grid nhất).
 *
 * State Topbar/Panel/Drawer share qua URL search params — bookmark OK,
 * refresh giữ state.
 */
export default function BomWorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const bomId = params?.id ?? null;
  const detailQuery = useBomDetail(bomId);
  const panelState = useBottomPanelState();

  const template = detailQuery.data?.data?.template;

  // Route phụ không phải workspace (new/import) → skip layout wrapper
  if (bomId === "new" || bomId === "import") {
    return <>{children}</>;
  }

  if (detailQuery.isLoading || !template) {
    return (
      <div className="flex h-full flex-col">
        <div className="flex h-12 items-center gap-3 border-b border-zinc-200 bg-white px-3">
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="h-4 w-40" />
        </div>
        <div className="flex-1 overflow-auto p-4">
          <Skeleton className="h-full w-full" />
        </div>
      </div>
    );
  }

  if (detailQuery.isError) {
    return <>{children}</>;
  }

  const handleOpenPanel = (panel: PanelKey) => {
    panelState.setActivePanel(panel);
  };

  const handleOpenHistory = () => {
    panelState.setDrawerHistory(true);
  };

  return (
    <div className="flex h-full min-h-[calc(100vh-var(--topbar-height,44px))] flex-col">
      <BomWorkspaceTopbar
        template={template}
        onOpenPanel={handleOpenPanel}
        onOpenHistory={handleOpenHistory}
      />
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        {children}
      </div>
      <HistoryDrawer
        bomId={template.id}
        open={panelState.drawerHistory}
        onOpenChange={panelState.setDrawerHistory}
      />
    </div>
  );
}
