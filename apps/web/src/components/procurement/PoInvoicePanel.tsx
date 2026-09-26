"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, ExternalLink, FileText, Loader2, Save } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * V4.1 D7 (TM-18) — Hoá đơn mua của PO (trên trang chi tiết PO).
 *
 *  - Chưa có HĐ: xem trước tiền theo SL đã nhận đạt + nút "Tạo HĐ mua từ PO"
 *    (Thu mua / Kế toán / Giám đốc) → HĐ NHÁP.
 *  - HĐ NHÁP: Kế toán/Giám đốc nhập số HĐ của NCC, ngày, hạn TT, tiền → "Xác
 *    nhận ghi công nợ" (→ UNPAID, vào công nợ phải trả).
 *  - Đã ghi nợ: tóm tắt + link sang màn Tài chính.
 */

interface InvoiceRow {
  id: string;
  invoiceNo: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subtotalAmount: string;
  vatRate: string;
  vatAmount: string;
  totalAmount: string;
  paidAmount: string;
  notes: string | null;
}

interface InvoiceContext {
  po: { id: string; poNo: string; status: string; supplierName: string | null };
  invoiceable: boolean;
  invoice: InvoiceRow | null;
  link: string | null;
  canCreate: boolean;
  canConfirm: boolean;
  draft: {
    subtotalAmount: number;
    vatAmount: number;
    totalAmount: number;
    vatRate: number;
    mixedVat: boolean;
    billedQtyTotal: number;
    issueDate: string;
    dueDate: string | null;
  };
}

class HttpError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

async function call<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body = (await res.json().catch(() => ({}))) as {
    data?: T;
    error?: { message?: string; code?: string; details?: Record<string, unknown> };
  };
  if (!res.ok) {
    throw new HttpError(
      body.error?.message ?? `HTTP ${res.status}`,
      res.status,
      body.error?.code,
      body.error?.details,
    );
  }
  return body.data as T;
}

const STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp — chờ Kế toán xác nhận",
  UNPAID: "Đã ghi công nợ — chưa trả",
  PARTIAL: "Đã trả một phần",
  PAID: "Đã trả đủ",
  OVERDUE: "Quá hạn thanh toán",
  CANCELLED: "Đã huỷ",
};

function money(n: number | string | null | undefined): string {
  const v = typeof n === "string" ? Number(n) : (n ?? 0);
  return `${Math.round(Number.isFinite(v) ? v : 0).toLocaleString("vi-VN")} ₫`;
}

