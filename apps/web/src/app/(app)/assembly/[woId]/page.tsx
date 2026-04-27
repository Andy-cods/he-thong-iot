"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  History,
  Keyboard,
  Loader2,
  Minus,
  Package,
  PauseCircle,
  Plus,
  ScanLine,
  Smartphone,
  Wrench,
  NotebookPen,
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
  useAssemblySessions,
  useCompleteWoViaAssembly,
  useWoProgress,
  type AssemblyScanInput,
  type AssemblySession,
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
 * Layout 3 tab (URL `?mode=manual|barcode|sessions`):
 *   - Manual (default): bảng BOM lines + input qty/lot/note + nút "Lưu pick".
 *   - Barcode: UI quét barcode hiện tại.
 *   - Sessions: sổ ghi chép đợt lắp ráp (group scan theo window 30 phút).
 *
 * Header sticky giữ nguyên (woNo, status, progress, nút Pause/Hoàn tất).
 *
 * Empty state "WO không có BOM line" có CTA rõ ràng → link sang trang
 * snapshot order để explode trước khi lắp ráp.
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

type TabMode = "manual" | "barcode" | "sessions";

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDurationMs(ms: number): string {
  if (ms < 1000) return "<1s";
  const sec = Math.round(ms / 1000);
  if (sec < 60) return `${sec}s`;
  const min = Math.floor(sec / 60);
  const remSec = sec % 60;
  if (min < 60) return `${min}p ${remSec}s`;
  const hr = Math.floor(min / 60);
  const remMin = min % 60;
  return `${hr}h ${remMin}p`;
}

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

