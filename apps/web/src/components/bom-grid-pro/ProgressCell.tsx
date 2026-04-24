"use client";

import * as React from "react";
import {
  Ban,
  Check,
  CheckCircle,
  CheckCircle2,
  Circle,
  Clock,
  Factory,
  Hammer,
  MinusCircle,
  Package,
  PauseCircle,
  ShoppingCart,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SimpleTooltip } from "@/components/ui/tooltip";

/**
 * V1.7-beta.2 — Progress cell với 5 states đồng bộ với MaterialStatus
 * (apps/web/src/server/services/derivedStatus.ts V1.5):
 *   NO_ORDERS / PLANNED / PURCHASING / PARTIAL / AVAILABLE / ISSUED
 *
 * V1.9 Phase 2 — thêm:
 *   - pct thật từ backend (qty ratio)
 *   - 5 mốc tiến độ (milestones) hiển thị trong tooltip
 *   - sub-label "purchased/required · còn X"
 */

export type MaterialStatus =
  | "NO_ORDERS"
  | "PLANNED"
  | "PURCHASING"
  | "PARTIAL"
  | "AVAILABLE"
  | "ISSUED";

interface StatusMeta {
  label: string;
  icon: LucideIcon;
  bar: string; // progress bar fill class
  barBg: string; // track bg
  text: string; // text + icon color
  badgeBg: string; // subtle bg badge
  defaultPct: number; // 0-100
}

const STATUS_META: Record<MaterialStatus, StatusMeta> = {
  NO_ORDERS: {
    label: "Chưa có đơn",
    icon: MinusCircle,
    bar: "bg-zinc-300",
    barBg: "bg-zinc-100",
    text: "text-zinc-500",
    badgeBg: "bg-zinc-50",
    defaultPct: 0,
  },
  PLANNED: {
    label: "Chưa mua",
    icon: Clock,
    bar: "bg-amber-400",
    barBg: "bg-amber-100",
    text: "text-amber-700",
    badgeBg: "bg-amber-50",
    defaultPct: 0,
  },
  PURCHASING: {
    label: "Đang mua",
    icon: ShoppingCart,
    bar: "bg-blue-500",
    barBg: "bg-blue-100",
    text: "text-blue-700",
    badgeBg: "bg-blue-50",
    defaultPct: 30,
  },
  PARTIAL: {
    label: "Nhận một phần",
    icon: Package,
    bar: "bg-orange-500",
    barBg: "bg-orange-100",
    text: "text-orange-700",
    badgeBg: "bg-orange-50",
    defaultPct: 60,
  },
  AVAILABLE: {
    label: "Đủ hàng",
    icon: CheckCircle2,
    bar: "bg-emerald-500",
    barBg: "bg-emerald-100",
    text: "text-emerald-700",
    badgeBg: "bg-emerald-50",
    defaultPct: 100,
  },
  ISSUED: {
    label: "Đã xuất SX",
    icon: Factory,
    bar: "bg-violet-500",
    barBg: "bg-violet-100",
    text: "text-violet-700",
    badgeBg: "bg-violet-50",
    defaultPct: 100,
  },
};

/**
 * V1.7-beta.2.6 — FabStatus (tiến độ sản xuất cho fab row).
 * 5 state map từ work_order.status → UI state.
 */
export type FabStatus =
  | "NOT_STARTED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

