"use client";

import * as React from "react";
import { Minus, Package, Plus, RefreshCw, WifiOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { BarcodeScanner } from "@/components/scan/BarcodeScanner";
import { ScanQueueBadge } from "@/components/scan/ScanQueueBadge";
import { getDB, type ScanEvent } from "@/lib/dexie";
import { uuidv7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";

const REPLAY_DELAY_MS = 500; // Sequential FIFO, tránh race condition

/**
 * V2 ReceivingConsole — design-spec §2.8 + §3.7.1.
 *
 * Tablet 1024×768 primary: 2-col grid (scanner+PO lines trái, input dialog phải).
 * - Header h-12 padding-x 16: PO code mono 13px + supplier + expected date.
 * - Left: BarcodeScanner + PO lines table V2 row 36px hover bg-zinc-50.
 * - Right: Dialog 400px qty/lot/QC khi scan match — qty number h-12 với
 *   +/- buttons, lot conditional, QC radio pill h-11 (OK emerald / NG red).
 * - Online banner fixed-top khi offline (bg-amber-50 border-amber-200).
 * - Tap target ≥ 48px cho mọi interactive (size lg Button V2).
 * - Toast "Đã ghi vào hàng đợi" khi offline, "Đã ghi nhận — đang đồng bộ" online.
 *
 * GIỮ logic V1 100%: Dexie scanQueue FIFO, uuid-v7 id, replay online,
 * hydrate local qty từ Dexie, handleScan match SKU, ConfirmDialog lot gate.
 */

export interface POLine {
  id: string;
  sku: string;
  name: string;
  orderedQty: number;
  uom: string;
  trackingMode: "none" | "lot" | "serial";
}

export interface ReceivingConsoleProps {
  poId: string;
  poCode: string;
  supplierName: string;
  expectedDate: string;
  lines: POLine[];
}

type LineState = POLine & {
  receivedQty: number;
};

const fmtQty = (n: number) => n.toLocaleString("vi-VN");

export function ReceivingConsole({
  poId,
  poCode,
  supplierName,
  expectedDate,
  lines: initialLines,
}: ReceivingConsoleProps) {
  const [lines, setLines] = React.useState<LineState[]>(
    initialLines.map((l) => ({ ...l, receivedQty: 0 })),
  );
  const [online, setOnline] = React.useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [activeLineId, setActiveLineId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<{
    line: LineState;
    code: string;
  } | null>(null);
  const [syncProgress, setSyncProgress] = React.useState<{
    current: number;
    total: number;
  } | null>(null);
  const replayingRef = React.useRef(false);

  React.useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getDB();
        const events = await db.scanQueue
          .where("poId")
          .equals(poId)
          .toArray();
        if (cancelled) return;
        setLines((prev) =>
          prev.map((l) => {
            const qty = events
              .filter((e) => e.lineId === l.id)
              .reduce((sum, e) => sum + e.qty, 0);
            return { ...l, receivedQty: qty };
          }),
        );
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [poId]);

  const replayQueue = React.useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    try {
      const db = getDB();
      // Query cả pending + failed (retry fail) nhưng KHÔNG re-sync các row "synced"
      const pending = await db.scanQueue
        .where("poId")
        .equals(poId)
        .filter((e) => e.status === "pending" || e.status === "failed")
        .sortBy("createdAt"); // FIFO (uuidv7 embed ms)

      if (pending.length === 0) {
        setSyncProgress(null);
        return;
      }

      setSyncProgress({ current: 0, total: pending.length });

      let syncedCount = 0;
      let failedCount = 0;

      for (let i = 0; i < pending.length; i++) {
        const ev = pending[i]!;
        await db.scanQueue.update(ev.id, { status: "syncing" });
        try {
          // V1.2 B5.2: map Dexie pass/fail → API OK/NG/PENDING
          const mappedQc: "OK" | "NG" | "PENDING" =
            ev.qcStatus === "fail"
              ? "NG"
              : ev.qcStatus === "pass"
              ? "OK"
              : "PENDING";
          const payload = {
            events: [
              {
                id: ev.id,
                scanId: ev.id, // V1: client uuid là scanId
                poCode,
                sku: ev.code,
                qty: ev.qty,
                lotNo: ev.lotNo,
                qcStatus: mappedQc,
                scannedAt: new Date(ev.createdAt).toISOString(),
                rawCode: ev.code,
                metadata: { lineId: ev.lineId },
              },
            ],
          };
          const res = await fetch("/api/receiving/events", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });

          if (res.status === 401 || res.status === 403) {
            await db.scanQueue.update(ev.id, {
              status: "failed",
              lastError: `Auth: HTTP ${res.status}`,
              retryCount: (ev.retryCount ?? 0) + 1,
            });
            failedCount++;
            break; // auth fail → stop replay
          }

          if (res.ok) {
            const body = (await res.json()) as {
              data: {
                acked: string[];
                rejected: Array<{ id: string; reason: string }>;
              };
            };
            const acked = body.data.acked.includes(ev.id);
            const rejected = body.data.rejected.find((r) => r.id === ev.id);
            if (acked) {
              // Server 200 OR 409 duplicate — cả 2 = synced. Xoá khỏi queue.
              await db.scanQueue.delete(ev.id);
              syncedCount++;
            } else if (rejected) {
              await db.scanQueue.update(ev.id, {
                status: "failed",
                lastError: rejected.reason,
                retryCount: (ev.retryCount ?? 0) + 1,
              });
              failedCount++;
            } else {
              await db.scanQueue.update(ev.id, {
                status: "failed",
                lastError: "Server không ack event",
                retryCount: (ev.retryCount ?? 0) + 1,
              });
              failedCount++;
            }
          } else {
            // 5xx → retry backoff (để lại pending)
            const body = (await res.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            await db.scanQueue.update(ev.id, {
              status: "failed",
              lastError: body.error?.message ?? `HTTP ${res.status}`,
              retryCount: (ev.retryCount ?? 0) + 1,
            });
            failedCount++;
            // Backoff delay khi server lỗi
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err) {
          await db.scanQueue.update(ev.id, {
            status: "failed",
            lastError: (err as Error).message,
            retryCount: (ev.retryCount ?? 0) + 1,
          });
          failedCount++;
        }
        setSyncProgress({ current: i + 1, total: pending.length });

        // Sequential delay (tránh race condition)
        if (i < pending.length - 1) {
          await new Promise((r) => setTimeout(r, REPLAY_DELAY_MS));
        }
      }

      if (syncedCount > 0 && failedCount === 0) {
        toast.success(`Đã đồng bộ ${syncedCount} scan.`);
      } else if (syncedCount > 0 && failedCount > 0) {
        toast.warning(
          `Đồng bộ ${syncedCount} scan, ${failedCount} lỗi — check hàng đợi.`,
        );
      } else if (failedCount > 0) {
        toast.error(
          `Đồng bộ thất bại ${failedCount} scan — check hàng đợi.`,
        );
      }
    } catch (err) {
      toast.error(`Đồng bộ lỗi: ${(err as Error).message}`);
    } finally {
      replayingRef.current = false;
      setSyncProgress(null);
    }
  }, [poId, poCode]);

  React.useEffect(() => {
    if (!online) return;
    void replayQueue();
  }, [online, replayQueue]);

  const handleScan = (code: string) => {
    const normalized = code.trim().toUpperCase();
    const line = lines.find(
      (l) =>
        l.sku.toUpperCase() === normalized ||
        normalized.startsWith(l.sku.toUpperCase()),
    );
    if (!line) {
      toast.error(`Không tìm thấy SKU khớp "${code}" trong PO.`);
      return;
    }
    setActiveLineId(line.id);
    setDialog({ line, code: normalized });
  };

  const handleConfirm = async (params: {
    qty: number;
    lotNo: string;
    qcStatus: "pass" | "fail";
  }) => {
    if (!dialog) return;
    const { line, code } = dialog;
    const event: ScanEvent = {
      id: uuidv7(),
      poId,
      code,
      lineId: line.id,
      qty: params.qty,
      lotNo: params.lotNo || null,
      qcStatus: params.qcStatus,
      qcNote: null,
      status: "pending",
      retryCount: 0,
      lastError: null,
      createdAt: Date.now(),
      syncedAt: null,
    };
    try {
      const db = getDB();
      await db.scanQueue.add(event);
      setLines((prev) =>
        prev.map((l) =>
          l.id === line.id
            ? { ...l, receivedQty: l.receivedQty + params.qty }
            : l,
        ),
      );
      toast.success(
        online
          ? "Đã ghi nhận — đang đồng bộ…"
          : "Đã ghi vào hàng đợi (offline).",
      );
      setDialog(null);
    } catch (err) {
      toast.error(`Ghi queue thất bại: ${(err as Error).message}`);
    }
  };

  const totalLines = lines.length;
  const doneLines = lines.filter((l) => l.receivedQty >= l.orderedQty).length;

  return (
    <div className="relative min-h-full">
      <ScanQueueBadge poId={poId} onRetry={() => void replayQueue()} />

      {/* Offline banner fixed top */}
      {!online ? (
        <div
          role="status"
          className="sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"
        >
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Đang mất kết nối. Sự kiện quét được lưu hàng đợi — tự đồng bộ khi có mạng.
        </div>
      ) : null}

      {/* Sync progress banner */}
      {syncProgress ? (
        <div
          role="status"
          className="sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-800"
        >
          <RefreshCw className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
          Đang đồng bộ {syncProgress.current}/{syncProgress.total} scan…
        </div>
      ) : null}

      {/* Header h-12 compact tablet */}
      <header className="flex h-12 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
        <div className="flex items-center gap-3 min-w-0">
          <Package
            className="h-4 w-4 shrink-0 text-zinc-500"
            aria-hidden="true"
          />
          <code className="font-mono text-[13px] font-semibold text-zinc-900">
            PO {poCode}
          </code>
          <span className="truncate text-xs text-zinc-500">
            {supplierName} · Dự kiến {expectedDate}
          </span>
        </div>
        <div className="shrink-0 text-xs font-medium text-zinc-600 tabular-nums">
          {doneLines}/{totalLines} dòng
        </div>
      </header>

      {/* 2-col tablet layout (scanner + lines) */}
      <div className="mx-auto max-w-6xl p-4 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr,minmax(320px,380px)]">
          <div className="space-y-4">
            <BarcodeScanner onDetect={handleScan} />

            {/* PO lines table V2 row 36px */}
            <section
              aria-label="Danh sách dòng PO"
              className="overflow-hidden rounded-md border border-zinc-200 bg-white"
            >
              <div className="flex h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Dòng PO ({totalLines})
              </div>
              <div>
                {lines.map((l) => {
                  const isDone = l.receivedQty >= l.orderedQty;
                  const remaining = Math.max(0, l.orderedQty - l.receivedQty);
                  const isActive = activeLineId === l.id;
                  return (
                    <div
                      key={l.id}
                      className={cn(
                        "grid grid-cols-[auto,1fr,auto] items-center gap-3 border-t border-zinc-100 px-4 py-2 transition-colors hover:bg-zinc-50",
                        isActive && "bg-blue-50",
                        isDone && "bg-emerald-50/40",
                      )}
                    >
                      <Package
                        className={cn(
                          "h-4 w-4 shrink-0",
                          isDone ? "text-emerald-500" : "text-zinc-400",
                        )}
                        aria-hidden="true"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-xs font-semibold text-zinc-900">
                            {l.sku}
                          </code>
                          {isDone ? (
                            <StatusBadge status="ready" size="sm" />
                          ) : l.receivedQty > 0 ? (
                            <StatusBadge status="partial" size="sm" />
                          ) : (
                            <StatusBadge status="pending" size="sm" />
                          )}
                          {l.trackingMode === "lot" ? (
                            <span className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
                              Lô
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-600">
                          {l.name}
                        </p>
                      </div>
                      <div className="text-right text-xs tabular-nums">
                        <div className="font-semibold text-zinc-900">
                          {fmtQty(l.receivedQty)} / {fmtQty(l.orderedQty)}{" "}
                          {l.uom}
                        </div>
                        <div
                          className={cn(
                            remaining === 0
                              ? "text-emerald-700"
                              : "text-zinc-500",
                          )}
                        >
                          {remaining === 0
                            ? "Hoàn tất"
                            : `Còn ${fmtQty(remaining)} ${l.uom}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-16 rounded-md border border-zinc-200 bg-white p-4">
              <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                Hướng dẫn nhanh
              </h2>
              <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600">
                <li>
                  Bấm <strong>Bật camera</strong> hoặc dùng máy quét USB.
                </li>
                <li>Quét mã vạch trên bao bì.</li>
                <li>Nhập số lượng + lô (nếu có) → xác nhận.</li>
                <li>Hệ thống tự đồng bộ khi có mạng.</li>
              </ol>
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(dialog)}
        line={dialog?.line ?? null}
        onClose={() => {
          setDialog(null);
          setActiveLineId(null);
        }}
        onConfirm={handleConfirm}
      />
    </div>
  );
}

function ConfirmDialog({
  open,
  line,
  onClose,
  onConfirm,
}: {
  open: boolean;
  line: LineState | null;
  onClose: () => void;
  onConfirm: (p: {
    qty: number;
    lotNo: string;
    qcStatus: "pass" | "fail";
  }) => Promise<void>;
}) {
  const [qty, setQty] = React.useState("1");
  const [lotNo, setLotNo] = React.useState("");
  const [qc, setQc] = React.useState<"pass" | "fail">("pass");

  React.useEffect(() => {
    if (open && line) {
      const remaining = Math.max(1, line.orderedQty - line.receivedQty);
      setQty(String(remaining));
      setLotNo("");
      setQc("pass");
    }
  }, [open, line]);

  const handleSubmit = async () => {
    const qtyNum = Number(qty);
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      toast.error("Số lượng không hợp lệ.");
      return;
    }
    if (line?.trackingMode === "lot" && lotNo.trim().length === 0) {
      toast.error("Nhập số lô cho item lot-tracked.");
      return;
    }
    await onConfirm({ qty: qtyNum, lotNo: lotNo.trim(), qcStatus: qc });
  };

  const adjustQty = (delta: number) => {
    const n = Number(qty);
    const next = Math.max(0, (Number.isFinite(n) ? n : 0) + delta);
    setQty(String(next));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Ghi nhận nhận hàng</DialogTitle>
          {line ? (
            <DialogDescription>
              <code className="font-mono">{line.sku}</code> — {line.name}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="receive-qty" uppercase required>
              Số lượng ({line?.uom ?? ""})
            </Label>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 w-12 shrink-0 px-0"
                onClick={() => adjustQty(-1)}
                aria-label="Giảm 1"
              >
                <Minus className="h-4 w-4" aria-hidden="true" />
              </Button>
              <Input
                id="receive-qty"
                type="number"
                inputMode="decimal"
                min={0.0001}
                step={0.0001}
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className="h-12 text-center text-md font-semibold tabular-nums"
                autoFocus
              />
              <Button
                type="button"
                variant="outline"
                size="lg"
                className="h-12 w-12 shrink-0 px-0"
                onClick={() => adjustQty(1)}
                aria-label="Tăng 1"
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
          </div>
          {line?.trackingMode === "lot" ? (
            <div className="space-y-1.5">
              <Label htmlFor="receive-lot" uppercase required>
                Số lô
              </Label>
              <Input
                id="receive-lot"
                size="lg"
                value={lotNo}
                onChange={(e) => setLotNo(e.target.value)}
                placeholder="VD: LOT-260417-A"
              />
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label uppercase>Kết quả QC</Label>
            <div className="grid grid-cols-2 gap-2">
              {(["pass", "fail"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQc(v)}
                  className={cn(
                    "inline-flex h-11 items-center justify-center gap-1.5 rounded-md border text-base font-medium transition-colors",
                    qc === v
                      ? v === "pass"
                        ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                        : "border-red-500 bg-red-50 text-red-700"
                      : "border-zinc-300 bg-white text-zinc-700 hover:bg-zinc-50",
                  )}
                  aria-pressed={qc === v}
                >
                  {v === "pass" ? "OK" : "NG"}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" size="lg" onClick={onClose}>
            Huỷ
          </Button>
          <Button size="lg" onClick={() => void handleSubmit()}>
            Xác nhận
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
