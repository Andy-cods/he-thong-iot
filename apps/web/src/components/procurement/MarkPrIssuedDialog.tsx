"use client";

import * as React from "react";
import { AlertTriangle, Loader2, PackageCheck, Truck, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useConfirm } from "@/components/ui/confirm-dialog";
import { splitPicksAcrossLines } from "@/lib/pr-issue-split";
import {
  useMarkPRIssued,
  type MarkPRIssuedPick,
} from "@/hooks/usePurchaseRequests";

/**
 * V4.2 (TASK "Trừ tồn luôn") — Dialog mở khi bấm "Đã xuất kho" trên phiếu Đề
 * xuất vật tư (PR/YCVT/DNVT). Trước đây nút này chỉ ghi mốc thời gian, KHÔNG
 * trừ tồn → Kho phải xuất lại lần 2 ở Sơ đồ kho → tồn lệch. Nay 1 thao tác:
 * chọn lô/bin cho từng dòng → trừ tồn thật + sinh phiếu xuất PX + ghi mốc.
 *
 * UX mượn nguyên mẫu `GoodsIssuePanel` (Đợt 1b): nhập SL xuất từng dòng →
 * "Gợi ý lô (FIFO)" qua `/api/warehouse/fifo-pick` (đã dùng ở nhiều nơi) →
 * xem trước lô/vị trí → "Xác nhận xuất kho".
 *
 * Escape hatch: dòng PR có thể không gắn vật tư trong danh mục (nhập tay)
 * hoặc cả phiếu là hàng mua ngoài giao thẳng không qua kho → tick "Ghi nhận
 * đã xuất — KHÔNG trừ tồn" kèm lý do bắt buộc (audit rõ, không lặng lẽ bỏ qua).
 */

export interface MarkPrIssuedLine {
  id: string;
  lineNo: number;
  itemId: string | null;
  sku: string | null;
  name: string | null;
  uom?: string | null;
  itemUom?: string | null;
  qty: string;
  approvedQty?: string | null;
  /** L8 — đã xuất ở các đợt trước. */
  issuedQty?: number;
  /** T2 — trần xuất do server tính (giai đoạn + hàng PO đã về); không có → tính theo giai đoạn. */
  issueCap?: number;
  /** Phần còn xuất được do server tính từ `prIssueRight` (= cap − đã xuất, 0 nếu không giữ chỗ). */
  issueRemaining?: number;
  /** Tồn KHẢ DỤNG sau giữ chỗ phiếu khác, lũy kế theo vật tư (không phải tồn thô). */
  availableQty?: number | null;
}

/** Còn được xuất — server tính từ SỔ DÒNG (cap − đã xuất). Không có số server → 0 (không đoán phía client). */
function remainingOf(l: MarkPrIssuedLine, _stage: "WAREHOUSE" | "FINAL" = "FINAL"): number {
  if (l.issueRemaining != null) return l.issueRemaining;
  if (l.issueCap != null) return Math.max(0, l.issueCap - (l.issuedQty ?? 0));
  return 0;
}

interface FifoPick {
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binFullCode: string;
  qty: number;
}

interface PreviewLine {
  prLineId: string;
  sku: string;
  wanted: number;
  picks: FifoPick[];
  covered: number;
}

interface AvailableState {
  loading: boolean;
  qty: number | null;
}

const fmt = (n: number) => formatQty(n);
const EPS = 1e-6;

