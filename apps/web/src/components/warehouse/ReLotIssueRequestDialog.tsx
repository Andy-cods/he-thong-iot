"use client";

import * as React from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetBody,
  SheetContent,
  SheetFooter,
  SheetHeaderNav,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { formatQty } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * V4.4 (Việc 2) — "Chọn lại lô" khi duyệt Yêu cầu xuất kho (ISR) thất bại vì
 * lô đã khoá lúc tạo nay không còn đủ (người khác xuất bớt trong lúc chờ
 * duyệt). Mở khi `PendingRequestsPanel` nhận lỗi tồn (409) từ approve.
 *
 * Gợi ý lại FIFO cho từng dòng qua `/api/warehouse/fifo-pick` (API sẵn có,
 * không chế thêm) → cho phép duyệt lại với lô mới, hoặc xuất ÍT HƠN kèm lý do
 * bắt buộc (server `validateIsrOverridePicks` chặn vượt SL đã xin ban đầu).
 */

interface FifoPick {
  lotSerialId: string;
  lotCode: string | null;
  binId: string;
  binFullCode: string;
  qty: number;
}

interface LineState {
  itemId: string;
  sku: string;
  original: number;
  desired: number;
  loading: boolean;
  picks: FifoPick[];
  covered: number;
  error: string | null;
}

export interface ReLotRequestSummary {
  id: string;
  requestNo: string;
  picksJson: Array<{
    itemId: string;
    sku?: string | null;
    picks: Array<{ qty: number }>;
  }>;
}

const EPS = 1e-6;
const fmt = (n: number) => formatQty(n);

