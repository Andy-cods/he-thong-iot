"use client";

import * as React from "react";
import { AlertTriangle, FileDown, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatTile } from "@/components/ui/data-table";
import { Sheet, SheetBody, SheetContent, SheetFooter, SheetHeaderNav } from "@/components/ui/sheet";
import { useConfirm, usePrompt } from "@/components/ui/confirm-dialog";
import { StatusPill } from "@/components/ui/status-badge";
import { useSession } from "@/hooks/useSession";
import { formatDateTime, formatMoney, formatQty } from "@/lib/format";
import { invTxTypeLabel } from "@/lib/status";
import { cn } from "@/lib/utils";

/**
 * V4.3 Việc 2 — Sheet chi tiết 1 phiên kiểm kê. 3 chế độ theo trạng thái:
 *   DRAFT             → đếm (input lớn theo từng ô/vật tư/lô, lưu nháp liên tục)
 *   PENDING_APPROVAL  → duyệt (Giám đốc: Duyệt & chốt / Từ chối; Kho: chỉ xem)
 *   APPROVED/REJECTED/CANCELLED → xem lại (read-only)
 */

interface LineRow {
  id: string;
  binId: string;
  binFullCode: string;
  itemId: string;
  sku: string;
  name: string;
  uom: string | null;
  lotCode: string | null;
  bookQty: number;
  countedQty: number | null;
  notes: string | null;
  unitPrice: number | null;
}

interface SessionInfo {
  id: string;
  code: string;
  status: string;
  scopeNote: string | null;
  notes: string | null;
  snapshotAt: string;
  createdBy: string;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectReason: string | null;
}

interface VarianceSummary {
  totalLines: number;
  countedLines: number;
  uncountedLines: number;
  diffLines: number;
  surplusQty: number;
  shortageQty: number;
  surplusValue: number | null;
  shortageValue: number | null;
}

interface TxnWarning {
  binFullCode: string;
  sku: string;
  txType: string;
  qty: number;
  occurredAt: string;
}

interface DetailResponse {
  session: SessionInfo;
  lines: LineRow[];
  variance: VarianceSummary;
  txnWarnings: TxnWarning[];
}

