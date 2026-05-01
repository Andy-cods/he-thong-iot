"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  Package,
  Plus,
} from "lucide-react";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { useAddBomLine, useDeleteBomLine } from "@/hooks/useBom";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { PicEditDialog } from "./PicEditDialog";
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
import { WOQuickDialog } from "./WOQuickDialog";
import { SubcontractPOQuickDialog } from "./SubcontractPOQuickDialog";
import { CategoryBadge } from "./CategoryBadge";
import { AddBomLineDialog } from "./AddBomLineDialog";

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
  // V3.7.43 — Targets cho 2 dialog mới (GTAM WO + Subcontract PO)
  const [woTarget, setWoTarget] = React.useState<BomFlatRow | null>(null);
  const [subcontractTarget, setSubcontractTarget] =
    React.useState<BomFlatRow | null>(null);
  const [addLineOpen, setAddLineOpen] = React.useState(false);
  // V3.7.20 — PIC edit dialog
  const [picEditTarget, setPicEditTarget] = React.useState<BomFlatRow | null>(null);
  const session = useSession();
  const currentUserId = session.data?.id ?? null;
  const isAdmin = (session.data?.roles ?? []).includes("admin");

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

  // V3.7.43 — Handlers cho GTAM (WO) và Đặt gia công ngoài (Subcontract PO).
  const handleCreateWO = React.useCallback((row: BomFlatRow) => {
    setWoTarget(row);
  }, []);
  const handleCreateSubcontract = React.useCallback((row: BomFlatRow) => {
    setSubcontractTarget(row);
  }, []);

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

  // V3.7.11 — Filter NCC: lọc rows theo supplier_item_code (tên/mã NCC).
  const [supplierFilter, setSupplierFilter] = React.useState("");
  const [supplierFilterOpen, setSupplierFilterOpen] = React.useState(false);
  // V3.7.37 — Filter PIC tương tự NCC.
  const [picFilter, setPicFilter] = React.useState("");
  const [picFilterOpen, setPicFilterOpen] = React.useState(false);

  // Tập hợp danh sách NCC unique để gợi ý
  const supplierOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of flat) {
      const s = r.node.supplierItemCode;
      if (s && s.trim()) set.add(s.trim());
    }
    return Array.from(set).sort();
  }, [flat]);

  // V3.7.37 — Tập PIC unique (assignedToFullName ưu tiên, fallback assignedToName raw).
  const picOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of flat) {
      const p = r.node.assignedToFullName ?? r.node.assignedToName;
      if (p && p.trim()) set.add(p.trim());
    }
    return Array.from(set).sort();
  }, [flat]);

  // V3.7.37 — Compute visible rows: NCC filter + PIC filter (AND logic).
  const visibleRows = React.useMemo(() => {
    const hiddenParents = new Set<string>();
    const result: BomFlatRow[] = [];
    const supNeedle = supplierFilter.trim().toLowerCase();
    const picNeedle = picFilter.trim().toLowerCase();

    let allowed: Set<string> | null = null;
    if (supNeedle || picNeedle) {
      const matchIds = new Set<string>();
      for (const r of flat) {
        const s = (r.node.supplierItemCode ?? "").toLowerCase();
        const p = (
          r.node.assignedToFullName ??
          r.node.assignedToName ??
          ""
        ).toLowerCase();
        const supOk = !supNeedle || s.includes(supNeedle);
        const picOk = !picNeedle || p.includes(picNeedle);
        if (supOk && picOk) matchIds.add(r.id);
      }
      // Add ancestors giữ tree path
      const idToRow = new Map(flat.map((r) => [r.id, r]));
      for (const id of [...matchIds]) {
        let cur = idToRow.get(id);
        while (cur?.node.parentLineId) {
          matchIds.add(cur.node.parentLineId);
          cur = idToRow.get(cur.node.parentLineId);
        }
      }
      allowed = matchIds;
    }

    for (const row of flat) {
      if (allowed && !allowed.has(row.id)) continue;
      const parentId = row.node.parentLineId;
      if (parentId && hiddenParents.has(parentId)) {
        hiddenParents.add(row.id);
        continue;
      }
      result.push(row);
      if (row.isGroup && !expanded.has(row.id) && !allowed) {
        hiddenParents.add(row.id);
      }
    }
    return result;
  }, [flat, expanded, supplierFilter, picFilter]);

  // V3.7.21 — Auto-hide empty columns: cột nào không có data thì ẩn,
  // user có thể toggle để hiện lại tất cả.
  // V3.7.33 — positionCode auto-show khi có metadata.seq (Excel ID Number AB01...).
  const [showAllColumns, setShowAllColumns] = React.useState(false);
  const colHasData = React.useMemo(() => {
    const has = {
      positionCode: false,
      dimensions: false,
      supplier: false,
      pic: false,
      notes: false,
      scrap: false,
      progress: false, // Tiến độ
    };
    for (const r of visibleRows) {
      if (r.isGroup) continue;
      const meta = r.node.metadata as
        | { notes?: string; note?: string; size?: string; seq?: string; category?: string }
        | undefined;
      if (r.node.positionCode || meta?.seq) has.positionCode = true;
      if (r.node.supplierItemCode) has.supplier = true;
      if (r.node.assignedToFullName || r.node.assignedToName) has.pic = true;
      if (meta?.notes || meta?.note) has.notes = true;
      if (meta?.size || r.node.itemDimensions) has.dimensions = true;
      if (Number(r.node.scrapPercent) > 0) has.scrap = true;
      if (r.node.receivedQty || r.node.expectedEta || r.node.statusNote) {
        has.progress = true;
      }
    }
    return has;
  }, [visibleRows]);

  // Helper: cột có hiển thị không (showAll override hoặc có data)
  const showCol = (key: keyof typeof colHasData) =>
    showAllColumns || colHasData[key];

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
          <td colSpan={13} className="px-2 py-1.5">
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
        {/* V3.7.33 — Excel order: # | Image | ID Number | Quantity | BOM gốc | Ghi chú | Category | ... */}
        {/* # */}
        <td className="px-2 text-[11px] font-mono tabular-nums text-zinc-400">
          {idx + 1}
        </td>
        {/* Image */}
        <td className="px-1">
          <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-50 ring-1 ring-inset ring-zinc-200">
            <Package className="h-3.5 w-3.5 text-zinc-300" aria-hidden />
          </div>
        </td>
        {/* ID Number — Excel "ID Number" cột AB01..AB40, fallback positionCode */}
        {showCol("positionCode") && (
          <td className="px-2 font-mono text-xs font-medium text-indigo-700 truncate">
            {row.node.positionCode ??
              (row.node.metadata as { seq?: string } | null)?.seq ?? (
                <span className="text-zinc-300">—</span>
              )}
          </td>
        )}
        {/* Quantity (hệ số) — Excel "Quantity (hệ số)" = qtyPerParent */}
        <td className="px-2 text-right font-mono text-xs tabular-nums text-zinc-700">
          {formatNumber(qty)}
        </td>
        {/* BOM gốc — Excel "BOM gốc" = SKU/mã linh kiện */}
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
        {/* Ghi chú — Excel "Ghi chú" = description */}
        <td className="px-2 text-sm text-zinc-700 truncate">
          {row.node.description ?? row.node.componentName ?? (
            <span className="italic text-zinc-400">—</span>
          )}
        </td>
        {/* Category — Excel "Category" = display badge từ metadata.category.
            V3.7.37: thay KindDropdown — hiển thị raw text (Thương mại / GTAM /
            Đặt gia công ngoài) màu phân biệt. Edit qua BomLineSheet. */}
        <td className="px-2">
          <CategoryBadge row={row} />
        </td>
        {/* Kích thước (Visible Part Size) — TASK-20260427-024 fallback chain.
            1. metadata.size  (set qua form Material/Process / sheet edit)
            2. item.dimensions  (jsonb {length,width,height,unit} từ Excel import)
            3. item.specJson.dimensionText (chuỗi raw "601 X 21 X 20" từ import)
            4. "—" */}
        {showCol("dimensions") && (
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
        )}
        {/* NCC / Vật tư */}
        {showCol("supplier") && (
        <td className="px-2 font-mono text-xs text-zinc-600 truncate">
          {row.node.supplierItemCode ?? "—"}
        </td>
        )}
        {/* PIC — V3.7.19/20 */}
        {showCol("pic") && (
        <td className="px-2 truncate">
          {(() => {
            const canEdit =
              isAdmin ||
              (!!currentUserId &&
                row.node.assignedToUserId === currentUserId);
            if (row.node.assignedToFullName) {
              return (
                <button
                  type="button"
                  onClick={canEdit ? () => setPicEditTarget(row) : undefined}
                  disabled={!canEdit}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700",
                    canEdit && "cursor-pointer hover:bg-indigo-100 hover:ring-1 hover:ring-indigo-300",
                    !canEdit && "cursor-default",
                  )}
                  title={
                    canEdit
                      ? `Bấm để cập nhật tiến độ (PIC: ${row.node.assignedToFullName})`
                      : `PIC: ${row.node.assignedToFullName}`
                  }
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-indigo-500" />
                  {row.node.assignedToFullName}
                  {canEdit && <span className="ml-0.5 text-[9px]">✎</span>}
                </button>
              );
            }
            if (row.node.assignedToName) {
              return (
                <button
                  type="button"
                  onClick={isAdmin ? () => setPicEditTarget(row) : undefined}
                  disabled={!isAdmin}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700",
                    isAdmin && "cursor-pointer hover:bg-amber-100",
                  )}
                  title={`Chưa match user: "${row.node.assignedToName}"`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500" />
                  {row.node.assignedToName}
                </button>
              );
            }
            return <span className="text-xs text-zinc-300">—</span>;
          })()}
        </td>
        )}
        {/* SL — Excel "SL" = số lượng đặt thực tế (totalQty từ Excel).
            V3.7.37: Lấy từ metadata.totalQty (raw từ Excel) thay vì tính
            qty × parentQty. Vì SL Excel thường = qty × số set khách đặt
            (ví dụ 14 set băng tải) — không cố định bằng parentQty hệ thống.
            Fallback qty × parentQty nếu metadata.totalQty rỗng (manual added). */}
        <td className="px-2 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900">
          {(() => {
            const meta = row.node.metadata as { totalQty?: string | number } | null;
            const fromExcel = meta?.totalQty != null ? Number(meta.totalQty) : NaN;
            if (Number.isFinite(fromExcel) && fromExcel > 0) return formatNumber(fromExcel);
            return formatNumber(qty * parentQty);
          })()}
        </td>
        {/* Note phụ (metadata.notes — V3.7.33 hiếm khi có data) */}
        {showCol("notes") && (
        <td className="px-2 text-xs italic text-zinc-500 truncate">
          {row.node.metadata && (row.node.metadata as { notes?: string }).notes
            ? (row.node.metadata as { notes: string }).notes
            : ""}
        </td>
        )}
        {/* Hao hụt */}
        {showCol("scrap") && (
        <td className="px-2 text-right font-mono text-xs tabular-nums text-orange-600">
          {scrap > 0 ? `${scrap.toFixed(1)}%` : "—"}
        </td>
        )}
        {/* Tiến độ — V1.7-beta.2.6: kind-aware (fab → WO progress, com → material status)
            V1.9 Phase 2 — bar + milestone tooltip + qty sub-label */}
        {showCol("progress") && (
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
        )}
        {/* Actions — sticky right. V1.7-beta.2.2: phân nhánh com/fab. */}
        <td className="sticky right-0 z-10 border-l border-zinc-100 bg-white px-1 group-hover:bg-zinc-50">
          <ActionsCell
            row={row}
            onEdit={readOnly ? undefined : handleEditRow}
            onOrder={readOnly ? undefined : handleOrderRow}
            onCreateWO={readOnly ? undefined : handleCreateWO}
            onCreateSubcontract={readOnly ? undefined : handleCreateSubcontract}
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
        {/* V3.7.21 — Auto-hide empty columns toggle */}
        <button
          type="button"
          onClick={() => setShowAllColumns((v) => !v)}
          className={cn(
            "inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[11px] font-medium transition-colors",
            showAllColumns
              ? "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
          )}
          title={
            showAllColumns
              ? "Đang hiện tất cả cột — bấm để ẩn cột rỗng"
              : "Đang ẩn cột rỗng — bấm để hiện tất cả"
          }
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            className="h-3 w-3"
          >
            {showAllColumns ? (
              <>
                <path d="M3 12c0-2 4-7 9-7s9 5 9 7-4 7-9 7-9-5-9-7z" />
                <circle cx="12" cy="12" r="3" />
              </>
            ) : (
              <>
                <path d="M3 3l18 18" />
                <path d="M10.5 5.5A12 12 0 0 1 21 12c-1.5 3-4 5-7 6" />
              </>
            )}
          </svg>
          {showAllColumns ? "Tất cả cột" : "Tự ẩn cột rỗng"}
        </button>
      </div>

      {/* Table — V3.7.33: Column order match Excel "Bản chính thức" CHÍNH XÁC.
          # | Image | ID Number | Quantity (hệ số) | BOM gốc | Ghi chú |
          Category | Quy cách (tham khảo) | NCC | PIC | SL | Tiến độ | Thao tác.
          Header label tiếng Việt khớp Excel. Cột Hao hụt/notes phụ chỉ hiện
          khi showAllColumns=true. */}
      <div ref={parentRef} className="flex-1 overflow-auto">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: "40px" }} />   {/* # */}
            <col style={{ width: "52px" }} />   {/* Image */}
            {showCol("positionCode") && <col style={{ width: "70px" }} />}{/* ID Number */}
            <col style={{ width: "70px" }} />   {/* Quantity (hệ số) */}
            <col style={{ width: "180px" }} />  {/* BOM gốc */}
            <col style={{ width: "200px" }} />  {/* Ghi chú */}
            <col style={{ width: "120px" }} />  {/* Category */}
            {showCol("dimensions") && <col style={{ width: "130px" }} />}{/* Quy cách */}
            {showCol("supplier") && <col style={{ width: "110px" }} />}{/* NCC */}
            {showCol("pic") && <col style={{ width: "110px" }} />}{/* PIC */}
            <col style={{ width: "60px" }} />   {/* SL (total) */}
            {showCol("notes") && <col style={{ width: "120px" }} />}{/* Ghi chú phụ */}
            {showCol("scrap") && <col style={{ width: "60px" }} />}{/* Hao hụt */}
            {showCol("progress") && <col style={{ width: "150px" }} />}{/* Tiến độ */}
            <col style={{ width: "100px" }} />  {/* Thao tác */}
          </colgroup>
          <thead>
            <tr className="h-8 text-[10px] font-medium uppercase tracking-wide text-zinc-600">
              {/* # */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">#</th>
              {/* Image */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-center">
                Image
              </th>
              {/* ID Number */}
              {showCol("positionCode") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                  ID Number
                </th>
              )}
              {/* Quantity (hệ số) */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right" title="Quantity (hệ số) — số lượng linh kiện trên 1 sản phẩm">
                Quantity
              </th>
              {/* BOM gốc */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                BOM gốc
              </th>
              {/* Ghi chú */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Ghi chú
              </th>
              {/* Category — was Loại */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                Category
              </th>
              {/* Quy cách (tham khảo) */}
              {showCol("dimensions") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left" title="Quy cách (tham khảo)">
                  Quy cách
                </th>
              )}
              {showCol("supplier") && (
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                <div className="relative inline-flex items-center gap-1">
                  <span>NCC</span>
                  <button
                    type="button"
                    onClick={() => setSupplierFilterOpen((o) => !o)}
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:text-zinc-700",
                      supplierFilter && "bg-indigo-600 text-white hover:bg-indigo-700",
                    )}
                    title="Lọc theo NCC"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      className="h-3 w-3"
                    >
                      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                    </svg>
                  </button>
                  {supplierFilterOpen && (
                    <div
                      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 shadow-lg"
                      onMouseLeave={() => setSupplierFilterOpen(false)}
                    >
                      <input
                        type="text"
                        value={supplierFilter}
                        onChange={(e) => setSupplierFilter(e.target.value)}
                        placeholder="Tìm NCC…"
                        autoFocus
                        list="ncc-options"
                        className="block w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                      />
                      <datalist id="ncc-options">
                        {supplierOptions.map((s) => (
                          <option key={s} value={s} />
                        ))}
                      </datalist>
                      {supplierFilter && (
                        <button
                          type="button"
                          onClick={() => {
                            setSupplierFilter("");
                            setSupplierFilterOpen(false);
                          }}
                          className="mt-1 w-full rounded text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 text-left"
                        >
                          ✕ Xoá filter
                        </button>
                      )}
                      <p className="mt-1 text-[10px] text-zinc-500">
                        {supplierOptions.length} NCC có trong BOM
                      </p>
                    </div>
                  )}
                </div>
              </th>
              )}
              {showCol("pic") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                  <div className="relative inline-flex items-center gap-1">
                    <span>PIC</span>
                    <button
                      type="button"
                      onClick={() => setPicFilterOpen((o) => !o)}
                      className={cn(
                        "inline-flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:text-zinc-700",
                        picFilter && "bg-indigo-600 text-white hover:bg-indigo-700",
                      )}
                      title="Lọc theo PIC"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        className="h-3 w-3"
                      >
                        <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
                      </svg>
                    </button>
                    {picFilterOpen && (
                      <div
                        className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 shadow-lg"
                        onMouseLeave={() => setPicFilterOpen(false)}
                      >
                        <input
                          type="text"
                          value={picFilter}
                          onChange={(e) => setPicFilter(e.target.value)}
                          placeholder="Tìm PIC…"
                          autoFocus
                          list="pic-options"
                          className="block w-full rounded border border-zinc-300 px-2 py-1 text-xs"
                        />
                        <datalist id="pic-options">
                          {picOptions.map((p) => (
                            <option key={p} value={p} />
                          ))}
                        </datalist>
                        {picFilter && (
                          <button
                            type="button"
                            onClick={() => {
                              setPicFilter("");
                              setPicFilterOpen(false);
                            }}
                            className="mt-1 w-full rounded text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 text-left"
                          >
                            ✕ Xoá filter
                          </button>
                        )}
                        <p className="mt-1 text-[10px] text-zinc-500">
                          {picOptions.length} PIC trong BOM
                        </p>
                      </div>
                    )}
                  </div>
                </th>
              )}
              {/* SL (total) — Quantity (hệ số) × parentQty. V3.7.33 column theo Excel. */}
              <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right" title={`SL = Quantity × ${parentQty} (số lượng parent)`}>
                SL
              </th>
              {showCol("notes") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left" title="Ghi chú phụ từ metadata.notes">
                  Note phụ
                </th>
              )}
              {showCol("scrap") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-right">
                  Hao hụt
                </th>
              )}
              {showCol("progress") && (
                <th className="sticky top-0 z-20 border-b-2 border-zinc-900 bg-zinc-50 px-2 text-left">
                  Tiến độ
                </th>
              )}
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
                <td colSpan={15} className="py-8 text-center text-xs text-zinc-400">
                  BOM chưa có linh kiện nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Footer — nút thêm dòng mới */}
      {!readOnly && (
        <div className="flex shrink-0 items-center border-t border-zinc-200 bg-zinc-50 px-3 py-1.5">
          <button
            type="button"
            onClick={() => setAddLineOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Thêm dòng
          </button>
        </div>
      )}

      <AddBomLineDialog
        open={addLineOpen}
        onOpenChange={setAddLineOpen}
        templateId={templateId}
      />

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

      {/* V1.7-beta.2 Phase C2 — Dialog đặt mua nhanh (Thương mại → PR Quick). */}
      <PRQuickDialog
        open={!!orderTarget}
        onOpenChange={(o) => !o && setOrderTarget(null)}
        templateId={templateId}
        templateCode={templateCode}
        parentQty={parentQty}
        line={orderTarget}
      />

      {/* V3.7.43 — Dialog Tạo Đơn gia công SX (GTAM → Work Order). */}
      <WOQuickDialog
        open={!!woTarget}
        onOpenChange={(o) => !o && setWoTarget(null)}
        templateCode={templateCode}
        line={woTarget}
      />

      {/* V3.7.43 — Dialog Tạo PO Đặt gia công ngoài (Subcontract → DDH-Mau PDF). */}
      <SubcontractPOQuickDialog
        open={!!subcontractTarget}
        onOpenChange={(o) => !o && setSubcontractTarget(null)}
        templateCode={templateCode}
        line={subcontractTarget}
      />

      {/* V3.7.20 — PIC update tiến độ dialog. */}
      {picEditTarget && (
        <PicEditDialog
          open={!!picEditTarget}
          onClose={() => setPicEditTarget(null)}
          line={{
            id: picEditTarget.id,
            sku: picEditTarget.node.componentSku ?? null,
            componentName: picEditTarget.node.componentName ?? null,
            qtyPerParent: picEditTarget.node.qtyPerParent,
            // V3.7.49 — Truyền SL Excel (totalQty) để dialog hiển thị "X cần"
            // theo số lượng đặt thực tế (vd 14 set), không phải hệ số (1).
            totalQty: (() => {
              const meta = picEditTarget.node.metadata as { totalQty?: string | number } | null;
              const fromExcel = meta?.totalQty != null ? Number(meta.totalQty) : NaN;
              if (Number.isFinite(fromExcel) && fromExcel > 0) return fromExcel;
              // Fallback: qtyPerParent × parentQty (legacy)
              return Number(picEditTarget.node.qtyPerParent ?? 1) * parentQty;
            })(),
            assignedToFullName: picEditTarget.node.assignedToFullName ?? null,
            receivedQty: picEditTarget.node.receivedQty ?? null,
            expectedEta: picEditTarget.node.expectedEta ?? null,
            statusNote: picEditTarget.node.statusNote ?? null,
          }}
        />
      )}
    </div>
  );
}

