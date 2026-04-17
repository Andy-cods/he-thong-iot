"use client";

import * as React from "react";
import type { ItemFilter } from "@/lib/query-keys";

/**
 * 3-mode selection state machine cho bulk actions (brainstorm-deep §2.2).
 *
 * - `none`: không có gì được chọn.
 * - `visible`: user tick tay từng row; `ids` là Set các id đã chọn.
 * - `all-matching`: user click "Chọn tất cả X khớp filter";
 *   `excluded` chứa id user tự uncheck trong chế độ này.
 *
 * Đổi filter → auto-reset `all-matching` về `none` (tránh confusion).
 */
export type Selection =
  | { mode: "none" }
  | { mode: "visible"; ids: Set<string> }
  | {
      mode: "all-matching";
      excluded: Set<string>;
      filtersSnapshot: ItemFilter;
    };

type Action =
  | { type: "toggle-row"; id: string; inList: boolean }
  | { type: "toggle-page"; visibleIds: string[] }
  | { type: "select-all-matching"; filter: ItemFilter }
  | { type: "clear" }
  | { type: "reset-if-filter-changed"; filter: ItemFilter };

function reducer(state: Selection, action: Action): Selection {
  switch (action.type) {
    case "toggle-row": {
      if (state.mode === "none") {
        return { mode: "visible", ids: new Set([action.id]) };
      }
      if (state.mode === "visible") {
        const next = new Set(state.ids);
        if (next.has(action.id)) next.delete(action.id);
        else next.add(action.id);
        return next.size === 0 ? { mode: "none" } : { mode: "visible", ids: next };
      }
      // all-matching: toggle → thêm/bớt trong excluded
      const excluded = new Set(state.excluded);
      if (excluded.has(action.id)) excluded.delete(action.id);
      else excluded.add(action.id);
      return { ...state, excluded };
    }
    case "toggle-page": {
      // Header checkbox: nếu tất cả visible đã selected → clear,
      // ngược lại select toàn bộ visible.
      if (state.mode === "visible") {
        const allSelected = action.visibleIds.every((id) => state.ids.has(id));
        if (allSelected) return { mode: "none" };
        const next = new Set(state.ids);
        action.visibleIds.forEach((id) => next.add(id));
        return { mode: "visible", ids: next };
      }
      if (state.mode === "all-matching") {
        // Trong all-matching mode, header checkbox → clear
        return { mode: "none" };
      }
      // none → select all visible
      return { mode: "visible", ids: new Set(action.visibleIds) };
    }
    case "select-all-matching":
      return {
        mode: "all-matching",
        excluded: new Set(),
        filtersSnapshot: action.filter,
      };
    case "clear":
      return { mode: "none" };
    case "reset-if-filter-changed": {
      if (state.mode !== "all-matching") return state;
      // Deep-ish equality via JSON stringify (filter là plain object nhỏ)
      const a = JSON.stringify(state.filtersSnapshot);
      const b = JSON.stringify(action.filter);
      if (a !== b) return { mode: "none" };
      return state;
    }
    default:
      return state;
  }
}

export function useSelection(filter: ItemFilter) {
  const [selection, dispatch] = React.useReducer(reducer, { mode: "none" });

  // Reset selection khi filter đổi (nếu đang ở all-matching mode).
  const filterKey = React.useMemo(() => JSON.stringify(filter), [filter]);
  React.useEffect(() => {
    dispatch({ type: "reset-if-filter-changed", filter });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterKey]);

  const actions = React.useMemo(
    () => ({
      toggleRow: (id: string, inList: boolean) =>
        dispatch({ type: "toggle-row", id, inList }),
      togglePage: (visibleIds: string[]) =>
        dispatch({ type: "toggle-page", visibleIds }),
      selectAllMatching: () =>
        dispatch({ type: "select-all-matching", filter }),
      clear: () => dispatch({ type: "clear" }),
    }),
    [filter],
  );

  return [selection, actions] as const;
}

/** Kiểm tra 1 id có đang được chọn không (theo mode). */
export function isSelected(sel: Selection, id: string): boolean {
  if (sel.mode === "none") return false;
  if (sel.mode === "visible") return sel.ids.has(id);
  return !sel.excluded.has(id);
}

/** Đếm số item đang được chọn (hữu hạn với visible; all-matching dùng total từ server). */
export function selectionCount(
  sel: Selection,
  totalMatching: number,
): number {
  if (sel.mode === "none") return 0;
  if (sel.mode === "visible") return sel.ids.size;
  return Math.max(0, totalMatching - sel.excluded.size);
}

/** Page-select indicator (header checkbox visual state). */
export function pageSelectState(
  sel: Selection,
  visibleIds: string[],
): "unchecked" | "checked" | "indeterminate" {
  if (sel.mode === "none") return "unchecked";
  if (sel.mode === "all-matching") {
    const anyExcludedVisible = visibleIds.some((id) => sel.excluded.has(id));
    return anyExcludedVisible ? "indeterminate" : "checked";
  }
  const selectedVisible = visibleIds.filter((id) => sel.ids.has(id)).length;
  if (selectedVisible === 0) return "unchecked";
  if (selectedVisible === visibleIds.length) return "checked";
  return "indeterminate";
}

/** Trích ids đã chọn (chỉ dùng cho mode visible; all-matching dùng filter). */
export function visibleSelectedIds(sel: Selection): string[] {
  return sel.mode === "visible" ? Array.from(sel.ids) : [];
}
