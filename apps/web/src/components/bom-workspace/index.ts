export { BomWorkspaceTopbar } from "./BomWorkspaceTopbar";
export { TopTabBar } from "./TopTabBar";
export { HistoryDrawer } from "./HistoryDrawer";
export { BomBarcodeSearchDialog } from "./BomBarcodeSearchDialog";
export { CreateOrderDialog } from "./CreateOrderDialog";
export {
  useTopTabState,
  TOP_TAB_KEYS,
  TOP_TAB_LABELS,
  type TopTabKey,
  type TopTabState,
} from "./useTopTabState";
export { OrdersPanel } from "./panels/OrdersPanel";
export { WorkOrdersPanel } from "./panels/WorkOrdersPanel";
// TASK-20260427-016 — `ShortagePanel`, `EcoPanel`, `BomSnapshotPanel` retired khỏi
// BOM tabs. File panel vẫn giữ trong source tree (dead code) để dễ restore — chỉ bỏ
// re-export ở barrel này.
export { ProcurementPanel } from "./panels/ProcurementPanel";
export { AssemblyPanel } from "./panels/AssemblyPanel";
// V2.0 P2 W6 — TASK-20260427-013 — gộp Order detail tabs vào BOM workspace.
export { BomProductionPanel } from "./panels/BomProductionPanel";
export { BomAuditPanel } from "./panels/BomAuditPanel";

// V2.0 P2 W6 — TASK-20260427-015 NOTE:
//
// `useBottomPanelState` + `BottomPanel` đã retire — workspace dùng
// `useTopTabState` + `TopTabBar` (top sticky tab navigation). Hai file cũ
// `useBottomPanelState.ts` và `BottomPanel.tsx` được giữ trong source tree
// để git history rõ ràng nhưng KHÔNG còn export — re-introduce sau khi cần
// fallback rất unlikely.
