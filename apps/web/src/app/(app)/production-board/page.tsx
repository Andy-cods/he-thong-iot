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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DialogConfirm } from "@/components/ui/dialog";
import { BoardItemDialog } from "@/components/production-board/BoardItemDialog";
import {
  useDeleteBoardItem,
  useProductionBoard,
  useUpdateBoardItem,
  type BoardItem,
  type BoardStatus,
} from "@/hooks/useProductionBoard";
import { cn } from "@/lib/utils";

/**
 * V3.8 — /production-board — Trang quản lý Bảng sản xuất cho Tổ QC.
 *
 * - Bảng tất cả mã hàng (gồm đã giao). QC nhập/sửa/xóa + đổi nhanh trạng thái.
 * - Nút "Mở màn hình TV" → /board (tab mới, full-screen cho TV xưởng).
 * - Route guard (app)/layout chỉ cho admin + qc vào.
 */

const STATUS_META: Record<
  BoardStatus,
  { label: string; chip: string }
> = {
  QUEUED: { label: "Sắp GC", chip: "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300" },
  IN_PROGRESS: { label: "Đang GC", chip: "bg-orange-100 text-orange-700 dark:bg-orange-950/50 dark:text-orange-300" },
  QC: { label: "QC", chip: "bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300" },
  COMPLETED: { label: "Hoàn thành", chip: "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300" },
  DELIVERED: { label: "Đã giao", chip: "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400" },
};

const STATUS_OPTIONS: BoardStatus[] = [
  "QUEUED",
  "IN_PROGRESS",
  "QC",
  "COMPLETED",
  "DELIVERED",
];

export default function ProductionBoardAdminPage() {
  const { data, isLoading } = useProductionBoard({
    all: true,
    completedLimit: 20,
    refetchInterval: 0,
  });
  const updateMut = useUpdateBoardItem();
  const deleteMut = useDeleteBoardItem();

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
      toast.success(`${shortCode(it.productCode)} → ${STATUS_META[status].label}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi cập nhật");
    }
  };

  const confirmDelete = async () => {
    if (!delItem) return;
    try {
      await deleteMut.mutateAsync(delItem.id);
      toast.success(`Đã xóa ${shortCode(delItem.productCode)}`);
      setDelItem(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi xóa");
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
          <Button size="sm" onClick={openCreate}>
            <Plus className="h-3.5 w-3.5" />
            Thêm mã hàng
          </Button>
        </div>
      </header>

      {/* Count strip */}
      {counts && (
        <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-zinc-50 px-6 py-2.5 dark:border-zinc-800 dark:bg-zinc-900/40">
          <CountPill label="Đang GC" n={counts.IN_PROGRESS} tone="orange" />
          <CountPill label="QC" n={counts.QC} tone="sky" />
          <CountPill label="Sắp GC" n={counts.QUEUED} tone="zinc" />
          <CountPill label="Hoàn thành" n={counts.COMPLETED} tone="emerald" />
          <CountPill label="Đã giao" n={counts.DELIVERED} tone="slate" />
        </div>
      )}

      {/* Table */}
      <div className="flex-1 overflow-auto p-4">
        {isLoading ? (
          <Skeleton className="h-64 w-full rounded-xl" />
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
            <Button size="sm" onClick={openCreate} className="mt-2">
              <Plus className="h-3.5 w-3.5" />
              Thêm mã hàng đầu tiên
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-[11px] uppercase tracking-wide text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400">
                <tr>
                  <th className="px-3 py-2.5 text-left">Mã hàng</th>
                  <th className="px-3 py-2.5 text-left">Sản phẩm</th>
                  <th className="px-3 py-2.5 text-center">KH</th>
                  <th className="px-3 py-2.5 text-right">Đạt / KH</th>
                  <th className="px-3 py-2.5 text-center">Hạn</th>
                  <th className="px-3 py-2.5 text-left">Trạng thái</th>
                  <th className="px-3 py-2.5 text-right">Thao tác</th>
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
                          <span className="font-mono text-[10px] text-zinc-400 dark:text-zinc-500">
                            {it.rfqNo}
                          </span>
                        )}
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <p className="truncate text-zinc-700 dark:text-zinc-200">
                          {firstLine(it.productName)}
                        </p>
                        {it.currentStage && (
                          <span className="text-[11px] text-zinc-400 dark:text-zinc-500">
                            ▸ {it.currentStage}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-center text-zinc-600 dark:text-zinc-300">
                        {it.customer ?? "—"}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono tabular-nums">
                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                          {done.toLocaleString("vi-VN")}
                        </span>
                        <span className="text-zinc-400 dark:text-zinc-500">
                          /{planned.toLocaleString("vi-VN")} {it.uom}
                        </span>
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2.5 text-center text-xs",
                          deadlineTone(it.deadline),
                        )}
                      >
                        {fmtDeadline(it.deadline)}
                      </td>
                      <td className="px-3 py-2.5">
                        <Select
                          value={it.status}
                          onValueChange={(v) =>
                            quickStatus(it, v as BoardStatus)
                          }
                        >
                          <SelectTrigger
                            className={cn(
                              "h-7 w-32 border-0 text-xs font-semibold",
                              STATUS_META[it.status].chip,
                            )}
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {STATUS_OPTIONS.map((s) => (
                              <SelectItem key={s} value={s} className="text-xs">
                                {STATUS_META[s].label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEdit(it)}
                            title="Sửa"
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-red-500 hover:bg-red-50 hover:text-red-700 dark:text-red-400 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                            onClick={() => setDelItem(it)}
                            title="Xóa"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </td>
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
        title="Xóa mã hàng khỏi bảng?"
        description={`Xóa "${delItem?.productCode ?? ""}" khỏi bảng sản xuất. Gõ XOA để xác nhận — không hoàn tác được.`}
        actionLabel="Xóa khỏi bảng"
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
  tone: "orange" | "sky" | "zinc" | "emerald" | "slate";
}) {
  const toneCls = {
    orange: "text-orange-600 dark:text-orange-400",
    sky: "text-sky-600 dark:text-sky-400",
    zinc: "text-zinc-600 dark:text-zinc-300",
    emerald: "text-emerald-600 dark:text-emerald-400",
    slate: "text-slate-500 dark:text-slate-400",
  }[tone];
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
function fmtDeadline(deadline: string | null): string {
  if (!deadline) return "—";
  const d = new Date(deadline);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}
function deadlineTone(deadline: string | null): string {
  if (!deadline) return "text-zinc-400 dark:text-zinc-500";
  const days = (new Date(deadline).getTime() - Date.now()) / 86_400_000;
  if (days < 0) return "text-red-600 font-semibold dark:text-red-400";
  if (days <= 3) return "text-amber-600 font-medium dark:text-amber-400";
  return "text-zinc-500 dark:text-zinc-400";
}
