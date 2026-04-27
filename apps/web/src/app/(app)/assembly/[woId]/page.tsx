"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  History,
  Loader2,
  Package,
  PauseCircle,
  Smartphone,
  Wrench,
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
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanInput } from "@/components/scan/BarcodeScanInput";
import {
  useAssemblyScan,
  useCompleteWoViaAssembly,
  useWoProgress,
  type AssemblyScanInput,
  type WoProgressLine,
} from "@/hooks/useAssembly";
import {
  useWorkOrderDetail,
  usePauseWorkOrder,
} from "@/hooks/useWorkOrders";
import { uuidv7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * V2.0-P2-W6 — Assembly workspace cho 1 WO.
 *
 * Layout:
 *   - Header sticky: woNo · sản phẩm · qty progress · nút Pause + Hoàn tất.
 *   - Cột trái 60%: bảng BOM lines cần lắp (SKU, tên, req, picked, còn lại, trạng thái).
 *   - Cột phải 40%: vùng quét barcode + activity log 10 scan gần nhất.
 *   - Footer hành động.
 *
 * Flow scan: tra `/api/items/by-barcode/[code]` → match `componentSku` trong
 * progress.lines → submit POST /api/assembly/scan với reservation ACTIVE.
 *
 * Reuse:
 *   - useWoProgress, useAssemblyScan, useCompleteWoViaAssembly (đã có).
 *   - BarcodeScanInput (auto focus, beep, vibrate, USB wedge).
 */

interface ScanLog {
  id: string;
  code: string;
  at: number;
  status: "ok" | "no-match" | "error" | "warn";
  kind: string;
  sku?: string;
  qty?: number;
  message: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default function AssemblyWorkspacePage() {
  const params = useParams<{ woId: string }>();
  const router = useRouter();
  const woId = params?.woId ?? "";

  const [log, setLog] = React.useState<ScanLog[]>([]);
  const [completeOpen, setCompleteOpen] = React.useState(false);
  const [fgQty, setFgQty] = React.useState<string>("1");
  const [fgLot, setFgLot] = React.useState<string>("");
  const [fgNote, setFgNote] = React.useState<string>("");

  // Dedupe: lưu mã barcode + qty của scan trước đó để cảnh báo trùng trong 2s
  const lastScanRef = React.useRef<{ code: string; at: number } | null>(null);
  const [duplicateConfirm, setDuplicateConfirm] = React.useState<string | null>(
    null,
  );

  const woQuery = useWorkOrderDetail(woId || null);
  const progressQuery = useWoProgress(woId || null);
  const wo = woQuery.data?.data;
  const progress = progressQuery.data?.data;

  const scanMut = useAssemblyScan(woId);
  const completeMut = useCompleteWoViaAssembly(woId);
  const pauseMut = usePauseWorkOrder(woId);

  const addLog = React.useCallback((entry: Omit<ScanLog, "id" | "at">) => {
    setLog((prev) =>
      [{ id: uuidv7(), at: Date.now(), ...entry }, ...prev].slice(0, 10),
    );
  }, []);

  /**
   * Submit 1 scan với reservation đầu tiên ACTIVE còn qty.
   */
  const submitScan = React.useCallback(
    async (
      line: WoProgressLine,
      lotSerialId: string,
      barcode: string,
    ): Promise<void> => {
      const input: AssemblyScanInput = {
        scanId: uuidv7(),
        woId,
        snapshotLineId: line.snapshotLineId,
        lotSerialId,
        qty: 1,
        barcode,
        scannedAt: new Date().toISOString(),
        deviceId: "desktop-web",
      };
      try {
        const out = await scanMut.mutateAsync(input);
        addLog({
          code: barcode,
          status: "ok",
          kind: "PICK",
          sku: line.componentSku,
          qty: 1,
          message: `${line.componentSku} · ${out.data.completedQty}/${out.data.requiredQty}${
            out.data.idempotent ? " (idempotent)" : ""
          }`,
        });
        toast.success(`Đã pick 1 ${line.componentSku}`, {
          description: `${out.data.completedQty}/${out.data.requiredQty}`,
        });
      } catch (err) {
        addLog({
          code: barcode,
          status: "error",
          kind: "PICK",
          sku: line.componentSku,
          message: (err as Error).message,
        });
        toast.error((err as Error).message);
      }
    },
    [woId, scanMut, addLog],
  );

  const handleScan = React.useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      if (!progress) {
        addLog({
          code,
          status: "error",
          kind: "PICK",
          message: "Chưa tải xong tiến độ WO.",
        });
        return;
      }

      // Dedupe trong 2s — confirm
      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.code === code &&
        now - lastScanRef.current.at < 2000
      ) {
        setDuplicateConfirm(code);
        return;
      }
      lastScanRef.current = { code, at: now };

      // 1. Tra item theo barcode
      try {
        const res = await fetch(
          `/api/items/by-barcode/${encodeURIComponent(code)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          addLog({
            code,
            status: "error",
            kind: "LOOKUP",
            message: `Lookup HTTP ${res.status}`,
          });
          toast.error(`Không tra cứu được mã "${code}"`);
          return;
        }
        const body = (await res.json()) as {
          data: { itemId: string; sku: string; name: string } | null;
        };

        if (!body.data) {
          // Fallback: match lot_code trực tiếp
          const uc = code.toUpperCase();
          for (const line of progress.lines) {
            for (const r of line.reservations) {
              if (r.status !== "ACTIVE") continue;
              const lotCode = (r.lotCode ?? "").toUpperCase();
              if (lotCode === uc || uc.startsWith(lotCode)) {
                await submitScan(line, r.lotId, code);
                return;
              }
            }
          }
          addLog({
            code,
            status: "no-match",
            kind: "LOOKUP",
            message: "Không tìm thấy barcode trong catalog",
          });
          toast.error(`Barcode "${code}" không trong catalog`);
          return;
        }

        const { sku, name } = body.data;

        // 2. Match component SKU
        const line = progress.lines.find((l) => l.componentSku === sku);
        if (!line) {
          addLog({
            code,
            status: "no-match",
            kind: "LOOKUP",
            sku,
            message: `${sku} (${name}) không thuộc WO này`,
          });
          toast.error(`SKU ${sku} không thuộc WO này`);
          return;
        }

        // 3. Check remaining
        const remaining = line.requiredQty - line.completedQty;
        if (remaining <= 0) {
          addLog({
            code,
            status: "warn",
            kind: "PICK",
            sku,
            message: `${sku} đã đủ qty`,
          });
          toast.warning(`Đã đủ qty cho ${sku}`);
          return;
        }

        // 4. Reservation ACTIVE
        const reservation = line.reservations.find(
          (r) => r.status === "ACTIVE" && r.reservedQty > 0,
        );
        if (!reservation) {
          addLog({
            code,
            status: "error",
            kind: "PICK",
            sku,
            message: `${sku}: chưa có reservation ACTIVE`,
          });
          toast.error(
            `${sku} chưa có reservation ACTIVE — cần reserve lot trước`,
          );
          return;
        }

        await submitScan(line, reservation.lotId, code);
      } catch (err) {
        addLog({
          code,
          status: "error",
          kind: "LOOKUP",
          message: (err as Error).message,
        });
        toast.error((err as Error).message);
      }
    },
    [progress, addLog, submitScan],
  );

  // Confirm duplicate scan → submit lại
  const handleConfirmDuplicate = React.useCallback(() => {
    const code = duplicateConfirm;
    setDuplicateConfirm(null);
    if (!code) return;
    lastScanRef.current = { code, at: 0 }; // reset
    void handleScan(code);
  }, [duplicateConfirm, handleScan]);

  const handlePause = async () => {
    if (!wo) return;
    if (wo.status !== "IN_PROGRESS") {
      toast.info("WO này không ở trạng thái IN_PROGRESS để tạm dừng.");
      return;
    }
    const reason = window.prompt(
      "Lý do tạm dừng WO?",
      "Tạm dừng từ trang lắp ráp",
    );
    if (!reason) return;
    try {
      await pauseMut.mutateAsync({ mode: "pause", reason });
      toast.success("Đã tạm dừng WO");
      router.push("/assembly");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const openComplete = () => {
    if (!progress) return;
    if (progress.progressPercent < 100) {
      toast.error("Chưa pick đủ tất cả linh kiện");
      return;
    }
    setFgQty(String(num(wo?.plannedQty) || 1));
    setFgLot(`FG-${(wo?.woNo ?? "WO").replace(/[^A-Z0-9-]/gi, "")}-${Date.now().toString().slice(-6)}`);
    setFgNote("");
    setCompleteOpen(true);
  };

  const handleComplete = async () => {
    try {
      await completeMut.mutateAsync();
      toast.success(`WO ${wo?.woNo ?? ""} đã hoàn tất`, {
        description: fgLot ? `Lot FG: ${fgLot}` : undefined,
      });
      setCompleteOpen(false);
      router.push("/assembly");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ----- Render -----
  if (woQuery.isLoading || progressQuery.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-16 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải workspace lắp ráp…
      </div>
    );
  }

  if (woQuery.isError || !wo) {
    return (
      <div className="flex flex-col gap-3">
        <Link
          href="/assembly"
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
          Quay lại danh sách lắp ráp
        </Link>
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Không tìm thấy WO này hoặc bạn không có quyền truy cập.
        </div>
      </div>
    );
  }

  const totalRequired = progress?.totalRequired ?? 0;
  const totalCompleted = progress?.totalCompleted ?? 0;
  const progressPct = progress?.progressPercent ?? 0;
  const canComplete =
    progress &&
    progress.status === "IN_PROGRESS" &&
    progressPct >= 100 &&
    progress.lines.every(
      (l) => l.requiredQty - l.completedQty <= 0,
    );

  return (
    <div className="flex flex-col gap-4">
      {/* Sticky header */}
      <header className="sticky top-0 z-20 -mx-4 border-b border-zinc-200 bg-white/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-white/85 lg:-mx-6 lg:px-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link
              href="/assembly"
              className="inline-flex h-8 w-8 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Quay lại danh sách"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
            </Link>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Wrench className="h-4 w-4 text-zinc-500" aria-hidden />
                <h1 className="font-mono text-sm font-semibold text-zinc-900">
                  {wo.woNo}
                </h1>
                <Badge variant="info" className="text-[10px]">
                  {wo.status}
                </Badge>
              </div>
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                Plan: {num(wo.plannedQty)} · Good: {num(wo.goodQty)} ·{" "}
                {wo.orderNo ? `Đơn ${wo.orderNo}` : "Không liên kết đơn"}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Compact progress */}
            {progress ? (
              <div className="hidden items-center gap-2 sm:flex">
                <div className="relative h-1.5 w-32 overflow-hidden rounded-full bg-zinc-100">
                  <div
                    className={cn(
                      "absolute inset-y-0 left-0 rounded-full transition-all",
                      progressPct >= 100
                        ? "bg-emerald-500"
                        : "bg-indigo-500",
                    )}
                    style={{ width: `${Math.min(100, progressPct)}%` }}
                  />
                </div>
                <span className="text-xs tabular-nums text-zinc-600">
                  {totalCompleted}/{totalRequired} ({progressPct}%)
                </span>
              </div>
            ) : null}

            <div className="flex items-center gap-1">
              <Link
                href={`/work-orders/${wo.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                title="Chi tiết WO"
              >
                <ExternalLink className="h-3 w-3" aria-hidden />
                Chi tiết
              </Link>
              <Link
                href={`/pwa/assembly/${wo.id}`}
                className="inline-flex items-center gap-1 rounded-md border border-zinc-200 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                title="Mở PWA"
              >
                <Smartphone className="h-3 w-3" aria-hidden />
                PWA
              </Link>
              <Button
                size="sm"
                variant="outline"
                onClick={() => void handlePause()}
                disabled={pauseMut.isPending || wo.status !== "IN_PROGRESS"}
              >
                <PauseCircle className="h-3.5 w-3.5" aria-hidden />
                Tạm dừng
              </Button>
              <Button
                size="sm"
                onClick={openComplete}
                disabled={!canComplete || completeMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Hoàn tất WO
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* 2 cols: BOM lines (60%) + scan area (40%) */}
      <section className="grid gap-4 lg:grid-cols-[3fr,2fr]">
        {/* BOM lines table */}
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <header className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            BOM lines cần lắp{" "}
            {progress ? `(${progress.lines.length})` : ""}
          </header>
          {!progress || progress.lines.length === 0 ? (
            <div className="px-4 py-12 text-center text-xs text-zinc-500">
              WO này không có BOM line — cần snapshot order BOM trước.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Tên</th>
                  <th className="px-3 py-2 text-right font-medium">
                    Yêu cầu
                  </th>
                  <th className="px-3 py-2 text-right font-medium">Đã pick</th>
                  <th className="px-3 py-2 text-right font-medium">Còn lại</th>
                  <th className="px-3 py-2 text-center font-medium">
                    Trạng thái
                  </th>
                </tr>
              </thead>
              <tbody>
                {progress.lines.map((l) => {
                  const remaining = Math.max(
                    0,
                    l.requiredQty - l.completedQty,
                  );
                  const done = remaining === 0;
                  return (
                    <tr
                      key={l.snapshotLineId}
                      className={cn(
                        "border-t border-zinc-100 transition-colors",
                        done && "bg-emerald-50/40",
                      )}
                    >
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1">
                          <Package
                            className={cn(
                              "h-3.5 w-3.5",
                              done ? "text-emerald-500" : "text-zinc-400",
                            )}
                            aria-hidden
                          />
                          <code className="font-mono text-xs font-semibold">
                            {l.componentSku}
                          </code>
                        </div>
                      </td>
                      <td className="px-3 py-2 text-zinc-700">
                        {l.componentName}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {l.requiredQty}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums font-semibold">
                        {l.completedQty}
                      </td>
                      <td
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          done ? "text-emerald-700" : "text-zinc-600",
                        )}
                      >
                        {remaining}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge
                          variant={done ? "success" : "outline"}
                          className="text-[10px]"
                        >
                          {done ? "Đủ" : l.state}
                        </Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* Right column: scan + log */}
        <div className="flex flex-col gap-3">
          {/* Scan area */}
          <div className="rounded-md border border-zinc-200 bg-white p-3">
            <BarcodeScanInput
              onScan={(code) => void handleScan(code)}
              placeholder="Quét barcode component (USB/BT + Enter)"
              disabled={scanMut.isPending}
              autoFocus
              label="Quét / Nhập mã barcode"
            />
            {scanMut.isPending ? (
              <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500">
                <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
                Đang ghi nhận scan…
              </p>
            ) : (
              <p className="mt-2 text-[11px] text-zinc-400">
                Tip: ô luôn auto-focus. Nếu mất focus, click vào ô. Phím
                tắt: gõ tay rồi Enter.
              </p>
            )}
          </div>

          {/* Activity log */}
          <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
            <header className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
              <History className="h-3.5 w-3.5" aria-hidden />
              10 scan gần nhất ({log.length})
            </header>
            {log.length === 0 ? (
              <div className="px-4 py-8 text-center text-xs text-zinc-500">
                Chưa có scan nào. Quét barcode để bắt đầu.
              </div>
            ) : (
              <ul className="max-h-[420px] divide-y divide-zinc-100 overflow-y-auto">
                {log.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span
                        className={cn(
                          "h-1.5 w-1.5 shrink-0 rounded-full",
                          e.status === "ok"
                            ? "bg-emerald-500"
                            : e.status === "warn"
                              ? "bg-amber-500"
                              : e.status === "no-match"
                                ? "bg-amber-500"
                                : "bg-red-500",
                        )}
                        aria-hidden
                      />
                      <span className="text-[10px] font-mono uppercase tracking-wider text-zinc-400">
                        {e.kind}
                      </span>
                      <code className="flex-1 truncate font-mono text-[11px] text-zinc-900">
                        {e.code}
                      </code>
                      <span className="shrink-0 text-[10px] tabular-nums text-zinc-400">
                        {formatTime(e.at)}
                      </span>
                    </div>
                    <p
                      className={cn(
                        "mt-0.5 truncate pl-3.5 text-[11px]",
                        e.status === "ok"
                          ? "text-emerald-700"
                          : e.status === "warn" || e.status === "no-match"
                            ? "text-amber-700"
                            : "text-red-700",
                      )}
                    >
                      {e.message}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Duplicate scan confirm */}
      <Dialog
        open={duplicateConfirm !== null}
        onOpenChange={(open) => {
          if (!open) setDuplicateConfirm(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Quét trùng barcode?</DialogTitle>
            <DialogDescription>
              Mã <code className="font-mono">{duplicateConfirm}</code> vừa quét
              cách đây dưới 2 giây. Bạn muốn quét lại không?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDuplicateConfirm(null)}
            >
              Bỏ qua
            </Button>
            <Button onClick={handleConfirmDuplicate}>
              Quét lại
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Complete WO dialog */}
      <Dialog open={completeOpen} onOpenChange={setCompleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Hoàn tất Work Order</DialogTitle>
            <DialogDescription>
              Hoàn tất WO sẽ chuyển status sang COMPLETED, consume reservation
              và trừ kho. Hành động này không thể hoàn tác.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 py-2">
            <div>
              <label
                htmlFor="fg-qty"
                className="mb-1 block text-xs font-medium text-zinc-700"
              >
                Số lượng FG (thành phẩm)
              </label>
              <Input
                id="fg-qty"
                type="number"
                min={1}
                value={fgQty}
                onChange={(e) => setFgQty(e.target.value)}
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Theo plan: {num(wo.plannedQty)} cái.
              </p>
            </div>
            <div>
              <label
                htmlFor="fg-lot"
                className="mb-1 block text-xs font-medium text-zinc-700"
              >
                Lot code FG (gợi ý)
              </label>
              <Input
                id="fg-lot"
                value={fgLot}
                onChange={(e) => setFgLot(e.target.value)}
                placeholder="FG-WO123-001"
              />
              <p className="mt-1 text-[11px] text-zinc-500">
                Lưu ý: backend hiện chỉ chuyển status WO. FG serial sinh tự
                động ở giai đoạn sau.
              </p>
            </div>
            <div>
              <label
                htmlFor="fg-note"
                className="mb-1 block text-xs font-medium text-zinc-700"
              >
                Ghi chú
              </label>
              <Textarea
                id="fg-note"
                value={fgNote}
                onChange={(e) => setFgNote(e.target.value)}
                rows={2}
                placeholder="Tuỳ chọn — ví dụ: lô đặc biệt, QC fast-track..."
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setCompleteOpen(false)}
              disabled={completeMut.isPending}
            >
              Huỷ
            </Button>
            <Button
              onClick={() => void handleComplete()}
              disabled={completeMut.isPending}
            >
              {completeMut.isPending ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                  Đang hoàn tất…
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                  Xác nhận hoàn tất
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
