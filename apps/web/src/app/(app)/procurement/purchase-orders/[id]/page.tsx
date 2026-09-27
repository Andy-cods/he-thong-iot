"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-error";
import { useSession } from "@/hooks/useSession";
import { usePurchaseOrderDetail, useUpdatePurchaseOrder } from "@/hooks/usePurchaseOrders";
import { PoInvoicePanel, usePoInvoiceContext } from "@/components/procurement/PoInvoicePanel";
import { PoDetailHeader } from "@/components/procurement/po-detail/PoDetailHeader";
import { PoLinesTable } from "@/components/procurement/po-detail/PoLinesTable";
import { PoDraftLinesEditor } from "@/components/procurement/po-detail/PoDraftLinesEditor";
import { PoInfoCard } from "@/components/procurement/po-detail/PoInfoCard";
import { PoProgressStepper } from "@/components/procurement/po-detail/PoProgressStepper";
import {
  PoSecondaryTabs,
  type PoSecondaryTab,
} from "@/components/procurement/po-detail/PoSecondaryTabs";
import {
  parseTaxRate,
  type EditableLine,
  type PoHeaderForm,
} from "@/components/procurement/po-detail/types";
import { derivePoFlags } from "@/lib/po-detail";
import { canEditPoPrices, summarizePoLines } from "@/lib/procurement-policy";
import { statusLabel } from "@/lib/status";

/**
 * V4.1 PO-UI: chi tiết Đơn đặt hàng — thiết kế lại gọn, chuyên nghiệp.
 *
 *  ┌ Đầu trang dính: ← / Số PO · trạng thái · loại · NCC ······ thao tác  ┐
 *  │ dải tóm tắt: Tổng cộng · số dòng · đã nhận · ngày dự kiến             │
 *  ├──────────────────────────────── (≥lg: 2 cột) ─────────────────────────┤
 *  │ CHÍNH: Dòng hàng (bảng + tổng, Điều chỉnh giá)  │ PHỤ: Thông tin       │
 *  │        Nhận nhanh / Lịch sử nhận / Nhật ký       │      Tiến trình      │
 *  │                                                  │      Hoá đơn mua     │
 *  └─────────────────────────────────────────────────────────────────────────┘
 * Điện thoại: 1 cột (dòng hàng → thông tin → tiến trình → HĐ → tab).
 * Các khối nằm ở components/procurement/po-detail/.
 */

const EMPTY_FORM: PoHeaderForm = { expectedEta: "", paymentTerms: "", deliveryAddress: "", notes: "" };

