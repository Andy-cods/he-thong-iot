"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Factory, ChevronLeft } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { useOrdersList } from "@/hooks/useOrders";
import { useSnapshotLines } from "@/hooks/useSnapshots";
import { useCreateWorkOrder } from "@/hooks/useWorkOrders";

export default function NewWorkOrderPage() {
  const router = useRouter();
  const params = useSearchParams();
  const prefillOrderId = params.get("orderId");
  // V1.7-beta.2.5 — prefill từ BOM line (button "Lưu + Tạo Lệnh SX" trong BomLineSheet).
  const bomLineId = params.get("bomLineId");
  const bomSku = params.get("sku");
  const bomMaterialCode = params.get("materialCode");
  const bomProcessRoute = params.get("processRoute");
  const bomNote = params.get("note");
  const fromBom = !!bomLineId;

  const [selectedOrder, setSelectedOrder] = React.useState<string>(
    prefillOrderId ?? "",
  );
  const [priority, setPriority] = React.useState<
    "LOW" | "NORMAL" | "HIGH" | "URGENT"
  >("NORMAL");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");
  const [notes, setNotes] = React.useState(bomNote ?? "");
  const [selectedLineIds, setSelectedLineIds] = React.useState<Set<string>>(
    new Set(),
  );

  // Load orders dropdown (chỉ status SNAPSHOTTED/IN_PROGRESS)
  const ordersQuery = useOrdersList({
    status: ["SNAPSHOTTED", "IN_PROGRESS", "CONFIRMED"],
    page: 1,
    pageSize: 100,
  });

  const orderRows = ordersQuery.data?.data ?? [];
  const selectedOrderRow = orderRows.find((o) => o.id === selectedOrder);

  // Load snapshot lines cho order đã chọn
  const snapsQuery = useSnapshotLines(
    selectedOrderRow?.orderNo ?? "",
    { state: ["AVAILABLE"], page: 1, pageSize: 200 },
  );

  const snapLines = snapsQuery.data?.data ?? [];

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const createMut = useCreateWorkOrder();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedOrder) {
      toast.error("Vui lòng chọn đơn hàng.");
      return;
    }
    if (selectedLineIds.size === 0) {
      toast.error("Vui lòng chọn ít nhất 1 snapshot line.");
      return;
    }
    try {
      const result = await createMut.mutateAsync({
        orderId: selectedOrder,
        snapshotLineIds: Array.from(selectedLineIds),
        priority,
        plannedStart: plannedStart
          ? new Date(plannedStart).toISOString()
          : undefined,
        plannedEnd: plannedEnd ? new Date(plannedEnd).toISOString() : undefined,
        notes: notes || null,
      });
      toast.success(`Tạo WO ${result.data.woNo} thành công.`);
      router.push(`/work-orders/${result.data.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex items-center justify-between border-b border-zinc-200 bg-white px-6 py-4">
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => router.push("/work-orders")}
          >
            <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
            Quay lại
          </Button>
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
              <Factory
                className="mr-1 inline-block h-5 w-5 text-zinc-500"
                aria-hidden="true"
              />{" "}
              Tạo Work Order
            </h1>
          </div>
        </div>
      </header>

      <form onSubmit={handleSubmit} className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-4xl space-y-6">
          {fromBom && (
            <div className="rounded-md border border-emerald-200 bg-emerald-50/60 p-3 text-[12px] text-emerald-900">
              <div className="mb-1 font-semibold">
                Khởi tạo từ BOM
                {bomSku ? (
                  <span className="ml-1 font-mono text-emerald-700">
                    — {bomSku}
                  </span>
                ) : null}
              </div>
              <div className="space-y-0.5 text-emerald-800">
                {bomMaterialCode && (
                  <div>
                    Vật liệu:{" "}
                    <span className="font-mono">{bomMaterialCode}</span>
                  </div>
                )}
                {bomProcessRoute && (
                  <div>
                    Quy trình:{" "}
                    <span className="font-mono">
                      {bomProcessRoute.split(",").join(" → ")}
                    </span>
                  </div>
                )}
                <div className="mt-1 text-[11px] text-emerald-700">
                  Ghi chú đã prefill bên dưới. Chọn đơn hàng + snapshot lines
                  AVAILABLE để tiếp tục tạo WO.
                </div>
              </div>
            </div>
          )}
          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">
              1. Chọn đơn hàng
            </h2>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <Label>Đơn hàng nguồn</Label>
                <Select value={selectedOrder} onValueChange={setSelectedOrder}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Chọn đơn hàng…" />
                  </SelectTrigger>
                  <SelectContent>
                    {orderRows.map((o) => (
                      <SelectItem key={o.id} value={o.id}>
                        {o.orderNo} — {o.customerName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Độ ưu tiên</Label>
                <Select
                  value={priority}
                  onValueChange={(v) =>
                    setPriority(v as typeof priority)
                  }
                >
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Thấp</SelectItem>
                    <SelectItem value="NORMAL">Bình thường</SelectItem>
                    <SelectItem value="HIGH">Cao</SelectItem>
                    <SelectItem value="URGENT">Khẩn</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="planned-start">Bắt đầu dự kiến</Label>
                <Input
                  id="planned-start"
                  type="date"
                  value={plannedStart}
                  onChange={(e) => setPlannedStart(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="planned-end">Kết thúc dự kiến</Label>
                <Input
                  id="planned-end"
                  type="date"
                  value={plannedEnd}
                  onChange={(e) => setPlannedEnd(e.target.value)}
                  className="mt-1"
                />
              </div>
            </div>
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-zinc-800">
                2. Chọn snapshot lines (AVAILABLE)
              </h2>
              <span className="text-xs text-zinc-500">
                Đã chọn {selectedLineIds.size} / {snapLines.length}
              </span>
            </div>
            {!selectedOrder ? (
              <p className="text-sm text-zinc-500">
                Chọn đơn hàng trước để hiển thị snapshot lines.
              </p>
            ) : snapsQuery.isLoading ? (
              <div className="space-y-2">
                {[...Array(4)].map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : snapLines.length === 0 ? (
              <p className="text-sm text-amber-700">
                Order này chưa có snapshot_line nào ở trạng thái AVAILABLE.
                Cần đẩy state lên AVAILABLE trước khi tạo WO.
              </p>
            ) : (
              <div className="max-h-96 overflow-y-auto rounded border border-zinc-200">
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-zinc-50 text-zinc-500">
                    <tr>
                      <th className="w-8 px-2 py-1.5"></th>
                      <th className="px-2 py-1.5 text-left">Path</th>
                      <th className="px-2 py-1.5 text-left">SKU</th>
                      <th className="px-2 py-1.5 text-left">Tên</th>
                      <th className="px-2 py-1.5 text-right">Required</th>
                      <th className="px-2 py-1.5 text-left">State</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100">
                    {snapLines.map((l) => (
                      <tr
                        key={l.id}
                        className="hover:bg-zinc-50"
                        onClick={() => toggleLine(l.id)}
                      >
                        <td className="px-2 py-1">
                          <Checkbox
                            checked={selectedLineIds.has(l.id)}
                            onCheckedChange={() => toggleLine(l.id)}
                          />
                        </td>
                        <td className="px-2 py-1 font-mono text-zinc-500">
                          {l.path}
                        </td>
                        <td className="px-2 py-1 font-mono">{l.componentSku}</td>
                        <td className="px-2 py-1">{l.componentName}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {Number(l.grossRequiredQty).toLocaleString("vi-VN")}
                        </td>
                        <td className="px-2 py-1">
                          <Badge variant="neutral" className="text-xs">
                            {l.state}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-md border border-zinc-200 bg-white p-4">
            <h2 className="mb-3 text-sm font-semibold text-zinc-800">
              3. Ghi chú
            </h2>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Ghi chú WO (tuỳ chọn)"
              rows={3}
            />
          </section>

          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="ghost"
              onClick={() => router.push("/work-orders")}
            >
              Hủy
            </Button>
            <Button
              type="submit"
              disabled={createMut.isPending || !selectedOrder || selectedLineIds.size === 0}
            >
              {createMut.isPending ? "Đang tạo…" : "Tạo Work Order"}
            </Button>
          </div>
        </div>
      </form>
    </div>
  );
}
