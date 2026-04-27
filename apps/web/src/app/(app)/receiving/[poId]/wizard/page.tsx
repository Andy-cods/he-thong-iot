"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCheck,
  CheckCircle2,
  Loader2,
  Package,
  RotateCcw,
  Truck,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
 * V3 (TASK-20260427-030) — Wizard nhận hàng desktop cho từng PO.
 *
 * 3 step (đã đơn giản hoá — bỏ barcode scan):
 *   1. check    — Hiển thị PO info + line cần nhận (qty còn lại). Confirm bắt đầu.
 *   2. capture  — Form bảng manual: qty thực nhận + lot code + QC status từng dòng.
 *                 Có nút "Nhận đủ tất cả" / "Reset tất cả" + reset từng dòng.
 *   3. qc       — Tổng kết chip stats (#OK / #NG / #Chờ) → "Gửi nhận hàng" (POST events)
 *                 → sau đó hỏi "Duyệt PO ngay?" nếu received >= 95%.
 *
 * Form receiving cũ `/receiving/[poId]/page.tsx` GIỮ NGUYÊN cho PWA mobile scan.
 * Tab Receiving warehouse có 2 button: "Mở wizard desktop" (form này) +
 * "Mở form nhận (single page)" (form cũ).
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

  const fillAll = React.useCallback(() => {
    if (!po) return;
    setInputs((prev) => {
      const next = { ...prev };
      let filled = 0;
      for (const ln of po.lines) {
        if (ln.remainingQty <= 0) continue;
        next[ln.id!] = {
          qty: String(ln.remainingQty),
          lotCode: prev[ln.id!]?.lotCode ?? "",
          qcStatus: "OK",
        };
        filled += 1;
      }
      if (filled > 0) {
        toast.success(`Đã điền ${filled} dòng = số còn lại + QC OK.`, {
          duration: 1500,
        });
      } else {
        toast.info("Tất cả dòng đã nhận đủ — không có gì để điền.");
      }
      return next;
    });
  }, [po]);

  const resetAll = React.useCallback(() => {
    if (!po) return;
    setInputs(() => {
      const next: Record<string, LineInput> = {};
      for (const ln of po.lines) {
        next[ln.id!] = emptyLineInput();
      }
      return next;
    });
    toast.message("Đã reset tất cả dòng về mặc định.");
  }, [po]);

  const resetLine = React.useCallback((lineId: string) => {
    setInputs((prev) => ({ ...prev, [lineId]: emptyLineInput() }));
  }, []);

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
      title: "Nhập số lượng nhận",
      description:
        "Nhập số lượng thực nhận, mã lô (nếu có) và trạng thái QC cho từng dòng.",
      validate: async () => {
        if (activeLines.length === 0) {
          return {
            ok: false,
            error: "Vui lòng nhập số lượng nhận cho ít nhất 1 dòng.",
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
      toast.success(`Đã gửi ${ackedCount} events nhận hàng.`);
      setSubmitted(true);
    } else {
      toast.warning(
        `Gửi ${ackedCount} events, ${rejectedCount} lỗi: ${res.data.rejected
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
            onResetLine={resetLine}
            onFillAll={fillAll}
            onResetAll={resetAll}
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
            onBack={() => setStep("capture")}
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
  onResetLine,
  onFillAll,
  onResetAll,
  disabled,
}: {
  po: NonNullable<ReturnType<typeof usePOForReceiving>["data"]>;
  inputs: Record<string, LineInput>;
  onUpdate: (lineId: string, patch: Partial<LineInput>) => void;
  onResetLine: (lineId: string) => void;
  onFillAll: () => void;
  onResetAll: () => void;
  disabled: boolean;
}) {
  const hasOpenLines = po.lines.some((ln) => ln.remainingQty > 0);

  return (
    <div className="space-y-4">
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-zinc-200 bg-white px-4 py-3">
        <div className="text-xs text-zinc-600">
          <p className="font-medium text-zinc-900">
            Nhập số lượng nhận thực tế cho từng dòng PO.
          </p>
          <p className="mt-0.5">
            Để trống hoặc <code className="font-mono">0</code> nếu lô này chưa
            nhận dòng đó. QC mặc định <strong>Chờ</strong>.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onFillAll}
            disabled={disabled || !hasOpenLines}
            className="gap-1.5"
          >
            <CheckCheck className="h-3.5 w-3.5" aria-hidden="true" />
            Nhận đủ tất cả
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onResetAll}
            disabled={disabled}
            className="gap-1.5"
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Reset tất cả
          </Button>
        </div>
      </section>

      <section
        aria-label="Bảng nhập số lượng nhận"
        className="overflow-x-auto rounded-md border border-zinc-200 bg-white"
      >
        {po.lines.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-500">
            PO không có dòng nào.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="w-10 px-3 py-2 text-left">
                  #
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  SKU
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Tên
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Đặt
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Đã
                </th>
                <th scope="col" className="px-3 py-2 text-right">
                  Còn
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Nhận thực tế
                </th>
                <th scope="col" className="px-3 py-2 text-left">
                  Lô / Serial
                </th>
                <th scope="col" className="px-3 py-2 text-center">
                  QC
                </th>
                <th
                  scope="col"
                  className="w-12 px-3 py-2 text-center"
                  aria-label="Reset dòng"
                >
                  &nbsp;
                </th>
              </tr>
            </thead>
            <tbody>
              {po.lines.map((ln) => (
                <LineRow
                  key={ln.id}
                  ln={ln}
                  input={inputs[ln.id!] ?? emptyLineInput()}
                  disabled={disabled}
                  onChange={(patch) => onUpdate(ln.id!, patch)}
                  onReset={() => onResetLine(ln.id!)}
                />
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Mẹo: Có thể bỏ qua dòng không nhận trong lô này (qty = 0). Khi sẵn
        sàng, bấm <strong>Tiếp</strong> để xem tổng kết.
      </p>
    </div>
  );
}

function LineRow({
  ln,
  input,
  disabled,
  onChange,
  onReset,
}: {
  ln: POReceivingLine;
  input: LineInput;
  disabled: boolean;
  onChange: (patch: Partial<LineInput>) => void;
  onReset: () => void;
}) {
  const isDone = ln.remainingQty <= 0;
  const qtyNum = Number(input.qty);
  const overRemaining =
    Number.isFinite(qtyNum) && qtyNum > 0 && qtyNum > ln.remainingQty;
  const hasInput =
    !!input.qty || !!input.lotCode.trim() || input.qcStatus !== "PENDING";

  return (
    <tr
      className={cn(
        "border-t border-zinc-100 align-middle",
        isDone && "bg-emerald-50/40",
      )}
    >
      <td className="px-3 py-2 font-mono text-xs text-zinc-500">{ln.lineNo}</td>
      <td className="px-3 py-2">
        <div className="flex items-center gap-1.5">
          <code className="font-mono text-xs font-semibold text-zinc-900">
            {ln.sku}
          </code>
          {ln.expectedLotSerial === "LOT" ? (
            <span className="inline-flex items-center rounded-sm bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
              Lô
            </span>
          ) : null}
          {ln.expectedLotSerial === "SERIAL" ? (
            <span className="inline-flex items-center rounded-sm bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-700">
              Serial
            </span>
          ) : null}
          {isDone ? <StatusBadge status="ready" size="sm" /> : null}
        </div>
      </td>
      <td className="max-w-[16rem] px-3 py-2 text-xs text-zinc-700">
        <span className="block truncate" title={ln.itemName}>
          {ln.itemName}
        </span>
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-700">
        {ln.orderedQty}
      </td>
      <td className="px-3 py-2 text-right text-xs tabular-nums text-zinc-500">
        {ln.receivedQty}
      </td>
      <td
        className={cn(
          "px-3 py-2 text-right text-xs tabular-nums",
          isDone ? "text-emerald-700" : "font-medium text-zinc-900",
        )}
      >
        {ln.remainingQty} {ln.uom}
      </td>
      <td className="px-3 py-2">
        <Input
          type="number"
          inputMode="decimal"
          min={0}
          max={ln.remainingQty}
          step={0.0001}
          value={input.qty}
          onChange={(e) => onChange({ qty: e.target.value })}
          placeholder="0"
          disabled={disabled || isDone}
          className={cn(
            "h-9 w-24 text-right tabular-nums",
            overRemaining && "border-amber-400 focus-visible:ring-amber-400",
          )}
          aria-invalid={overRemaining || undefined}
          aria-label={`Số lượng nhận ${ln.sku}`}
        />
      </td>
      <td className="px-3 py-2">
        <Input
          value={input.lotCode}
          onChange={(e) => onChange({ lotCode: e.target.value })}
          placeholder="Lot code (tuỳ chọn)"
          disabled={disabled || isDone}
          className="h-9 w-40"
          aria-label={`Số lô ${ln.sku}`}
        />
      </td>
      <td className="px-3 py-2">
        <div
          className="flex items-center justify-center gap-1"
          role="radiogroup"
          aria-label={`Trạng thái QC ${ln.sku}`}
        >
          {(["OK", "NG", "PENDING"] as const).map((qc) => (
            <button
              key={qc}
              type="button"
              disabled={disabled || isDone}
              onClick={() => onChange({ qcStatus: qc })}
              className={cn(
                "inline-flex h-7 min-w-[2.5rem] items-center justify-center rounded-md border px-2 text-xs font-medium transition-colors",
                input.qcStatus === qc
                  ? qc === "OK"
                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                    : qc === "NG"
                      ? "border-red-500 bg-red-50 text-red-700"
                      : "border-zinc-400 bg-zinc-100 text-zinc-800"
                  : "border-zinc-300 bg-white text-zinc-600 hover:bg-zinc-50",
                (disabled || isDone) && "opacity-50",
              )}
              role="radio"
              aria-checked={input.qcStatus === qc}
            >
              {qc === "PENDING" ? "Chờ" : qc}
            </button>
          ))}
        </div>
      </td>
      <td className="px-3 py-2 text-center">
        <button
          type="button"
          onClick={onReset}
          disabled={disabled || isDone || !hasInput}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md border border-zinc-300 bg-white text-zinc-500 transition-colors hover:bg-zinc-50 hover:text-zinc-900",
            (disabled || isDone || !hasInput) &&
              "cursor-not-allowed opacity-40 hover:bg-white hover:text-zinc-500",
          )}
          aria-label={`Reset dòng ${ln.sku}`}
          title="Reset dòng này"
        >
          <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </td>
    </tr>
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
  onBack,
}: {
  po: NonNullable<ReturnType<typeof usePOForReceiving>["data"]>;
  stats: { ok: number; ng: number; pending: number; total: number; lines: number };
  notes: string;
  setNotes: (v: string) => void;
  submitted: boolean;
  approving: boolean;
  canApprove: boolean;
  onApprove: () => void;
  onBack: () => void;
}) {
  return (
    <div className="space-y-4">
      <WizardSummary
        title="Tổng kết nhận hàng"
        items={[
          { label: "PO", value: po.poCode, emphasize: true },
          { label: "Số dòng nhập", value: stats.lines, emphasize: true },
          {
            label: "Tổng qty thực nhận",
            value: stats.total.toLocaleString("vi-VN"),
            emphasize: true,
          },
        ]}
      />

      <section
        aria-label="Phân loại QC"
        className="rounded-md border border-zinc-200 bg-white p-4"
      >
        <h3 className="text-xs font-medium uppercase tracking-wider text-zinc-500">
          Phân loại QC
        </h3>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            OK: <strong className="tabular-nums">{stats.ok}</strong> dòng
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-medium text-red-700">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
            NG: <strong className="tabular-nums">{stats.ng}</strong> dòng
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
            <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
            Chờ: <strong className="tabular-nums">{stats.pending}</strong> dòng
          </span>
        </div>
      </section>

      {stats.ng > 0 ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          <AlertTriangle className="mr-1 inline h-4 w-4" aria-hidden="true" />
          Có <strong>{stats.ng}</strong> dòng QC NG. Bạn có thể vẫn ghi nhận để
          theo dõi NG, hoặc quay lại bước trước để chỉnh.
        </div>
      ) : null}

      {!submitted ? (
        <div className="flex items-center justify-start">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onBack}
            className="gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Quay lại sửa
          </Button>
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
