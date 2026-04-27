"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Package,
} from "lucide-react";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { useAddBomLine, useDeleteBomLine } from "@/hooks/useBom";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import {
  flattenBomTree,
  type BomFlatRow,
} from "@/lib/bom-grid/flatten-tree";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  FabProgressCell,
  ProgressCell,
  mapWoStatusToFab,
  type MaterialStatus,
} from "./ProgressCell";
import { ActionsCell } from "./ActionsCell";
import { BomLineSheet } from "./BomLineSheet";
import { PRQuickDialog } from "./PRQuickDialog";
import { KindDropdown } from "./KindDropdown";

/**
 * V1.7-beta.2 — Pro BOM Grid (thay Univer).
 *
 * Kiến trúc:
 * - Custom HTML table (không Shadcn primitive) để full control sticky col
 *   + resize + virtualization.
 * - 13 cột: #, Ảnh, Mã, Tên, Loại, Vật liệu, NCC, SL/bộ, Kích thước,
 *   Tổng SL, Hao hụt, **Tiến độ**, Ghi chú, **Actions** (sticky right).
 * - Row height 36px (cell 32 + padding), group row indigo-50.
 * - Virtualize nếu rows > 80, else render tất cả.
 * - Actions cell hiện trên hover (group-hover).
 *
 * Phase A3 hỗ trợ: sort (defer), resize (defer), inline edit (defer C2).
 * Giai đoạn này chỉ RENDER + ACTIONS (edit sheet Phase C2).
 */

export interface BomGridProProps {
  templateId: string;
  templateName: string;
  templateCode: string;
  parentQty: number;
  tree: BomTreeNodeRaw[];
  /** Map componentItemId → MaterialStatus từ derivedStatus API (nếu có). */
  statusMap?: Record<string, MaterialStatus>;
  /**
   * V1.9 Phase 2 — Map componentItemId → breakdown (pct, milestones, qty) cho
   * ProgressCell com.
   */
  comProgressMap?: Record<
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
  >;
  /** V1.7-beta.2.6 — Map bomLineId → WO progress cho fab row. */
  fabProgressMap?: Record<
    string,
    {
      woId: string;
      woNo: string;
      status: string;
      plannedQty: string;
      goodQty: string;
      scrapQty: string;
      /** V1.9 Phase 2. */
      pct?: number;
      milestones?: {
        waiting: boolean;
        inProgress: boolean;
        paused: boolean;
        qc: boolean;
        completed: boolean;
      };
    }
  >;
  /** V1.7-beta.2 Phase C — handler Sửa (override default BomLineSheet). */
  onEditLine?: (row: BomFlatRow) => void;
  /** V1.7-beta.2 Phase C — handler Đặt mua (override default PRQuickDialog). */
  onOrderLine?: (row: BomFlatRow) => void;
  /** V1.7-beta.2 Phase C — nếu set, fallback onClick (không dùng Popover). */
  onInventoryLine?: (row: BomFlatRow) => void;
  /** V1.7-beta.2 Phase C — callback Xem lịch sử (mặc định navigate tới drawer). */
  onHistoryLine?: (row: BomFlatRow) => void;
  /** Read-only mode (OBSOLETE BOM). */
  readOnly?: boolean;
}

const DEFAULT_STATUS: MaterialStatus = "PLANNED";

