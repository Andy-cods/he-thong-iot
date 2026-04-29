"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Loader2,
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
 * V3.7.7 — Tab "Xuất hàng" (thay cho Pick FIFO).
 *
 * Workflow:
 *   1. Thêm dòng: chọn SKU + qty cần xuất
 *   2. Hệ thống auto-fill picks theo FIFO (lot cũ trước)
 *   3. User có thể override pick (chọn lot khác / chỉnh qty)
 *   4. Xem tổng cộng + thiếu hụt
 *   5. Chọn lý do xuất + ghi chú + chứng từ tham chiếu
 *   6. Submit → POST /api/warehouse/issue
 *      → Tạo inventory_txn OUT_ISSUE per pick
 *      → Bin layout + stats auto-refresh
 */

interface ItemRef {
  id: string;
  sku: string;
  name: string;
  uom: string;
  totalQty: number;
}

interface Pick {
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binFullCode: string;
  qty: number; // qty user muốn lấy từ pick này
  available: number; // qty hiện có trong (bin, lot)
  receivedAt: string;
  expDate: string | null;
}

interface IssueLine {
  rowId: string; // local id (uuid) for rendering
  item: ItemRef | null;
  qtyNeeded: string;
  picks: Pick[];
  loadingPicks: boolean;
  shortage: number;
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
  // V3.7.10 — Tab Xuất hàng chỉ dành cho Kho:
  //   - Xuất ngay (mode duy nhất)
  //   - Pending requests list (yêu cầu từ Vận hành/operations qua tạo WO)
  // Mode 'Tạo yêu cầu' đã chuyển sang /work-orders/quick-new (Vận hành tạo).
  const mode = "direct" as const;

  const [lines, setLines] = React.useState<IssueLine[]>([
    {
      rowId: uuid(),
      item: null,
      qtyNeeded: "",
      picks: [],
      loadingPicks: false,
      shortage: 0,
    },
  ]);
  const [reason, setReason] = React.useState<Reason>("manual");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  // Stats tổng
  const totalLines = lines.filter((l) => l.item).length;
  const totalQty = lines.reduce(
    (s, l) => s + l.picks.reduce((sp, p) => sp + p.qty, 0),
    0,
  );
  const hasShortage = lines.some((l) => l.shortage > 0);

  const addLine = () => {
    setLines((prev) => [
      ...prev,
      {
        rowId: uuid(),
        item: null,
        qtyNeeded: "",
        picks: [],
        loadingPicks: false,
        shortage: 0,
      },
    ]);
  };

  const removeLine = (rowId: string) => {
    setLines((prev) => prev.filter((l) => l.rowId !== rowId));
  };

