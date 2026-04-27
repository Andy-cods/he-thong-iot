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
  ScanLine,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { BarcodeScanInput } from "@/components/ui/BarcodeScanInput";
import { StatusBadge } from "@/components/domain/StatusBadge";
import {
  Wizard,
  WizardSummary,
  useWizardStep,
  type WizardStep,
} from "@/components/wizard";
import { cn } from "@/lib/utils";
import { uuidv7 } from "@/lib/uuid-v7";
import {
  usePOForReceiving,
  useSubmitReceivingEvent,
  type POReceivingLine,
  type ReceivingEventInput,
} from "@/hooks/useReceivingEvents";
import { useApproveReceiving } from "@/hooks/useReceivingApprove";

/**
 * V3 (TASK-20260427-020) — Wizard nhận hàng desktop cho từng PO.
 *
 * 3 step:
 *   1. check    — Hiển thị PO info + line cần nhận (qty còn lại). Confirm bắt đầu.
 *   2. capture  — Nhập qty thực nhận + lot code + QC status từng dòng.
 *                 Có barcode scanner focus input cho USB/PWA.
 *   3. qc       — Tổng kết (#OK / #NG / #PENDING) → "Gửi nhận hàng" (POST events)
 *                 → sau đó hỏi "Duyệt PO ngay?" nếu received >= 95%.
 *
 * Form receiving cũ `/receiving/[poId]/page.tsx` GIỮ NGUYÊN cho PWA mobile.
 * Tab Receiving warehouse có thêm link "Mở wizard desktop" tới đây.
 */

export const dynamic = "force-dynamic";

const STEP_KEYS = ["check", "capture", "qc"] as const;
type StepKey = (typeof STEP_KEYS)[number];

interface LineInput {
  qty: string;
  lotCode: string;
  qcStatus: "OK" | "NG" | "PENDING";
}

function emptyLineInput(): LineInput {
  return { qty: "", lotCode: "", qcStatus: "PENDING" };
}

export default function ReceivingWizardPage({
  params,
}: {
  params: { poId: string };
}) {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500">Đang tải PO…</div>
      }
    >
      <ReceivingWizardInner poId={params.poId} />
    </React.Suspense>
  );
}

