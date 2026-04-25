"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronLeft, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import type { POCreateInput } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSession } from "@/hooks/useSession";
import {
  useCreatePurchaseOrder,
  type POLineRow,
} from "@/hooks/usePurchaseOrders";
import {
  usePurchaseRequestsList,
  usePurchaseRequestDetail,
} from "@/hooks/usePurchaseRequests";
import { cn } from "@/lib/utils";
import {
  SupplierPicker,
  type SupplierPickerValue,
} from "./SupplierPicker";
import {
  PoLineEditor,
  emptyLine,
  type PoLineDraft,
} from "./PoLineEditor";

type Step = 1 | 2 | 3;

interface WizardState {
  source: "MANUAL" | "FROM_PR";
  prId: string | null;
  supplier: SupplierPickerValue | null;
  lines: PoLineDraft[];
  expectedEta: string;
  paymentTerms: string;
  deliveryAddress: string;
  notes: string;
}

const DEFAULT_DELIVERY = "Xưởng Song Châu";

function StepIndicator({
  step,
  current,
  label,
}: {
  step: number;
  current: Step;
  label: string;
}) {
  const done = current > step;
  const active = current === step;
  return (
    <div className="flex items-center gap-2">
      <div
        className={cn(
          "flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold",
          done && "bg-indigo-600 text-white",
          active && "bg-indigo-100 text-indigo-700 ring-2 ring-indigo-600",
          !done && !active && "bg-zinc-100 text-zinc-500",
        )}
      >
        {done ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : step}
      </div>
      <span
        className={cn(
          "text-sm",
          active && "font-medium text-zinc-900",
          !active && "text-zinc-500",
        )}
      >
        {label}
      </span>
    </div>
  );
}

