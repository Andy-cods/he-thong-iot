"use client";

import * as React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  useBomDerivedStatus,
  useBomDetail,
  useBomFabProgress,
  useBomTree,
  useBomWorkspaceSummary,
} from "@/hooks/useBom";
import { useBomSheetsList } from "@/hooks/useBomSheets";
import { BomSheetTabs } from "@/components/bom/BomSheetTabs";
import { AddBomSheetDialog } from "@/components/bom/AddBomSheetDialog";
import { MaterialProcessSheetView } from "@/components/bom/MaterialProcessSheetView";
import { CustomSheetView } from "@/components/bom/CustomSheetView";
import {
  BomGridPro,
  type MaterialStatus,
} from "@/components/bom-grid-pro";
import {
  AssemblyPanel,
  BomBarcodeSearchDialog,
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
  const router = useRouter();
  const searchParams = useSearchParams();

  const detailQuery = useBomDetail(id);
  const summaryQuery = useBomWorkspaceSummary(id);
  const derivedStatusQuery = useBomDerivedStatus(id, !!id);
  const fabProgressQuery = useBomFabProgress(id, !!id);

  const template = detailQuery.data?.data?.template;
  const summary = summaryQuery.data?.data;

  const panel = useBottomPanelState();

  // V1.8 Batch 7 — Barcode scan dialog state.
  const [scanOpen, setScanOpen] = React.useState(false);

  // V2.0 Sprint 6 — multi-sheet state.
  const sheetsQuery = useBomSheetsList(id ?? null);
  const sheets = sheetsQuery.data?.data ?? [];
  const [activeSheetId, setActiveSheetId] = React.useState<string | null>(null);
  const [addSheetOpen, setAddSheetOpen] = React.useState(false);

  // Tự active sheet đầu tiên (PROJECT) khi sheets load xong.
  React.useEffect(() => {
    if (sheets.length === 0) return;
    if (!activeSheetId || !sheets.find((s) => s.id === activeSheetId)) {
      const firstProject =
        sheets.find((s) => s.kind === "PROJECT") ?? sheets[0];
      if (firstProject) setActiveSheetId(firstProject.id);
    }
  }, [sheets, activeSheetId]);

  // V2.0 Sprint 6 — fetch tree filtered theo activeSheetId. Sheet PROJECT
  // active nào → grid chỉ render lines của sheet đó (KHÔNG render full
  // template như V1 → tránh duplicate UI khi BOM có 2+ sheet PROJECT).
  const activeSheetKind = sheets.find((s) => s.id === activeSheetId)?.kind;
  const treeSheetId =
    activeSheetKind === "PROJECT" ? activeSheetId : null;
  const treeQuery = useBomTree(id, treeSheetId);
  const tree = treeQuery.data?.data?.tree ?? [];

  // Deep-link `?scan=open` → tự mở dialog 1 lần khi load. Sau khi mở, strip
  // param khỏi URL để refresh không mở lại (giữ `highlightLine` nếu có).
  const scanParam = searchParams?.get("scan") ?? null;
  React.useEffect(() => {
    if (scanParam === "open" && !scanOpen) {
      setScanOpen(true);
      const p = new URLSearchParams(searchParams?.toString() ?? "");
      p.delete("scan");
      const qs = p.toString();
      router.replace(`/bom/${id}/grid${qs ? `?${qs}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scanParam]);

  // Ctrl+Shift+A hotkey — V1.7-beta.2.3: luồng "Thêm linh kiện" dedicated
  // chưa có trong Pro Grid (Univer add dialog đã retire). Toast info đến
  // khi AddComponentDialog hoàn thiện V1.8.
  // Alt+S — V1.8 Batch 7: mở BomBarcodeSearchDialog.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        toast.info(
          "Thêm linh kiện: dùng Actions cell trên dòng hiện có (Nhân bản) để tạo bản sao, hoặc chờ V1.8 có AddComponentDialog riêng.",
        );
        return;
      }
      // Alt+S: skip khi focus trong input/textarea để không ăn phím khi user gõ.
      if (e.altKey && !e.ctrlKey && !e.metaKey && (e.key === "s" || e.key === "S")) {
        const tgt = e.target as HTMLElement | null;
        const tag = tgt?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tgt?.isContentEditable) {
          return;
        }
        e.preventDefault();
        setScanOpen(true);
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
        procurement: summary.procurementActive,
        shortage: summary.shortageComponents,
        eco: summary.ecoActive,
        assembly: summary.assemblyInProgress,
      }
    : undefined;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {template && (
        <BomWorkspaceTopbar
          template={template}
          onOpenPanel={panel.setActivePanel}
          onOpenHistory={() => panel.setDrawerHistory(true)}
          onOpenScan={() => setScanOpen(true)}
        />
      )}

      {/* V2.0 Sprint 6 — Sheet tabs (PROJECT / MATERIAL / PROCESS / CUSTOM) */}
      {template && id ? (
        <BomSheetTabs
          sheets={sheets}
          activeSheetId={activeSheetId}
          onChange={setActiveSheetId}
          onAddSheet={() => setAddSheetOpen(true)}
          loading={sheetsQuery.isLoading}
          canAddSheet={!isObsolete}
        />
      ) : null}

      {/* V2.0 Sprint 6 FIX — render content per active sheet kind:
          PROJECT → BomGridPro, MATERIAL → MaterialSheetView, PROCESS →
          ProcessSheetView, CUSTOM → markdown viewer (defer). */}
      <div className="flex min-h-0 flex-1 overflow-hidden bg-zinc-50">
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              Đang tải BOM…
            </div>
          ) : template ? (
            (() => {
              const activeSheet = sheets.find((s) => s.id === activeSheetId);
              const sheetKind = activeSheet?.kind ?? "PROJECT";

              // V2.0 Sprint 6 user feedback: gộp MATERIAL + PROCESS vào 1
              // sheet "Material & Process" giống Excel. Cả 2 kind đều render
              // combined view (material rows + process rows side-by-side).
              if (
                (sheetKind === "MATERIAL" || sheetKind === "PROCESS") &&
                activeSheetId
              ) {
                return (
                  <MaterialProcessSheetView
                    sheetId={activeSheetId}
                    readOnly={isObsolete}
                  />
                );
              }
              if (sheetKind === "CUSTOM" && activeSheet && id) {
                return (
                  <CustomSheetView
                    templateId={id}
                    sheet={activeSheet}
                    readOnly={isObsolete}
                  />
                );
              }
              // PROJECT (default) — BomGridPro
              return (
                <div className="h-full p-3">
                  <BomGridPro
                    templateId={template.id}
                    templateName={template.name}
                    templateCode={template.code}
                    parentQty={Number(template.targetQty) || 1}
                    tree={tree}
                    statusMap={buildStatusMap(derivedStatusQuery.data?.data)}
                    comProgressMap={buildComProgressMap(
                      derivedStatusQuery.data?.data,
                    )}
                    fabProgressMap={fabProgressQuery.data?.data.progress}
                    readOnly={isObsolete}
                    onHistoryLine={() => panel.setDrawerHistory(true)}
                  />
                </div>
              );
            })()
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

      {/* V1.8 Batch 7 — Barcode scan dialog (camera + manual) */}
      {template && (
        <BomBarcodeSearchDialog
          open={scanOpen}
          onOpenChange={setScanOpen}
          bomTemplateId={template.id}
          bomTemplateCode={template.code}
        />
      )}

      {/* V2.0 Sprint 6 — Add sheet dialog */}
      {id ? (
        <AddBomSheetDialog
          templateId={id}
          open={addSheetOpen}
          onOpenChange={setAddSheetOpen}
          onCreated={(sheetId) => setActiveSheetId(sheetId)}
        />
      ) : null}
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

/**
 * V1.9 Phase 2 — map componentItemId → breakdown (pct, milestones, qty)
 * cho ProgressCell com. Dùng cùng derived-status API.
 */
function buildComProgressMap(
  summary:
    | {
        componentStatuses: Array<{
          componentItemId: string;
          pct?: number;
          milestones?: {
            planned: boolean;
            purchasing: boolean;
            purchased: boolean;
            available: boolean;
            issued: boolean;
          };
          totalRequired?: string;
          totalPurchased?: string;
        }>;
      }
    | undefined,
):
  | Record<
      string,
      {
        pct: number;
        milestones: {
          planned: boolean;
          purchasing: boolean;
          purchased: boolean;
          available: boolean;
          issued: boolean;
        };
        requiredQty: number;
        purchasedQty: number;
      }
    >
  | undefined {
  if (!summary?.componentStatuses) return undefined;
  const map: Record<
    string,
    {
      pct: number;
      milestones: {
        planned: boolean;
        purchasing: boolean;
        purchased: boolean;
        available: boolean;
        issued: boolean;
      };
      requiredQty: number;
      purchasedQty: number;
    }
  > = {};
  for (const c of summary.componentStatuses) {
    if (c.milestones === undefined) continue;
    map[c.componentItemId] = {
      pct: c.pct ?? 0,
      milestones: c.milestones,
      requiredQty: Number(c.totalRequired ?? 0),
      purchasedQty: Number(c.totalPurchased ?? 0),
    };
  }
  return map;
}
