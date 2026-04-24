"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardList,
  ExternalLink,
  Factory,
  History,
  Loader2,
  Package,
  Smartphone,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarcodeScanInput } from "@/components/scan/BarcodeScanInput";
import { useWorkOrdersList } from "@/hooks/useWorkOrders";
import {
  useAssemblyScan,
  useCompleteWoViaAssembly,
  useWoProgress,
  type AssemblyScanInput,
} from "@/hooks/useAssembly";
import { uuidv7 } from "@/lib/uuid-v7";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * V1.9 Phase 5 — Assembly page (desktop).
 *
 * Layout 2 cột:
 *   - Header: chọn WO đang IN_PROGRESS (Select dropdown).
 *   - Scan area: BarcodeScanInput đặt trên cùng — scanner USB/BT gõ vào + Enter.
 *   - Cột trái: Bảng BOM lines (SKU, Tên, Required, Issued, Remaining, Trạng thái).
 *   - Cột phải: Activity log scan gần nhất (50 entries, timestamp + code + kết
 *     quả match/no-match).
 *   - Footer: Button "Hoàn tất WO" chỉ bật khi progress ≥ 100%.
 *
 * Flow scan:
 *   1. Barcode nhận được → GET /api/items/by-barcode/[code] (tìm item tương ứng).
 *   2. Nếu item khớp với 1 line trong WO (theo componentSku) → match reservation
 *      đầu tiên còn ACTIVE → gọi POST /api/assembly/scan với qty=1.
 *   3. Nếu không khớp → toast error + log activity "no-match".
 *
 * Lưu ý:
 *   - Desktop chỉ dùng barcode wedge + click — không camera (PWA có).
 *   - Activity log lưu client state (không persist DB) — trace tạm thời.
 */

interface ScanLog {
  id: string;
  code: string;
  at: number;
  status: "ok" | "no-match" | "error";
  message: string;
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export default function AssemblyPage() {
  const [selectedWoId, setSelectedWoId] = React.useState<string>("");
  const [log, setLog] = React.useState<ScanLog[]>([]);

  // WO list — chỉ load IN_PROGRESS
  const woListQuery = useWorkOrdersList({
    status: ["IN_PROGRESS"],
    page: 1,
    pageSize: 50,
  });
  const woRows = woListQuery.data?.data ?? [];

  // Progress của WO đang chọn
  const progressQuery = useWoProgress(selectedWoId || null);
  const progress = progressQuery.data?.data;

  const scanMut = useAssemblyScan(selectedWoId);
  const completeMut = useCompleteWoViaAssembly(selectedWoId);

  // Auto-chọn WO đầu tiên khi có
  React.useEffect(() => {
    if (!selectedWoId && woRows.length > 0) {
      setSelectedWoId(woRows[0]!.id);
    }
  }, [selectedWoId, woRows]);

  const addLog = React.useCallback((entry: Omit<ScanLog, "id" | "at">) => {
    setLog((prev) =>
      [{ id: uuidv7(), at: Date.now(), ...entry }, ...prev].slice(0, 50),
    );
  }, []);

  const handleScan = React.useCallback(
    async (raw: string) => {
      const code = raw.trim();
      if (!code) return;

      if (!selectedWoId || !progress) {
        addLog({
          code,
          status: "error",
          message: "Chưa chọn WO để lắp ráp.",
        });
        toast.error("Chọn một lệnh sản xuất (WO) trước khi quét.");
        return;
      }

      // 1. Tìm item theo barcode
      try {
        const res = await fetch(
          `/api/items/by-barcode/${encodeURIComponent(code)}`,
          { credentials: "include" },
        );
        if (!res.ok) {
          addLog({
            code,
            status: "error",
            message: `Lookup lỗi HTTP ${res.status}`,
          });
          toast.error(`Không tra cứu được mã "${code}".`);
          return;
        }
        const body = (await res.json()) as {
          data: { itemId: string; sku: string; name: string } | null;
        };

        // Fallback: nếu không match item → vẫn thử match trực tiếp theo lot_code
        // trong reservations (AssemblyConsole đã dùng cách này).
        if (!body.data) {
          // Match lot code trực tiếp
          const uc = code.toUpperCase();
          for (const line of progress.lines) {
            for (const r of line.reservations) {
              if (r.status !== "ACTIVE") continue;
              const lotCode = (r.lotCode ?? "").toUpperCase();
              if (lotCode === uc || uc.startsWith(lotCode)) {
                await submitScan(line.snapshotLineId, r.lotId, code, line);
                return;
              }
            }
          }
          addLog({
            code,
            status: "no-match",
            message: "Không tìm thấy barcode trong catalog.",
          });
          toast.error(`Barcode "${code}" không thuộc catalog.`);
          return;
        }

        const { sku, name } = body.data;

        // 2. Match component SKU trong lines
        const line = progress.lines.find((l) => l.componentSku === sku);
        if (!line) {
          addLog({
            code,
            status: "no-match",
            message: `${sku} (${name}) không thuộc WO này.`,
          });
          toast.error(`"${sku}" không thuộc WO đang lắp.`);
          return;
        }

        // Kiểm remaining
        const remaining = line.requiredQty - line.completedQty;
        if (remaining <= 0) {
          addLog({
            code,
            status: "no-match",
            message: `${sku} đã đủ số lượng.`,
          });
          toast.warning(`"${sku}" đã đủ số lượng yêu cầu.`);
          return;
        }

        // Pick reservation còn ACTIVE, đủ qty
        const reservation = line.reservations.find(
          (r) => r.status === "ACTIVE" && r.reservedQty > 0,
        );
        if (!reservation) {
          addLog({
            code,
            status: "error",
            message: `${sku}: chưa có lot reservation.`,
          });
          toast.error(
            `"${sku}" chưa có lot reservation ACTIVE — cần reserve lot trước.`,
          );
          return;
        }

        await submitScan(
          line.snapshotLineId,
          reservation.lotId,
          code,
          {
            componentSku: sku,
            componentName: name,
          },
        );
      } catch (err) {
        addLog({
          code,
          status: "error",
          message: (err as Error).message,
        });
        toast.error((err as Error).message);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectedWoId, progress, addLog],
  );

  async function submitScan(
    snapshotLineId: string,
    lotSerialId: string,
    barcode: string,
    info: { componentSku: string; componentName: string },
  ) {
    const input: AssemblyScanInput = {
      scanId: uuidv7(),
      woId: selectedWoId,
      snapshotLineId,
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
        message: `${info.componentSku} · ${out.data.completedQty}/${out.data.requiredQty}${
          out.data.idempotent ? " (idempotent)" : ""
        }`,
      });
      toast.success(
        `Đã ghi nhận ${info.componentSku}: ${out.data.completedQty}/${out.data.requiredQty}.`,
      );
    } catch (err) {
      addLog({
        code: barcode,
        status: "error",
        message: (err as Error).message,
      });
      toast.error((err as Error).message);
    }
  }

