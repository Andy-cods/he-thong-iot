"use client";

import * as React from "react";
import { ArrowRight, Send, Truck } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatNumber } from "@/lib/format";
import { buildJourney } from "@/lib/bom-stage-journey";
import { useBomStages } from "@/hooks/useBomStages";
import { lineCategory, lineDimsText, lineNameText } from "@/lib/bom-grid/line-view";
import type { BomTreeNodeRaw } from "@/hooks/useBom";
import { StageMoveDialog } from "../StageMoveDialog";
import { DeliverySlipDialog } from "../DeliverySlipDialog";
import { LineCard } from "./LineCard";
import { currentStageIndex, pickLineActions, type LineAction } from "./model";

const ICONS = { move: ArrowRight, sendNtp: Send, deliver: Truck } as const;

/** Card "Đang ở đâu": thanh 5 bước có số lượng + 1–2 nút hành động đúng ngữ cảnh. */
export function LineJourneyCard({
  templateId,
  templateCode,
  lineId,
  node,
}: {
  templateId: string;
  templateCode: string;
  lineId: string;
  node: BomTreeNodeRaw;
}) {
  const stages = useBomStages(templateId);
  const st = stages.data?.data.lines[lineId];
  const category = st?.category ?? lineCategory(node);
  const journey = st ? buildJourney(st.category, st.required, st.buckets) : null;
  const actions = pickLineActions(category, st?.buckets ?? null);
  const cur = currentStageIndex(category, st?.buckets ?? null);

  const [moveOpen, setMoveOpen] = React.useState(false);
  const [slipKind, setSlipKind] = React.useState<"SURFACE" | "ASSEMBLY" | null>(null);

  const name = lineNameText(node) || node.componentName || lineId;
  const buckets = st?.buckets ?? null;

  const run = (a: LineAction) => {
    if (a.kind === "move") setMoveOpen(true);
    else setSlipKind(a.kind === "sendNtp" ? "SURFACE" : "ASSEMBLY");
  };

  return (
    <LineCard title="Đang ở đâu">
      {!journey ? (
        <p className="text-[12px] text-zinc-400">{stages.isLoading ? "Đang tải…" : "Chưa có số liệu."}</p>
      ) : (
        <>
          <ol className="grid grid-cols-5 gap-1.5">
            {journey.stages.map((s, i) => (
              <li key={s.code} className="min-w-0">
                <div
                  className={cn(
                    "h-1.5 rounded-full",
                    s.reached >= journey.required && journey.required > 0
                      ? "bg-emerald-500"
                      : s.reached > 0
                        ? "bg-indigo-400"
                        : "bg-zinc-200 dark:bg-zinc-700",
                  )}
                />
                <div
                  className={cn(
                    "mt-1.5 truncate text-[11px] leading-tight",
                    i === cur
                      ? "font-semibold text-indigo-600 dark:text-indigo-300"
                      : "text-zinc-500 dark:text-zinc-400",
                  )}
                  title={s.label}
                >
                  {s.label}
                </div>
                <div
                  className={cn(
                    "text-[15px] font-semibold tabular-nums leading-tight",
                    s.qty > 0 ? "text-zinc-900 dark:text-zinc-50" : "text-zinc-300 dark:text-zinc-600",
                  )}
                >
                  {formatNumber(s.qty)}
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {journey.full ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
                Đã giao lắp ráp đủ {formatNumber(journey.required)}
              </span>
            ) : (
              <span className="text-zinc-500 dark:text-zinc-400">
                Cần {formatNumber(journey.required)}
              </span>
            )}
            {journey.split && !journey.full && (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 font-medium text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                từng phần
              </span>
            )}
          </div>
          {actions.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {actions.map((a, i) => {
                const Icon = ICONS[a.kind];
                return (
                  <button
                    key={a.kind}
                    type="button"
                    onClick={() => run(a)}
                    className={cn(
                      "inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[13px] font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400",
                      i === 0
                        ? "bg-indigo-600 text-white hover:bg-indigo-700"
                        : "bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-zinc-100 dark:bg-zinc-900 dark:text-zinc-200 dark:ring-zinc-700 dark:hover:bg-zinc-800",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" aria-hidden />
                    {a.kind === "move" ? a.label : `${a.label} (${formatNumber(a.qty)})`}
                  </button>
                );
              })}
            </div>
          )}
        </>
      )}

      <StageMoveDialog
        open={moveOpen}
        onOpenChange={setMoveOpen}
        templateId={templateId}
        targets={[{ id: lineId, name, category, buckets }]}
      />
      <DeliverySlipDialog
        open={slipKind !== null}
        onOpenChange={(v) => !v && setSlipKind(null)}
        kind={slipKind ?? "SURFACE"}
        templateId={templateId}
        templateCode={templateCode}
        targets={[
          {
            id: lineId,
            name,
            category,
            buckets,
            positionCode: node.positionCode ?? null,
            surfaceTreatment: node.surfaceTreatment ?? null,
            dimsText: lineDimsText(node),
          },
        ]}
      />
    </LineCard>
  );
}
