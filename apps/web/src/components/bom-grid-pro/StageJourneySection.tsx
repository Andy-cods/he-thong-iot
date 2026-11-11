"use client";

import * as React from "react";
import { toast } from "sonner";
import { STAGE_LABELS_BY_CATEGORY, stagesFor } from "@iot/shared";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { buildJourney } from "@/lib/bom-stage-journey";
import {
  useBomStages,
  useLineStageMoves,
  useReverseStageMove,
} from "@/hooks/useBomStages";

/** BomLineSheet — timeline 5 bước (SL đang có + đã tới) và lịch sử chuyển bước. */
export function StageJourneySection({
  templateId,
  lineId,
  open,
}: {
  templateId: string;
  lineId: string;
  open: boolean;
}) {
  const stages = useBomStages(templateId);
  const moves = useLineStageMoves(templateId, lineId, open);
  const reverse = useReverseStageMove(templateId);
  const askConfirm = useConfirm();
  const st = stages.data?.data.lines[lineId];
  const journey = st ? buildJourney(st.category, st.required, st.buckets) : null;

  const labelOf = (code: string | null) => {
    if (!code) return "—";
    if (!st) return code;
    const i = stagesFor(st.category).indexOf(code as never);
    return i < 0 ? code : STAGE_LABELS_BY_CATEGORY[st.category][i]!;
  };

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
    <div className="space-y-3">
      {!journey ? (
        <p className="text-[12px] text-zinc-400">{stages.isLoading ? "Đang tải…" : "Chưa có số liệu."}</p>
      ) : (
        <ol className="space-y-1.5">
          {journey.stages.map((s) => (
            <li
              key={s.code}
              className={cn(
                "flex items-center justify-between rounded-xl px-3 py-1.5 text-[12px]",
                s.qty > 0
                  ? "bg-indigo-50 text-indigo-900 dark:bg-indigo-950/40 dark:text-indigo-200"
                  : "bg-zinc-50 text-zinc-500 dark:bg-zinc-800/50 dark:text-zinc-400",
              )}
            >
              <span className="font-medium">{s.label}</span>
              <span className="font-mono tabular-nums">
                đang có <b>{formatNumber(s.qty)}</b> · đã tới {formatNumber(s.reached)}/
                {formatNumber(journey.required)}
              </span>
            </li>
          ))}
        </ol>
      )}

      <div>
        <div className="mb-1 text-[11px] font-medium uppercase tracking-wide text-zinc-400">
          Lịch sử chuyển bước
        </div>
        {moves.isLoading ? (
          <p className="text-[12px] text-zinc-400">Đang tải…</p>
        ) : (moves.data?.data ?? []).length === 0 ? (
          <p className="text-[12px] text-zinc-400 dark:text-zinc-500">Chưa chuyển bước nào.</p>
        ) : (
          <ul className="space-y-1.5">
            {(moves.data?.data ?? []).map((m) => (
              <li
                key={m.id}
                className="flex items-start justify-between gap-2 rounded-xl bg-zinc-50 px-3 py-2 text-[12px] dark:bg-zinc-800/50"
              >
                <div className="min-w-0">
                  <div className="text-zinc-800 dark:text-zinc-200">
                    {labelOf(m.fromStage)} → <span className="font-medium">{labelOf(m.toStage)}</span>{" "}
                    · <b>{formatNumber(Number(m.qty))}</b>
                    {m.reversesId != null && (
                      <span className="ml-1 text-amber-600 dark:text-amber-400">(đảo #{m.reversesId})</span>
                    )}
                    {m.reversedById != null && (
                      <span className="ml-1 text-zinc-400">· đã bị đảo</span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 dark:text-zinc-500">
                    {m.actorName ?? "—"} · {new Date(m.at).toLocaleString("vi-VN")}
                    {m.note ? ` · ${m.note}` : ""}
                  </div>
                </div>
                {m.docType === "MANUAL" && m.reversesId == null && m.reversedById == null && (
                  <button
                    type="button"
                    disabled={reverse.isPending}
                    onClick={() => void onReverse(m.id)}
                    className="shrink-0 rounded-md border border-zinc-300 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 disabled:opacity-50 dark:border-zinc-600 dark:text-zinc-200 dark:hover:bg-zinc-700"
                  >
                    Đảo
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