  const handleComplete = async () => {
    if (!selectedWoId) return;
    if (
      !confirm(
        "Xác nhận hoàn thành WO? Yêu cầu tất cả line phải đủ số lượng trước.",
      )
    ) {
      return;
    }
    try {
      await completeMut.mutateAsync();
      toast.success("WO đã hoàn thành.");
      // Reset chọn WO
      setSelectedWoId("");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const totalRequired = progress?.totalRequired ?? 0;
  const totalCompleted = progress?.totalCompleted ?? 0;
  const progressPct = progress?.progressPercent ?? 0;
  const canComplete =
    progress && progress.status === "IN_PROGRESS" && progressPct >= 100;

  const selectedWo = woRows.find((w) => w.id === selectedWoId);

  return (
    <div className="flex flex-col gap-5">
      <section>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Wrench className="h-5 w-5 text-zinc-500" aria-hidden="true" />
          Lắp ráp
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Quét barcode component để ghi nhận đã xuất kho cho lắp ráp. Máy quét
          USB/Bluetooth hoạt động như bàn phím — cắm vào, quét, hệ thống tự
          nhận. Nếu không có máy quét, dùng ô nhập tay rồi bấm Enter.
        </p>
      </section>

      {/* Header: chọn WO + action */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex-1 min-w-[280px]">
            <label
              htmlFor="wo-select"
              className="mb-1 block text-xs font-medium text-zinc-700"
            >
              <span className="inline-flex items-center gap-1">
                <Factory className="h-3.5 w-3.5" aria-hidden="true" />
                Lệnh sản xuất đang lắp (IN_PROGRESS)
              </span>
            </label>
            {woListQuery.isLoading ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 text-xs text-zinc-500">
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                Đang tải danh sách WO…
              </div>
            ) : woRows.length === 0 ? (
              <div className="flex h-9 items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 text-xs text-amber-800">
                Chưa có WO nào ở trạng thái IN_PROGRESS.
              </div>
            ) : (
              <Select
                value={selectedWoId}
                onValueChange={(v) => setSelectedWoId(v)}
              >
                <SelectTrigger id="wo-select">
                  <SelectValue placeholder="— Chọn WO —" />
                </SelectTrigger>
                <SelectContent>
                  {woRows.map((wo) => (
                    <SelectItem key={wo.id} value={wo.id}>
                      <span className="font-mono text-xs">{wo.woNo}</span>
                      {wo.orderNo ? (
                        <span className="ml-2 text-xs text-zinc-500">
                          · Đơn {wo.orderNo}
                        </span>
                      ) : null}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {selectedWo ? (
            <div className="flex items-center gap-3 text-xs">
              <Badge variant="info">{selectedWo.status}</Badge>
              <span className="text-zinc-500">
                Kế hoạch {selectedWo.plannedQty} · Good {selectedWo.goodQty}
              </span>
              <Link
                href={`/work-orders/${selectedWo.id}`}
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <ExternalLink className="h-3.5 w-3.5" aria-hidden />
                Chi tiết
              </Link>
              <Link
                href={`/pwa/assembly/${selectedWo.id}`}
                className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
              >
                <Smartphone className="h-3.5 w-3.5" aria-hidden />
                Mở PWA
              </Link>
            </div>
          ) : null}
        </div>

        {/* Progress bar */}
        {progress ? (
          <div className="mt-4 flex items-center gap-3">
            <div className="relative h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className={cn(
                  "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
                  progressPct >= 100 ? "bg-emerald-500" : "bg-indigo-500",
                )}
                style={{ width: `${Math.min(100, progressPct)}%` }}
              />
            </div>
            <span className="text-xs tabular-nums text-zinc-600">
              {totalCompleted}/{totalRequired} ({progressPct}%)
            </span>
            {canComplete ? (
              <Button
                size="sm"
                onClick={() => void handleComplete()}
                disabled={completeMut.isPending}
              >
                <CheckCircle2 className="h-3.5 w-3.5" aria-hidden />
                Hoàn thành WO
              </Button>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* Scan area */}
      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <BarcodeScanInput
          onScan={(code) => void handleScan(code)}
          placeholder="Quét barcode component (máy quét USB/BT gõ tự động + Enter)"
          disabled={!selectedWoId || scanMut.isPending}
          autoFocus
          label="Quét / Nhập mã barcode"
        />
        {scanMut.isPending ? (
          <p className="mt-2 inline-flex items-center gap-1 text-xs text-zinc-500">
            <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
            Đang ghi nhận scan…
          </p>
        ) : null}
      </section>

      {/* 2 column: BOM lines + Activity log */}
      <section className="grid gap-4 lg:grid-cols-[1fr,380px]">
        {/* BOM lines */}
        <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <header className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <ClipboardList className="h-3.5 w-3.5" aria-hidden />
            BOM lines {progress ? `(${progress.lines.length})` : ""}
          </header>
          {!selectedWoId ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              Chọn một WO để xem BOM lines.
            </div>
          ) : progressQuery.isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-zinc-500">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
              Đang tải tiến độ…
            </div>
          ) : !progress || progress.lines.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              WO này không có BOM line nào.
            </div>
          ) : (
            <table className="w-full text-xs">
              <thead className="border-b border-zinc-200 bg-zinc-50 text-[10px] uppercase tracking-wider text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left font-medium">SKU</th>
                  <th className="px-3 py-2 text-left font-medium">Tên</th>
                  <th className="px-3 py-2 text-right font-medium">Req</th>
                  <th className="px-3 py-2 text-right font-medium">Done</th>
                  <th className="px-3 py-2 text-right font-medium">Còn</th>
                  <th className="px-3 py-2 text-center font-medium">Trạng thái</th>
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

        {/* Activity log */}
        <aside className="overflow-hidden rounded-md border border-zinc-200 bg-white">
          <header className="flex h-9 items-center gap-2 border-b border-zinc-200 bg-zinc-50 px-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <History className="h-3.5 w-3.5" aria-hidden />
            Hoạt động quét ({log.length})
          </header>
          {log.length === 0 ? (
            <div className="px-4 py-8 text-center text-xs text-zinc-500">
              Chưa có scan nào. Quét barcode để bắt đầu.
            </div>
          ) : (
            <ul className="max-h-[480px] divide-y divide-zinc-100 overflow-y-auto">
              {log.map((e) => (
                <li key={e.id} className="px-3 py-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "h-1.5 w-1.5 shrink-0 rounded-full",
                        e.status === "ok"
                          ? "bg-emerald-500"
                          : e.status === "no-match"
                            ? "bg-amber-500"
                            : "bg-red-500",
                      )}
                      aria-hidden
                    />
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
                        : e.status === "no-match"
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
        </aside>
      </section>
    </div>
  );
}