export function ReLotIssueRequestDialog({
  open,
  onOpenChange,
  request,
  onApproved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  request: ReLotRequestSummary | null;
  onApproved: (result: { totalQty: number; issueNo?: string }) => void;
}) {
  const [lines, setLines] = React.useState<LineState[]>([]);
  const [partialNote, setPartialNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  const loadSuggestions = React.useCallback(async (req: ReLotRequestSummary) => {
    const initial: LineState[] = req.picksJson.map((l) => ({
      itemId: l.itemId,
      sku: l.sku ?? l.itemId.slice(0, 8),
      original: l.picks.reduce((s, p) => s + (Number(p.qty) || 0), 0),
      desired: 0,
      loading: true,
      picks: [],
      covered: 0,
      error: null,
    }));
    setLines(initial);
    for (const line of initial) {
      try {
        const res = await fetch("/api/warehouse/fifo-pick", {
          method: "POST",
          credentials: "include",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ itemId: line.itemId, qty: line.original }),
        });
        const json = (await res.json().catch(() => ({}))) as {
          data?: { picks: FifoPick[]; covered: number };
          error?: { message?: string };
        };
        setLines((prev) =>
          prev.map((l) =>
            l.itemId === line.itemId
              ? {
                  ...l,
                  loading: false,
                  picks: json.data?.picks ?? [],
                  covered: json.data?.covered ?? 0,
                  desired: json.data?.covered ?? 0,
                  error: !res.ok ? (json.error?.message ?? "Lỗi gợi ý lô") : null,
                }
              : l,
          ),
        );
      } catch {
        setLines((prev) =>
          prev.map((l) =>
            l.itemId === line.itemId ? { ...l, loading: false, error: "Lỗi kết nối" } : l,
          ),
        );
      }
    }
  }, []);

  React.useEffect(() => {
    if (open && request) {
      setPartialNote("");
      void loadSuggestions(request);
    }
  }, [open, request, loadSuggestions]);

  const totalDesired = lines.reduce((s, l) => s + l.desired, 0);
  const totalOriginal = lines.reduce((s, l) => s + l.original, 0);
  const isPartial = totalDesired + EPS < totalOriginal;
  const anyOverCovered = lines.some((l) => l.desired > l.covered + EPS);
  const anyLoading = lines.some((l) => l.loading);

  const handleConfirm = async () => {
    if (!request) return;
    if (totalDesired <= EPS) {
      toast.error("Không có lô nào để xuất — kiểm tra lại tồn kho.");
      return;
    }
    if (isPartial && partialNote.trim().length < 3) {
      toast.error("Nhập lý do xuất một phần (tối thiểu 3 ký tự).");
      return;
    }
    setSubmitting(true);
    try {
      const picks = lines
        .filter((l) => l.desired > EPS)
        .map((l) => {
          // Cắt picks theo đúng desired (FIFO thứ tự đã gợi ý — lấy dần cho đủ desired).
          let remaining = l.desired;
          const trimmed: Array<{ lotSerialId: string; lotCode: string | null; binId: string; binCode: string | null; qty: number }> = [];
          for (const p of l.picks) {
            if (remaining <= EPS) break;
            const take = Math.min(p.qty, remaining);
            trimmed.push({ lotSerialId: p.lotSerialId, lotCode: p.lotCode, binId: p.binId, binCode: p.binFullCode, qty: take });
            remaining -= take;
          }
          return { itemId: l.itemId, sku: l.sku, picks: trimmed };
        })
        .filter((l) => l.picks.length > 0);

      const res = await fetch(`/api/warehouse/issue-request/${request.id}/approve`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          picks,
          partialNote: isPartial ? partialNote.trim() : undefined,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { totalQty: number; issueNo?: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.data) {
        toast.error(json.error?.message ?? "Duyệt lại thất bại.");
        return;
      }
      toast.success(
        `Đã duyệt lại ${request.requestNo}${json.data.issueNo ? ` → phiếu xuất ${json.data.issueNo}` : ""} · ${fmt(json.data.totalQty)} đơn vị.`,
      );
      onApproved(json.data);
      onOpenChange(false);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    // V4.4 (chủ xưởng) — Dialog giữa màn → Sheet (N6: nhiều dòng/mã hàng,
    // mobile toàn màn thay bị bóp giữa trang); giữ nguyên hành vi/logic.
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col">
        <SheetHeaderNav title={`Chọn lại lô — ${request?.requestNo ?? ""}`} onCancel={() => onOpenChange(false)} />
        <SheetBody className="space-y-3">
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Lô đã chọn lúc tạo yêu cầu không còn đủ (đã có người xuất bớt).
            Gợi ý lô mới theo FIFO — có thể xuất ít hơn số đã xin ban đầu kèm
            lý do, phần còn thiếu tạo yêu cầu mới sau.
          </p>

          <div className="space-y-3">
          {lines.map((l) => (
            <div
              key={l.itemId}
              className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-700"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-sm font-semibold text-indigo-600 dark:text-indigo-400">
                  {l.sku}
                </span>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">
                  Đã xin: <span className="font-mono">{fmt(l.original)}</span>
                </span>
              </div>
              {l.loading ? (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400">
                  <Loader2 className="h-3 w-3 animate-spin" aria-hidden /> Đang gợi ý lô…
                </p>
              ) : l.error ? (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">{l.error}</p>
              ) : l.picks.length === 0 ? (
                <p className="mt-1.5 text-xs text-red-600 dark:text-red-400">
                  Không còn lô khả dụng nào cho mã hàng này.
                </p>
              ) : (
                <>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-600 dark:text-zinc-400">
                    {l.picks.map((p) => (
                      <li key={p.lotSerialId}>
                        {p.lotCode ?? p.lotSerialId.slice(0, 8)} @ {p.binFullCode}:{" "}
                        <span className="font-mono">{fmt(p.qty)}</span> khả dụng
                      </li>
                    ))}
                  </ul>
                  <div className="mt-1.5 flex items-center gap-2">
                    <label className="text-xs text-zinc-500 dark:text-zinc-400">SL xuất lần này:</label>
                    <input
                      type="number"
                      min="0"
                      max={l.covered}
                      step="any"
                      value={l.desired}
                      onChange={(e) =>
                        setLines((prev) =>
                          prev.map((x) =>
                            x.itemId === l.itemId
                              ? { ...x, desired: Math.max(0, Number(e.target.value) || 0) }
                              : x,
                          ),
                        )
                      }
                      className={cn(
                        // V4.4 (chủ xưởng) — h-8 (32px) < 44px vùng chạm tối thiểu → h-11.
                        "h-11 w-28 rounded-md border bg-white px-2 text-right font-mono text-sm tabular-nums dark:bg-zinc-900 dark:text-zinc-50",
                        l.desired > l.covered + EPS
                          ? "border-red-400 dark:border-red-500"
                          : "border-zinc-200 dark:border-zinc-700",
                      )}
                    />
                    {l.covered + EPS < l.original ? (
                      <span className="text-xs text-amber-700 dark:text-amber-400">
                        chỉ còn {fmt(l.covered)}/{fmt(l.original)}
                      </span>
                    ) : null}
                  </div>
                </>
              )}
            </div>
          ))}
          </div>

          {isPartial ? (
            <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
              <p className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-amber-800 dark:text-amber-300">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden />
                Xuất {fmt(totalDesired)}/{fmt(totalOriginal)} — ít hơn số đã xin ban đầu.
              </p>
              <label className="mb-1 block text-xs font-medium text-zinc-700 dark:text-zinc-300">
                Lý do xuất một phần <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={partialNote}
                onChange={(e) => setPartialNote(e.target.value)}
                rows={2}
                maxLength={500}
                placeholder="VD: lô hụt, phần còn lại chờ nhập thêm."
                autoFocus
              />
              {partialNote.trim().length > 0 && partialNote.trim().length < 3 ? (
                <p className="mt-1 text-xs text-red-600 dark:text-red-400">Lý do tối thiểu 3 ký tự.</p>
              ) : null}
            </div>
          ) : null}
        </SheetBody>

        <SheetFooter className="flex-wrap gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={submitting}>
            Huỷ
          </Button>
          <Button
            variant="outline"
            onClick={() => request && void loadSuggestions(request)}
            disabled={submitting || anyLoading}
          >
            <RefreshCw className="h-4 w-4" aria-hidden />
            Gợi ý lại
          </Button>
          <Button
            // V4.4 (chủ xưởng) — violet lệch khỏi accent indigo-600 chuẩn
            // (1 màu thương hiệu duy nhất cho hành động chính).
            onClick={() => void handleConfirm()}
            disabled={
              submitting ||
              anyLoading ||
              anyOverCovered ||
              totalDesired <= EPS ||
              (isPartial && partialNote.trim().length < 3)
            }
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {isPartial
              ? `Xuất một phần (${fmt(totalDesired)})`
              : `Duyệt lại + xuất (${fmt(totalDesired)})`}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
