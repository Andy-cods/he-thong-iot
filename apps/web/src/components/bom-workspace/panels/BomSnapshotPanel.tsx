"use client";

import * as React from "react";
import Link from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  BOM_SNAPSHOT_STATES,
  BOM_SNAPSHOT_STATE_LABELS,
  BOM_SNAPSHOT_STATE_TONES,
  type BomSnapshotState,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useBomSnapshotLines } from "@/hooks/useBom";
import { qk } from "@/lib/query-keys";
import { formatNumber } from "@/lib/format";

/**
 * V2.0 P2 W6 — TASK-20260427-013 / TASK-20260427-015.
 *
 * BomSnapshotPanel — list snapshot lines của TẤT CẢ orders dùng BOM này.
 *
 * V2.0 P2 W6 enhancement:
 *  - Checkbox multi-select rows.
 *  - Toolbar action "Transition trạng thái" (chỉ visible khi có row select)
 *    → mở dialog chọn newState + actionNote → loop sequential fetch
 *    PATCH /api/snapshot-lines/{id}/transition (chưa có batch endpoint).
 */
export function BomSnapshotPanel({ bomId }: { bomId: string }) {
  const qc = useQueryClient();
  const [snapQ, setSnapQ] = React.useState("");
  const [orderQ, setOrderQ] = React.useState("");
  const [states, setStates] = React.useState<BomSnapshotState[]>([]);
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(
    () => new Set(),
  );
  const [transitionOpen, setTransitionOpen] = React.useState(false);

  const filter = React.useMemo(
    () => ({
      q: snapQ.trim().length > 0 ? snapQ.trim() : undefined,
      orderCode: orderQ.trim().length > 0 ? orderQ.trim() : undefined,
      state: states.length > 0 ? states : undefined,
      page: 1,
      pageSize: 500,
    }),
    [snapQ, orderQ, states],
  );

  const query = useBomSnapshotLines(bomId, filter);
  const rows = query.data?.data ?? [];
  const byState = query.data?.meta.byState ?? [];
  const total = query.data?.meta.total ?? 0;

  // Reset selection khi filter / data change.
  React.useEffect(() => {
    setSelectedIds((prev) => {
      const visible = new Set(rows.map((r) => r.id));
      const next = new Set<string>();
      for (const id of prev) {
        if (visible.has(id)) next.add(id);
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows.length, snapQ, orderQ, states.join(",")]);

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === rows.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(rows.map((r) => r.id)));
    }
  };

  const selectedRows = React.useMemo(
    () => rows.filter((r) => selectedIds.has(r.id)),
    [rows, selectedIds],
  );

  if (query.isLoading && rows.length === 0) {
    return (
      <div className="space-y-1 p-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (total === 0 && !query.isLoading) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-xs text-zinc-500">
        Chưa có snapshot nào cho BOM này.
        <p className="text-[11px] text-zinc-400">
          Mỗi đơn hàng cần explode BOM để sinh snapshot lines tại tab Snapshot
          Board của đơn.
        </p>
      </div>
    );
  }

  const stateMap = new Map(byState.map((s) => [s.state, s.count]));
  const allChecked = rows.length > 0 && selectedIds.size === rows.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < rows.length;

  return (
    <div className="flex h-full flex-col">
      {/* Filter bar */}
      <div className="flex flex-wrap items-center gap-2 border-b border-zinc-200 bg-zinc-50/60 px-3 py-2">
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={snapQ}
            onChange={(e) => setSnapQ(e.target.value)}
            placeholder="Tìm SKU / tên..."
            className="h-7 w-48 pl-6 text-xs"
          />
        </div>
        <div className="relative">
          <Search
            className="absolute left-2 top-1/2 h-3 w-3 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <Input
            value={orderQ}
            onChange={(e) => setOrderQ(e.target.value)}
            placeholder="Mã đơn..."
            className="h-7 w-32 pl-6 text-xs"
          />
        </div>
        <div className="flex flex-wrap gap-1">
          {BOM_SNAPSHOT_STATES.map((s) => {
            const count = stateMap.get(s) ?? 0;
            if (count === 0) return null;
            const active = states.includes(s);
            const tone = BOM_SNAPSHOT_STATE_TONES[s];
            const toneClass = stateToneClass(tone);
            return (
              <button
                key={s}
                type="button"
                onClick={() =>
                  setStates((prev) =>
                    prev.includes(s)
                      ? prev.filter((x) => x !== s)
                      : [...prev, s],
                  )
                }
                className={cn(
                  "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-[11px] font-medium transition-colors",
                  toneClass,
                  active && "ring-2 ring-blue-500 ring-offset-1",
                )}
                aria-pressed={active}
              >
                <span>{BOM_SNAPSHOT_STATE_LABELS[s]}</span>
                <span className="tabular-nums">{count}</span>
              </button>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-2">
          {selectedIds.size > 0 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setTransitionOpen(true)}
            >
              Transition trạng thái ({selectedIds.size})
            </Button>
          ) : null}
          <span className="text-[10px] uppercase tracking-wide text-zinc-500">
            {rows.length} / {total} line
          </span>
        </div>
      </div>

      {/* Table */}
      <div className="flex-1 overflow-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 z-10 bg-zinc-50/80 backdrop-blur-sm">
            <tr className="border-b border-zinc-200 text-[10px] uppercase tracking-wide text-zinc-500">
              <th className="w-8 px-2 py-1.5 text-center">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                  checked={allChecked}
                  ref={(el) => {
                    if (el) el.indeterminate = someChecked;
                  }}
                  onChange={toggleAll}
                  aria-label="Chọn tất cả lines hiển thị"
                />
              </th>
              <th className="px-3 py-1.5 text-left font-medium">Đơn</th>
              <th className="px-3 py-1.5 text-center font-medium">L</th>
              <th className="px-3 py-1.5 text-left font-medium">SKU</th>
              <th className="px-3 py-1.5 text-left font-medium">Tên</th>
              <th className="px-3 py-1.5 text-right font-medium">Gross</th>
              <th className="px-3 py-1.5 text-right font-medium">QC</th>
              <th className="px-3 py-1.5 text-right font-medium">Issued</th>
              <th className="px-3 py-1.5 text-right font-medium text-red-600">
                Thiếu
              </th>
              <th className="px-3 py-1.5 text-left font-medium">Trạng thái</th>
              <th className="px-3 py-1.5 w-8" />
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {rows.map((r) => {
              const tone = BOM_SNAPSHOT_STATE_TONES[r.state];
              const toneClass = stateToneClass(tone);
              const shortage =
                r.remainingShortQty !== null
                  ? Number(r.remainingShortQty)
                  : 0;
              const checked = selectedIds.has(r.id);
              return (
                <tr
                  key={r.id}
                  className={cn(
                    "h-8",
                    checked ? "bg-indigo-50/60" : "hover:bg-zinc-50",
                  )}
                >
                  <td className="px-2 text-center">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                      checked={checked}
                      onChange={() => toggleRow(r.id)}
                      aria-label={`Chọn line ${r.componentSku}`}
                    />
                  </td>
                  <td className="px-3 font-mono text-[11px] font-semibold text-indigo-600">
                    <Link
                      href={`/orders/${r.orderNo}`}
                      className="hover:underline"
                      title={`Mở đơn ${r.orderNo}`}
                    >
                      {r.orderNo}
                    </Link>
                  </td>
                  <td className="px-3 text-center text-[10px] text-zinc-500">
                    {r.level}
                  </td>
                  <td className="px-3 font-mono text-[11px] font-semibold text-zinc-700">
                    {r.componentSku}
                  </td>
                  <td
                    className="max-w-[280px] truncate px-3 text-zinc-700"
                    title={r.componentName}
                  >
                    {r.componentName}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-700">
                    {formatNumber(Number(r.grossRequiredQty))}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-emerald-700">
                    {formatNumber(Number(r.qcPassQty))}
                  </td>
                  <td className="px-3 text-right font-mono tabular-nums text-zinc-600">
                    {formatNumber(Number(r.issuedQty))}
                  </td>
                  <td
                    className={cn(
                      "px-3 text-right font-mono tabular-nums",
                      shortage > 0
                        ? "font-semibold text-red-600"
                        : "text-zinc-300",
                    )}
                  >
                    {shortage > 0 ? formatNumber(shortage) : "—"}
                  </td>
                  <td className="px-3">
                    <span
                      className={cn(
                        "inline-flex h-5 items-center rounded-sm border px-1.5 text-[10px] font-medium",
                        toneClass,
                      )}
                    >
                      {BOM_SNAPSHOT_STATE_LABELS[r.state]}
                    </span>
                  </td>
                  <td className="px-1">
                    <Link
                      href={`/orders/${r.orderNo}?tab=snapshot`}
                      className="inline-flex h-6 w-6 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600"
                      title="Mở snapshot ở đơn hàng"
                    >
                      <ExternalLink className="h-3 w-3" aria-hidden />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <BulkTransitionDialog
        open={transitionOpen}
        onOpenChange={setTransitionOpen}
        selectedRows={selectedRows}
        onSuccess={() => {
          setSelectedIds(new Set());
          qc.invalidateQueries({
            queryKey: ["bom", "snapshot-lines", bomId],
          });
          qc.invalidateQueries({ queryKey: qk.snapshots.all });
        }}
      />
    </div>
  );
}

function stateToneClass(tone: string): string {
  switch (tone) {
    case "success":
      return "border-emerald-200 bg-emerald-50 text-emerald-700";
    case "warning":
      return "border-amber-200 bg-amber-50 text-amber-700";
    case "danger":
      return "border-red-200 bg-red-50 text-red-700";
    case "info":
      return "border-blue-200 bg-blue-50 text-blue-700";
    case "shortage":
      return "border-orange-200 bg-orange-50 text-orange-700";
    default:
      return "border-zinc-200 bg-zinc-100 text-zinc-700";
  }
}

interface SelectedRow {
  id: string;
  versionLock: number;
  componentSku: string;
  state: BomSnapshotState;
}

function BulkTransitionDialog({
  open,
  onOpenChange,
  selectedRows,
  onSuccess,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  selectedRows: SelectedRow[];
  onSuccess: () => void;
}) {
  const [toState, setToState] = React.useState<BomSnapshotState>("AVAILABLE");
  const [note, setNote] = React.useState("");
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setToState("AVAILABLE");
      setNote("");
      setPending(false);
    }
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (note.trim().length < 3) {
      toast.error("Ghi chú tối thiểu 3 ký tự.");
      return;
    }
    setPending(true);
    let success = 0;
    let failed = 0;
    // Sequential: tránh race với BE optimistic lock + tránh server overload.
    // Chưa có batch endpoint → đây là gap (note vào output report).
    for (const row of selectedRows) {
      try {
        const res = await fetch(
          `/api/snapshot-lines/${row.id}/transition`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              toState,
              actionNote: note.trim(),
              versionLock: row.versionLock,
            }),
          },
        );
        if (res.ok) success += 1;
        else failed += 1;
      } catch {
        failed += 1;
      }
    }
    setPending(false);
    if (failed === 0) {
      toast.success(`Đã transition ${success} line sang ${toState}.`);
      onOpenChange(false);
      onSuccess();
    } else if (success === 0) {
      toast.error(
        `Tất cả ${failed} line transition thất bại — có thể do versionLock cũ hoặc state transition không hợp lệ.`,
      );
    } else {
      toast.warning(
        `${success} thành công, ${failed} thất bại. Refresh để xem trạng thái mới.`,
      );
      onOpenChange(false);
      onSuccess();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="md">
        <DialogHeader>
          <DialogTitle className="text-[15px]">
            Transition {selectedRows.length} line snapshot
          </DialogTitle>
          <DialogDescription className="text-xs text-zinc-500">
            Đổi trạng thái cho {selectedRows.length} dòng đã chọn. Lưu ý: API
            backend chỉ hỗ trợ per-line — dialog này gọi tuần tự, một số line có
            thể từ chối nếu transition không hợp lệ (vd PLANNED → ASSEMBLED).
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="bts-state" required>
              Trạng thái mới
            </Label>
            <select
              id="bts-state"
              value={toState}
              onChange={(e) =>
                setToState(e.target.value as BomSnapshotState)
              }
              className="flex h-9 w-full items-center rounded-md border border-zinc-200 bg-white px-3 text-[13px] text-zinc-900 focus:border-indigo-500 focus:outline-none"
            >
              {BOM_SNAPSHOT_STATES.map((s) => (
                <option key={s} value={s}>
                  {BOM_SNAPSHOT_STATE_LABELS[s]} ({s})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <Label htmlFor="bts-note" required>
              Ghi chú (≥ 3 ký tự)
            </Label>
            <Textarea
              id="bts-note"
              rows={3}
              maxLength={500}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Lý do transition..."
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Huỷ
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              ) : null}
              Áp dụng cho {selectedRows.length} line
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
