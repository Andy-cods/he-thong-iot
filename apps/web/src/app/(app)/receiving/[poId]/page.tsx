"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Loader2,
  Package,
  Smartphone,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BarcodeScanInput } from "@/components/ui/BarcodeScanInput";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { cn } from "@/lib/utils";
import { uuidv7 } from "@/lib/uuid-v7";
import {
  usePOForReceiving,
  useSubmitReceivingEvent,
  type POReceivingLine,
  type ReceivingEventInput,
} from "@/hooks/useReceivingEvents";

export const dynamic = "force-dynamic";

/**
 * V1.8 Batch 6 — Desktop receiving form cho từng PO.
 *
 * Flow:
 *   1. Load `/api/po/[id]` (usePOForReceiving) → hiển thị lines + qty còn lại.
 *   2. User nhập qty + lot/serial per line (chỉ những line có qty > 0).
 *   3. Click "Ghi nhận lô hàng" → POST `/api/receiving/events` batch.
 *      Backend 7-table atomic update sẽ cập nhật po.received_qty +
 *      inventory + snapshot state.
 *   4. Sau khi thành công → invalidate cache + redirect về `/receiving`.
 *
 * Không đụng `/api/receiving/events` POST logic (đã thật).
 */

interface LineInput {
  qty: string;
  lotCode: string;
  qcStatus: "OK" | "NG" | "PENDING";
}

function emptyLineInput(): LineInput {
  return { qty: "", lotCode: "", qcStatus: "PENDING" };
}

