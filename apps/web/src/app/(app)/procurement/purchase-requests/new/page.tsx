"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import type { PRCreateInput } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PRLineEditor, type PRLineDraft } from "@/components/procurement/PRLineEditor";
import {
  Wizard,
  WizardSummary,
  useWizardStep,
  type WizardStep,
} from "@/components/wizard";
import {
  useCreatePurchaseRequest,
  useCreatePRFromShortage,
} from "@/hooks/usePurchaseRequests";

/**
 * /procurement/purchase-requests/new — Wizard 3 step (TASK-20260427-020).
 *
 * Layout cũ single-page <PRForm/> được tách thành 3 step:
 *   1. info    — Thông tin chung (title, source, deadline mặc định, notes)
 *   2. lines   — Dòng vật tư (re-use PRLineEditor)
 *   3. review  — Review & gửi (WizardSummary)
 *
 * Mode `?fromShortage=ids` GIỮ NGUYÊN auto-create flow (không vào wizard) —
 * vì đã preset toàn bộ data từ shortage, chỉ cần confirm 1 nút.
 */

export const dynamic = "force-dynamic";

const STEP_KEYS = ["info", "lines", "review"] as const;
type StepKey = (typeof STEP_KEYS)[number];

export default function NewPurchaseRequestPage() {
  return (
    <React.Suspense
      fallback={
        <div className="p-6 text-sm text-zinc-500">Đang tải…</div>
      }
    >
      <NewPRInner />
    </React.Suspense>
  );
}

function NewPRInner() {
  const router = useRouter();
  const sp = useSearchParams();
  const fromShortage = sp.get("fromShortage");
  const itemIds = React.useMemo(
    () => (fromShortage ? fromShortage.split(",").filter(Boolean) : []),
    [fromShortage],
  );

  // Shortage flow giữ nguyên (không qua wizard)
  if (itemIds.length > 0) {
    return <ShortageAutoCreate itemIds={itemIds} />;
  }

  return <ManualWizard router={router} />;
}

/* ============================================================ */
/* Manual Wizard — 3 step                                       */
/* ============================================================ */

function ManualWizard({ router }: { router: ReturnType<typeof useRouter> }) {
  const { step, setStep } = useWizardStep({
    stepKeys: STEP_KEYS as unknown as string[],
    defaultKey: "info",
  });

  // Form state nâng lên đây — share giữa các step
  const [title, setTitle] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [defaultNeededBy, setDefaultNeededBy] = React.useState<string>("");
  const [linkedOrderId, setLinkedOrderId] = React.useState<string>("");
  const [lines, setLines] = React.useState<PRLineDraft[]>([
    { localId: crypto.randomUUID(), item: null, qty: "1" },
  ]);

  const createMutation = useCreatePurchaseRequest();

  const validLines = React.useMemo(
    () => lines.filter((l) => l.item),
    [lines],
  );
  const totalQty = React.useMemo(
    () =>
      validLines.reduce((sum, l) => {
        const q = Number(l.qty);
        return sum + (Number.isFinite(q) ? q : 0);
      }, 0),
    [validLines],
  );

  const steps: WizardStep[] = [
    {
      key: "info",
      title: "Thông tin chung",
      description:
        "Tiêu đề, mốc thời gian cần & ghi chú cho cả PR. Có thể bỏ trống tiêu đề — hệ thống sẽ tự sinh.",
      validate: async () => {
        // Tiêu đề optional, nhưng nếu nhập deadline phải hợp lệ
        if (defaultNeededBy) {
          const d = new Date(defaultNeededBy);
          if (Number.isNaN(d.getTime())) {
            return { ok: false, error: "Ngày cần hàng không hợp lệ." };
          }
        }
        return { ok: true };
      },
    },
    {
      key: "lines",
      title: "Dòng vật tư",
      description:
        "Thêm các vật tư cần mua. Mỗi dòng cần có vật tư + số lượng > 0.",
      validate: async () => {
        if (validLines.length === 0) {
          return { ok: false, error: "Cần ít nhất 1 dòng có vật tư." };
        }
        for (const l of validLines) {
          const q = Number(l.qty);
          if (!Number.isFinite(q) || q <= 0) {
            return {
              ok: false,
              error: `Dòng ${l.item?.sku ?? ""}: số lượng không hợp lệ.`,
            };
          }
        }
        return { ok: true };
      },
    },
    {
      key: "review",
      title: "Xem lại & gửi",
      description:
        "Kiểm tra lại thông tin trước khi tạo PR. Sau khi tạo, PR sẽ ở trạng thái DRAFT.",
    },
  ];

  const handleSubmit = async () => {
    const payload: PRCreateInput = {
      title: title.trim() || null,
      source: "MANUAL",
      linkedOrderId: linkedOrderId.trim() || null,
      notes: notes.trim() || null,
      lines: validLines.map((l) => ({
        itemId: l.item!.id,
        qty: Number(l.qty),
        preferredSupplierId: l.preferredSupplierId ?? null,
        snapshotLineId: null,
        neededBy: l.neededBy
          ? new Date(l.neededBy)
          : defaultNeededBy
            ? new Date(defaultNeededBy)
            : null,
        notes: l.notes?.trim() || null,
      })),
    };
    const res = await createMutation.mutateAsync(payload);
    toast.success(`Đã tạo PR ${res.data.code}`);
    router.push(`/procurement/purchase-requests/${res.data.id}`);
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
            href="/procurement/purchase-requests"
            className="hover:text-zinc-900 hover:underline"
          >
            Yêu cầu mua hàng
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-900">Tạo mới</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
          Tạo Yêu cầu mua hàng
        </h1>
      </header>

      <Wizard
        steps={steps}
        current={step}
        onChangeStep={setStep}
        onSubmit={handleSubmit}
        submitLabel="Tạo PR"
        allowJump
        className="flex-1 min-h-0"
      >
        {step === "info" ? (
          <StepInfo
            title={title}
            setTitle={setTitle}
            notes={notes}
            setNotes={setNotes}
            defaultNeededBy={defaultNeededBy}
            setDefaultNeededBy={setDefaultNeededBy}
            linkedOrderId={linkedOrderId}
            setLinkedOrderId={setLinkedOrderId}
          />
        ) : null}
        {step === "lines" ? (
          <StepLines
            lines={lines}
            setLines={setLines}
            disabled={createMutation.isPending}
          />
        ) : null}
        {step === "review" ? (
          <StepReview
            title={title}
            notes={notes}
            defaultNeededBy={defaultNeededBy}
            linkedOrderId={linkedOrderId}
            lines={validLines}
            totalQty={totalQty}
            onJumpTo={(key) => setStep(key as StepKey)}
          />
        ) : null}
      </Wizard>
    </div>
  );
}