export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canPrice = canEditPoPrices(roles);
  const canSeeInvoiceRole =
    roles.includes("admin") || roles.includes("accountant") || roles.includes("purchaser");

  const detail = usePurchaseOrderDetail(id);
  const update = useUpdatePurchaseOrder(id);
  const po = detail.data?.data;

  const invoiceable =
    po?.status === "PARTIAL" || po?.status === "RECEIVED" || po?.status === "CLOSED";
  const invoiceCtx = usePoInvoiceContext(id, !!po && invoiceable && canSeeInvoiceRole);
  const invoiceStatus = invoiceCtx.data?.invoice?.status ?? null;

  const [editing, setEditing] = React.useState(false);
  const [form, setForm] = React.useState<PoHeaderForm>(EMPTY_FORM);
  const [editLines, setEditLines] = React.useState<EditableLine[]>([]);
  const [tab, setTab] = React.useState<PoSecondaryTab | null>(null);
  const tabsRef = React.useRef<HTMLElement>(null);
  const invoiceRef = React.useRef<HTMLDivElement>(null);

  const startEdit = () => {
    if (!po) return;
    setForm({
      expectedEta: po.expectedEta ?? "",
      paymentTerms: po.paymentTerms ?? "",
      deliveryAddress: po.deliveryAddress ?? "",
      notes: po.notes ?? "",
    });
    setEditLines(
      po.lines.map((l) => ({
        id: l.id,
        itemId: l.itemId,
        sku: l.itemSku ?? "",
        itemName: l.itemName ?? "",
        uom: l.itemUom ?? undefined,
        orderedQty: String(Number(l.orderedQty)),
        unitPrice: String(Number(l.unitPrice ?? 0)),
        taxRate: String(Number(l.taxRate ?? 8)),
        notes: l.notes ?? "",
        snapshotLineId: l.snapshotLineId ?? null,
        spec: l.spec ?? null,
        expectedEta: l.expectedEta ?? null,
      })),
    );
    setEditing(true);
  };

  const handleSaveEdit = async () => {
    if (!po) return;
    const isDraft = po.status === "DRAFT";
    if (isDraft && editLines.length === 0) {
      toast.error("PO cần ít nhất 1 dòng");
      return;
    }
    if (isDraft && editLines.some((l) => Number(l.orderedQty) <= 0)) {
      toast.error("Số lượng phải > 0");
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        expectedEta: form.expectedEta ? new Date(form.expectedEta) : null,
        notes: form.notes.trim() || null,
      };
      if (isDraft) {
        payload.paymentTerms = form.paymentTerms.trim() || null;
        payload.deliveryAddress = form.deliveryAddress.trim() || null;
        payload.lines = editLines.map((l) => ({
          itemId: l.itemId,
          orderedQty: Number(l.orderedQty),
          unitPrice: Number(l.unitPrice) || 0,
          taxRate: parseTaxRate(l.taxRate),
          notes: l.notes.trim() || null,
          // V4.1 TM-03 — giữ snapshot/quy cách trên PDF.
          snapshotLineId: l.snapshotLineId,
          spec: l.spec,
          expectedEta: l.expectedEta,
        }));
      }
      await update.mutateAsync(payload as never);
      toast.success("Đã cập nhật PO");
      setEditing(false);
    } catch (err) {
      toast.error(`Cập nhật thất bại: ${(err as Error).message}`);
    }
  };

  if (detail.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center gap-2 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" /> Đang tải PO…
      </div>
    );
  }
  // V4.1 UI-05: lỗi API (429/500/403) ≠ "không tìm thấy PO".
  if (!po && detail.isError && (detail.error as { status?: number } | null)?.status !== 404) {
    return (
      <QueryError
        error={detail.error}
        onRetry={() => void detail.refetch()}
        retrying={detail.isFetching}
        title="Không tải được đơn đặt hàng"
      />
    );
  }
  if (!po) {
    return (
      <div className="mx-auto mt-6 max-w-md rounded-lg border border-zinc-200 bg-white p-6 text-center dark:border-zinc-800 dark:bg-zinc-900">
        <AlertCircle className="mx-auto h-6 w-6 text-zinc-400" />
        <p className="mt-2 text-sm font-semibold text-zinc-900 dark:text-zinc-50">Không tìm thấy PO</p>
        <Button asChild variant="outline" size="sm" className="mt-3">
          <Link href="/sales?tab=po">Về danh sách</Link>
        </Button>
      </div>
    );
  }

  const flags = derivePoFlags({
    status: po.status,
    approvalStatus: po.metadata?.approvalStatus ?? null,
    roles,
    lines: po.lines,
    invoiceStatus,
  });
  const isDraft = po.status === "DRAFT";

  const sums = summarizePoLines(po.lines);
  const storedTotal = Number(po.totalAmount);
  const totalOrdered = po.lines.reduce((s, l) => s + (Number(l.orderedQty) || 0), 0);
  const totalReceived = po.lines.reduce((s, l) => s + (Number(l.receivedQty) || 0), 0);
  const receivedPct = totalOrdered > 0 ? Math.round((totalReceived / totalOrdered) * 100) : 0;

  const defaultTab: PoSecondaryTab =
    po.status === "SENT" || po.status === "PARTIAL"
      ? "receive"
      : po.status === "RECEIVED" || po.status === "CLOSED"
        ? "history"
        : "audit";
  const activeTab = tab ?? defaultTab;

  const inv = invoiceCtx.data;
  const showCreateInvoice =
    flags.canSeeInvoice &&
    flags.invoiceable &&
    !!inv &&
    !inv.invoice &&
    inv.canCreate &&
    inv.draft.subtotalAmount > 0;

  return (
    <div className="min-w-0">
      <PoDetailHeader
        po={po}
        flags={flags}
        totals={{
          total: Number.isFinite(storedTotal) && storedTotal > 0 ? storedTotal : sums.total,
          ordered: totalOrdered,
          received: totalReceived,
          pct: receivedPct,
        }}
        editing={editing}
        saving={update.isPending}
        onEdit={startEdit}
        onCancelEdit={() => setEditing(false)}
        onSaveEdit={() => void handleSaveEdit()}
        onReceive={() => {
          setTab("receive");
          requestAnimationFrame(() =>
            tabsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
          );
        }}
        showCreateInvoice={showCreateInvoice}
        onInvoice={() => invoiceRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
      />

      {editing && !isDraft && (
        <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-300">
          PO đang “{statusLabel("po", po.status)}” — chỉ sửa Ngày dự kiến và Ghi chú (khung Thông tin). Đơn giá / VAT
          sửa bằng nút “Điều chỉnh giá” ở bảng dòng hàng.
        </p>
      )}

      <div className="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[minmax(0,1fr)_340px]">
        {/* Cột chính — điện thoại: `contents` để xen khung phụ giữa bảng và tab. */}
        <div className="contents lg:flex lg:min-w-0 lg:flex-col lg:gap-4">
          <div className="order-1 min-w-0">
            {editing && isDraft ? (
              <PoDraftLinesEditor lines={editLines} onChange={setEditLines} canPrice={canPrice} />
            ) : (
              <PoLinesTable
                po={po}
                canPriceRole={flags.canPriceRole}
                priceLockReason={flags.priceLockReason}
                invoiceStatus={invoiceStatus}
              />
            )}
          </div>
          <div className="order-3 min-w-0">
            <PoSecondaryTabs
              ref={tabsRef}
              poId={po.id}
              status={po.status}
              tab={activeTab}
              onTabChange={setTab}
              isAdmin={flags.isAdmin}
            />
          </div>
        </div>

        <aside className="order-2 flex min-w-0 flex-col gap-4" aria-label="Thông tin PO">
          <PoInfoCard po={po} editing={editing} form={form} setForm={setForm} />
          <PoProgressStepper
            input={{
              status: po.status,
              createdAt: po.createdAt,
              sentAt: po.sentAt,
              cancelledAt: po.cancelledAt,
              actualDeliveryDate: po.actualDeliveryDate ?? null,
              metadata: (po.metadata ?? null) as unknown as Record<string, unknown> | null,
              receivedPct,
            }}
            actorNames={po.actorNames}
          />
          {flags.canSeeInvoice && flags.invoiceable && (
            <div ref={invoiceRef} className="scroll-mt-40">
              <PoInvoicePanel poId={po.id} compact />
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}
