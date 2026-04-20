"use client";

import * as React from "react";
import { notFound, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ClipboardList,
  Loader2,
  Lock,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Zap,
} from "lucide-react";
import {
  BOM_SNAPSHOT_STATES,
  BOM_SNAPSHOT_STATE_LABELS,
  BOM_SNAPSHOT_STATE_TONES,
  SALES_ORDER_STATUS_LABELS,
  type BomSnapshotState,
  type OrderCreate,
  type SalesOrderStatus,
} from "@iot/shared";
import { Button } from "@/components/ui/button";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { OrderForm } from "@/components/orders/OrderForm";
import { ProductionProgressPanel } from "@/components/orders/ProductionProgressPanel";
import {
  SnapshotBoardTable,
  SnapshotBoardFilterBar,
} from "@/components/snapshot/SnapshotBoardTable";
import { TransitionStateDialog } from "@/components/snapshot/TransitionStateDialog";
import { ExplodeSnapshotDialog } from "@/components/snapshot/ExplodeSnapshotDialog";
import { EmptyState } from "@/components/ui/empty-state";
import {
  useSnapshotLines,
  useSnapshotSummary,
  type SnapshotLineRow,
} from "@/hooks/useSnapshots";
import { useReserveLine } from "@/hooks/useReservations";
import { useSession } from "@/hooks/useSession";
import {
  useCloseOrder,
  useOrderDetail,
  useOrderProductionSummary,
  useReopenOrder,
  useUpdateOrder,
} from "@/hooks/useOrders";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";

export const dynamic = "force-dynamic";

function statusToBadge(status: SalesOrderStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  const label = SALES_ORDER_STATUS_LABELS[status];
  switch (status) {
    case "DRAFT":
      return { badgeStatus: "draft", label };
    case "CONFIRMED":
    case "SNAPSHOTTED":
      return { badgeStatus: "info", label };
    case "IN_PROGRESS":
      return { badgeStatus: "pending", label };
    case "FULFILLED":
      return { badgeStatus: "success", label };
    case "CLOSED":
      return { badgeStatus: "inactive", label };
    case "CANCELLED":
      return { badgeStatus: "danger", label };
  }
}

/**
 * V1.2 `/orders/[code]` detail — replace V1.1-alpha stub mock.
 *
 * Fetch real via useOrderDetail. Tabs 4: "Thông tin" / "Snapshot Board" /
 * "Shortage" / "Audit". Snapshot + Shortage là stub cho Phase B2 + B3.
 * Thông tin tab: OrderForm readonly view + button "Sửa" → edit mode
 * (PATCH với versionLock optimistic).
 */
