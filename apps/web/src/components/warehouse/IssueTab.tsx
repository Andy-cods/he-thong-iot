"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  Loader2,
  Package,
  Plus,
  Search,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * V3.7.14 — Tab "Xuất hàng" — redesign đơn giản theo feedback user 2026-04-30.
 *
 * Workflow:
 *   1. Pending requests panel (yêu cầu từ Gia công) — Kho duyệt 1-click
 *   2. Form xuất nhanh: list SKU + qty (không pick editor — auto FIFO)
 *   3. Submit → server auto FIFO → tạo OUT_ISSUE
 */

interface ItemRef {
  id: string;
  sku: string;
  name: string;
  uom: string;
  totalQty: number;
}

interface IssueLine {
  rowId: string;
  item: ItemRef | null;
  qty: string;
}

const REASONS = [
  { value: "production", label: "Sản xuất (WO)" },
  { value: "sales", label: "Bán hàng (SO)" },
  { value: "manual", label: "Xuất thủ công" },
  { value: "loss", label: "Hao hụt / hỏng" },
  { value: "return", label: "Trả NCC" },
  { value: "other", label: "Khác" },
] as const;

type Reason = (typeof REASONS)[number]["value"];

function uuid() {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function IssueTab() {
  const qc = useQueryClient();
  const [lines, setLines] = React.useState<IssueLine[]>([
    { rowId: uuid(), item: null, qty: "" },
  ]);
  const [reason, setReason] = React.useState<Reason>("manual");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const validLines = lines.filter((l) => l.item && Number(l.qty) > 0);
  const totalLines = validLines.length;
  const totalQty = validLines.reduce((s, l) => s + Number(l.qty), 0);
  const totalShortage = validLines.reduce((s, l) => {
    const need = Number(l.qty);
    const have = l.item?.totalQty ?? 0;
    return s + Math.max(0, need - have);
  }, 0);

  const addLine = () =>
    setLines((p) => [...p, { rowId: uuid(), item: null, qty: "" }]);
  const removeLine = (rowId: string) =>
    setLines((p) => p.filter((l) => l.rowId !== rowId));
  const updateLine = (rowId: string, patch: Partial<IssueLine>) =>
    setLines((p) =>
      p.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)),
    );

  const handleSubmit = async () => {
    if (validLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng SKU + qty.");
      return;
    }
    if (totalShortage > 0) {
      const ok = window.confirm(
        `⚠ Thiếu tồn ${totalShortage} đơn vị. Vẫn xuất phần có sẵn?`,
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      // Step 1: gọi FIFO cho từng line để có picks
      const allLines: Array<{
        itemId: string;
        picks: Array<{ lotSerialId: string; binId: string; qty: number }>;
      }> = [];
      for (const l of validLines) {
        const fifoRes = await fetch("/api/warehouse/fifo-pick", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemId: l.item!.id, qty: Number(l.qty) }),
        });
        const fifoJson = (await fifoRes.json()) as {
          data?: {
            picks: Array<{
              lotSerialId: string;
              binId: string;
              qty: number;
            }>;
          };
        };
        if (!fifoRes.ok || !fifoJson.data) {
          toast.error(`Không pick FIFO được cho ${l.item!.sku}`);
          return;
        }
        if (fifoJson.data.picks.length === 0) {
          toast.error(`SKU ${l.item!.sku} không có tồn AVAILABLE.`);
          return;
        }
        allLines.push({
          itemId: l.item!.id,
          picks: fifoJson.data.picks.map((p) => ({
            lotSerialId: p.lotSerialId,
            binId: p.binId,
            qty: p.qty,
          })),
        });
      }

      // Step 2: gửi issue
      const res = await fetch("/api/warehouse/issue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          lines: allLines,
        }),
      });
      const json = (await res.json()) as {
        data?: { txnIds: string[]; totalQty: number; consumedLots: number };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi xuất hàng");
        return;
      }
      toast.success(
        `Đã xuất ${json.data.totalQty} qty từ ${json.data.txnIds.length} bin · ${totalLines} SKU.`,
      );
      void qc.invalidateQueries({ queryKey: ["warehouse"] });
      // Reset
      setLines([{ rowId: uuid(), item: null, qty: "" }]);
      setReference("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto bg-gradient-to-br from-zinc-50 to-rose-50/30 p-3 sm:p-6 dark:from-zinc-950 dark:to-zinc-900">
      {/* HEADER */}
      <header className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-rose-500 to-pink-600 shadow-lg shadow-rose-200">
            <Truck className="h-6 w-6 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
              Xuất hàng
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500 dark:text-zinc-400">
              Kho xuất ngay (auto FIFO) · duyệt yêu cầu từ Gia công
            </p>
          </div>
        </div>
        {totalLines > 0 && (
          <div className="hidden items-center gap-2 lg:flex">
            <Stat label="Số SKU" value={String(totalLines)} />
            <Stat
              label="Tổng SL"
              value={totalQty.toLocaleString("vi-VN")}
              tone="emerald"
            />
            {totalShortage > 0 && (
              <Stat
                label="Thiếu"
                value={totalShortage.toLocaleString("vi-VN")}
                tone="amber"
              />
            )}
          </div>
        )}
      </header>

      {/* PENDING REQUESTS — Kho duyệt yêu cầu từ Gia công */}
      <PendingRequestsPanel />

      {/* QUICK ISSUE FORM — đơn giản */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <Package className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">Xuất nhanh</h3>
          <span className="text-xs text-zinc-500 dark:text-zinc-400">
            · Hệ thống tự pick FIFO (lô cũ trước)
          </span>
        </header>

        <div className="p-5">
          {/* Lines */}
          <div className="space-y-2">
            {lines.map((line, idx) => (
              <SimpleLineRow
                key={line.rowId}
                line={line}
                index={idx}
                onUpdate={(p) => updateLine(line.rowId, p)}
                onRemove={() => removeLine(line.rowId)}
                disabled={submitting}
                removable={lines.length > 1}
              />
            ))}
          </div>

          <button
            type="button"
            onClick={addLine}
            disabled={submitting}
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-rose-400 hover:bg-rose-50/50 hover:text-rose-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-rose-500 dark:hover:bg-rose-950/30 dark:hover:text-rose-400"
          >
            <Plus className="h-3.5 w-3.5" />
            Thêm dòng
          </button>

          {/* Meta */}
          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Lý do
              </label>
              <select
                value={reason}
                onChange={(e) => setReason(e.target.value as Reason)}
                disabled={submitting}
                className="mt-1.5 block h-10 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
              >
                {REASONS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Chứng từ tham chiếu
              </label>
              <Input
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                placeholder="VD: WO-2026-001 · SO-..."
                className="mt-1.5 h-10 font-mono"
                disabled={submitting}
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
                Ghi chú
              </label>
              <Input
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Tuỳ chọn..."
                className="mt-1.5 h-10"
                disabled={submitting}
              />
            </div>
          </div>

          {/* Submit */}
          <div className="mt-5 flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
            <div className="text-xs text-zinc-600 dark:text-zinc-400">
              {totalLines === 0 ? (
                "Chưa có dòng nào để xuất."
              ) : totalShortage > 0 ? (
                <span className="text-amber-700 dark:text-amber-400">
                  ⚠ Thiếu {totalShortage} đơn vị, vẫn xuất phần có sẵn.
                </span>
              ) : (
                <span className="text-emerald-700 dark:text-emerald-400">
                  ✓ Đủ tồn cho {totalLines} SKU · tổng {totalQty.toLocaleString("vi-VN")} qty.
                </span>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || totalLines === 0}
              className="h-10 bg-gradient-to-r from-rose-500 to-pink-600 px-5 text-sm font-bold shadow-md hover:from-rose-600 hover:to-pink-700"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Đang xuất…
                </>
              ) : (
                <>
                  <Truck className="h-4 w-4" />
                  Xuất hàng ngay
                </>
              )}
            </Button>
          </div>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* SimpleLineRow — 1 dòng đơn giản: SKU + qty                   */
/* ============================================================ */

function SimpleLineRow({
  line,
  index,
  onUpdate,
  onRemove,
  disabled,
  removable,
}: {
  line: IssueLine;
  index: number;
  onUpdate: (patch: Partial<IssueLine>) => void;
  onRemove: () => void;
  disabled: boolean;
  removable: boolean;
}) {
  const need = Number(line.qty);
  const have = line.item?.totalQty ?? 0;
  const shortage = Math.max(0, need - have);
  const ok = line.item && need > 0 && shortage === 0;

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-xl border bg-white p-2.5 transition-all dark:bg-zinc-900",
        ok && "border-emerald-300 bg-emerald-50/30 dark:border-emerald-800 dark:bg-emerald-950/40",
        shortage > 0 && "border-amber-300 bg-amber-50/30 dark:border-amber-800 dark:bg-amber-950/40",
        !line.item && "border-zinc-200 dark:border-zinc-700",
      )}
    >
      <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
        {index + 1}
      </span>
      <div className="grid flex-1 grid-cols-1 gap-2 md:grid-cols-[1fr_140px]">
        <ItemPicker
          value={line.item}
          onChange={(v) => onUpdate({ item: v })}
          disabled={disabled}
        />
        <div className="flex items-center gap-1">
          <Input
            type="number"
            min={0}
            step={0.0001}
            value={line.qty}
            onChange={(e) => onUpdate({ qty: e.target.value })}
            placeholder="SL"
            className="h-10 text-right tabular-nums"
            disabled={disabled || !line.item}
          />
          {line.item && (
            <span className="text-[10px] text-zinc-500 whitespace-nowrap dark:text-zinc-400">
              {line.item.uom}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        {line.item && need > 0 && (
          <>
            {ok ? (
              <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 font-medium text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400">
                <CheckCircle2 className="h-3 w-3" />
                Đủ
              </span>
            ) : (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.5 font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                <AlertCircle className="h-3 w-3" />
                Thiếu {shortage}
              </span>
            )}
          </>
        )}
        {line.item && (
          <span
            className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] text-zinc-500 dark:text-zinc-400"
            title={`Tồn: ${have} ${line.item.uom}`}
          >
            tồn {have.toLocaleString("vi-VN")}
          </span>
        )}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-rose-50 hover:text-rose-600 dark:text-zinc-500 dark:hover:bg-rose-950/40 dark:hover:text-rose-400"
            title="Xoá dòng"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* Stat — chip hiển thị stat ở header                           */
/* ============================================================ */

function Stat({
  label,
  value,
  tone = "zinc",
}: {
  label: string;
  value: string;
  tone?: "zinc" | "emerald" | "amber";
}) {
  const tones = {
    zinc: "bg-white border-zinc-200 text-zinc-700 dark:bg-zinc-900 dark:border-zinc-700 dark:text-zinc-300",
    emerald: "bg-emerald-50 border-emerald-200 text-emerald-700 dark:bg-emerald-950/40 dark:border-emerald-800 dark:text-emerald-400",
    amber: "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/40 dark:border-amber-800 dark:text-amber-400",
  };
  return (
    <div
      className={cn(
        "rounded-md border px-3 py-1.5 text-xs",
        tones[tone],
      )}
    >
      <span className="opacity-70">{label}: </span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}

/* ============================================================ */
/* ItemPicker — search + select                                 */
/* ============================================================ */

function ItemPicker({
  value,
  onChange,
  disabled,
}: {
  value: ItemRef | null;
  onChange: (v: ItemRef | null) => void;
  disabled?: boolean;
}) {
  const [searchTerm, setSearchTerm] = React.useState("");
  const [results, setResults] = React.useState<ItemRef[]>([]);
  const [searching, setSearching] = React.useState(false);

  React.useEffect(() => {
    const t = searchTerm.trim();
    if (t.length < 2) {
      setResults([]);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/items?q=${encodeURIComponent(t)}&pageSize=8`,
        );
        const json = (await res.json()) as {
          data: Array<{
            id: string;
            sku: string;
            name: string;
            uom: string;
            inventorySummary?: { totalQty: number };
          }>;
        };
        if (!cancelled) {
          setResults(
            (json.data ?? []).map((x) => ({
              id: x.id,
              sku: x.sku,
              name: x.name,
              uom: x.uom,
              totalQty: x.inventorySummary?.totalQty ?? 0,
            })),
          );
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchTerm]);

  if (value) {
    return (
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 dark:border-rose-800 dark:bg-rose-950/40">
        <div className="min-w-0">
          <code className="font-mono text-xs font-bold text-rose-900 dark:text-rose-200">
            {value.sku}
          </code>
          <p className="truncate text-[10px] text-rose-700 dark:text-rose-400">{value.name}</p>
        </div>
        <button
          type="button"
          onClick={() => onChange(null)}
          disabled={disabled}
          className="text-[10px] text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50"
        >
          Đổi
        </button>
      </div>
    );
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400 dark:text-zinc-500" />
      <Input
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder="Tìm SKU hoặc tên (≥ 2 ký tự)…"
        className="h-10 pl-9"
        disabled={disabled}
      />
      {searching && (
        <Loader2 className="absolute right-3 top-1/2 h-3 w-3 -translate-y-1/2 animate-spin text-zinc-400 dark:text-zinc-500" />
      )}
      {results.length > 0 && (
        <ul className="absolute left-0 right-0 top-full z-30 mt-1 max-h-56 divide-y divide-zinc-100 overflow-auto rounded-lg border border-zinc-200 bg-white shadow-lg dark:divide-zinc-800 dark:border-zinc-700 dark:bg-zinc-900">
          {results.map((r) => (
            <li key={r.id}>
              <button
                type="button"
                onClick={() => {
                  onChange(r);
                  setSearchTerm("");
                  setResults([]);
                }}
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-rose-50 dark:hover:bg-rose-950/40"
              >
                <div className="min-w-0">
                  <code className="font-mono text-xs font-bold text-zinc-900 dark:text-zinc-50">
                    {r.sku}
                  </code>
                  <p className="truncate text-[10px] text-zinc-600 dark:text-zinc-400">
                    {r.name}
                  </p>
                </div>
                <span
                  className={cn(
                    "shrink-0 rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums",
                    r.totalQty > 0
                      ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400"
                      : "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
                  )}
                >
                  {r.totalQty.toLocaleString("vi-VN")} {r.uom}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ============================================================ */
/* PendingRequestsPanel — Kho duyệt yêu cầu từ Gia công         */
/* ============================================================ */

interface IssueRequestRow {
  id: string;
  requestNo: string;
  status: "PENDING" | "APPROVED" | "REJECTED" | "COMPLETED";
  reason: string;
  reference: string | null;
  notes: string | null;
  totalQty: string;
  picksJson: Array<{
    itemId: string;
    sku?: string | null;
    picks: Array<{
      lotSerialId: string;
      lotCode?: string | null;
      binId: string;
      binCode?: string | null;
      qty: number;
    }>;
  }>;
  requesterUsername: string | null;
  rejectReason: string | null;
  createdAt: string;
}

function PendingRequestsPanel() {
  const qc = useQueryClient();
  const { data, isLoading, refetch } = useQuery<{ data: IssueRequestRow[] }>({
    queryKey: ["issue-request", "pending"],
    queryFn: async () => {
      const res = await fetch(
        "/api/warehouse/issue-request?status=PENDING&pageSize=50",
      );
      return res.json();
    },
    staleTime: 15_000,
  });

  const [acting, setActing] = React.useState<string | null>(null);
  const [collapsed, setCollapsed] = React.useState(false);

  const handleApprove = async (id: string, reqNo: string) => {
    if (!window.confirm(`Duyệt + xuất kho yêu cầu ${reqNo}?`)) return;
    setActing(id);
    try {
      const res = await fetch(`/api/warehouse/issue-request/${id}/approve`, {
        method: "POST",
      });
      const json = (await res.json()) as {
        data?: { totalQty: number; txnIds: string[] };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi duyệt");
        return;
      }
      toast.success(
        `Duyệt + xuất ${reqNo} · ${json.data.totalQty} qty · ${json.data.txnIds.length} pick.`,
      );
      void qc.invalidateQueries({ queryKey: ["warehouse"] });
      void refetch();
    } finally {
      setActing(null);
    }
  };

  const handleReject = async (id: string, reqNo: string) => {
    const reason = window.prompt(`Lý do từ chối yêu cầu ${reqNo}?`);
    if (!reason || !reason.trim()) return;
    setActing(id);
    try {
      const res = await fetch(`/api/warehouse/issue-request/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => null)) as
          | { error?: { message?: string } }
          | null;
        toast.error(j?.error?.message ?? "Lỗi từ chối");
        return;
      }
      toast.success(`Đã từ chối ${reqNo}.`);
      void refetch();
    } finally {
      setActing(null);
    }
  };

  const rows = data?.data ?? [];

  if (rows.length === 0 && !isLoading) {
    return null; // ẩn panel khi không có request nào
  }

  return (
    <section className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50 shadow-sm dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/30">
      <header className="flex items-center justify-between border-b border-amber-200 px-5 py-3 dark:border-amber-800">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-bold text-amber-900 hover:opacity-80 dark:text-amber-300"
        >
          <ClipboardList className="h-4 w-4" />
          <span>
            Yêu cầu chờ duyệt từ Gia công ({rows.length})
          </span>
          <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
            {collapsed ? "▶" : "▼"}
          </span>
        </button>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
        >
          ↻ Làm mới
        </button>
      </header>

      {!collapsed && (
        <div className="p-3">
          {isLoading ? (
            <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
            </p>
          ) : (
            <ul className="space-y-2">
              {rows.map((r) => {
                const totalLines = r.picksJson.length;
                const totalPicks = r.picksJson.reduce(
                  (s, l) => s + l.picks.length,
                  0,
                );
                return (
                  <li
                    key={r.id}
                    className="rounded-xl border border-zinc-200 bg-white p-3 dark:border-zinc-700 dark:bg-zinc-900"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <code className="font-mono text-sm font-bold text-indigo-900 dark:text-indigo-300">
                            {r.requestNo}
                          </code>
                          <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
                            {r.reason}
                          </span>
                          {r.reference && (
                            <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                              {r.reference}
                            </span>
                          )}
                          <span className="text-[10px] text-zinc-500 dark:text-zinc-400">
                            {new Date(r.createdAt).toLocaleString("vi-VN")}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-400">
                          Người tạo:{" "}
                          <span className="font-semibold text-zinc-800 dark:text-zinc-200">
                            {r.requesterUsername ?? "?"}
                          </span>{" "}
                          ·{" "}
                          <span className="tabular-nums">
                            {totalLines} SKU / {totalPicks} pick / tổng{" "}
                            <span className="font-semibold text-emerald-700 dark:text-emerald-400">
                              {Number(r.totalQty).toLocaleString("vi-VN")}
                            </span>
                          </span>
                        </p>
                        {r.notes && (
                          <p className="mt-0.5 text-xs italic text-zinc-500 dark:text-zinc-400">
                            &quot;{r.notes}&quot;
                          </p>
                        )}
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-[11px] font-medium text-indigo-600 hover:underline dark:text-indigo-400">
                            Chi tiết picks ({totalPicks})
                          </summary>
                          <div className="mt-1 max-h-40 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-[11px] dark:border-zinc-800 dark:bg-zinc-800">
                            {r.picksJson.map((line, li) => (
                              <div key={li} className="mb-1.5">
                                <code className="font-mono font-semibold text-zinc-700 dark:text-zinc-300">
                                  {line.sku ?? line.itemId.slice(0, 8)}
                                </code>
                                <ul className="ml-3 mt-0.5 space-y-0.5">
                                  {line.picks.map((p, pi) => (
                                    <li
                                      key={pi}
                                      className="flex items-center gap-2 text-zinc-600 dark:text-zinc-400"
                                    >
                                      <span className="rounded bg-blue-50 px-1 font-mono text-[10px] text-blue-700 dark:bg-blue-950/40 dark:text-blue-400">
                                        {p.binCode ?? p.binId.slice(0, 8)}
                                      </span>
                                      <span className="font-mono">
                                        {p.lotCode ?? "anon"}
                                      </span>
                                      <span className="ml-auto font-semibold tabular-nums">
                                        {p.qty}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            ))}
                          </div>
                        </details>
                      </div>
                      <div className="flex shrink-0 flex-col gap-1">
                        <Button
                          size="sm"
                          disabled={acting === r.id}
                          onClick={() => handleApprove(r.id, r.requestNo)}
                          className="bg-emerald-600 hover:bg-emerald-700"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Duyệt + xuất
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={acting === r.id}
                          onClick={() => handleReject(r.id, r.requestNo)}
                          className="border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-400 dark:hover:bg-rose-950/40"
                        >
                          <X className="h-3.5 w-3.5" />
                          Từ chối
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </section>
  );
}
