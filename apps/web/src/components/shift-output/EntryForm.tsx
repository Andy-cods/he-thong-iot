"use client";

import * as React from "react";
import { CheckCircle2, CloudOff, Copy, Plus, Search, X } from "lucide-react";
import { toast } from "sonner";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { QueryError } from "@/components/ui/query-error";
import { cn } from "@/lib/utils";
import { CONFIRM_WARNING_CODES, validateEntry } from "@/lib/shift-output/policy";
import { addDays, workRangeLabel, workWindowMinutes } from "@/lib/shift-output/shift-window";
import {
  newClientUuid,
  ShiftApiError,
  useCreateSetup,
  useCreateShiftEntry,
  useOfflineQueue,
  useShiftContext,
  useShiftEntries,
  type CatalogItem,
  type EntryPayload,
  type EntryRow,
  type ShiftContext,
} from "@/hooks/useShiftOutput";
import { Chip, FieldLabel, fmtDay, fmtInt, Panel, TouchInput, weekday } from "./primitives";
import { emptyQty, qtyToPayload, QuantitySection, sumValues, type QtyState } from "./QuantitySection";
import { EntryEditSheet } from "./EntryEditSheet";
import { OfflineQueuePanel } from "./OfflineQueuePanel";
import { PartImage } from "./PartImage";
import { WorkTimeSection, workTimeFromShift, type WorkTime } from "./WorkTimeSection";

/**
 * V4.10 (TASK-20261118-001) — màn "Nhập ca" (mặc định cho tài khoản xưởng).
 * Mục tiêu ≤ 30 giây/dòng trên điện thoại: ngày+ca gợi ý sẵn → chạm máy → chạm
 * mã hàng (mã ca trước + 5 mã gần) → chạm tên người → gõ OK/NG → Lưu (nút to
 * cố định đáy). Mất mạng vẫn Lưu được (hàng đợi "Chờ gửi", client_uuid).
 */

interface Slot {
  prodDate: string;
  shiftId: string;
  machineId: string | null;
}

interface Who {
  operatorId: string | null;
  operatorName: string;
  custom: boolean;
}

function machineLabel(m: CatalogItem) {
  return m.code ?? m.name ?? "";
}

export function EntryForm({ siteId }: { siteId: string | null }) {
  const ctxQ = useShiftContext(siteId);
  if (ctxQ.isLoading && !ctxQ.data) {
    return (
      <div className="mx-auto max-w-lg space-y-3 p-4">
        <Skeleton className="h-28 rounded-xl" />
        <Skeleton className="h-24 rounded-xl" />
        <Skeleton className="h-48 rounded-xl" />
      </div>
    );
  }
  if (!ctxQ.data) {
    return (
      <div className="mx-auto max-w-lg p-4">
        <QueryError error={ctxQ.error} onRetry={() => void ctxQ.refetch()} />
      </div>
    );
  }
  return <EntryFormInner ctx={ctxQ.data} stale={ctxQ.isPlaceholderData} />;
}