const FAB_META: Record<FabStatus, StatusMeta> = {
  NOT_STARTED: {
    label: "Chờ SX",
    icon: Clock,
    bar: "bg-zinc-300",
    barBg: "bg-zinc-100",
    text: "text-zinc-600",
    badgeBg: "bg-zinc-50",
    defaultPct: 0,
  },
  IN_PROGRESS: {
    label: "Đang SX",
    icon: Hammer,
    bar: "bg-indigo-500",
    barBg: "bg-indigo-100",
    text: "text-indigo-700",
    badgeBg: "bg-indigo-50",
    defaultPct: 30,
  },
  PAUSED: {
    label: "Tạm dừng",
    icon: PauseCircle,
    bar: "bg-amber-500",
    barBg: "bg-amber-100",
    text: "text-amber-700",
    badgeBg: "bg-amber-50",
    defaultPct: 20,
  },
  COMPLETED: {
    label: "Hoàn thành",
    icon: CheckCircle,
    bar: "bg-emerald-500",
    barBg: "bg-emerald-100",
    text: "text-emerald-700",
    badgeBg: "bg-emerald-50",
    defaultPct: 100,
  },
  CANCELLED: {
    label: "Đã hủy",
    icon: Ban,
    bar: "bg-zinc-400",
    barBg: "bg-zinc-100",
    text: "text-zinc-500",
    badgeBg: "bg-zinc-50",
    defaultPct: 0,
  },
};

/**
 * Map work_order.status → FabStatus.
 * DRAFT/QUEUED/RELEASED → NOT_STARTED
 * IN_PROGRESS → IN_PROGRESS
 * PAUSED → PAUSED
 * COMPLETED → COMPLETED
 * CANCELLED → CANCELLED
 */
export function mapWoStatusToFab(status: string | null | undefined): FabStatus {
  switch (status) {
    case "IN_PROGRESS":
      return "IN_PROGRESS";
    case "PAUSED":
      return "PAUSED";
    case "COMPLETED":
      return "COMPLETED";
    case "CANCELLED":
      return "CANCELLED";
    case "DRAFT":
    case "QUEUED":
    case "RELEASED":
    default:
      return "NOT_STARTED";
  }
}

/* --------- Milestone tooltip content --------- */

interface MilestoneRowProps {
  reached: boolean;
  label: string;
}

