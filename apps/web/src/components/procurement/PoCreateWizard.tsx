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
    <div className="flex items-center gap-2.5">
      <div
        className={cn(
          "flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold transition-all",
          done && "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200",
          active && "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-300 ring-4 ring-blue-100",
          !done && !active && "bg-white text-zinc-400 ring-2 ring-zinc-200",
        )}
      >
        {done ? <Check className="h-4 w-4" aria-hidden="true" /> : step}
      </div>
      <span
        className={cn(
          "text-sm font-semibold transition-colors",
          active && "text-blue-700",
          done && "text-zinc-900",
          !active && !done && "text-zinc-400",
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
      // V3.7.72 — filter lines có itemId (bỏ free-text lines chưa link master)
      const next: PoLineDraft[] = prLines
        .filter((l): l is typeof l & { itemId: string } => !!l.itemId)
        .map((l) => ({
        localId: crypto.randomUUID(),
        item: {
          id: l.itemId,
          sku: l.sku ?? "",
          name: l.name ?? "",
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
      {/* V3.7.15 — Step indicator with progress lines */}
      <nav
        aria-label="Các bước"
        className="flex items-center gap-3 rounded-xl border border-zinc-200 bg-white px-5 py-4 shadow-sm"
      >
        <StepIndicator step={1} current={step} label="Nguồn" />
        <div className={cn("h-0.5 flex-1 transition-colors", step >= 2 ? "bg-gradient-to-r from-blue-500 to-indigo-600" : "bg-zinc-200")} />
        <StepIndicator step={2} current={step} label="NCC + dòng hàng" />
        <div className={cn("h-0.5 flex-1 transition-colors", step >= 3 ? "bg-gradient-to-r from-blue-500 to-indigo-600" : "bg-zinc-200")} />
        <StepIndicator step={3} current={step} label="Điều khoản & Duyệt" />
      </nav>

      {/* Step 1 — V3.7.15 redesign */}
      {step === 1 && (
        <section className="space-y-5">
          <div>
            <h2 className="text-xl font-bold tracking-tight text-zinc-900">
              Chọn nguồn PO
            </h2>
            <p className="mt-0.5 text-sm text-zinc-500">
              Bắt đầu từ đầu hoặc kế thừa dữ liệu từ Yêu cầu mua đã duyệt.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label
              className={cn(
                "group relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-5 transition-all",
                state.source === "MANUAL"
                  ? "border-blue-500 bg-gradient-to-br from-blue-50 to-indigo-50 shadow-md ring-2 ring-blue-100"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm",
              )}
            >
              <input
                type="radio"
                name="source"
                checked={state.source === "MANUAL"}
                onChange={() =>
                  setState((s) => ({ ...s, source: "MANUAL", prId: null }))
                }
                className="absolute right-4 top-4 h-4 w-4 accent-blue-600"
              />
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-all",
                  state.source === "MANUAL"
                    ? "bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-md shadow-blue-200"
                    : "bg-zinc-100 text-zinc-600 group-hover:bg-zinc-200",
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                </svg>
              </div>
              <div>
                <div className="text-base font-bold text-zinc-900">
                  Tạo mới thủ công
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">
                  Nhập trực tiếp dòng hàng, giá, thuế. Phù hợp khi chưa có PR.
                </p>
              </div>
            </label>

            <label
              className={cn(
                "group relative flex cursor-pointer flex-col gap-2 rounded-2xl border-2 p-5 transition-all",
                state.source === "FROM_PR"
                  ? "border-violet-500 bg-gradient-to-br from-violet-50 to-purple-50 shadow-md ring-2 ring-violet-100"
                  : "border-zinc-200 bg-white hover:border-zinc-300 hover:shadow-sm",
              )}
            >
              <input
                type="radio"
                name="source"
                checked={state.source === "FROM_PR"}
                onChange={() =>
                  setState((s) => ({ ...s, source: "FROM_PR" }))
                }
                className="absolute right-4 top-4 h-4 w-4 accent-violet-600"
              />
              <div
                className={cn(
                  "flex h-10 w-10 items-center justify-center rounded-xl transition-all",
                  state.source === "FROM_PR"
                    ? "bg-gradient-to-br from-violet-500 to-purple-600 text-white shadow-md shadow-violet-200"
                    : "bg-zinc-100 text-zinc-600 group-hover:bg-zinc-200",
                )}
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <polyline points="9 15 11 17 15 13" />
                </svg>
              </div>
              <div>
                <div className="text-base font-bold text-zinc-900">
                  Từ PR đã duyệt
                </div>
                <p className="mt-0.5 text-xs text-zinc-600">
                  Auto-fill toàn bộ dòng hàng từ Purchase Request đã được duyệt.
                </p>
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
