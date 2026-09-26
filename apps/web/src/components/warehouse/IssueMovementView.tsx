"use client";

import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertCircle,
  CheckCircle2,
  ClipboardList,
  FileWarning,
  Loader2,
  Package,
  Plus,
  Search,
  Send,
  ShieldCheck,
  Trash2,
  Truck,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useSession } from "@/hooks/useSession";
import { can } from "@iot/shared";
import { invalidateStockQueries } from "@/lib/stock-cache";

/**
 * Wave 5 Phase A/B — `<IssueMovementView>` (trước đây `IssueTab`).
 *
 * Header gradient riêng đã bị bỏ (khung chung nằm ở `<MovementTab>`). Màu
 * rose/pink lệch hệ thống đã đổi sang indigo/violet để nhất quán với
 * `WarehouseLayoutTab`/`ReceivingMovementView`. Amber cảnh báo ở
 * `PendingRequestsPanel` GIỮ NGUYÊN (đúng ngữ nghĩa "cần chú ý").
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
  /**
   * V4.1 KHO-23/16 — "Khả dụng" (inventorySummary.availableQty = issuable):
   * chỉ lô AVAILABLE trừ giữ chỗ. Trước đây dùng tổng tồn (có cả HOLD) → báo
   * "Đủ tồn" nhưng FIFO chỉ lấy được lô AVAILABLE → xuất thiếu im lặng.
   */
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

