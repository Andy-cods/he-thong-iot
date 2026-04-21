"use client";

import * as React from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Cloud, CloudOff, Loader2, Plus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { UniverSpreadsheetLazy } from "@/components/bom-grid/UniverSpreadsheetLazy";
import type {
  UniverSpreadsheetHandle,
  UniverWorkbookSnapshot,
} from "@/components/bom-grid/UniverSpreadsheet";
import {
  AddItemDialog,
  type MasterItem,
} from "@/components/bom-grid/AddItemDialog";
import {
  useBomDetail,
  useBomDerivedStatus,
  useBomGrid,
  useBomTree,
  useBomWorkspaceSummary,
  useSaveBomGrid,
} from "@/hooks/useBom";
import { buildWorkbookFromTemplate } from "@/lib/bom-grid/build-workbook";
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
 * V1.7-beta — Integrated BOM Grid Workspace.
 *
 * Layout: [BomWorkspaceTopbar h-12 (layout.tsx)] → [Strip actions h-10] →
 *         [Univer Grid flex-1] → [BottomPanel h-auto] → [HistoryDrawer
 *         right 440px (layout.tsx)].
 */
export default function BomGridPage() {
  const { id } = useParams<{ id: string }>();

  const searchParams = useSearchParams();
  // V1.7-beta.2 — default BomGridPro (Tanstack table). Fallback Univer
  // classic qua ?mode=univer (2 tuần dual-mode trước khi retire).
  const gridMode = searchParams?.get("mode") === "univer" ? "univer" : "pro";

  const detailQuery = useBomDetail(id);
  const gridQuery = useBomGrid(id);
  const treeQuery = useBomTree(id);
  const saveMutation = useSaveBomGrid(id);
  const summaryQuery = useBomWorkspaceSummary(id);
  const derivedStatusQuery = useBomDerivedStatus(id, !!id);

  const gridRef = React.useRef<UniverSpreadsheetHandle>(null);
  const [addOpen, setAddOpen] = React.useState(false);
  const [lastSavedAt, setLastSavedAt] = React.useState<Date | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);
  const autoSaveTimer = React.useRef<ReturnType<typeof setTimeout>>(undefined);

  // Undo stack — V1.7 fix P0: capture snapshot TRƯỚC mutation (seed từ
  // initialSnapshot khi load, update prevSnapRef sau mỗi save thành công).
  const undoStack = React.useRef<UniverWorkbookSnapshot[]>([]);
  const prevSnapRef = React.useRef<UniverWorkbookSnapshot | null>(null);
  const [canUndo, setCanUndo] = React.useState(false);

  const template = detailQuery.data?.data?.template;
  const tree = treeQuery.data?.data?.tree ?? [];
  const summary = summaryQuery.data?.data;

  const panel = useBottomPanelState();

  const initialSnapshot = React.useMemo(() => {
    if (!gridQuery.data || !template) return undefined;
    if (gridQuery.data.data) return gridQuery.data.data;
    if (tree.length > 0) {
      return buildWorkbookFromTemplate(
        {
          id: template.id,
          code: template.code,
          name: template.name,
          targetQty: template.targetQty,
        },
        tree,
      );
    }
    return {
      id: `bom-${id}`,
      name: template.code,
      appVersion: "0.21.0",
      locale: "viVN",
    };
  }, [gridQuery.data, template, tree, id]);

  React.useEffect(() => {
    if (initialSnapshot && !prevSnapRef.current) {
      prevSnapRef.current = initialSnapshot as UniverWorkbookSnapshot;
    }
  }, [initialSnapshot]);

  const handleEdit = React.useCallback(
    (snap: UniverWorkbookSnapshot) => {
      if (prevSnapRef.current) {
        undoStack.current = [prevSnapRef.current, ...undoStack.current].slice(
          0,
          5,
        );
        setCanUndo(undoStack.current.length > 0);
      }
      clearTimeout(autoSaveTimer.current);
      autoSaveTimer.current = setTimeout(() => {
        setIsSaving(true);
        saveMutation
          .mutateAsync(snap)
          .then(() => {
            setLastSavedAt(new Date());
            prevSnapRef.current = snap;
          })
          .catch(() => toast.error("Auto-save thất bại — kiểm tra kết nối."))
          .finally(() => setIsSaving(false));
      }, 2000);
    },
    [saveMutation],
  );

  const handleUndo = React.useCallback(() => {
    const prev = undoStack.current.shift();
    setCanUndo(undoStack.current.length > 0);
    if (!prev) return;
    setIsSaving(true);
    saveMutation
      .mutateAsync(prev)
      .then(() => {
        setLastSavedAt(new Date());
        prevSnapRef.current = prev;
        toast.success("Đã hoàn tác về phiên bản trước.");
      })
      .catch(() => toast.error("Hoàn tác thất bại."))
      .finally(() => setIsSaving(false));
  }, [saveMutation]);

  const handleManualSave = () => {
    const snap = gridRef.current?.save();
    if (!snap) return;
    setIsSaving(true);
    saveMutation
      .mutateAsync(snap)
      .then(() => {
        setLastSavedAt(new Date());
        prevSnapRef.current = snap;
        toast.success("Đã lưu BOM Grid.");
      })
      .catch(() => toast.error("Lưu thất bại — thử lại sau."))
      .finally(() => setIsSaving(false));
  };

  const handleSelectItem = (item: MasterItem) => {
    gridRef.current?.insertItemRow({
      sku: item.sku,
      name: item.name,
      itemType: item.itemType,
      category: item.category,
      uom: item.uom,
    });
  };

  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        setAddOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const isLoading =
    detailQuery.isLoading || gridQuery.isLoading || treeQuery.isLoading;

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
      {/* V1.7-beta — Topbar h-12 render trong page (không phải layout) vì
          client layout wrapper làm redirect() từ server page con không fire
          HTTP 307. Xem comment trong bom/[id]/layout.tsx. */}
      {template && (
        <BomWorkspaceTopbar
          template={template}
          onOpenPanel={panel.setActivePanel}
          onOpenHistory={() => panel.setDrawerHistory(true)}
        />
      )}

      {/* Strip actions h-10 — compact edit toolbar */}
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white px-3">
        <span className="inline-flex items-center gap-1.5 text-[11px] text-zinc-500">
          {isSaving ? (
            <>
              <Loader2 className="h-3 w-3 animate-spin text-indigo-500" />
              Đang lưu…
            </>
          ) : lastSavedAt ? (
            <>
              <Cloud className="h-3 w-3 text-emerald-500" />
              Đã lưu {lastSavedAt.toLocaleTimeString("vi-VN")}
            </>
          ) : template?.updatedAt ? (
            <>
              <Cloud className="h-3 w-3 text-zinc-400" />
              Lưu lần cuối{" "}
              {new Date(template.updatedAt).toLocaleString("vi-VN", {
                hour: "2-digit",
                minute: "2-digit",
                day: "2-digit",
                month: "2-digit",
              })}
            </>
          ) : (
            <>
              <CloudOff className="h-3 w-3 text-zinc-400" />
              Chưa lưu
            </>
          )}
        </span>

        <span className="text-[11px] text-zinc-400">
          Tổng SL = SL/bộ × Số lượng parent
        </span>

        <div className="flex-1" />

        <Button
          size="sm"
          variant="ghost"
          onClick={handleUndo}
          disabled={!canUndo || isObsolete || isSaving}
          title="Hoàn tác về phiên lưu trước (client-side)"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden />
          Hoàn tác
        </Button>

        <Button
          size="sm"
          variant="outline"
          onClick={() => setAddOpen(true)}
          disabled={isObsolete}
          title="Thêm linh kiện (Ctrl+Shift+A)"
        >
          <Plus className="h-3.5 w-3.5" aria-hidden />
          Thêm linh kiện
          <kbd className="ml-1 hidden items-center rounded border border-zinc-200 bg-zinc-50 px-1 text-[10px] font-mono text-zinc-500 sm:inline-flex">
            Ctrl+Shift+A
          </kbd>
        </Button>

        <Button
          size="sm"
          onClick={handleManualSave}
          disabled={isObsolete || isSaving}
        >
          {isSaving ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : null}
          Lưu Grid
        </Button>
      </div>

      {/* Grid area flex-1 */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-zinc-50">
        <div className="flex-1 overflow-hidden p-3">
          {isLoading ? (
            <div className="flex h-full items-center justify-center rounded-md border border-zinc-200 bg-white text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải BOM…
            </div>
          ) : gridMode === "pro" && template ? (
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
            <div className="h-full overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
              {initialSnapshot ? (
                <UniverSpreadsheetLazy
                  ref={gridRef}
                  key={id}
                  initialSnapshot={initialSnapshot}
                  onEdit={isObsolete ? undefined : handleEdit}
                />
              ) : (
                <div className="flex h-full items-center justify-center text-sm text-zinc-500">
                  Không tải được dữ liệu BOM.
                </div>
              )}
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

      <AddItemDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        onSelect={handleSelectItem}
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