export function PoCreateWizard() {
  const router = useRouter();
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");

  const [step, setStep] = React.useState<Step>(1);
  const [state, setState] = React.useState<WizardState>({
    source: "MANUAL",
    prId: null,
    supplier: null,
    lines: [emptyLine()],
    expectedEta: "",
    paymentTerms: "",
    deliveryAddress: DEFAULT_DELIVERY,
    notes: "",
  });

  const approvedPRs = usePurchaseRequestsList({ status: ["APPROVED"], pageSize: 50 });
  const prDetail = usePurchaseRequestDetail(
    state.source === "FROM_PR" ? state.prId : null,
  );

  const create = useCreatePurchaseOrder();

  // Auto-fill lines khi chọn PR.
  React.useEffect(() => {
    if (state.source === "FROM_PR" && prDetail.data?.data.lines) {
      const prLines = prDetail.data.data.lines;
      const next: PoLineDraft[] = prLines.map((l) => ({
        localId: crypto.randomUUID(),
        item: {
          id: l.itemId,
          sku: l.sku,
          name: l.name,
          uom: undefined,
        },
        qty: String(l.qty),
        unitPrice: "0",
        taxRate: "8",
        neededBy: l.neededBy ?? null,
        notes: l.notes ?? null,
      }));
      setState((s) => ({ ...s, lines: next }));
    }
  }, [prDetail.data, state.source]);

  const canNext1 = state.source === "MANUAL" || !!state.prId;
  const canNext2 = !!state.supplier && state.lines.some((l) => l.item);

  const onSupplierChange = (v: SupplierPickerValue | null) => {
    setState((s) => ({
      ...s,
      supplier: v,
      paymentTerms: v?.paymentTerms ?? s.paymentTerms,
    }));
  };

  const doSubmit = async (mode: "draft" | "submit" | "approve") => {
    if (!state.supplier) {
      toast.error("Chưa chọn nhà cung cấp.");
      return;
    }
    const valid = state.lines.filter((l) => l.item);
    if (valid.length === 0) {
      toast.error("PO phải có ít nhất 1 dòng.");
      return;
    }

    const payload: POCreateInput = {
      supplierId: state.supplier.id,
      prId: state.prId,
      linkedOrderId: null,
      expectedEta: state.expectedEta ? new Date(state.expectedEta) : null,
      currency: "VND",
      paymentTerms: state.paymentTerms.trim() || null,
      deliveryAddress: state.deliveryAddress.trim() || null,
      notes: state.notes.trim() || null,
      autoApprove: mode === "approve" && isAdmin,
      lines: valid.map((l) => ({
        itemId: l.item!.id,
        orderedQty: Number(l.qty) || 0,
        unitPrice: Number(l.unitPrice) || 0,
        taxRate: Number(l.taxRate) || 0,
        snapshotLineId: null,
        expectedEta: l.neededBy ? new Date(l.neededBy) : null,
        notes: l.notes ?? null,
      })),
    };

    try {
      const res = await create.mutateAsync(payload);
      const msgMap: Record<typeof mode, string> = {
        draft: `Đã lưu nháp PO ${res.data.poNo}.`,
        submit: `Đã gửi duyệt PO ${res.data.poNo}.`,
        approve: `Đã tạo + duyệt PO ${res.data.poNo}.`,
      };
      // Sau khi tạo, nếu submit-approval thì gọi thêm API.
      if (mode === "submit") {
        await fetch(
          `/api/purchase-orders/${res.data.id}/submit-approval`,
          { method: "POST", credentials: "include" },
        );
      }
      toast.success(msgMap[mode]);
      router.push(`/procurement/purchase-orders/${res.data.id}`);
    } catch (err) {
      toast.error(`Tạo PO thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <div className="space-y-6">
      {/* Step indicator */}
      <nav
        aria-label="Các bước"
        className="flex items-center gap-4 border-b border-zinc-200 pb-4"
      >
        <StepIndicator step={1} current={step} label="Nguồn" />
        <ChevronRight className="h-4 w-4 text-zinc-300" aria-hidden="true" />
        <StepIndicator step={2} current={step} label="NCC + dòng hàng" />
        <ChevronRight className="h-4 w-4 text-zinc-300" aria-hidden="true" />
        <StepIndicator step={3} current={step} label="Điều khoản & Duyệt" />
      </nav>

      {/* Step 1 */}
      {step === 1 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Chọn nguồn PO
            </h2>
            <p className="text-sm text-zinc-500">
              Tạo thủ công hoặc từ một PR đã duyệt.
            </p>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                state.source === "MANUAL"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-zinc-200 bg-white hover:bg-zinc-50",
              )}
            >
              <input
                type="radio"
                name="source"
                checked={state.source === "MANUAL"}
                onChange={() =>
                  setState((s) => ({ ...s, source: "MANUAL", prId: null }))
                }
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-zinc-900">
                  Tạo mới thủ công
                </div>
                <div className="text-xs text-zinc-500">
                  Nhập tay dòng hàng, giá, thuế.
                </div>
              </div>
            </label>

            <label
              className={cn(
                "flex cursor-pointer items-start gap-3 rounded-md border p-4 transition-colors",
                state.source === "FROM_PR"
                  ? "border-indigo-500 bg-indigo-50"
                  : "border-zinc-200 bg-white hover:bg-zinc-50",
              )}
            >
              <input
                type="radio"
                name="source"
                checked={state.source === "FROM_PR"}
                onChange={() =>
                  setState((s) => ({ ...s, source: "FROM_PR" }))
                }
                className="mt-0.5"
              />
              <div>
                <div className="text-sm font-medium text-zinc-900">
                  Từ PR đã duyệt
                </div>
                <div className="text-xs text-zinc-500">
                  Auto-fill dòng hàng từ Purchase Request APPROVED.
                </div>
              </div>
            </label>
          </div>

          {state.source === "FROM_PR" && (
            <div className="space-y-1.5">
              <Label htmlFor="pr-picker" uppercase required>
                Chọn PR
              </Label>
              <select
                id="pr-picker"
                value={state.prId ?? ""}
                onChange={(e) =>
                  setState((s) => ({ ...s, prId: e.target.value || null }))
                }
                className="block h-9 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="">— Chọn PR đã duyệt —</option>
                {(approvedPRs.data?.data ?? []).map((pr) => (
                  <option key={pr.id} value={pr.id}>
                    {pr.code} — {pr.title ?? "Không tiêu đề"}
                  </option>
                ))}
              </select>
              {prDetail.data && (
                <div className="mt-2 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-600">
                  <div className="font-medium text-zinc-700">
                    Preview {prDetail.data.data.lines.length} dòng:
                  </div>
                  <ul className="mt-1 list-inside list-disc space-y-0.5">
                    {prDetail.data.data.lines.slice(0, 5).map((l) => (
                      <li key={l.id}>
                        <span className="font-mono">{l.sku}</span> — {l.name} ×{" "}
                        {l.qty}
                      </li>
                    ))}
                    {prDetail.data.data.lines.length > 5 && (
                      <li className="text-zinc-400">
                        ... và {prDetail.data.data.lines.length - 5} dòng khác
                      </li>
                    )}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>
      )}

      {/* Step 2 */}
      {step === 2 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Nhà cung cấp & dòng hàng
            </h2>
            <p className="text-sm text-zinc-500">
              V1.2 rule: 1 PO = 1 NCC. Chọn 1 NCC áp dụng cho mọi dòng.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="supplier-picker" uppercase required>
              Nhà cung cấp
            </Label>
            <SupplierPicker
              id="supplier-picker"
              value={state.supplier}
              onChange={onSupplierChange}
            />
            {state.supplier && (
              <div className="mt-1 flex flex-wrap gap-3 text-xs text-zinc-500">
                {state.supplier.region && (
                  <span>Khu vực: {state.supplier.region}</span>
                )}
                {state.supplier.paymentTerms && (
                  <span>
                    Điều khoản TT mặc định: {state.supplier.paymentTerms}
                  </span>
                )}
                {state.supplier.taxCode && (
                  <span>MST: {state.supplier.taxCode}</span>
                )}
              </div>
            )}
          </div>

          <PoLineEditor
            lines={state.lines}
            onChange={(next) => setState((s) => ({ ...s, lines: next }))}
          />
        </section>
      )}

      {/* Step 3 */}
      {step === 3 && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-zinc-900">
              Điều khoản & Duyệt
            </h2>
            <p className="text-sm text-zinc-500">
              Nhập ngày dự kiến nhận, điều khoản thanh toán, địa chỉ giao hàng
              rồi chọn hành động.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="exp-eta" uppercase>
                Ngày dự kiến nhận
              </Label>
              <Input
                id="exp-eta"
                type="date"
                value={state.expectedEta}
                onChange={(e) =>
                  setState((s) => ({ ...s, expectedEta: e.target.value }))
                }
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-terms" uppercase>
                Điều khoản thanh toán
              </Label>
              <Input
                id="pay-terms"
                value={state.paymentTerms}
                onChange={(e) =>
                  setState((s) => ({ ...s, paymentTerms: e.target.value }))
                }
                placeholder="VD: NET 30, 50% trả trước..."
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="deliv-addr" uppercase>
                Địa chỉ giao hàng
              </Label>
              <Input
                id="deliv-addr"
                value={state.deliveryAddress}
                onChange={(e) =>
                  setState((s) => ({ ...s, deliveryAddress: e.target.value }))
                }
              />
            </div>
            <div className="md:col-span-2 space-y-1.5">
              <Label htmlFor="po-notes" uppercase>
                Ghi chú
              </Label>
              <Textarea
                id="po-notes"
                value={state.notes}
                onChange={(e) =>
                  setState((s) => ({ ...s, notes: e.target.value }))
                }
                rows={3}
                maxLength={2000}
              />
            </div>
          </div>

          <div className="rounded-md border border-indigo-200 bg-indigo-50 p-3 text-sm">
            <div className="font-medium text-indigo-900">Hành động</div>
            <ul className="mt-1 space-y-1 text-xs text-indigo-800">
              <li>
                <strong>Lưu nháp:</strong> tạo PO status DRAFT, chưa gửi duyệt.
              </li>
              <li>
                <strong>Gửi duyệt:</strong> tạo + mark pending approval (cần
                admin duyệt tiếp).
              </li>
              {isAdmin && (
                <li>
                  <strong>Tạo + Duyệt luôn:</strong> tạo PO + auto-approve +
                  status = SENT (admin only).
                </li>
              )}
            </ul>
          </div>
        </section>
      )}

      {/* Footer actions */}
      <div className="flex items-center justify-between border-t border-zinc-200 pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setStep((s) => (s > 1 ? ((s - 1) as Step) : s))}
          disabled={step === 1}
        >
          <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
          Quay lại
        </Button>

        {step < 3 ? (
          <Button
            type="button"
            size="sm"
            onClick={() => setStep((s) => (s < 3 ? ((s + 1) as Step) : s))}
            disabled={(step === 1 && !canNext1) || (step === 2 && !canNext2)}
          >
            Tiếp
            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => void doSubmit("draft")}
              disabled={create.isPending}
            >
              Lưu nháp
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => void doSubmit("submit")}
              disabled={create.isPending}
            >
              Gửi duyệt
            </Button>
            {isAdmin && (
              <Button
                type="button"
                size="sm"
                onClick={() => void doSubmit("approve")}
                disabled={create.isPending}
              >
                Tạo + Duyệt
              </Button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Re-export để rõ ràng type import ngoài nếu cần
export type { POLineRow };
