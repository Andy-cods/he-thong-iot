"use client";

import * as React from "react";
import Link from "next/link";
import {
  Monitor,
  Pencil,
  Pin,
  Plus,
  Trash2,
  Tv,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { DataTable, RowActionsMenu, type DataTableColumn } from "@/components/ui/data-table";
import { BoardItemDialog } from "@/components/production-board/BoardItemDialog";
import { can } from "@iot/shared";
import { useSession } from "@/hooks/useSession";
import {
  useDeleteBoardItem,
  useProductionBoard,
  useUpdateBoardItem,
  type BoardItem,
  type BoardStatus,
} from "@/hooks/useProductionBoard";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, getStatus, type StatusTone } from "@/lib/status";
import { formatDate, formatQty } from "@/lib/format";

/**
 * V3.8 — /production-board — Trang quản lý Bảng sản xuất cho Tổ QC.
 *
 * - Bảng tất cả mã hàng (gồm đã giao). QC nhập/sửa/xóa + đổi nhanh trạng thái.
 * - Nút "Mở màn hình TV" → /board (tab mới, full-screen cho TV xưởng).
 * - Route guard (app)/layout chỉ cho admin + qc vào.
 */

// V4.1 UI-07/08 (§2.8): bỏ STATUS_META cục bộ — nhãn + màu ô chọn trạng thái lấy
// từ lib/status.ts domain "board" + TONE_CLASSES (trước đây cam/xanh/lục riêng,
// lệch StatusBadge). Ô chật dùng nhãn ngắn "Sắp GC" / "Đang GC" / "QC".
function boardLabel(s: BoardStatus): string {
  const d = getStatus("board", s);
  return s === "COMPLETED" ? d.label : (d.short ?? d.label);
}
function boardPillClass(s: BoardStatus): string {
  return cn("ring-1 ring-inset", TONE_CLASSES[getStatus("board", s).tone].pill);
}

const STATUS_OPTIONS: BoardStatus[] = [
  "QUEUED",
  "IN_PROGRESS",
  "QC",
  "COMPLETED",
  "DELIVERED",
];

