"use client";

import * as React from "react";
import { History, Lock, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SHIFT_REASON_MIN } from "@iot/shared";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { usePrompt } from "@/components/ui/confirm-dialog";
import { validateEntry } from "@/lib/shift-output/policy";
import { hhmm, workRangeLabel, workWindowMinutes } from "@/lib/shift-output/shift-window";
import {
  ShiftApiError,
  useDeleteShiftEntry,
  usePatchShiftEntry,
  useShiftContext,
  useShiftEntry,
  type EntryRow,
} from "@/hooks/useShiftOutput";
import { Chip, FieldLabel, fmtDay, Panel, TouchInput } from "./primitives";
import { emptyQty, qtyToPayload, QuantitySection, type QtyState } from "./QuantitySection";
import { EntryHistorySheet } from "./EntryHistorySheet";
import { WorkTimeSection, type WorkTime } from "./WorkTimeSection";

/**
 * V4.10 — sheet sửa 1 dòng (từ Lịch sử, danh sách "Đã nhập", hoặc 409 trùng ca).
 * Gửi kèm `version` (lệch → 409 STALE, tải lại). Dòng đã khoá: chỉ người có
 * quyền duyệt sửa được và BẮT BUỘC lý do ≥ 5 ký tự (V7).
 */
export function EntryEditSheet({ entryId, onClose }: { entryId: string | null; onClose: () => void }) {
  const q = useShiftEntry(entryId);
  return (
    <Sheet open={!!entryId} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <SheetContent side="right" size="lg" className="overflow-y-auto bg-zinc-50 dark:bg-zinc-950">
        <SheetTitle className="sr-only">Sửa dòng sản lượng</SheetTitle>
        {q.data ? (
          <EditBody key={`${q.data.id}:${q.data.version}`} entry={q.data} onClose={onClose} />
        ) : (
          <div className="space-y-3 p-4">
            {q.isError ? <p className="text-md text-red-600">{(q.error as Error).message}</p> : null}
            <Skeleton className="h-24 rounded-xl" />
            <Skeleton className="h-48 rounded-xl" />
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

function toQty(e: EntryRow): QtyState {
  return {
    ...emptyQty(),
    qtyOk: e.qtyOk,
    qtyNg: e.qtyNg,
    qtyPlanned: e.qtyPlanned,
    qtyRework: e.qtyRework,
    defects: Object.fromEntries(e.defects.map((d) => [d.reasonId, d.qty])),
    downtimes: Object.fromEntries(e.downtimes.map((d) => [d.reasonId, d.minutes])),
    showDowntime: e.downtimeMin != null,
  };
}

function EditBody({ entry, onClose }: { entry: EntryRow; onClose: () => void }) {
  const ctx = useShiftContext(entry.siteId);
  const patch = usePatchShiftEntry();
  const del = useDeleteShiftEntry();
  const prompt = usePrompt();
  const [qty, setQty] = React.useState<QtyState>(() => toQty(entry));
  const [operatorId, setOperatorId] = React.useState<string | null>(entry.operatorId);
  const [operatorName, setOperatorName] = React.useState(entry.operatorId ? "" : (entry.operatorName ?? ""));
  const [lot, setLot] = React.useState(entry.materialLot ?? "");
  const [notes, setNotes] = React.useState(entry.notes ?? "");
  const [reason, setReason] = React.useState("");
  const [historyOpen, setHistoryOpen] = React.useState(false);
  // P2 — dòng cũ (không có giờ thực tế) hiện giờ ca; chỉ gửi lên khi người dùng sửa.
  const [work, setWork] = React.useState<WorkTime>(() => ({
    start: hhmm(entry.workStart ?? entry.shiftStart),
    end: hhmm(entry.workEnd ?? entry.shiftEnd),
    dirty: false,
  }));
  const workMinutes = work.dirty ? (work.start && work.end ? workWindowMinutes(work.start, work.end) : null) : entry.shiftMinutes;

  const canApprove = ctx.data?.permissions.approve ?? false;
  const readOnly = entry.locked && !canApprove;
  const p = qtyToPayload(qty);
  const policy = validateEntry(
    { prodDate: entry.prodDate, ...p },
    {
      shiftMinutes: workMinutes ?? entry.shiftMinutes,
      today: ctx.data?.today ?? entry.prodDate,
      backdateDays: 9999,
      canApprove: true,
      ngWarnPct: ctx.data?.site.ngWarnPct ?? 10,
    },
  );
  const reasonOk = !entry.locked || reason.trim().length >= SHIFT_REASON_MIN;
  const canSave = !readOnly && policy.errors.length === 0 && reasonOk && workMinutes != null && !patch.isPending;

  const onSave = async () => {
    try {
      await patch.mutateAsync({
        id: entry.id,
        version: entry.version,
        reason: reason.trim() || null,
        ...p,
        ...(work.dirty ? { workStart: work.start, workEnd: work.end } : {}),
        operatorId,
        operatorName: operatorId ? null : operatorName.trim() || null,
        materialLot: lot.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success("Đã lưu thay đổi");
      onClose();
    } catch (err) {
      if (err instanceof ShiftApiError && err.code === "STALE") {
        toast.error("Dòng vừa được người khác sửa — đã tải lại bản mới.");
        return;
      }
      toast.error((err as Error).message);
    }
  };

  const onDelete = async () => {
    const r = await prompt({
      title: "Xoá dòng này?",
      description: "Xoá mềm — vẫn xem được trong lịch sử sửa.",
      label: "Lý do xoá",
      placeholder: "vd Nhập trùng ca, nhập nhầm máy",
      minLength: SHIFT_REASON_MIN,
      confirmLabel: "Xoá",
      tone: "danger",
    });
    if (!r) return;
    try {
      await del.mutateAsync({ id: entry.id, reason: r, version: entry.version });
      toast.success("Đã xoá dòng");
      onClose();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="space-y-3 p-3 pb-28 sm:p-4">
      <header className="rounded-xl bg-white p-4 pr-12 shadow-xs dark:bg-zinc-900">
        <div className="text-sm text-zinc-500 dark:text-zinc-400">
          {fmtDay(entry.prodDate)} · {entry.shiftName} ({entry.shiftStart.slice(0, 5)}–{entry.shiftEnd.slice(0, 5)})
          {workRangeLabel(entry.workStart, entry.workEnd, entry.shiftStart, entry.shiftEnd)
            ? ` · chạy ${workRangeLabel(entry.workStart, entry.workEnd, entry.shiftStart, entry.shiftEnd)}`
            : ""}
        </div>
        <div className="mt-0.5 text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          {entry.machineCode} · <span className="font-mono">{entry.partCode}</span>
        </div>
        <div className="truncate text-md text-zinc-600 dark:text-zinc-400">{entry.partName}</div>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          {entry.locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-sm font-medium text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> Đã khoá
            </span>
          ) : null}
          {entry.editCount > 0 ? (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-sm font-medium text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
              Đã sửa {entry.editCount} lần
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setHistoryOpen(true)}
            className="inline-flex min-h-9 items-center gap-1 rounded-lg px-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
          >
            <History className="h-4 w-4" aria-hidden="true" /> Lịch sử sửa
          </button>
        </div>
      </header>

      {readOnly ? (
        <div className="rounded-xl bg-zinc-100 px-3.5 py-3 text-md text-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Ca đã khoá. Nhờ quản lý sửa (kèm lý do).
        </div>
      ) : null}

      <fieldset disabled={readOnly} className="space-y-3 disabled:opacity-70">
        <WorkTimeSection
          value={work}
          onChange={setWork}
          shift={{ name: entry.shiftName, startTime: entry.shiftStart, endTime: entry.shiftEnd }}
        />
        {ctx.data ? (
          <QuantitySection
            value={qty}
            onChange={(x) => setQty((s) => ({ ...s, ...x }))}
            defectReasons={ctx.data.defectReasons}
            downtimeReasons={ctx.data.downtimeReasons}
            shiftMinutes={workMinutes ?? entry.shiftMinutes}
            compact
          />
        ) : (
          <Skeleton className="h-48 rounded-xl" />
        )}

        <Panel title="Người phụ trách">
          <div className="flex flex-wrap gap-2">
            {(ctx.data?.operators ?? []).map((o) => (
              <Chip key={o.id} selected={operatorId === o.id} onClick={() => setOperatorId(operatorId === o.id ? null : o.id)}>
                {o.shortName || o.fullName}
              </Chip>
            ))}
          </div>
          {!operatorId ? (
            <TouchInput
              className="mt-2"
              value={operatorName}
              onChange={(e) => setOperatorName(e.target.value)}
              placeholder="Tên khác (không có trong danh mục)"
              aria-label="Tên người phụ trách"
            />
          ) : null}
        </Panel>

        <Panel title="Lô phôi & ghi chú">
          <div className="space-y-2">
            <TouchInput value={lot} onChange={(e) => setLot(e.target.value)} placeholder="Lô phôi" aria-label="Lô phôi" />
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              aria-label="Ghi chú"
              placeholder="Ghi chú"
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[16px] outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950"
            />
          </div>
        </Panel>

        {entry.locked && canApprove ? (
          <Panel title="Lý do sửa dòng đã khoá" hint={`Bắt buộc, tối thiểu ${SHIFT_REASON_MIN} ký tự — ghi vào nhật ký.`}>
            <FieldLabel htmlFor="so-edit-reason">Lý do</FieldLabel>
            <TouchInput id="so-edit-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="vd Thợ báo nhầm số NG" />
          </Panel>
        ) : null}
      </fieldset>

      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-zinc-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 dark:border-zinc-800 dark:bg-zinc-900/95 md:absolute">
        {policy.errors[0] && !readOnly ? (
          <p className="mb-1.5 text-center text-sm font-medium text-red-600 dark:text-red-400">{policy.errors[0].message}</p>
        ) : null}
        <div className="flex gap-2">
          {!readOnly ? (
            <button
              type="button"
              onClick={() => void onDelete()}
              aria-label="Xoá dòng"
              className="inline-flex h-12 items-center justify-center gap-1.5 rounded-xl border border-zinc-200 px-4 text-md font-medium text-red-600 dark:border-zinc-700"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Xoá
            </button>
          ) : null}
          <button
            type="button"
            onClick={readOnly ? onClose : () => void onSave()}
            disabled={!readOnly && !canSave}
            className="h-12 flex-1 rounded-xl bg-indigo-600 text-lg font-semibold text-white disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700"
          >
            {readOnly ? "Đóng" : patch.isPending ? "Đang lưu…" : "Lưu thay đổi"}
          </button>
        </div>
      </div>

      <EntryHistorySheet entryId={historyOpen ? entry.id : null} onClose={() => setHistoryOpen(false)} />
    </div>
  );
}
