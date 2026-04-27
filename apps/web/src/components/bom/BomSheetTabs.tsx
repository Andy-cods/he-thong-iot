"use client";

import * as React from "react";
import {
  Plus,
  FileText,
  Beaker,
  Layers,
  FileEdit,
  Sparkles,
  MoreVertical,
  Pencil,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BOM_SHEET_KIND_LABELS, type BomSheetKind } from "@iot/shared";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDeleteBomSheet,
  useUpdateBomSheet,
  type BomSheetRow,
} from "@/hooks/useBomSheets";

/**
 * V2.0 Sprint 6 — Tab bar hiển thị sheets của 1 BOM List.
 *
 * - Desktop ≥1024: tabs ngang
 * - Tablet/mobile <1024: dropdown selector (TODO sau, hiện scroll-x)
 *
 * Click tab → switch active sheet (parent component handle filter lines).
 * Nút "+ Thêm sheet" cuối hàng (mở AddSheetDialog).
 *
 * TASK-20260427-021 — mỗi tab có ⋯ menu: Đổi tên / Xoá sheet.
 *  - Disable Xoá khi chỉ còn 1 sheet (tooltip).
 *  - Confirm 2 bước: lần 1 nhận count rows, lần 2 force=true.
 */

export interface BomSheetTabsProps {
  sheets: BomSheetRow[];
  activeSheetId: string | null;
  onChange: (sheetId: string) => void;
  onAddSheet?: () => void;
  loading?: boolean;
  className?: string;
  /** Disable nút thêm sheet (vd BOM ACTIVE/OBSOLETE chỉ admin sửa). */
  canAddSheet?: boolean;
  /** Template ID để hooks update/delete có thể invalidate cache. */
  templateId?: string;
  /** Disable rename + delete (BOM read-only, vd OBSOLETE). */
  readOnly?: boolean;
  /** Khi sheet active bị xoá → parent tự switch sang sheet khác. */
  onSheetDeleted?: (deletedId: string, fallbackId: string | null) => void;
}

const KIND_ICON: Record<BomSheetKind, React.ElementType> = {
  PROJECT: FileText,
  MATERIAL: Beaker,
  PROCESS: Layers,
  CUSTOM: FileEdit,
};

const KIND_COLOR: Record<BomSheetKind, string> = {
  PROJECT: "text-indigo-600",
  MATERIAL: "text-emerald-600",
  PROCESS: "text-amber-600",
  CUSTOM: "text-zinc-600",
};

