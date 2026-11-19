"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Lock } from "lucide-react";
import { toast } from "sonner";
import { SHIFT_LIST_MAX_DAYS } from "@iot/shared";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { QueryError } from "@/components/ui/query-error";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { addDays, diffDays } from "@/lib/shift-output/shift-window";
import { useLockShift, useShiftContext, useShiftEntries, type EntryRow } from "@/hooks/useShiftOutput";
import { fmtDay, fmtInt, fmtPct } from "./primitives";
import { EntryEditSheet } from "./EntryEditSheet";
import { EntryHistorySheet } from "./EntryHistorySheet";

/**
 * V4.10 — "Lịch sử": lọc ngày (≤ 31 ngày) / ca / máy / mã hàng / người; bảng
 * (thẻ trên điện thoại); "Đã sửa N lần" → lịch sử; sửa / xoá mềm; Chốt ca/ngày
 * (cần quyền duyệt).
 */
const selectCls =
  "h-11 w-full rounded-lg border border-zinc-200 bg-white px-3 text-[16px] text-zinc-900 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 md:h-9 md:text-md";

export function HistoryView({ siteId }: { siteId: string | null }) {
  const sp = useSearchParams();
  const ctx = useShiftContext(siteId);
  const today = ctx.data?.today;
  const [from, setFrom] = React.useState<string>(sp?.get("from") ?? "");
  const [to, setTo] = React.useState<string>(sp?.get("to") ?? "");
  const [shiftId, setShiftId] = React.useState(sp?.get("shiftId") ?? "");
  const [machineId, setMachineId] = React.useState(sp?.get("machineId") ?? "");
  const [partId, setPartId] = React.useState(sp?.get("partId") ?? "");
  const [operatorId, setOperatorId] = React.useState("");
  const [editId, setEditId] = React.useState<string | null>(null);
  const [historyId, setHistoryId] = React.useState<string | null>(null);
  const confirm = useConfirm();
  const lock = useLockShift();

  React.useEffect(() => {
    if (!today) return;
    if (!to) setTo(today);
    if (!from) setFrom(addDays(today, -6));
  }, [today, from, to]);

  const span = from && to ? diffDays(from, to) + 1 : 0;
  const rangeOk = span > 0 && span <= SHIFT_LIST_MAX_DAYS;
  const q = useShiftEntries(
    {
      from,
      to,
      shiftId: shiftId || undefined,
      machineId: machineId || undefined,
      partId: partId || undefined,
      operatorId: operatorId || undefined,
      siteId: ctx.data?.site.id,
    },
    rangeOk && !!ctx.data,
  );
  const rows = q.data?.data ?? [];
  const totals = rows.reduce((a, r) => ({ ok: a.ok + r.qtyOk, ng: a.ng + r.qtyNg }), { ok: 0, ng: 0 });

  const columns: DataTableColumn<EntryRow>[] = [
    {
      id: "date",
      header: "Ngày · Ca",
      kind: "date",
      mobile: "primary",
      cell: (r) => (
        <span>
          <span className="font-medium">{fmtDay(r.prodDate)}</span> <span className="text-zinc-500">{r.shiftName}</span>
        </span>
      ),
    },
    { id: "machine", header: "Máy", kind: "code", cell: (r) => r.machineCode },
    {
      id: "part",
      header: "Mã hàng",
      cell: (r) => (
        <span className="block min-w-0">
          <span className="font-mono font-medium">{r.partCode}</span>
          <span className="block truncate text-sm text-zinc-500">{r.partName}</span>
        </span>
      ),
    },
    { id: "op", header: "Người", cell: (r) => r.operatorName ?? "—", hideBelowLg: true },
    { id: "plan", header: "KH", kind: "number", cell: (r) => fmtInt(r.qtyPlanned), hideBelowLg: true },
    { id: "ok", header: "OK", kind: "number", cell: (r) => <span className="font-semibold">{fmtInt(r.qtyOk)}</span>, footer: fmtInt(totals.ok) },
    {
      id: "ng",
      header: "NG",
      kind: "number",
      cell: (r) => <span className={r.qtyNg ? "text-red-600 dark:text-red-400" : undefined}>{fmtInt(r.qtyNg)}</span>,
      footer: fmtInt(totals.ng),
    },
    {
      id: "ngpct",
      header: "%NG",
      kind: "number",
      cell: (r) => fmtPct(r.qtyOk + r.qtyNg > 0 ? (r.qtyNg / (r.qtyOk + r.qtyNg)) * 100 : null),
      hideBelowLg: true,
    },
    { id: "dt", header: "Dừng", kind: "number", cell: (r) => (r.downtimeMin == null ? "—" : `${r.downtimeMin}'`) },
    {
      id: "status",
      header: "Trạng thái",
      kind: "status",
      mobile: "status",
      cell: (r) => (
        <span className="inline-flex flex-wrap items-center justify-end gap-1">
          {r.locked ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-0.5 text-sm text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
              <Lock className="h-3 w-3" aria-hidden="true" /> Khoá
            </span>
          ) : null}
          {r.editCount > 0 ? (
            <button
              type="button"
              onClick={() => setHistoryId(r.id)}
              className="rounded-full bg-amber-50 px-2 py-0.5 text-sm font-medium text-amber-800 hover:bg-amber-100 dark:bg-amber-950/40 dark:text-amber-300"
            >
              Đã sửa {r.editCount} lần
            </button>
          ) : null}
        </span>
      ),
    },
  ];

  const onLock = async () => {
    if (!from) return;
    const shift = ctx.data?.shifts.find((s) => s.id === shiftId);
    const day = to || from;
    const ok = await confirm({
      title: shift ? `Chốt ${shift.name} ngày ${fmtDay(day)}?` : `Chốt cả ngày ${fmtDay(day)}?`,
      description: "Sau khi chốt, tài khoản xưởng không sửa được nữa. Quản lý vẫn sửa được (bắt buộc ghi lý do).",
      confirmLabel: "Chốt",
    });
    if (!ok) return;
    try {
      const r = await lock.mutateAsync({ prodDate: day, shiftId: shift?.id ?? null, siteId: ctx.data?.site.id });
      toast.success(`Đã chốt ${r.data.locked} dòng`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-3 p-3 sm:p-4 lg:p-6">
      <div className="grid grid-cols-2 gap-2 rounded-xl bg-white p-3 shadow-xs dark:bg-zinc-900 md:grid-cols-6">
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Từ ngày
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={selectCls} />
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Đến ngày
          <input type="date" value={to} min={from || undefined} max={today} onChange={(e) => setTo(e.target.value)} className={selectCls} />
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Ca
          <select value={shiftId} onChange={(e) => setShiftId(e.target.value)} className={selectCls}>
            <option value="">Tất cả</option>
            {ctx.data?.shifts.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Máy
          <select value={machineId} onChange={(e) => setMachineId(e.target.value)} className={selectCls}>
            <option value="">Tất cả</option>
            {ctx.data?.machines.map((m) => (
              <option key={m.id} value={m.id}>
                {m.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Mã hàng
          <select value={partId} onChange={(e) => setPartId(e.target.value)} className={selectCls}>
            <option value="">Tất cả</option>
            {ctx.data?.parts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-zinc-600 dark:text-zinc-400">
          Người
          <select value={operatorId} onChange={(e) => setOperatorId(e.target.value)} className={selectCls}>
            <option value="">Tất cả</option>
            {ctx.data?.operators.map((o) => (
              <option key={o.id} value={o.id}>
                {o.fullName}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p className="text-md text-zinc-600 dark:text-zinc-400">
          {rangeOk ? (
            <>
              {rows.length} dòng · OK <strong className="text-zinc-900 dark:text-zinc-50">{fmtInt(totals.ok)}</strong> · NG{" "}
              <strong className="text-red-600 dark:text-red-400">{fmtInt(totals.ng)}</strong>
              {q.data?.meta.truncated ? " · chỉ hiện 200 dòng đầu, thu hẹp bộ lọc" : ""}
            </>
          ) : span > SHIFT_LIST_MAX_DAYS ? (
            <span className="text-red-600">Chỉ xem tối đa {SHIFT_LIST_MAX_DAYS} ngày một lần.</span>
          ) : null}
        </p>
        {ctx.data?.permissions.approve ? (
          <button
            type="button"
            onClick={() => void onLock()}
            disabled={lock.isPending || !from}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-zinc-300 bg-white px-3 text-md font-medium text-zinc-900 hover:bg-zinc-50 disabled:opacity-60 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50 md:min-h-9"
            title="Chốt ca đang lọc (hoặc cả ngày 'Đến ngày' nếu chưa chọn ca)"
          >
            <Lock className="h-4 w-4" aria-hidden="true" />
            {shiftId ? "Chốt ca" : "Chốt ngày"} {to ? fmtDay(to) : ""}
          </button>
        ) : null}
      </div>

      {q.isError ? (
        <QueryError error={q.error} onRetry={() => void q.refetch()} />
      ) : !q.isLoading && rows.length === 0 && rangeOk ? (
        <EmptyState preset="no-filter-match" title="Không có dòng nào" description="Đổi khoảng ngày hoặc bộ lọc." />
      ) : (
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(r) => r.id}
          loading={q.isLoading || !ctx.data}
          onRowClick={(r) => setEditId(r.id)}
          ariaLabel="Lịch sử sản lượng ca"
          minWidth={900}
        />
      )}

      <EntryEditSheet entryId={editId} onClose={() => setEditId(null)} />
      <EntryHistorySheet entryId={historyId} onClose={() => setHistoryId(null)} />
    </div>
  );
}