function ReceivingWizardInner({ poId }: { poId: string }) {
  const router = useRouter();
  const { step, setStep } = useWizardStep({
    stepKeys: STEP_KEYS as unknown as string[],
    defaultKey: "check",
  });

  const { data: po, isLoading, isError, error } = usePOForReceiving(poId);
  const submit = useSubmitReceivingEvent();
  const approve = useApproveReceiving();

  const [inputs, setInputs] = React.useState<Record<string, LineInput>>({});
  const [notes, setNotes] = React.useState("");
  const [submitted, setSubmitted] = React.useState(false);

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

  const updateLine = (lineId: string, patch: Partial<LineInput>) => {
    setInputs((prev) => ({
      ...prev,
      [lineId]: { ...(prev[lineId] ?? emptyLineInput()), ...patch },
    }));
  };

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

  const stats = React.useMemo(() => {
    let ok = 0;
    let ng = 0;
    let pending = 0;
    let total = 0;
    for (const { input, qtyNum } of activeLines) {
      total += qtyNum;
      if (input.qcStatus === "OK") ok += 1;
      else if (input.qcStatus === "NG") ng += 1;
      else pending += 1;
    }
    return { ok, ng, pending, total, lines: activeLines.length };
  }, [activeLines]);

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center gap-2 text-sm text-zinc-500">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải PO…
      </div>
    );
  }

  if (isError || !po) {
    return (
      <div className="mx-auto mt-12 max-w-md rounded-md border border-amber-200 bg-amber-50 p-6 text-center">
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
          href="/warehouse?tab=receiving"
          className="mt-4 inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <ArrowLeft className="h-3 w-3" aria-hidden="true" />
          Về danh sách
        </Link>
      </div>
    );
  }

  const isComplete = po.status === "RECEIVED" || po.status === "CLOSED";
  const totals = po.totals;

  const steps: WizardStep[] = [
    {
      key: "check",
      title: "Kiểm tra PO",
      description: "Đối chiếu thông tin PO + danh sách dòng cần nhận.",
      validate: async () => {
        if (isComplete) {
          return {
            ok: false,
            error: `PO đã ${po.status}, không thể nhận thêm.`,
          };
        }
        return { ok: true };
      },
    },
    {
      key: "capture",
      title: "Nhập lô / serial",
      description:
        "Quét hoặc nhập số lượng thực nhận, mã lô và trạng thái QC từng dòng.",
      validate: async () => {
        if (activeLines.length === 0) {
          return {
            ok: false,
            error: "Cần nhập số lượng cho ít nhất 1 dòng.",
          };
        }
        for (const { ln, input } of activeLines) {
          if (ln.expectedLotSerial === "LOT" && !input.lotCode.trim()) {
            return {
              ok: false,
              error: `Dòng ${ln.lineNo} (${ln.sku}): cần nhập số lô.`,
            };
          }
        }
        return { ok: true };
      },
    },
    {
      key: "qc",
      title: "QC & duyệt",
      description:
        "Tổng kết và gửi nhận hàng. Nếu nhận đủ ≥ 95%, có thể duyệt PO ngay.",
    },
  ];

  const handleSubmit = async () => {
    if (!po) return;
    if (submitted) {
      // Đã submit — bấm Hoàn tất = redirect
      router.push("/warehouse?tab=receiving");
      return;
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
          source: "receiving-wizard",
          poId: po.poId,
          poLineId: ln.id,
          notes: notes || undefined,
        },
      }),
    );

    const res = await submit.mutateAsync(events);
    const ackedCount = res.data.acked.length;
    const rejectedCount = res.data.rejected.length;

    if (rejectedCount === 0) {
      toast.success(`Đã ghi nhận ${ackedCount} dòng.`);
      setSubmitted(true);
    } else {
      toast.warning(
        `Ghi nhận ${ackedCount} dòng, ${rejectedCount} lỗi: ${res.data.rejected
          .map((r) => r.reason)
          .join(", ")}`,
      );
    }
  };

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ poId: po.poId, note: notes.trim() || null });
      router.push("/warehouse?tab=receiving");
    } catch {
      // toast.error đã do hook show
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
          <Link href="/" className="hover:text-zinc-900 hover:underline">
            Tổng quan
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <Link
            href="/warehouse?tab=receiving"
            className="hover:text-zinc-900 hover:underline"
          >
            Quản lí kho
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-700">Nhận hàng</span>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="font-medium text-zinc-900">
            Wizard {po.poCode}
          </span>
        </nav>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
            <Truck className="h-5 w-5 text-zinc-500" aria-hidden="true" />
            Nhận hàng — {po.poCode}
          </h1>
          {po.status ? (
            <StatusBadge
              status={
                po.status === "PARTIAL"
                  ? "partial"
                  : po.status === "RECEIVED" || po.status === "CLOSED"
                    ? "ready"
                    : po.status === "CANCELLED"
                      ? "inactive"
                      : "pending"
              }
              size="sm"
              label={po.status}
            />
          ) : null}
        </div>
      </header>

      <Wizard
        steps={steps}
        current={step}
        onChangeStep={setStep}
        onSubmit={handleSubmit}
        submitLabel={submitted ? "Hoàn tất" : "Gửi nhận hàng"}
        allowJump
        className="flex-1 min-h-0"
      >
        {step === "check" ? (
          <StepCheck po={po} totals={totals} />
        ) : null}
        {step === "capture" ? (
          <StepCapture
            po={po}
            inputs={inputs}
            onUpdate={updateLine}
            onScan={handleBarcodeScan}
            disabled={isComplete || submitted}
          />
        ) : null}
        {step === "qc" ? (
          <StepQc
            po={po}
            stats={stats}
            notes={notes}
            setNotes={setNotes}
            submitted={submitted}
            approving={approve.isPending}
            canApprove={
              submitted &&
              !!totals &&
              totals.orderedTotal > 0 &&
              (totals.receivedTotal + stats.total) / totals.orderedTotal >=
                0.95
            }
            onApprove={handleApprove}
          />
        ) : null}
      </Wizard>
    </div>
  );
}