function EntryFormInner({ ctx, stale }: { ctx: ShiftContext; stale: boolean }) {
  const confirm = useConfirm();
  const queue = useOfflineQueue();
  const create = useCreateShiftEntry();
  const createPart = useCreateSetup("parts");

  const [slot, setSlot] = React.useState<Slot>(() => ({
    prodDate: ctx.suggestion?.prodDate ?? ctx.today,
    shiftId: ctx.suggestion?.shiftId ?? ctx.shifts[0]?.id ?? "",
    machineId: ctx.machines.length === 1 ? ctx.machines[0]!.id : null,
  }));
  const [partId, setPartId] = React.useState<string | null>(null);
  const [who, setWho] = React.useState<Who>({ operatorId: null, operatorName: "", custom: false });
  const [qty, setQty] = React.useState<QtyState>(emptyQty);
  const [lot, setLot] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [showNotes, setShowNotes] = React.useState(false);
  const [partSearch, setPartSearch] = React.useState("");
  const [showAllParts, setShowAllParts] = React.useState(false);
  const [newPart, setNewPart] = React.useState<{ code: string; name: string } | null>(null);
  const [lastSaved, setLastSaved] = React.useState<{ label: string; queued: boolean } | null>(null);
  const [editId, setEditId] = React.useState<string | null>(null);
  const [clientUuid, setClientUuid] = React.useState(newClientUuid);
  const [extraParts, setExtraParts] = React.useState<CatalogItem[]>([]);

  const parts = React.useMemo(() => {
    const ids = new Set(ctx.parts.map((p) => p.id));
    return [...ctx.parts, ...extraParts.filter((p) => !ids.has(p.id))];
  }, [ctx.parts, extraParts]);
  const shift = ctx.shifts.find((s) => s.id === slot.shiftId) ?? null;
  const machine = ctx.machines.find((m) => m.id === slot.machineId) ?? null;
  const part = parts.find((p) => p.id === partId) ?? null;

  // P2 — giờ chạy thực tế: mặc định giờ ca, sửa tay được; ĐỔI CA → về giờ của ca
  // mới (giờ sửa tay thuộc ca cũ). Lưu xong vẫn giữ giờ cho mã kế tiếp cùng ca.
  const [work, setWork] = React.useState<WorkTime>(() => workTimeFromShift(shift));
  const shiftKey = shift ? `${shift.id}|${shift.startTime}|${shift.endTime}` : "";
  const lastShiftKey = React.useRef(shiftKey);
  React.useEffect(() => {
    if (lastShiftKey.current === shiftKey) return;
    lastShiftKey.current = shiftKey;
    setWork(workTimeFromShift(shift));
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ khi đổi ca / giờ ca
  }, [shiftKey]);
  const workMinutes = work.start && work.end ? workWindowMinutes(work.start, work.end) : null;
  const runMinutes = workMinutes ?? shift?.minutes ?? 240;

  // Dòng đã nhập của ngày + ca đang chọn (hiện ngay dưới form, chạm để sửa).
  const slotEntries = useShiftEntries(
    { from: slot.prodDate, to: slot.prodDate, shiftId: slot.shiftId, siteId: ctx.site.id },
    !!slot.shiftId,
  );

  // Gợi ý mã: mã ca trước của máy đang chọn → 5 mã gần nhất.
  const suggestedParts = React.useMemo(() => {
    const ids: string[] = [];
    const last = slot.machineId ? ctx.lastPartByMachine[slot.machineId] : undefined;
    if (last) ids.push(last);
    for (const id of ctx.recentPartIds) if (!ids.includes(id)) ids.push(id);
    return ids
      .map((id) => parts.find((p) => p.id === id))
      .filter((p): p is CatalogItem => !!p)
      .slice(0, 6);
  }, [ctx.lastPartByMachine, ctx.recentPartIds, parts, slot.machineId]);
  const lastPartId = slot.machineId ? ctx.lastPartByMachine[slot.machineId] : undefined;

  const searchHits = React.useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    if (!q && !showAllParts) return [];
    return parts
      .filter(
        (p) =>
          !q ||
          (p.code ?? "").toLowerCase().includes(q) ||
          (p.name ?? "").toLowerCase().includes(q) ||
          (p.drawingNo ?? "").toLowerCase().includes(q),
      )
      .slice(0, 30);
  }, [partSearch, parts, showAllParts]);

  const dates = React.useMemo(() => {
    const out: string[] = [];
    const back = ctx.permissions.approve ? 6 : ctx.site.backdateDays;
    for (let i = 0; i <= back; i += 1) out.push(addDays(ctx.today, -i));
    if (!out.includes(slot.prodDate)) out.push(slot.prodDate);
    return out;
  }, [ctx.today, ctx.site.backdateDays, ctx.permissions.approve, slot.prodDate]);

  const policy = React.useMemo(() => {
    const p = qtyToPayload(qty);
    return validateEntry(
      { prodDate: slot.prodDate, ...p, defects: p.defects, downtimes: p.downtimes },
      {
        shiftMinutes: runMinutes,
        today: ctx.today,
        backdateDays: ctx.site.backdateDays,
        canApprove: ctx.permissions.approve,
        ngWarnPct: ctx.site.ngWarnPct,
        avgOk30: slot.machineId && partId ? (ctx.avgOk30[`${slot.machineId}:${partId}`] ?? null) : null,
      },
    );
  }, [qty, slot, runMinutes, ctx, partId]);

  const missing: string[] = [];
  if (!slot.shiftId) missing.push("ca");
  if (!slot.machineId) missing.push("máy");
  if (!partId) missing.push("mã hàng");
  if (workMinutes == null) missing.push("giờ chạy hợp lệ");
  const blocking = policy.errors.filter((e) => e.code !== "NO_OUTPUT" || qty.qtyOk + qty.qtyNg > 0 || qty.showDowntime);
  const canSave = missing.length === 0 && policy.errors.length === 0;

  const resetForNext = (keepMachine: boolean) => {
    setPartId(null);
    setQty(emptyQty());
    setLot("");
    setNotes("");
    setShowNotes(false);
    setPartSearch("");
    setShowAllParts(false);
    setClientUuid(newClientUuid());
    if (!keepMachine) setSlot((s) => ({ ...s, machineId: ctx.machines.length === 1 ? s.machineId : null }));
  };

  const buildPayload = (): EntryPayload => {
    const p = qtyToPayload(qty);
    return {
      clientUuid,
      siteId: ctx.site.id,
      prodDate: slot.prodDate,
      shiftId: slot.shiftId,
      machineId: slot.machineId!,
      partId: partId!,
      operatorId: who.custom ? null : who.operatorId,
      operatorName: who.custom ? who.operatorName.trim() || null : null,
      ...p,
      workStart: work.start,
      workEnd: work.end,
      materialLot: lot.trim() || null,
      notes: notes.trim() || null,
    };
  };

  const label = () => `${machine ? machineLabel(machine) : "?"} · ${part?.code ?? "?"} · ${shift?.name ?? ""} ${fmtDay(slot.prodDate)}`;

  const saveOffline = (payload: EntryPayload) => {
    queue.add({ clientUuid: payload.clientUuid, payload: payload as unknown as Record<string, unknown>, label: label() });
    setLastSaved({ label: `${label()} · OK ${fmtInt(payload.qtyOk)}`, queued: true });
    toast.message("Đã lưu vào máy — Chờ gửi", { description: "Tự gửi khi có mạng." });
    resetForNext(true);
  };

  const onSave = async () => {
    if (!canSave) return;
    const confirmWarn = policy.warnings.filter((w) => CONFIRM_WARNING_CODES.includes(w.code));
    if (confirmWarn.length > 0) {
      const ok = await confirm({
        title: "Bạn chắc chứ?",
        description: confirmWarn.map((w) => w.message).join(" "),
        confirmLabel: "Đúng, lưu",
        cancelLabel: "Sửa lại",
      });
      if (!ok) return;
    }
    const payload = buildPayload();
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      saveOffline(payload);
      return;
    }
    try {
      const r = await create.mutateAsync(payload);
      setLastSaved({ label: `${label()} · OK ${fmtInt(payload.qtyOk)}${payload.qtyNg ? ` · NG ${payload.qtyNg}` : ""}`, queued: false });
      toast.success(r.replayed ? "Dòng này đã lưu trước đó" : "Đã lưu");
      const unclassified = (r.warnings ?? []).find((w) => w.code === "UNCLASSIFIED_NG");
      if (unclassified) toast.warning(unclassified.message);
      resetForNext(true);
    } catch (err) {
      if (err instanceof ShiftApiError) {
        if (err.code === "DUPLICATE_SLOT") {
          const existingId = (err.details?.existingId as string | undefined) ?? null;
          const open = await confirm({
            title: "Ca này đã có dòng cho mã hàng này",
            description: `${label()} đã được nhập. Mở dòng cũ để sửa / cộng thêm?`,
            confirmLabel: "Mở dòng cũ",
            cancelLabel: "Đóng",
          });
          if (open && existingId) setEditId(existingId);
          return;
        }
        if (err.status >= 500 || err.status === 0) {
          saveOffline(payload);
          return;
        }
        toast.error(err.message);
        return;
      }
      // Lỗi mạng (fetch ném TypeError) → không mất dữ liệu.
      saveOffline(payload);
    }
  };

  // "Sao chép ca trước": lấy dòng của CA LIỀN TRƯỚC (ca trước cùng ngày, hoặc ca
  // cuối hôm trước) trên máy đang chọn → điền sẵn mã, người, KH, số lượng.
  const copyPrevious = async () => {
    const sorted = [...ctx.shifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
    const idx = sorted.findIndex((s) => s.id === slot.shiftId);
    if (idx < 0 || sorted.length === 0) return;
    const prev = idx > 0 ? { date: slot.prodDate, shift: sorted[idx - 1]! } : { date: addDays(slot.prodDate, -1), shift: sorted[sorted.length - 1]! };
    const params = new URLSearchParams({ from: prev.date, to: prev.date, shiftId: prev.shift.id, siteId: ctx.site.id });
    if (slot.machineId) params.set("machineId", slot.machineId);
    try {
      const res = await fetch(`/api/shift-output/entries?${params.toString()}`, { credentials: "include" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const rows = ((await res.json()) as { data: EntryRow[] }).data;
      const src = rows[0];
      if (!src) {
        toast.message(`Không có dòng nào ở ${prev.shift.name} ${fmtDay(prev.date)}${machine ? ` (${machineLabel(machine)})` : ""}`);
        return;
      }
      fillFrom(src);
      toast.success(`Đã chép ${src.machineCode} · ${src.partCode} từ ${prev.shift.name} ${fmtDay(prev.date)} — kiểm lại số rồi Lưu`);
    } catch {
      toast.error("Không tải được ca trước (mất mạng?)");
    }
  };

  const fillFrom = (src: EntryRow) => {
    setSlot((s) => ({ ...s, machineId: src.machineId }));
    setPartId(src.partId);
    setWho(
      src.operatorId
        ? { operatorId: src.operatorId, operatorName: src.operatorName ?? "", custom: false }
        : { operatorId: null, operatorName: src.operatorName ?? "", custom: !!src.operatorName },
    );
    setQty({
      ...emptyQty(),
      qtyOk: src.qtyOk,
      qtyNg: src.qtyNg,
      qtyPlanned: src.qtyPlanned,
      qtyRework: src.qtyRework,
      defects: Object.fromEntries(src.defects.map((d) => [d.reasonId, d.qty])),
      downtimes: Object.fromEntries(src.downtimes.map((d) => [d.reasonId, d.minutes])),
      showDowntime: src.downtimeMin != null,
    });
  };

  const addPart = async () => {
    if (!newPart) return;
    try {
      const r = await createPart.mutateAsync({ code: newPart.code, name: newPart.name || newPart.code, siteId: ctx.site.id });
      setExtraParts((x) => [...x, r.data]);
      setPartId(r.data.id);
      setNewPart(null);
      setPartSearch("");
      toast.success(`Đã thêm mã ${r.data.code}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-lg pb-32">
      <div className="space-y-3 p-3 sm:p-4">
        {stale ? (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
            <CloudOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            Đang dùng danh mục lưu trên máy (chưa tải được bản mới).
          </div>
        ) : null}

        <OfflineQueuePanel queue={queue} />

        {lastSaved ? (
          <div
            role="status"
            className={cn(
              "flex items-start gap-2 rounded-xl px-3.5 py-3 text-md",
              lastSaved.queued
                ? "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
                : "bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200",
            )}
          >
            {lastSaved.queued ? (
              <CloudOff className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
            )}
            <div className="min-w-0 flex-1">
              <div className="font-semibold">{lastSaved.queued ? "Đã lưu trên máy — Chờ gửi" : "Đã lưu"}</div>
              <div className="truncate text-sm opacity-90">{lastSaved.label}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="min-h-11 rounded-lg bg-white px-3 text-md font-medium text-zinc-900 shadow-xs dark:bg-zinc-900 dark:text-zinc-50"
                  onClick={() => {
                    setLastSaved(null);
                    document.getElementById("so-part")?.scrollIntoView({ behavior: "smooth", block: "start" });
                  }}
                >
                  Nhập mã khác cùng ca
                </button>
                <button
                  type="button"
                  className="min-h-11 rounded-lg px-3 text-md font-medium underline-offset-2 hover:underline"
                  onClick={() => {
                    setLastSaved(null);
                    resetForNext(false);
                  }}
                >
                  Máy khác
                </button>
              </div>
            </div>
            <button type="button" aria-label="Đóng" className="-m-1 p-2" onClick={() => setLastSaved(null)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        ) : null}

        <Panel
          title="Ca làm việc"
          right={
            <button
              type="button"
              onClick={() => void copyPrevious()}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2.5 text-md font-medium text-indigo-700 hover:bg-indigo-50 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
            >
              <Copy className="h-4 w-4" aria-hidden="true" /> Sao chép ca trước
            </button>
          }
        >
          <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1">
            {dates.map((d, i) => (
              <Chip
                key={d}
                selected={slot.prodDate === d}
                onClick={() => setSlot((s) => ({ ...s, prodDate: d }))}
                sub={fmtDay(d).slice(0, 5)}
                className="shrink-0"
              >
                {i === 0 ? "Hôm nay" : i === 1 ? "Hôm qua" : weekday(d)}
              </Chip>
            ))}
          </div>
          <div className={cn("grid gap-2", ctx.shifts.length <= 2 ? "grid-cols-2" : "grid-cols-3")}>
            {ctx.shifts.map((s) => (
              <Chip
                key={s.id}
                selected={slot.shiftId === s.id}
                onClick={() => setSlot((x) => ({ ...x, shiftId: s.id }))}
                sub={`${s.startTime}–${s.endTime}`}
                className="w-full"
              >
                {s.name}
              </Chip>
            ))}
          </div>
        </Panel>

        <WorkTimeSection value={work} onChange={setWork} shift={shift} />

        <Panel title="Máy">
          <div className="grid grid-cols-2 gap-2">
            {ctx.machines.map((m) => (
              <Chip
                key={m.id}
                selected={slot.machineId === m.id}
                onClick={() => setSlot((s) => ({ ...s, machineId: m.id }))}
                sub={m.name !== m.code ? m.name : undefined}
                className="w-full"
              >
                {machineLabel(m)}
              </Chip>
            ))}
          </div>
          {ctx.machines.length === 0 ? <p className="text-md text-zinc-500">Chưa có máy — vào Cài đặt để thêm.</p> : null}
        </Panel>

        <div id="so-part" className="scroll-mt-16" />
        <Panel
          title="Mã hàng"
          hint={part ? `${part.code} — ${part.name}` : undefined}
          right={part?.imageAssetId ? <PartImage partId={part.id} assetId={part.imageAssetId} size={56} alt={`${part.code} — ${part.name}`} /> : undefined}
        >
          {suggestedParts.length > 0 ? (
            <div className="mb-3 flex flex-wrap gap-2">
              {suggestedParts.map((p) => (
                <Chip
                  key={p.id}
                  selected={partId === p.id}
                  onClick={() => setPartId(p.id)}
                  sub={p.id === lastPartId ? "ca trước" : p.name}
                  className="max-w-full"
                >
                  <span className="inline-flex items-center gap-2">
                    <PartImage partId={p.id} assetId={p.imageAssetId} size={28} alt={p.code ?? ""} zoomable={false} placeholder={false} />
                    {p.code}
                  </span>
                </Chip>
              ))}
            </div>
          ) : null}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" aria-hidden="true" />
            <TouchInput
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              onFocus={() => setShowAllParts(true)}
              placeholder={`Tìm trong ${parts.length} mã hàng…`}
              className="pl-9"
              aria-label="Tìm mã hàng"
            />
          </div>
          {searchHits.length > 0 ? (
            <ul className="mt-2 max-h-64 divide-y divide-zinc-100 overflow-y-auto rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-700">
              {searchHits.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setPartId(p.id);
                      setPartSearch("");
                      setShowAllParts(false);
                    }}
                    className={cn(
                      "flex min-h-11 w-full items-center gap-2 px-3 text-left text-md hover:bg-zinc-50 dark:hover:bg-zinc-800",
                      partId === p.id && "bg-indigo-50 dark:bg-indigo-950/40",
                    )}
                  >
                    <PartImage partId={p.id} assetId={p.imageAssetId} size={36} alt={p.code ?? ""} zoomable={false} />
                    <span className="font-mono font-semibold">{p.code}</span>
                    <span className="truncate text-zinc-500 dark:text-zinc-400">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          {ctx.permissions.createSetup ? (
            newPart ? (
              <div className="mt-3 space-y-2 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-950">
                <div>
                  <FieldLabel htmlFor="so-newpart-code">Mã hàng mới</FieldLabel>
                  <TouchInput
                    id="so-newpart-code"
                    autoFocus
                    value={newPart.code}
                    onChange={(e) => setNewPart({ ...newPart, code: e.target.value.toUpperCase() })}
                    placeholder="vd TRUC-D20-L85"
                    autoCapitalize="characters"
                  />
                </div>
                <div>
                  <FieldLabel htmlFor="so-newpart-name">Tên / bản vẽ</FieldLabel>
                  <TouchInput
                    id="so-newpart-name"
                    value={newPart.name}
                    onChange={(e) => setNewPart({ ...newPart, name: e.target.value })}
                    placeholder="vd Trục D20 dài 85"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={!newPart.code.trim() || createPart.isPending}
                    onClick={() => void addPart()}
                    className="min-h-11 flex-1 rounded-lg bg-indigo-600 px-3 text-md font-semibold text-white disabled:opacity-50"
                  >
                    {createPart.isPending ? "Đang thêm…" : "Thêm & chọn"}
                  </button>
                  <button type="button" onClick={() => setNewPart(null)} className="min-h-11 rounded-lg px-3 text-md text-zinc-600">
                    Huỷ
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setNewPart({ code: partSearch.trim().toUpperCase(), name: "" })}
                className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-md font-medium text-indigo-700 dark:text-indigo-300"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Thêm mã mới
              </button>
            )
          ) : null}
        </Panel>

        <Panel title="Người phụ trách" hint="Tuỳ chọn">
          <div className="flex flex-wrap gap-2">
            {ctx.operators.map((o) => (
              <Chip
                key={o.id}
                selected={!who.custom && who.operatorId === o.id}
                onClick={() =>
                  setWho((w) =>
                    !w.custom && w.operatorId === o.id
                      ? { operatorId: null, operatorName: "", custom: false }
                      : { operatorId: o.id, operatorName: o.fullName ?? "", custom: false },
                  )
                }
              >
                {o.shortName || o.fullName}
              </Chip>
            ))}
            <Chip selected={who.custom} onClick={() => setWho({ operatorId: null, operatorName: who.operatorName, custom: !who.custom })}>
              + Tên khác
            </Chip>
          </div>
          {who.custom ? (
            <TouchInput
              className="mt-2"
              value={who.operatorName}
              onChange={(e) => setWho({ ...who, operatorName: e.target.value })}
              placeholder="Họ tên người đứng máy"
              aria-label="Tên người phụ trách khác"
            />
          ) : null}
        </Panel>

        <QuantitySection
          value={qty}
          onChange={(p) => setQty((q) => ({ ...q, ...p }))}
          defectReasons={ctx.defectReasons}
          downtimeReasons={ctx.downtimeReasons}
          shiftMinutes={runMinutes}
        />

        <Panel
          title="Lô phôi & ghi chú"
          hint="Tuỳ chọn"
          right={
            <button
              type="button"
              onClick={() => setShowNotes((s) => !s)}
              className="min-h-11 rounded-lg px-3 text-md font-medium text-indigo-700 dark:text-indigo-300"
              aria-expanded={showNotes}
            >
              {showNotes ? "Ẩn" : "Thêm"}
            </button>
          }
        >
          {showNotes ? (
            <div className="space-y-2">
              <TouchInput value={lot} onChange={(e) => setLot(e.target.value)} placeholder="Lô phôi / vật liệu (vd S45C Ø22 lô 2611-03)" aria-label="Lô phôi" />
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                rows={3}
                placeholder="Ghi chú (vd Dao T03 mòn, đã thay)"
                aria-label="Ghi chú"
                className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-[16px] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-950 dark:text-zinc-50"
              />
            </div>
          ) : null}
        </Panel>

        <SlotEntriesList rows={slotEntries.data?.data ?? []} shiftName={shift?.name ?? ""} date={slot.prodDate} onOpen={setEditId} />
      </div>

      {/* Nút Lưu cố định đáy màn hình (vùng ngón cái). */}
      <div className="fixed inset-x-0 bottom-0 z-sticky border-t border-zinc-200 bg-white/95 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur dark:border-zinc-800 dark:bg-zinc-900/95">
        <div className="mx-auto max-w-lg">
          {missing.length > 0 ? (
            <p className="mb-1.5 text-center text-sm text-zinc-500 dark:text-zinc-400">Chọn {missing.join(", ")} để lưu</p>
          ) : blocking.length > 0 ? (
            <p className="mb-1.5 text-center text-sm font-medium text-red-600 dark:text-red-400">{blocking[0]!.message}</p>
          ) : policy.errors.length > 0 ? (
            <p className="mb-1.5 text-center text-sm text-zinc-500 dark:text-zinc-400">Nhập SL OK / NG hoặc ghi dừng máy</p>
          ) : (
            <p className="mb-1.5 truncate text-center text-sm text-zinc-600 dark:text-zinc-300">
              {machine ? machineLabel(machine) : ""} · {part?.code} · OK {fmtInt(qty.qtyOk)}
              {qty.qtyNg ? ` · NG ${qty.qtyNg}` : ""}
              {sumValues(qty.downtimes) ? ` · dừng ${sumValues(qty.downtimes)}'` : ""}
            </p>
          )}
          <button
            type="button"
            onClick={() => void onSave()}
            disabled={!canSave || create.isPending}
            className="h-14 w-full rounded-xl bg-indigo-600 text-xl font-semibold text-white transition-colors active:bg-indigo-800 disabled:bg-zinc-300 disabled:text-zinc-500 dark:disabled:bg-zinc-700 dark:disabled:text-zinc-400"
          >
            {create.isPending ? "Đang lưu…" : queue.online ? "Lưu" : "Lưu (chưa có mạng)"}
          </button>
        </div>
      </div>

      <EntryEditSheet entryId={editId} onClose={() => setEditId(null)} />
    </div>
  );
}

function SlotEntriesList({
  rows,
  shiftName,
  date,
  onOpen,
}: {
  rows: EntryRow[];
  shiftName: string;
  date: string;
  onOpen: (id: string) => void;
}) {
  if (rows.length === 0) return null;
  return (
    <Panel title={`Đã nhập ${shiftName} · ${fmtDay(date)}`} hint="Chạm để sửa">
      <ul className="-mx-1 divide-y divide-zinc-100 dark:divide-zinc-800">
        {rows.map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="flex min-h-12 w-full items-center gap-3 rounded-lg px-1 text-left hover:bg-zinc-50 dark:hover:bg-zinc-800"
            >
              <span className="w-16 shrink-0 font-mono text-sm font-semibold text-zinc-700 dark:text-zinc-300">{r.machineCode}</span>
              <span className="min-w-0 flex-1 truncate text-md">
                {r.partCode}
                {workRangeLabel(r.workStart, r.workEnd, r.shiftStart, r.shiftEnd) ? (
                  <span className="ml-1.5 text-sm text-zinc-500">{workRangeLabel(r.workStart, r.workEnd, r.shiftStart, r.shiftEnd)}</span>
                ) : null}
              </span>
              <span className="shrink-0 text-md tabular-nums">
                <span className="font-semibold text-zinc-900 dark:text-zinc-50">{fmtInt(r.qtyOk)}</span>
                {r.qtyNg ? <span className="ml-1.5 text-red-600 dark:text-red-400">NG {r.qtyNg}</span> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Panel>
  );
}
