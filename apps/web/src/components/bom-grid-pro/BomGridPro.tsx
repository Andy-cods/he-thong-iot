"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ChevronDown,
  ChevronRight,
  ImageOff,
  Plus,
  X,
} from "lucide-react";
import type { BomCategory } from "@iot/shared";
import { toast } from "sonner";
import { useVirtualizer } from "@tanstack/react-virtual";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { useAddBomLine, useBomLineWoImpact, useDeleteBomLine } from "@/hooks/useBom";
import { buildBomEditWoWarning } from "@/lib/bom-wo-warning";
import { useSession } from "@/hooks/useSession";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { PicEditDialog } from "./PicEditDialog";
import { getEtaBucket } from "./etaBucket";
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
import { SupplierCell } from "./SupplierCell";
import { StageJourneyCell } from "./StageJourneyCell";
import { StageMoveDialog, type StageMoveTarget } from "./StageMoveDialog";
import { DeliverySlipDialog, type SlipTarget } from "./DeliverySlipDialog";
import type { SlipKind } from "@/hooks/useDeliverySlips";
import { useBomStages } from "@/hooks/useBomStages";
import { buildJourney, type JourneyView } from "@/lib/bom-stage-journey";
import { lineSupplierLabel, lineSupplierSearchText } from "@/lib/bom-line-supplier";
import { PRQuickDialog } from "./PRQuickDialog";
import { WOQuickDialog } from "./WOQuickDialog";
import { SubcontractPOQuickDialog } from "./SubcontractPOQuickDialog";
import { AddBomLineDialog } from "./AddBomLineDialog";
import {
  CATEGORY_GROUP_LABEL,
  CATEGORY_ORDER,
  lineCategory,
  lineCoef,
  lineIdText,
  lineImageSrc,
  lineNameText,
  linePics,
  picInitial,
} from "@/lib/bom-grid/line-view";

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

/** BOM V5 WP5: cột Thao tác chỉ còn 1 nút "…". */
const ACTIONS_COL_W = 56;
/** Bề rộng 4 cột dính trái (md+): chọn/STT · ID · Ảnh · Tên. */
const COL_SEL_W = 64;
const COL_ID_W = 72;
const COL_IMG_W = 64;
const COL_NAME_W = 220;
const STICKY_LEFT = {
  id: COL_SEL_W,
  img: COL_SEL_W + COL_ID_W,
  name: COL_SEL_W + COL_ID_W + COL_IMG_W,
} as const;
/** WP6: cột "Hành trình · số lượng" (5 bước) giữa Tên và NCC. */
const SHOW_JOURNEY_COL = true;
const JOURNEY_COL_W = 220;
/** Ảo hoá dòng khi vượt ngưỡng này. */
const VIRTUALIZE_THRESHOLD = 40;
/** V4.1 UI-04: cột PIC 110 → 140px để pill tên không bị cắt. */
const PIC_COL_W = 140;
const TH =
  "sticky top-0 z-20 border-b border-zinc-200 bg-zinc-50 px-2 text-left dark:border-zinc-700 dark:bg-zinc-800";
/** V4.1 UI-BOM: chiều cao thead (h-8) — offset đầu cho virtualizer. */
const GRID_HEADER_H = 32;

/**
 * V3.8.3 — Tổng SL cần của 1 dòng: ưu tiên metadata.totalQty (raw Excel),
 * fallback qtyPerParent × parentQty. Khớp logic cell "SL" (đã có).
 */
type ListItem =
  | { type: "row"; row: BomFlatRow; stt: number }
  | { type: "cat"; cat: BomCategory; count: number };

/** Quy cách D×R×C: metadata.size → item.dimensions → spec_json.dimensionText. */
function lineDimsText(node: BomTreeNodeRaw): string | null {
  const md = node.metadata as { size?: string } | null;
  if (md?.size && md.size.trim()) return md.size;
  const dim = node.itemDimensions as {
    length?: number | string;
    width?: number | string;
    height?: number | string;
    unit?: string;
  } | null;
  if (dim) {
    const parts = [dim.length, dim.width, dim.height]
      .map((v) => (v === 0 || v === "0" ? null : v))
      .filter((v): v is number | string => v != null && v !== "");
    if (parts.length > 0) {
      return `${parts.join("×")}${dim.unit ? ` ${dim.unit}` : ""}`;
    }
  }
  const rawSpec = node.itemSpecJson;
  if (rawSpec && rawSpec.trim()) {
    try {
      const parsed = JSON.parse(rawSpec) as { dimensionText?: unknown };
      if (typeof parsed.dimensionText === "string" && parsed.dimensionText.trim()) {
        return parsed.dimensionText;
      }
    } catch {
      return rawSpec;
    }
  }
  return null;
}

