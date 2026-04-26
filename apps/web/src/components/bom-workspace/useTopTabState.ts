"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * V2.0 P2 W6 — TASK-20260427-015.
 *
 * Top tab state cho BOM workspace. Thay thế `useBottomPanelState` cũ
 * (bottom panel collapsed/expand) bằng tab navigation TOP đầy đủ:
 *  - Default tab `materials` (grid BOM = "Vật tư & Quy trình") — KHÔNG nullable.
 *  - 9 tab cũ giữ nguyên ID, đẩy phía sau materials.
 *  - URL param `?tab=...` deep-link.
 *
 * Lưu ý compat: tham số `?panel=...` (URL cũ V1.7-beta) vẫn được đọc và map
 * sang `?tab=...` để 7 sub-route redirect cũ và bookmark cũ không vỡ.
 */

export const TOP_TAB_KEYS = [
  "materials",
  "orders",
  "snapshot",
  "production",
  "work-orders",
  "procurement",
  "shortage",
  "eco",
  "assembly",
  "audit",
] as const;

export type TopTabKey = (typeof TOP_TAB_KEYS)[number];

export const TOP_TAB_LABELS: Record<TopTabKey, string> = {
  materials: "Vật tư & Quy trình",
  orders: "Đơn hàng",
  snapshot: "Snapshot Board",
  production: "Sản xuất",
  "work-orders": "Lệnh SX",
  procurement: "Mua sắm",
  shortage: "Thiếu vật tư",
  eco: "ECO",
  assembly: "Lắp ráp",
  audit: "Lịch sử",
};

export interface TopTabState {
  activeTab: TopTabKey;
  drawerHistory: boolean;
  setActiveTab: (tab: TopTabKey) => void;
  setDrawerHistory: (open: boolean) => void;
}

export function useTopTabState(): TopTabState {
  const router = useRouter();
  const searchParams = useSearchParams();

  const tabParam = searchParams?.get("tab");
  const panelParam = searchParams?.get("panel");
  const drawerParam = searchParams?.get("drawer");

  const activeTab: TopTabKey = React.useMemo(() => {
    const candidate = tabParam ?? panelParam ?? null;
    if (
      candidate &&
      (TOP_TAB_KEYS as readonly string[]).includes(candidate)
    ) {
      return candidate as TopTabKey;
    }
    return "materials";
  }, [tabParam, panelParam]);

  const updateQuery = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      // Strip legacy params (panel/autoOpen) một khi đã chuyển qua URL mới.
      next.delete("panel");
      next.delete("autoOpen");
      const qs = next.toString();
      router.replace(qs ? `?${qs}` : "?", { scroll: false });
    },
    [router, searchParams],
  );

  const setActiveTab = React.useCallback(
    (tab: TopTabKey) => {
      if (tab === "materials") {
        updateQuery({ tab: null });
      } else {
        updateQuery({ tab });
      }
    },
    [updateQuery],
  );

  const drawerHistory = drawerParam === "history";
  const setDrawerHistory = React.useCallback(
    (open: boolean) => {
      updateQuery({ drawer: open ? "history" : null });
    },
    [updateQuery],
  );

  return {
    activeTab,
    drawerHistory,
    setActiveTab,
    setDrawerHistory,
  };
}
