"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
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
import {
  Wizard,
  WizardSummary,
  useWizardStep,
  type WizardStep,
} from "@/components/wizard";
import { useOrdersList, type SalesOrderRow } from "@/hooks/useOrders";
import {
  useSnapshotLines,
  type SnapshotLineRow,
} from "@/hooks/useSnapshots";
import { useCreateWorkOrder } from "@/hooks/useWorkOrders";
import { useBomTree, useUpdateBomLine } from "@/hooks/useBom";

/**
 * /work-orders/new — Wizard 3 step (TASK-20260427-018).
 *
 * Step 1 — pickOrder: chọn 1 đơn hàng eligible (SNAPSHOTTED/IN_PROGRESS/CONFIRMED).
 * Step 2 — pickLines: chọn ≥1 snapshot line state AVAILABLE.
 * Step 3 — review: review + nhập priority/plannedStart/plannedEnd/notes → POST.
 *
 * Giữ logic prefill từ BOM line (?bomLineId/bomTemplateId/...) và bidirectional
 * link metadata.routing.linkedWorkOrderId sau khi tạo WO thành công.
 */

export const dynamic = "force-dynamic";

const STEP_KEYS = ["pickOrder", "pickLines", "review"] as const;
type StepKey = (typeof STEP_KEYS)[number];

type Priority = "LOW" | "NORMAL" | "HIGH" | "URGENT";

const PRIORITY_LABEL: Record<Priority, string> = {
  LOW: "Thấp",
  NORMAL: "Bình thường",
  HIGH: "Cao",
  URGENT: "Khẩn",
};

export default function NewWorkOrderPage() {
  return (
    <React.Suspense
      fallback={<div className="p-6 text-sm text-zinc-500">Đang tải…</div>}
    >
      <NewWorkOrderInner />
    </React.Suspense>
  );
}