  const updateLine = (rowId: string, patch: Partial<IssueLine>) => {
    setLines((prev) =>
      prev.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)),
    );
  };

  const fetchFifoForLine = async (rowId: string, item: ItemRef, qty: number) => {
    updateLine(rowId, { loadingPicks: true });
    try {
      const res = await fetch("/api/warehouse/fifo-pick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: item.id, qty }),
      });
      const json = (await res.json()) as {
        data?: {
          picks: Array<{
            lotSerialId: string;
            lotCode: string | null;
            binId: string;
            binFullCode: string;
            qty: number;
            receivedAt: string;
            expDate: string | null;
          }>;
          covered: number;
          shortage: number;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Không lấy được FIFO plan.");
        updateLine(rowId, { loadingPicks: false });
        return;
      }
      const picks: Pick[] = json.data.picks.map((p) => ({
        lotSerialId: p.lotSerialId,
        lotCode: p.lotCode,
        binId: p.binId,
        binFullCode: p.binFullCode,
        qty: p.qty,
        available: p.qty, // từ FIFO: qty đề xuất = qty còn dùng được
        receivedAt: p.receivedAt,
        expDate: p.expDate,
      }));
      updateLine(rowId, {
        picks,
        loadingPicks: false,
        shortage: json.data.shortage,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Lỗi FIFO.");
      updateLine(rowId, { loadingPicks: false });
    }
  };

  const handleSubmit = async () => {
    const validLines = lines.filter(
      (l) => l.item && l.picks.length > 0 && l.picks.every((p) => p.qty > 0),
    );
    if (validLines.length === 0) {
      toast.error("Chưa có dòng xuất hợp lệ.");
      return;
    }
    if (hasShortage && mode === "direct") {
      const ok = window.confirm(
        "Một số dòng đang thiếu tồn — vẫn xuất phần có sẵn?",
      );
      if (!ok) return;
    }
    setSubmitting(true);
    try {
      const linesPayload = validLines.map((l) => ({
        itemId: l.item!.id,
        sku: l.item!.sku,
        picks: l.picks
          .filter((p) => p.qty > 0)
          .map((p) => ({
            lotSerialId: p.lotSerialId,
            lotCode: p.lotCode,
            binId: p.binId,
            binCode: p.binFullCode,
            qty: p.qty,
          })),
      }));
      const endpoint =
        mode === "direct"
          ? "/api/warehouse/issue"
          : "/api/warehouse/issue-request";
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          lines: linesPayload,
        }),
      });
      const json = (await res.json()) as {
        data?: {
          txnIds?: string[];
          totalQty?: number;
          consumedLots?: number;
          requestNo?: string;
          id?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi xuất hàng");
        return;
      }
      if (mode === "direct") {
        toast.success(
          `Đã xuất ${json.data.totalQty} qty · ${json.data.txnIds?.length ?? 0} pick${
            (json.data.consumedLots ?? 0) > 0
              ? ` · ${json.data.consumedLots} lot CONSUMED`
              : ""
          }.`,
        );
      } else {
        toast.success(
          `Đã gửi yêu cầu ${json.data.requestNo} · chờ Kho duyệt.`,
        );
      }
      void qc.invalidateQueries({ queryKey: ["warehouse"] });
      void qc.invalidateQueries({ queryKey: ["issue-request"] });
      // Reset form
      setLines([
        {
          rowId: uuid(),
          item: null,
          qtyNeeded: "",
          picks: [],
          loadingPicks: false,
          shortage: 0,
        },
      ]);
      setReference("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-zinc-900">
            <Truck className="h-5 w-5 text-rose-600" />
            Xuất hàng
          </h2>
          <p className="mt-0.5 text-sm text-zinc-500">
            {mode === "direct"
              ? "Xuất kho ngay (chỉ Kho/Admin). Tạo OUT_ISSUE inventory_txn trực tiếp."
              : "Tạo yêu cầu xuất kho. Bộ phận Kho sẽ kiểm tra và duyệt."}
          </p>
        </div>
        <div className="hidden gap-3 text-right text-xs lg:flex">
          <div className="rounded border border-zinc-200 bg-white px-3 py-1.5">
            <span className="text-zinc-500">Số dòng:</span>{" "}
            <span className="font-semibold tabular-nums">{totalLines}</span>
          </div>
          <div className="rounded border border-emerald-200 bg-emerald-50 px-3 py-1.5">
            <span className="text-emerald-700">Tổng qty:</span>{" "}
            <span className="font-semibold tabular-nums text-emerald-900">
              {totalQty.toLocaleString("vi-VN")}
            </span>
          </div>
          {hasShortage && (
            <div className="rounded border border-amber-200 bg-amber-50 px-3 py-1.5">
              <AlertTriangle className="mr-1 inline h-3 w-3 text-amber-600" />
              <span className="text-amber-700">Thiếu tồn</span>
            </div>
          )}
        </div>
      </header>

      {/* V3.7.10 — Pending requests panel (yêu cầu từ Vận hành) */}
      <PendingRequestsPanel />

      {/* LINES */}
      <section className="space-y-3">
        {lines.map((line, idx) => (
          <LineCard
            key={line.rowId}
            line={line}
            index={idx}
            onUpdate={(patch) => updateLine(line.rowId, patch)}
            onRemove={() => removeLine(line.rowId)}
            onFetchFifo={(item, qty) =>
              fetchFifoForLine(line.rowId, item, qty)
            }
            disabled={submitting}
            removable={lines.length > 1}
          />
        ))}
        <button
          type="button"
          onClick={addLine}
          disabled={submitting}
          className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-300 bg-white px-3 py-3 text-sm font-medium text-zinc-600 hover:border-indigo-400 hover:bg-indigo-50 hover:text-indigo-700"
        >
          <Plus className="h-4 w-4" />
          Thêm dòng xuất
        </button>
      </section>

      {/* META + SUBMIT */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Thông tin xuất
        </h3>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-medium text-zinc-700">Lý do</label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as Reason)}
              disabled={submitting}
              className="mt-1 block w-full rounded-md border border-zinc-300 bg-white px-2 py-1.5 text-sm"
            >
              {REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">
              Số chứng từ tham chiếu
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: WO-2026-001 / SO-..."
              className="mt-1 font-mono"
              disabled={submitting}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-zinc-700">Ghi chú</label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Tuỳ chọn..."
              className="mt-1"
              disabled={submitting}
            />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-end gap-2">
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalLines === 0 || totalQty === 0}
            className="bg-rose-600 hover:bg-rose-700"
          >
            <Truck className="h-3.5 w-3.5" />
            {submitting ? "Đang xuất…" : "Xuất hàng ngay"}
          </Button>
        </div>
      </section>
    </div>
  );
}

/* ============================================================ */
/* LineCard — 1 dòng xuất với SKU + qty + picks                 */
/* ============================================================ */

function LineCard({
  line,
  index,
  onUpdate,
  onRemove,
  onFetchFifo,
  disabled,
  removable,
}: {
  line: IssueLine;
  index: number;
  onUpdate: (patch: Partial<IssueLine>) => void;
  onRemove: () => void;
  onFetchFifo: (item: ItemRef, qty: number) => void;
  disabled: boolean;
  removable: boolean;
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

  const triggerFifo = () => {
    if (!line.item) return;
    const q = Number(line.qtyNeeded);
    if (!Number.isFinite(q) || q <= 0) {
      toast.error("Số lượng phải > 0.");
      return;
    }
    onFetchFifo(line.item, q);
  };

  const totalPicked = line.picks.reduce((s, p) => s + p.qty, 0);
  const qtyNeededNum = Number(line.qtyNeeded) || 0;
  const isComplete =
    line.picks.length > 0 && totalPicked === qtyNeededNum && qtyNeededNum > 0;

  return (
    <div className="rounded-lg border border-zinc-200 bg-white shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-2">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-zinc-100 text-xs font-semibold text-zinc-700">
            {index + 1}
          </span>
          <span className="text-sm font-medium text-zinc-700">
            {line.item ? line.item.sku : "Chọn vật tư..."}
          </span>
          {isComplete && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-xs font-medium text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Đủ
            </span>
          )}
          {line.shortage > 0 && (
            <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-xs font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" /> Thiếu {line.shortage}
            </span>
          )}
        </div>
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="text-zinc-400 hover:text-rose-600"
            title="Xoá dòng"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Body */}
      <div className="p-4">
        {/* Item picker */}
        {!line.item ? (
          <div>
            <label className="text-xs font-medium text-zinc-700">
              Tìm SKU
            </label>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400" />
              <Input
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="SKU hoặc tên (≥ 2 ký tự)…"
                className="pl-8"
                disabled={disabled}
              />
            </div>
            {searching && (
              <p className="mt-1 inline-flex items-center gap-1 text-xs text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" /> Đang tìm…
              </p>
            )}
            {results.length > 0 && (
              <ul className="mt-1 max-h-48 divide-y divide-zinc-100 overflow-auto rounded-md border border-zinc-200">
                {results.map((r) => (
                  <li key={r.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onUpdate({ item: r });
                        setSearchTerm("");
                        setResults([]);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-zinc-50"
                    >
                      <div className="min-w-0">
                        <code className="font-mono text-xs font-semibold text-zinc-900">
                          {r.sku}
                        </code>
                        <p className="truncate text-xs text-zinc-600">
                          {r.name}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
                          r.totalQty > 0
                            ? "bg-emerald-50 text-emerald-700"
                            : "bg-zinc-100 text-zinc-500",
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
        ) : (
          <>
            {/* SKU info + qty */}
            <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_140px_120px]">
              <div className="rounded-md border border-indigo-200 bg-indigo-50 px-3 py-2">
                <div className="flex items-center gap-2">
                  <code className="font-mono text-sm font-semibold text-indigo-900">
                    {line.item.sku}
                  </code>
                  <span className="rounded bg-white px-1.5 py-0.5 text-xs font-medium tabular-nums text-zinc-700">
                    Tồn: {line.item.totalQty.toLocaleString("vi-VN")}{" "}
                    {line.item.uom}
                  </span>
                </div>
                <p className="truncate text-xs text-indigo-700">
                  {line.item.name}
                </p>
              </div>
              <div>
                <label className="text-xs font-medium text-zinc-700">
                  SL cần xuất
                </label>
                <Input
                  type="number"
                  min={0}
                  step={0.0001}
                  value={line.qtyNeeded}
                  onChange={(e) => onUpdate({ qtyNeeded: e.target.value })}
                  placeholder="0"
                  className="mt-1 text-right tabular-nums"
                  disabled={disabled}
                />
              </div>
              <div className="flex items-end gap-1">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={triggerFifo}
                  disabled={disabled || !line.qtyNeeded}
                  className="w-full"
                >
                  {line.loadingPicks ? "..." : "Đề xuất FIFO"}
                </Button>
                <button
                  type="button"
                  onClick={() => onUpdate({ item: null, picks: [], qtyNeeded: "" })}
                  className="text-xs text-zinc-500 hover:text-zinc-900"
                  title="Đổi SKU"
                >
                  Đổi
                </button>
              </div>
            </div>

            {/* Picks table */}
            {line.picks.length > 0 && (
              <div className="mt-3 overflow-x-auto rounded-md border border-zinc-200">
                <table className="w-full text-sm">
                  <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                    <tr>
                      <th className="px-3 py-1.5 text-left">Bin</th>
                      <th className="px-3 py-1.5 text-left">Lô</th>
                      <th className="px-3 py-1.5 text-left">Ngày nhập</th>
                      <th className="px-3 py-1.5 text-right">Có</th>
                      <th className="px-3 py-1.5 text-right">Lấy</th>
                      <th className="px-3 py-1.5 text-center w-10">Bỏ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {line.picks.map((p, pi) => (
                      <tr key={`${p.lotSerialId}-${p.binId}`} className="border-t border-zinc-100">
                        <td className="px-3 py-1.5">
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 font-mono text-xs font-medium text-blue-700">
                            {p.binFullCode}
                          </span>
                        </td>
                        <td className="px-3 py-1.5 font-mono text-xs text-zinc-700">
                          {p.lotCode ?? "—"}
                        </td>
                        <td className="px-3 py-1.5 text-xs text-zinc-600">
                          {p.receivedAt
                            ? new Date(p.receivedAt).toLocaleDateString(
                                "vi-VN",
                              )
                            : "—"}
                        </td>
                        <td className="px-3 py-1.5 text-right text-xs tabular-nums text-zinc-500">
                          {p.available}
                        </td>
                        <td className="px-3 py-1.5">
                          <Input
                            type="number"
                            min={0}
                            max={p.available}
                            step={0.0001}
                            value={p.qty}
                            onChange={(e) => {
                              const v = Number(e.target.value);
                              const nextPicks = [...line.picks];
                              nextPicks[pi] = {
                                ...p,
                                qty: Number.isFinite(v) ? v : 0,
                              };
                              onUpdate({ picks: nextPicks });
                            }}
                            className="h-7 w-20 text-right text-xs tabular-nums"
                            disabled={disabled}
                          />
                        </td>
                        <td className="px-3 py-1.5 text-center">
                          <button
                            type="button"
                            onClick={() => {
                              onUpdate({
                                picks: line.picks.filter((_, i) => i !== pi),
                              });
                            }}
                            disabled={disabled}
                            className="text-zinc-400 hover:text-rose-600"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-zinc-200 bg-zinc-50">
                      <td colSpan={4} className="px-3 py-1.5 text-right text-xs font-semibold text-zinc-700">
                        Tổng lấy:
                      </td>
                      <td className="px-3 py-1.5 text-right">
                        <span
                          className={cn(
                            "font-semibold tabular-nums",
                            isComplete
                              ? "text-emerald-700"
                              : totalPicked > qtyNeededNum
                                ? "text-rose-700"
                                : "text-amber-700",
                          )}
                        >
                          {totalPicked.toLocaleString("vi-VN")} /{" "}
                          {qtyNeededNum.toLocaleString("vi-VN")}
                        </span>
                      </td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ============================================================ */
/* PendingRequestsPanel — Kho duyệt yêu cầu xuất                */
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
        `Đã duyệt + xuất ${reqNo} · ${json.data.totalQty} qty · ${json.data.txnIds.length} pick.`,
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

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
      <header className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-amber-900">
          <ClipboardList className="h-4 w-4" />
          Yêu cầu chờ duyệt ({rows.length})
        </h3>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-xs text-amber-700 hover:underline"
        >
          Làm mới
        </button>
      </header>

      {isLoading ? (
        <p className="inline-flex items-center gap-1 text-xs text-zinc-500">
          <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
        </p>
      ) : rows.length === 0 ? (
        <p className="rounded-md border border-dashed border-amber-200 bg-white px-3 py-3 text-center text-xs text-zinc-500">
          Không có yêu cầu nào đang chờ duyệt.
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
                className="rounded-md border border-zinc-200 bg-white p-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <code className="font-mono text-sm font-semibold text-indigo-900">
                        {r.requestNo}
                      </code>
                      <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                        {r.reason}
                      </span>
                      {r.reference && (
                        <span className="rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-700">
                          {r.reference}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-zinc-600">
                      Người tạo:{" "}
                      <span className="font-semibold text-zinc-800">
                        {r.requesterUsername ?? "?"}
                      </span>{" "}
                      ·{" "}
                      <span className="tabular-nums">
                        {totalLines} SKU / {totalPicks} pick / tổng{" "}
                        {Number(r.totalQty).toLocaleString("vi-VN")}
                      </span>
                    </p>
                    {r.notes && (
                      <p className="mt-0.5 text-xs italic text-zinc-500">
                        &quot;{r.notes}&quot;
                      </p>
                    )}
                    <details className="mt-1.5">
                      <summary className="cursor-pointer text-[11px] text-indigo-600 hover:underline">
                        Chi tiết picks
                      </summary>
                      <div className="mt-1 max-h-40 overflow-auto rounded border border-zinc-100 bg-zinc-50 p-2 text-[11px]">
                        {r.picksJson.map((line, li) => (
                          <div key={li} className="mb-1.5">
                            <code className="font-mono font-semibold text-zinc-700">
                              {line.sku ?? line.itemId.slice(0, 8)}
                            </code>
                            <ul className="ml-3 mt-0.5 space-y-0.5">
                              {line.picks.map((p, pi) => (
                                <li
                                  key={pi}
                                  className="flex items-center gap-2 text-zinc-600"
                                >
                                  <span className="rounded bg-blue-50 px-1 font-mono text-[10px] text-blue-700">
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
                      className="border-rose-300 text-rose-700 hover:bg-rose-50"
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
    </section>
  );
}
