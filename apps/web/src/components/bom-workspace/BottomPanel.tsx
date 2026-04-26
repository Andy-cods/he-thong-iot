"use client";

import * as React from "react";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  PANEL_KEYS,
  PANEL_LABELS,
  type PanelKey,
} from "./useBottomPanelState";

export interface BottomPanelProps {
  activePanel: PanelKey | null;
  collapsed: boolean;
  height: number;
  onSelectPanel: (panel: PanelKey | null) => void;
  onToggleCollapsed: () => void;
  onSetHeight: (h: number) => void;
  renderPanel: (panel: PanelKey) => React.ReactNode;
  /** Badge count hiển thị bên cạnh tab (optional). */
  counts?: Partial<Record<PanelKey, number>>;
}

/**
 * V1.7-beta — Bottom Panel cho BOM workspace (brainstorm §2 Pattern B).
 *
 * Layout:
 *   ┌─ Tab bar h-9 ─[Đơn hàng·5] [WO·3] [Mua sắm] [Thiếu·2] [ECO] [Lắp ráp] ─ [▼/X] ─┐
 *   ├─ Content (resize drag handle top) ────────────────────────────────────────────┤
 *   └──────────────────────────────────────────────────────────────────────────────┘
 *
 * - Collapsed: chỉ hiện tab bar
 * - Expanded: tab bar + content height (resize drag)
 * - Click tab khi đang collapsed → expand
 * - Click ▼ → collapse
 * - Click X → collapse + clear active panel (URL)
 */
export function BottomPanel({
  activePanel,
  collapsed,
  height,
  onSelectPanel,
  onToggleCollapsed,
  onSetHeight,
  renderPanel,
  counts,
}: BottomPanelProps) {
  const [dragging, setDragging] = React.useState(false);
  const startY = React.useRef(0);
  const startHeight = React.useRef(height);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    startY.current = e.clientY;
    startHeight.current = height;
  };

  React.useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const delta = startY.current - e.clientY;
      onSetHeight(startHeight.current + delta);
    };
    const onUp = () => setDragging(false);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging, onSetHeight]);

  // Keyboard a11y: tab key với Arrow Left/Right navigate tabs
  const handleTabKeyDown = (e: React.KeyboardEvent, idx: number) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const next = PANEL_KEYS[(idx + 1) % PANEL_KEYS.length]!;
      onSelectPanel(next);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      const prev =
        PANEL_KEYS[(idx - 1 + PANEL_KEYS.length) % PANEL_KEYS.length]!;
      onSelectPanel(prev);
    }
  };

  const panelHeight = collapsed ? 36 : Math.max(120, height);

  return (
    <div
      className="relative z-30 flex shrink-0 flex-col border-t border-zinc-200 bg-white"
      style={{ height: `${panelHeight}px` }}
    >
      {/* Resize drag handle (chỉ visible khi expanded) */}
      {!collapsed && (
        <div
          className={cn(
            "h-1.5 w-full shrink-0 cursor-ns-resize bg-transparent transition-colors duration-150",
            "hover:bg-indigo-400/50",
            dragging && "bg-indigo-500",
          )}
          onMouseDown={handleMouseDown}
          role="separator"
          aria-orientation="horizontal"
          aria-label="Kéo để đổi chiều cao panel"
        />
      )}

      {/* Tab bar — V1.7-beta.2.3 polish Linear-like:
           active = border-b-2 indigo-500 (không after pill),
           divider dọc giữa tabs, count = "—" khi 0 giảm noise. */}
      <div className="flex h-9 shrink-0 items-center border-b border-zinc-200 bg-zinc-50/60 pl-1 pr-2">
        <div className="flex flex-1 items-center overflow-x-auto">
          {PANEL_KEYS.map((key, idx) => {
            const isActive = activePanel === key && !collapsed;
            const count = counts?.[key];
            const showDivider = idx > 0;
            return (
              <button
                key={key}
                type="button"
                onClick={() => {
                  if (activePanel === key && !collapsed) {
                    onToggleCollapsed();
                  } else {
                    onSelectPanel(key);
                  }
                }}
                onKeyDown={(e) => handleTabKeyDown(e, idx)}
                role="tab"
                aria-selected={isActive}
                className={cn(
                  "relative inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors duration-100",
                  showDivider && "border-l border-zinc-200",
                  isActive
                    ? "border-b-2 border-indigo-500 bg-white text-indigo-700"
                    : "border-b-2 border-transparent text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900",
                )}
              >
                <span className={cn(isActive && "font-semibold")}>
                  {PANEL_LABELS[key]}
                </span>
                {count !== undefined && count !== null && (
                  <span
                    className={cn(
                      "inline-flex h-4 min-w-[18px] items-center justify-center rounded-full px-1 font-mono text-[10px] tabular-nums",
                      isActive
                        ? "bg-indigo-100 text-indigo-700 ring-1 ring-inset ring-indigo-200"
                        : count > 0
                          ? "bg-zinc-200 text-zinc-700"
                          : "bg-transparent text-zinc-300",
                    )}
                  >
                    {count > 0 ? count : "—"}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            onClick={onToggleCollapsed}
            className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
            aria-label={collapsed ? "Mở rộng panel" : "Thu gọn panel"}
            title={collapsed ? "Mở rộng (Alt+↑)" : "Thu gọn (Alt+↓)"}
          >
            {collapsed ? (
              <ChevronUp className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
          </button>
          {activePanel && !collapsed && (
            <button
              type="button"
              onClick={() => onSelectPanel(null)}
              className="inline-flex h-7 w-7 items-center justify-center rounded-sm text-zinc-500 hover:bg-zinc-200 hover:text-zinc-900"
              aria-label="Đóng panel"
              title="Đóng panel"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      {!collapsed && activePanel && (
        <div className="flex-1 overflow-auto" role="tabpanel">
          {renderPanel(activePanel)}
        </div>
      )}
    </div>
  );
}