export default function AssemblyWorkspacePage() {
  const params = useParams<{ woId: string }>();
  const router = useRouter();
  const searchParams = useSearchParams();
  const woId = params?.woId ?? "";

  const rawMode = (searchParams?.get("mode") ?? "manual") as TabMode;
  const tabMode: TabMode =
    rawMode === "barcode" || rawMode === "sessions" ? rawMode : "manual";

  const setTab = React.useCallback(
    (mode: TabMode) => {
      const sp = new URLSearchParams(searchParams?.toString() ?? "");
      if (mode === "manual") sp.delete("mode");
      else sp.set("mode", mode);
      const qs = sp.toString();
      router.replace(`/assembly/${woId}${qs ? `?${qs}` : ""}`, {
        scroll: false,
      });
    },
    [router, searchParams, woId],
  );

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
  const sessionsQuery = useAssemblySessions(
    tabMode === "sessions" && woId ? woId : null,
  );
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

  /** Pick chung (manual + barcode), submit scan API. */
  const submitPick = React.useCallback(
    async (
      line: WoProgressLine,
      lotSerialId: string,
      qty: number,
      opts: {
        barcode?: string;
        lotCode?: string | null;
        mode: "barcode" | "manual";
        note?: string | null;
      },
    ): Promise<boolean> => {
      const input: AssemblyScanInput = {
        scanId: uuidv7(),
        woId,
        snapshotLineId: line.snapshotLineId,
        lotSerialId,
        qty,
        barcode: opts.barcode ?? "",
        scannedAt: new Date().toISOString(),
        deviceId: opts.mode === "manual" ? "manual-entry" : "desktop-web",
        mode: opts.mode,
        lotCode: opts.lotCode ?? null,
        note: opts.note ?? null,
      };
      try {
        const out = await scanMut.mutateAsync(input);
        addLog({
          code:
            opts.barcode ??
            opts.lotCode ??
            `manual:${line.componentSku}`,
          status: "ok",
          kind: opts.mode === "manual" ? "MANUAL" : "PICK",
          sku: line.componentSku,
          qty,
          message: `${line.componentSku} · +${qty} → ${out.data.completedQty}/${out.data.requiredQty}${
            out.data.idempotent ? " (idempotent)" : ""
          }`,
        });
        toast.success(
          `Đã pick ${qty} × ${line.componentSku}`,
          {
            description: `${out.data.completedQty}/${out.data.requiredQty}`,
          },
        );
        return true;
      } catch (err) {
        addLog({
          code: opts.barcode ?? opts.lotCode ?? line.componentSku,
          status: "error",
          kind: opts.mode === "manual" ? "MANUAL" : "PICK",
          sku: line.componentSku,
          message: (err as Error).message,
        });
        toast.error((err as Error).message);
        return false;
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
                await submitPick(line, r.lotId, 1, {
                  barcode: code,
                  mode: "barcode",
                });
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

        await submitPick(line, reservation.lotId, 1, {
          barcode: code,
          mode: "barcode",
        });
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
    [progress, addLog, submitPick],
  );

  const handleConfirmDuplicate = React.useCallback(() => {
    const code = duplicateConfirm;
    setDuplicateConfirm(null);
    if (!code) return;
    lastScanRef.current = { code, at: 0 };
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
    progress.lines.every((l) => l.requiredQty - l.completedQty <= 0);

  const noLines = !progress || progress.lines.length === 0;

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

            {/* SVG Progress Ring */}
            {progress ? (() => {
              const R = 18;
              const C = 2 * Math.PI * R;
              const offset = C - (progressPct / 100) * C;
              return (
                <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
                  <svg
                    width="48"
                    height="48"
                    viewBox="0 0 48 48"
                    className="-rotate-90"
                    aria-hidden
                  >
                    <circle
                      cx="24"
                      cy="24"
                      r={R}
                      fill="none"
                      stroke="#e4e4e7"
                      strokeWidth="4"
                    />
                    <circle
                      cx="24"
                      cy="24"
                      r={R}
                      fill="none"
                      stroke={progressPct >= 100 ? "#10b981" : "#6366f1"}
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={offset}
                      style={{ transition: "stroke-dashoffset 0.5s ease" }}
                    />
                  </svg>
                  <span className="absolute text-[10px] font-bold tabular-nums text-zinc-700">
                    {progressPct}%
                  </span>
                </div>
              );
            })() : null}

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

        {/* Tab nav 3 mode */}
        <nav className="mt-3 flex items-center gap-1 border-b border-zinc-200 -mb-3">
          <TabButton
            active={tabMode === "manual"}
            onClick={() => setTab("manual")}
            icon={<Keyboard className="h-3.5 w-3.5" aria-hidden />}
            label="Nhập thủ công"
            sub="Mặc định"
          />
          <TabButton
            active={tabMode === "barcode"}
            onClick={() => setTab("barcode")}
            icon={<ScanLine className="h-3.5 w-3.5" aria-hidden />}
            label="Quét barcode"
            sub="Tuỳ chọn"
          />
          <TabButton
            active={tabMode === "sessions"}
            onClick={() => setTab("sessions")}
            icon={<NotebookPen className="h-3.5 w-3.5" aria-hidden />}
            label="Đợt lắp ráp"
            sub={
              sessionsQuery.data
                ? `${sessionsQuery.data.data.sessions.length} đợt`
                : undefined
            }
          />
        </nav>
      </header>

      {/* Empty state with strong CTA */}
      {noLines ? (
        <EmptyBomLineState
          orderNo={wo.orderNo}
          plannedQty={num(wo.plannedQty)}
        />
      ) : null}

      {/* Tab content */}
      {!noLines && tabMode === "manual" ? (
        <ManualPickPanel
          progress={progress!}
          onPick={(line, qty, lotCode, note) => {
            const reservation = line.reservations.find(
              (r) => r.status === "ACTIVE" && r.reservedQty > 0,
            );
            if (!reservation) {
              toast.error(
                `${line.componentSku} chưa có reservation ACTIVE — cần reserve lot trước`,
              );
              return;
            }
            return submitPick(line, reservation.lotId, qty, {
              mode: "manual",
              lotCode,
              note,
            });
          }}
          isSubmitting={scanMut.isPending}
        />
      ) : null}

      {!noLines && tabMode === "barcode" ? (
        <BarcodeModePanel
          progress={progress!}
          log={log}
          isPending={scanMut.isPending}
          onScan={(code) => void handleScan(code)}
        />
      ) : null}

      {tabMode === "sessions" ? (
        <SessionsPanel
          isLoading={sessionsQuery.isLoading}
          sessions={sessionsQuery.data?.data.sessions ?? []}
          gapMinutes={sessionsQuery.data?.data.gapMinutes ?? 30}
        />
      ) : null}

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
            <Button onClick={handleConfirmDuplicate}>Quét lại</Button>
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

// ---------------- TabButton ----------------

function TabButton({
  active,
  onClick,
  icon,
  label,
  sub,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  sub?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-xs font-medium transition-colors",
        active
          ? "border-indigo-500 text-indigo-700"
          : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-700",
      )}
      aria-current={active ? "page" : undefined}
    >
      {icon}
      <span>{label}</span>
      {sub ? (
        <span className="ml-1 text-[10px] text-zinc-400">{sub}</span>
      ) : null}
    </button>
  );
}

// ---------------- EmptyBomLineState ----------------

function EmptyBomLineState({
  orderNo,
  plannedQty,
}: {
  orderNo: string | null;
  plannedQty: number;
}) {
  return (
    <section className="rounded-md border border-amber-200 bg-amber-50 p-5">
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="h-5 w-5 shrink-0 text-amber-500"
          aria-hidden
        />
        <div className="flex-1">
          <h3 className="text-sm font-semibold text-amber-900">
            WO này chưa có BOM line — cần explode snapshot order
          </h3>
          <p className="mt-1 text-xs text-amber-800">
            Đơn hàng{" "}
            <code className="font-mono">{orderNo ?? "(không liên kết)"}</code>{" "}
            chưa có snapshot BOM. Bạn cần vào trang đơn hàng → tab{" "}
            <strong>Snapshot</strong> → bấm{" "}
            <strong>"Explode snapshot"</strong> với revision RELEASED và target
            qty = {plannedQty}. Sau đó quay lại đây để bắt đầu lắp ráp.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {orderNo ? (
              <Link
                href={`/orders/${encodeURIComponent(orderNo)}`}
                className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-700"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Mở đơn {orderNo}
              </Link>
            ) : null}
            <Link
              href="/orders"
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              Danh sách đơn hàng
            </Link>
            <Link
              href="/assembly"
              className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-800 hover:bg-amber-100"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
              Quay lại danh sách lắp ráp
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

// ---------------- ManualPickPanel ----------------

interface ManualRowState {
  qty: string;
  lot: string;
  note: string;
}

function ManualPickPanel({
  progress,
  onPick,
  isSubmitting,
}: {
  progress: NonNullable<ReturnType<typeof useWoProgress>["data"]>["data"];
  onPick: (
    line: WoProgressLine,
    qty: number,
    lotCode: string | null,
    note: string | null,
  ) => Promise<boolean> | boolean | void;
  isSubmitting: boolean;
}) {
  const [rows, setRows] = React.useState<Record<string, ManualRowState>>({});

  const updateRow = (
    snapshotLineId: string,
    patch: Partial<ManualRowState>,
  ) => {
    setRows((prev) => ({
      ...prev,
      [snapshotLineId]: {
        qty: prev[snapshotLineId]?.qty ?? "",
        lot: prev[snapshotLineId]?.lot ?? "",
        note: prev[snapshotLineId]?.note ?? "",
        ...patch,
      },
    }));
  };

  const handlePickAll = () => {
    const next: Record<string, ManualRowState> = { ...rows };
    for (const l of progress.lines) {
      const remaining = Math.max(0, l.requiredQty - l.completedQty);
      if (remaining <= 0) continue;
      next[l.snapshotLineId] = {
        qty: String(remaining),
        lot: rows[l.snapshotLineId]?.lot ?? "",
        note: rows[l.snapshotLineId]?.note ?? "",
      };
    }
    setRows(next);
  };

  const submitRow = async (line: WoProgressLine) => {
    const r = rows[line.snapshotLineId];
    const qty = num(r?.qty);
    const remaining = Math.max(0, line.requiredQty - line.completedQty);
    if (qty <= 0) {
      toast.warning("Nhập số lượng pick > 0");
      return;
    }
    if (qty > remaining) {
      toast.error(`Chỉ còn ${remaining} cần lắp cho ${line.componentSku}`);
      return;
    }
    const ok = await onPick(
      line,
      qty,
      r?.lot?.trim() || null,
      r?.note?.trim() || null,
    );
    if (ok) {
      // reset row
      setRows((prev) => ({
        ...prev,
        [line.snapshotLineId]: { qty: "", lot: "", note: "" },
      }));
    }
  };

  return (
    <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-200 bg-zinc-50 px-3 py-2">
        <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          Bảng nhập thủ công ({progress.lines.length} dòng BOM)
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            onClick={handlePickAll}
            disabled={isSubmitting}
            title="Tự động điền số lượng = Còn lại cho mọi dòng"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Pick tất cả còn lại
          </Button>
        </div>
      </header>

      {/* KPI strip */}
      <div className="grid grid-cols-4 divide-x divide-zinc-200 border-b border-zinc-200 bg-white">
        {[
          {
            label: "Tổng cần",
            value: progress.totalRequired,
            color: "text-zinc-800",
          },
          {
            label: "Đã pick",
            value: progress.totalCompleted,
            color: "text-indigo-700",
          },
          {
            label: "Còn lại",
            value: Math.max(0, progress.totalRequired - progress.totalCompleted),
            color: "text-amber-700",
          },
          {
            label: "Hoàn thành",
            value: `${progress.progressPercent}%`,
            color:
              progress.progressPercent >= 100
                ? "text-emerald-700"
                : "text-zinc-600",
          },
        ].map((k) => (
          <div key={k.label} className="px-4 py-2.5 text-center">
            <p className="text-[10px] uppercase tracking-wide text-zinc-500">
              {k.label}
            </p>
            <p
              className={cn(
                "font-mono text-xl font-bold tabular-nums",
                k.color,
              )}
            >
              {k.value}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="w-10 px-2 py-2 text-left font-medium">#</th>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Tên</th>
              <th className="px-3 py-2 text-right font-medium">Yêu cầu</th>
              <th className="px-3 py-2 text-right font-medium">Đã pick</th>
              <th className="px-3 py-2 text-right font-medium">Còn lại</th>
              <th className="w-44 px-3 py-2 text-center font-medium">
                Pick lần này
              </th>
              <th className="w-44 px-3 py-2 text-left font-medium">
                Lot/Serial
              </th>
              <th className="px-3 py-2 text-left font-medium">Ghi chú</th>
              <th className="w-24 px-3 py-2 text-center font-medium">
                Hành động
              </th>
            </tr>
          </thead>
          <tbody>
            {progress.lines.map((l, idx) => {
              const remaining = Math.max(0, l.requiredQty - l.completedQty);
              const done = remaining === 0;
              const r = rows[l.snapshotLineId] ?? {
                qty: "",
                lot: "",
                note: "",
              };
              const reservation = l.reservations.find(
                (x) => x.status === "ACTIVE" && x.reservedQty > 0,
              );
              return (
                <tr
                  key={l.snapshotLineId}
                  className={cn(
                    "border-t border-zinc-100 align-top transition-colors",
                    done
                      ? "bg-emerald-50/60"
                      : "bg-white hover:bg-indigo-50/30",
                  )}
                >
                  <td className="px-2 py-2 text-zinc-400 tabular-nums">
                    {idx + 1}
                  </td>
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
                  <td className="px-3 py-2">
                    {done ? (
                      <Badge variant="success" className="text-[10px]">
                        Đã đủ
                      </Badge>
                    ) : (
                      <div className="flex items-center justify-center gap-1">
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                          onClick={() =>
                            updateRow(l.snapshotLineId, {
                              qty: String(Math.max(0, num(r.qty) - 1)),
                            })
                          }
                          disabled={isSubmitting || num(r.qty) <= 0}
                          aria-label="Giảm 1"
                        >
                          <Minus className="h-3 w-3" aria-hidden />
                        </button>
                        <Input
                          type="number"
                          inputMode="numeric"
                          min={0}
                          max={remaining}
                          value={r.qty}
                          onChange={(e) =>
                            updateRow(l.snapshotLineId, {
                              qty: e.target.value,
                            })
                          }
                          placeholder="0"
                          className="h-7 w-16 text-center text-xs"
                          disabled={isSubmitting}
                        />
                        <button
                          type="button"
                          className="inline-flex h-6 w-6 items-center justify-center rounded border border-zinc-200 text-zinc-600 hover:bg-zinc-100 disabled:opacity-50"
                          onClick={() =>
                            updateRow(l.snapshotLineId, {
                              qty: String(
                                Math.min(remaining, num(r.qty) + 1),
                              ),
                            })
                          }
                          disabled={isSubmitting || num(r.qty) >= remaining}
                          aria-label="Tăng 1"
                        >
                          <Plus className="h-3 w-3" aria-hidden />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={r.lot}
                      onChange={(e) =>
                        updateRow(l.snapshotLineId, { lot: e.target.value })
                      }
                      placeholder={
                        reservation?.lotCode
                          ? `Mặc định: ${reservation.lotCode}`
                          : "Lot/Serial (tuỳ chọn)"
                      }
                      className="h-7 text-xs"
                      disabled={done || isSubmitting}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <Input
                      value={r.note}
                      onChange={(e) =>
                        updateRow(l.snapshotLineId, { note: e.target.value })
                      }
                      placeholder="Ghi chú (tuỳ chọn)"
                      className="h-7 text-xs"
                      disabled={done || isSubmitting}
                    />
                  </td>
                  <td className="px-3 py-2 text-center">
                    {done ? (
                      <span className="text-[11px] text-emerald-700">—</span>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void submitRow(l)}
                        disabled={isSubmitting || num(r.qty) <= 0}
                      >
                        Lưu pick
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <footer className="border-t border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-500">
        Tip: nhập tay khi linh kiện không có barcode. Lot/Serial tuỳ chọn —
        nếu để trống sẽ dùng lot reservation mặc định.
      </footer>
    </section>
  );
}

// ---------------- BarcodeModePanel ----------------

function BarcodeModePanel({
  progress,
  log,
  isPending,
  onScan,
}: {
  progress: NonNullable<ReturnType<typeof useWoProgress>["data"]>["data"];
  log: ScanLog[];
  isPending: boolean;
  onScan: (code: string) => void;
}) {
  return (
    <section className="grid gap-4 lg:grid-cols-[3fr,2fr]">
      {/* BOM lines table */}
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <header className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <ClipboardList className="h-3.5 w-3.5" aria-hidden />
          BOM lines cần lắp ({progress.lines.length})
        </header>
        <table className="w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 text-left font-medium">SKU</th>
              <th className="px-3 py-2 text-left font-medium">Tên</th>
              <th className="px-3 py-2 text-right font-medium">Yêu cầu</th>
              <th className="px-3 py-2 text-right font-medium">Đã pick</th>
              <th className="px-3 py-2 text-right font-medium">Còn lại</th>
              <th className="px-3 py-2 text-center font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {progress.lines.map((l) => {
              const remaining = Math.max(0, l.requiredQty - l.completedQty);
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
      </div>

      <div className="flex flex-col gap-3">
        <div className="rounded-md border border-zinc-200 bg-white p-3">
          <BarcodeScanInput
            onScan={onScan}
            placeholder="Quét barcode component (USB/BT + Enter)"
            disabled={isPending}
            autoFocus
            label="Quét / Nhập mã barcode"
          />
          {isPending ? (
            <p className="mt-2 inline-flex items-center gap-1 text-[11px] text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Đang ghi nhận scan…
            </p>
          ) : (
            <p className="mt-2 text-[11px] text-zinc-400">
              Tip: ô luôn auto-focus. Nếu mất focus, click vào ô. Phím tắt: gõ
              tay rồi Enter.
            </p>
          )}
        </div>

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
  );
}

// ---------------- SessionsPanel ----------------

function SessionsPanel({
  isLoading,
  sessions,
  gapMinutes,
}: {
  isLoading: boolean;
  sessions: AssemblySession[];
  gapMinutes: number;
}) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Đang tải sổ ghi chép đợt lắp ráp…
      </div>
    );
  }

  if (sessions.length === 0) {
    return (
      <div className="rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-center">
        <NotebookPen
          className="mx-auto h-8 w-8 text-zinc-300"
          aria-hidden
        />
        <p className="mt-2 text-sm font-medium text-zinc-700">
          Chưa có đợt lắp ráp nào
        </p>
        <p className="mt-1 text-xs text-zinc-500">
          Pick linh kiện ở tab Nhập thủ công hoặc Quét barcode để bắt đầu đợt
          đầu tiên. Sổ ghi chép sẽ tự nhóm theo cửa sổ {gapMinutes} phút.
        </p>
      </div>
    );
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="rounded-md border border-zinc-200 bg-white px-3 py-2 text-[11px] text-zinc-500">
        Hệ thống tự nhóm các lần pick thành <strong>đợt</strong> nếu khoảng
        cách giữa 2 lần &lt; {gapMinutes} phút và cùng người lắp. Mỗi đợt là
        một bản ghi đóng — bạn không cần thao tác bắt đầu/đóng đợt thủ công.
      </div>

      {sessions
        .slice()
        .reverse()
        .map((s) => (
          <SessionCard key={s.sessionNo} session={s} />
        ))}
    </section>
  );
}

function SessionCard({ session }: { session: AssemblySession }) {
  const [expanded, setExpanded] = React.useState(session.isLive);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-md border bg-white transition-colors",
        session.isLive
          ? "border-indigo-300 ring-1 ring-indigo-100"
          : "border-zinc-200",
      )}
    >
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-zinc-100 px-3 py-2">
        <div className="flex items-center gap-2 min-w-0">
          <Badge
            variant={session.isLive ? "info" : "outline"}
            className="text-[10px]"
          >
            Đợt #{session.sessionNo}
          </Badge>
          {session.isLive ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-medium text-indigo-700">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-indigo-500" />
              Đang chạy
            </span>
          ) : (
            <span className="text-[11px] text-zinc-500">Đã đóng</span>
          )}
          <span className="truncate text-[11px] text-zinc-500">
            {formatDateTime(session.startedAt)} →{" "}
            {formatDateTime(session.endedAt)} ·{" "}
            {formatDurationMs(session.durationMs)}
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-zinc-600">
          <span>
            Người lắp:{" "}
            <strong className="text-zinc-900">
              {session.userName ?? "Không rõ"}
            </strong>
          </span>
          <span>
            <strong className="tabular-nums text-zinc-900">
              {session.totalLines}
            </strong>{" "}
            dòng
          </span>
          <span>
            <strong className="tabular-nums text-zinc-900">
              {session.totalQty}
            </strong>{" "}
            qty
          </span>
          <span>
            <strong className="tabular-nums text-zinc-900">
              {session.totalScans}
            </strong>{" "}
            lần pick
          </span>
          <button
            type="button"
            className="rounded border border-zinc-200 px-2 py-0.5 text-[11px] text-indigo-600 hover:bg-zinc-50"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? "Ẩn chi tiết" : "Xem chi tiết"}
          </button>
        </div>
      </header>

      {expanded ? (
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Thời gian</th>
                <th className="px-3 py-1.5 text-left font-medium">SKU</th>
                <th className="px-3 py-1.5 text-left font-medium">Tên</th>
                <th className="px-3 py-1.5 text-right font-medium">Qty</th>
                <th className="px-3 py-1.5 text-left font-medium">Mã/Lot</th>
                <th className="px-3 py-1.5 text-center font-medium">Nguồn</th>
              </tr>
            </thead>
            <tbody>
              {session.lines.map((l) => (
                <tr
                  key={l.scanId}
                  className="border-t border-zinc-100 hover:bg-zinc-50/40"
                >
                  <td className="px-3 py-1.5 text-zinc-500 tabular-nums">
                    {formatTime(new Date(l.scannedAt).getTime())}
                  </td>
                  <td className="px-3 py-1.5">
                    <code className="font-mono text-xs">
                      {l.componentSku ?? "—"}
                    </code>
                  </td>
                  <td className="px-3 py-1.5 text-zinc-700">
                    {l.componentName ?? "—"}
                  </td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-semibold">
                    {l.qty}
                  </td>
                  <td className="px-3 py-1.5">
                    <code className="font-mono text-[11px] text-zinc-600">
                      {l.barcode || "—"}
                    </code>
                  </td>
                  <td className="px-3 py-1.5 text-center">
                    <Badge
                      variant={l.mode === "manual" ? "warning" : "info"}
                      className="text-[10px]"
                    >
                      {l.mode === "manual" ? "Thủ công" : "Barcode"}
                    </Badge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </article>
  );
}
