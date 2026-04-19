"use client";

import * as React from "react";
import { CheckCircle2, ShieldCheck, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  CHECKPOINT_LABEL,
  RESULT_LABEL,
  RESULT_VARIANTS,
  useCreateQcCheck,
  useDeleteQcCheck,
  useQcChecks,
  useUpdateQcCheck,
  type QcCheckRow,
  type QcCheckpoint,
  type QcResult,
} from "@/hooks/useQcChecks";
import { cn } from "@/lib/utils";

/**
 * V1.3 Phase B6 — QC Checklist component.
 *
 * Hiển thị 3 checkpoint hardcode (PRE_ASSEMBLY / MID_PRODUCTION / PRE_FG)
 * với radio PASS/FAIL/N/A + note textarea per row. Auto-seed 3 default
 * checkpoints khi WO đã IN_PROGRESS và chưa có check nào.
 */

const CHECKPOINT_ORDER: QcCheckpoint[] = [
  "PRE_ASSEMBLY",
  "MID_PRODUCTION",
  "PRE_FG",
];

export function QcChecklist({
  woId,
  canEdit,
  isAdmin,
  woStatus,
}: {
  woId: string;
  canEdit: boolean;
  isAdmin: boolean;
  woStatus: string;
}) {
  const shouldSeed = woStatus === "IN_PROGRESS" || woStatus === "PAUSED";
  const query = useQcChecks(woId, shouldSeed);
  const createMut = useCreateQcCheck(woId);
  const updateMut = useUpdateQcCheck(woId);
  const deleteMut = useDeleteQcCheck(woId);

  const checks = query.data?.data ?? [];

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  // Group by checkpoint
  const byCheckpoint = new Map<QcCheckpoint, QcCheckRow[]>();
  for (const cp of CHECKPOINT_ORDER) byCheckpoint.set(cp, []);
  for (const c of checks) {
    if (c.checkpoint && byCheckpoint.has(c.checkpoint)) {
      byCheckpoint.get(c.checkpoint)!.push(c);
    }
  }

  const onResult = async (id: string, result: QcResult, note: string) => {
    try {
      await updateMut.mutateAsync({ id, result, note });
      toast.success(`Đã ghi nhận ${RESULT_LABEL[result]}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onAddExtra = async (checkpoint: QcCheckpoint) => {
    try {
      await createMut.mutateAsync({
        woId,
        checkpointName: CHECKPOINT_LABEL[checkpoint],
        checkpoint,
      });
      toast.success("Đã thêm check mới");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Xóa QC check này?")) return;
    try {
      await deleteMut.mutateAsync(id);
      toast.success("Đã xóa");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // Summary
  const total = checks.length;
  const pass = checks.filter((c) => c.result === "PASS").length;
  const fail = checks.filter((c) => c.result === "FAIL").length;
  const pending = checks.filter((c) => c.result === null).length;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-xs text-zinc-600">
        <ShieldCheck className="h-4 w-4 text-zinc-500" aria-hidden="true" />
        <span>
          Tổng {total} check · Đạt {pass} · Lỗi{" "}
          <span className="text-red-700">{fail}</span> · Chờ{" "}
          <span className="text-amber-700">{pending}</span>
        </span>
      </div>

      {CHECKPOINT_ORDER.map((cp) => {
        const rows = byCheckpoint.get(cp) ?? [];
        return (
          <section
            key={cp}
            className="rounded-md border border-zinc-200 bg-white"
          >
            <div className="flex items-center justify-between border-b border-zinc-200 bg-zinc-50 px-3 py-2">
              <div className="flex items-center gap-2">
                <CheckCircle2
                  className="h-4 w-4 text-zinc-500"
                  aria-hidden="true"
                />
                <span className="text-sm font-semibold text-zinc-800">
                  {CHECKPOINT_LABEL[cp]}
                </span>
                <span className="text-xs text-zinc-500">
                  · {rows.length} bản ghi
                </span>
              </div>
              {canEdit ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void onAddExtra(cp)}
                  disabled={createMut.isPending}
                >
                  + Thêm check
                </Button>
              ) : null}
            </div>
            {rows.length === 0 ? (
              <div className="px-3 py-4 text-xs text-zinc-500">
                Chưa có check nào.
              </div>
            ) : (
              <ul className="divide-y divide-zinc-100">
                {rows.map((r) => (
                  <QcRow
                    key={r.id}
                    row={r}
                    canEdit={canEdit}
                    isAdmin={isAdmin}
                    onResult={onResult}
                    onDelete={onDelete}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

function QcRow({
  row,
  canEdit,
  isAdmin,
  onResult,
  onDelete,
}: {
  row: QcCheckRow;
  canEdit: boolean;
  isAdmin: boolean;
  onResult: (id: string, result: QcResult, note: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  const [note, setNote] = React.useState(row.note ?? "");
  const [busy, setBusy] = React.useState(false);

  const submit = async (result: QcResult) => {
    setBusy(true);
    try {
      await onResult(row.id, result, note);
    } finally {
      setBusy(false);
    }
  };

  return (
    <li className="px-3 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-zinc-900">
              {row.checkpointName}
            </span>
            {row.result ? (
              <Badge variant={RESULT_VARIANTS[row.result]}>
                {RESULT_LABEL[row.result]}
              </Badge>
            ) : (
              <Badge variant="warning">Chờ</Badge>
            )}
            {row.checkedAt ? (
              <span className="text-[11px] text-zinc-500">
                · {new Date(row.checkedAt).toLocaleString("vi-VN")}
              </span>
            ) : null}
          </div>
          <Textarea
            className="mt-2 min-h-[60px] text-sm"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú (tùy chọn)"
            disabled={!canEdit}
            maxLength={1024}
          />
        </div>
        {canEdit ? (
          <div className="flex shrink-0 flex-col gap-1.5">
            {(["PASS", "FAIL", "NA"] as QcResult[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => void submit(r)}
                disabled={busy}
                className={cn(
                  "inline-flex h-9 min-w-[72px] items-center justify-center rounded-md border px-3 text-xs font-semibold transition-colors",
                  row.result === r
                    ? r === "PASS"
                      ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                      : r === "FAIL"
                        ? "border-red-500 bg-red-50 text-red-700"
                        : "border-zinc-400 bg-zinc-100 text-zinc-700"
                    : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
                )}
                aria-pressed={row.result === r}
              >
                {RESULT_LABEL[r]}
              </button>
            ))}
            {isAdmin ? (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void onDelete(row.id)}
              >
                <Trash2
                  className="h-3.5 w-3.5 text-red-500"
                  aria-hidden="true"
                />
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>
    </li>
  );
}
