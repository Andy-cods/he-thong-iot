"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  GitBranch,
  History,
  MoreHorizontal,
  Rocket,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BOM_STATUS_LABELS, type BomStatus } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import {
  useBomWorkspaceSummary,
  useCloneBomTemplate,
  useDeleteBomTemplate,
  type BomTemplateDetail,
} from "@/hooks/useBom";
import { useBomRevisions } from "@/hooks/useBomRevisions";
import { ReleaseRevisionDialog } from "@/components/bom-revision/ReleaseRevisionDialog";
import { cn } from "@/lib/utils";
import {
  PANEL_LABELS,
  type PanelKey,
} from "./useBottomPanelState";

function bomStatusToBadge(status: BomStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  switch (status) {
    case "ACTIVE":
      return { badgeStatus: "success", label: BOM_STATUS_LABELS.ACTIVE };
    case "DRAFT":
      return { badgeStatus: "draft", label: BOM_STATUS_LABELS.DRAFT };
    case "OBSOLETE":
      return { badgeStatus: "inactive", label: BOM_STATUS_LABELS.OBSOLETE };
  }
}

export interface BomWorkspaceTopbarProps {
  template: BomTemplateDetail;
  /** Click KPI chip → mở bottom panel tương ứng. */
  onOpenPanel: (panel: PanelKey) => void;
  /** Click History button → mở right drawer timeline. */
  onOpenHistory: () => void;
  /** Click ScanLine button → mở BomBarcodeSearchDialog (V1.8 Batch 7). */
  onOpenScan?: () => void;
}

/**
 * V1.7-beta — BomWorkspaceTopbar (h-12) thay thế ContextualSidebar V1.6.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────────────┐
 *   │ ← /bom  /  BOM-CODE  │  BOM Name  [Status]  │  chips + ⋯ + … │
 *   └─────────────────────────────────────────────────────────────┘
 *
 * - Breadcrumb + title compact
 * - KPI chips: Đơn hàng·N / WO·N / Thiếu·N / ECO·N (click = mở panel)
 * - Actions: History + DropdownMenu (Release / Clone / Xoá)
 *
 * Brainstorm §3 Option 3 — bỏ ContextualSidebar, global sidebar giữ full 220px.
 */
