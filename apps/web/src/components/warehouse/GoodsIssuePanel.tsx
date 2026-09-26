"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, Loader2, PackageCheck, Truck, Wand2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { invalidateStockQueries } from "@/lib/stock-cache";
import { cn } from "@/lib/utils";

/**
 * V4.1 Đợt 1b (Q3/KHO-04) — Panel "Lập phiếu xuất kho" trong chi tiết phiếu
 * yêu cầu vật tư.
 *
 * Luồng:
 *   1. Kho nhập SL xuất lần này cho từng dòng (mặc định = min(còn lại, khả dụng)).
 *   2. "Gợi ý lô (FIFO)" → gọi /api/warehouse/fifo-pick từng dòng → xem trước
 *      lô + vị trí sẽ lấy (chỉ lô AVAILABLE, trừ giữ chỗ, hạn dùng sớm trước).
 *   3. "Xác nhận xuất" → POST /api/material-requests/[id]/goods-issue → sinh
 *      phiếu PX, trừ tồn, phiếu yêu cầu → Giao một phần / Đã giao đủ.
 * Giao từng phần được: chỉ nhập SL cho các dòng đang có hàng.
 */

export interface GoodsIssuePanelLine {
  id: string;
  lineNo: number;
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
  requestedQty: string;
  deliveredQty: string;
  remainingQty: string;
  issuableQty: string;
}

interface FifoPick {
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binFullCode: string;
  qty: number;
}

interface PreviewLine {
  lineId: string;
  sku: string;
  wanted: number;
  picks: FifoPick[];
  covered: number;
}

function fmt(n: number): string {
  return Number(n.toFixed(4)).toLocaleString("vi-VN");
}