function NewWorkOrderInner() {
  const router = useRouter();
  const params = useSearchParams();

  // ----- Prefill từ BOM line (giữ flow cũ) -----
  const prefillOrderId = params.get("orderId");
  const bomLineId = params.get("bomLineId");
  const bomTemplateId = params.get("bomTemplateId");
  const bomSku = params.get("sku");
  const bomMaterialCode = params.get("materialCode");
  const bomProcessRoute = params.get("processRoute");
  const bomNote = params.get("note");
  const fromBom = !!bomLineId;

  const bomTreeQuery = useBomTree(bomTemplateId);
  const updateLineMut = useUpdateBomLine(bomTemplateId ?? "");

  // ----- Wizard step (URL-bound) -----
  const { step, setStep } = useWizardStep({
    stepKeys: STEP_KEYS as unknown as string[],
    defaultKey: prefillOrderId ? "pickLines" : "pickOrder",
  });

  // ----- Form state -----
  const [selectedOrder, setSelectedOrder] = React.useState<string>(
    prefillOrderId ?? "",
  );
  const [selectedLineIds, setSelectedLineIds] = React.useState<Set<string>>(
    new Set(),
  );
  const [priority, setPriority] = React.useState<Priority>("NORMAL");
  const [plannedStart, setPlannedStart] = React.useState("");
  const [plannedEnd, setPlannedEnd] = React.useState("");
  const [notes, setNotes] = React.useState(bomNote ?? "");

  // Reset selectedLines khi đổi order
  React.useEffect(() => {
    setSelectedLineIds(new Set());
  }, [selectedOrder]);

  // ----- Data: orders eligible -----
  const ordersQuery = useOrdersList({
    status: ["SNAPSHOTTED", "IN_PROGRESS", "CONFIRMED"],
    page: 1,
    pageSize: 100,
  });
  const orderRows: SalesOrderRow[] = ordersQuery.data?.data ?? [];
  const selectedOrderRow = orderRows.find((o) => o.id === selectedOrder);

  // ----- Data: snapshot lines (state AVAILABLE) cho order đã chọn -----
  const snapsQuery = useSnapshotLines(
    selectedOrderRow?.orderNo ?? null,
    { state: ["AVAILABLE"], page: 1, pageSize: 200 },
  );
  const snapLines: SnapshotLineRow[] = snapsQuery.data?.data ?? [];

  const toggleLine = (id: string) => {
    setSelectedLineIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    setSelectedLineIds((prev) => {
      if (prev.size === snapLines.length) return new Set();
      return new Set(snapLines.map((l) => l.id));
    });
  };

  const selectedLines = React.useMemo(
    () => snapLines.filter((l) => selectedLineIds.has(l.id)),
    [snapLines, selectedLineIds],
  );
  const totalRequiredQty = React.useMemo(
    () =>
      selectedLines.reduce((acc, l) => {
        const v = Number(l.grossRequiredQty);
        return acc + (Number.isFinite(v) ? v : 0);
      }, 0),
    [selectedLines],
  );

  const createMut = useCreateWorkOrder();

  // ----- Steps definition -----
  const steps: WizardStep[] = [
    {
      key: "pickOrder",
      title: "Chọn đơn hàng",
      description:
        "Chỉ hiển thị đơn hàng đang ở trạng thái CONFIRMED / SNAPSHOTTED / IN_PROGRESS.",
      validate: async () => {
        if (!selectedOrder) {
          return { ok: false, error: "Vui lòng chọn 1 đơn hàng." };
        }
        return { ok: true };
      },
    },
    {
      key: "pickLines",
      title: "Chọn snapshot lines",
      description:
        "Chỉ hiển thị các dòng có state AVAILABLE — đã sẵn nguyên vật liệu.",
      validate: async () => {
        if (!selectedOrder) {
          return { ok: false, error: "Chưa chọn đơn hàng (Step 1)." };
        }
        if (selectedLineIds.size === 0) {
          return {
            ok: false,
            error: "Vui lòng chọn ít nhất 1 snapshot line để tạo WO.",
          };
        }
        return { ok: true };
      },
    },
    {
      key: "review",
      title: "Review & tạo WO",
      description:
        "Kiểm tra lại thông tin trước khi tạo. WO sẽ ở trạng thái DRAFT — cần Start ở trang chi tiết.",
    },
  ];

  // ----- Submit handler -----
  const handleSubmit = async () => {
    if (!selectedOrder) {
      throw new Error("Chưa chọn đơn hàng.");
    }
    if (selectedLineIds.size === 0) {
      throw new Error("Chưa chọn snapshot line nào.");
    }
    const result = await createMut.mutateAsync({
      orderId: selectedOrder,
      snapshotLineIds: Array.from(selectedLineIds),
      priority,
      plannedStart: plannedStart
        ? new Date(plannedStart).toISOString()
        : undefined,
      plannedEnd: plannedEnd ? new Date(plannedEnd).toISOString() : undefined,
      notes: notes.trim() ? notes.trim() : null,
    });
    toast.success(`Đã tạo WO ${result.data.woNo}`);

    // Bidirectional link với BOM line (giữ logic cũ)
    if (bomLineId && bomTemplateId && bomTreeQuery.data?.data.tree) {
      const line = bomTreeQuery.data.data.tree.find(
        (n) => n.id === bomLineId,
      );
      if (line) {
        const existingMeta = (line.metadata ?? {}) as Record<string, unknown>;
        const existingRouting =
          (existingMeta.routing as Record<string, unknown> | undefined) ?? {};
        const nextMeta = {
          ...existingMeta,
          routing: {
            ...existingRouting,
            linkedWorkOrderId: result.data.id,
            linkedWorkOrderNo: result.data.woNo,
          },
        };
        try {
          await updateLineMut.mutateAsync({
            lineId: bomLineId,
            data: { metadata: nextMeta },
          });
        } catch (linkErr) {
          toast.warning(
            `Tạo WO thành công nhưng chưa liên kết ngược được với BOM: ${
              (linkErr as Error).message
            }`,
          );
        }
      }
    }

    router.push(`/work-orders/${result.data.id}`);
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
            href="/work-orders"
            className="hover:text-zinc-900 hover:underline"
          >
            Lệnh sản xuất
          </Link>
          <span className="mx-1.5 text-zinc-300">›</span>
          <span className="text-zinc-900">Tạo mới</span>
        </nav>
        <h1 className="mt-1 text-xl font-semibold tracking-tight text-zinc-900">
          Tạo Lệnh sản xuất
        </h1>
        {fromBom ? (
          <div className="mt-2 rounded-md border border-emerald-200 bg-emerald-50/60 px-3 py-2 text-[12px] text-emerald-900">
            <span className="font-semibold">Khởi tạo từ BOM</span>
            {bomSku ? (
              <span className="ml-1 font-mono text-emerald-700">
                — {bomSku}
              </span>
            ) : null}
            {bomMaterialCode ? (
              <span className="ml-2 text-emerald-800">
                · Vật liệu{" "}
                <span className="font-mono">{bomMaterialCode}</span>
              </span>
            ) : null}
            {bomProcessRoute ? (
              <span className="ml-2 text-emerald-800">
                · Quy trình{" "}
                <span className="font-mono">
                  {bomProcessRoute.split(",").join(" → ")}
                </span>
              </span>
            ) : null}
          </div>
        ) : null}
      </header>

      <Wizard
        steps={steps}
        current={step}
        onChangeStep={setStep}
        onSubmit={handleSubmit}
        submitLabel="Tạo Lệnh SX"
        allowJump
        className="flex-1 min-h-0"
      >
        {step === "pickOrder" ? (
          <StepPickOrder
            orders={orderRows}
            selectedOrder={selectedOrder}
            setSelectedOrder={setSelectedOrder}
            isLoading={ordersQuery.isLoading}
          />
        ) : null}
        {step === "pickLines" ? (
          <StepPickLines
            order={selectedOrderRow ?? null}
            lines={snapLines}
            selectedIds={selectedLineIds}
            toggleLine={toggleLine}
            toggleAll={toggleAll}
            isLoading={snapsQuery.isLoading}
            onBackToOrder={() => setStep("pickOrder" as StepKey)}
          />
        ) : null}
        {step === "review" ? (
          <StepReview
            order={selectedOrderRow ?? null}
            selectedLines={selectedLines}
            totalRequiredQty={totalRequiredQty}
            priority={priority}
            setPriority={setPriority}
            plannedStart={plannedStart}
            setPlannedStart={setPlannedStart}
            plannedEnd={plannedEnd}
            setPlannedEnd={setPlannedEnd}
            notes={notes}
            setNotes={setNotes}
            onJumpTo={(key) => setStep(key)}
          />
        ) : null}
      </Wizard>
    </div>
  );
}