export function BomWorkspaceTopbar({
  template,
  onOpenPanel,
  onOpenHistory,
  onOpenScan,
}: BomWorkspaceTopbarProps) {
  const router = useRouter();
  const summaryQuery = useBomWorkspaceSummary(template.id);
  const summary = summaryQuery.data?.data;
  const revisionsQuery = useBomRevisions(template.id);
  const existingRevisions = revisionsQuery.data?.data ?? [];
  const nextRevisionNoHint = React.useMemo(() => {
    let max = 0;
    for (const r of existingRevisions) {
      const m = /^R(\d+)$/.exec(r.revisionNo);
      if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    return `R${(max + 1).toString().padStart(2, "0")}`;
  }, [existingRevisions]);

  const badge = bomStatusToBadge(template.status);
  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  const cloneBom = useCloneBomTemplate();
  const deleteBom = useDeleteBomTemplate();

  const handleClone = async () => {
    const suggested = prompt("Nhập mã BOM mới:", `${template.code}_COPY`);
    if (!suggested) return;
    try {
      const res = await cloneBom.mutateAsync({
        id: template.id,
        data: { newCode: suggested.toUpperCase() },
      });
      toast.success(
        `Đã clone "${res.data.template.code}" với ${res.data.lineCount} lines.`,
      );
      router.push(`/bom/${res.data.template.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBom.mutateAsync(template.id);
      toast.success(`Đã ngừng dùng BOM "${template.code}".`);
      router.push("/bom");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const isObsolete = template.status === "OBSOLETE";

  return (
    <header className="flex h-12 shrink-0 items-center gap-2 border-b border-zinc-200 bg-white pl-2 pr-2">
      {/* Left: back + breadcrumb + title — V1.7-beta.2.3 compact polish */}
      <Link
        href="/bom"
        className="inline-flex h-7 items-center gap-1 rounded-md px-1.5 text-[11px] font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900"
        title="Thoát workspace về danh sách BOM"
      >
        <ArrowLeft className="h-3 w-3" aria-hidden />
        BOM
      </Link>
      <span className="text-xs text-zinc-300" aria-hidden>
        ·
      </span>
      <span className="font-mono text-[13px] font-medium text-zinc-800">
        {template.code}
      </span>
      <span className="text-xs text-zinc-300" aria-hidden>
        ·
      </span>
      <h1 className="truncate text-sm font-normal text-zinc-700">
        {template.name}
      </h1>
      <StatusBadge
        status={badge.badgeStatus}
        size="sm"
        label={badge.label}
      />
      {isObsolete && (
        <span className="inline-flex items-center rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700 ring-1 ring-red-200">
          Ngừng dùng
        </span>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* KPI chips */}
      <div className="hidden items-center gap-1 text-xs md:flex">
        <KpiChip
          label={PANEL_LABELS.orders}
          count={summary?.ordersActive}
          onClick={() => onOpenPanel("orders")}
        />
        <KpiChip
          label={PANEL_LABELS["work-orders"]}
          count={summary?.workOrdersActive}
          onClick={() => onOpenPanel("work-orders")}
        />
        <KpiChip
          label={PANEL_LABELS.shortage}
          count={summary?.shortageComponents}
          tone="orange"
          onClick={() => onOpenPanel("shortage")}
        />
        <KpiChip
          label={PANEL_LABELS.eco}
          count={summary?.ecoActive}
          onClick={() => onOpenPanel("eco")}
        />
      </div>

      {/* Scan barcode — V1.8 Batch 7 */}
      {onOpenScan ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenScan}
          title="Quét barcode linh kiện (Alt+S)"
          aria-label="Quét barcode linh kiện"
        >
          <ScanLine className="h-3.5 w-3.5" aria-hidden />
          <span className="hidden sm:inline">Quét</span>
        </Button>
      ) : null}

      {/* History */}
      <Button size="sm" variant="ghost" onClick={onOpenHistory} title="Lịch sử thay đổi">
        <History className="h-3.5 w-3.5" aria-hidden />
        <span className="hidden sm:inline">Lịch sử</span>
      </Button>

      {/* Actions dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <MoreHorizontal className="h-3.5 w-3.5" aria-hidden />
            <ChevronDown className="h-3 w-3" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {!isObsolete && (
            <DropdownMenuItem onClick={() => setReleaseOpen(true)}>
              <Rocket className="h-3.5 w-3.5" aria-hidden />
              Release revision {nextRevisionNoHint}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onClick={() => void handleClone()}>
            <Copy className="h-3.5 w-3.5" aria-hidden />
            Nhân bản BOM
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={`/bom/${template.id}/tree`}>
              <GitBranch className="h-3.5 w-3.5" aria-hidden />
              Xem cây linh kiện
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="danger"
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden />
            Xoá (ngừng dùng)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ReleaseRevisionDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        templateId={template.id}
        templateCode={template.code}
        nextRevisionNoHint={nextRevisionNoHint}
      />

      <DialogConfirm
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        title={`Ngừng dùng BOM "${template.code}"?`}
        description={`BOM sẽ chuyển sang OBSOLETE. Các Work Order đang dùng vẫn giữ snapshot. Gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Ngừng dùng"
        loading={deleteBom.isPending}
        onConfirm={() => void handleDelete()}
      />
    </header>
  );
}

interface KpiChipProps {
  label: string;
  count: number | undefined;
  tone?: "default" | "orange";
  onClick: () => void;
}

function KpiChip({ label, count, tone = "default", onClick }: KpiChipProps) {
  const display = count ?? "—";
  const isZero = count === 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border px-2 font-medium transition-colors duration-100",
        "hover:bg-zinc-50 active:bg-zinc-100",
        tone === "orange" && count !== undefined && count > 0
          ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100"
          : isZero
            ? "border-zinc-200 text-zinc-400 hover:text-zinc-600"
            : "border-zinc-200 text-zinc-700",
      )}
      title={`Xem ${label.toLowerCase()}`}
    >
      <span className="text-[11px]">{label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums">
        {display}
      </span>
    </button>
  );
}