export default function ReceivingDetailPage({
  params,
}: {
  params: { poId: string };
}) {
  const router = useRouter();
  const { data: po, isLoading, isError, error } = usePOForReceiving(
    params.poId,
  );
  const submit = useSubmitReceivingEvent();
  const [inputs, setInputs] = React.useState<Record<string, LineInput>>({});
  const [notes, setNotes] = React.useState("");

  // Init inputs khi data về (1 lần).
  React.useEffect(() => {
    if (!po) return;
    setInputs((prev) => {
      const next = { ...prev };
      for (const ln of po.lines) {
        if (!next[ln.id!]) next[ln.id!] = emptyLineInput();
      }
      return next;
    });
  }, [po]);

  const updateLine = (
    lineId: string,
    patch: Partial<LineInput>,
  ) => {
    setInputs((prev) => ({
      ...prev,
      [lineId]: { ...(prev[lineId] ?? emptyLineInput()), ...patch },
    }));
  };

  // SKU → line lookup O(1) cho barcode scan.
  const skuMap = React.useMemo(() => {
    const m = new Map<string, POReceivingLine>();
    if (po?.lines) {
      for (const ln of po.lines) {
        if (ln.sku) m.set(ln.sku.toUpperCase(), ln);
      }
    }
    return m;
  }, [po?.lines]);

  const handleBarcodeScan = React.useCallback(
    (code: string) => {
      const ln = skuMap.get(code.toUpperCase());
      if (!ln) {
        toast.warning("Không tìm thấy SKU", {
          description: `Mã '${code}' không có trong PO này.`,
        });
        return;
      }
      if (ln.remainingQty <= 0) {
        toast.info("Đã đủ", {
          description: `${ln.sku} đã nhận đủ ${ln.orderedQty}.`,
        });
        return;
      }
      const lineId = ln.id!;
      setInputs((prev) => {
        const cur = prev[lineId] ?? emptyLineInput();
        const curQty = Number(cur.qty);
        const safe = Number.isFinite(curQty) && curQty > 0 ? curQty : 0;
        const nextQty = Math.min(ln.remainingQty, safe + 1);
        return {
          ...prev,
          [lineId]: { ...cur, qty: String(nextQty) },
        };
      });
      toast.success(`${ln.sku} +1`, { duration: 1200 });
    },
    [skuMap],
  );

  const activeLines = React.useMemo(() => {
    if (!po) return [];
    return po.lines
      .map((ln) => {
        const input = inputs[ln.id!] ?? emptyLineInput();
        const qtyNum = Number(input.qty);
        return { ln, input, qtyNum };
      })
      .filter((x) => Number.isFinite(x.qtyNum) && x.qtyNum > 0);
  }, [po, inputs]);

  const canSubmit = activeLines.length > 0 && !submit.isPending;

  const handleSubmit = async () => {
    if (!po || activeLines.length === 0) {
      toast.error("Nhập số lượng cho ít nhất 1 dòng.");
      return;
    }
    // Validate lot cho item LOT tracked
    for (const { ln, input } of activeLines) {
      if (ln.expectedLotSerial === "LOT" && !input.lotCode.trim()) {
        toast.error(`Dòng ${ln.lineNo} (${ln.sku}): cần nhập số lô.`);
        return;
      }
    }

    const scannedAt = new Date().toISOString();
    const events: ReceivingEventInput[] = activeLines.map(
      ({ ln, input, qtyNum }) => ({
        id: uuidv7(),
        scanId: uuidv7(),
        poCode: po.poCode,
        sku: ln.sku,
        qty: qtyNum,
        lotNo: input.lotCode.trim() || null,
        qcStatus: input.qcStatus,
        scannedAt,
        rawCode: ln.sku,
        metadata: {
          source: "receiving-form",
          poId: po.poId,
          poLineId: ln.id,
          notes: notes || undefined,
        },
      }),
    );

    try {
      const res = await submit.mutateAsync(events);
      const ackedCount = res.data.acked.length;
      const rejectedCount = res.data.rejected.length;
      if (rejectedCount === 0) {
        toast.success(`Đã ghi nhận ${ackedCount} dòng.`);
        router.push("/receiving");
      } else {
        toast.warning(
          `Ghi nhận ${ackedCount} dòng, ${rejectedCount} lỗi: ${res.data.rejected
            .map((r) => r.reason)
            .join(", ")}`,
        );
      }
    } catch (err) {
      toast.error(`Lỗi: ${(err as Error).message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải PO…
      </div>
    );
  }

  if (isError || !po) {
    return (
      <div className="mx-auto max-w-md rounded-md border border-amber-200 bg-amber-50 p-6 text-center">
        <AlertTriangle
          className="mx-auto h-8 w-8 text-amber-500"
          aria-hidden="true"
        />
        <h1 className="mt-3 text-sm font-semibold text-zinc-900">
          PO không khả dụng
        </h1>
        <p className="mt-1 text-xs text-zinc-600">
          {(error as Error | undefined)?.message ?? "Không tìm thấy PO."}
        </p>
        <Link
          href="/receiving"
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Về danh sách
        </Link>
      </div>
    );
  }

  const totals = po.totals;
  const isComplete = po.status === "RECEIVED" || po.status === "CLOSED";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/warehouse?tab=receiving"
            className="inline-flex items-center gap-1.5 text-xs text-zinc-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Về danh sách PO chờ nhận
          </Link>
          <div className="mt-2 flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-100">
              <Truck className="h-6 w-6 text-indigo-700" aria-hidden />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Nhận hàng (form đơn giản)
              </h1>
              <p className="mt-0.5 text-sm text-zinc-500">
                <span className="font-mono font-semibold text-zinc-700">{po.poCode}</span>
                {po.supplierName && <> · {po.supplierName}</>}
                {po.expectedDate && <> · ETA {po.expectedDate}</>}
                {" · "}{totals?.linesTotal ?? po.lines.length} dòng
              </p>
            </div>
          </div>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-2">
          {po.status && (
            <span className={cn(
              "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium ring-1 ring-inset",
              po.status === "PARTIAL" ? "bg-amber-50 text-amber-700 ring-amber-200" :
              po.status === "RECEIVED" || po.status === "CLOSED" ? "bg-emerald-50 text-emerald-700 ring-emerald-200" :
              po.status === "CANCELLED" ? "bg-red-50 text-red-700 ring-red-200" :
              "bg-blue-50 text-blue-700 ring-blue-200",
            )}>
              <span className={cn(
                "h-2 w-2 rounded-full",
                po.status === "PARTIAL" ? "bg-amber-500 animate-pulse" :
                po.status === "RECEIVED" || po.status === "CLOSED" ? "bg-emerald-500" :
                po.status === "CANCELLED" ? "bg-red-500" :
                "bg-blue-500",
              )} aria-hidden />
              {po.status}
            </span>
          )}
          <Link
            href={`/pwa/receive/${po.poId}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            <Smartphone className="h-3.5 w-3.5" aria-hidden />
            Mở PWA tablet
          </Link>
        </div>
      </div>

      {totals ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>
              Tiến độ nhận: <strong>{totals.receivedPct}%</strong> (
              {totals.receivedTotal}/{totals.orderedTotal})
            </span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full bg-indigo-500 transition-all"
              style={{ width: `${Math.min(100, totals.receivedPct)}%` }}
            />
          </div>
        </section>
      ) : null}

      {isComplete ? (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          <CheckCircle2 className="mr-1 inline h-4 w-4" aria-hidden="true" />
          PO đã {po.status}. Không thể ghi thêm lô hàng.
        </div>
      ) : null}

      {!isComplete ? (
        <BarcodeScanInput
          onScan={handleBarcodeScan}
          hint="Scanner USB sẽ tự gửi Enter sau khi quét — focus tự động về ô này sau mỗi mã."
          className="max-w-md"
          disabled={isComplete}
        />
      ) : null}

      {/* Bảng lines + input */}
      <section
        aria-label="Danh sách dòng PO"
        className="overflow-hidden rounded-md border border-zinc-200 bg-white"
      >
        <div className="grid grid-cols-[auto,1fr,auto,auto,auto,auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <div>#</div>
          <div>Mặt hàng</div>
          <div className="text-right">Đã nhận / Đặt</div>
          <div className="text-right">Còn lại</div>
          <div>Nhận thực tế</div>
          <div>Lô / QC</div>
        </div>
        {po.lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            PO không có dòng nào.
          </p>
        ) : (
          po.lines.map((ln) => (
            <LineRow
              key={ln.id}
              ln={ln}
              input={inputs[ln.id!] ?? emptyLineInput()}
              disabled={isComplete}
              onChange={(patch) => updateLine(ln.id!, patch)}
            />
          ))
        )}
      </section>

      {/* Notes + submit */}
      <section className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4">
        <div className="space-y-1.5">
          <Label htmlFor="receiving-notes" uppercase>
            Ghi chú (tuỳ chọn)
          </Label>
          <Input
            id="receiving-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Ví dụ: thùng 3 bị móp, thiếu 2 sản phẩm…"
            disabled={isComplete}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-zinc-500">
            {activeLines.length} dòng sẽ được ghi nhận.
          </p>
          <Button
            type="button"
            size="lg"
            disabled={!canSubmit || isComplete}
            onClick={() => void handleSubmit()}
          >
            {submit.isPending ? (
              <Loader2
                className="mr-1.5 h-4 w-4 animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Package className="mr-1.5 h-4 w-4" aria-hidden="true" />
            )}
            Ghi nhận lô hàng
          </Button>
        </div>
      </section>
    </div>
  );
}

