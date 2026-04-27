"use client";

import * as React from "react";
import Link from "next/link";
import {
  Check,
  ExternalLink,
  Loader2,
  Package,
  Smartphone,
  Truck,
  X,
} from "lucide-react";
import { EtaProgressBar } from "@/components/receiving/EtaProgressBar";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { StatusBadge } from "@/components/domain/StatusBadge";
import {
  usePurchaseOrdersList,
  type PORow,
} from "@/hooks/usePurchaseOrders";
import {
  useApproveReceiving,
  useRejectReceiving,
} from "@/hooks/useReceivingApprove";

/**
 * V3 (TASK-20260427-014) — `<ReceivingTab>` cho `/warehouse?tab=receiving`.
 *
 * Logic copy từ `/receiving` page V1.8 Batch 6 + bổ sung 2 nút approve/reject
 * gọi API thật `/api/receiving/[poId]/approve|reject`.
 *
 * Backend approve: chỉ pass nếu received >= 95% ordered. Backend trả 409 +
 * details.totals nếu không đủ — UI hiển thị toast error.
 */

function supplierLabel(po: PORow): string {
  return po.supplierName ?? po.supplierCode ?? "Nhà cung cấp chưa gán";
}

export function ReceivingTab() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    usePurchaseOrdersList({
      status: ["SENT", "PARTIAL"],
      page: 1,
      pageSize: 50,
    });

  const rows = data?.data ?? [];

  const [approveTarget, setApproveTarget] = React.useState<PORow | null>(null);
  const [approveNote, setApproveNote] = React.useState("");
  const [rejectTarget, setRejectTarget] = React.useState<PORow | null>(null);
  const [rejectReason, setRejectReason] = React.useState("");

  const approveMutation = useApproveReceiving();
  const rejectMutation = useRejectReceiving();

  return (
    <div className="flex flex-col gap-5 p-6">
      <section>
        <h2 className="flex items-center gap-2 text-base font-semibold tracking-tight text-zinc-900">
          <Truck className="h-4 w-4 text-zinc-500" aria-hidden="true" />
          PO chờ nhận
        </h2>
        <p className="mt-1 text-xs text-zinc-500">
          Danh sách PO đang ở trạng thái SENT hoặc PARTIAL. Click PO để mở
          form scan/nhận, hoặc duyệt/ từ chối ngay từ card này.
        </p>
      </section>

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-zinc-200 bg-white py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Đang tải danh sách PO…
        </div>
      ) : isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800">
          <p className="font-medium">Không tải được PO.</p>
          <p className="mt-1 text-xs">{(error as Error)?.message}</p>
          <button
            type="button"
            onClick={() => void refetch()}
            className="mt-2 inline-flex h-8 items-center gap-1 rounded-md border border-red-300 bg-white px-3 text-xs font-medium text-red-800 hover:bg-red-100"
          >
            Thử lại
          </button>
        </div>
      ) : rows.length === 0 ? (
        <EmptyReceivingState />
      ) : (
        <section
          aria-label="Danh sách PO đang chờ nhận"
          className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3"
        >
          {rows.map((po) => (
            <POCard
              key={po.id}
              po={po}
              onApprove={() => {
                setApproveTarget(po);
                setApproveNote("");
              }}
              onReject={() => {
                setRejectTarget(po);
                setRejectReason("");
              }}
            />
          ))}
        </section>
      )}

      <section className="rounded-md border border-indigo-200 bg-indigo-50 p-4 text-sm text-indigo-900">
        <h2 className="font-semibold">Mẹo dùng trên tablet</h2>
        <p className="mt-1 text-xs text-indigo-800">
          Operator mở trực tiếp URL{" "}
          <code className="rounded bg-white/60 px-1 font-mono text-xs">
            /pwa/receive/&lt;poId&gt;
          </code>{" "}
          trên tablet để quét barcode lô hàng.
        </p>
        {isFetching ? (
          <p className="mt-2 text-xs text-indigo-700">Đang đồng bộ danh sách…</p>
        ) : null}
      </section>

      {/* Approve dialog */}
      <Dialog
        open={approveTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setApproveTarget(null);
            setApproveNote("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Duyệt nhận đủ PO {approveTarget?.poNo}</DialogTitle>
            <DialogDescription>
              PO sẽ chuyển sang trạng thái <strong>RECEIVED</strong>. Yêu cầu
              tổng số lượng đã nhận đạt tối thiểu 95% so với ordered. Nếu chưa
              đủ, hệ thống sẽ trả lỗi với chi tiết phần trăm.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="approve-note">Ghi chú (tuỳ chọn)</Label>
            <Textarea
              id="approve-note"
              rows={3}
              value={approveNote}
              onChange={(e) => setApproveNote(e.target.value)}
              placeholder="VD: Đủ hàng, chất lượng OK."
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setApproveTarget(null);
                setApproveNote("");
              }}
            >
              Huỷ
            </Button>
            <Button
              disabled={!approveTarget || approveMutation.isPending}
              onClick={() => {
                if (!approveTarget) return;
                approveMutation.mutate(
                  {
                    poId: approveTarget.id,
                    note: approveNote.trim() || null,
                  },
                  {
                    onSuccess: () => {
                      setApproveTarget(null);
                      setApproveNote("");
                    },
                  },
                );
              }}
            >
              {approveMutation.isPending ? "Đang xử lý…" : "Duyệt nhận đủ"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reject dialog */}
      <Dialog
        open={rejectTarget !== null}
        onOpenChange={(o) => {
          if (!o) {
            setRejectTarget(null);
            setRejectReason("");
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối nhận PO {rejectTarget?.poNo}</DialogTitle>
            <DialogDescription>
              PO sẽ chuyển sang <strong>CANCELLED</strong>. Lý do từ chối sẽ
              được ghi vào audit log để truy vết. Hành động này không huỷ các
              receiving event đã ghi.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="reject-reason">Lý do (3–500 ký tự)</Label>
            <Textarea
              id="reject-reason"
              rows={3}
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="VD: Hàng hư hỏng, sai SKU, không đúng spec…"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => {
                setRejectTarget(null);
                setRejectReason("");
              }}
            >
              Huỷ
            </Button>
            <Button
              variant="destructive"
              disabled={
                !rejectTarget ||
                rejectReason.trim().length < 3 ||
                rejectMutation.isPending
              }
              onClick={() => {
                if (!rejectTarget) return;
                rejectMutation.mutate(
                  {
                    poId: rejectTarget.id,
                    reason: rejectReason.trim(),
                  },
                  {
                    onSuccess: () => {
                      setRejectTarget(null);
                      setRejectReason("");
                    },
                  },
                );
              }}
            >
              {rejectMutation.isPending ? "Đang xử lý…" : "Từ chối"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function POCard({
  po,
  onApprove,
  onReject,
}: {
  po: PORow;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <article
      className="flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 transition-colors hover:border-zinc-300"
      data-status={po.status}
    >
      <header>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Package
              className="h-4 w-4 shrink-0 text-zinc-500"
              aria-hidden="true"
            />
            <span className="truncate font-mono text-sm font-semibold text-zinc-900">
              {po.poNo}
            </span>
          </div>
          <StatusBadge
            status={po.status === "SENT" ? "pending" : "partial"}
            size="sm"
          />
        </div>
        <p className="mt-1 truncate text-base font-medium text-zinc-900">
          {supplierLabel(po)}
        </p>
        <p className="text-xs text-zinc-500">
          Dự kiến giao: {po.expectedEta ?? "Chưa có"} · Ngày đặt:{" "}
          {po.orderDate}
        </p>
      </header>

      <EtaProgressBar
        etaDate={po.expectedEta ?? null}
        orderedQty={1}
        receivedQty={po.status === "PARTIAL" ? 0.5 : 0}
      />

      <div className="flex flex-col gap-2 border-t border-zinc-100 pt-3">
        <Link
          href={`/receiving/${po.id}/wizard`}
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-indigo-600 px-3 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Truck className="h-3.5 w-3.5" aria-hidden="true" />
          Mở wizard desktop
        </Link>
        <Link
          href={`/receiving/${po.id}`}
          className="inline-flex h-7 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          Mở form nhận (single page)
        </Link>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onApprove}
            className="border-emerald-300 text-emerald-700 hover:bg-emerald-50"
          >
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            Duyệt nhận đủ
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={onReject}
            className="border-rose-300 text-rose-700 hover:bg-rose-50"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
            Từ chối
          </Button>
        </div>
        <Link
          href={`/pwa/receive/${po.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-8 items-center justify-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50"
        >
          <Smartphone className="h-3 w-3" aria-hidden="true" />
          Mở PWA (tablet)
          <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </Link>
      </div>
    </article>
  );
}

function EmptyReceivingState() {
  return (
    <div className="rounded-md border border-dashed border-zinc-300 bg-white p-8 text-center">
      <Truck className="mx-auto h-8 w-8 text-zinc-400" aria-hidden="true" />
      <h2 className="mt-3 text-sm font-semibold text-zinc-900">
        Không có PO đang chờ nhận
      </h2>
      <p className="mt-1 text-xs text-zinc-500">
        Chỉ PO status SENT hoặc PARTIAL mới xuất hiện ở đây. Tạo PO ở{" "}
        <Link
          href="/purchase-orders"
          className="text-indigo-600 hover:underline"
        >
          Mua hàng
        </Link>{" "}
        hoặc mở PWA demo:
      </p>
      <div className="mt-4 flex items-center justify-center gap-2">
        <Link
          href="/pwa/receive/demo"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-zinc-300 bg-white px-3 text-xs font-medium text-zinc-700 hover:bg-zinc-50"
        >
          <Package className="h-3 w-3" aria-hidden="true" />
          PWA demo
        </Link>
      </div>
    </div>
  );
}
