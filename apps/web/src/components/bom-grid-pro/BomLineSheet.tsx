"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetFooter } from "@/components/ui/sheet";
import { useBomStages } from "@/hooks/useBomStages";
import type { BomFlatRow } from "@/lib/bom-grid/flatten-tree";
import { LineSheetHeader } from "./line-sheet/LineSheetHeader";
import { LineQuickStats } from "./line-sheet/LineQuickStats";
import { LineJourneyCard } from "./line-sheet/LineJourneyCard";
import { LineSpecsCard } from "./line-sheet/LineSpecsCard";
import { LineRoutingCard } from "./line-sheet/LineRoutingCard";
import { LineActivityCard } from "./line-sheet/LineActivityCard";
import { kindOfCategory } from "./line-sheet/model";
import { useLineSheetForm } from "./line-sheet/useLineSheetForm";

/**
 * Side sheet chi tiết dòng BOM (thiết kế kiểu Apple): XEM trước → SỬA khi cần.
 * Ghép từ các phần trong ./line-sheet/ (header ảnh, chỉ số nhanh, "Đang ở đâu",
 * thông số, gia công, hoạt động). Lưu giữ nguyên PATCH cũ (expectedVersion + 409).
 */

export interface BomLineSheetProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  templateCode: string;
  line: BomFlatRow | null;
  /** Menu "…": nhân bản / xoá dòng (không truyền → ẩn mục). */
  onDuplicate?: (row: BomFlatRow) => void;
  onDelete?: (row: BomFlatRow) => void;
}

export function BomLineSheet({
  open,
  onOpenChange,
  templateId,
  templateCode,
  line,
  onDuplicate,
  onDelete,
}: BomLineSheetProps) {
  const qc = useQueryClient();
  const ctl = useLineSheetForm({ open, line, templateId, templateCode, onOpenChange });
  const stages = useBomStages(templateId);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const { editing } = ctl;

  // Vào chế độ sửa → cuộn tới card thông số + focus ô đầu tiên.
  React.useEffect(() => {
    if (!editing) return;
    const t = setTimeout(() => document.getElementById("bls-qty")?.focus(), 30);
    return () => clearTimeout(t);
  }, [editing]);

  const node = line?.node ?? null;
  const required = line ? (stages.data?.data.lines[line.id]?.required ?? null) : null;
  const isFab = kindOfCategory(ctl.form.category) === "fab";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        size="md"
        hideCloseButton
        className="rounded-none bg-white p-0 md:w-[520px] md:rounded-l-2xl dark:bg-zinc-900"
        aria-describedby={undefined}
        onOpenAutoFocus={(e) => {
          e.preventDefault();
          scrollRef.current?.focus();
        }}
        onEscapeKeyDown={(e) => {
          // Đang sửa: Esc thoát chế độ sửa trước, Esc lần nữa mới đóng sheet.
          if (editing) {
            e.preventDefault();
            ctl.cancelEdit();
          }
        }}
      >
        {line && node ? (
          <>
            <div
              ref={scrollRef}
              tabIndex={-1}
              className="min-h-0 flex-1 overflow-y-auto overscroll-contain pb-6 outline-none"
              style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
            >
              <LineSheetHeader
                node={node}
                templateCode={templateCode}
                onClose={() => onOpenChange(false)}
                onCreateWorkOrder={isFab ? ctl.createWorkOrder : undefined}
                onDuplicate={onDuplicate ? () => onDuplicate(line) : undefined}
                onDelete={onDelete ? () => onDelete(line) : undefined}
              />
              <div className="mt-4 space-y-3 px-5">
                <LineQuickStats
                  node={node}
                  lineId={line.id}
                  templateId={templateId}
                  required={required}
                  liveVersion={ctl.liveVersion}
                  onSupplierChanged={(n) => {
                    ctl.setLiveVersion(n.rowVersion);
                    void qc.invalidateQueries({
                      queryKey: ["bom", "line-history", templateId, line.id],
                    });
                  }}
                />
                <LineJourneyCard
                  templateId={templateId}
                  templateCode={templateCode}
                  lineId={line.id}
                  node={node}
                />
                <LineSpecsCard
                  node={node}
                  form={ctl.form}
                  errors={ctl.errors}
                  editing={editing}
                  onEdit={() => ctl.setEditing(true)}
                  onSubmit={ctl.submit}
                  setField={ctl.setField}
                />
                {!editing && isFab ? <LineRoutingCard form={ctl.form} /> : null}
                <LineActivityCard
                  templateId={templateId}
                  lineId={line.id}
                  node={node}
                  open={open}
                />
              </div>
            </div>
            {editing && (
              <SheetFooter className="h-auto gap-2 border-t border-zinc-100 bg-white/90 px-5 py-3 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/90">
                <Button type="button" variant="ghost" onClick={ctl.cancelEdit} disabled={ctl.pending}>
                  Huỷ
                </Button>
                <Button type="submit" form="line-sheet-form" disabled={ctl.pending}>
                  {ctl.pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden /> : null}
                  Lưu
                </Button>
              </SheetFooter>
            )}
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
