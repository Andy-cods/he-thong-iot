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
  BomAuditPanel,
  BomBarcodeSearchDialog,
  BomProductionPanel,
  BomWorkspaceTopbar,
  HistoryDrawer,
  OrdersPanel,
  ProcurementPanel,
  TopTabBar,
  WorkOrdersPanel,
  useTopTabState,
  type TopTabKey,
} from "@/components/bom-workspace";

/**
 * V2.0 P2 W6 — TASK-20260427-015 — BOM Workspace với top tab navigation.
 *
 * Layout:
 *   [BomWorkspaceTopbar h-12]
 *   [TopTabBar h-9 sticky top-0 z-20]
 *     ├ Vật tư & Quy trình (default — BOM grid + sheet tabs)
 *     ├ Đơn hàng / Snapshot / Sản xuất / Lệnh SX / Mua sắm / ...
 *   [Content area — render panel theo activeTab]
 *   [HistoryDrawer right 440px]
 *
 * Khác V1.7-beta:
 *  - BỎ BottomPanel (collapsed bar chiếm slot dưới grid).
 *  - Mỗi tab có toolbar inline action ở đầu (tạo dialog/sheet, KHÔNG redirect).
 *  - URL state ?tab=... (legacy ?panel=... vẫn redirect được).
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

  const tabs = useTopTabState();

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

  const activeSheetKind = sheets.find((s) => s.id === activeSheetId)?.kind;
  const treeSheetId =
    activeSheetKind === "PROJECT" ? activeSheetId : null;
  const treeQuery = useBomTree(id, treeSheetId);
  const tree = treeQuery.data?.data?.tree ?? [];

  // Deep-link `?scan=open` → tự mở dialog 1 lần khi load.
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

  // Hotkeys: Ctrl+Shift+A (V1.7-beta.2.3 placeholder) + Alt+S (barcode scan).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && (e.key === "A" || e.key === "a")) {
        e.preventDefault();
        toast.info(
          "Thêm linh kiện: dùng Actions cell trên dòng hiện có (Nhân bản) để tạo bản sao, hoặc chờ V1.8 có AddComponentDialog riêng.",
        );
        return;
      }
      if (
        e.altKey &&
        !e.ctrlKey &&
        !e.metaKey &&
        (e.key === "s" || e.key === "S")
      ) {
        const tgt = e.target as HTMLElement | null;
        const tag = tgt?.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tgt?.isContentEditable
        ) {
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

  // TASK-20260427-016 — `shortage`/`eco` tabs retired; bỏ counts tương ứng.
  const tabCounts: Partial<Record<TopTabKey, number>> = summary
    ? {
        orders: summary.ordersActive,
        production: summary.workOrdersActive,
        "work-orders": summary.workOrdersActive,
        procurement: summary.procurementActive,
        assembly: summary.assemblyInProgress,
      }
    : {};

  const renderTab = (key: TopTabKey): React.ReactNode => {
    if (!id || !template) return null;
    if (key === "materials") {
      // Default tab — BOM grid (PROJECT sheet) hoặc Material&Process sheet.
      return (
        <div className="flex h-full min-h-0 flex-col bg-zinc-50">
          {/* Sheet tabs (PROJECT / MATERIAL / PROCESS / CUSTOM) */}
          <BomSheetTabs
            sheets={sheets}
            activeSheetId={activeSheetId}
            onChange={setActiveSheetId}
            onAddSheet={() => setAddSheetOpen(true)}
            loading={sheetsQuery.isLoading}
            canAddSheet={!isObsolete}
          />
          <div className="flex min-h-0 flex-1 overflow-hidden">
            <div className="flex-1 overflow-hidden">
              {isLoading ? (
                <div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tải BOM…
                </div>
              ) : (
                (() => {
                  const activeSheet = sheets.find(
                    (s) => s.id === activeSheetId,
                  );
                  const sheetKind = activeSheet?.kind ?? "PROJECT";
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
                  if (sheetKind === "CUSTOM" && activeSheet) {
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
                        statusMap={buildStatusMap(
                          derivedStatusQuery.data?.data,
                        )}
                        comProgressMap={buildComProgressMap(
                          derivedStatusQuery.data?.data,
                        )}
                        fabProgressMap={fabProgressQuery.data?.data.progress}
                        readOnly={isObsolete}
                        onHistoryLine={() => tabs.setDrawerHistory(true)}
                      />
                    </div>
                  );
                })()
              )}
            </div>
          </div>
        </div>
      );
    }
    switch (key) {
      case "orders":
        return <OrdersPanel bomId={id} bomCode={template.code} />;
      case "production":
        return <BomProductionPanel bomId={id} />;
      case "work-orders":
        return <WorkOrdersPanel bomId={id} />;
      case "procurement":
        return <ProcurementPanel bomId={id} bomCode={template.code} />;
      case "assembly":
        return <AssemblyPanel bomId={id} />;
      case "audit":
        return <BomAuditPanel bomId={id} />;
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      {template && (
        <BomWorkspaceTopbar
          template={template}
          onOpenTab={tabs.setActiveTab}
          onOpenHistory={() => tabs.setDrawerHistory(true)}
          onOpenScan={() => setScanOpen(true)}
        />
      )}

      <TopTabBar
        activeTab={tabs.activeTab}
        onSelect={tabs.setActiveTab}
        counts={tabCounts}
      />

      <div className="flex min-h-0 flex-1 overflow-hidden bg-zinc-50">
        <div
          className="flex h-full min-h-0 flex-1 flex-col overflow-hidden"
          role="tabpanel"
          aria-labelledby={`tab-${tabs.activeTab}`}
        >
          {!template ? (
            <div className="flex h-full items-center justify-center bg-white text-sm text-zinc-500">
              {detailQuery.isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Đang tải BOM…
                </>
              ) : (
                "Không tải được dữ liệu BOM."
              )}
            </div>
          ) : (
            renderTab(tabs.activeTab)
          )}
        </div>
      </div>

      {id && (
        <HistoryDrawer
          bomId={id}
          open={tabs.drawerHistory}
          onOpenChange={tabs.setDrawerHistory}
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
