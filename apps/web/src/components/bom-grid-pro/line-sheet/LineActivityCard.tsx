"use client";

import * as React from "react";
import { ArrowRightLeft, FileText, Store, Undo2 } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { formatRelative } from "@/lib/format";
import { useBomLineHistory, type BomTreeNodeRaw } from "@/hooks/useBom";
import { useBomStages, useLineStageMoves, useReverseStageMove } from "@/hooks/useBomStages";
import { lineCategory } from "@/lib/bom-grid/line-view";
import { LineCard } from "./LineCard";
import { mergeActivity, type ActivityItem } from "./model";

const ICON: Record<ActivityItem["kind"], React.ComponentType<{ className?: string }>> = {
  supplier: Store,
  move: ArrowRightLeft,
  reverse: Undo2,
  slip: FileText,
};
const PAGE = 5;

/** Card "Hoạt động": đổi NCC + chuyển bước (gồm theo phiếu giao) trên 1 dòng thời gian, mới nhất trước. */
export function LineActivityCard({
  templateId,
  lineId,
  node,
  open,
}: {
  templateId: string;
  lineId: string;
  node: BomTreeNodeRaw;
  open: boolean;
}) {
  const history = useBomLineHistory(templateId, lineId, open);
  const moves = useLineStageMoves(templateId, lineId, open);
  const stages = useBomStages(templateId);
  const reverse = useReverseStageMove(templateId);
  const askConfirm = useConfirm();
  const [all, setAll] = React.useState(false);
  React.useEffect(() => setAll(false), [lineId]);

  const category = stages.data?.data.lines[lineId]?.category ?? lineCategory(node);
  const items = React.useMemo(
    () => mergeActivity(category, history.data?.data ?? [], moves.data?.data ?? []),
    [category, history.data, moves.data],
  );
  const shown = all ? items : items.slice(0, PAGE);
  const loading = history.isLoading || moves.isLoading;

  const onReverse = async (id: number) => {
    const ok = await askConfirm({
      title: "Đảo bút toán chuyển bước?",
      description: "Tạo bút toán ngược; bút toán gốc vẫn được giữ trong lịch sử.",
      confirmLabel: "Đảo",
    });
    if (!ok) return;
    try {
      await reverse.mutateAsync(id);
      toast.success("Đã đảo bút toán");
    } catch (e) {
      toast.error((e as Error).message || "Không đảo được.");
    }
  };

  return (
    <LineCard title="Hoạt động">
      {loading ? (
        <p className="text-[12px] text-zinc-400">Đang tải…</p>
      ) : items.length === 0 ? (
        <p className="text-[12px] text-zinc-400 dark:text-zinc-500">Chưa có hoạt động nào.</p>
      ) : (
        <ul className="space-y-3">
          {shown.map((it) => {
            const Icon = ICON[it.kind];
            return (
              <li key={it.key} className="flex items-start gap-2.5">
                <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-white text-zinc-500 ring-1 ring-zinc-200 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-zinc-700">
                  <Icon className="h-3 w-3" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="break-words text-[13px] leading-snug text-zinc-800 dark:text-zinc-100">
                    {it.text}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {it.actor ?? "—"} · <span title={new Date(it.at).toLocaleString("vi-VN")}>{formatRelative(it.at)}</span>
                  </div>
                </div>
                {it.reversibleMoveId != null && (
                  <button
                    type="button"
                    disabled={reverse.isPending}
                    onClick={() => void onReverse(it.reversibleMoveId!)}
                    className="shrink-0 rounded-full px-2.5 py-1 text-[11px] font-medium text-zinc-600 ring-1 ring-zinc-200 hover:bg-white disabled:opacity-50 dark:text-zinc-300 dark:ring-zinc-700 dark:hover:bg-zinc-800"
                  >
                    Đảo
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {!loading && items.length > PAGE && (
        <button
          type="button"
          onClick={() => setAll((v) => !v)}
          className="mt-3 text-[12px] font-medium text-indigo-600 hover:underline dark:text-indigo-300"
        >
          {all ? "Thu gọn" : `Xem thêm (${items.length - PAGE})`}
        </button>
      )}
    </LineCard>
  );
}
