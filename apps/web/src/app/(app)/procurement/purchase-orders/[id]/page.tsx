"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PO_STATUS_LABELS } from "@iot/shared";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { PoApprovalWorkflow } from "@/components/procurement/PoApprovalWorkflow";
import { usePurchaseOrderDetail } from "@/hooks/usePurchaseOrders";
import { formatDate } from "@/lib/format";

function fmtVND(n: number | string | null | undefined): string {
  if (n === null || n === undefined || n === "") return "0";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "0";
  return Math.round(num).toLocaleString("vi-VN");
}

/**
 * /procurement/purchase-orders/[id] — V1.9-P9 redesign.
 *
 * Sections:
 *   1) Info card (code, supplier, timestamps, total breakdown)
 *   2) Lines table read-only (V1.9-P9 vẫn chưa cho edit qty/price; chỉ
 *      approval workflow)
 *   3) Approval workflow (timeline + action buttons)
 *   4) Receiving history (link /receiving/[poId])
 */
export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;

  const detail = usePurchaseOrderDetail(id);
  const po = detail.data?.data;

  if (detail.isLoading || !po) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        {detail.isLoading ? "Đang tải…" : "Không tìm thấy PO."}
      </div>
    );
  }

  // Compute totals from lines
  let subtotal = 0;
  let totalTax = 0;
  let grandTotal = 0;
  for (const l of po.lines) {
    const qty = Number(l.orderedQty) || 0;
    const price = Number(l.unitPrice) || 0;
    const tax = Number(l.taxRate ?? 0) || 0;
    const pre = qty * price;
    subtotal += pre;
    totalTax += pre * (tax / 100);
    grandTotal += pre * (1 + tax / 100);
  }
  const displayTotal = Number(po.totalAmount) || grandTotal;

  const approvalStatus = po.metadata?.approvalStatus;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div>
          <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
            <Link
              href="/procurement/purchase-orders"
              className="hover:text-zinc-900 hover:underline"
            >
              Đơn đặt hàng
            </Link>
            {" / "}
            <span className="font-mono text-zinc-900">{po.poNo}</span>
          </nav>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              {po.poNo}
            </h1>
            <StatusBadge
              status={
                po.status === "RECEIVED"
                  ? "success"
                  : po.status === "PARTIAL"
                  ? "pending"
                  : po.status === "SENT"
                  ? "info"
                  : po.status === "CANCELLED"
                  ? "danger"
                  : "draft"
              }
              label={PO_STATUS_LABELS[po.status]}
            />
            {approvalStatus === "pending" && (
              <span className="inline-flex items-center rounded-md bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                Chờ duyệt
              </span>
            )}
            {approvalStatus === "approved" && (
              <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                Đã duyệt
              </span>
            )}
            {approvalStatus === "rejected" && (
              <span className="inline-flex items-center rounded-md bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 ring-1 ring-red-200">
                Bị từ chối
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Thông tin</TabsTrigger>
            <TabsTrigger value="lines">Dòng hàng ({po.lines.length})</TabsTrigger>
            <TabsTrigger value="approval">Duyệt</TabsTrigger>
            <TabsTrigger value="receiving">Lịch sử nhận</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <dl className="grid gap-4 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-zinc-500">Số PO</dt>
                <dd className="font-mono text-sm text-zinc-900">{po.poNo}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Nhà cung cấp</dt>
                <dd className="text-sm text-zinc-900">
                  {po.supplierName ?? po.supplierCode ?? po.supplierId}
                  {po.supplierCode && (
                    <span className="ml-1 font-mono text-xs text-zinc-500">
                      ({po.supplierCode})
                    </span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Ngày đặt</dt>
                <dd className="text-sm text-zinc-900">
                  {formatDate(po.orderDate, "dd/MM/yyyy")}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">ETA dự kiến</dt>
                <dd className="text-sm text-zinc-900">
                  {po.expectedEta
                    ? formatDate(po.expectedEta, "dd/MM/yyyy")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">
                  Điều khoản TT
                </dt>
                <dd className="text-sm text-zinc-900">
                  {po.paymentTerms ?? "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">
                  Địa chỉ giao
                </dt>
                <dd className="text-sm text-zinc-900">
                  {po.deliveryAddress ?? "—"}
                </dd>
              </div>
              <div className="md:col-span-2 rounded-md border border-zinc-200 bg-zinc-50 p-3">
                <dt className="text-xs uppercase text-zinc-500">
                  Tổng giá trị
                </dt>
                <dd className="mt-1 space-y-0.5 text-sm">
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Tạm tính (chưa VAT):</span>
                    <span className="tabular-nums">{fmtVND(subtotal)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-zinc-600">Tổng VAT:</span>
                    <span className="tabular-nums">{fmtVND(totalTax)}</span>
                  </div>
                  <div className="flex justify-between border-t border-zinc-200 pt-1 text-base font-semibold">
                    <span>Tổng cộng:</span>
                    <span className="tabular-nums text-indigo-700">
                      {fmtVND(displayTotal)} {po.currency}
                    </span>
                  </div>
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase text-zinc-500">Ghi chú</dt>
                <dd className="whitespace-pre-line text-sm text-zinc-900">
                  {po.notes ?? "—"}
                </dd>
              </div>
            </dl>
          </TabsContent>

          <TabsContent value="lines">
            <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
              <table className="w-full text-sm">
                <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                  <tr>
                    <th className="w-12 px-3 py-2 text-left">#</th>
                    <th className="px-3 py-2 text-left">Vật tư</th>
                    <th className="px-3 py-2 text-right">SL đặt</th>
                    <th className="px-3 py-2 text-right">Đã nhận</th>
                    <th className="px-3 py-2 text-right">Còn lại</th>
                    <th className="px-3 py-2 text-right">Đơn giá</th>
                    <th className="px-3 py-2 text-right">VAT%</th>
                    <th className="px-3 py-2 text-right">Thành tiền</th>
                    <th className="px-3 py-2 text-left">ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => {
                    const ordered = Number(l.orderedQty);
                    const received = Number(l.receivedQty);
                    const remaining = Math.max(0, ordered - received);
                    const price = Number(l.unitPrice) || 0;
                    const tax = Number(l.taxRate ?? 0) || 0;
                    const lineTotal =
                      Number(l.lineTotal ?? 0) ||
                      ordered * price * (1 + tax / 100);
                    return (
                      <tr key={l.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2 text-zinc-500">{l.lineNo}</td>
                        <td className="px-3 py-2">
                          {l.itemSku ? (
                            <span>
                              <span className="font-mono text-xs text-zinc-500">
                                {l.itemSku}
                              </span>
                              {l.itemName && (
                                <span className="ml-1 text-zinc-700">
                                  {l.itemName}
                                </span>
                              )}
                            </span>
                          ) : (
                            <span className="font-mono text-xs">
                              {l.itemId.slice(0, 8)}…
                            </span>
                          )}
                          {l.itemUom && (
                            <span className="ml-2 text-xs text-zinc-400">
                              ({l.itemUom})
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {ordered.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {received.toLocaleString("vi-VN")}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            remaining > 0 ? "text-orange-700" : "text-zinc-400"
                          }`}
                        >
                          {remaining.toLocaleString("vi-VN")}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtVND(price)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-500">
                          {tax}%
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-zinc-900">
                          {fmtVND(lineTotal)}
                        </td>
                        <td className="px-3 py-2 text-xs text-zinc-600">
                          {l.expectedEta
                            ? formatDate(l.expectedEta, "dd/MM/yyyy")
                            : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="approval">
            <div className="max-w-2xl">
              <PoApprovalWorkflow
                poId={po.id}
                status={po.status}
                metadata={po.metadata}
                createdAt={po.createdAt}
                sentAt={po.sentAt}
                cancelledAt={po.cancelledAt}
              />
            </div>
          </TabsContent>

          <TabsContent value="receiving">
            <div className="space-y-3">
              <p className="text-sm text-zinc-600">
                Màn hình nhận hàng thực tế qua barcode scan.
              </p>
              <Link
                href={`/receiving/${po.id}`}
                className="inline-flex h-9 items-center rounded-md bg-indigo-600 px-4 text-sm font-medium text-white hover:bg-indigo-700"
              >
                Mở màn hình nhận hàng →
              </Link>
              <div className="mt-4 rounded-md border border-zinc-200 bg-zinc-50 p-3 text-xs text-zinc-500">
                Lịch sử receipt chi tiết: xem audit tab hoặc /admin/audit với
                entity=inbound_receipt + po_no={po.poNo}.
              </div>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <p className="text-sm text-zinc-500">
              Xem /admin/audit với object_type=purchase_order, object_id={po.id}.
            </p>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