export default function OrderDetailPage({
  params,
}: {
  params: { code: string };
}) {
  const router = useRouter();
  const code = params.code;

  const query = useOrderDetail(code);
  const updateOrder = useUpdateOrder(code);
  const closeOrder = useCloseOrder(code);
  const reopenOrder = useReopenOrder(code);

  const [editMode, setEditMode] = React.useState(false);
  const [closeDialogOpen, setCloseDialogOpen] = React.useState(false);
  const [closeReason, setCloseReason] = React.useState("");

  // Snapshot Board state
  const session = useSession();
  const isAdmin = session.data?.roles?.includes("admin") ?? false;
  const [explodeOpen, setExplodeOpen] = React.useState(false);
  const [transitionRow, setTransitionRow] =
    React.useState<SnapshotLineRow | null>(null);
  const [snapQ, setSnapQ] = React.useState("");
  const [snapStates, setSnapStates] = React.useState<BomSnapshotState[]>([]);
  const snapshotFilter = React.useMemo(
    () => ({
      q: snapQ.trim().length > 0 ? snapQ.trim() : undefined,
      state: snapStates.length > 0 ? snapStates : undefined,
      page: 1,
      pageSize: 500,
    }),
    [snapQ, snapStates],
  );
  const snapshotLinesQuery = useSnapshotLines(code, snapshotFilter);
  const snapshotSummaryQuery = useSnapshotSummary(code);
  const snapshotRows = snapshotLinesQuery.data?.data ?? [];
  const snapshotSummary = snapshotSummaryQuery.data?.data;
  const snapshotTotal = snapshotSummary?.total ?? 0;

  // Production summary (lazy — chỉ fetch khi tab active)
  const [productionTabActive, setProductionTabActive] = React.useState(false);
  const productionSummaryQuery = useOrderProductionSummary(
    productionTabActive ? code : null,
  );

  // V1.3 Reservation handler
  const reserveMut = useReserveLine();
  const handleReserve = React.useCallback(
    async (row: SnapshotLineRow) => {
      const remaining =
        Number(row.grossRequiredQty) - Number(row.reservedQty);
      if (remaining <= 0) {
        toast.info("Line đã reserve đủ.");
        return;
      }
      try {
        const res = await reserveMut.mutateAsync({
          snapshotLineId: row.id,
          qty: remaining,
        });
        const lotLabel =
          res.data.lotCode ?? res.data.serialCode ?? res.data.lotId.slice(0, 8);
        toast.success(
          `Đã reserve ${res.data.reservedQty} @ lot ${lotLabel} (${res.data.reason})`,
        );
      } catch (err) {
        const e = err as Error & { code?: string };
        if (e.code === "ITEM_LOCKED_TRY_AGAIN") {
          toast.error("Item đang bị lock. Thử lại sau vài giây.");
        } else if (e.code === "NO_AVAILABLE_LOT") {
          toast.error("Không có lot AVAILABLE đủ qty.");
        } else if (e.code === "INSUFFICIENT_STOCK") {
          toast.error(e.message);
        } else {
          toast.error(e.message);
        }
      }
    },
    [reserveMut],
  );

  if (query.isLoading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-zinc-400" />
      </div>
    );
  }

  if (query.isError || !query.data?.data) {
    // 404 từ API → not found
    notFound();
  }

  const order = query.data.data;
  const badge = statusToBadge(order.status);
  const canEdit = order.status === "DRAFT";
  const canClose =
    order.status !== "CLOSED" && order.status !== "CANCELLED";
  const canReopen = order.status === "CLOSED";

  const handleSubmit = async (data: OrderCreate) => {
    try {
      await updateOrder.mutateAsync({
        customerName: data.customerName,
        customerRef: data.customerRef ?? null,
        bomTemplateId: data.bomTemplateId ?? null,
        orderQty: data.orderQty,
        dueDate: data.dueDate ?? null,
        priority: data.priority,
        notes: data.notes ?? null,
        expectedVersionLock: order.versionLock,
      });
      toast.success(`Đã cập nhật đơn ${order.orderNo}.`);
      setEditMode(false);
    } catch (err) {
      toast.error((err as Error).message ?? "Cập nhật thất bại");
    }
  };

  const handleClose = async () => {
    if (closeReason.trim().length < 3) {
      toast.error("Vui lòng nhập lý do đóng đơn (tối thiểu 3 ký tự).");
      return;
    }
    try {
      await closeOrder.mutateAsync({ closeReason: closeReason.trim() });
      toast.success(`Đã đóng đơn ${order.orderNo}.`);
      setCloseDialogOpen(false);
      setCloseReason("");
    } catch (err) {
      toast.error((err as Error).message ?? "Đóng đơn thất bại");
    }
  };

  const handleReopen = async () => {
    try {
      await reopenOrder.mutateAsync();
      toast.success(`Đã mở lại đơn ${order.orderNo}.`);
    } catch (err) {
      toast.error((err as Error).message ?? "Mở lại đơn thất bại");
    }
  };

  return (
    <div className="flex h-full flex-col overflow-auto">
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "Đơn hàng", href: "/orders" },
            { label: order.orderNo },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
              <ClipboardList
                className="h-5 w-5 text-zinc-500"
                aria-hidden="true"
              />
              <span className="font-mono">{order.orderNo}</span>
              <StatusBadge
                status={badge.badgeStatus}
                size="sm"
                label={badge.label}
              />
            </h1>
            <p className="mt-0.5 text-xs text-zinc-500">
              Khách: <span className="text-zinc-900">{order.customerName}</span>
              {" · "}
              SL:{" "}
              <span className="tabular-nums text-zinc-900">
                {Number(order.orderQty).toLocaleString("vi-VN")}
              </span>
              {order.dueDate && (
                <>
                  {" · "}
                  Deadline:{" "}
                  <span className="tabular-nums text-zinc-900">
                    {formatDate(order.dueDate, "dd/MM/yyyy")}
                  </span>
                </>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !editMode && (
              <Button size="sm" onClick={() => setEditMode(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Sửa
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label="Thao tác khác">
                  <MoreHorizontal className="h-4 w-4" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {canClose && (
                  <DropdownMenuItem
                    onClick={() => setCloseDialogOpen(true)}
                  >
                    <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                    Đóng đơn hàng
                  </DropdownMenuItem>
                )}
                {canReopen && (
                  <DropdownMenuItem onClick={() => void handleReopen()}>
                    <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
                    Mở lại đơn
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => router.push("/orders")}>
                  Về danh sách
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 px-6 py-4">
        <Tabs
          defaultValue="info"
          onValueChange={(v) => {
            if (v === "production") setProductionTabActive(true);
          }}
        >
          <TabsList>
            <TabsTrigger value="info">Thông tin</TabsTrigger>
            <TabsTrigger value="snapshot">Snapshot Board</TabsTrigger>
            <TabsTrigger value="production">Sản xuất</TabsTrigger>
            <TabsTrigger value="shortage">Thiếu vật tư</TabsTrigger>
            <TabsTrigger value="audit">Lịch sử</TabsTrigger>
          </TabsList>

          <TabsContent value="info">
            {editMode && canEdit ? (
              <OrderForm
                mode="edit"
                defaultValues={{
                  customerName: order.customerName,
                  customerRef: order.customerRef ?? "",
                  productItemId: order.productItemId,
                  bomTemplateId: order.bomTemplateId,
                  orderQty: Number(order.orderQty),
                  dueDate: order.dueDate ?? null,
                  priority: "NORMAL",
                  notes: order.notes ?? "",
                  productItem: {
                    id: order.productItemId,
                    sku: "—",
                    name: "(giữ nguyên)",
                  },
                }}
                onSubmit={handleSubmit}
                onCancel={() => setEditMode(false)}
                submitting={updateOrder.isPending}
              />
            ) : (
              <OrderForm
                mode="edit"
                readOnly
                defaultValues={{
                  customerName: order.customerName,
                  customerRef: order.customerRef ?? "",
                  productItemId: order.productItemId,
                  bomTemplateId: order.bomTemplateId,
                  orderQty: Number(order.orderQty),
                  dueDate: order.dueDate ?? null,
                  priority: "NORMAL",
                  notes: order.notes ?? "",
                  productItem: {
                    id: order.productItemId,
                    sku: "—",
                    name: "(xem chi tiết)",
                  },
                }}
                onSubmit={async () => {}}
              />
            )}
          </TabsContent>

          <TabsContent value="snapshot">
            {snapshotTotal === 0 && !snapshotSummaryQuery.isLoading ? (
              <EmptyState
                preset="no-data"
                title="Chưa có snapshot"
                description="Explode từ một BOM revision để sinh snapshot lines cho đơn hàng này."
                actions={
                  <Button size="sm" onClick={() => setExplodeOpen(true)}>
                    <Zap className="h-3.5 w-3.5" aria-hidden="true" />
                    Explode snapshot
                  </Button>
                }
              />
            ) : (
              <div className="flex flex-col gap-2">
                <SnapshotSummaryHeader
                  summary={snapshotSummary?.byState ?? []}
                  total={snapshotTotal}
                  onClick={(s) =>
                    setSnapStates((prev) =>
                      prev.includes(s)
                        ? prev.filter((x) => x !== s)
                        : [...prev, s],
                    )
                  }
                  selectedStates={snapStates}
                  onRefresh={() => setExplodeOpen(true)}
                />
                <SnapshotBoardFilterBar
                  q={snapQ}
                  onQChange={setSnapQ}
                  selectedStates={snapStates}
                  onStatesChange={setSnapStates}
                  total={snapshotTotal}
                  showing={snapshotRows.length}
                />
                <div className="h-[min(72vh,640px)]">
                  <SnapshotBoardTable
                    rows={snapshotRows}
                    loading={snapshotLinesQuery.isLoading}
                    onTransition={(r) => setTransitionRow(r)}
                    onReserve={handleReserve}
                  />
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="production">
            <ProductionProgressPanel
              data={productionSummaryQuery.data?.data ?? null}
              loading={productionSummaryQuery.isLoading}
              error={
                productionSummaryQuery.isError
                  ? (productionSummaryQuery.error as Error)?.message ??
                    "Không tải được dữ liệu sản xuất."
                  : null
              }
            />
          </TabsContent>

          <TabsContent value="shortage">
            <div className="rounded-md border border-dashed border-zinc-300 bg-zinc-50 p-8 text-center">
              <h3 className="text-base font-medium text-zinc-900">
                Danh sách thiếu vật tư
              </h3>
              <p className="mt-1 text-sm text-zinc-500">
                Chưa có snapshot — tính toán thiếu vật tư sẽ có ở Phase B3.
              </p>
            </div>
          </TabsContent>

          <TabsContent value="audit">
            <div className="rounded-md border border-zinc-200 bg-white p-4">
              <h3 className="text-base font-medium text-zinc-900">
                Lịch sử thao tác
              </h3>
              <p className="mt-1 text-xs text-zinc-500">
                Tạo lúc: {formatDate(order.createdAt, "dd/MM/yyyy HH:mm")}
                {" · "}
                Cập nhật: {formatDate(order.updatedAt, "dd/MM/yyyy HH:mm")}
                {order.closedAt && (
                  <>
                    {" · "}
                    Đóng lúc:{" "}
                    {formatDate(order.closedAt, "dd/MM/yyyy HH:mm")}
                  </>
                )}
              </p>
              <p className="mt-3 text-xs text-zinc-400">
                Audit timeline đầy đủ (CREATE / UPDATE / TRANSITION) sẽ reuse
                component `AuditTimeline` ở Phase B4.
              </p>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      <ExplodeSnapshotDialog
        open={explodeOpen}
        onOpenChange={setExplodeOpen}
        orderCode={order.orderNo}
        orderQty={Number(order.orderQty)}
        bomTemplateId={order.bomTemplateId}
      />

      {transitionRow && (
        <TransitionStateDialog
          open={!!transitionRow}
          onOpenChange={(v) => {
            if (!v) setTransitionRow(null);
          }}
          lineId={transitionRow.id}
          orderCode={order.orderNo}
          currentState={transitionRow.state}
          versionLock={transitionRow.versionLock}
          componentSku={transitionRow.componentSku}
          componentName={transitionRow.componentName}
          isAdmin={isAdmin}
        />
      )}

      <Dialog open={closeDialogOpen} onOpenChange={setCloseDialogOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>Đóng đơn hàng {order.orderNo}?</DialogTitle>
            <DialogDescription>
              Nhập lý do đóng để lưu vào audit log. Sau khi đóng chỉ admin mới
              mở lại được.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="close-reason" uppercase required>
              Lý do đóng
            </Label>
            <Textarea
              id="close-reason"
              rows={3}
              autoFocus
              placeholder="VD: Đã giao hàng đầy đủ, khách xác nhận."
              value={closeReason}
              onChange={(e) => setCloseReason(e.target.value)}
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setCloseDialogOpen(false)}
              disabled={closeOrder.isPending}
            >
              Huỷ
            </Button>
            <Button
              onClick={() => void handleClose()}
              disabled={
                closeOrder.isPending || closeReason.trim().length < 3
              }
            >
              {closeOrder.isPending ? "Đang đóng..." : "Đóng đơn"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Snapshot summary header — 1 badge mỗi state (count > 0) + quick click filter.
 */
function SnapshotSummaryHeader({
  summary,
  total,
  selectedStates,
  onClick,
  onRefresh,
}: {
  summary: { state: BomSnapshotState; count: number }[];
  total: number;
  selectedStates: BomSnapshotState[];
  onClick: (s: BomSnapshotState) => void;
  onRefresh: () => void;
}) {
  const map = new Map(summary.map((s) => [s.state, s.count]));
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-zinc-200 bg-white px-4 py-2.5">
      <span className="text-xs uppercase tracking-wider text-zinc-500">
        Tổng: <span className="text-zinc-900">{total}</span>
      </span>
      <div className="flex flex-wrap gap-1.5">
        {BOM_SNAPSHOT_STATES.map((s) => {
          const count = map.get(s) ?? 0;
          if (count === 0) return null;
          const active = selectedStates.includes(s);
          const tone = BOM_SNAPSHOT_STATE_TONES[s];
          const toneClass =
            tone === "success"
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : tone === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-700"
                : tone === "danger"
                  ? "border-red-200 bg-red-50 text-red-700"
                  : tone === "info"
                    ? "border-blue-200 bg-blue-50 text-blue-700"
                    : tone === "shortage"
                      ? "border-orange-200 bg-orange-50 text-orange-700"
                      : "border-zinc-200 bg-zinc-100 text-zinc-700";
          return (
            <button
              type="button"
              key={s}
              onClick={() => onClick(s)}
              className={cn(
                "inline-flex h-6 items-center gap-1 rounded-sm border px-2 text-xs font-medium transition-colors",
                toneClass,
                active && "ring-2 ring-blue-500 ring-offset-1",
              )}
              aria-pressed={active}
              title={`Filter ${BOM_SNAPSHOT_STATE_LABELS[s]}`}
            >
              <span>{BOM_SNAPSHOT_STATE_LABELS[s]}</span>
              <span className="tabular-nums">{count}</span>
            </button>
          );
        })}
      </div>
      <Button
        variant="ghost"
        size="sm"
        onClick={onRefresh}
        className="ml-auto text-xs"
        title="Explode lại (nếu cần refresh)"
      >
        <Zap className="h-3.5 w-3.5" aria-hidden="true" />
        Explode...
      </Button>
    </div>
  );
}
