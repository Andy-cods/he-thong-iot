"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ChevronDown,
  Copy,
  History,
  MoreHorizontal,
  Pencil,
  RefreshCw,
  Rocket,
  ScanLine,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusPill } from "@/components/ui/status-badge";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { statusLabel } from "@/lib/status";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import {
  useBomWorkspaceSummary,
  useCloneBomTemplate,
  useDeleteBomTemplate,
  useUpdateBomTemplate,
  type BomTemplateDetail,
} from "@/hooks/useBom";
import { useBomRevisions } from "@/hooks/useBomRevisions";
import { useSession } from "@/hooks/useSession";
import { ReleaseRevisionDialog } from "@/components/bom-revision/ReleaseRevisionDialog";
import { cn } from "@/lib/utils";
import { HIDDEN_FEATURES } from "@/lib/hidden-features";
import { TOP_TAB_LABELS, type TopTabKey } from "./useTopTabState";

// V4.1 UI-07: bỏ bomStatusToBadge cục bộ — badge trạng thái BOM lấy từ lib/status.ts
// (domain "bom": Nháp / Đang dùng / Ngừng dùng).
const DRAFT_LABEL = statusLabel("bom", "DRAFT");

export interface BomWorkspaceTopbarProps {
  template: BomTemplateDetail;
  /** Click KPI chip → mở top tab tương ứng (orders/work-orders/shortage/eco). */
  onOpenTab: (tab: TopTabKey) => void;
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
  onOpenTab,
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

  const [releaseOpen, setReleaseOpen] = React.useState(false);
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  // V3.7.57 — chỉ admin + planner sửa BOM. Các role khác chỉ xem.
  const session = useSession();
  const sessionRoles = session.data?.roles ?? [];
  const canEditBom =
    sessionRoles.includes("admin") || sessionRoles.includes("planner");

  const cloneBom = useCloneBomTemplate();
  const deleteBom = useDeleteBomTemplate();
  const updateBom = useUpdateBomTemplate(template.id);
  // V4.1 UX-01: hộp nhập/xác nhận của hệ thống thay hộp thoại trình duyệt.
  const askConfirm = useConfirm();
  const askText = usePrompt();

  const handleRename = async () => {
    const next = await askText({
      title: "Đổi tên BOM",
      label: "Tên BOM",
      defaultValue: template.name,
      multiline: false,
      required: true,
      maxLength: 250,
      confirmLabel: "Đổi tên",
    });
    if (next === null) return;
    const trimmed = next.trim();
    if (!trimmed) {
      toast.error("Tên BOM không được để trống.");
      return;
    }
    if (trimmed === template.name) return;
    try {
      await updateBom.mutateAsync({ name: trimmed.slice(0, 250) });
      toast.success(`Đã đổi tên BOM thành "${trimmed}".`);
    } catch (err) {
      toast.error((err as Error).message ?? "Không đổi được tên BOM.");
    }
  };