export function BomSheetTabs({
  sheets,
  activeSheetId,
  onChange,
  onAddSheet,
  loading,
  canAddSheet = true,
  className,
  templateId,
  readOnly = false,
  onSheetDeleted,
}: BomSheetTabsProps) {
  const [renameTarget, setRenameTarget] = React.useState<BomSheetRow | null>(
    null,
  );
  const [deleteTarget, setDeleteTarget] = React.useState<BomSheetRow | null>(
    null,
  );

  if (loading) {
    return (
      <div
        className={cn(
          "flex items-center gap-1 border-b border-zinc-200 bg-white px-4 py-1.5",
          className,
        )}
        aria-busy="true"
      >
        <div className="h-7 w-32 animate-pulse rounded-sm bg-zinc-100" />
        <div className="h-7 w-32 animate-pulse rounded-sm bg-zinc-100" />
      </div>
    );
  }

  if (sheets.length === 0) {
    return (
      <div
        className={cn(
          "flex items-center justify-between border-b border-zinc-200 bg-white px-4 py-1.5 text-sm text-zinc-500",
          className,
        )}
      >
        <span>BOM chưa có sheet nào</span>
        {onAddSheet && canAddSheet ? (
          <Button size="sm" variant="outline" onClick={onAddSheet}>
            <Plus className="mr-1 h-3 w-3" /> Tạo sheet đầu tiên
          </Button>
        ) : null}
      </div>
    );
  }

  const canManage = !readOnly && !!templateId;
  const isLastSheet = sheets.length <= 1;

  return (
    <>
      <div
        role="tablist"
        aria-label="Sheets của BOM"
        className={cn(
          "flex items-center gap-0.5 overflow-x-auto border-b border-zinc-200 bg-white px-2",
          className,
        )}
      >
        {sheets.map((sheet) => {
          const Icon = KIND_ICON[sheet.kind];
          const isActive = sheet.id === activeSheetId;
          return (
            <div
              key={sheet.id}
              className={cn(
                "group relative flex h-9 shrink-0 items-center pr-0.5",
                isActive ? "" : "",
              )}
            >
              <button
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(sheet.id)}
                className={cn(
                  "flex h-9 shrink-0 items-center gap-1.5 px-3 text-sm font-medium transition-colors",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
                  isActive
                    ? "text-zinc-900"
                    : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-700",
                )}
                title={`${sheet.name} · ${BOM_SHEET_KIND_LABELS[sheet.kind]}${
                  sheet.kind === "PROJECT" ? ` · ${sheet.lineCount} dòng` : ""
                }`}
              >
                <Icon
                  className={cn(
                    "h-3.5 w-3.5 shrink-0",
                    isActive
                      ? KIND_COLOR[sheet.kind]
                      : "text-zinc-400 group-hover:text-zinc-500",
                  )}
                  aria-hidden="true"
                />
                <span className="max-w-[200px] truncate">{sheet.name}</span>
                {sheet.kind === "PROJECT" && sheet.lineCount > 0 ? (
                  <span
                    className={cn(
                      "ml-1 inline-flex h-4 min-w-4 items-center justify-center rounded-sm px-1 text-[10px] font-medium tabular-nums",
                      isActive
                        ? "bg-indigo-100 text-indigo-700"
                        : "bg-zinc-100 text-zinc-600",
                    )}
                  >
                    {sheet.lineCount}
                  </span>
                ) : null}
                {isActive ? (
                  <span
                    aria-hidden="true"
                    className="absolute bottom-0 left-2 right-2 h-0.5 rounded-t bg-indigo-500"
                  />
                ) : null}
              </button>

              {canManage ? (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      className={cn(
                        "ml-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-sm text-zinc-400 transition-colors",
                        "hover:bg-zinc-100 hover:text-zinc-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500",
                        "opacity-0 group-hover:opacity-100 data-[state=open]:opacity-100",
                        isActive && "opacity-100",
                      )}
                      aria-label={`Tuỳ chọn sheet ${sheet.name}`}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <MoreVertical className="h-3.5 w-3.5" aria-hidden="true" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuItem onSelect={() => setRenameTarget(sheet)}>
                      <Pencil className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      Đổi tên
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      disabled={isLastSheet}
                      className={cn(
                        "text-red-700",
                        !isLastSheet && "focus:bg-red-50 focus:text-red-800",
                      )}
                      onSelect={() => {
                        if (isLastSheet) return;
                        setDeleteTarget(sheet);
                      }}
                    >
                      <Trash2 className="mr-2 h-3.5 w-3.5" aria-hidden="true" />
                      {isLastSheet ? "Phải còn ≥1 sheet" : "Xoá sheet"}
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              ) : null}
            </div>
          );
        })}

        {onAddSheet && canAddSheet ? (
          <button
            type="button"
            onClick={onAddSheet}
            className="ml-1 inline-flex h-7 items-center gap-1 rounded-sm border border-dashed border-zinc-300 px-2 text-xs font-medium text-zinc-500 transition-colors hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
            aria-label="Thêm sheet mới"
            title="Thêm sheet Vật liệu / Quy trình / Tuỳ chỉnh"
          >
            <Plus className="h-3 w-3" />
            Thêm sheet
          </button>
        ) : null}

        {/* V2.0 Sprint 6 FIX — gợi ý khi BOM chưa có sheet MATERIAL/PROCESS.
            Pattern: nếu BOM chỉ có sheet PROJECT, hiển thị nudge nhỏ. */}
        {sheets.length > 0 &&
        !sheets.some((s) => s.kind === "MATERIAL") &&
        onAddSheet &&
        canAddSheet ? (
          <span className="ml-2 inline-flex items-center gap-1 text-xs text-amber-600">
            <Sparkles className="h-3 w-3" aria-hidden="true" />
            <span>Thêm sheet "Vật liệu" để theo dõi giá + phôi cho BOM này</span>
          </span>
        ) : null}
      </div>

      {/* Rename dialog */}
      {templateId && renameTarget ? (
        <RenameSheetDialog
          templateId={templateId}
          sheet={renameTarget}
          existingNames={sheets
            .filter((s) => s.id !== renameTarget.id)
            .map((s) => s.name)}
          onClose={() => setRenameTarget(null)}
        />
      ) : null}

      {/* Delete confirm dialog */}
      {templateId && deleteTarget ? (
        <DeleteSheetDialog
          templateId={templateId}
          sheet={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          onDeleted={(deletedId) => {
            const remaining = sheets.filter((s) => s.id !== deletedId);
            const fallback = remaining[0]?.id ?? null;
            onSheetDeleted?.(deletedId, fallback);
          }}
        />
      ) : null}
    </>
  );
}

/* ----------------------------- Rename dialog ----------------------------- */

