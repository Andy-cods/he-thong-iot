"use client";

import * as React from "react";
import {
  CheckCircle2,
  Factory,
  Minus,
  Package,
  Plus,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
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
import { BarcodeScanner } from "@/components/scan/BarcodeScanner";
import { getDB, type AssemblyScanQueueEvent } from "@/lib/dexie";
import { uuidv7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";

const REPLAY_DELAY_MS = 500;

/**
 * V1.3 Phase B3 — AssemblyConsole PWA.
 *
 * Pattern giống `ReceivingConsole` (§3.7.1): 2-col tablet — scanner + lines.
 * - Header h-12: WO code mono + customer + progress badge
 * - Left: BarcodeScanner + WO lines table với required/issued/remaining
 * - Right: Dialog qty confirm khi scan match lot reservation
 * - Offline banner + sync progress banner fixed top
 * - Dexie assemblyQueue idempotent qua UUIDv7 id
 * - Background auto-sync khi online
 */

export interface AssemblyLine {
  snapshotLineId: string;
  componentSku: string;
  componentName: string;
  requiredQty: number;
  completedQty: number;
  reservedQty: number;
  state: string;
  reservations: Array<{
    reservationId: string;
    lotId: string;
    lotCode: string | null;
    reservedQty: number;
    status: string;
  }>;
}

export interface AssemblyConsoleProps {
  woId: string;
  woNo: string;
  woStatus: string;
  orderNo: string | null;
  customerName: string | null;
  lines: AssemblyLine[];
}

type LineState = AssemblyLine & {
  pendingQty: number; // local Dexie sum chưa sync
};

const fmtQty = (n: number) => n.toLocaleString("vi-VN");

interface DialogState {
  line: LineState;
  reservation: AssemblyLine["reservations"][number];
  code: string;
}

export function AssemblyConsole({
  woId,
  woNo,
  woStatus,
  orderNo,
  customerName,
  lines: initialLines,
}: AssemblyConsoleProps) {
  const [lines, setLines] = React.useState<LineState[]>(
    initialLines.map((l) => ({ ...l, pendingQty: 0 })),
  );
  const [online, setOnline] = React.useState<boolean>(
    typeof navigator !== "undefined" ? navigator.onLine : true,
  );
  const [activeLineId, setActiveLineId] = React.useState<string | null>(null);
  const [dialog, setDialog] = React.useState<DialogState | null>(null);
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

  // Hydrate pendingQty từ Dexie
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const db = getDB();
        const events = await db.assemblyQueue
          .where("woId")
          .equals(woId)
          .toArray();
        if (cancelled) return;
        setLines((prev) =>
          prev.map((l) => {
            const qty = events
              .filter(
                (e) =>
                  e.snapshotLineId === l.snapshotLineId &&
                  (e.status === "pending" || e.status === "failed"),
              )
              .reduce((sum, e) => sum + e.qty, 0);
            return { ...l, pendingQty: qty };
          }),
        );
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [woId]);

  const replayQueue = React.useCallback(async () => {
    if (replayingRef.current) return;
    replayingRef.current = true;
    try {
      const db = getDB();
      const pending = await db.assemblyQueue
        .where("woId")
        .equals(woId)
        .filter((e) => e.status === "pending" || e.status === "failed")
        .sortBy("createdAt");

      if (pending.length === 0) {
        setSyncProgress(null);
        return;
      }
      setSyncProgress({ current: 0, total: pending.length });
      let synced = 0;
      let failed = 0;

      for (let i = 0; i < pending.length; i++) {
        const ev = pending[i]!;
        await db.assemblyQueue.update(ev.id, { status: "syncing" });

        try {
          const payload = {
            events: [
              {
                scanId: ev.id,
                woId: ev.woId,
                snapshotLineId: ev.snapshotLineId,
                lotSerialId: ev.lotSerialId,
                qty: ev.qty,
                barcode: ev.barcode,
                scannedAt: new Date(ev.createdAt).toISOString(),
                deviceId: ev.deviceId,
              },
            ],
          };
          const res = await fetch("/api/assembly/scan/batch", {
            method: "POST",
            credentials: "include",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(payload),
          });
          if (res.status === 401 || res.status === 403) {
            await db.assemblyQueue.update(ev.id, {
              status: "failed",
              lastError: `Auth: HTTP ${res.status}`,
              retryCount: (ev.retryCount ?? 0) + 1,
            });
            failed++;
            break;
          }
          if (res.ok) {
            const body = (await res.json()) as {
              data: {
                acked: string[];
                rejected: Array<{
                  scanId: string;
                  code: string;
                  message: string;
                }>;
              };
            };
            const acked = body.data.acked.includes(ev.id);
            const rejected = body.data.rejected.find(
              (r) => r.scanId === ev.id,
            );
            if (acked) {
              await db.assemblyQueue.delete(ev.id);
              synced++;
            } else if (rejected) {
              await db.assemblyQueue.update(ev.id, {
                status: "failed",
                lastError: `${rejected.code}: ${rejected.message}`,
                retryCount: (ev.retryCount ?? 0) + 1,
              });
              failed++;
            }
          } else {
            const body = (await res.json().catch(() => ({}))) as {
              error?: { message?: string };
            };
            await db.assemblyQueue.update(ev.id, {
              status: "failed",
              lastError: body.error?.message ?? `HTTP ${res.status}`,
              retryCount: (ev.retryCount ?? 0) + 1,
            });
            failed++;
            await new Promise((r) => setTimeout(r, 2000));
          }
        } catch (err) {
          await db.assemblyQueue.update(ev.id, {
            status: "failed",
            lastError: (err as Error).message,
            retryCount: (ev.retryCount ?? 0) + 1,
          });
          failed++;
        }
        setSyncProgress({ current: i + 1, total: pending.length });
        if (i < pending.length - 1) {
          await new Promise((r) => setTimeout(r, REPLAY_DELAY_MS));
        }
      }

      if (synced > 0 && failed === 0) {
        toast.success(`Đã đồng bộ ${synced} scan.`);
        // Re-hydrate từ server
        await refreshFromServer();
      } else if (synced > 0 && failed > 0) {
        toast.warning(`Đồng bộ ${synced} scan, ${failed} lỗi.`);
        await refreshFromServer();
      } else if (failed > 0) {
        toast.error(`Đồng bộ thất bại ${failed} scan.`);
      }
    } catch (err) {
      toast.error(`Đồng bộ lỗi: ${(err as Error).message}`);
    } finally {
      replayingRef.current = false;
      setSyncProgress(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [woId]);

  const refreshFromServer = React.useCallback(async () => {
    try {
      const res = await fetch(`/api/assembly/wo/${woId}/progress`, {
        credentials: "include",
      });
      if (!res.ok) return;
      const body = (await res.json()) as {
        data: { lines: AssemblyLine[] };
      };
      setLines((prev) =>
        prev.map((l) => {
          const srv = body.data.lines.find(
            (s) => s.snapshotLineId === l.snapshotLineId,
          );
          if (!srv) return l;
          return { ...l, ...srv, pendingQty: 0 };
        }),
      );
    } catch {
      // ignore
    }
  }, [woId]);

  React.useEffect(() => {
    if (!online) return;
    void replayQueue();
  }, [online, replayQueue]);

  const handleScan = (code: string) => {
    const normalized = code.trim().toUpperCase();
    // Match lot_code hoặc lot_id từ reservations
    for (const line of lines) {
      for (const r of line.reservations) {
        if (r.status !== "ACTIVE") continue;
        const lotCode = (r.lotCode ?? "").toUpperCase();
        if (
          lotCode === normalized ||
          normalized.startsWith(lotCode) ||
          r.lotId === code.trim()
        ) {
          setActiveLineId(line.snapshotLineId);
          setDialog({ line, reservation: r, code });
          return;
        }
      }
    }
    toast.error(`Không tìm thấy lot reservation cho mã "${code}".`);
  };

  const handleConfirm = async (params: { qty: number }) => {
    if (!dialog) return;
    const { line, reservation, code } = dialog;
    const event: AssemblyScanQueueEvent = {
      id: uuidv7(),
      woId,
      snapshotLineId: line.snapshotLineId,
      lotSerialId: reservation.lotId,
      barcode: code || reservation.lotCode || reservation.lotId,
      qty: params.qty,
      status: "pending",
      retryCount: 0,
      lastError: null,
      createdAt: Date.now(),
      syncedAt: null,
      deviceId: null,
    };
    try {
      const db = getDB();
      await db.assemblyQueue.add(event);
      setLines((prev) =>
        prev.map((l) =>
          l.snapshotLineId === line.snapshotLineId
            ? { ...l, pendingQty: l.pendingQty + params.qty }
            : l,
        ),
      );
      toast.success(
        online
          ? "Đã ghi nhận scan — đang đồng bộ…"
          : "Đã ghi vào hàng đợi (offline).",
      );
      setDialog(null);
    } catch (err) {
      toast.error(`Ghi queue thất bại: ${(err as Error).message}`);
    }
  };

  const handleCompleteWO = async () => {
    if (!confirm("Xác nhận hoàn thành WO? Tất cả line phải đã đủ qty.")) return;
    try {
      const res = await fetch(`/api/assembly/wo/${woId}/complete`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok) {
        const body = (await res.json()) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      toast.success("WO đã hoàn thành.");
      setTimeout(() => window.location.reload(), 500);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const totalRequired = lines.reduce((s, l) => s + l.requiredQty, 0);
  const totalCompleted = lines.reduce(
    (s, l) => s + l.completedQty + l.pendingQty,
    0,
  );
  const progress =
    totalRequired > 0 ? Math.round((totalCompleted / totalRequired) * 100) : 0;
  const doneLines = lines.filter(
    (l) => l.completedQty + l.pendingQty >= l.requiredQty,
  ).length;
  const canComplete = woStatus === "IN_PROGRESS" && progress >= 100;

  return (
    <div className="relative min-h-full">
      {!online ? (
        <div
          role="status"
          className="sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-800"
        >
          <WifiOff className="h-4 w-4" aria-hidden="true" />
          Đang mất kết nối — scan được lưu hàng đợi, tự đồng bộ khi có mạng.
        </div>
      ) : null}

      {syncProgress ? (
        <div
          role="status"
          className="sticky top-0 z-sticky flex items-center justify-center gap-2 border-b border-blue-200 bg-blue-50 px-4 py-2 text-xs font-medium text-blue-800"
        >
          <RefreshCw
            className="h-3.5 w-3.5 animate-spin"
            aria-hidden="true"
          />
          Đang đồng bộ {syncProgress.current}/{syncProgress.total} scan…
        </div>
      ) : null}

      <header className="flex h-12 items-center justify-between gap-4 border-b border-zinc-200 bg-white px-4">
        <div className="flex min-w-0 items-center gap-3">
          <Factory
            className="h-4 w-4 shrink-0 text-zinc-500"
            aria-hidden="true"
          />
          <code className="font-mono text-[13px] font-semibold text-zinc-900">
            {woNo}
          </code>
          <Badge
            variant={
              woStatus === "IN_PROGRESS"
                ? "info"
                : woStatus === "COMPLETED"
                  ? "success"
                  : woStatus === "PAUSED"
                    ? "warning"
                    : "outline"
            }
            className="text-xs"
          >
            {woStatus}
          </Badge>
          <span className="truncate text-xs text-zinc-500">
            {orderNo ? `Đơn ${orderNo}` : "—"}
            {customerName ? ` · ${customerName}` : ""}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-2 text-xs font-medium text-zinc-600 tabular-nums">
          <span>
            {doneLines}/{lines.length} dòng
          </span>
          <span className="text-zinc-300">·</span>
          <span className="text-indigo-700">{progress}%</span>
          {canComplete ? (
            <Button size="sm" onClick={() => void handleCompleteWO()}>
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
              Hoàn thành WO
            </Button>
          ) : null}
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-4 lg:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr,minmax(320px,380px)]">
          <div className="space-y-4">
            <BarcodeScanner onDetect={handleScan} />

            <section
              aria-label="Danh sách component"
              className="overflow-hidden rounded-md border border-zinc-200 bg-white"
            >
              <div className="flex h-8 items-center border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
                Component ({lines.length})
              </div>
              <div>
                {lines.map((l) => {
                  const issuedDisplay = l.completedQty + l.pendingQty;
                  const isDone = issuedDisplay >= l.requiredQty;
                  const remaining = Math.max(0, l.requiredQty - issuedDisplay);
                  const isActive = activeLineId === l.snapshotLineId;
                  return (
                    <div
                      key={l.snapshotLineId}
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
                            {l.componentSku}
                          </code>
                          <Badge
                            variant={isDone ? "success" : "outline"}
                            className="text-[10px]"
                          >
                            {isDone ? "Issued" : l.state}
                          </Badge>
                          {l.reservations.filter((r) => r.status === "ACTIVE")
                            .length > 0 ? (
                            <span className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                              {
                                l.reservations.filter(
                                  (r) => r.status === "ACTIVE",
                                ).length
                              }{" "}
                              lot
                            </span>
                          ) : null}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-600">
                          {l.componentName}
                        </p>
                      </div>
                      <div className="text-right text-xs tabular-nums">
                        <div className="font-semibold text-zinc-900">
                          {fmtQty(issuedDisplay)} / {fmtQty(l.requiredQty)}
                        </div>
                        <div
                          className={cn(
                            remaining === 0
                              ? "text-emerald-700"
                              : "text-zinc-500",
                          )}
                        >
                          {remaining === 0
                            ? "Đủ"
                            : `Còn ${fmtQty(remaining)}`}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <aside className="hidden lg:block">
            <div className="sticky top-16 space-y-3">
              <div className="rounded-md border border-zinc-200 bg-white p-4">
                <h2 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
                  Hướng dẫn nhanh
                </h2>
                <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-zinc-600">
                  <li>Quét mã lot (từ reservation) trên kệ.</li>
                  <li>
                    Hệ thống tự match lot → line → suggest qty còn thiếu.
                  </li>
                  <li>Xác nhận qty → deduct kho tự động.</li>
                  <li>
                    Khi 100% line đủ qty → bấm <strong>Hoàn thành WO</strong>.
                  </li>
                </ol>
              </div>
              {woStatus !== "IN_PROGRESS" ? (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
                  WO đang ở state <code>{woStatus}</code>. Scan chỉ thực thi khi
                  WO đã Start.
                </div>
              ) : null}
            </div>
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(dialog)}
        dialog={dialog}
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
  dialog,
  onClose,
  onConfirm,
}: {
  open: boolean;
  dialog: DialogState | null;
  onClose: () => void;
  onConfirm: (p: { qty: number }) => Promise<void>;
}) {
  const [qty, setQty] = React.useState("1");

  React.useEffect(() => {
    if (open && dialog) {
      const { line, reservation } = dialog;
      const remaining = Math.max(
        1,
        line.requiredQty - line.completedQty - line.pendingQty,
      );
      const suggested = Math.min(remaining, reservation.reservedQty);
      setQty(String(suggested));
    }
  }, [open, dialog]);

  const adjustQty = (delta: number) => {
    const n = Number(qty);
    const next = Math.max(0, (Number.isFinite(n) ? n : 0) + delta);
    setQty(String(next));
  };

  const handleSubmit = async () => {
    const n = Number(qty);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error("Số lượng không hợp lệ.");
      return;
    }
    if (dialog && n > dialog.reservation.reservedQty) {
      toast.error(`Qty vượt reserved ${dialog.reservation.reservedQty}.`);
      return;
    }
    await onConfirm({ qty: n });
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent className="max-w-[400px]">
        <DialogHeader>
          <DialogTitle>Ghi nhận xuất kho cho lắp ráp</DialogTitle>
          {dialog ? (
            <DialogDescription>
              <code className="font-mono">{dialog.line.componentSku}</code> —{" "}
              {dialog.line.componentName}
              <br />
              Lot:{" "}
              <code className="font-mono">
                {dialog.reservation.lotCode ?? dialog.reservation.lotId}
              </code>{" "}
              · Reserved {dialog.reservation.reservedQty}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="assembly-qty" uppercase required>
              Số lượng xuất
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
                id="assembly-qty"
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