/* ============================================================ */
/* Step 1 — Pick Order                                          */
/* ============================================================ */

function StepPickOrder({
  orders,
  selectedOrder,
  setSelectedOrder,
  isLoading,
}: {
  orders: SalesOrderRow[];
  selectedOrder: string;
  setSelectedOrder: (id: string) => void;
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <section className="space-y-2 rounded-md border border-zinc-200 bg-white p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-14 w-full" />
        ))}
      </section>
    );
  }

  if (orders.length === 0) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50/60 p-8 text-center">
        <p className="text-sm font-medium text-amber-900">
          Chưa có đơn hàng eligible
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Cần ít nhất 1 đơn hàng ở trạng thái CONFIRMED / SNAPSHOTTED /
          IN_PROGRESS để tạo Lệnh sản xuất.
        </p>
        <Button asChild variant="primary" size="sm" className="mt-3">
          <Link href="/orders">Vào trang Đơn hàng để tạo mới</Link>
        </Button>
      </section>
    );
  }

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
      <p className="text-xs text-zinc-500">
        Hiển thị {orders.length} đơn hàng eligible. Chọn 1 để tiếp tục.
      </p>
      <ul role="radiogroup" className="space-y-2">
        {orders.map((o) => {
          const isSelected = o.id === selectedOrder;
          return (
            <li key={o.id}>
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => setSelectedOrder(o.id)}
                className={`w-full rounded-md border px-4 py-3 text-left transition-colors ${
                  isSelected
                    ? "border-indigo-600 bg-indigo-50/60 ring-1 ring-indigo-600"
                    : "border-zinc-200 bg-white hover:border-zinc-400"
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold text-zinc-900">
                        {o.orderNo}
                      </span>
                      <Badge variant="neutral" className="text-[10px]">
                        {o.status}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-600">
                      {o.customerName}
                      {o.customerRef ? (
                        <span className="text-zinc-400"> · {o.customerRef}</span>
                      ) : null}
                    </p>
                  </div>
                  <div className="text-right text-xs tabular-nums text-zinc-700">
                    <div>
                      SL{" "}
                      <span className="font-semibold">
                        {Number(o.orderQty).toLocaleString("vi-VN")}
                      </span>
                    </div>
                    {o.dueDate ? (
                      <div className="text-zinc-500">Due {o.dueDate}</div>
                    ) : null}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/* ============================================================ */
/* Step 2 — Pick Lines                                          */
/* ============================================================ */

function StepPickLines({
  order,
  lines,
  selectedIds,
  toggleLine,
  toggleAll,
  isLoading,
  onBackToOrder,
}: {
  order: SalesOrderRow | null;
  lines: SnapshotLineRow[];
  selectedIds: Set<string>;
  toggleLine: (id: string) => void;
  toggleAll: () => void;
  isLoading: boolean;
  onBackToOrder: () => void;
}) {
  if (!order) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50/60 p-8 text-center">
        <p className="text-sm font-medium text-amber-900">
          Chưa chọn đơn hàng
        </p>
        <Button
          variant="primary"
          size="sm"
          className="mt-3"
          onClick={onBackToOrder}
        >
          Quay lại Step 1
        </Button>
      </section>
    );
  }

  if (isLoading) {
    return (
      <section className="space-y-2 rounded-md border border-zinc-200 bg-white p-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </section>
    );
  }

  if (lines.length === 0) {
    return (
      <section className="rounded-md border border-amber-200 bg-amber-50/60 p-8 text-center">
        <p className="text-sm font-medium text-amber-900">
          Đơn hàng {order.orderNo} chưa có snapshot line nào ở state{" "}
          <span className="font-mono">AVAILABLE</span>
        </p>
        <p className="mt-1 text-xs text-amber-800">
          Cần explode snapshot và đẩy state lên AVAILABLE (qua tab Sản xuất
          của order) trước khi tạo WO.
        </p>
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={onBackToOrder}
        >
          Quay lại Step 1
        </Button>
      </section>
    );
  }

  const allChecked = selectedIds.size === lines.length;
  const someChecked = selectedIds.size > 0 && selectedIds.size < lines.length;

  return (
    <section className="space-y-3 rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="text-xs text-zinc-600">
          Đơn hàng{" "}
          <span className="font-mono font-semibold">{order.orderNo}</span> ·{" "}
          {lines.length} line AVAILABLE
        </div>
        <div className="text-xs text-zinc-500">
          Đã chọn{" "}
          <span className="font-semibold text-indigo-700">
            {selectedIds.size}
          </span>{" "}
          / {lines.length}
        </div>
      </div>

      <div className="overflow-hidden rounded-md border border-zinc-200">
        <table className="w-full text-xs">
          <thead className="bg-zinc-50 text-zinc-500">
            <tr>
              <th className="w-10 px-2 py-2">
                <Checkbox
                  checked={allChecked ? true : someChecked ? "indeterminate" : false}
                  onCheckedChange={toggleAll}
                  aria-label="Chọn tất cả"
                />
              </th>
              <th className="px-2 py-2 text-left">Path</th>
              <th className="px-2 py-2 text-left">SKU</th>
              <th className="px-2 py-2 text-left">Tên</th>
              <th className="px-2 py-2 text-right">Qty cần</th>
              <th className="px-2 py-2 text-left">State</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-zinc-100">
            {lines.map((l) => {
              const checked = selectedIds.has(l.id);
              return (
                <tr
                  key={l.id}
                  className={`cursor-pointer hover:bg-zinc-50 ${
                    checked ? "bg-indigo-50/50" : ""
                  }`}
                  onClick={() => toggleLine(l.id)}
                >
                  <td className="px-2 py-1.5" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleLine(l.id)}
                    />
                  </td>
                  <td className="px-2 py-1.5 font-mono text-zinc-500">
                    {l.path}
                  </td>
                  <td className="px-2 py-1.5 font-mono">{l.componentSku}</td>
                  <td className="px-2 py-1.5">{l.componentName}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {Number(l.grossRequiredQty).toLocaleString("vi-VN")}
                  </td>
                  <td className="px-2 py-1.5">
                    <Badge variant="neutral" className="text-[10px]">
                      {l.state}
                    </Badge>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/* ============================================================ */
/* Step 3 — Review & submit                                     */
/* ============================================================ */

function StepReview({
  order,
  selectedLines,
  totalRequiredQty,
  priority,
  setPriority,
  plannedStart,
  setPlannedStart,
  plannedEnd,
  setPlannedEnd,
  notes,
  setNotes,
  onJumpTo,
}: {
  order: SalesOrderRow | null;
  selectedLines: SnapshotLineRow[];
  totalRequiredQty: number;
  priority: Priority;
  setPriority: (p: Priority) => void;
  plannedStart: string;
  setPlannedStart: (v: string) => void;
  plannedEnd: string;
  setPlannedEnd: (v: string) => void;
  notes: string;
  setNotes: (v: string) => void;
  onJumpTo: (key: StepKey) => void;
}) {
  return (
    <div className="space-y-4">
      <WizardSummary
        title="Đơn hàng nguồn"
        items={[
          {
            label: "Mã đơn",
            value: order ? (
              <span className="font-mono">{order.orderNo}</span>
            ) : (
              "—"
            ),
          },
          { label: "Khách hàng", value: order?.customerName ?? "—" },
          {
            label: "SL đơn hàng",
            value: order
              ? Number(order.orderQty).toLocaleString("vi-VN")
              : "—",
          },
          { label: "Trạng thái", value: order?.status ?? "—" },
        ]}
      />

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-900">
            Snapshot lines đã chọn ({selectedLines.length})
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onJumpTo("pickLines")}
          >
            Sửa
          </Button>
        </div>
        {selectedLines.length === 0 ? (
          <p className="rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800">
            Chưa chọn line nào — quay lại step 2.
          </p>
        ) : (
          <div className="overflow-hidden rounded-md border border-zinc-200">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-xs uppercase tracking-wide text-zinc-500">
                <tr>
                  <th className="px-3 py-2 text-left">SKU</th>
                  <th className="px-3 py-2 text-left">Tên</th>
                  <th className="px-3 py-2 text-right">Qty cần</th>
                  <th className="px-3 py-2 text-left">State</th>
                </tr>
              </thead>
              <tbody>
                {selectedLines.map((l) => (
                  <tr
                    key={l.id}
                    className="border-t border-zinc-100 text-zinc-800"
                  >
                    <td className="px-3 py-1.5 font-mono text-xs">
                      {l.componentSku}
                    </td>
                    <td className="px-3 py-1.5">{l.componentName}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {Number(l.grossRequiredQty).toLocaleString("vi-VN")}
                    </td>
                    <td className="px-3 py-1.5">
                      <Badge variant="neutral" className="text-[10px]">
                        {l.state}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-zinc-200 bg-zinc-50 font-medium">
                  <td colSpan={2} className="px-3 py-2 text-right text-xs">
                    Tổng qty cần (cộng dồn):
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums text-indigo-700">
                    {totalRequiredQty.toLocaleString("vi-VN")}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </section>

      <section className="rounded-md border border-zinc-200 bg-white p-4">
        <h3 className="mb-3 text-sm font-semibold text-zinc-900">
          Thông tin Lệnh sản xuất
        </h3>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="wo-priority">Độ ưu tiên</Label>
            <Select
              value={priority}
              onValueChange={(v) => setPriority(v as Priority)}
            >
              <SelectTrigger id="wo-priority">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PRIORITY_LABEL) as Priority[]).map((p) => (
                  <SelectItem key={p} value={p}>
                    {PRIORITY_LABEL[p]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div />
          <div className="space-y-1.5">
            <Label htmlFor="wo-planned-start">Bắt đầu dự kiến</Label>
            <Input
              id="wo-planned-start"
              type="date"
              value={plannedStart}
              onChange={(e) => setPlannedStart(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="wo-planned-end">Kết thúc dự kiến</Label>
            <Input
              id="wo-planned-end"
              type="date"
              value={plannedEnd}
              onChange={(e) => setPlannedEnd(e.target.value)}
            />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="wo-notes">Ghi chú</Label>
            <Textarea
              id="wo-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
              placeholder="Lý do, deadline ưu tiên, đặc thù gia công…"
            />
          </div>
        </div>
      </section>

      <p className="text-xs text-zinc-500">
        Sau khi tạo, WO sẽ ở trạng thái <strong>DRAFT</strong>. Bạn cần Start
        ở trang chi tiết để chuyển sang IN_PROGRESS.
      </p>
    </div>
  );
}