function MilestoneRow({ reached, label }: MilestoneRowProps) {
  return (
    <div className="flex items-center gap-2 py-0.5">
      {reached ? (
        <Check className="h-3 w-3 text-emerald-400" aria-hidden />
      ) : (
        <Circle className="h-3 w-3 text-zinc-500" aria-hidden />
      )}
      <span
        className={cn(
          "text-[11px]",
          reached ? "text-zinc-50" : "text-zinc-400",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export interface ComMilestones {
  planned: boolean;
  purchasing: boolean;
  purchased: boolean;
  available: boolean;
  issued: boolean;
}

function ComMilestoneList({
  milestones,
  requiredQty,
  purchasedQty,
  uom,
}: {
  milestones: ComMilestones;
  requiredQty?: number;
  purchasedQty?: number;
  uom?: string;
}) {
  return (
    <div className="flex flex-col gap-0 min-w-[180px]">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        Mốc tiến độ
      </div>
      <MilestoneRow reached={milestones.planned} label="Lập kế hoạch" />
      <MilestoneRow reached={milestones.purchasing} label="Đang mua (PR/PO)" />
      <MilestoneRow reached={milestones.purchased} label="Đã mua xong" />
      <MilestoneRow reached={milestones.available} label="Có sẵn kho" />
      <MilestoneRow reached={milestones.issued} label="Đã xuất kho" />
      {requiredQty !== undefined && requiredQty > 0 ? (
        <div className="mt-1.5 border-t border-zinc-700 pt-1 font-mono text-[10px] tabular-nums text-zinc-400">
          {purchasedQty ?? 0} / {requiredQty} {uom ?? ""}
        </div>
      ) : null}
    </div>
  );
}

export interface FabMilestones {
  waiting: boolean;
  inProgress: boolean;
  paused: boolean;
  qc: boolean;
  completed: boolean;
}

function FabMilestoneList({
  milestones,
  plannedQty,
  goodQty,
  scrapQty,
  woNo,
}: {
  milestones: FabMilestones;
  plannedQty?: number;
  goodQty?: number;
  scrapQty?: number;
  woNo?: string;
}) {
  return (
    <div className="flex flex-col gap-0 min-w-[180px]">
      <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-zinc-400">
        Mốc sản xuất {woNo ? `· ${woNo}` : ""}
      </div>
      <MilestoneRow reached={milestones.waiting} label="Chờ SX" />
      <MilestoneRow reached={milestones.inProgress} label="Đang SX" />
      <MilestoneRow
        reached={milestones.paused}
        label={milestones.paused ? "Tạm dừng" : "Không tạm dừng"}
      />
      <MilestoneRow reached={milestones.qc} label="QC đạt" />
      <MilestoneRow reached={milestones.completed} label="Hoàn thành" />
      {plannedQty !== undefined && plannedQty > 0 ? (
        <div className="mt-1.5 border-t border-zinc-700 pt-1 font-mono text-[10px] tabular-nums text-zinc-400">
          {goodQty ?? 0} / {plannedQty}
          {scrapQty && scrapQty > 0 ? ` · phế ${scrapQty}` : ""}
        </div>
      ) : null}
    </div>
  );
}

/* --------- ProgressCell (com) --------- */

export interface ProgressCellProps {
  status: MaterialStatus;
  /** 0-100; nếu không truyền dùng defaultPct theo status. */
  pct?: number;
  /** Số thực tế (hiển thị dưới thanh progress): VD "3/10 đã nhận". */
  subLabel?: string;
  className?: string;
  /** V1.9 Phase 2 — 5 mốc tiến độ; nếu truyền sẽ render tooltip. */
  milestones?: ComMilestones;
  /** V1.9 Phase 2 — breakdown qty cho tooltip + sub-label. */
  requiredQty?: number;
  purchasedQty?: number;
  uom?: string;
}

export function ProgressCell({
  status,
  pct,
  subLabel,
  className,
  milestones,
  requiredQty,
  purchasedQty,
  uom,
}: ProgressCellProps) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  const fill = Math.max(0, Math.min(100, pct ?? meta.defaultPct));

  // Auto-compute sub-label nếu có qty breakdown
  const computedSubLabel = React.useMemo(() => {
    if (subLabel) return subLabel;
    if (requiredQty !== undefined && requiredQty > 0) {
      const got = purchasedQty ?? 0;
      const remain = Math.max(0, requiredQty - got);
      return `${got} / ${requiredQty}${remain > 0 ? ` · còn ${remain}` : ""}`;
    }
    return undefined;
  }, [subLabel, requiredQty, purchasedQty]);

  const body = (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 px-2 py-1 cursor-default",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[10px] font-medium",
            meta.badgeBg,
            meta.text,
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
          {meta.label}
        </span>
        {fill > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {fill}%
          </span>
        )}
      </div>
      <div
        className={cn("h-1.5 w-full overflow-hidden rounded-full", meta.barBg)}
        role="progressbar"
        aria-valuenow={fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={meta.label}
      >
        <div
          className={cn("h-full rounded-full transition-all duration-200", meta.bar)}
          style={{ width: `${fill}%` }}
        />
      </div>
      {computedSubLabel && (
        <span className="font-mono text-[10px] tabular-nums text-zinc-500 truncate">
          {computedSubLabel}
        </span>
      )}
    </div>
  );

  if (milestones) {
    return (
      <SimpleTooltip
        side="top"
        content={
          <ComMilestoneList
            milestones={milestones}
            requiredQty={requiredQty}
            purchasedQty={purchasedQty}
            uom={uom}
          />
        }
      >
        {body}
      </SimpleTooltip>
    );
  }

  return body;
}

/* --------- FabProgressCell (fab) --------- */

export interface FabProgressCellProps {
  status: FabStatus;
  /** goodQty / plannedQty — chỉ dùng khi IN_PROGRESS hoặc PAUSED. */
  goodQty?: number;
  plannedQty?: number;
  scrapQty?: number;
  /** Số WO hiển thị dạng chú thích (VD: "WO-2604-0001"). */
  woNo?: string;
  className?: string;
  /** V1.9 Phase 2 — pct override từ backend. */
  pct?: number;
  /** V1.9 Phase 2 — 5 mốc tiến độ fab; nếu truyền render tooltip. */
  milestones?: FabMilestones;
}

export function FabProgressCell({
  status,
  goodQty,
  plannedQty,
  scrapQty,
  woNo,
  className,
  pct,
  milestones,
}: FabProgressCellProps) {
  const meta = FAB_META[status];
  const Icon = meta.icon;

  // Tính pct: ưu tiên prop pct từ backend; else fallback tự tính.
  let fill: number;
  if (pct !== undefined) {
    fill = Math.max(0, Math.min(100, Math.round(pct)));
  } else {
    fill = meta.defaultPct;
    if (status === "IN_PROGRESS" || status === "PAUSED") {
      if (plannedQty && plannedQty > 0 && goodQty !== undefined) {
        fill = Math.max(0, Math.min(100, Math.round((goodQty / plannedQty) * 100)));
      }
    } else if (status === "COMPLETED") {
      fill = 100;
    } else {
      fill = 0;
    }
  }

  const subLabel =
    plannedQty && plannedQty > 0
      ? `${goodQty ?? 0} / ${plannedQty}${
          scrapQty && scrapQty > 0 ? ` · phế ${scrapQty}` : ""
        }`
      : woNo && (status === "IN_PROGRESS" || status === "PAUSED" || status === "COMPLETED")
        ? woNo
        : undefined;

  const body = (
    <div
      className={cn(
        "flex flex-col justify-center gap-0.5 px-2 py-1 cursor-default",
        className,
      )}
    >
      <div className="flex items-center gap-1.5">
        <span
          className={cn(
            "inline-flex h-4 items-center gap-0.5 rounded px-1 text-[10px] font-medium",
            meta.badgeBg,
            meta.text,
          )}
        >
          <Icon className="h-2.5 w-2.5" aria-hidden />
          {meta.label}
        </span>
        {fill > 0 && (
          <span className="font-mono text-[10px] tabular-nums text-zinc-500">
            {fill}%
          </span>
        )}
      </div>
      <div
        className={cn("h-1.5 w-full overflow-hidden rounded-full", meta.barBg)}
        role="progressbar"
        aria-valuenow={fill}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={meta.label}
      >
        <div
          className={cn(
            "h-full rounded-full transition-all duration-200",
            meta.bar,
          )}
          style={{ width: `${fill}%` }}
        />
      </div>
      {subLabel && (
        <span className="font-mono text-[10px] tabular-nums text-zinc-500 truncate">
          {subLabel}
        </span>
      )}
    </div>
  );

  if (milestones) {
    return (
      <SimpleTooltip
        side="top"
        content={
          <FabMilestoneList
            milestones={milestones}
            plannedQty={plannedQty}
            goodQty={goodQty}
            scrapQty={scrapQty}
            woNo={woNo}
          />
        }
      >
        {body}
      </SimpleTooltip>
    );
  }

  return body;
}

// Safelist các class dynamic — giúp Tailwind JIT không purge.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const _safelist =
  "bg-zinc-300 bg-amber-400 bg-blue-500 bg-orange-500 bg-emerald-500 bg-violet-500 bg-indigo-500 bg-zinc-400 " +
  "bg-zinc-100 bg-amber-100 bg-blue-100 bg-orange-100 bg-emerald-100 bg-violet-100 bg-indigo-100 " +
  "text-zinc-500 text-zinc-600 text-amber-700 text-blue-700 text-orange-700 text-emerald-700 text-violet-700 text-indigo-700 " +
  "bg-zinc-50 bg-amber-50 bg-blue-50 bg-orange-50 bg-emerald-50 bg-violet-50 bg-indigo-50";