export function GoodsIssuePanel({
  requestId,
  requestNo,
  lines,
}: {
  requestId: string;
  requestNo: string;
  lines: GoodsIssuePanelLine[];
}) {
  const qc = useQueryClient();
  const openLines = React.useMemo(
    () => lines.filter((l) => Number(l.remainingQty) > 0),
    [lines],
  );

  const [open, setOpen] = React.useState(false);
  const [qtyByLine, setQtyByLine] = React.useState<Record<string, string>>({});
  const [notes, setNotes] = React.useState("");
  const [preview, setPreview] = React.useState<PreviewLine[] | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);

  const resetDefaults = React.useCallback(() => {
    const init: Record<string, string> = {};
    for (const l of openLines) {
      const def = Math.max(0, Math.min(Number(l.remainingQty), Number(l.issuableQty)));
      init[l.id] = def > 0 ? String(Number(def.toFixed(4))) : "";
    }
    setQtyByLine(init);
    setPreview(null);
    setNotes("");
  }, [openLines]);

  const openPanel = () => {
    resetDefaults();
    setOpen(true);
  };

  const wanted = openLines
    .map((l) => ({ line: l, qty: Number(qtyByLine[l.id] ?? "") || 0 }))
    .filter((x) => x.qty > 0);

  const overRemaining = wanted.find(
    (x) => x.qty > Number(x.line.remainingQty) + 1e-6,
  );

  const setQty = (lineId: string, v: string) => {
    setQtyByLine((p) => ({ ...p, [lineId]: v }));
    setPreview(null); // SL đổi → gợi ý lô cũ không còn đúng
  };

  const loadPreview = async () => {
    if (wanted.length === 0) {
      toast.error("Nhập số lượng xuất cho ít nhất 1 dòng.");
      return;
    }
    if (overRemaining) {
      toast.error(`${overRemaining.line.itemSku ?? "Dòng"}: vượt SL còn phải giao.`);
      return;
    }
    setLoadingPreview(true);
    try {
      const out: PreviewLine[] = [];
      for (const w of wanted) {
        const res = await fetch("/api/warehouse/fifo-pick", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: w.line.itemId, qty: w.qty }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { picks: FifoPick[]; covered: number };
          error?: { message?: string };
        };
        if (!res.ok || !json.data) {
          toast.error(
            json.error?.message ?? `Không gợi ý được lô cho ${w.line.itemSku ?? "dòng"}.`,
          );
          return;
        }
        out.push({
          lineId: w.line.id,
          sku: w.line.itemSku ?? "—",
          wanted: w.qty,
          picks: json.data.picks,
          covered: json.data.covered,
        });
      }
      setPreview(out);
    } finally {
      setLoadingPreview(false);
    }
  };

  const confirmIssue = async () => {
    if (!preview) return;
    const payloadLines = preview
      .filter((p) => p.picks.length > 0)
      .map((p) => ({
        materialRequestLineId: p.lineId,
        picks: p.picks.map((x) => ({
          lotSerialId: x.lotSerialId,
          binId: x.binId,
          qty: x.qty,
        })),
      }));
    if (payloadLines.length === 0) {
      toast.error("Không có lô khả dụng để xuất — hàng có thể đang chờ QC hoặc đã giữ chỗ.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/material-requests/${requestId}/goods-issue`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ notes: notes.trim() || null, lines: payloadLines }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { issueNo: string; totalQty: number; status: "PARTIAL" | "DELIVERED" };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Không lập được phiếu xuất kho.");
        // Tồn có thể đã đổi (người khác vừa xuất) → bỏ gợi ý cũ.
        setPreview(null);
        invalidateStockQueries(qc);
        return;
      }
      toast.success(
        `Đã lập ${json.data.issueNo} (${fmt(json.data.totalQty)}) — ${requestNo} ${json.data.status === "DELIVERED" ? "đã giao đủ" : "giao một phần"}.`,
      );
      invalidateStockQueries(qc);
      void qc.invalidateQueries({ queryKey: ["notifications"] });
      setOpen(false);
      setPreview(null);
    } finally {
      setSubmitting(false);
    }
  };

  if (openLines.length === 0) return null;

  if (!open) {
    return (
      <Button
        className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
        onClick={openPanel}
      >
        <Truck className="h-4 w-4" aria-hidden /> Lập phiếu xuất kho
      </Button>
    );
  }

  const totalPreview = preview?.reduce((s, p) => s + p.covered, 0) ?? 0;
  const shortLines = preview?.filter((p) => p.covered + 1e-6 < p.wanted) ?? [];

  return (
    <section className="w-full overflow-hidden rounded-2xl border border-emerald-200 bg-white shadow-sm dark:border-emerald-900 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-emerald-100 bg-emerald-50/60 px-5 py-3 dark:border-emerald-900 dark:bg-emerald-950/30">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-emerald-800 dark:text-emerald-300">
          <PackageCheck className="h-4 w-4" aria-hidden /> Lập phiếu xuất kho cho {requestNo}
        </h2>
        <button
          type="button"
          onClick={() => setOpen(false)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-zinc-500 hover:bg-white dark:hover:bg-zinc-800"
          aria-label="Đóng"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="border-b border-zinc-100 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
              <th className="px-4 py-2 text-left">Mã / tên</th>
              <th className="px-4 py-2 text-right">Còn phải giao</th>
              <th className="px-4 py-2 text-right">Khả dụng</th>
              <th className="px-4 py-2 text-right">Xuất lần này</th>
            </tr>
          </thead>
          <tbody>
            {openLines.map((l) => {
              const remaining = Number(l.remainingQty);
              const issuable = Number(l.issuableQty);
              const val = qtyByLine[l.id] ?? "";
              const over = (Number(val) || 0) > remaining + 1e-6;
              return (
                <tr key={l.id} className="border-b border-zinc-50 dark:border-zinc-800/60">
                  <td className="px-4 py-2.5">
                    <div className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                      {l.itemSku ?? "—"}
                    </div>
                    <div className="max-w-xs truncate text-xs text-zinc-500 dark:text-zinc-400">
                      {l.itemName ?? ""}
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-right font-mono text-sm text-zinc-800 dark:text-zinc-200">
                    {fmt(remaining)}
                    {l.itemUom ? (
                      <span className="ml-1 text-xs font-normal text-zinc-500">{l.itemUom}</span>
                    ) : null}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right font-mono text-sm",
                      issuable + 1e-6 < remaining
                        ? "text-amber-700 dark:text-amber-400"
                        : "text-emerald-700 dark:text-emerald-400",
                    )}
                  >
                    {fmt(issuable)}
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      inputMode="decimal"
                      value={val}
                      onChange={(e) => setQty(l.id, e.target.value)}
                      placeholder="0"
                      className={cn(
                        "h-9 w-28 rounded-md border bg-white px-2.5 text-right font-mono text-sm focus:outline-none focus:ring-1 dark:bg-zinc-900 dark:text-zinc-50",
                        over
                          ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                          : "border-zinc-200 focus:border-indigo-500 focus:ring-indigo-500 dark:border-zinc-700",
                      )}
                      aria-label={`SL xuất ${l.itemSku ?? ""}`}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 px-5 py-4">
        <p className="text-xs text-zinc-500 dark:text-zinc-400">
          "Khả dụng" chỉ tính lô đã QC đạt, trừ phần giữ chỗ cho lệnh sản xuất.
          Để trống hoặc 0 = dòng đó chưa giao lần này (giao từng phần được).
        </p>
        <input
          type="text"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={500}
          placeholder="Ghi chú phiếu xuất (tuỳ chọn)…"
          className="h-9 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-50"
        />

        {preview ? (
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Lô sẽ xuất (FIFO / hạn dùng sớm trước)
            </p>
            <ul className="space-y-1.5 text-sm">
              {preview.map((p) => (
                <li key={p.lineId}>
                  <span className="font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                    {p.sku}
                  </span>
                  {p.picks.length === 0 ? (
                    <span className="ml-2 text-red-600 dark:text-red-400">
                      không có lô khả dụng
                    </span>
                  ) : (
                    <span className="ml-2 text-zinc-700 dark:text-zinc-300">
                      {p.picks
                        .map(
                          (x) =>
                            `${x.lotCode ?? x.lotSerialId.slice(0, 8)} @ ${x.binFullCode}: ${fmt(x.qty)}`,
                        )
                        .join(" · ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {shortLines.length > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                Không đủ hàng khả dụng cho{" "}
                {shortLines
                  .map((p) => `${p.sku} (thiếu ${fmt(p.wanted - p.covered)})`)
                  .join(", ")}{" "}
                — chỉ xuất phần có sẵn, phần còn lại giao lần sau.
              </p>
            ) : null}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            variant="outline"
            onClick={loadPreview}
            disabled={loadingPreview || submitting || wanted.length === 0 || !!overRemaining}
          >
            {loadingPreview ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Wand2 className="h-4 w-4" aria-hidden />
            )}
            {preview ? "Gợi ý lại" : "Gợi ý lô (FIFO)"}
          </Button>
          <Button
            className="bg-emerald-600 text-white hover:bg-emerald-700 dark:bg-emerald-500 dark:hover:bg-emerald-400"
            onClick={confirmIssue}
            disabled={!preview || totalPreview <= 0 || submitting}
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : (
              <Truck className="h-4 w-4" aria-hidden />
            )}
            Xác nhận xuất {preview && totalPreview > 0 ? fmt(totalPreview) : ""}
          </Button>
        </div>
      </div>
    </section>
  );
}