/** Ảnh 3D thumb 44px, lazy; lỗi tải / không có → ô "chưa có ảnh". */
function LineThumb({ src }: { src: string | null }) {
  const [failed, setFailed] = React.useState(false);
  if (!src || failed) {
    return (
      <div
        className="flex h-11 w-11 flex-col items-center justify-center gap-0.5 rounded-xl bg-zinc-100 text-[9px] leading-none text-zinc-400 dark:bg-zinc-800 dark:text-zinc-500"
        title="Chưa có ảnh"
      >
        <ImageOff className="h-3.5 w-3.5" aria-hidden />
        chưa có ảnh
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt=""
      width={44}
      height={44}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className="h-11 w-11 rounded-xl bg-zinc-100 object-cover ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800 dark:ring-zinc-700"
    />
  );
}

function lineTotalQty(node: BomTreeNodeRaw, parentQty: number): number {
  const meta = node.metadata as { totalQty?: string | number } | null;
  const fromExcel = meta?.totalQty != null ? Number(meta.totalQty) : NaN;
  if (Number.isFinite(fromExcel) && fromExcel > 0) return fromExcel;
  return (Number(node.qtyPerParent) || 0) * parentQty;
}

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
  // V3.8.3 — Thu mua được sửa ETA nhận hàng (để chủ động theo dõi + giục NCC).
  const isPurchaser = (session.data?.roles ?? []).includes("purchaser");

  const deleteLine = useDeleteBomLine(templateId);
  const addLine = useAddBomLine(templateId);
  // TASK-6VIEC Việc 5 — cảnh báo nếu có lệnh SX chưa hoàn thành đang dùng
  // dòng BOM sắp xoá (chỉ cảnh báo trong dialog xác nhận, không chặn xoá).
  const deleteWoImpact = useBomLineWoImpact(templateId, deleteTarget?.id ?? null);
  const deleteWoWarning = buildBomEditWoWarning(
    deleteWoImpact.data?.data ?? { count: 0, wos: [] },
  );

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
  // V3.8.3 — Filter ETA: chỉ hiện dòng quá hạn / sắp tới hạn (≤7 ngày).
  const [etaUrgentOnly, setEtaUrgentOnly] = React.useState(false);

  // Tập hợp danh sách NCC unique để gợi ý
  const supplierOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of flat) {
      const s = lineSupplierLabel(r.node);
      if (s && s.trim()) set.add(s.trim());
    }
    return Array.from(set).sort();
  }, [flat]);

  // V3.7.37 — Tập PIC unique (assignedToFullName ưu tiên, fallback assignedToName raw).
  const picOptions = React.useMemo(() => {
    const set = new Set<string>();
    for (const r of flat) {
      for (const p of linePics(r.node)) set.add(p);
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
    if (supNeedle || picNeedle || etaUrgentOnly) {
      const matchIds = new Set<string>();
      for (const r of flat) {
        const s = lineSupplierSearchText(r.node).toLowerCase();
        const p = [
          r.node.assignedToFullName ?? r.node.assignedToName ?? "",
          ...(r.node.picNames ?? []),
        ]
          .join(" ")
          .toLowerCase();
        const supOk = !supNeedle || s.includes(supNeedle);
        const picOk = !picNeedle || p.includes(picNeedle);
        // V3.8.3 — ETA urgent filter: chỉ dòng quá hạn / sắp tới hạn (≤7 ngày).
        // Group row không có ETA → không match trực tiếp, được giữ qua ancestor.
        const etaOk =
          !etaUrgentOnly ||
          (!r.isGroup &&
            getEtaBucket(
              r.node.expectedEta,
              Number(r.node.receivedQty ?? 0),
              lineTotalQty(r.node, parentQty),
            ).needsAttention);
        if (supOk && picOk && etaOk) matchIds.add(r.id);
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
  }, [flat, expanded, supplierFilter, picFilter, etaUrgentOnly, parentQty]);

  // V3.7.21 — Auto-hide empty columns: cột phụ nào không có data thì ẩn,
  // user có thể toggle để hiện lại tất cả. BOM V5 WP5: ID/Ảnh/Tên/NCC/PIC/
  // Hệ số/SL luôn hiện; chỉ ẩn cột phụ rỗng (BOM cũ NULL không vỡ layout).
  const [showAllColumns, setShowAllColumns] = React.useState(false);
  const colHasData = React.useMemo(() => {
    const has = {
      dimensions: false,
      processMethod: false,
      materialCode: false,
      surfaceTreatment: false,
      blankSpec: false,
      notes: false,
      scrap: false,
      progress: false, // Tiến độ
    };
    for (const r of visibleRows) {
      if (r.isGroup) continue;
      const meta = r.node.metadata as { notes?: string; note?: string } | undefined;
      if (meta?.notes || meta?.note) has.notes = true;
      if (lineDimsText(r.node)) has.dimensions = true;
      if (r.node.processMethod) has.processMethod = true;
      if (r.node.materialCode) has.materialCode = true;
      if (r.node.surfaceTreatment) has.surfaceTreatment = true;
      if (r.node.blankSpec) has.blankSpec = true;
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

  // V3.8.3 — Cột "Dự kiến nhận" LUÔN hiện (cột nhập-liệu chủ động cho Thu mua).
  const showEtaCol = true;

  // Tổng độ rộng <col> (khớp colgroup) làm min-width bảng.
  const tableMinWidth =
    COL_SEL_W + COL_ID_W + COL_IMG_W + COL_NAME_W + 150 + 200 + 140 + 64 + 64 +
    ACTIONS_COL_W +
    (SHOW_JOURNEY_COL ? JOURNEY_COL_W : 0) +
    (showCol("dimensions") ? 130 : 0) +
    (showCol("processMethod") ? 120 : 0) +
    (showCol("materialCode") ? 110 : 0) +
    (showCol("surfaceTreatment") ? 110 : 0) +
    (showCol("blankSpec") ? 150 : 0) +
    (showCol("notes") ? 120 : 0) +
    (showCol("scrap") ? 60 : 0) +
    (showCol("progress") ? 150 : 0) +
    (showEtaCol ? 172 : 0);

  // V3.8.3 — Đếm dòng quá hạn / sắp tới hạn cho badge cảnh báo Thu mua.
  const etaSummary = React.useMemo(() => {
    let overdue = 0;
    let dueSoon = 0; // 0..7 ngày (chưa quá hạn nhưng cần chú ý)
    for (const r of visibleRows) {
      if (r.isGroup || !r.node.expectedEta) continue;
      const b = getEtaBucket(
        r.node.expectedEta,
        Number(r.node.receivedQty ?? 0),
        lineTotalQty(r.node, parentQty),
      );
      if (b.tone === "overdue") overdue++;
      else if (b.tone === "urgent" || b.tone === "near") dueSoon++;
    }
    return { overdue, dueSoon };
  }, [visibleRows, parentQty]);

  // Tổng số cột đang hiển thị — colSpan cho dòng nhóm / rỗng / đệm virtualizer.
  const colCount =
    4 + // chọn/STT + ID + Ảnh + Tên
    (SHOW_JOURNEY_COL ? 1 : 0) +
    2 + // NCC + Vật liệu/Ghi chú
    (showCol("dimensions") ? 1 : 0) +
    (showCol("processMethod") ? 1 : 0) +
    (showCol("materialCode") ? 1 : 0) +
    (showCol("surfaceTreatment") ? 1 : 0) +
    (showCol("blankSpec") ? 1 : 0) +
    3 + // PIC + Hệ số + SL
    (showCol("notes") ? 1 : 0) +
    (showCol("scrap") ? 1 : 0) +
    (showCol("progress") ? 1 : 0) +
    (showEtaCol ? 1 : 0) +
    1; // Thao tác

  // BOM V5 WP5 — chọn dòng (nền cho thao tác hàng loạt của WP6).
  const [selected, setSelected] = React.useState<Set<string>>(() => new Set());
  // BOM V5 WP6 — hành trình theo SL (sổ bước), cache react-query, invalidate sau khi chuyển.
  const stagesQuery = useBomStages(templateId);
  const stageLines = stagesQuery.data?.data.lines;
  const journeyOf = React.useCallback(
    (lineId: string): JourneyView | null => {
      const st = stageLines?.[lineId];
      return st ? buildJourney(st.category, st.required, st.buckets) : null;
    },
    [stageLines],
  );
  const [stageMoveOpen, setStageMoveOpen] = React.useState(false);
  const stageTargets = React.useMemo<StageMoveTarget[]>(() => {
    const out: StageMoveTarget[] = [];
    for (const r of flat) {
      if (r.isGroup || !selected.has(r.id)) continue;
      const st = stageLines?.[r.id];
      out.push({
        id: r.id,
        name: lineNameText(r.node) || r.node.componentName || r.id,
        category: st?.category ?? lineCategory(r.node),
        buckets: st?.buckets ?? null,
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, selected, stageLines, stageMoveOpen]);
  // BOM V5 WP8 — phiếu giao (Gửi nhà thầu phụ / Giao lắp ráp) từ các dòng đã chọn.
  const [slipKind, setSlipKind] = React.useState<SlipKind | null>(null);
  const slipTargets = React.useMemo<SlipTarget[]>(() => {
    if (!slipKind) return [];
    const out: SlipTarget[] = [];
    for (const r of flat) {
      if (r.isGroup || !selected.has(r.id)) continue;
      const st = stageLines?.[r.id];
      out.push({
        id: r.id,
        name: lineNameText(r.node) || r.node.componentName || r.id,
        category: st?.category ?? lineCategory(r.node),
        buckets: st?.buckets ?? null,
        positionCode: r.node.positionCode ?? null,
        surfaceTreatment: r.node.surfaceTreatment ?? null,
        dimsText: lineDimsText(r.node),
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flat, selected, stageLines, slipKind]);
  const toggleSelected = React.useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // BOM V5 WP5 — nhóm theo Category khi BOM phẳng (không có cụm lắp). BOM cũ
  // có cây cụm lắp vẫn render dạng cây như trước.
  const categoryMode = React.useMemo(
    () => flat.length > 0 && flat.every((r) => !r.isGroup),
    [flat],
  );
  const [collapsedCats, setCollapsedCats] = React.useState<Set<BomCategory>>(
    () => new Set(),
  );
  const toggleCat = React.useCallback((cat: BomCategory) => {
    setCollapsedCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);

  const listItems = React.useMemo<ListItem[]>(() => {
    const out: ListItem[] = [];
    if (!categoryMode) {
      visibleRows.forEach((row, i) => out.push({ type: "row", row, stt: i + 1 }));
      return out;
    }
    const buckets = new Map<BomCategory, BomFlatRow[]>();
    for (const row of visibleRows) {
      const c = lineCategory(row.node);
      const arr = buckets.get(c);
      if (arr) arr.push(row);
      else buckets.set(c, [row]);
    }
    let stt = 0;
    for (const cat of CATEGORY_ORDER) {
      const rows = buckets.get(cat);
      if (!rows || rows.length === 0) continue;
      out.push({ type: "cat", cat, count: rows.length });
      if (collapsedCats.has(cat)) continue;
      for (const row of rows) out.push({ type: "row", row, stt: ++stt });
    }
    return out;
  }, [visibleRows, categoryMode, collapsedCats]);

  const allSelected =
    visibleRows.length > 0 &&
    visibleRows.every((r) => r.isGroup || selected.has(r.id));
  const toggleSelectAll = () => {
    setSelected(
      allSelected
        ? new Set()
        : new Set(visibleRows.filter((r) => !r.isGroup).map((r) => r.id)),
    );
  };

  // Virtualizer — dòng ảo nằm TRONG luồng bảng + 2 dòng đệm (V4.1 UI-BOM): mỗi
  // dòng đo thật (measureElement), cột dùng chung <colgroup>, không absolute.
  const parentRef = React.useRef<HTMLDivElement>(null);
  const useVirtualize = listItems.length > VIRTUALIZE_THRESHOLD;
  const hasProgressCol = showCol("progress");
  const virt = useVirtualizer({
    count: listItems.length,
    getScrollElement: () => parentRef.current,
    // Ước lượng ban đầu (ảnh 44px → ~56px); chiều cao thật đo qua measureElement.
    estimateSize: (i) => {
      const it = listItems[i];
      if (!it || it.type === "cat" || it.row.isGroup) return 36;
      return hasProgressCol ? 60 : 56;
    },
    // thead (h-8) nằm trong vùng cuộn, trước dòng đầu tiên.
    paddingStart: GRID_HEADER_H,
    overscan: 12,
    enabled: useVirtualize,
    getItemKey: (i) => {
      const it = listItems[i];
      return it ? (it.type === "cat" ? `cat-${it.cat}` : it.row.id) : i;
    },
  });
  const listItemsRef = React.useRef(listItems);
  listItemsRef.current = listItems;

  // V4.5 QA-C P2-3: lưới tràn ngang trên điện thoại (390px) nhưng không có
  // chỉ báo cuộn — người dùng không biết còn cột (Tiến độ/SL/Dự kiến nhận)
  // ngoài khung hình. Theo dõi scrollLeft của chính `parentRef` (container
  // cuộn ngang DUY NHẤT — không ảnh hưởng cuộn dọc của virtualizer) để hiện
  // mép mờ 2 bên, cùng kiểu với `ScrollTabsList`.
  const [bomMoreLeft, setBomMoreLeft] = React.useState(false);
  const [bomMoreRight, setBomMoreRight] = React.useState(false);
  const updateBomScrollFade = React.useCallback(() => {
    const el = parentRef.current;
    if (!el) return;
    setBomMoreLeft(el.scrollLeft > 2);
    setBomMoreRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 2);
  }, []);
  React.useEffect(() => {
    updateBomScrollFade();
    window.addEventListener("resize", updateBomScrollFade);
    return () => window.removeEventListener("resize", updateBomScrollFade);
  }, [updateBomScrollFade, tableMinWidth, visibleRows.length]);

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
    setCollapsedCats((prev) => (prev.size ? new Set() : prev));
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
        return;
      }
      // V4.1 UI-BOM: chế độ ảo hoá — dòng đích có thể chưa được render,
      // cuộn theo index qua virtualizer.
      const targetIdx = listItemsRef.current.findIndex(
        (it) => it.type === "row" && it.row.id === highlightParam,
      );
      if (targetIdx >= 0) virt.scrollToIndex(targetIdx, { align: "center" });
    }, 80);

    // Clear highlight after 3s.
    const clearTimer = window.setTimeout(() => {
      setHighlightedLineId(null);
    }, 3000);

    return () => {
      window.clearTimeout(scrollTimer);
      window.clearTimeout(clearTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // `virtualIndex` (khi ảo hoá) → gắn ref đo chiều cao thật + data-index.
  const renderCatRow = (
    item: Extract<ListItem, { type: "cat" }>,
    virtualIndex?: number,
  ) => {
    const measureProps =
      virtualIndex !== undefined
        ? { ref: virt.measureElement, "data-index": virtualIndex }
        : {};
    const collapsed = collapsedCats.has(item.cat);
    return (
      <tr key={`cat-${item.cat}`} {...measureProps}>
        <td
          colSpan={colCount}
          className="sticky top-8 z-10 border-b border-zinc-200 bg-zinc-100 px-0 py-1.5 dark:border-zinc-700 dark:bg-zinc-800"
        >
          <button
            type="button"
            onClick={() => toggleCat(item.cat)}
            className="sticky left-0 inline-flex items-center gap-2 px-3 text-[13px] font-semibold text-zinc-800 dark:text-zinc-100"
            aria-expanded={!collapsed}
          >
            {collapsed ? (
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            ) : (
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            )}
            {CATEGORY_GROUP_LABEL[item.cat]}
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-medium tabular-nums text-zinc-500 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
              {item.count} dòng
            </span>
          </button>
        </td>
      </tr>
    );
  };

  const renderRow = (row: BomFlatRow, stt: number, virtualIndex?: number) => {
    const measureProps =
      virtualIndex !== undefined
        ? { ref: virt.measureElement, "data-index": virtualIndex }
        : {};
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
          {...measureProps}
          className={cn(
            "group border-b border-indigo-100 bg-indigo-50 transition-colors dark:border-indigo-900 dark:bg-indigo-950/40",
            "hover:bg-indigo-100/70 dark:hover:bg-indigo-900/40",
            isHighlighted &&
              "!bg-yellow-100 ring-2 ring-inset ring-yellow-400 dark:!bg-yellow-900/40",
          )}
        >
          <td className="w-10 px-2 text-xs font-mono text-indigo-400 tabular-nums dark:text-indigo-500">
            {stt}
          </td>
          <td colSpan={colCount - 2} className="px-2 py-1.5">
            <button
              type="button"
              onClick={() => toggleExpand(row.id)}
              className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-indigo-800 hover:text-indigo-900 dark:text-indigo-300 dark:hover:text-indigo-200"
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
              <span className="rounded bg-indigo-100 px-1.5 py-0.5 text-xs font-mono text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-300">
                {row.childCount} linh kiện
              </span>
            </button>
          </td>
          {/* Nền ĐẶC — ô sticky trong suốt sẽ lộ nội dung cuộn ngang. */}
          <td className="md:sticky md:right-0 z-10 border-l border-indigo-100 bg-indigo-50 px-1 group-hover:bg-indigo-100 dark:border-indigo-900 dark:bg-indigo-950 dark:group-hover:bg-indigo-900">
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

    const node = row.node;
    const pics = linePics(node);
    const picMatched = !!node.assignedToFullName || (node.picNames?.length ?? 0) > 0;
    const canEditPic =
      isAdmin ||
      isPurchaser || // V3.8.3 — Thu mua sửa được ETA nhận hàng
      (!!currentUserId && node.assignedToUserId === currentUserId);
    const idText = lineIdText(node);
    const nameText = lineNameText(node);
    const dimsText = lineDimsText(node);
    const meta = node.metadata as { notes?: string; totalQty?: string | number } | null;
    const stickyBg =
      "bg-white group-hover:bg-zinc-50 dark:bg-zinc-900 dark:group-hover:bg-zinc-800";
    const dash = <span className="text-zinc-300 dark:text-zinc-600">—</span>;
    const textCell = (v: string | null | undefined) =>
      v && v.trim() ? (
        <span title={v}>{v}</span>
      ) : (
        dash
      );

    return (
      <tr
        key={row.id}
        id={`bom-line-${row.id}`}
        {...measureProps}
        onClick={(e) => {
          // Bấm dòng → mở BomLineSheet; bỏ qua nút/link/ô nhập và popover portal.
          if (readOnly && !onEditLine) return;
          const t = e.target as HTMLElement;
          if (!e.currentTarget.contains(t)) return;
          if (t.closest("button, a, input, select, textarea, [role='combobox']")) return;
          handleEditRow(row);
        }}
        className={cn(
          "group cursor-pointer border-b border-zinc-100 bg-white transition-colors hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:hover:bg-zinc-800/60",
          selected.has(row.id) && "!bg-indigo-50/60 dark:!bg-indigo-950/30",
          isHighlighted &&
            "!bg-yellow-100 ring-2 ring-inset ring-yellow-400 dark:!bg-yellow-900/40",
        )}
      >
        {/* ☐ + STT (dính trái md+) */}
        <td
          className={cn("px-2 md:sticky md:left-0 md:z-10", stickyBg)}
          onClick={(e) => e.stopPropagation()}
        >
          <label className="flex cursor-pointer items-center gap-1.5">
            <input
              type="checkbox"
              checked={selected.has(row.id)}
              onChange={() => toggleSelected(row.id)}
              aria-label={`Chọn dòng ${stt}`}
              className="h-3.5 w-3.5 rounded border-zinc-300 accent-indigo-600"
            />
            <span className="font-mono text-xs tabular-nums text-zinc-400 dark:text-zinc-500">
              {stt}
            </span>
          </label>
        </td>
        {/* ID — positionCode (BL1..) → metadata.seq (ID Number cũ) */}
        <td
          className={cn(
            "truncate px-2 font-mono text-xs font-medium text-indigo-700 dark:text-indigo-400 md:sticky md:left-[64px] md:z-10",
            stickyBg,
          )}
        >
          {idText ?? dash}
        </td>
        {/* Ảnh 3D */}
        <td className={cn("px-2 py-1 md:sticky md:left-[136px] md:z-10", stickyBg)}>
          <LineThumb src={lineImageSrc(node, "thumb")} />
        </td>
        {/* Tên chi tiết — dính trái cả trên điện thoại */}
        <td
          className={cn(
            "border-r border-zinc-100 px-2 max-md:sticky max-md:left-0 max-md:z-10 md:sticky md:left-[200px] md:z-10 dark:border-zinc-800",
            stickyBg,
          )}
        >
          <div
            className="truncate text-[13px] font-semibold text-zinc-900 dark:text-zinc-50"
            title={nameText ?? undefined}
          >
            {nameText ?? dash}
          </div>
          {node.componentItemId && node.componentSku && node.file3dName ? (
            <Link
              href={`/items/${node.componentItemId}`}
              className="block truncate font-mono text-[11px] text-zinc-500 underline-offset-2 hover:text-indigo-700 hover:underline dark:text-zinc-400 dark:hover:text-indigo-400"
              title={`Xem chi tiết vật tư ${node.componentSku}`}
              onClick={(e) => e.stopPropagation()}
            >
              {node.componentSku}
            </Link>
          ) : null}
        </td>
        {/* WP6: Hành trình · số lượng */}
        {SHOW_JOURNEY_COL && (
          <td className="px-2">
            <StageJourneyCell journey={journeyOf(row.id)} />
          </td>
        )}
        {/* NCC — SupplierCell bấm sửa trực tiếp */}
        <td className="px-2" onClick={(e) => e.stopPropagation()}>
          <SupplierCell
            templateId={templateId}
            lineId={row.id}
            line={node}
            rowVersion={node.rowVersion}
          />
        </td>
        {/* Vật liệu / Ghi chú (bom_line.description) */}
        <td className="truncate px-2 text-sm text-zinc-700 dark:text-zinc-300">
          {textCell(node.description)}
        </td>
        {showCol("dimensions") && (
          <td className="truncate px-2 font-mono text-sm text-zinc-600 dark:text-zinc-400">
            {textCell(dimsText)}
          </td>
        )}
        {showCol("processMethod") && (
          <td className="truncate px-2 text-sm text-zinc-700 dark:text-zinc-300">
            {textCell(node.processMethod)}
          </td>
        )}
        {showCol("materialCode") && (
          <td className="truncate px-2 font-mono text-xs text-zinc-700 dark:text-zinc-300">
            {textCell(node.materialCode)}
          </td>
        )}
        {showCol("surfaceTreatment") && (
          <td className="truncate px-2 text-sm text-zinc-700 dark:text-zinc-300">
            {textCell(node.surfaceTreatment)}
          </td>
        )}
        {showCol("blankSpec") && (
          <td className="truncate px-2 text-sm text-zinc-700 dark:text-zinc-300">
            {textCell(node.blankSpec)}
          </td>
        )}
        {/* PIC — avatar tròn (picNames[] → assignedToName) */}
        <td className="px-2">
          {pics.length === 0 ? (
            dash
          ) : (
            <button
              type="button"
              onClick={canEditPic ? () => setPicEditTarget(row) : undefined}
              disabled={!canEditPic}
              className={cn(
                "inline-flex max-w-full items-center gap-1.5 rounded-full py-0.5 pr-2 text-sm",
                canEditPic ? "cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800" : "cursor-default",
              )}
              title={
                (canEditPic ? "Bấm để cập nhật tiến độ · " : "") +
                `PIC: ${pics.join(", ")}` +
                (picMatched ? "" : " (chưa khớp tài khoản)")
              }
            >
              <span className="flex shrink-0 -space-x-1.5">
                {pics.slice(0, 3).map((n, i) => (
                  <span
                    key={`${n}-${i}`}
                    className={cn(
                      "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white dark:ring-zinc-900",
                      picMatched
                        ? "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"
                        : "bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300",
                    )}
                  >
                    {picInitial(n)}
                  </span>
                ))}
              </span>
              <span className="min-w-0 truncate text-zinc-700 dark:text-zinc-300">
                {pics.length === 1 ? pics[0] : `${pics[0]} +${pics.length - 1}`}
              </span>
            </button>
          )}
        </td>
        {/* Hệ số (coef V5 → qtyPerParent) */}
        <td className="px-2 text-right font-mono text-xs tabular-nums text-zinc-700 dark:text-zinc-300">
          {formatNumber(lineCoef(node))}
        </td>
        {/* SL — metadata.totalQty (raw Excel) → qty × parentQty */}
        <td className="px-2 text-right font-mono text-xs font-semibold tabular-nums text-zinc-900 dark:text-zinc-50">
          {(() => {
            const fromExcel = meta?.totalQty != null ? Number(meta.totalQty) : NaN;
            if (Number.isFinite(fromExcel) && fromExcel > 0) return formatNumber(fromExcel);
            return formatNumber(qty * parentQty);
          })()}
        </td>
        {showCol("notes") && (
          <td className="truncate px-2 text-xs italic text-zinc-500 dark:text-zinc-400">
            {meta?.notes ?? ""}
          </td>
        )}
        {showCol("scrap") && (
          <td className="px-2 text-right font-mono text-xs tabular-nums text-orange-600 dark:text-orange-400">
            {scrap > 0 ? `${scrap.toFixed(1)}%` : "—"}
          </td>
        )}
        {/* Tiến độ — kind-aware (fab → WO progress, com → material status) */}
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
                const com = comProgressMap?.[node.componentItemId];
                return (
                  <ProgressCell
                    status={status}
                    pct={com?.pct}
                    milestones={com?.milestones}
                    requiredQty={com?.requiredQty}
                    purchasedQty={com?.purchasedQty}
                    uom={node.componentUom ?? undefined}
                  />
                );
              })()
            )}
          </td>
        )}
        {/* Dự kiến nhận — V3.8.3: ETA + màu khẩn cấp; luôn hiện. */}
        {showEtaCol && (() => {
          const b = getEtaBucket(
            node.expectedEta,
            Number(node.receivedQty ?? 0),
            lineTotalQty(node, parentQty),
          );
          const canEditEta = !readOnly && canEditPic;
          const inner = (
            <>
              {b.Icon && <b.Icon className="h-3 w-3 shrink-0" aria-hidden />}
              {b.dateLabel && <span className="font-mono font-medium">{b.dateLabel}</span>}
              {b.dateLabel && <span className="opacity-50">·</span>}
              <span className={cn(b.tone === "overdue" && "font-semibold")}>
                {b.dayLabel}
              </span>
              {canEditEta && <span className="ml-0.5 text-xs opacity-60">✎</span>}
            </>
          );
          const cls = cn(
            "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-sm tabular-nums",
            b.cellClass,
          );
          return (
            <td className="px-2">
              {canEditEta ? (
                <button
                  type="button"
                  onClick={() => setPicEditTarget(row)}
                  className={cn(cls, "cursor-pointer hover:ring-2 hover:ring-indigo-300 dark:hover:ring-indigo-700")}
                  title={`${b.title} · bấm để sửa ngày dự kiến nhận`}
                >
                  {inner}
                </button>
              ) : (
                <span className={cls} title={b.title}>
                  {inner}
                </span>
              )}
            </td>
          );
        })()}
        {/* Thao tác — 1 nút "…" (sticky phải từ md) */}
        <td
          className="md:sticky md:right-0 z-10 border-l border-zinc-100 bg-white px-1 group-hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:group-hover:bg-zinc-800/60"
          onClick={(e) => e.stopPropagation()}
        >
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

  const renderItem = (it: ListItem, virtualIndex?: number) =>
    it.type === "cat"
      ? renderCatRow(it, virtualIndex)
      : renderRow(it.row, it.stt, virtualIndex);

  return (
    <div className="flex h-full flex-col overflow-hidden rounded-md border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
      {/* Header meta — BOM title + parent qty */}
      {/* V4.1 UI-03: thanh công cụ tự xuống dòng (trước đây h-10 cố định →
          chip bị bóp 3 dòng trên điện thoại); bỏ nền gradient. */}
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-800/40 md:px-4">
        {/* Mã/tên đã có ở topbar → điện thoại ẩn cho gọn. */}
        <div className="hidden min-w-0 items-center gap-3 md:flex">
          <span className="shrink-0 font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-300">
            {templateCode}
          </span>
          <span className="text-xs text-zinc-400 dark:text-zinc-500">/</span>
          <span className="min-w-0 truncate text-sm font-medium text-zinc-900 dark:text-zinc-50" title={templateName}>
            {templateName}
          </span>
        </div>
        <div className="hidden flex-1 md:block" />
        <span
          className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-indigo-50 px-2 py-0.5 text-sm font-medium text-indigo-700 ring-1 ring-inset ring-indigo-200 dark:bg-indigo-950/40 dark:text-indigo-400 dark:ring-indigo-800"
          title="Tổng SL = SL/bộ × SL thành phẩm"
        >
          SL thành phẩm
          <span className="font-mono text-sm font-semibold tabular-nums">
            {formatNumber(parentQty)}
          </span>
        </span>
        <span className="hidden whitespace-nowrap text-xs text-zinc-500 dark:text-zinc-400 lg:inline">
          Tổng SL = SL/bộ × SL thành phẩm
        </span>
        {selected.size > 0 && (
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-zinc-900 px-2 py-0.5 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900"
            title="Bỏ chọn tất cả"
          >
            Đã chọn {selected.size}
            <X className="h-3 w-3" aria-hidden />
          </button>
        )}
        {/* V3.7.21 — Auto-hide empty columns toggle */}
        <button
          type="button"
          onClick={() => setShowAllColumns((v) => !v)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border px-2 py-0.5 text-sm font-medium transition-colors",
            showAllColumns
              ? "border-zinc-300 bg-zinc-100 text-zinc-700 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-300 dark:hover:bg-zinc-700"
              : "border-emerald-300 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-400 dark:hover:bg-emerald-900/40",
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

        {/* V3.8.3 — Badge cảnh báo nhận hàng + filter nhanh cho Thu mua. */}
        {(etaSummary.overdue > 0 || etaSummary.dueSoon > 0) && (
          <button
            type="button"
            onClick={() => setEtaUrgentOnly((v) => !v)}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border px-2 py-0.5 text-sm font-medium transition-colors",
              etaUrgentOnly
                ? "border-rose-400 bg-rose-100 text-rose-800 hover:bg-rose-200 dark:border-rose-700 dark:bg-rose-950/60 dark:text-rose-300 dark:hover:bg-rose-900/40"
                : "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 dark:border-rose-800 dark:bg-rose-950/40 dark:text-rose-400 dark:hover:bg-rose-900/40",
            )}
            title={
              etaUrgentOnly
                ? "Đang lọc dòng quá/sắp hạn — bấm để bỏ lọc"
                : "Bấm để chỉ hiện dòng quá hạn / sắp tới hạn (≤7 ngày)"
            }
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="h-3 w-3"
            >
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            {etaSummary.overdue > 0 && (
              <span className="font-semibold">{etaSummary.overdue} quá hạn</span>
            )}
            {etaSummary.overdue > 0 && etaSummary.dueSoon > 0 && (
              <span className="text-rose-300 dark:text-rose-700">·</span>
            )}
            {etaSummary.dueSoon > 0 && (
              <span>{etaSummary.dueSoon} sắp tới</span>
            )}
          </button>
        )}
        {/* Khi đang lọc nhưng không còn dòng nào quá/sắp hạn → vẫn cho bỏ lọc */}
        {etaUrgentOnly && etaSummary.overdue === 0 && etaSummary.dueSoon === 0 && (
          <button
            type="button"
            onClick={() => setEtaUrgentOnly(false)}
            className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md border border-zinc-300 bg-zinc-100 px-2 py-0.5 text-sm font-medium text-zinc-600 hover:bg-zinc-200 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-700"
          >
            ✕ Bỏ lọc nhận hàng
          </button>
        )}
      </div>

      {/* Table — V3.7.33: Column order match Excel "Bản chính thức" CHÍNH XÁC.
          # | Image | ID Number | Quantity (hệ số) | BOM gốc | Ghi chú |
          Category | Quy cách (tham khảo) | NCC | PIC | SL | Tiến độ | Thao tác.
          Header label tiếng Việt khớp Excel. Cột Hao hụt/notes phụ chỉ hiện
          khi showAllColumns=true. */}
      <div className="relative min-w-0 flex-1">
      <div ref={parentRef} onScroll={updateBomScrollFade} className="h-full overflow-auto">
        {/* V4.1 UI-03: min-width = tổng độ rộng cột → điện thoại cuộn ngang
            thay vì bóp cột (cột "BOM gốc" từng còn 1 ký tự). */}
        <table
          className="w-full table-fixed border-collapse text-sm"
          style={{ minWidth: tableMinWidth }}
        >
          <colgroup>
            <col style={{ width: `${COL_SEL_W}px` }} />{/* ☐/STT */}
            <col style={{ width: `${COL_ID_W}px` }} />{/* ID */}
            <col style={{ width: `${COL_IMG_W}px` }} />{/* Ảnh 3D */}
            <col style={{ width: `${COL_NAME_W}px` }} />{/* Tên chi tiết */}
            {SHOW_JOURNEY_COL && <col style={{ width: `${JOURNEY_COL_W}px` }} />}{/* Hành trình (WP6) */}
            <col style={{ width: "150px" }} />{/* NCC */}
            <col style={{ width: "200px" }} />{/* Vật liệu/Ghi chú */}
            {showCol("dimensions") && <col style={{ width: "130px" }} />}{/* Quy cách D×R×C */}
            {showCol("processMethod") && <col style={{ width: "120px" }} />}{/* PP gia công */}
            {showCol("materialCode") && <col style={{ width: "110px" }} />}{/* Mã vật liệu */}
            {showCol("surfaceTreatment") && <col style={{ width: "110px" }} />}{/* Xử lý bề mặt */}
            {showCol("blankSpec") && <col style={{ width: "150px" }} />}{/* Phôi/Mã đặt hàng */}
            <col style={{ width: `${PIC_COL_W}px` }} />{/* PIC */}
            <col style={{ width: "64px" }} />{/* Hệ số */}
            <col style={{ width: "64px" }} />{/* SL */}
            {showCol("notes") && <col style={{ width: "120px" }} />}{/* Ghi chú phụ */}
            {showCol("scrap") && <col style={{ width: "60px" }} />}{/* Hao hụt */}
            {showCol("progress") && <col style={{ width: "150px" }} />}{/* Tiến độ */}
            {showEtaCol && <col style={{ width: "172px" }} />}{/* V3.8.3 Dự kiến nhận */}
            <col style={{ width: `${ACTIONS_COL_W}px` }} />{/* Thao tác (1 nút …) */}
          </colgroup>
          <thead>
            <tr className="h-8 text-[11px] font-semibold uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              <th className={cn(TH, "md:left-0 md:z-30 md:sticky")}>
                <label className="flex items-center gap-1.5">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={toggleSelectAll}
                    aria-label="Chọn tất cả"
                    className="h-3.5 w-3.5 rounded border-zinc-300 accent-indigo-600"
                  />
                  STT
                </label>
              </th>
              <th className={cn(TH, "md:left-[64px] md:z-30")}>ID</th>
              <th className={cn(TH, "md:left-[136px] md:z-30")}>Ảnh 3D</th>
              <th className={cn(TH, "max-md:left-0 max-md:z-30 md:left-[200px] md:z-30 border-r border-zinc-200 dark:border-zinc-700")}>
                Tên chi tiết
              </th>
              {SHOW_JOURNEY_COL && <th className={TH}>Hành trình · số lượng</th>}
              <th className={TH}>
                <div className="relative inline-flex items-center gap-1">
                  <span>NCC</span>
                  <button
                    type="button"
                    onClick={() => setSupplierFilterOpen((o) => !o)}
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300",
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
                      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 normal-case shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                      onMouseLeave={() => setSupplierFilterOpen(false)}
                    >
                      <input
                        type="text"
                        value={supplierFilter}
                        onChange={(e) => setSupplierFilter(e.target.value)}
                        placeholder="Tìm NCC…"
                        autoFocus
                        list="ncc-options"
                        className="block w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
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
                          className="mt-1 w-full rounded text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 text-left dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          ✕ Xoá filter
                        </button>
                      )}
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {supplierOptions.length} NCC có trong BOM
                      </p>
                    </div>
                  )}
                </div>
              </th>
              <th className={TH}>Vật liệu / Ghi chú</th>
              {showCol("dimensions") && (
                <th className={TH} title="Quy cách Dài × Rộng × Cao">Quy cách D×R×C</th>
              )}
              {showCol("processMethod") && <th className={TH}>PP gia công</th>}
              {showCol("materialCode") && <th className={TH}>Mã vật liệu</th>}
              {showCol("surfaceTreatment") && <th className={TH}>Xử lý bề mặt</th>}
              {showCol("blankSpec") && (
                <th className={TH} title="Quy cách phôi / Mã đặt hàng">Phôi / Mã ĐH</th>
              )}
              <th className={TH}>
                <div className="relative inline-flex items-center gap-1">
                  <span>PIC</span>
                  <button
                    type="button"
                    onClick={() => setPicFilterOpen((o) => !o)}
                    className={cn(
                      "inline-flex h-4 w-4 items-center justify-center rounded text-zinc-400 hover:text-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-300",
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
                      className="absolute left-0 top-full z-30 mt-1 w-56 rounded-md border border-zinc-200 bg-white p-2 normal-case shadow-lg dark:border-zinc-700 dark:bg-zinc-900"
                      onMouseLeave={() => setPicFilterOpen(false)}
                    >
                      <input
                        type="text"
                        value={picFilter}
                        onChange={(e) => setPicFilter(e.target.value)}
                        placeholder="Tìm PIC…"
                        autoFocus
                        list="pic-options"
                        className="block w-full rounded border border-zinc-300 px-2 py-1 text-xs dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 dark:placeholder:text-zinc-500"
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
                          className="mt-1 w-full rounded text-xs text-rose-600 hover:bg-rose-50 px-2 py-1 text-left dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          ✕ Xoá filter
                        </button>
                      )}
                      <p className="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                        {picOptions.length} PIC trong BOM
                      </p>
                    </div>
                  )}
                </div>
              </th>
              <th className={cn(TH, "text-right")} title="Hệ số — số lượng chi tiết trên 1 sản phẩm">Hệ số</th>
              <th className={cn(TH, "text-right")} title={`SL = Hệ số × ${parentQty} (số lượng thành phẩm)`}>SL</th>
              {showCol("notes") && (
                <th className={TH} title="Ghi chú phụ từ metadata.notes">Note phụ</th>
              )}
              {showCol("scrap") && <th className={cn(TH, "text-right")}>Hao hụt</th>}
              {showCol("progress") && <th className={TH}>Tiến độ</th>}
              {showEtaCol && (
                <th
                  className={TH}
                  title="Ngày dự kiến nhận hàng từ NCC — tô đỏ dần khi gần/quá hạn để chủ động giục."
                >
                  Dự kiến nhận
                </th>
              )}
              <th className={cn(TH, "md:right-0 z-30 border-l border-zinc-200 text-center dark:border-zinc-700")}>
                <span className="sr-only">Thao tác</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {!useVirtualize && listItems.map((it) => renderItem(it))}
            {useVirtualize &&
              (() => {
                // V4.1 UI-BOM: dòng ảo trong luồng bảng + 2 dòng đệm.
                const items = virt.getVirtualItems();
                const first = items[0];
                const last = items[items.length - 1];
                const padTop = first
                  ? Math.max(0, first.start - GRID_HEADER_H)
                  : 0;
                const padBottom = last
                  ? Math.max(0, virt.getTotalSize() - last.end)
                  : 0;
                return (
                  <>
                    {padTop > 0 && (
                      <tr aria-hidden>
                        <td
                          colSpan={colCount}
                          style={{ height: padTop, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                    {items.map((v) => {
                      const it = listItems[v.index];
                      if (!it) return null;
                      return renderItem(it, v.index);
                    })}
                    {padBottom > 0 && (
                      <tr aria-hidden>
                        <td
                          colSpan={colCount}
                          style={{ height: padBottom, padding: 0, border: 0 }}
                        />
                      </tr>
                    )}
                  </>
                );
              })()}
            {listItems.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-xs text-zinc-400 dark:text-zinc-500">
                  BOM chưa có linh kiện nào.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {/* V4.5 QA-C P2-3: mép mờ 2 bên báo còn cột ngoài khung hình (cùng kiểu
          ScrollTabsList) — chỉ hiện khi bảng thật sự tràn (bomMoreLeft/Right). */}
      {bomMoreLeft ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-white to-transparent dark:from-zinc-900"
        />
      ) : null}
      {bomMoreRight ? (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-white to-transparent dark:from-zinc-900"
        />
      ) : null}
      </div>

      {/* Footer — nút thêm dòng mới */}
      {!readOnly && (
        <div className="flex shrink-0 items-center border-t border-zinc-200 bg-zinc-50 px-3 py-1.5 dark:border-zinc-800 dark:bg-zinc-800">
          <button
            type="button"
            onClick={() => setAddLineOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-indigo-600 hover:bg-indigo-50 hover:text-indigo-700 transition-colors dark:text-indigo-400 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
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
          // TASK-6VIEC Việc 5 — chèn cảnh báo lệnh SX (nếu có) lên đầu, không
          // thay đổi luồng xoá hiện có (vẫn phải gõ "XOA" để xác nhận).
          [
            deleteWoWarning,
            deleteTarget?.childCount
              ? `Dòng này có ${deleteTarget.childCount} linh kiện con. Các linh kiện con cũng bị xoá theo. Gõ "XOA" để xác nhận.`
              : `Xoá dòng linh kiện này? Gõ "XOA" để xác nhận.`,
          ]
            .filter(Boolean)
            .join(" ")
        }
        confirmText="XOA"
        actionLabel="Xoá"
        loading={deleteLine.isPending}
        onConfirm={handleDelete}
      />

      {/* BOM V5 WP6 — thanh hành động nổi khi chọn dòng + dialog chuyển bước. */}
      {selected.size > 0 && !readOnly && (
        <div
          role="toolbar"
          aria-label="Thao tác trên dòng đã chọn"
          className="fixed bottom-5 left-1/2 z-40 flex -translate-x-1/2 items-center gap-3 rounded-xl bg-zinc-900 px-4 py-2.5 text-sm text-white shadow-lg dark:bg-zinc-100 dark:text-zinc-900"
        >
          <span>
            <b className="font-semibold">{selected.size}</b> dòng đã chọn
          </span>
          <button
            type="button"
            onClick={() => setSelected(new Set())}
            className="rounded-md px-2 py-1 text-zinc-300 hover:bg-white/10 dark:text-zinc-600 dark:hover:bg-black/10"
          >
            Bỏ chọn
          </button>
          <button
            type="button"
            onClick={() => setStageMoveOpen(true)}
            className="rounded-md bg-indigo-500 px-3 py-1 font-medium text-white hover:bg-indigo-400"
          >
            Chuyển bước…
          </button>
          <button
            type="button"
            onClick={() => setSlipKind("SURFACE")}
            className="rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20"
          >
            Gửi nhà thầu phụ
          </button>
          <button
            type="button"
            onClick={() => setSlipKind("ASSEMBLY")}
            className="rounded-md bg-white/10 px-3 py-1 font-medium hover:bg-white/20 dark:bg-black/10 dark:hover:bg-black/20"
          >
            Giao lắp ráp
          </button>
        </div>
      )}
      <StageMoveDialog
        open={stageMoveOpen}
        onOpenChange={setStageMoveOpen}
        templateId={templateId}
        targets={stageTargets}
        onDone={() => setSelected(new Set())}
      />
      <DeliverySlipDialog
        open={slipKind !== null}
        onOpenChange={(v) => !v && setSlipKind(null)}
        kind={slipKind ?? "SURFACE"}
        templateId={templateId}
        templateCode={templateCode}
        targets={slipTargets}
        onDone={() => setSelected(new Set())}
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