export function IssueMovementView() {
  const qc = useQueryClient();
  // V4.1 KHO-14 — xuất nhanh Bán hàng / Trả NCC chỉ Giám đốc; người khác lập
  // "Yêu cầu xuất kho" để Giám đốc duyệt.
  const { data: session } = useSession();
  const canIssueExternal = can(session?.roles ?? [], "approve", "goodsIssue");
  const quickReasons = REASONS.filter(
    (r) => canIssueExternal || (r.value !== "sales" && r.value !== "return"),
  );
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
        data?: {
          txnIds: string[];
          totalQty: number;
          consumedLots: number;
          issueNo?: string;
        };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi xuất hàng");
        return;
      }
      toast.success(
        `${json.data.issueNo ? `Phiếu xuất ${json.data.issueNo}: ` : ""}Đã xuất ${json.data.totalQty} qty từ ${json.data.txnIds.length} bin · ${totalLines} SKU.`,
      );
      // V4.1 Đợt 1b (KHO-24) — làm mới mọi màn đọc tồn + tab Phiếu xuất kho.
      invalidateStockQueries(qc);
      // Reset
      setLines([{ rowId: uuid(), item: null, qty: "" }]);
      setReference("");
      setNotes("");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col gap-4 p-3 sm:p-6">
      {/* HEADER phụ trong mode */}
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Xuất hàng cho SX/bán hàng
          </h2>
          <p className="mt-0.5 text-xs text-zinc-500 dark:text-zinc-400">
            Kho xuất ngay (auto FIFO) · duyệt yêu cầu từ Gia công
          </p>
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

      {/* CREATE ISSUE REQUEST — yêu cầu xuất kho cần duyệt (bán hàng/trả NCC/SX) */}
      <CreateIssueRequestPanel />

      {/* QUICK ISSUE FORM — đơn giản */}
      <section className="rounded-2xl border border-zinc-200 bg-white shadow-sm dark:border-zinc-800 dark:bg-zinc-900">
        <header className="flex items-center gap-2 border-b border-zinc-100 px-5 py-3 dark:border-zinc-800">
          <Package className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
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
            className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
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
                {quickReasons.map((r) => (
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
                  ✓ Đủ khả dụng cho {totalLines} SKU · tổng {totalQty.toLocaleString("vi-VN")} qty.
                </span>
              )}
            </div>
            <Button
              onClick={handleSubmit}
              disabled={submitting || totalLines === 0}
              className="h-10 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold shadow-md hover:from-indigo-700 hover:to-violet-700"
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
            title={`Khả dụng: ${have} ${line.item.uom} (không tính hàng chờ QC / đã giữ chỗ)`}
          >
            khả dụng {have.toLocaleString("vi-VN")}
          </span>
        )}
        {removable && (
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="ml-1 inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-indigo-50 hover:text-indigo-600 dark:text-zinc-500 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-400"
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
/* CreateIssueRequestPanel — Tạo yêu cầu xuất kho cần duyệt      */
/* ============================================================ */

const REQUEST_REASONS = [
  { value: "sales", label: "Bán hàng / giao khách", needsApproval: true },
  { value: "return", label: "Trả nhà cung cấp", needsApproval: true },
  { value: "production", label: "Xuất cho sản xuất", needsApproval: false },
  { value: "manual", label: "Xuất thủ công khác", needsApproval: false },
] as const;

type RequestReason = (typeof REQUEST_REASONS)[number]["value"];

function CreateIssueRequestPanel() {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [lines, setLines] = React.useState<IssueLine[]>([
    { rowId: uuid(), item: null, qty: "" },
  ]);
  const [reason, setReason] = React.useState<RequestReason>("sales");
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

  const reasonMeta = REQUEST_REASONS.find((r) => r.value === reason)!;

  const addLine = () =>
    setLines((p) => [...p, { rowId: uuid(), item: null, qty: "" }]);
  const removeLine = (rowId: string) =>
    setLines((p) => p.filter((l) => l.rowId !== rowId));
  const updateLine = (rowId: string, patch: Partial<IssueLine>) =>
    setLines((p) =>
      p.map((l) => (l.rowId === rowId ? { ...l, ...patch } : l)),
    );

  const resetForm = () => {
    setLines([{ rowId: uuid(), item: null, qty: "" }]);
    setReason("sales");
    setReference("");
    setNotes("");
  };

  const handleSubmit = async () => {
    if (validLines.length === 0) {
      toast.error("Cần ít nhất 1 dòng SKU + số lượng.");
      return;
    }
    if (totalShortage > 0) {
      toast.error(
        `Thiếu tồn ${totalShortage} đơn vị — giảm số lượng hoặc bỏ dòng thiếu trước khi gửi yêu cầu.`,
      );
      return;
    }
    setSubmitting(true);
    try {
      // Step 1: gọi FIFO cho từng line để có picks đúng shape picks_json
      const requestLines: Array<{
        itemId: string;
        sku: string | null;
        picks: Array<{
          lotSerialId: string;
          lotCode: string | null;
          binId: string;
          binCode: string | null;
          qty: number;
        }>;
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
              lotCode?: string | null;
              binId: string;
              binCode?: string | null;
              qty: number;
            }>;
          };
          error?: { message?: string };
        };
        if (!fifoRes.ok || !fifoJson.data) {
          toast.error(
            fifoJson.error?.message ?? `Không pick FIFO được cho ${l.item!.sku}`,
          );
          return;
        }
        if (fifoJson.data.picks.length === 0) {
          toast.error(`SKU ${l.item!.sku} không có tồn AVAILABLE.`);
          return;
        }
        requestLines.push({
          itemId: l.item!.id,
          sku: l.item!.sku,
          picks: fifoJson.data.picks.map((p) => ({
            lotSerialId: p.lotSerialId,
            lotCode: p.lotCode ?? null,
            binId: p.binId,
            binCode: p.binCode ?? null,
            qty: p.qty,
          })),
        });
      }

      // Step 2: gửi yêu cầu xuất kho (cần duyệt)
      const res = await fetch("/api/warehouse/issue-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          lines: requestLines,
        }),
      });
      const json = (await res.json()) as {
        data?: { id: string; requestNo: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi tạo yêu cầu xuất kho");
        return;
      }
      toast.success(
        `Đã tạo yêu cầu ${json.data.requestNo}${
          reasonMeta.needsApproval
            ? " · chờ Giám đốc duyệt"
            : " · chờ Kho duyệt"
        }.`,
      );
      void qc.invalidateQueries({ queryKey: ["issue-request"] });
      resetForm();
      setOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-indigo-300 bg-indigo-50/40 px-4 py-3 text-sm font-bold text-indigo-700 transition-colors hover:border-indigo-400 hover:bg-indigo-50 dark:border-indigo-800 dark:bg-indigo-950/20 dark:text-indigo-300 dark:hover:bg-indigo-950/40"
      >
        <ClipboardList className="h-4 w-4" />
        Tạo yêu cầu xuất kho (bán hàng / trả NCC / sản xuất…)
      </button>
    );
  }

  return (
    <section className="rounded-2xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-900 dark:bg-zinc-900">
      <header className="flex items-center justify-between gap-2 border-b border-indigo-100 px-5 py-3 dark:border-indigo-900">
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-50">
            Tạo yêu cầu xuất kho
          </h3>
        </div>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            resetForm();
          }}
          disabled={submitting}
          className="inline-flex h-7 w-7 items-center justify-center rounded text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          title="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
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
          className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg border-2 border-dashed border-zinc-300 bg-white px-3 py-2 text-xs font-semibold text-zinc-600 hover:border-indigo-400 hover:bg-indigo-50/50 hover:text-indigo-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-400 dark:hover:border-indigo-500 dark:hover:bg-indigo-950/30 dark:hover:text-indigo-400"
        >
          <Plus className="h-3.5 w-3.5" />
          Thêm dòng
        </button>

        {/* Meta */}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Lý do xuất
            </label>
            <select
              value={reason}
              onChange={(e) => setReason(e.target.value as RequestReason)}
              disabled={submitting}
              className="mt-1.5 block h-10 w-full rounded-md border border-zinc-300 bg-white px-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
            >
              {REQUEST_REASONS.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold uppercase tracking-wide text-zinc-600 dark:text-zinc-400">
              Tham chiếu (đơn hàng / khách hàng)
            </label>
            <Input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="VD: SO-2026-001 · Tên khách…"
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
              placeholder="Tuỳ chọn…"
              className="mt-1.5 h-10"
              disabled={submitting}
            />
          </div>
        </div>

        {/* Cảnh báo hệ quả duyệt */}
        {reasonMeta.needsApproval ? (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-300">
            <FileWarning className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Yêu cầu này cần <strong>Giám đốc</strong> duyệt (xuất ra ngoài
              công ty). Sau khi duyệt, hệ thống xuất kho ngay và bạn có thể
              lập <strong>Biên bản giao hàng (BBGH)</strong> ở tab &quot;Phiếu
              giao hàng&quot;.
            </span>
          </div>
        ) : (
          <div className="mt-4 flex items-start gap-2 rounded-lg border border-emerald-300 bg-emerald-50 p-3 text-xs text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/30 dark:text-emerald-300">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Lý do nội bộ — <strong>Kho tự duyệt</strong>, không cần Giám đốc,
              không cần lập BBGH.
            </span>
          </div>
        )}

        {/* Submit */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-zinc-50 p-3 dark:bg-zinc-800">
          <div className="text-xs text-zinc-600 dark:text-zinc-400">
            {totalLines === 0 ? (
              "Chưa có dòng nào."
            ) : totalShortage > 0 ? (
              <span className="text-amber-700 dark:text-amber-400">
                ⚠ Thiếu {totalShortage} đơn vị — không thể gửi yêu cầu.
              </span>
            ) : (
              <span className="text-emerald-700 dark:text-emerald-400">
                ✓ Đủ khả dụng cho {totalLines} SKU · tổng {totalQty.toLocaleString("vi-VN")} qty.
              </span>
            )}
          </div>
          <Button
            onClick={handleSubmit}
            disabled={submitting || totalLines === 0 || totalShortage > 0}
            className="h-10 bg-gradient-to-r from-indigo-600 to-violet-600 px-5 text-sm font-bold shadow-md hover:from-indigo-700 hover:to-violet-700"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Đang gửi…
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Gửi yêu cầu xuất kho
              </>
            )}
          </Button>
        </div>
      </div>
    </section>
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
            inventorySummary?: { totalQty: number; availableQty?: number };
          }>;
        };
        if (!cancelled) {
          setResults(
            (json.data ?? []).map((x) => ({
              id: x.id,
              sku: x.sku,
              name: x.name,
              uom: x.uom,
              // V4.1 — khả dụng (không tính HOLD / đã giữ chỗ).
              totalQty: x.inventorySummary?.availableQty ?? 0,
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
      <div className="flex h-10 items-center justify-between gap-2 rounded-md border border-indigo-200 bg-indigo-50 px-3 dark:border-indigo-800 dark:bg-indigo-950/40">
        <div className="min-w-0">
          <code className="font-mono text-xs font-bold text-indigo-900 dark:text-indigo-200">
            {value.sku}
          </code>
          <p className="truncate text-[10px] text-indigo-700 dark:text-indigo-400">{value.name}</p>
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
                className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-indigo-50 dark:hover:bg-indigo-950/40"
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

const STATUS_FILTERS = [
  { value: "PENDING", label: "Chờ duyệt" },
  { value: "COMPLETED", label: "Hoàn tất" },
  { value: "REJECTED", label: "Bị từ chối" },
  { value: "ALL", label: "Tất cả" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

const ISR_STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400",
  APPROVED: "bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-400",
  COMPLETED:
    "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400",
  REJECTED: "bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400",
};

const ISR_STATUS_LABEL: Record<string, string> = {
  PENDING: "Chờ duyệt",
  APPROVED: "Đã duyệt",
  COMPLETED: "Hoàn tất",
  REJECTED: "Bị từ chối",
};

function PendingRequestsPanel() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin = session?.roles.includes("admin") ?? false;
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("PENDING");

  const { data, isLoading, refetch } = useQuery<{ data: IssueRequestRow[] }>({
    queryKey: ["issue-request", "list", statusFilter],
    queryFn: async () => {
      const qs =
        statusFilter === "ALL" ? "" : `&status=${statusFilter}`;
      const res = await fetch(
        `/api/warehouse/issue-request?pageSize=50${qs}`,
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
        data?: { totalQty: number; txnIds: string[]; issueNo?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Lỗi duyệt");
        return;
      }
      toast.success(
        `Duyệt + xuất ${reqNo}${json.data.issueNo ? ` → phiếu xuất ${json.data.issueNo}` : ""} · ${json.data.totalQty} qty · ${json.data.txnIds.length} pick.`,
      );
      // V4.1 Đợt 1b (KHO-24) — làm mới mọi màn đọc tồn.
      invalidateStockQueries(qc);
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
  const pendingCount = rows.filter((r) => r.status === "PENDING").length;

  return (
    <section className="rounded-2xl border-2 border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50/50 shadow-sm dark:border-amber-800 dark:from-amber-950/40 dark:to-orange-950/30">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 px-5 py-3 dark:border-amber-800">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-bold text-amber-900 hover:opacity-80 dark:text-amber-300"
        >
          <ClipboardList className="h-4 w-4" />
          <span>
            Yêu cầu xuất kho
            {statusFilter === "PENDING" && pendingCount > 0
              ? ` chờ duyệt (${pendingCount})`
              : ` (${rows.length})`}
          </span>
          <span className="text-xs font-normal text-amber-700 dark:text-amber-400">
            {collapsed ? "▶" : "▼"}
          </span>
        </button>
        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-7 rounded-md border border-amber-300 bg-white px-2 text-xs font-medium text-amber-800 dark:border-amber-800 dark:bg-zinc-900 dark:text-amber-300"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => refetch()}
            className="text-xs font-medium text-amber-700 hover:underline dark:text-amber-400"
          >
            ↻ Làm mới
          </button>
        </div>
      </header>

      {!collapsed && (
        <div className="p-3">
          {isLoading ? (
            <p className="inline-flex items-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
              <Loader2 className="h-3 w-3 animate-spin" /> Đang tải…
            </p>
          ) : rows.length === 0 ? (
            <p className="rounded-lg border border-dashed border-zinc-300 p-4 text-center text-xs text-zinc-500 dark:border-zinc-700 dark:text-zinc-400">
              Không có yêu cầu nào ở trạng thái này.
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
                          <span
                            className={cn(
                              "rounded px-1.5 py-0.5 text-[10px] font-medium",
                              ISR_STATUS_BADGE[r.status] ?? ISR_STATUS_BADGE.PENDING,
                            )}
                          >
                            {ISR_STATUS_LABEL[r.status] ?? r.status}
                          </span>
                          <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-300">
                            {REQUEST_REASONS.find((x) => x.value === r.reason)
                              ?.label ?? r.reason}
                          </span>
                          {["sales", "return"].includes(r.reason) && (
                            <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-700 dark:bg-violet-950/40 dark:text-violet-400">
                              Cần Giám đốc duyệt
                            </span>
                          )}
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
                        {r.status === "REJECTED" && r.rejectReason && (
                          <p className="mt-0.5 text-xs text-rose-600 dark:text-rose-400">
                            Lý do từ chối: {r.rejectReason}
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
                        {r.status === "PENDING" ? (
                          ["sales", "return"].includes(r.reason) &&
                          !isAdmin ? (
                            <span className="max-w-[120px] text-right text-[11px] italic text-zinc-500 dark:text-zinc-400">
                              Chờ Giám đốc duyệt
                            </span>
                          ) : (
                            <>
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
                                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50 dark:border-indigo-800 dark:text-indigo-400 dark:hover:bg-indigo-950/40"
                              >
                                <X className="h-3.5 w-3.5" />
                                Từ chối
                              </Button>
                            </>
                          )
                        ) : null}
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
