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
import { DialogConfirm } from "@/components/ui/dialog";
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
  const [delItem, setDelItem] = React.useState<BoardItem | null>(null);

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

  const confirmDelete = async () => {
    if (!delItem) return;
    try {
      await deleteMut.mutateAsync(delItem.id);
      toast.success(`Đã xoá ${shortCode(delItem.productCode)}`);
      setDelItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xoá");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200 bg-white px-6 py-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500 dark:text-zinc-400">
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
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-6 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
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
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2.5 text-left">Mã hàng</th>
                  <th className="px-3 py-2.5 text-left">Sản phẩm</th>
                  {/* V4.1 UI-27: "KH" dễ nhầm với "kế hoạch" ở cột Đạt / KH → ghi rõ "Khách". */}
                  <th className="px-3 py-2.5 text-center">Khách</th>
                  <th className="px-3 py-2.5 text-right">Đạt / KH</th>
                  <th className="px-3 py-2.5 text-center">Hạn</th>
                  <th className="px-3 py-2.5 text-left">Trạng thái</th>
                  {(canEditBoard || canDeleteBoard) && (
                    <th className="px-3 py-2.5 text-right">Thao tác</th>
                  )}
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                {items.map((it) => {
                  const done = Number(it.qtyDone) || 0;
                  const planned = Number(it.qtyPlanned) || 0;
                  return (
                    <tr
                      key={it.id}
                      className="hover:bg-zinc-50 dark:hover:bg-zinc-800/40"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {it.isPinned && (
                            <Pin className="h-3 w-3 fill-orange-400 text-orange-400" />
                          )}
                          <span className="font-mono font-semibold text-zinc-900 dark:text-zinc-100">
                            {it.productCode}
                          </span>
                        </div>
                        {it.rfqNo && (
                          <span className="font-mono text-sm text-zinc-400 dark:text-zinc-500">
                            {it.rfqNo}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <p className="truncate text-zinc-700 dark:text-zinc-200">
                          {firstLine(it.productName)}
                        </p>
                        {it.currentStage && (
                          <span className="text-sm text-zinc-400 dark:text-zinc-500">
                            ▸ {it.currentStage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-zinc-600 dark:text-zinc-300">
                        {it.customer ?? "—"}
                      </td>
                      {/* V4.1 UI-14: SL + ĐVT viết HOA thống nhất (trước đây Pcs/SET/Set lẫn lộn). */}
                      <td className="px-3 py-2.5 text-right tabular-nums">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {formatQty(done)}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">
                          /{formatQty(planned, it.uom)}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "whitespace-nowrap px-3 py-2.5 text-center text-sm",
                          deadlineTone(it.deadline, it.status),
                        )}
                      >
                        {formatDate(it.deadline, "dd/MM/yyyy")}
                      </td>
                      <td className="px-3 py-2.5">
                        <Select
                          value={it.status}
                          disabled={!canEditBoard}
                          onValueChange={(v) =>
                            quickStatus(it, v as BoardStatus)
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 w-32 border-0 text-sm font-semibold",
                              boardPillClass(it.status),
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {boardLabel(s)}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      {(canEditBoard || canDeleteBoard) && (
                        <td className="px-3 py-2.5">
                          <div className="flex items-center justify-end gap-1">
                            {canEditBoard && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7"
                                onClick={() => openEdit(it)}
                                title="Sửa"
                              >
                                <Pencil className="h-3.5 w-3.5" />
                              </Button>
                            )}
                            {canDeleteBoard && (
                              <Button
                                variant="ghost"
                                size="icon"
                                className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                                onClick={() => setDelItem(it)}
                                title="Xoá"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <BoardItemDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        item={editItem}
      />

      <DialogConfirm
        open={!!delItem}
        onOpenChange={(v) => !v && setDelItem(null)}
        title="Xoá mã hàng khỏi bảng?"
        description={`Xoá "${delItem?.productCode ?? ""}" khỏi bảng sản xuất. Gõ XOA để xác nhận — không hoàn tác được.`}
        actionLabel="Xoá khỏi bảng"
        loading={deleteMut.isPending}
        onConfirm={confirmDelete}
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
      <span className={cn("font-mono text-lg font-bold tabular-nums", toneCls)}>
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