export default function ProductionBoardAdminPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useProductionBoard({
    all: true,
    completedLimit: 20,
    refetchInterval: 0,
  });
  const updateMut = useUpdateBoardItem();
  const deleteMut = useDeleteBoardItem();

  // V4.0 — Cổ đông (shareholder) chỉ được `read` productionBoard: ẩn toàn bộ
  // nút Thêm/Sửa/Xoá + đổi trạng thái nhanh. API đã chặn bằng requireCan,
  // đây là lớp UI để không hiện chức năng người dùng không thể dùng.
  const session = useSession();
  const roles = session.data?.roles;
  const canEditBoard = can(roles, "update", "productionBoard");
  const canCreateBoard = can(roles, "create", "productionBoard");
  const canDeleteBoard = can(roles, "delete", "productionBoard");

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editItem, setEditItem] = React.useState<BoardItem | null>(null);

  const items = data?.data ?? [];
  const counts = data?.counts;

  const openCreate = () => {
    setEditItem(null);
    setDialogOpen(true);
  };
  const openEdit = (it: BoardItem) => {
    setEditItem(it);
    setDialogOpen(true);
  };

  const quickStatus = async (it: BoardItem, status: BoardStatus) => {
    try {
      await updateMut.mutateAsync({ id: it.id, payload: { status } });
      toast.success(`${shortCode(it.productCode)} → ${boardLabel(status)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    }
  };

  // V4.1 UX-01 (Đợt 6C): xoá qua hộp xác nhận chung (useConfirm, 6B) — nút
  // "Xoá khỏi bảng" chỉ bật khi gõ đúng "XOA" (typeToConfirm), mở từ menu ⋯.
  const confirm = useConfirm();
  const requestDelete = async (it: BoardItem) => {
    const ok = await confirm({
      title: "Xoá mã hàng khỏi bảng?",
      description: `Xoá "${it.productCode}" khỏi bảng sản xuất — không hoàn tác được.`,
      confirmLabel: "Xoá khỏi bảng",
      tone: "danger",
      typeToConfirm: "XOA",
    });
    if (!ok) return;
    try {
      await deleteMut.mutateAsync(it.id);
      toast.success(`Đã xoá ${shortCode(it.productCode)}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xoá");
    }
  };

  const columns: DataTableColumn<BoardItem>[] = [
    {
      id: "code",
      header: "Mã hàng",
      kind: "code",
      mobile: "primary",
      width: 170,
      cell: (it) => (
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            {it.isPinned && <Pin className="h-3 w-3 shrink-0 fill-amber-500 text-amber-500" aria-label="Đã ghim" />}
            <span className="truncate font-mono font-semibold text-zinc-900 dark:text-zinc-100" title={it.productCode}>
              {it.productCode}
            </span>
          </div>
          {it.rfqNo && (
            <span className="block truncate font-mono text-xs text-zinc-500 dark:text-zinc-400" title={it.rfqNo}>
              {it.rfqNo}
            </span>
          )}
          {/* Điện thoại: tên SP ngay dưới mã (cột Sản phẩm ẩn trong thẻ). */}
          <span className="block truncate text-xs font-normal text-zinc-600 dark:text-zinc-300 md:hidden">
            {firstLine(it.productName)}
          </span>
        </div>
      ),
    },
    {
      id: "product",
      header: "Sản phẩm",
      mobile: "hide",
      cell: (it) => (
        <div className="min-w-0 max-w-[280px]">
          <p className="truncate text-zinc-700 dark:text-zinc-200" title={it.productName}>
            {firstLine(it.productName)}
          </p>
          {it.currentStage && (
            <span className="text-xs text-zinc-500 dark:text-zinc-400">▸ {it.currentStage}</span>
          )}
        </div>
      ),
    },
    {
      // V4.1 UI-27: "KH" dễ nhầm với "kế hoạch" ở cột Đạt / KH → ghi rõ "Khách".
      id: "customer",
      header: "Khách",
      width: 110,
      cell: (it) => <span className="text-zinc-600 dark:text-zinc-300">{it.customer ?? "—"}</span>,
    },
    {
      // V4.1 UI-14: SL + ĐVT viết HOA thống nhất.
      id: "qty",
      header: "Đạt / KH",
      kind: "number",
      width: 140,
      cell: (it) => (
        <span>
          <span className="font-semibold text-zinc-900 dark:text-zinc-50">{formatQty(Number(it.qtyDone) || 0)}</span>
          <span className="text-zinc-500 dark:text-zinc-400">/{formatQty(Number(it.qtyPlanned) || 0, it.uom)}</span>
        </span>
      ),
    },
    {
      id: "deadline",
      header: "Hạn",
      kind: "date",
      width: 110,
      cell: (it) => (
        <span className={deadlineTone(it.deadline, it.status)}>{formatDate(it.deadline, "dd/MM/yyyy")}</span>
      ),
    },
    {
      id: "status",
      header: "Trạng thái",
      kind: "status",
      width: 150,
      cell: (it) => (
        <Select
          value={it.status}
          disabled={!canEditBoard}
          onValueChange={(v) => quickStatus(it, v as BoardStatus)}
        >
          <SelectTrigger
            aria-label={`Trạng thái ${it.productCode}`}
            className={cn("h-8 w-32 border-0 text-sm font-semibold", boardPillClass(it.status))}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {STATUS_OPTIONS.map((st) => (
              <SelectItem key={st} value={st} className="text-sm">
                {boardLabel(st)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ),
    },
  ];
  if (canEditBoard || canDeleteBoard) {
    columns.push({
      id: "actions",
      header: <span className="sr-only">Thao tác</span>,
      kind: "actions",
      width: 56,
      cell: (it) => (
        <RowActionsMenu
          label={`Thao tác ${it.productCode}`}
          actions={[
            { label: "Sửa", icon: Pencil, onSelect: () => openEdit(it), hidden: !canEditBoard },
            { label: "Xoá khỏi bảng", icon: Trash2, danger: true, onSelect: () => void requestDelete(it), hidden: !canDeleteBoard },
          ]}
        />
      ),
    });
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-4 py-4 dark:border-zinc-800 dark:bg-zinc-900 md:px-6">
        <div className="min-w-0">
          {/* V4.1 UI-09 (X6): desktop dùng breadcrumb topbar — ở đây chỉ hiện trên điện thoại. */}
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400 md:hidden">
            <Link href="/" className="hover:text-zinc-900 hover:underline dark:hover:text-zinc-100">
              Tổng quan
            </Link>
            {" / "}
            <span className="text-zinc-900 dark:text-zinc-100">Bảng sản xuất</span>
          </nav>
          <h1 className="mt-1 flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            <Monitor className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Bảng điều hành sản xuất
          </h1>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            {items.length} mã hàng · Tổ QC nhập liệu, chiếu TV xưởng
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild variant="outline" size="sm" title="Mở màn hình TV full-screen">
            <a href="/board" target="_blank" rel="noreferrer">
              <Tv className="h-3.5 w-3.5" />
              Mở màn hình TV
            </a>
          </Button>
          {canCreateBoard && (
            <Button size="sm" onClick={openCreate}>
              <Plus className="h-3.5 w-3.5" />
              Thêm mã hàng
            </Button>
          )}
        </div>
      </header>

      {/* Count strip */}
      {counts && (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2.5 md:px-6 dark:border-zinc-800 dark:bg-zinc-900/40">
          {(["IN_PROGRESS", "QC", "QUEUED", "COMPLETED", "DELIVERED"] as const).map((s) => (
            <CountPill
              key={s}
              label={boardLabel(s)}
              n={counts[s]}
              tone={getStatus("board", s).tone}
            />
          ))}
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
        ) : isError && items.length === 0 ? (
          // V4.1 UI-05: lỗi API không được hiện "Chưa có mã hàng nào".
          <QueryError
            error={error}
            onRetry={() => void refetch()}
            retrying={isFetching}
            title="Không tải được bảng sản xuất"
          />
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
            <Monitor className="h-12 w-12 text-zinc-300 dark:text-zinc-700" />
            <p className="text-sm font-medium text-zinc-600 dark:text-zinc-300">
              Chưa có mã hàng nào
            </p>
            <p className="max-w-sm text-xs text-zinc-400 dark:text-zinc-500">
              Bấm "Thêm mã hàng" để đưa các mã đang/sắp gia công lên bảng. Bảng
              sẽ tự hiển thị trên màn hình TV (/board).
            </p>
            {canCreateBoard && (
              <Button size="sm" onClick={openCreate} className="mt-2">
                <Plus className="h-3.5 w-3.5" />
                Thêm mã hàng đầu tiên
              </Button>
            )}
          </div>
        ) : (
          // V4.1 UI-11 (Đợt 6C): ui/data-table — điện thoại dạng thẻ hiện đủ
          // trạng thái / hạn / Đạt-KH (#8, trước chỉ 2 cột); xoá vào menu ⋯.
          <DataTable
            columns={columns}
            rows={items}
            getRowKey={(it) => it.id}
            ariaLabel="Bảng sản xuất"
            className="max-h-full"
            minWidth={880}
          />
        )}
      </div>

      <BoardItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editItem}
      />

    </div>
  );
}

function CountPill({
  label,
  n,
  tone,
}: {
  label: string;
  n: number;
  tone: StatusTone;
}) {
  const toneCls = TONE_CLASSES[tone].text;
  return (
    <div className="flex items-center gap-1.5">
      <span className={cn("text-lg font-semibold tabular-nums", toneCls)}>
        {n}
      </span>
      <span className="text-xs text-zinc-500 dark:text-zinc-400">{label}</span>
    </div>
  );
}

function shortCode(code: string): string {
  const m = code.match(/-(\d+)$/);
  return m?.[1] ?? code;
}
function firstLine(s: string): string {
  return s.split(/[\n,]/)[0]?.trim() || s;
}
// V4.1 UI-13: bỏ fmtDeadline tự viết — dùng formatDate (giờ VN cố định).
// V4.1 UI-07: dòng đã Hoàn thành/Đã giao KHÔNG tô đỏ/cam theo hạn — trước đây
// cả bảng đỏ vì hàng đã giao quá ngày hạn, mất tín hiệu thật.
function deadlineTone(deadline: string | null, status?: BoardStatus): string {
  if (!deadline) return "text-zinc-400 dark:text-zinc-500";
  if (status === "COMPLETED" || status === "DELIVERED") {
    return "text-zinc-500 dark:text-zinc-400";
  }
  const days = (new Date(deadline).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "text-red-600 font-semibold dark:text-red-400";
  if (days <= 3) return "text-amber-600 font-medium dark:text-amber-400";
  return "text-zinc-500 dark:text-zinc-400";
}
