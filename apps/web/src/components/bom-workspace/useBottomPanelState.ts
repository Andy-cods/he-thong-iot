"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";

export const PANEL_KEYS = [
  "orders",
  "work-orders",
  "procurement",
  "shortage",
  "eco",
  "assembly",
] as const;

export type PanelKey = (typeof PANEL_KEYS)[number];

const DEFAULT_HEIGHT = 280;
const MIN_HEIGHT = 120;
const MAX_HEIGHT_VH = 0.6;

export interface BottomPanelState {
  activePanel: PanelKey | null;
  collapsed: boolean;
  height: number;
  drawerHistory: boolean;
  setActivePanel: (panel: PanelKey | null) => void;
  toggleCollapsed: () => void;
  setHeight: (h: number) => void;
  setDrawerHistory: (open: boolean) => void;
}

/**
 * V1.7-beta — URL state cho bottom panel của BOM workspace.
 *
 * Query params:
 *   ?panel={orders|work-orders|...}  → active tab
 *   ?autoOpen=1                       → expand panel ngay (dùng cho deep link từ sub-route cũ)
 *   ?drawer=history                   → mở right drawer history
 *
 * Giữ state qua URL để:
 * - Bookmark/share link dẫn vào đúng tab
 * - 7 sub-route cũ (/bom/[id]/orders v.v.) redirect → grid?panel=X&autoOpen=1 không vỡ
 * - Refresh giữ nguyên chỗ đang xem
 */
export function useBottomPanelState(): BottomPanelState {
  const router = useRouter();
  const searchParams = useSearchParams();

  const panelParam = searchParams?.get("panel");
  const autoOpen = searchParams?.get("autoOpen") === "1";
  const drawerParam = searchParams?.get("drawer");

  const activePanel: PanelKey | null = React.useMemo(() => {
    if (!panelParam) return null;
    return (PANEL_KEYS as readonly string[]).includes(panelParam)
      ? (panelParam as PanelKey)
      : null;
  }, [panelParam]);

  const [collapsed, setCollapsedState] = React.useState(() => {
    // Expand khi có panel + autoOpen, else collapsed mặc định
    return !(activePanel && autoOpen);
  });

  const [height, setHeightState] = React.useState(DEFAULT_HEIGHT);

  // Sync khi URL đổi (VD user click Link)
  React.useEffect(() => {
    if (activePanel && autoOpen) setCollapsedState(false);
  }, [activePanel, autoOpen]);

  const updateQuery = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams?.toString() ?? "");
      for (const [key, value] of Object.entries(patch)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      router.replace(`?${next.toString()}`, { scroll: false });
    },
    [router, searchParams],
  );

  const setActivePanel = React.useCallback(
    (panel: PanelKey | null) => {
      if (panel) {
        updateQuery({ panel, autoOpen: "1" });
        setCollapsedState(false);
      } else {
        updateQuery({ panel: null, autoOpen: null });
      }
    },
    [updateQuery],
  );

  const toggleCollapsed = React.useCallback(() => {
    setCollapsedState((prev) => !prev);
  }, []);

  const setHeight = React.useCallback((h: number) => {
    const clamped = Math.max(
      MIN_HEIGHT,
      Math.min(h, window.innerHeight * MAX_HEIGHT_VH),
    );
    setHeightState(clamped);
  }, []);

  const drawerHistory = drawerParam === "history";
  const setDrawerHistory = React.useCallback(
    (open: boolean) => {
      updateQuery({ drawer: open ? "history" : null });
    },
    [updateQuery],
  );

  return {
    activePanel,
    collapsed,
    height,
    drawerHistory,
    setActivePanel,
    toggleCollapsed,
    setHeight,
    setDrawerHistory,
  };
}

export const PANEL_LABELS: Record<PanelKey, string> = {
  orders: "Đơn hàng",
  "work-orders": "Lệnh SX",
  procurement: "Mua sắm",
  shortage: "Thiếu hàng",
  eco: "ECO",
  assembly: "Lắp ráp",
};