function RenameSheetDialog({
  templateId,
  sheet,
  existingNames,
  onClose,
}: {
  templateId: string;
  sheet: BomSheetRow;
  existingNames: string[];
  onClose: () => void;
}) {
  const [name, setName] = React.useState(sheet.name);
  const update = useUpdateBomSheet(templateId);

  const trimmed = name.trim();
  const isDup = existingNames.some(
    (n) => n.toLowerCase() === trimmed.toLowerCase(),
  );
  const unchanged = trimmed === sheet.name;
  const valid = trimmed.length > 0 && !isDup;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!valid || unchanged) return;
    try {
      await update.mutateAsync({
        sheetId: sheet.id,
        patch: { name: trimmed },
      });
      toast.success(`Đã đổi tên sheet thành "${trimmed}"`);
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      if (code === "DUPLICATE_NAME") {
        toast.error("Tên sheet đã tồn tại trong BOM này");
      } else {
        toast.error((err as Error).message ?? "Đổi tên thất bại");
      }
    }
  };

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Đổi tên sheet</DialogTitle>
          <DialogDescription>
            Đặt tên mới cho sheet "{sheet.name}" ({BOM_SHEET_KIND_LABELS[sheet.kind]}
            ).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div>
            <Label uppercase>Tên sheet *</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={255}
              autoFocus
              required
            />
            {isDup ? (
              <p className="mt-1 text-xs text-red-600">
                Tên này đã được dùng bởi sheet khác trong BOM.
              </p>
            ) : null}
          </div>
          <DialogFooter className="mt-2 flex flex-row justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={onClose}
              disabled={update.isPending}
            >
              Huỷ
            </Button>
            <Button
              type="submit"
              disabled={!valid || unchanged || update.isPending}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              {update.isPending ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------ Delete dialog ----------------------------- */

interface RowCounts {
  lineCount: number;
  materialCount: number;
  processCount: number;
  total: number;
}

function DeleteSheetDialog({
  templateId,
  sheet,
  onClose,
  onDeleted,
}: {
  templateId: string;
  sheet: BomSheetRow;
  onClose: () => void;
  onDeleted: (deletedId: string) => void;
}) {
  const del = useDeleteBomSheet(templateId);
  const [rowCounts, setRowCounts] = React.useState<RowCounts | null>(null);
  const [phase, setPhase] = React.useState<"confirm" | "force">("confirm");

  const performDelete = async (force: boolean) => {
    try {
      const res = await del.mutateAsync({ sheetId: sheet.id, force });
      const total = res.data.deletedRowCounts?.total ?? 0;
      toast.success(
        total > 0
          ? `Đã xoá sheet "${sheet.name}" (${total} dòng dữ liệu).`
          : `Đã xoá sheet "${sheet.name}".`,
      );
      onDeleted(sheet.id);
      onClose();
    } catch (err) {
      const code = (err as { code?: string }).code;
      const details = (err as { details?: RowCounts }).details;
      if (code === "SHEET_HAS_ROWS" && details) {
        // Lần 1 — fetch count, chuyển sang phase confirm force.
        setRowCounts(details);
        setPhase("force");
        return;
      }
      if (code === "LAST_SHEET" || code === "LAST_PROJECT_SHEET") {
        toast.error((err as Error).message);
        onClose();
        return;
      }
      toast.error((err as Error).message ?? "Xoá sheet thất bại");
    }
  };

  // Lần đầu mở dialog: nếu sheet PROJECT có lineCount > 0 từ list, sẽ
  // luôn rơi vào phase "force" sau khi gọi API. Nếu sheet rỗng, gọi 1 lần
  // delete nhanh không cần force. Vì ta không biết chắc count rows vật
  // liệu/quy trình từ client → luôn gọi không force trước, server quyết.

  const handleConfirmInitial = () => {
    void performDelete(false);
  };

  const handleConfirmForce = () => {
    void performDelete(true);
  };

  const showForce = phase === "force" && rowCounts !== null;

  return (
    <Dialog open onOpenChange={(o) => (!o ? onClose() : null)}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-red-700">
            {showForce ? "Sheet còn dữ liệu" : "Xoá sheet?"}
          </DialogTitle>
          <DialogDescription asChild>
            <div className="space-y-2 text-sm text-zinc-600">
              <p>
                Bạn chắc muốn xoá sheet{" "}
                <span className="font-semibold text-zinc-900">
                  "{sheet.name}"
                </span>{" "}
                ({BOM_SHEET_KIND_LABELS[sheet.kind]})?
              </p>
              {showForce && rowCounts ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-semibold">
                    Sheet này còn {rowCounts.total} dòng dữ liệu sẽ mất:
                  </p>
                  <ul className="ml-4 mt-1 list-disc">
                    {rowCounts.lineCount > 0 ? (
                      <li>{rowCounts.lineCount} dòng cấu trúc (BOM line)</li>
                    ) : null}
                    {rowCounts.materialCount > 0 ? (
                      <li>{rowCounts.materialCount} dòng vật liệu</li>
                    ) : null}
                    {rowCounts.processCount > 0 ? (
                      <li>{rowCounts.processCount} dòng quy trình</li>
                    ) : null}
                  </ul>
                  <p className="mt-2 font-semibold">
                    Hành động không thể hoàn tác.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  Nếu sheet còn dữ liệu, hệ thống sẽ hỏi xác nhận lần nữa.
                </p>
              )}
            </div>
          </DialogDescription>
        </DialogHeader>
        <DialogFooter className="mt-2 flex flex-row justify-end gap-2">
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={del.isPending}
          >
            Huỷ
          </Button>
          <Button
            type="button"
            onClick={showForce ? handleConfirmForce : handleConfirmInitial}
            disabled={del.isPending}
            className="bg-red-600 text-white hover:bg-red-700"
          >
            {del.isPending
              ? "Đang xoá…"
              : showForce
                ? "Xoá kèm dữ liệu"
                : "Xoá sheet"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