function LineRow({
  ln,
  input,
  disabled,
  onChange,
}: {
  ln: POReceivingLine;
  input: LineInput;
  disabled: boolean;
  onChange: (patch: Partial<LineInput>) => void;
}) {
  const isDone = ln.remainingQty <= 0;
  const qtyNum = Number(input.qty);
  const overRemaining =
    Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum > ln.remainingQty;

  return (
    <div
      className={cn(
        "grid grid-cols-[auto,1fr,auto,auto,auto,auto] items-center gap-3 border-t border-zinc-100 px-4 py-3",
        isDone && "bg-emerald-50/40",
      )}
    >
      <div className="font-mono text-xs text-zinc-500">{ln.lineNo}</div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <code className="font-mono text-xs font-semibold text-zinc-900">
            {ln.sku}
          </code>
          {ln.expectedLotSerial === "LOT" ? (
            <span className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700">
              Lô
            </span>
          ) : null}
          {ln.expectedLotSerial === "SERIAL" ? (
            <span className="inline-flex items-center rounded-sm bg-purple-50 px-1.5 py-0.5 text-xs font-medium text-purple-700">
              Serial
            </span>
          ) : null}
          {isDone ? <StatusBadge status="ready" size="sm" /> : null}
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-600">{ln.itemName}</p>
      </div>
      <div className="text-right text-xs tabular-nums text-zinc-700">
        {ln.receivedQty} / {ln.orderedQty} {ln.uom}
      </div>
      <div
        className={cn(
          "text-right text-xs tabular-nums",
          isDone ? "text-emerald-700" : "text-zinc-900",
        )}
      >
        {ln.remainingQty} {ln.uom}
      </div>
      <div>
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          step={0.0001}
          value={input.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          placeholder="0"
          disabled={disabled || isDone}
          className={cn(
            "h-9 w-28 text-right tabular-nums",
            overRemaining && "border-amber-400 focus-visible:ring-amber-400",
          )}
          aria-invalid={overRemaining || undefined}
          aria-label={`Số lượng nhận ${ln.sku}`}
        />
      </div>
      <div className="flex items-center gap-2">
        {ln.expectedLotSerial === "LOT" ? (
          <Input
            value={input.lotCode}
            onChange={(e) => onChange({ lotCode: e.target.value })}
            placeholder="Lô"
            disabled={disabled || isDone}
            className="h-9 w-32"
            aria-label={`Số lô ${ln.sku}`}
          />
        ) : null}
        <div className="flex items-center gap-1">
          {(["OK", "NG", "PENDING"] as const).map((qc) => (
            <button
              key={qc}
              type="button"
              disabled={disabled || isDone}
              onClick={() => onChange({ qcStatus: qc })}
              className={cn(
                "inline-flex h-7 items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
                input.qcStatus === qc
                  ? qc === "OK"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : qc === "NG"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-zinc-400 bg-zinc-100 text-zinc-800"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50",
                (disabled || isDone) && "opacity-50",
              )}
              aria-pressed={input.qcStatus === qc}
            >
              {qc === "PENDING" ? "Chờ" : qc}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
