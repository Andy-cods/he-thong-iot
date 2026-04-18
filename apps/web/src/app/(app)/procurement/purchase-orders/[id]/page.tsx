"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { PO_STATUS_LABELS } from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { useSession } from "@/hooks/useSession";
import {
  usePurchaseOrderDetail,
  useSendPurchaseOrder,
} from "@/hooks/usePurchaseOrders";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * /procurement/purchase-orders/[id] — detail PO.
 * Tabs: Thông tin / Dòng hàng / ETA / Audit.
 * Actions: "Gửi NCC" (admin only) khi DRAFT → SENT stub.
 */
export default function PurchaseOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const isAdmin = roles.includes("admin");

  const detail = usePurchaseOrderDetail(id);
  const send = useSendPurchaseOrder(id);
  const po = detail.data?.data;

  if (detail.isLoading || !po) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        {detail.isLoading ? "Đang tải…" : "Không tìm thấy PO."}
      </div>
    );
  }

  const canSend = isAdmin && po.status === "DRAFT";

  const handleSend = async () => {
    try {
      await send.mutateAsync();
      toast.success("Đã gửi PO (stub V1.3 sẽ email).");
    } catch (err) {
      toast.error(`Gửi thất bại: ${(err as Error).message}`);
    }
  };

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
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canSend && (
            <Button
              size="sm"
              onClick={() => void handleSend()}
              disabled={send.isPending}
            >
              <Send className="h-3.5 w-3.5" aria-hidden="true" />
              Gửi NCC
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Thông tin</TabsTrigger>
            <TabsTrigger value="lines">Dòng hàng ({po.lines.length})</TabsTrigger>
            <TabsTrigger value="eta">ETA & Giao hàng</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-zinc-500">Số PO</dt>
                <dd className="font-mono text-sm text-zinc-900">{po.poNo}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">NCC ID</dt>
                <dd className="font-mono text-xs text-zinc-900">
                  {po.supplierId}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Tiền tệ</dt>
                <dd className="text-sm text-zinc-900">{po.currency}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Tổng</dt>
                <dd className="text-sm text-zinc-900 tabular-nums">
                  {formatNumber(Number(po.totalAmount))}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Gửi lúc</dt>
                <dd className="text-sm text-zinc-900">
                  {po.sentAt ? formatDate(po.sentAt, "dd/MM/yyyy HH:mm") : "—"}
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
                    <th className="px-3 py-2 text-left">Item ID</th>
                    <th className="px-3 py-2 text-right">Đặt</th>
                    <th className="px-3 py-2 text-right">Đã nhận</th>
                    <th className="px-3 py-2 text-right">Còn</th>
                    <th className="px-3 py-2 text-left">ETA</th>
                  </tr>
                </thead>
                <tbody>
                  {po.lines.map((l) => {
                    const ordered = Number(l.orderedQty);
                    const received = Number(l.receivedQty);
                    const remaining = Math.max(0, ordered - received);
                    return (
                      <tr key={l.id} className="border-t border-zinc-100">
                        <td className="px-3 py-2 text-zinc-500">{l.lineNo}</td>
                        <td className="px-3 py-2 font-mono text-xs">
                          {l.itemId.slice(0, 8)}…
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {formatNumber(ordered)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums text-emerald-700">
                          {formatNumber(received)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${
                            remaining > 0 ? "text-orange-700" : "text-zinc-400"
                          }`}
                        >
                          {formatNumber(remaining)}
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

          <TabsContent value="eta">
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-zinc-500">ETA dự kiến</dt>
                <dd className="text-sm text-zinc-900">
                  {po.expectedEta
                    ? formatDate(po.expectedEta, "dd/MM/yyyy")
                    : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Ngày đặt</dt>
                <dd className="text-sm text-zinc-900">
                  {formatDate(po.orderDate, "dd/MM/yyyy")}
                </dd>
              </div>
            </dl>
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
