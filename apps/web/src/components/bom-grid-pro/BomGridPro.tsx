"use client";

import * as React from "react";
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
import { ProgressCell, type MaterialStatus } from "./ProgressCell";
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

    if (isGroup) {
      return (
        <tr
          key={row.id}
          style={style}
          className={cn(
            "group border-b border-indigo-100 bg-indigo-50 transition-colors",
            "hover:bg-indigo-100/70",
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
        style={style}
        className="group border-b border-zinc-100 bg-white transition-colors hover:bg-zinc-50"
      >
        {/* # */}
        <td className="w-10 px-2 text-[11px] font-mono tabular-nums text-zinc-400">
          {idx + 1}
        </td>
        {/* Ảnh */}
        <td className="w-[52px] px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-50 ring-1 ring-inset ring-zinc-200">
            <Package className="h-3.5 w-3.5 text-zinc-300" aria-hidden />
          </div>
        </td>
        {/* Mã SKU */}
        <td className="w-[170px] px-2 font-mono text-xs font-medium text-zinc-800 truncate">
          <span className="tabular-nums">{row.indentedSku.trimStart() || "—"}</span>
        </td>
        {/* Tên */}
        <td className="w-[200px] px-2 text-sm text-zinc-700 truncate">
          {row.node.componentName ?? (
            <span className="italic text-zinc-400">—</span>
          )}
        </td>
        {/* Loại — V1.7-beta.2.1: dropdown interactive (override via metadata.kind) */}
        <td className="w-[150px] px-2">
          <KindDropdown templateId={templateId} row={row} readOnly={readOnly} />
        </td>
        {/* Vật liệu / Nhóm */}
        <td className="w-[140px] px-2 text-xs text-zinc-600 truncate">
          {row.node.componentCategory ?? "—"}
        </td>
        {/* NCC */}
        <td className="w-[110px] px-2 font-mono text-xs text-zinc-600 truncate">
          {row.node.supplierItemCode ?? "—"}
        </td>
        {/* SL/bộ */}
        <td className="w-[72px] px-2 text-right font-mono text-xs tabular-nums text-zinc-700">
          {formatNumber(qty)}
        </td>
        {/* Kích thước */}
        <td className="w-[110px] px-2 font-mono text-[11px] text-zinc-600 truncate">
          {(row.node.metadata as { size?: string } | null)?.size ?? "—"}
        </td>
        {/* Tổng SL */}
        <td className="w-[70px] px-2 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
          {formatNumber(total)}
        </td>
        {/* Hao hụt */}
        <td className="w-[80px] px-2 text-right font-mono text-xs tabular-nums text-orange-600">
          {scrap > 0 ? `${scrap.toFixed(1)}%` : "—"}
        </td>
        {/* Tiến độ — NEW V1.7-beta.2 */}
        <td className="w-[150px] px-0">
          <ProgressCell status={status} />
        </td>
        {/* Ghi chú */}
        <td className="w-[180px] px-2 text-xs italic text-zinc-500 truncate">
          {row.node.description ?? ""}
        </td>
        {/* Actions — sticky right. V1.7-beta.2.2: phân nhánh com/fab. */}
        <td className="sticky right-0 z-10 w-[100px] border-l border-zinc-100 bg-white px-1 group-hover:bg-zinc-50">
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

      {/* Table */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-20 bg-zinc-50/95 backdrop-blur-sm">
            <tr className="h-8 border-b border-zinc-900 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              <th className="w-10 border-b border-zinc-900 px-2 text-right">#</th>
              <th className="w-[52px] border-b border-zinc-900 px-2 text-center">
                Ảnh
              </th>
              <th className="w-[170px] border-b border-zinc-900 px-2 text-left">
                Mã linh kiện
              </th>
              <th className="w-[200px] border-b border-zinc-900 px-2 text-left">
                Tên / Mô tả
              </th>
              <th className="w-[150px] border-b border-zinc-900 px-2 text-left">
                Loại
              </th>
              <th className="w-[140px] border-b border-zinc-900 px-2 text-left">
                Vật liệu
              </th>
              <th className="w-[110px] border-b border-zinc-900 px-2 text-left">
                NCC
              </th>
              <th className="w-[72px] border-b border-zinc-900 px-2 text-right">
                SL/bộ
              </th>
              <th className="w-[110px] border-b border-zinc-900 px-2 text-left">
                Kích thước
              </th>
              <th className="w-[70px] border-b border-zinc-900 px-2 text-right">
                Tổng SL
              </th>
              <th className="w-[80px] border-b border-zinc-900 px-2 text-right">
                Hao hụt
              </th>
              <th className="w-[150px] border-b border-zinc-900 px-2 text-left">
                Tiến độ
              </th>
              <th className="w-[180px] border-b border-zinc-900 px-2 text-left">
                Ghi chú
              </th>
              <th className="sticky right-0 z-30 w-[100px] border-b border-l border-zinc-900 bg-zinc-50 px-2 text-center">
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