/* ============================================================ */
/* Step 1: Info                                                 */
/* ============================================================ */

function StepInfo({
  title,
  setTitle,
  notes,
  setNotes,
  defaultNeededBy,
  setDefaultNeededBy,
  linkedOrderId,
  setLinkedOrderId,
}: {
  title: string;
  setTitle: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  defaultNeededBy: string;
  setDefaultNeededBy: (v: string) => void;
  linkedOrderId: string;
  setLinkedOrderId: (v: string) => void;
}) {
  return (
    <section className="space-y-4 rounded-md border border-zinc-200 bg-white p-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pr-title" uppercase>
            Tiêu đề
          </Label>
          <Input
            id="pr-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: PR nguyên vật liệu Q2-2026"
            maxLength={255}
          />
          <p className="text-xs text-zinc-500">
            Tuỳ chọn — bỏ trống để hệ thống tự sinh từ ID.
          </p>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="pr-needed-by" uppercase>
            Cần hàng vào ngày (mặc định)
          </Label>
          <Input
            id="pr-needed-by"
            type="date"
            value={defaultNeededBy}
            onChange={(e) => setDefaultNeededBy(e.target.value)}
          />
          <p className="text-xs text-zinc-500">
            Áp dụng cho mọi dòng chưa set ngày riêng. Có thể override ở step kế.
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="pr-linked-order" uppercase>
            Đơn hàng liên quan (UUID)
          </Label>
          <Input
            id="pr-linked-order"
            value={linkedOrderId}
            onChange={(e) => setLinkedOrderId(e.target.value)}
            placeholder="Bỏ trống nếu PR độc lập"
          />
          <p className="text-xs text-zinc-500">
            Tuỳ chọn — gán PR vào sales order/BOM cụ thể (V1.8+).
          </p>
        </div>

        <div className="space-y-1.5 md:col-span-2">
          <Label htmlFor="pr-notes" uppercase>
            Ghi chú
          </Label>
          <Textarea
            id="pr-notes"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            maxLength={2000}
            placeholder="Lý do tạo PR, deadline ưu tiên, đặc thù vật tư…"
          />
        </div>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Step 2: Lines                                                */
/* ============================================================ */

function StepLines({
  lines,
  setLines,
  disabled,
}: {
  lines: PRLineDraft[];
  setLines: (next: PRLineDraft[]) => void;
  disabled: boolean;
}) {
  return (
    <section className="space-y-4 rounded-md border border-zinc-200 bg-white p-6">
      <PRLineEditor lines={lines} onChange={setLines} disabled={disabled} />
    </section>
  );
}

/* ============================================================ */
/* Step 3: Review                                               */
/* ============================================================ */

function StepReview({
  title,
  notes,
  defaultNeededBy,
  linkedOrderId,
  lines,
  totalQty,
  onJumpTo,
}: {
  title: string;
  notes: string;
  defaultNeededBy: string;
  linkedOrderId: string;
  lines: PRLineDraft[];
  totalQty: number;
  onJumpTo: (key: string) => void;
}) {
  return (
    <div className="space-y-4">
      <WizardSummary
        title="Thông tin chung"
        items={[
          { label: "Tiêu đề", value: title.trim() || "— (auto từ ID)" },
          {
            label: "Ngày cần (mặc định)",
            value: defaultNeededBy || "— (không set)",
          },
          {
            label: "Đơn hàng liên quan",
            value: linkedOrderId.trim() || "— (PR độc lập)",
          },
          { label: "Ghi chú", value: notes.trim() || "—" },
        ]}
      />

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">
            Dòng vật tư ({lines.length})
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo("lines")}
          >
            Sửa
          </Button>
        </div>
        {lines.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Chưa có dòng vật tư nào — quay lại step "Dòng vật tư".
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50">
                <tr className="text-xs uppercase tracking-wide text-zinc-500">
                  <th className="px-3 py-2 text-left">#</th>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-right">Số lượng</th>
                  <th className="px-3 py-2 text-left">Cần ngày</th>
                  <th className="px-3 py-2 text-left">Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l, idx) => (
                  <tr
                    key={l.localId}
                    className="border-t border-zinc-100 text-zinc-800"
                  >
                    <td className="px-3 py-2 font-mono text-xs text-zinc-500">
                      {idx + 1}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs">
                      {l.item?.sku ?? "—"}
                    </td>
                    <td className="px-3 py-2">{l.item?.name ?? "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {l.qty}
                    </td>
                    <td className="px-3 py-2 text-zinc-600">
                      {l.neededBy ?? defaultNeededBy ?? "—"}
                    </td>
                    <td className="px-3 py-2 text-xs text-zinc-600">
                      {l.notes?.trim() || "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td colSpan={3} className="px-3 py-2 text-right text-xs">
                    Tổng số lượng (cộng dồn):
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-indigo-700">
                    {totalQty.toLocaleString("vi-VN")}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <p className="text-xs text-zinc-500">
        Sau khi tạo, PR sẽ ở trạng thái <strong>DRAFT</strong>. Bạn cần submit
        & duyệt ở trang chi tiết để chuyển sang PO.
      </p>
    </div>
  );
}

/* ============================================================ */
/* Shortage auto-create (giữ nguyên flow cũ)                    */
/* ============================================================ */

function ShortageAutoCreate({ itemIds }: { itemIds: string[] }) {
  const router = useRouter();
  const createFromShortage = useCreatePRFromShortage();
  const [submitting, setSubmitting] = React.useState(false);

  const handleShortageCreate = async () => {
    if (itemIds.length === 0) return;
    setSubmitting(true);
    try {
      const res = await createFromShortage.mutateAsync({
        itemIds,
        title: `PR từ Shortage ${new Date().toLocaleDateString("vi-VN")}`,
        notes: null,
      });
      toast.success(`Đã tạo PR ${res.data.code}`);
      router.push(`/procurement/purchase-requests/${res.data.id}`);
    } catch (err) {
      toast.error(`Tạo PR thất bại: ${(err as Error).message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link
              href="/procurement/purchase-requests"
              className="hover:text-zinc-900 hover:underline"
            >
              Yêu cầu mua hàng
            </Link>
            {" / "}
            <span className="text-zinc-900">Tạo từ Shortage</span>
          </nav>
          <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
            Tạo PR từ Shortage ({itemIds.length} item)
          </h1>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl p-6">
        <div className="space-y-4 rounded-md border border-orange-200 bg-orange-50 p-5">
          <div>
            <h2 className="text-base font-semibold text-zinc-900">
              Tạo PR tự động từ Shortage Board
            </h2>
            <p className="mt-1 text-sm text-zinc-700">
              Hệ thống sẽ aggregate shortage cho {itemIds.length} item đã chọn,
              qty = total_short × 1.1 (buffer 10%), status DRAFT để review.
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => void handleShortageCreate()}
              disabled={submitting}
            >
              {submitting ? "Đang tạo…" : "Tạo PR tự động"}
            </Button>
            <Button variant="ghost" asChild>
              <Link href="/bom">Huỷ, quay lại BOM workspace</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
