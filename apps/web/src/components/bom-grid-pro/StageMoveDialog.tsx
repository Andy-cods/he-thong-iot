"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { STAGE_LABELS_BY_CATEGORY, stagesFor, type BomCategory } from "@iot/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { defaultMove } from "@/lib/bom-stage-journey";
import type { StageBuckets } from "@/lib/bom-stage-ledger";
import { useMoveStages, type StageMoveItem } from "@/hooks/useBomStages";

export interface StageMoveTarget {
  id: string;
  name: string;
  category: BomCategory;
  buckets: StageBuckets | null;
}

interface RowState {
  include: boolean;
  from: string;
  to: string;
  qty: string;
}

const SEL =
  "h-8 rounded-md border border-zinc-200 bg-white px-1.5 text-xs dark:border-zinc-700 dark:bg-zinc-900";

function initRow(t: StageMoveTarget): RowState | null {
  if (!t.buckets) return null;
  const d = defaultMove(t.category, t.buckets);
  return d.ok ? { include: true, from: d.from, to: d.to, qty: String(d.qty) } : null;
}

export function StageMoveDialog({
  open,
  onOpenChange,
  templateId,
  targets,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  templateId: string;
  targets: StageMoveTarget[];
  onDone?: () => void;
}) {
  const mut = useMoveStages(templateId);
  const [rows, setRows] = React.useState<Record<string, RowState | null>>({});

  React.useEffect(() => {
    if (!open) return;
    const next: Record<string, RowState | null> = {};
    for (const t of targets) next[t.id] = initRow(t);
    setRows(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const patch = (id: string, p: Partial<RowState>) =>
    setRows((prev) => ({ ...prev, [id]: { ...(prev[id] as RowState), ...p } }));

  const items: StageMoveItem[] = [];
  let invalid = 0;
  for (const t of targets) {
    const r = rows[t.id];
    if (!r || !r.include || !t.buckets) continue;
    const qty = Number(r.qty);
    const max = t.buckets[r.from] ?? 0;
    if (!(qty > 0) || qty > max + 5e-5) {
      invalid++;
      continue;
    }
    items.push({ lineId: t.id, from: r.from, to: r.to, qty });
  }

  const submit = async () => {
    if (items.length === 0 || invalid > 0) return;
    try {
      await mut.mutateAsync(items);
      toast.success(`Đã chuyển bước ${items.length} dòng`);
      onOpenChange(false);
      onDone?.();
    } catch (e) {
      toast.error((e as Error).message || "Không chuyển được bước.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Chuyển bước</DialogTitle>
          <DialogDescription>
            Chuyển từng phần được — số lượng không vượt số đang có ở bước nguồn.
          </DialogDescription>
        </DialogHeader>
        <div className="max-h-[60vh] space-y-1.5 overflow-y-auto">
          {targets.map((t) => {
            const r = rows[t.id];
            const codes = stagesFor(t.category);
            const labels = STAGE_LABELS_BY_CATEGORY[t.category];
            const labelOf = (c: string) => labels[codes.indexOf(c as never)] ?? c;
            if (!r || !t.buckets) {
              const d = t.buckets ? defaultMove(t.category, t.buckets) : null;
              return (
                <div
                  key={t.id}
                  className="flex items-center justify-between gap-2 rounded-lg bg-zinc-50 px-3 py-2 text-xs opacity-60 dark:bg-zinc-800/50"
                >
                  <span className="truncate font-medium">{t.name}</span>
                  <span className="shrink-0 text-zinc-500">
                    {d && !d.ok ? d.reason : "Chưa tải được số liệu"}
                  </span>
                </div>
              );
            }
            const max = t.buckets[r.from] ?? 0;
            const qn = Number(r.qty);
            const bad = r.include && (!(qn > 0) || qn > max + 5e-5);
            const fromIdx = codes.indexOf(r.from as never);
            return (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-2 rounded-lg border border-zinc-200 px-3 py-2 dark:border-zinc-700"
              >
                <input
                  type="checkbox"
                  checked={r.include}
                  onChange={(e) => patch(t.id, { include: e.target.checked })}
                  aria-label={`Chuyển ${t.name}`}
                />
                <span className="min-w-0 flex-1 basis-40 truncate text-sm font-medium" title={t.name}>
                  {t.name}
                </span>
                <select
                  className={SEL}
                  value={r.from}
                  aria-label="Bước nguồn"
                  onChange={(e) => {
                    const from = e.target.value;
                    const i = codes.indexOf(from as never);
                    patch(t.id, { from, to: codes[i + 1]!, qty: String(t.buckets![from] ?? 0) });
                  }}
                >
                  {codes.slice(0, -1).map((c) =>
                    (t.buckets![c] ?? 0) > 0 ? (
                      <option key={c} value={c}>
                        {labelOf(c)} ({formatNumber(t.buckets![c] ?? 0)})
                      </option>
                    ) : null,
                  )}
                </select>
                <span aria-hidden>→</span>
                <select
                  className={SEL}
                  value={r.to}
                  aria-label="Bước đích"
                  onChange={(e) => patch(t.id, { to: e.target.value })}
                >
                  {codes.slice(fromIdx + 1).map((c) => (
                    <option key={c} value={c}>
                      {labelOf(c)}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  min={0}
                  max={max}
                  step="any"
                  value={r.qty}
                  aria-label="Số lượng"
                  onChange={(e) => patch(t.id, { qty: e.target.value })}
                  className={`${SEL} w-20 text-right font-mono ${bad ? "border-red-400 text-red-600" : ""}`}
                />
                <span className="text-[11px] text-zinc-500">tối đa {formatNumber(max)}</span>
              </div>
            );
          })}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={mut.isPending}>
            Huỷ
          </Button>
          <Button type="button" onClick={submit} disabled={mut.isPending || items.length === 0 || invalid > 0}>
            {mut.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            Chuyển {items.length} dòng
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