export function MarkPrIssuedDialog({
  open,
  onOpenChange,
  prId,
  prLabel,
  lines,
  stage = "FINAL",
  toOrder = 0,
  noWaiting = true,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  prId: string;
  prLabel: string;
  lines: MarkPrIssuedLine[];
  /** WAREHOUSE = đã qua Kho duyệt, chưa duyệt cuối: chỉ xuất phần có sẵn, không kết thúc/không-trừ-tồn. */
  stage?: "WAREHOUSE" | "FINAL";
  /** Sổ dòng: SL còn chưa đặt mua của phiếu — kết thúc sẽ BỎ phần này (cần lý do). */
  toOrder?: number;
  /** Sổ dòng: không còn hàng đang về / chờ QC → được kết thúc / ghi nhận không trừ tồn. */
  noWaiting?: boolean;
}) {
  const markIssued = useMarkPRIssued(prId);

  const stockLines = React.useMemo(
    () => lines.filter((l) => !!l.itemId),
    [lines],
  );
  const noItemLines = React.useMemo(
    () => lines.filter((l) => !l.itemId),
    [lines],
  );

  const [qtyByLine, setQtyByLine] = React.useState<Record<string, string>>({});
  const [availableByItem, setAvailableByItem] = React.useState<
    Record<string, AvailableState>
  >({});
  const [preview, setPreview] = React.useState<PreviewLine[] | null>(null);
  const [loadingPreview, setLoadingPreview] = React.useState(false);
  const [noStock, setNoStock] = React.useState(false);
  const [noStockReason, setNoStockReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [finishReason, setFinishReason] = React.useState("");
  const dropsUnordered = toOrder > 5e-5;

  // Reset + tải "Khả dụng" mỗi lần mở dialog.
  React.useEffect(() => {
    if (!open) return;
    setPreview(null);
    setNoStock(false);
    setNoStockReason("");
    setNotes("");
    setFinishReason("");
    const init: Record<string, string> = {};
    for (const l of stockLines) {
      const cap = remainingOf(l, stage);
      init[l.id] = cap > 0 ? String(Number(cap.toFixed(4))) : "";
    }
    // "Khả dụng" = tồn khả dụng SAU giữ chỗ cho phiếu khác (server tính, lũy kế theo vật tư) — không tồn thô.
    const avail: Record<string, AvailableState> = {};
    for (const l of stockLines) {
      const q = l.availableQty ?? null;
      avail[l.id] = { loading: false, qty: q };
      if (q != null) {
        const cap = remainingOf(l, stage);
        const v = Math.min(cap, q);
        init[l.id] = v > 0 ? String(Number(v.toFixed(4))) : "";
      }
    }
    setQtyByLine(init);
    setAvailableByItem(avail);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, prId]);

  const setQty = (lineId: string, v: string) => {
    setQtyByLine((p) => ({ ...p, [lineId]: v }));
    setPreview(null);
  };

  const wanted = stockLines
    .map((l) => ({ line: l, qty: Number(qtyByLine[l.id] ?? "") || 0 }))
    .filter((x) => x.qty > 0);

  const overCap = wanted.find((x) => x.qty > remainingOf(x.line, stage) + EPS);

  const loadPreview = async () => {
    if (wanted.length === 0) {
      toast.error("Nhập số lượng xuất cho ít nhất 1 dòng.");
      return;
    }
    if (overCap) {
      toast.error(
        `${overCap.line.sku ?? "Dòng"}: vượt SL còn được xuất (${fmt(remainingOf(overCap.line, stage))}).`,
      );
      return;
    }
    setLoadingPreview(true);
    try {
      // N2 — gộp SL theo VẬT TƯ, gọi FIFO MỘT lần cho tổng rồi chia lô xuống các dòng (theo thứ tự dòng).
      const byItem = new Map<string, typeof wanted>();
      for (const w of wanted) {
        const k = w.line.itemId!;
        byItem.set(k, [...(byItem.get(k) ?? []), w]);
      }
      const split = new Map<string, FifoPick[]>();
      for (const [itemId, ws] of byItem) {
        const total = Math.round(ws.reduce((a, w) => a + w.qty, 0) * 1e4) / 1e4;
        const res = await fetch("/api/warehouse/fifo-pick", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId, qty: total }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { picks: FifoPick[]; covered: number };
          error?: { message?: string };
        };
        if (!res.ok || !json.data) {
          toast.error(
            json.error?.message ?? `Không gợi ý được lô cho ${ws[0]!.line.sku ?? "dòng"}.`,
          );
          return;
        }
        const parts = splitPicksAcrossLines(
          ws.map((w) => ({ lineId: w.line.id, qty: w.qty })),
          json.data.picks,
        );
        for (const [lineId, ps] of parts) split.set(lineId, ps);
      }
      const out: PreviewLine[] = wanted.map((w) => {
        const ps = split.get(w.line.id) ?? [];
        return {
          prLineId: w.line.id,
          sku: w.line.sku ?? "—",
          wanted: w.qty,
          picks: ps,
          covered: Math.round(ps.reduce((a, p) => a + p.qty, 0) * 1e4) / 1e4,
        };
      });
      setPreview(out);
    } finally {
      setLoadingPreview(false);
    }
  };

  const totalPreview = preview?.reduce((s, p) => s + p.covered, 0) ?? 0;
  const shortLines = preview?.filter((p) => p.covered + EPS < p.wanted) ?? [];

  const anyIssued = stockLines.some((l) => (l.issuedQty ?? 0) > EPS);
  // N6 — chưa xuất đợt nào, không còn gì xuất được, chỉ còn bỏ phần chưa mua → hộp thoại "Kết thúc phiếu".
  const dropMode =
    stage !== "WAREHOUSE" &&
    !anyIssued &&
    dropsUnordered &&
    noWaiting &&
    stockLines.every((l) => remainingOf(l, stage) <= EPS);

  // L8 — "Kết thúc, không xuất thêm": đóng quy trình xuất dù còn dòng chưa đủ.
  const askConfirm = useConfirm();
  const finishNow = async () => {
    if (dropsUnordered && finishReason.trim().length < 3) {
      toast.error("Còn phần chưa đặt mua — nhập lý do bỏ phần này (tối thiểu 3 ký tự).");
      return;
    }
    const ok = await askConfirm({
      title: "Kết thúc xuất kho?",
      description: dropsUnordered
        ? `Còn ${fmt(toOrder)} chưa đặt mua — kết thúc sẽ BỎ phần này. Các dòng chưa xuất đủ được chốt ở số đã xuất; phiếu chuyển "Hoàn tất".`
        : "Các dòng chưa xuất đủ sẽ được chốt ở số đã xuất. Phiếu chuyển \"Hoàn tất\" và KHÔNG xuất thêm được nữa.",
      confirmLabel: "Kết thúc",
    });
    if (!ok) return;
    markIssued.mutate(
      { finish: true, finishReason: finishReason.trim() || null },
      {
        onSuccess: () => {
          toast.success("Đã kết thúc xuất kho — phiếu hoàn tất.");
          onOpenChange(false);
        },
        onError: (e) => toast.error(`Lỗi: ${(e as Error).message}`),
      },
    );
  };

  const confirmIssue = () => {
    if (noStock) {
      if (noStockReason.trim().length < 3) {
        toast.error("Nhập lý do (tối thiểu 3 ký tự) khi ghi nhận không trừ tồn.");
        return;
      }
      markIssued.mutate(
        { noStockConfirm: true, noStockReason: noStockReason.trim() },
        {
          onSuccess: () => {
            toast.success("Đã ghi nhận xuất kho (không trừ tồn).");
            onOpenChange(false);
          },
          onError: (e) => toast.error(`Lỗi: ${(e as Error).message}`),
        },
      );
      return;
    }

    if (!preview) {
      toast.error('Bấm "Gợi ý lô (FIFO)" trước khi xác nhận.');
      return;
    }
    const picks: MarkPRIssuedPick[] = preview
      .filter((p) => p.picks.length > 0)
      .flatMap((p) =>
        p.picks.map((x) => ({
          prLineId: p.prLineId,
          lotSerialId: x.lotSerialId,
          binId: x.binId,
          qty: x.qty,
        })),
      );
    if (picks.length === 0) {
      toast.error(
        "Không có lô khả dụng để xuất — hàng có thể đang chờ QC hoặc đã giữ chỗ.",
      );
      return;
    }
    markIssued.mutate(
      { picks, notes: notes.trim() || null },
      {
        onSuccess: (res) => {
          const issueNo = res.meta?.goodsIssue?.issueNo;
          const done = res.meta?.complete !== false;
          toast.success(
            done
              ? issueNo
                ? `Đã xuất kho đủ — sinh phiếu ${issueNo}, phiếu hoàn tất.`
                : "Đã ghi nhận xuất kho."
              : `Đã xuất một phần — phiếu ${issueNo ?? ""}. Còn dòng chưa đủ, có thể xuất tiếp đợt sau.`,
          );
          onOpenChange(false);
        },
        onError: (e) => toast.error(`Lỗi: ${(e as Error).message}`),
      },
    );
  };

  const submitting = markIssued.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg" className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{dropMode ? "Kết thúc phiếu — bỏ phần chưa mua" : anyIssued ? "Xuất kho đợt tiếp" : "Đã xuất kho"} — {prLabel}</DialogTitle>
          <DialogDescription>
            {dropMode
              ? "Không còn hàng đang về và chưa có gì để xuất. Kết thúc phiếu sẽ BỎ phần chưa đặt mua — nhập lý do để xác nhận."
              : "Chọn lô/vị trí xuất cho từng dòng — hệ thống trừ tồn thật + sinh phiếu xuất kho ngay, không cần xuất lại ở Sơ đồ kho. Có thể xuất nhiều đợt; phiếu hoàn tất khi mọi dòng đã xuất đủ."}
          </DialogDescription>
        </DialogHeader>

        {!noStock && !dropMode ? (
          <div className="space-y-3">
            {stockLines.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
                Phiếu không có dòng nào gắn vật tư trong danh mục — dùng mục
                "Ghi nhận đã xuất — không trừ tồn" bên dưới.
              </p>
            ) : (
              <>
              {/* A5 — mobile: mỗi dòng 1 thẻ (bảng 5 cột bị cắt ở 390px). */}
              <ul className="space-y-2 md:hidden">
                {stockLines.map((l) => {
                  const cap = remainingOf(l, stage);
                  const val = qtyByLine[l.id] ?? "";
                  const over = (Number(val) || 0) > cap + EPS;
                  const avail = availableByItem[l.id];
                  const uom = l.uom ?? l.itemUom;
                  return (
                    <li
                      key={l.id}
                      className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
                    >
                      <div className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                        {l.sku ?? "—"}
                      </div>
                      <div className="break-words text-xs text-zinc-500 dark:text-zinc-400">
                        {l.name ?? ""}
                      </div>
                      <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <dt className="text-zinc-400">Đề xuất / Cần mua</dt>
                          <dd className="font-mono text-sm text-zinc-800 dark:text-zinc-200">
                            {fmt(Number(l.qty))}
                            {l.approvedQty != null ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {" "}/ {fmt(Number(l.approvedQty))}
                              </span>
                            ) : null}
                            {uom ? <span className="ml-1 text-xs text-zinc-500">{uom}</span> : null}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-400">Đã xuất</dt>
                          <dd className="font-mono text-sm text-zinc-600 dark:text-zinc-300">
                            {(l.issuedQty ?? 0) > EPS ? fmt(l.issuedQty ?? 0) : "—"}
                          </dd>
                        </div>
                        <div>
                          <dt className="text-zinc-400">Khả dụng</dt>
                          <dd className="font-mono text-sm">
                            {avail?.loading ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin text-zinc-400" aria-hidden />
                            ) : avail?.qty != null ? (
                              <span
                                className={cn(
                                  avail.qty + EPS < cap
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-emerald-700 dark:text-emerald-400",
                                )}
                              >
                                {fmt(avail.qty)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </dd>
                        </div>
                      </dl>
                      <label className="mt-2 flex items-center justify-between gap-3 text-xs text-zinc-500">
                        <span>Xuất lần này (còn {fmt(cap)})</span>
                        <input
                          type="number"
                          min="0"
                          step="any"
                          inputMode="decimal"
                          value={val}
                          onChange={(e) => setQty(l.id, e.target.value)}
                          placeholder="0"
                          className={cn(
                            "h-10 w-28 rounded-md border bg-white px-2 text-right font-mono text-sm focus:outline-none focus:ring-1 dark:bg-zinc-900 dark:text-zinc-50",
                            over
                              ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                              : "border-zinc-200 focus:border-indigo-500 focus:ring-indigo-500 dark:border-zinc-700",
                          )}
                          aria-label={`SL xuất ${l.sku ?? ""} (mobile)`}
                        />
                      </label>
                    </li>
                  );
                })}
              </ul>
              <div className="hidden overflow-x-auto rounded-lg border border-zinc-200 md:block dark:border-zinc-700">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:border-zinc-800 dark:text-zinc-500">
                      <th className="px-3 py-2 text-left">Mã / tên</th>
                      <th className="px-3 py-2 text-right">Đề xuất / Cần mua</th>
                      <th className="px-3 py-2 text-right">Đã xuất</th>
                      <th className="px-3 py-2 text-right">Khả dụng</th>
                      <th className="px-3 py-2 text-right">Xuất lần này</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stockLines.map((l) => {
                      const cap = remainingOf(l, stage);
                      const val = qtyByLine[l.id] ?? "";
                      const over = (Number(val) || 0) > cap + EPS;
                      const avail = availableByItem[l.id];
                      return (
                        <tr
                          key={l.id}
                          className="border-b border-zinc-50 dark:border-zinc-800/60"
                        >
                          <td className="px-3 py-2.5">
                            <div className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                              {l.sku ?? "—"}
                            </div>
                            <div className="max-w-[160px] truncate text-xs text-zinc-500 dark:text-zinc-400">
                              {l.name ?? ""}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm text-zinc-800 dark:text-zinc-200">
                            {fmt(Number(l.qty))}
                            {l.approvedQty != null ? (
                              <span className="text-emerald-600 dark:text-emerald-400">
                                {" "}/ {fmt(Number(l.approvedQty))}
                              </span>
                            ) : null}
                            {l.uom ?? l.itemUom ? (
                              <span className="ml-1 text-xs font-normal text-zinc-500">
                                {l.uom ?? l.itemUom}
                              </span>
                            ) : null}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm text-zinc-600 dark:text-zinc-300">
                            {(l.issuedQty ?? 0) > EPS ? fmt(l.issuedQty ?? 0) : "—"}
                          </td>
                          <td className="px-3 py-2.5 text-right font-mono text-sm">
                            {avail?.loading ? (
                              <Loader2
                                className="ml-auto h-3.5 w-3.5 animate-spin text-zinc-400"
                                aria-hidden
                              />
                            ) : avail?.qty != null ? (
                              <span
                                className={cn(
                                  avail.qty + EPS < cap
                                    ? "text-amber-700 dark:text-amber-400"
                                    : "text-emerald-700 dark:text-emerald-400",
                                )}
                              >
                                {fmt(avail.qty)}
                              </span>
                            ) : (
                              <span className="text-zinc-400">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <input
                              type="number"
                              min="0"
                              step="any"
                              inputMode="decimal"
                              value={val}
                              onChange={(e) => setQty(l.id, e.target.value)}
                              placeholder="0"
                              className={cn(
                                "h-9 w-24 rounded-md border bg-white px-2 text-right font-mono text-sm focus:outline-none focus:ring-1 dark:bg-zinc-900 dark:text-zinc-50",
                                over
                                  ? "border-red-400 focus:border-red-500 focus:ring-red-500"
                                  : "border-zinc-200 focus:border-indigo-500 focus:ring-indigo-500 dark:border-zinc-700",
                              )}
                              aria-label={`SL xuất ${l.sku ?? ""}`}
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              </>
            )}

            {noItemLines.length > 0 ? (
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {noItemLines.length} dòng chưa gắn vật tư trong danh mục (nhập
                tay):{" "}
                {noItemLines.map((l) => l.sku ?? l.name ?? `dòng ${l.lineNo}`).join(", ")}
                {" "}— không trừ tồn được cho các dòng này.
              </p>
            ) : null}

            {preview ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 dark:border-zinc-700 dark:bg-zinc-800/40">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                  Lô sẽ xuất (FIFO / hạn dùng sớm trước)
                </p>
                <ul className="space-y-1.5 text-sm">
                  {preview.map((p) => (
                    <li key={p.prLineId}>
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
                      .join(", ")}
                    .
                  </p>
                ) : null}
              </div>
            ) : null}

            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={500}
              rows={2}
              placeholder="Ghi chú phiếu xuất (tuỳ chọn)…"
            />
          </div>
        ) : null}

        {stage === "WAREHOUSE" ? (
          <p className="rounded-md border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-200">
            Phiếu còn chờ duyệt mua — bạn chỉ xuất phần CÓ SẴN trong kho (đề xuất − SL cần mua).
            Phiếu chưa hoàn tất; phần cần mua sẽ xuất sau khi duyệt cuối và hàng về.
          </p>
        ) : null}
        <div
          className={
            "flex items-start gap-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-800/40" +
            (stage === "WAREHOUSE" || !noWaiting || dropMode ? " hidden" : "")
          }
        >
          <Checkbox
            id="pr-issue-no-stock"
            checked={noStock}
            onCheckedChange={(c) => {
              setNoStock(c === true);
              setPreview(null);
            }}
            className="mt-0.5"
          />
          <div className="min-w-0 flex-1 space-y-2">
            <Label htmlFor="pr-issue-no-stock" className="text-xs font-medium">
              Ghi nhận đã xuất — KHÔNG trừ tồn (vật tư mua ngoài giao thẳng,
              không qua kho)
            </Label>
            {noStock ? (
              <Textarea
                value={noStockReason}
                onChange={(e) => setNoStockReason(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="Bắt buộc nêu rõ lý do — VD: hàng gia công ngoài giao thẳng công trường, không nhập kho."
                autoFocus
              />
            ) : null}
          </div>
        </div>

        {stage !== "WAREHOUSE" && !noStock && noWaiting && dropsUnordered ? (
          <div className="space-y-1 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
            <Label htmlFor="pr-finish-reason" className="text-xs font-medium">
              Còn {fmt(toOrder)} chưa đặt mua — nếu “Kết thúc”, phần này bị bỏ. Lý do:
            </Label>
            <Textarea
              id="pr-finish-reason"
              value={finishReason}
              onChange={(e) => setFinishReason(e.target.value)}
              rows={2}
              maxLength={500}
              placeholder="VD: NCC ngừng cung cấp, bộ phận đề xuất không cần nữa…"
            />
          </div>
        ) : null}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          {stage !== "WAREHOUSE" && !noStock && noWaiting && (anyIssued || dropsUnordered) ? (
            <Button
              variant="outline"
              onClick={finishNow}
              disabled={submitting}
              title={anyIssued ? "Đóng quy trình xuất kho dù còn dòng chưa xuất đủ" : "Bỏ phần chưa đặt mua và đóng phiếu"}
            >
              {anyIssued ? "Kết thúc, không xuất thêm" : "Kết thúc – bỏ phần mua"}
            </Button>
          ) : null}
          {!noStock && !dropMode ? (
            <Button
              variant="outline"
              onClick={() => void loadPreview()}
              disabled={
                loadingPreview || submitting || wanted.length === 0 || !!overCap
              }
            >
              {loadingPreview ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              ) : (
                <Wand2 className="h-4 w-4" aria-hidden />
              )}
              {preview ? "Gợi ý lại" : "Gợi ý lô (FIFO)"}
            </Button>
          ) : null}
          {dropMode ? null : (
          <Button
            className="bg-violet-600 text-white hover:bg-violet-700 dark:bg-violet-500 dark:hover:bg-violet-400"
            onClick={confirmIssue}
            disabled={
              submitting ||
              (noStock
                ? noStockReason.trim().length < 3
                : !preview || totalPreview <= 0)
            }
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            ) : noStock ? (
              <PackageCheck className="h-4 w-4" aria-hidden />
            ) : (
              <Truck className="h-4 w-4" aria-hidden />
            )}
            {noStock
              ? "Xác nhận (không trừ tồn)"
              : `Xác nhận xuất kho${preview && totalPreview > 0 ? ` (${fmt(totalPreview)})` : ""}`}
          </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