export function BomGridPro({
  templateId,
  templateName,
  templateCode,
  parentQty,
  tree,
  statusMap,
  comProgressMap,
  fabProgressMap,
  onEditLine,
  onOrderLine,
  onInventoryLine,
  onHistoryLine,
  readOnly,
}: BomGridProProps) {
  const flat = React.useMemo(() => flattenBomTree(tree), [tree]);
  const [expanded, setExpanded] = React.useState<Set<string>>(() => {
    // Expand all group rows mặc định V1.7-beta.2 (dễ nhìn hơn collapse).
    // User có thể click chevron thu gọn per group.
    return new Set(flat.filter((r) => r.isGroup).map((r) => r.id));
  });
  const [deleteTarget, setDeleteTarget] = React.useState<BomFlatRow | null>(null);
  // V1.7-beta.2 Phase C — targets cho BomLineSheet + PRQuickDialog (internal fallback).
  const [editTarget, setEditTarget] = React.useState<BomFlatRow | null>(null);
  const [orderTarget, setOrderTarget] = React.useState<BomFlatRow | null>(null);

  const deleteLine = useDeleteBomLine(templateId);
  const addLine = useAddBomLine(templateId);

  const handleEditRow = React.useCallback(
    (row: BomFlatRow) => {
      if (onEditLine) onEditLine(row);
      else setEditTarget(row);
    },
    [onEditLine],
  );

  const handleOrderRow = React.useCallback(
    (row: BomFlatRow) => {
      if (onOrderLine) onOrderLine(row);
      else setOrderTarget(row);
    },
    [onOrderLine],
  );

  const handleDuplicateRow = React.useCallback(
    (row: BomFlatRow) => {
      const n = row.node;
      addLine.mutate(
        {
          componentItemId: n.componentItemId,
          parentLineId: n.parentLineId ?? null,
          qtyPerParent: Number(n.qtyPerParent) || 1,
          scrapPercent: Number(n.scrapPercent) || 0,
          uom: n.uom ?? undefined,
          description: n.description ?? undefined,
          supplierItemCode: n.supplierItemCode ?? undefined,
          position: n.position + 1,
        },
        {
          onSuccess: () => {
            toast.success(`Đã nhân bản ${n.componentSku ?? "dòng"}.`);
          },
          onError: (err) => {
            toast.error((err as Error).message ?? "Nhân bản thất bại");
          },
        },
      );
    },
    [addLine],
  );

  const handleHistoryRow = React.useCallback(
    (row: BomFlatRow) => {
      if (onHistoryLine) onHistoryLine(row);
      else {
        toast.info(
          `Lịch sử dòng ${row.node.componentSku ?? ""} — xem tab "Lịch sử" trên workspace.`,
        );
      }
    },
    [onHistoryLine],
  );

  // Sync expanded khi tree reload — preserve user state, add new groups.
  React.useEffect(() => {
    setExpanded((prev) => {
      const next = new Set<string>();
      const validIds = new Set(flat.map((r) => r.id));
      prev.forEach((id) => {
        if (validIds.has(id)) next.add(id);
      });
      // Auto-add group mới chưa từng seen
      flat.forEach((r) => {
        if (r.isGroup && !next.has(r.id) && !prev.has(r.id)) {
          // Heuristic: nếu row mới (chưa ever), expand default
          next.add(r.id);
        }
      });
      return next;
    });
  }, [flat]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Compute visible rows dựa trên expanded state
  const visibleRows = React.useMemo(() => {
    const hiddenParents = new Set<string>();
    const result: BomFlatRow[] = [];
    for (const row of flat) {
      const parentId = row.node.parentLineId;
      if (parentId && hiddenParents.has(parentId)) {
        hiddenParents.add(row.id);
        continue;
      }
      result.push(row);
      if (row.isGroup && !expanded.has(row.id)) {
        hiddenParents.add(row.id);
      }
    }
    return result;
  }, [flat, expanded]);

  // Virtualizer setup
  const parentRef = React.useRef<HTMLDivElement>(null);
  const useVirtualize = visibleRows.length > 80;
  const virt = useVirtualizer({
    count: visibleRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 36,
    overscan: 12,
    enabled: useVirtualize,
  });

  // V1.8 Batch 3 — Deep-link highlight: đọc `?highlightLine=<lineId>` từ
  // query param (khi navigate từ /items/[id] tab "Dùng trong BOM"). Nếu match:
  //   1. Ensure row visible (expand ancestor groups).
  //   2. Scroll vào view (block: center).
  //   3. Highlight bg-yellow-100 + ring-yellow-400 trong 3s rồi tự clear.
  const searchParams = useSearchParams();
  const highlightParam = searchParams?.get("highlightLine") ?? null;
  const [highlightedLineId, setHighlightedLineId] = React.useState<
    string | null
  >(null);

  React.useEffect(() => {
    if (!highlightParam) return;
    // Ensure ancestor groups of target line are expanded.
    const idsToExpand = new Set<string>();
    const flatById = new Map(flat.map((r) => [r.id, r]));
    let cursor: string | null = highlightParam;
    // Walk ancestors through parentLineId.
    const guard = new Set<string>();
    while (cursor && !guard.has(cursor)) {
      guard.add(cursor);
      const row = flatById.get(cursor);
      if (!row) break;
      const parent = row.node.parentLineId;
      if (parent) idsToExpand.add(parent);
      cursor = parent ?? null;
    }
    if (idsToExpand.size) {
      setExpanded((prev) => {
        const next = new Set(prev);
        idsToExpand.forEach((x) => next.add(x));
        return next;
      });
    }

    setHighlightedLineId(highlightParam);
    // Scroll after next paint (allow expand to render).
    const scrollTimer = window.setTimeout(() => {
      const el = document.getElementById(`bom-line-${highlightParam}`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 80);

    // Clear highlight after 3s.
    const clearTimer = window.setTimeout(() => {
      setHighlightedLineId(null);
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
  }, [highlightParam, flat]);

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteLine.mutate(
      { lineId: deleteTarget.id, cascade: deleteTarget.childCount > 0 },
      {
        onSuccess: () => {
          toast.success(`Đã xoá ${deleteTarget.node.componentSku ?? "dòng"}.`);
          setDeleteTarget(null);
        },
        onError: (err) => {
          toast.error((err as Error).message ?? "Xoá thất bại");
        },
      },
    );
  };

  const renderRow = (row: BomFlatRow, idx: number, style?: React.CSSProperties) => {
    const isGroup = row.isGroup;
    const isExpanded = expanded.has(row.id);
    const status =
      statusMap?.[row.node.componentItemId] ?? DEFAULT_STATUS;
    const scrap = Number(row.node.scrapPercent);
    const qty = Number(row.node.qtyPerParent) || 0;
    const total = qty * parentQty;

    const isHighlighted = highlightedLineId === row.id;

    if (isGroup) {
      return (
        <tr
          key={row.id}
          id={`bom-line-${row.id}`}
          style={style}
          className={cn(
            "group border-b border-indigo-100 bg-indigo-50 transition-colors",
            "hover:bg-indigo-100/70",
            isHighlighted &&
              "!bg-yellow-100 ring-2 ring-inset ring-yellow-400",
          )}
        >
          <td className="w-10 px-2 text-[11px] font-mono text-indigo-400 tabular-nums">
            {idx + 1}
          </td>
          <td colSpan={12} className="px-2 py-1.5">
            <button
              type="button"
              onClick={() => toggleExpand(row.id)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-800 hover:text-indigo-900"
            >
              {isExpanded ? (
                <ChevronDown className="h-3.5 w-3.5" aria-hidden />
              ) : (
                <ChevronRight className="h-3.5 w-3.5" aria-hidden />
              )}
              <span className="font-mono text-xs">
                {"  ".repeat(row.depth)}
                {row.node.componentSku ?? "—"}
              </span>
              <span>{row.node.componentName ?? "(cụm lắp)"}</span>
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-[10px] font-mono text-indigo-700">
                {row.childCount} linh kiện
              </span>
            </button>
          </td>
          <td className="sticky right-0 z-10 w-[100px] bg-indigo-50 border-l border-indigo-100 px-1">
            <ActionsCell
              row={row}
              onEdit={readOnly ? undefined : handleEditRow}
              onDelete={readOnly ? undefined : (r) => setDeleteTarget(r)}
              onHistory={handleHistoryRow}
            />
          </td>
        </tr>
      );
    }

    return (
      <tr
        key={row.id}
        id={`bom-line-${row.id}`}
        style={style}
        className={cn(
          "group border-b border-zinc-100 bg-white transition-colors hover:bg-zinc-50",
          isHighlighted &&
            "!bg-yellow-100 ring-2 ring-inset ring-yellow-400",
        )}
      >
        {/* # */}
        <td className="px-2 text-[11px] font-mono tabular-nums text-zinc-400">
          {idx + 1}
        </td>
        {/* Loại — V1.7-beta.2.1: dropdown interactive (override via metadata.kind).
            V2.0 Sprint 6: moved to position 2 (sau # — đầu hàng theo yêu cầu user). */}
        <td className="px-2">
          <KindDropdown templateId={templateId} row={row} readOnly={readOnly} />
        </td>
        {/* Ảnh */}
        <td className="px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-50 ring-1 ring-inset ring-zinc-200">
            <Package className="h-3.5 w-3.5 text-zinc-300" aria-hidden />
          </div>
        </td>
        {/* ID Number — V2.0 Sprint 6: chuỗi vị trí từ Excel (R01, S40). */}
        <td className="px-2 font-mono text-xs font-medium text-indigo-700 truncate">
          {row.node.positionCode ?? (
            <span className="text-zinc-300">—</span>
          )}
        </td>
        {/* SL/bộ */}
        <td className="px-2 text-right font-mono text-xs tabular-nums text-zinc-700">
          {formatNumber(qty)}
        </td>
        {/* Mã linh kiện (Standard Number) — V1.8 Batch 3: link về /items/[componentItemId] */}
        <td className="px-2 font-mono text-xs font-medium text-zinc-800 truncate">
          {row.node.componentItemId ? (
            <Link
              href={`/items/${row.node.componentItemId}`}
              className="tabular-nums text-zinc-800 underline-offset-2 hover:text-indigo-700 hover:underline"
              title={`Xem chi tiết vật tư ${row.node.componentSku ?? ""}`}
              onClick={(e) => e.stopPropagation()}
            >
              {row.indentedSku.trimStart() || "—"}
            </Link>
          ) : (
            <span className="tabular-nums">
              {row.indentedSku.trimStart() || "—"}
            </span>
          )}
        </td>
        {/* Tên / Mô tả (Sub Category) */}
        <td className="px-2 text-sm text-zinc-700 truncate">
          {row.node.description ?? row.node.componentName ?? (
            <span className="italic text-zinc-400">—</span>
          )}
        </td>
        {/* Kích thước (Visible Part Size) — TASK-20260427-024 fallback chain.
            1. metadata.size  (set qua form Material/Process / sheet edit)
            2. item.dimensions  (jsonb {length,width,height,unit} từ Excel import)
            3. item.specJson.dimensionText (chuỗi raw "601 X 21 X 20" từ import)
            4. "—" */}
        <td className="px-2 font-mono text-[11px] text-zinc-600 truncate">
          {(() => {
            // (1) metadata.size override
            const md = row.node.metadata as { size?: string } | null;
            if (md?.size && md.size.trim()) return md.size;

            // (2) item.dimensions jsonb
            const dim = row.node.itemDimensions as
              | {
                  length?: number | string;
                  width?: number | string;
                  height?: number | string;
                  unit?: string;
                }
              | null;
            if (dim) {
              const parts = [dim.length, dim.width, dim.height]
                .map((v) => (v === 0 || v === "0" ? null : v))
                .filter((v): v is number | string => v != null && v !== "");
              if (parts.length > 0) {
                const unit = dim.unit ? ` ${dim.unit}` : "";
                return `${parts.join("×")}${unit}`;
              }
            }

            // (3) item.specJson.dimensionText (raw text từ Excel import)
            const rawSpec = row.node.itemSpecJson;
            if (rawSpec && rawSpec.trim()) {
              try {
                const parsed = JSON.parse(rawSpec) as {
                  dimensionText?: unknown;
                };
                if (
                  typeof parsed.dimensionText === "string" &&
                  parsed.dimensionText.trim()
                ) {
                  return parsed.dimensionText;
                }
              } catch {
                // specJson không phải JSON hợp lệ — coi như text thuần.
                return rawSpec;
              }
            }

            return "—";
          })()}
        </td>
        {/* NCC / Vật tư */}
        <td className="px-2 font-mono text-xs text-zinc-600 truncate">
          {row.node.supplierItemCode ?? "—"}
        </td>
        {/* Tổng SL */}
        <td className="px-2 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
          {formatNumber(total)}
        </td>
        {/* Ghi chú (Note 1/2/3 concat) */}
        <td className="px-2 text-xs italic text-zinc-500 truncate">
          {row.node.metadata && (row.node.metadata as { notes?: string }).notes
            ? (row.node.metadata as { notes: string }).notes
            : ""}
        </td>
        {/* Hao hụt */}
        <td className="px-2 text-right font-mono text-xs tabular-nums text-orange-600">
          {scrap > 0 ? `${scrap.toFixed(1)}%` : "—"}
        </td>
        {/* Tiến độ — V1.7-beta.2.6: kind-aware (fab → WO progress, com → material status)
            V1.9 Phase 2 — bar + milestone tooltip + qty sub-label */}
        <td className="px-0">
          {row.kind === "fab" ? (
            (() => {
              const fab = fabProgressMap?.[row.id];
              const fabStatus = mapWoStatusToFab(fab?.status);
              return (
                <FabProgressCell
                  status={fabStatus}
                  goodQty={fab ? Number(fab.goodQty) : undefined}
                  plannedQty={fab ? Number(fab.plannedQty) : undefined}
                  scrapQty={fab ? Number(fab.scrapQty) : undefined}
                  woNo={fab?.woNo}
                  pct={fab?.pct}
                  milestones={fab?.milestones}
                />
              );
            })()
          ) : (
            (() => {
              const com = comProgressMap?.[row.node.componentItemId];
              return (
                <ProgressCell
                  status={status}
                  pct={com?.pct}
                  milestones={com?.milestones}
                  requiredQty={com?.requiredQty}
                  purchasedQty={com?.purchasedQty}
                  uom={row.node.componentUom ?? undefined}
                />
              );
            })()
          )}
        </td>
        {/* Actions — sticky right. V1.7-beta.2.2: phân nhánh com/fab. */}
        <td className="sticky right-0 z-10 border-l border-zinc-100 bg-white px-1 group-hover:bg-zinc-50">
          <ActionsCell
            row={row}
            onEdit={readOnly ? undefined : handleEditRow}
            onOrder={readOnly ? undefined : handleOrderRow}
            onViewRoute={readOnly ? undefined : handleEditRow}
            useInventoryPopover={!onInventoryLine}
            onInventory={onInventoryLine}
            onDuplicate={readOnly ? undefined : handleDuplicateRow}
            onDelete={readOnly ? undefined : (r) => setDeleteTarget(r)}
            onHistory={handleHistoryRow}
          />
        </td>
      </tr>
    );
  };

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm">
      {/* Header meta — BOM title + parent qty */}
      <div className="flex h-10 shrink-0 items-center gap-3 border-b border-zinc-200 bg-gradient-to-r from-zinc-50 to-white px-4">
        <span className="font-mono text-xs font-semibold text-zinc-700">
          {templateCode}
        </span>
        <span className="text-xs text-zinc-400">/</span>
        <span className="text-sm font-medium text-zinc-900">{templateName}</span>
        <div className="flex-1" />
        <span className="inline-flex items-center gap-1.5 rounded-md bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200">
          Số lượng parent
          <span className="font-mono text-xs font-semibold tabular-nums">
            {formatNumber(parentQty)}
          </span>
        </span>
        <span className="text-[10px] text-zinc-400">
          Tổng SL = SL/bộ × parent
        </span>
      </div>

      {/* Table — V2.0 Sprint 6 fix: table-fixed + colgroup để truncate hoạt
          động đúng. sticky top trên từng <th> (border-collapse fix).
          Column order match Excel "Bản chính thức" (user feedback 2026-04-26):
          # | Loại | Ảnh | ID Number | SL/bộ | Mã linh kiện | Tên/Mô tả |
          Kích thước | NCC/Vật tư | Tổng SL | Ghi chú | Hao hụt | Tiến độ |
          Thao tác. Cột "Loại" (kind dropdown) đặt trước Ảnh theo yêu cầu. */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: "40px" }} />   {/* # */}
            <col style={{ width: "120px" }} />  {/* Loại */}
            <col style={{ width: "52px" }} />   {/* Ảnh */}
            <col style={{ width: "70px" }} />   {/* ID Number (R01) */}
            <col style={{ width: "60px" }} />   {/* SL/bộ */}
            <col style={{ width: "180px" }} />  {/* Mã linh kiện */}
            <col style={{ width: "200px" }} />  {/* Tên / Mô tả */}
            <col style={{ width: "120px" }} />  {/* Kích thước */}
            <col style={{ width: "110px" }} />  {/* NCC */}
            <col style={{ width: "70px" }} />   {/* Tổng SL */}
            <col style={{ width: "180px" }} />  {/* Ghi chú */}
            <col style={{ width: "70px" }} />   {/* Hao hụt */}
            <col style={{ width: "150px" }} />  {/* Tiến độ */}
            <col style={{ width: "100px" }} />  {/* Thao tác */}
          </colgroup>
          <thead>
            <tr className="h-8 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">#</th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Loại
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-center">
                Ảnh
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                ID
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">
                SL/bộ
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Mã linh kiện
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Tên / Mô tả
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Kích thước
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                NCC / Vật tư
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">
                Tổng SL
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Ghi chú
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">
                Hao hụt
              </th>
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Tiến độ
              </th>
              <th className="sticky right-0 top-0 z-30 border-b-2 border-l border-zinc-900 bg-zinc-50 px-2 text-center">
                Thao tác
              </th>
            </tr>
          </thead>
          <tbody>
            {!useVirtualize &&
              visibleRows.map((row, idx) => renderRow(row, idx))}
            {useVirtualize && (
              <>
                {virt.getVirtualItems().map((v) => {
                  const row = visibleRows[v.index];
                  if (!row) return null;
                  return renderRow(row, v.index, {
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${v.start}px)`,
                    height: `${v.size}px`,
                  });
                })}
              </>
            )}
            {visibleRows.length === 0 && (
              <tr>
                <td colSpan={14} className="py-8 text-center text-xs text-zinc-400">
                  BOM chưa có linh kiện nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <DialogConfirm
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={`Xoá "${deleteTarget?.node.componentSku ?? ""}"?`}
        description={
          deleteTarget?.childCount
            ? `Dòng này có ${deleteTarget.childCount} linh kiện con. Tất cả sẽ bị xoá cascade. Gõ "XOA" để xác nhận.`
            : `Xoá dòng linh kiện này? Gõ "XOA" để xác nhận.`
        }
        confirmText="XOA"
        actionLabel="Xoá"
        loading={deleteLine.isPending}
        onConfirm={handleDelete}
      />

      {/* V1.7-beta.2 Phase C1 — Sheet sửa line (internal mặc định). */}
      <BomLineSheet
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        templateId={templateId}
        templateCode={templateCode}
        line={editTarget}
      />

      {/* V1.7-beta.2 Phase C2 — Dialog đặt mua nhanh. */}
      <PRQuickDialog
        open={!!orderTarget}
        onOpenChange={(o) => !o && setOrderTarget(null)}
        templateId={templateId}
        templateCode={templateCode}
        parentQty={parentQty}
        line={orderTarget}
      />
    </div>
  );
}

