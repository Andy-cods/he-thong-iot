"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { Check, X, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { PR_STATUS_LABELS } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { StatusBadge } from "@/components/domain/StatusBadge";
import { useSession } from "@/hooks/useSession";
import {
  useApprovePurchaseRequest,
  usePurchaseRequestDetail,
  useRejectPurchaseRequest,
} from "@/hooks/usePurchaseRequests";
import { useConvertPRToPOs } from "@/hooks/usePurchaseOrders";
import { formatDate, formatNumber } from "@/lib/format";

/**
 * /procurement/purchase-requests/[id] — detail PR với Tabs Info/Lines/Audit.
 * Actions role-guard:
 *  - "Phê duyệt" + "Từ chối": admin+planner, status DRAFT/SUBMITTED.
 *  - "Tạo PO": admin+planner, status APPROVED.
 */
export default function PurchaseRequestDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const session = useSession();
  const roles = session.data?.roles ?? [];
  const canManage = roles.includes("admin") || roles.includes("planner");

  const detail = usePurchaseRequestDetail(id);
  const approve = useApprovePurchaseRequest(id);
  const reject = useRejectPurchaseRequest(id);
  const convert = useConvertPRToPOs();

  const [rejectOpen, setRejectOpen] = React.useState(false);
  const [rejectReason, setRejectReason] = React.useState("");

  const pr = detail.data?.data;

  if (detail.isLoading || !pr) {
    return (
      <div className="p-6 text-sm text-zinc-500">
        {detail.isLoading ? "Đang tải…" : "Không tìm thấy PR."}
      </div>
    );
  }

  const canApprove =
    canManage && (pr.status === "DRAFT" || pr.status === "SUBMITTED");
  const canReject =
    canManage &&
    (pr.status === "DRAFT" ||
      pr.status === "SUBMITTED" ||
      pr.status === "APPROVED");
  const canConvert = canManage && pr.status === "APPROVED";

  const handleApprove = async () => {
    try {
      await approve.mutateAsync({ notes: null });
      toast.success("Đã duyệt PR.");
    } catch (err) {
      toast.error(`Duyệt thất bại: ${(err as Error).message}`);
    }
  };

  const handleReject = async () => {
    if (rejectReason.trim().length < 3) {
      toast.error("Lý do phải ≥ 3 ký tự.");
      return;
    }
    try {
      await reject.mutateAsync({ reason: rejectReason.trim() });
      toast.success("Đã từ chối PR.");
      setRejectOpen(false);
      setRejectReason("");
    } catch (err) {
      toast.error(`Từ chối thất bại: ${(err as Error).message}`);
    }
  };

  const handleConvert = async () => {
    try {
      const res = await convert.mutateAsync(id);
      const count = res.data.createdPOs.length;
      toast.success(`Đã tạo ${count} PO từ PR.`);
      if (count === 1 && res.data.createdPOs[0]) {
        router.push(`/procurement/purchase-orders/${res.data.createdPOs[0].id}`);
      } else {
        router.push("/procurement/purchase-orders");
      }
    } catch (err) {
      toast.error(`Convert thất bại: ${(err as Error).message}`);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
            <span className="font-mono text-zinc-900">{pr.code}</span>
          </nav>
          <div className="mt-1 flex items-center gap-3">
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              {pr.title ?? pr.code}
            </h1>
            <StatusBadge
              status={
                pr.status === "APPROVED"
                  ? "success"
                  : pr.status === "REJECTED"
                  ? "danger"
                  : pr.status === "CONVERTED"
                  ? "info"
                  : "draft"
              }
              label={PR_STATUS_LABELS[pr.status]}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          {canApprove && (
            <Button
              size="sm"
              onClick={() => void handleApprove()}
              disabled={approve.isPending}
            >
              <Check className="h-3.5 w-3.5" aria-hidden="true" />
              Duyệt
            </Button>
          )}
          {canReject && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => setRejectOpen(true)}
              disabled={reject.isPending}
            >
              <X className="h-3.5 w-3.5" aria-hidden="true" />
              Từ chối
            </Button>
          )}
          {canConvert && (
            <Button
              size="sm"
              onClick={() => void handleConvert()}
              disabled={convert.isPending}
            >
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              Tạo PO
            </Button>
          )}
        </div>
      </header>

      <div className="flex-1 overflow-auto p-6">
        <Tabs defaultValue="info">
          <TabsList>
            <TabsTrigger value="info">Thông tin</TabsTrigger>
            <TabsTrigger value="lines">Dòng hàng ({pr.lines.length})</TabsTrigger>
            <TabsTrigger value="audit">Audit</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            <dl className="grid gap-3 md:grid-cols-2">
              <div>
                <dt className="text-xs uppercase text-zinc-500">Mã PR</dt>
                <dd className="font-mono text-sm text-zinc-900">{pr.code}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Nguồn</dt>
                <dd className="text-sm text-zinc-900">{pr.source}</dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Tạo lúc</dt>
                <dd className="text-sm text-zinc-900">
                  {formatDate(pr.createdAt, "dd/MM/yyyy HH:mm")}
                </dd>
              </div>
              <div>
                <dt className="text-xs uppercase text-zinc-500">Duyệt lúc</dt>
                <dd className="text-sm text-zinc-900">
                  {pr.approvedAt
                    ? formatDate(pr.approvedAt, "dd/MM/yyyy HH:mm")
                    : "—"}
                </dd>
              </div>
              <div className="md:col-span-2">
                <dt className="text-xs uppercase text-zinc-500">Ghi chú</dt>
                <dd className="whitespace-pre-line text-sm text-zinc-900">
                  {pr.notes ?? "—"}
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
                    <th className="px-3 py-2 text-left">SKU</th>
                    <th className="px-3 py-2 text-left">Tên</th>
                    <th className="px-3 py-2 text-right">Số lượng</th>
                    <th className="px-3 py-2 text-right">Còn thiếu</th>
                    <th className="px-3 py-2 text-left">Cần</th>
                  </tr>
                </thead>
                <tbody>
                  {pr.lines.map((l) => (
                    <tr key={l.id} className="border-t border-zinc-100">
                      <td className="px-3 py-2 text-zinc-500">{l.lineNo}</td>
                      <td className="px-3 py-2 font-mono text-xs">{l.sku}</td>
                      <td className="px-3 py-2">{l.name}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {formatNumber(Number(l.qty))}
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-orange-700">
                        {l.remainingShortQty
                          ? formatNumber(Number(l.remainingShortQty))
                          : "—"}
                      </td>
                      <td className="px-3 py-2 text-xs text-zinc-600">
                        {l.neededBy
                          ? formatDate(l.neededBy, "dd/MM/yyyy")
                          : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <p className="text-sm text-zinc-500">
              Xem trang /admin/audit với bộ lọc object_type=purchase_request, object_id={pr.id}.
            </p>
          </TabsContent>
        </Tabs>
      </div>

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Từ chối PR</DialogTitle>
            <DialogDescription>
              Lý do sẽ được ghi vào audit. Thao tác không thể undo.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="reject-reason" required>
              Lý do
            </Label>
            <Textarea
              id="reject-reason"
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              rows={3}
              maxLength={500}
              placeholder="VD: NCC không đáp ứng được giao hàng đúng hạn."
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setRejectOpen(false)}>
              Huỷ
            </Button>
            <Button
              onClick={() => void handleReject()}
              disabled={reject.isPending}
              className="bg-red-600 hover:bg-red-700"
            >
              Từ chối
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