/* ============================================================ */
/* Step 1: Check PO                                             */
/* ============================================================ */

function StepCheck({
  po,
  totals,
}: {
  po: NonNullable<ReturnType<typeof usePOForReceiving>["data"]>;
  totals: NonNullable<
    ReturnType<typeof usePOForReceiving>["data"]
  >["totals"];
}) {
  const isComplete = po.status === "RECEIVED" || po.status === "CLOSED";

  return (
    <div className="space-y-4">
      <WizardSummary
        title="Thông tin PO"
        items={[
          { label: "Mã PO", value: po.poCode, emphasize: true },
          { label: "Nhà cung cấp", value: po.supplierName },
          { label: "Trạng thái", value: po.status ?? "—" },
          { label: "Dự kiến giao", value: po.expectedDate || "—" },
          {
            label: "Số dòng",
            value: `${totals?.linesTotal ?? po.lines.length} dòng`,
          },
          {
            label: "Đã nhận",
            value: totals
              ? `${totals.receivedTotal}/${totals.orderedTotal} (${totals.receivedPct}%)`
              : "—",
          },
        ]}
      />

      {totals ? (
        <section className="rounded-md border border-zinc-200 bg-white p-4">
          <div className="flex items-center justify-between text-xs text-zinc-600">
            <span>Tiến độ tổng PO</span>
            <strong className="tabular-nums text-zinc-900">
              {totals.receivedPct}%
            </strong>
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
          PO đã {po.status}. Không thể nhận thêm.
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        <header className="border-b border-zinc-200 bg-zinc-50 px-4 py-2">
          <h3 className="text-sm font-semibold text-zinc-900">
            Dòng cần nhận ({po.lines.length})
          </h3>
        </header>
        {po.lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            PO không có dòng nào.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 text-left">#</th>
                <th className="px-3 py-2 text-left">SKU</th>
                <th className="px-3 py-2 text-left">Tên</th>
                <th className="px-3 py-2 text-right">Đặt</th>
                <th className="px-3 py-2 text-right">Đã nhận</th>
                <th className="px-3 py-2 text-right">Còn lại</th>
                <th className="px-3 py-2 text-left">Lô/Serial</th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((ln) => (
                <tr
                  key={ln.id}
                  className={cn(
                    "border-t border-zinc-100",
                    ln.remainingQty <= 0 && "bg-emerald-50/40",
                  )}
                >
                  <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                    {ln.lineNo}
                  </td>
                  <td className="px-3 py-2 font-mono text-xs font-semibold">
                    {ln.sku}
                  </td>
                  <td className="px-3 py-2 text-zinc-700">{ln.itemName}</td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {ln.orderedQty} {ln.uom}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-zinc-600">
                    {ln.receivedQty}
                  </td>
                  <td
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      ln.remainingQty <= 0
                        ? "text-emerald-700"
                        : "text-zinc-900",
                    )}
                  >
                    {ln.remainingQty}
                  </td>
                  <td className="px-3 py-2 text-xs text-zinc-600">
                    {ln.expectedLotSerial}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Bấm <strong>Tiếp</strong> để bắt đầu nhập lô/serial cho từng dòng.
      </p>
    </div>
  );
}

/* ============================================================ */
/* Step 2: Capture lot/serial per line                          */
/* ============================================================ */

function StepCapture({
  po,
  inputs,
  onUpdate,
  onScan,
  disabled,
}: {
  po: NonNullable<ReturnType<typeof usePOForReceiving>["data"]>;
  inputs: Record<string, LineInput>;
  onUpdate: (lineId: string, patch: Partial<LineInput>) => void;
  onScan: (code: string) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-4">
      <BarcodeScanInput
        onScan={onScan}
        hint="Scanner USB tự gửi Enter sau khi quét — focus tự về ô này. Mỗi lần quét +1 vào dòng tương ứng."
        className="max-w-md"
        disabled={disabled}
      />

      <section
        aria-label="Danh sách dòng PO"
        className="overflow-hidden rounded-md border border-zinc-200 bg-white"
      >
        <div className="grid grid-cols-[auto,1fr,auto,auto,auto,auto] gap-3 border-b border-zinc-200 bg-zinc-50 px-4 py-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <div>#</div>
          <div>Mặt hàng</div>
          <div className="text-right">Đã/Đặt</div>
          <div className="text-right">Còn</div>
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
              disabled={disabled}
              onChange={(patch) => onUpdate(ln.id!, patch)}
            />
          ))
        )}
      </section>

      <p className="flex items-center gap-1.5 text-xs text-zinc-500">
        <ScanLine className="h-3.5 w-3.5" aria-hidden="true" />
        Mẹo: Có thể bỏ qua dòng không nhận trong lô này (qty = 0).
      </p>
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

/* ============================================================ */
/* Step 3: QC Summary + Approve                                 */
/* ============================================================ */

function StepQc({
  po,
  stats,
  notes,
  setNotes,
  submitted,
  approving,
  canApprove,
  onApprove,
}: {
  po: NonNullable<ReturnType<typeof usePOForReceiving>["data"]>;
  stats: { ok: number; ng: number; pending: number; total: number; lines: number };
  notes: string;
  setNotes: (v: string) => void;
  submitted: boolean;
  approving: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  return (
    <div className="space-y-4">
      <WizardSummary
        title="Tổng kết nhận hàng"
        items={[
          { label: "PO", value: po.poCode, emphasize: true },
          { label: "Số dòng sẽ ghi nhận", value: stats.lines },
          {
            label: "Tổng số lượng",
            value: stats.total.toLocaleString("vi-VN"),
            emphasize: true,
          },
          { label: "QC OK (dòng)", value: stats.ok },
          { label: "QC NG (dòng)", value: stats.ng },
          { label: "QC Chờ (dòng)", value: stats.pending },
        ]}
      />

      {stats.ng > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Có <strong>{stats.ng}</strong> dòng QC NG. Bạn có thể vẫn ghi nhận để
          theo dõi NG, hoặc quay lại step trước để chỉnh.
        </div>
      ) : null}

      <section className="space-y-2 rounded-md border border-zinc-200 bg-white p-4">
        <Label htmlFor="receiving-wizard-notes" uppercase>
          Ghi chú lô nhận (tuỳ chọn)
        </Label>
        <Textarea
          id="receiving-wizard-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
          placeholder="VD: Thùng 3 móp, thiếu 2 cái, đợi NCC bù…"
          disabled={submitted}
        />
      </section>

      {submitted ? (
        <section className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50 p-4">
          <div className="flex items-start gap-2 text-emerald-800">
            <CheckCircle2 className="mt-0.5 h-5 w-5" aria-hidden="true" />
            <div>
              <h3 className="text-sm font-semibold">
                Đã gửi nhận hàng thành công
              </h3>
              <p className="mt-0.5 text-xs">
                {stats.lines} dòng đã được ghi nhận. PO sẽ tự động chuyển
                trạng thái PARTIAL/RECEIVED tuỳ tổng nhận.
              </p>
            </div>
          </div>

          {canApprove ? (
            <div className="flex flex-col gap-2 rounded-md border border-emerald-300 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-zinc-900">
                  Duyệt PO ngay?
                </p>
                <p className="text-xs text-zinc-500">
                  Nhận đủ ≥ 95% — có thể chuyển PO sang trạng thái RECEIVED
                  luôn.
                </p>
              </div>
              <Button
                type="button"
                onClick={onApprove}
                disabled={approving}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                {approving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Package className="h-4 w-4" aria-hidden="true" />
                )}
                Duyệt PO (RECEIVED)
              </Button>
            </div>
          ) : (
            <p className="text-xs text-emerald-800">
              Chưa đủ 95% — PO ở trạng thái PARTIAL. Bấm <strong>Hoàn tất</strong>
              {" "}để về danh sách hoặc nhận tiếp lô sau.
            </p>
          )}
        </section>
      ) : (
        <p className="text-xs text-zinc-500">
          Bấm <strong>Gửi nhận hàng</strong> để ghi nhận lô vào hệ thống.
        </p>
      )}
    </div>
  );
}