export function PoInvoicePanel({ poId }: { poId: string }) {
  const qc = useQueryClient();
  const key = ["procurement", "orders", "invoice", poId] as const;
  const panelRef = React.useRef<HTMLElement>(null);

  const ctx = useQuery({
    queryKey: key,
    queryFn: () => call<InvoiceContext>(`/api/purchase-orders/${poId}/invoice`),
    retry: false,
    staleTime: 15_000,
  });

  const [form, setForm] = React.useState({
    invoiceNo: "",
    issueDate: "",
    dueDate: "",
    subtotalAmount: "",
    vatRate: "",
    notes: "",
  });
  const inv = ctx.data?.invoice ?? null;
  React.useEffect(() => {
    if (inv && inv.status === "DRAFT") {
      setForm({
        invoiceNo: inv.invoiceNo,
        issueDate: inv.issueDate,
        dueDate: inv.dueDate ?? "",
        subtotalAmount: String(Number(inv.subtotalAmount)),
        vatRate: String(Number(inv.vatRate)),
        notes: inv.notes ?? "",
      });
    }
  }, [inv]);

  const create = useMutation({
    mutationFn: () =>
      call<{ invoice: InvoiceRow }>(`/api/purchase-orders/${poId}/invoice`, {
        method: "POST",
      }),
    onSuccess: (d) => {
      toast.success(`Đã tạo HĐ mua nháp ${d.invoice.invoiceNo} — Kế toán xác nhận để ghi công nợ.`);
      void qc.invalidateQueries({ queryKey: key });
      // "Điều hướng tới HĐ": cuộn tới khung HĐ vừa tạo (ngay trên trang PO).
      requestAnimationFrame(() =>
        panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
      );
    },
    onError: (e) => {
      const err = e as HttpError;
      if (err.code === "PO_INVOICE_EXISTS") {
        toast.error(err.message);
        void qc.invalidateQueries({ queryKey: key });
        return;
      }
      toast.error(`Không tạo được HĐ: ${err.message}`);
    },
  });

  const save = useMutation({
    mutationFn: (confirm: boolean) => {
      const subtotal = Number(form.subtotalAmount);
      const rate = Number(form.vatRate);
      // Chỉ gửi tiền khi người dùng sửa — giữ nguyên tiền VAT cộng theo từng
      // dòng PO (PO nhiều thuế suất) nếu không đổi.
      const amountChanged =
        !!inv &&
        (Math.abs(subtotal - Number(inv.subtotalAmount)) > 0.001 ||
          Math.abs(rate - Number(inv.vatRate)) > 0.001);
      return call<{ invoice: InvoiceRow }>(`/api/purchase-orders/${poId}/invoice`, {
        method: "PATCH",
        body: JSON.stringify({
          invoiceNo: form.invoiceNo.trim(),
          issueDate: form.issueDate,
          dueDate: form.dueDate || null,
          ...(amountChanged
            ? {
                subtotalAmount: Number.isFinite(subtotal) ? subtotal : 0,
                vatRate: Number.isFinite(rate) ? rate : 0,
              }
            : {}),
          notes: form.notes.trim() || null,
          ...(confirm ? { confirm: true } : {}),
        }),
      });
    },
    onSuccess: (_d, confirm) => {
      toast.success(confirm ? "Đã xác nhận HĐ — ghi vào công nợ phải trả." : "Đã lưu HĐ nháp.");
      void qc.invalidateQueries({ queryKey: key });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (ctx.isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải hoá đơn mua…
      </div>
    );
  }
  // 403 (vai trò không xem được tiền) → ẩn khung.
  if (ctx.error && (ctx.error as HttpError).status === 403) return null;
  if (ctx.error || !ctx.data) {
    return (
      <p className="text-sm text-red-600 dark:text-red-400">
        Không tải được hoá đơn mua: {(ctx.error as Error | null)?.message ?? "lỗi"}
      </p>
    );
  }

  const d = ctx.data;
  const subtotalNum = Number(form.subtotalAmount) || 0;
  const rateNum = Number(form.vatRate) || 0;
  const unchanged =
    !!inv &&
    Math.abs(subtotalNum - Number(inv.subtotalAmount)) <= 0.001 &&
    Math.abs(rateNum - Number(inv.vatRate)) <= 0.001;
  const vatPreview = unchanged
    ? Number(inv!.vatAmount)
    : Math.round(subtotalNum * rateNum) / 100;

  return (
    <section
      id="hoa-don-mua"
      ref={panelRef}
      className="scroll-mt-24 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm dark:border-zinc-800 dark:bg-zinc-900"
    >
      <h2 className="mb-4 flex items-center gap-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
        <FileText className="h-4 w-4 text-zinc-400 dark:text-zinc-500" /> Hoá đơn mua (công nợ NCC)
      </h2>

      {!inv && (
        <div className="space-y-3">
          {!d.invoiceable ? (
            <p className="text-sm text-zinc-500 dark:text-zinc-400">
              Tạo hoá đơn mua sau khi đã nhận hàng (PO nhận một phần / đủ / đã đóng).
            </p>
          ) : (
            <>
              <div className="grid gap-2 text-sm sm:grid-cols-3">
                <Stat label="Tạm tính (SL nhận đạt × đơn giá)" value={money(d.draft.subtotalAmount)} />
                <Stat
                  label={`VAT${d.draft.mixedVat ? " (nhiều thuế suất)" : ` ${d.draft.vatRate}%`}`}
                  value={money(d.draft.vatAmount)}
                />
                <Stat label="Tổng cộng" value={money(d.draft.totalAmount)} strong />
              </div>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                Hạn thanh toán dự kiến: {d.draft.dueDate ?? "— (điều khoản TT không ghi số ngày)"}. HĐ tạo ở
                trạng thái <strong>Nháp</strong>, chưa vào công nợ cho tới khi Kế toán xác nhận.
              </p>
              {d.canCreate && (
                <Button
                  size="sm"
                  onClick={() => create.mutate()}
                  disabled={create.isPending || d.draft.subtotalAmount <= 0}
                >
                  {create.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <FileText className="h-3.5 w-3.5" />
                  )}
                  Tạo HĐ mua từ PO
                </Button>
              )}
            </>
          )}
        </div>
      )}

      {inv && inv.status === "DRAFT" && (
        <div className="space-y-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            {STATUS_LABEL.DRAFT}. Nhập đúng <strong>số hoá đơn của NCC</strong> (đang tạm để số PO).
          </p>
          {d.canConfirm ? (
            <>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Field label="Số hoá đơn NCC">
                  <Input
                    value={form.invoiceNo}
                    onChange={(e) => setForm((f) => ({ ...f, invoiceNo: e.target.value }))}
                    maxLength={64}
                  />
                </Field>
                <Field label="Ngày hoá đơn">
                  <Input
                    type="date"
                    value={form.issueDate}
                    onChange={(e) => setForm((f) => ({ ...f, issueDate: e.target.value }))}
                  />
                </Field>
                <Field label="Hạn thanh toán">
                  <Input
                    type="date"
                    value={form.dueDate}
                    onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))}
                  />
                </Field>
                <Field label="Tạm tính (chưa VAT)">
                  <Input
                    type="number"
                    min={0}
                    step="any"
                    value={form.subtotalAmount}
                    onChange={(e) => setForm((f) => ({ ...f, subtotalAmount: e.target.value }))}
                  />
                </Field>
                <Field label="VAT %">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step="0.01"
                    value={form.vatRate}
                    onChange={(e) => setForm((f) => ({ ...f, vatRate: e.target.value }))}
                  />
                </Field>
                <Field label="Tổng (tự tính)">
                  <p className="pt-2 font-mono text-sm font-semibold tabular-nums">
                    {money(subtotalNum + vatPreview)}
                  </p>
                </Field>
              </div>
              <Field label="Ghi chú">
                <Input
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                  maxLength={2000}
                />
              </Field>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => save.mutate(false)}
                  disabled={save.isPending}
                >
                  <Save className="h-3.5 w-3.5" /> Lưu nháp
                </Button>
                <Button
                  size="sm"
                  onClick={() => save.mutate(true)}
                  disabled={save.isPending || !form.invoiceNo.trim() || subtotalNum <= 0}
                >
                  {save.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Xác nhận ghi công nợ
                </Button>
              </div>
            </>
          ) : (
            <InvoiceSummary inv={inv} />
          )}
        </div>
      )}

      {inv && inv.status !== "DRAFT" && (
        <div className="space-y-3">
          <InvoiceSummary inv={inv} />
          {d.canConfirm && d.link && (
            <Button asChild variant="outline" size="sm">
              <Link href={d.link}>
                Mở ở Tài chính <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </Button>
          )}
        </div>
      )}
    </section>
  );
}

function InvoiceSummary({ inv }: { inv: InvoiceRow }) {
  return (
    <div className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
      <Stat label="Số hoá đơn" value={inv.invoiceNo} />
      <Stat label="Trạng thái" value={STATUS_LABEL[inv.status] ?? inv.status} />
      <Stat label="Tổng cộng" value={money(inv.totalAmount)} strong />
      <Stat label="Đã trả" value={money(inv.paidAmount)} />
    </div>
  );
}

function Stat({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-zinc-100 bg-zinc-50/60 px-3 py-2 dark:border-zinc-800 dark:bg-zinc-800/40">
      <p className="text-xs text-zinc-500 dark:text-zinc-400">{label}</p>
      <p
        className={
          strong
            ? "font-mono text-base font-bold tabular-nums text-zinc-900 dark:text-zinc-50"
            : "font-mono text-sm tabular-nums text-zinc-800 dark:text-zinc-200"
        }
      >
        {value}
      </p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs font-semibold text-zinc-600 dark:text-zinc-400">{label}</Label>
      {children}
    </div>
  );
}
