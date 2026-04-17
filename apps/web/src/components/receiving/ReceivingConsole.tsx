"use client";

import * as React from "react";
import { CheckCircle2, CloudOff, Package, WifiOff } from "lucide-react";
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

/**
 * ReceivingConsole — design-spec §3.18.2.
 *
 * Tablet layout 1024×768 primary: 2-col desktop (scanner + PO lines trái, form
 * phải), stack mobile. Tap target ≥ 48px.
 * Offline-first: scan → ghi vào Dexie queue FIFO, optimistic update local
 * receivedQty. Khi `navigator.onLine` → replay queue → POST /api/receiving/events
 * (stub V1: fake delay 600ms, toast "Đã đồng bộ"). Server endpoint thực cook V1.1.
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
  /** Số lượng đã nhận local (optimistic, cộng dồn từ scan queue). */
  receivedQty: number;
};

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

  // Online/offline listener
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

  // Hydrate local received qty từ Dexie (khi F5)
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

  // Replay pending events khi online
  React.useEffect(() => {
    if (!online) return;
    let cancelled = false;
    const replay = async () => {
      try {
        const db = getDB();
        const pending = await db.scanQueue
          .where("[poId+status]")
          .equals([poId, "pending"])
          .sortBy("createdAt");
        if (cancelled) return;
        for (const ev of pending) {
          await db.scanQueue.update(ev.id, { status: "syncing" });
          // TODO V1.1: POST /api/receiving/events real endpoint
          await new Promise((r) => setTimeout(r, 600));
          if (cancelled) return;
          await db.scanQueue.update(ev.id, {
            status: "synced",
            syncedAt: Date.now(),
          });
        }
        if (pending.length > 0) {
          toast.success(`Đã đồng bộ ${pending.length} sự kiện.`);
        }
      } catch (err) {
        toast.error(`Đồng bộ lỗi: ${(err as Error).message}`);
      }
    };
    void replay();
    return () => {
      cancelled = true;
    };
  }, [online, poId]);

  const handleScan = (code: string) => {
    // Match SKU prefix / exact. V1 chỉ match đúng SKU (hoặc code chứa SKU).
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
          l.id === line.id ? { ...l, receivedQty: l.receivedQty + params.qty } : l,
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

  return (
    <div className="relative mx-auto max-w-6xl p-3 lg:p-4">
      <ScanQueueBadge poId={poId} />

      {/* PO header */}
      <header className="mb-4 rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-heading text-xl font-semibold text-slate-900">
                PO {poCode}
              </h1>
              {!online ? (
                <span className="inline-flex items-center gap-1 rounded bg-warning-soft px-2 py-0.5 text-xs font-medium text-warning-strong">
                  <WifiOff className="h-3 w-3" aria-hidden /> Offline
                </span>
              ) : null}
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {supplierName} · Dự kiến {expectedDate}
            </p>
          </div>
        </div>
      </header>

      {!online ? (
        <div
          role="status"
          className="mb-3 flex items-start gap-2 rounded-md border border-warning/20 bg-warning-soft px-3 py-2 text-sm text-warning-strong"
        >
          <CloudOff className="h-4 w-4 shrink-0" aria-hidden />
          <span>
            Đang mất kết nối. Sự kiện quét vẫn được lưu vào hàng đợi; hệ thống
            sẽ tự đồng bộ khi có mạng trở lại.
          </span>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-[1fr,minmax(320px,380px)]">
        <div className="space-y-4">
          <BarcodeScanner onDetect={handleScan} />

          <section
            aria-label="Danh sách dòng PO"
            className="rounded-lg border border-slate-200 bg-white"
          >
            <div className="border-b border-slate-200 px-4 py-2 text-sm font-semibold text-slate-900">
              Dòng PO
            </div>
            <div className="divide-y divide-slate-100">
              {lines.map((l) => {
                const isDone = l.receivedQty >= l.orderedQty;
                const remaining = Math.max(0, l.orderedQty - l.receivedQty);
                const isActive = activeLineId === l.id;
                return (
                  <div
                    key={l.id}
                    className={cn(
                      "grid grid-cols-[auto,1fr,auto] items-center gap-3 px-4 py-3 transition-colors",
                      isActive && "bg-cta-soft",
                    )}
                  >
                    <Package
                      className={cn(
                        "h-5 w-5 shrink-0",
                        isDone ? "text-success" : "text-slate-400",
                      )}
                      aria-hidden
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <code className="font-mono font-semibold text-slate-900">
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
                          <span className="inline-flex items-center rounded bg-info-soft px-1.5 py-0.5 text-xs font-medium text-info-strong">
                            Lô
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 truncate text-sm text-slate-600">
                        {l.name}
                      </p>
                    </div>
                    <div className="text-right text-sm tabular-nums">
                      <div className="font-semibold text-slate-900">
                        {l.receivedQty} / {l.orderedQty} {l.uom}
                      </div>
                      <div
                        className={cn(
                          "text-xs",
                          remaining === 0
                            ? "text-success-strong"
                            : "text-slate-500",
                        )}
                      >
                        {remaining === 0
                          ? "Hoàn tất"
                          : `Còn ${remaining} ${l.uom}`}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-16 rounded-lg border border-slate-200 bg-white p-4">
            <h2 className="text-sm font-semibold text-slate-900">
              Hướng dẫn nhanh
            </h2>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-sm text-slate-600">
              <li>Bấm <strong>Bật camera</strong> hoặc dùng máy quét USB.</li>
              <li>Quét mã vạch trên bao bì.</li>
              <li>Nhập số lượng + lô (nếu có) → xác nhận.</li>
              <li>Hệ thống tự đồng bộ khi có mạng.</li>
            </ol>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500">
              <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
              Dữ liệu an toàn trong hàng đợi kể cả khi F5 / mất điện.
            </div>
          </div>
        </aside>
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

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? null : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ghi nhận nhận hàng</DialogTitle>
          {line ? (
            <DialogDescription>
              <code className="font-mono">{line.sku}</code> — {line.name}
            </DialogDescription>
          ) : null}
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div>
            <Label htmlFor="receive-qty" required>
              Số lượng ({line?.uom ?? ""})
            </Label>
            <Input
              id="receive-qty"
              type="number"
              inputMode="decimal"
              min={0.0001}
              step={0.0001}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-12"
              autoFocus
            />
          </div>
          {line?.trackingMode === "lot" ? (
            <div>
              <Label htmlFor="receive-lot" required>
                Số lô
              </Label>
              <Input
                id="receive-lot"
                value={lotNo}
                onChange={(e) => setLotNo(e.target.value)}
                placeholder="VD: LOT-260417-A"
                className="h-12"
              />
            </div>
          ) : null}
          <div>
            <span className="block text-sm font-medium text-slate-700">
              Kết quả QC
            </span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(["pass", "fail"] as const).map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setQc(v)}
                  className={cn(
                    "inline-flex h-12 items-center justify-center gap-1.5 rounded border text-sm font-medium transition-colors",
                    qc === v
                      ? v === "pass"
                        ? "border-success bg-success-soft text-success-strong"
                        : "border-danger bg-danger-soft text-danger-strong"
                      : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50",
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
          <Button variant="outline" onClick={onClose}>
            Huỷ
          </Button>
          <Button onClick={() => void handleSubmit()}>Xác nhận</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