  const handleClone = async () => {
    const suggested = await askText({
      title: "Nhân bản BOM",
      label: "Mã BOM mới",
      defaultValue: `${template.code}_COPY`,
      multiline: false,
      required: true,
      confirmLabel: "Nhân bản",
    });
    if (!suggested) return;
    try {
      const res = await cloneBom.mutateAsync({
        id: template.id,
        data: { newCode: suggested.toUpperCase() },
      });
      toast.success(
        `Đã nhân bản "${res.data.template.code}" với ${res.data.lineCount} dòng.`,
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

  // V3.7.35 — Khôi phục BOM Ngừng dùng → Nháp.
  const handleRestore = async () => {
    const ok = await askConfirm({
      title: `Khôi phục BOM “${template.code}”?`,
      description: `BOM sẽ quay về trạng thái “${DRAFT_LABEL}” để chỉnh sửa tiếp.`,
      confirmLabel: "Khôi phục",
    });
    if (!ok) return;
    try {
      await updateBom.mutateAsync({ status: "DRAFT" });
      toast.success(`Đã khôi phục BOM "${template.code}" về ${DRAFT_LABEL}.`);
    } catch (err) {
      toast.error((err as Error).message ?? "Không khôi phục được BOM.");
    }
  };

  const isObsolete = template.status === "OBSOLETE";

  // V4.1 UI-02: ẩn tên khi gần trùng mã (VD "Z0000002-565488-SL1 · Z0000002-565488 SL1").
  const normalize = (v: string) => v.toLowerCase().replace(/[^a-z0-9]/g, "");
  const nameDupCode = normalize(template.name) === normalize(template.code);

  // V4.1 UI-02: điện thoại — vùng chạm 36px, desktop giữ 28px compact.
  const tapBtn = "h-9 min-w-9 px-2 md:h-7 md:min-w-0 md:px-2.5";

  return (
    <header className="flex min-h-12 shrink-0 items-center gap-1.5 border-b border-zinc-200 bg-white px-2 py-1 dark:border-zinc-800 dark:bg-zinc-900 md:gap-2">
      {/* Left: back + mã + tên + trạng thái — V4.1 UI-02: khối co giãn, mã truncate
          (trước đây mã font-mono gãy 3 dòng trên 390px). */}
      <div className="flex min-w-0 flex-1 items-center gap-1.5 md:gap-2">
        <Link
          href="/bom"
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md px-1.5 text-xs font-medium text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-50 md:h-7"
          title="Thoát workspace về danh sách BOM"
          aria-label="Về danh sách BOM"
        >
          <ArrowLeft className="h-3.5 w-3.5 md:h-3 md:w-3" aria-hidden />
          <span className="hidden md:inline">BOM</span>
        </Link>
        <span className="hidden text-xs text-zinc-300 dark:text-zinc-600 md:inline" aria-hidden>
          ·
        </span>
        <span
          className="min-w-0 truncate font-mono text-[13px] font-medium text-zinc-800 dark:text-zinc-200"
          title={nameDupCode ? template.code : `${template.code} · ${template.name}`}
        >
          {template.code}
        </span>
        {!nameDupCode && (
          <>
            <span className="hidden text-xs text-zinc-300 dark:text-zinc-600 md:inline" aria-hidden>
              ·
            </span>
            <h1 className="hidden min-w-0 truncate text-sm font-normal text-zinc-700 dark:text-zinc-300 md:block">
              {template.name}
            </h1>
          </>
        )}
        {nameDupCode && <h1 className="sr-only">{template.name}</h1>}
        {/* V4.1 UI-07: 1 badge duy nhất (trước đây OBSOLETE hiện thêm chip đỏ "Ngừng dùng" trùng). */}
        <StatusPill domain="bom" code={template.status} dot />
      </div>

      {/* KPI chips */}
      <div className="hidden shrink-0 items-center gap-1 text-xs md:flex">
        {/* V4.1 Q4 — chip "Đơn hàng" ẩn cùng Đơn hàng bán. */}
        {!HIDDEN_FEATURES.salesOrder && (
          <KpiChip
            label={TOP_TAB_LABELS.orders}
            count={summary?.ordersActive}
            onClick={() => onOpenTab("orders")}
          />
        )}
        <KpiChip
          label={TOP_TAB_LABELS["work-orders"]}
          count={summary?.workOrdersActive}
          onClick={() => onOpenTab("work-orders")}
        />
        {/* TASK-20260427-016 — KPI `Thiếu vật tư` & `ECO` retired cùng tab tương ứng. */}
      </div>

      {/* Scan barcode — V1.8 Batch 7. V4.1 UI-02: điện thoại chuyển vào menu ⋯. */}
      {onOpenScan ? (
        <Button
          size="sm"
          variant="ghost"
          onClick={onOpenScan}
          title="Quét barcode linh kiện (Alt+S)"
          aria-label="Quét barcode linh kiện"
          className="hidden shrink-0 md:inline-flex"
        >
          <ScanLine className="h-3.5 w-3.5" aria-hidden />
          Quét
        </Button>
      ) : null}

      {/* V3.7.54 — Nút "Kích hoạt BOM" hiển thị rõ khi BOM đang DRAFT.
          V3.7.57 — chỉ admin/planner thấy. Các role khác xem read-only.
          V4.1 UI-02: nút chính màu thương hiệu indigo (không dùng emerald
          "thành công" làm nút); điện thoại chỉ icon + aria-label. */}
      {canEditBom && template.status === "DRAFT" && (
        <Button
          size="sm"
          onClick={() => setReleaseOpen(true)}
          title="Kích hoạt BOM (chuyển từ Nháp → Đang dùng)"
          aria-label="Kích hoạt BOM"
          className={cn("shrink-0", tapBtn)}
        >
          <Rocket className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
          <span className="hidden whitespace-nowrap md:inline">Kích hoạt BOM</span>
        </Button>
      )}

      {/* History — mọi role đều xem được. V4.1 UI-02: điện thoại vào menu ⋯. */}
      <Button
        size="sm"
        variant="ghost"
        onClick={onOpenHistory}
        title="Lịch sử thay đổi"
        className="hidden shrink-0 md:inline-flex"
      >
        <History className="h-3.5 w-3.5" aria-hidden />
        Lịch sử
      </Button>

      {/* Menu ⋯ — admin/planner: đổi tên/nhân bản/xoá; điện thoại: thêm Quét + Lịch sử. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Thao tác khác"
            title="Thao tác khác"
            className={cn("shrink-0", tapBtn, !canEditBom && "md:hidden")}
          >
            <MoreHorizontal className="h-4 w-4 md:h-3.5 md:w-3.5" aria-hidden />
            <ChevronDown className="hidden h-3 w-3 md:block" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {onOpenScan ? (
            <DropdownMenuItem className="md:hidden" onClick={onOpenScan}>
              <ScanLine className="h-3.5 w-3.5" aria-hidden />
              Quét barcode
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem className="md:hidden" onClick={onOpenHistory}>
            <History className="h-3.5 w-3.5" aria-hidden />
            Lịch sử thay đổi
          </DropdownMenuItem>
          {canEditBom && (
            <>
              <DropdownMenuSeparator className="md:hidden" />
              {!isObsolete && (
                <DropdownMenuItem onClick={() => void handleRename()}>
                  <Pencil className="h-3.5 w-3.5" aria-hidden />
                  Đổi tên BOM
                </DropdownMenuItem>
              )}
              {isObsolete && (
                <DropdownMenuItem onClick={() => void handleRestore()}>
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden />
                  Khôi phục về {DRAFT_LABEL}
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => void handleClone()}>
                <Copy className="h-3.5 w-3.5" aria-hidden />
                Nhân bản BOM
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                variant="danger"
                onClick={() => setDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
                Xoá (ngừng dùng)
              </DropdownMenuItem>
            </>
          )}
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
        description={`BOM sẽ chuyển sang trạng thái “${statusLabel("bom", "OBSOLETE")}”. Các lệnh sản xuất đang dùng vẫn giữ bản chốt BOM. Gõ "XOA" để xác nhận.`}
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
        "hover:bg-zinc-50 active:bg-zinc-100 dark:hover:bg-zinc-800/60 dark:active:bg-zinc-800",
        tone === "orange" && count !== undefined && count > 0
          ? "border-orange-200 bg-orange-50 text-orange-700 hover:bg-orange-100 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-400 dark:hover:bg-orange-900/40"
          : isZero
            ? "border-zinc-200 text-zinc-400 hover:text-zinc-600 dark:border-zinc-700 dark:text-zinc-500 dark:hover:text-zinc-400"
            : "border-zinc-200 text-zinc-700 dark:border-zinc-700 dark:text-zinc-300",
      )}
      title={`Xem ${label.toLowerCase()}`}
    >
      <span className="text-xs">{label}</span>
      <span className="font-mono text-xs font-semibold tabular-nums">
        {display}
      </span>
    </button>
  );
}