export function StocktakeSessionSheet({
  sessionId,
  open,
  onOpenChange,
  onChanged,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChanged: () => void;
}) {
  const { data: me } = useSession();
  const isAdmin = me?.roles.includes("admin") ?? false;
  const myUserId = me?.id;
  const askConfirm = useConfirm();
  const askReason = usePrompt();

  const [detail, setDetail] = React.useState<DetailResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [counts, setCounts] = React.useState<Record<string, string>>({});
  const [dirty, setDirty] = React.useState<Set<string>>(new Set());
  const [saving, setSaving] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = React.useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { data: DetailResponse };
      setDetail(json.data);
      const initCounts: Record<string, string> = {};
      for (const l of json.data.lines) {
        initCounts[l.id] = l.countedQty == null ? "" : String(l.countedQty);
      }
      setCounts(initCounts);
      setDirty(new Set());
    } catch (e) {
      toast.error((e as Error).message ?? "Không tải được phiên kiểm kê");
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  React.useEffect(() => {
    if (open && sessionId) void load();
  }, [open, sessionId, load]);

  const flushSave = React.useCallback(async () => {
    if (!sessionId || dirty.size === 0) return;
    const ids = [...dirty];
    setSaving(true);
    try {
      const payload = ids.map((lineId) => ({
        lineId,
        countedQty: counts[lineId] === "" || counts[lineId] === undefined ? null : Number(counts[lineId]),
      }));
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/counts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ counts: payload }),
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => null)) as { error?: { message: string } } | null;
        throw new Error(json?.error?.message ?? `HTTP ${res.status}`);
      }
      setDirty((prev) => {
        const next = new Set(prev);
        ids.forEach((id) => next.delete(id));
        return next;
      });
    } catch (e) {
      toast.error((e as Error).message ?? "Không lưu được số đếm");
    } finally {
      setSaving(false);
    }
  }, [sessionId, dirty, counts]);

  const handleCountChange = (lineId: string, value: string) => {
    setCounts((prev) => ({ ...prev, [lineId]: value }));
    setDirty((prev) => new Set(prev).add(lineId));
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => void flushSave(), 800);
  };

  const handleBlurSave = () => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    void flushSave();
  };

  const isDraft = detail?.session.status === "DRAFT";
  const isPending = detail?.session.status === "PENDING_APPROVAL";
  const isMine = detail?.session.createdBy === myUserId;

  const allCounted =
    detail != null &&
    detail.lines.every((l) => {
      const v = counts[l.id];
      return v !== undefined && v !== "";
    });

  const handleSubmit = async () => {
    if (!sessionId) return;
    await flushSave();
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/submit`, { method: "POST" });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success("Đã gửi duyệt — chờ Giám đốc chốt.");
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    if (!sessionId) return;
    const ok = await askConfirm({
      title: "Huỷ phiên kiểm kê?",
      description: "Không ghi điều chỉnh tồn nào. Không thể hoàn tác.",
      tone: "danger",
      confirmLabel: "Huỷ phiên",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/cancel`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Đã huỷ phiên.");
      onOpenChange(false);
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleApprove = async () => {
    if (!sessionId || !detail) return;
    const ok = await askConfirm({
      title: `Duyệt & chốt phiên ${detail.session.code}?`,
      description: `Sẽ ghi điều chỉnh tồn cho ${detail.variance.diffLines} dòng chênh lệch. Không thể hoàn tác.`,
      confirmLabel: "Duyệt & chốt",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/approve`, { method: "POST" });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success("Đã duyệt chốt — tồn kho đã được điều chỉnh.");
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReject = async () => {
    if (!sessionId) return;
    const reason = await askReason({
      title: "Lý do trả lại",
      label: "Nhập lý do (≥3 ký tự) để Kho biết đếm lại chỗ nào",
      minLength: 3,
      maxLength: 1000,
    });
    if (reason === null) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const json = (await res.json()) as { error?: { message: string } };
      if (!res.ok) throw new Error(json.error?.message ?? `HTTP ${res.status}`);
      toast.success("Đã trả lại phiên kèm lý do.");
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleReopen = async () => {
    if (!sessionId) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/warehouse/stocktake/${sessionId}/reopen`, { method: "POST" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      toast.success("Đã mở lại — tiếp tục đếm.");
      await load();
      onChanged();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  // Group lines theo bin cho màn đếm.
  const byBin = React.useMemo(() => {
    if (!detail) return [];
    const map = new Map<string, LineRow[]>();
    for (const l of detail.lines) {
      const list = map.get(l.binFullCode) ?? [];
      list.push(l);
      map.set(l.binFullCode, list);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [detail]);

  const diffLines = React.useMemo(
    () => detail?.lines.filter((l) => l.countedQty != null && l.countedQty !== l.bookQty) ?? [],
    [detail],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" size="lg" hideCloseButton className="flex flex-col">
        <SheetHeaderNav
          title={detail ? `Kiểm kê ${detail.session.code}` : "Kiểm kê"}
          onCancel={() => onOpenChange(false)}
        />
        {loading || !detail ? (
          <div className="flex flex-1 items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : (
          <>
            <SheetBody className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <StatusPill domain="stocktake" code={detail.session.status} size="md" />
                {detail.session.scopeNote && (
                  <span className="text-xs text-zinc-500 dark:text-zinc-400">{detail.session.scopeNote}</span>
                )}
                <span className="ml-auto text-xs text-zinc-400 dark:text-zinc-500">
                  Chụp tồn: {formatDateTime(detail.session.snapshotAt)}
                </span>
              </div>

              {detail.session.status === "REJECTED" && detail.session.rejectReason && (
                <div className="rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
                  <strong>Lý do trả lại:</strong> {detail.session.rejectReason}
                </div>
              )}

              {isDraft && detail.txnWarnings.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/30 dark:text-amber-400">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
                  <div>
                    <p className="font-semibold">
                      Có {detail.txnWarnings.length} giao dịch mới trên các ô đang kiểm SAU thời điểm chụp —
                      chênh lệch có thể do giao dịch mới, không phải thất thoát.
                    </p>
                    <ul className="mt-1 space-y-0.5">
                      {detail.txnWarnings.slice(0, 5).map((w, i) => (
                        <li key={i}>
                          {/* V4.4 A14 — "ADJUST_PLUS" thô → nhãn Việt qua invTxTypeLabel(). */}
                          {w.binFullCode} · {w.sku} · {invTxTypeLabel(w.txType)} {formatQty(w.qty)} lúc{" "}
                          {formatDateTime(w.occurredAt)}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              )}

              {(isPending || detail.session.status === "APPROVED") && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <StatTile label="Dòng lệch" value={detail.variance.diffLines} />
                  <StatTile label="Thừa" value={formatQty(detail.variance.surplusQty)} tone="success" />
                  <StatTile label="Thiếu" value={formatQty(detail.variance.shortageQty)} tone="danger" />
                  <StatTile
                    label="Giá trị lệch"
                    value={
                      detail.variance.surplusValue == null && detail.variance.shortageValue == null
                        ? "—"
                        : // V4.4 A3 — tiền dùng formatMoney() (₫ chuẩn) thay hậu tố "đ" tự ghép.
                          formatMoney((detail.variance.surplusValue ?? 0) - (detail.variance.shortageValue ?? 0), { sign: true })
                    }
                  />
                </div>
              )}

              {isDraft ? (
                <div className="space-y-4">
                  {byBin.map(([binCode, lines]) => (
                    <div key={binCode} className="rounded-lg border border-zinc-200 dark:border-zinc-800">
                      <div className="border-b border-zinc-100 bg-zinc-50 px-3 py-1.5 font-mono text-xs font-semibold text-zinc-700 dark:border-zinc-800 dark:bg-zinc-800/60 dark:text-zinc-300">
                        {binCode}
                      </div>
                      <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
                        {lines.map((l) => (
                          <li key={l.id} className="flex items-center gap-3 px-3 py-2.5">
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-50">
                                <span className="font-mono text-xs">{l.sku}</span> · {l.name}
                              </p>
                              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                                {l.lotCode ? `Lô ${l.lotCode} · ` : ""}Sổ sách: {formatQty(l.bookQty)} {l.uom ?? ""}
                              </p>
                            </div>
                            <input
                              type="number"
                              inputMode="decimal"
                              step="any"
                              value={counts[l.id] ?? ""}
                              onChange={(e) => handleCountChange(l.id, e.target.value)}
                              onBlur={handleBlurSave}
                              placeholder="Số đếm"
                              className="h-11 w-24 shrink-0 rounded-lg border border-zinc-300 text-right text-lg font-semibold tabular-nums focus:border-blue-500 focus:outline-none dark:border-zinc-700 dark:bg-zinc-900"
                            />
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                  {saving && (
                    <p className="text-xs text-zinc-400 dark:text-zinc-500">
                      <Loader2 className="mr-1 inline h-3 w-3 animate-spin" /> Đang lưu nháp…
                    </p>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
                  <table className="w-full min-w-[480px] text-xs">
                    <thead className="bg-zinc-50 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400">
                      <tr>
                        <th className="px-2 py-1.5 text-left">Ô</th>
                        <th className="px-2 py-1.5 text-left">Vật tư</th>
                        <th className="px-2 py-1.5 text-right">Sổ sách</th>
                        <th className="px-2 py-1.5 text-right">Thực đếm</th>
                        <th className="px-2 py-1.5 text-right">Lệch</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(detail.session.status === "PENDING_APPROVAL" || detail.session.status === "APPROVED"
                        ? diffLines
                        : detail.lines
                      ).map((l) => {
                        const diff = (l.countedQty ?? l.bookQty) - l.bookQty;
                        return (
                          <tr key={l.id} className="border-t border-zinc-100 dark:border-zinc-800">
                            <td className="px-2 py-1.5 font-mono">{l.binFullCode}</td>
                            <td className="px-2 py-1.5">
                              <span className="font-mono">{l.sku}</span> {l.name}
                            </td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{formatQty(l.bookQty)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">
                              {l.countedQty == null ? "—" : formatQty(l.countedQty)}
                            </td>
                            <td
                              className={cn(
                                "px-2 py-1.5 text-right font-semibold tabular-nums",
                                diff > 0
                                  ? "text-emerald-600 dark:text-emerald-400"
                                  : diff < 0
                                    ? "text-red-600 dark:text-red-400"
                                    : "text-zinc-400 dark:text-zinc-500",
                              )}
                            >
                              {diff > 0 ? "+" : ""}
                              {formatQty(diff)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {(detail.session.status === "PENDING_APPROVAL" || detail.session.status === "APPROVED") &&
                    diffLines.length === 0 && (
                      <p className="px-3 py-6 text-center text-sm text-emerald-600 dark:text-emerald-400">
                        Không có chênh lệch nào.
                      </p>
                    )}
                </div>
              )}
            </SheetBody>
            <SheetFooter className="flex-wrap gap-2">
              <Button asChild variant="ghost" size="sm">
                <a href={`/api/warehouse/stocktake/${detail.session.id}/export`}>
                  <FileDown className="h-3.5 w-3.5" aria-hidden /> Xuất phiếu
                </a>
              </Button>
              <div className="ml-auto flex items-center gap-2">
                {isDraft && (
                  <>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleCancel()}>
                      Huỷ phiên
                    </Button>
                    <Button size="sm" disabled={busy || !allCounted} onClick={() => void handleSubmit()}>
                      {busy ? "Đang gửi…" : allCounted ? "Gửi duyệt" : `Còn ${detail.lines.filter((l) => !counts[l.id]).length} dòng chưa đếm`}
                    </Button>
                  </>
                )}
                {isPending && isAdmin && (
                  <>
                    <Button variant="ghost" size="sm" disabled={busy} onClick={() => void handleReject()}>
                      Từ chối
                    </Button>
                    <Button size="sm" disabled={busy} onClick={() => void handleApprove()}>
                      Duyệt & chốt
                    </Button>
                  </>
                )}
                {isPending && !isAdmin && (
                  <span className="text-sm text-zinc-500 dark:text-zinc-400">Đang chờ Giám đốc duyệt…</span>
                )}
                {detail.session.status === "REJECTED" && (isAdmin || isMine) && (
                  <Button size="sm" disabled={busy} onClick={() => void handleReopen()}>
                    Mở lại để đếm
                  </Button>
                )}
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
