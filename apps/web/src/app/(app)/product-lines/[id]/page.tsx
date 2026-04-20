"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  Archive,
  ClipboardList,
  Edit2,
  FolderKanban,
  LayoutGrid,
  Loader2,
  Package,
  Plus,
  ShoppingCart,
  Trash2,
  Wrench,
} from "lucide-react";
import { toast } from "sonner";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge, type BadgeStatus } from "@/components/domain/StatusBadge";
import { formatDate, formatNumber } from "@/lib/format";
import {
  useProductLineDetail,
  useProductLineMembers,
  useProductLineOrders,
  useProductLineWorkOrders,
  useProductLinePurchaseOrders,
  useRemoveProductLineMember,
  useUpdateProductLine,
} from "@/hooks/useProductLines";
import { useBomList } from "@/hooks/useBom";
import { cn } from "@/lib/utils";

const BOM_STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Hoạt động",
  DRAFT: "Nháp",
  OBSOLETE: "Ngừng dùng",
};

const ORDER_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  CONFIRMED: "Đã xác nhận",
  SNAPSHOTTED: "Đã chụp",
  IN_PROGRESS: "Đang SX",
  FULFILLED: "Hoàn thành",
  CLOSED: "Đóng",
  CANCELLED: "Huỷ",
};

const WO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  QUEUED: "Chờ",
  RELEASED: "Phát lệnh",
  IN_PROGRESS: "Đang SX",
  PAUSED: "Tạm dừng",
  COMPLETED: "Hoàn thành",
  CANCELLED: "Huỷ",
};

const PO_STATUS_LABEL: Record<string, string> = {
  DRAFT: "Nháp",
  SENT: "Đã gửi NCC",
  PARTIAL: "Nhận một phần",
  RECEIVED: "Đã nhận",
  CANCELLED: "Huỷ",
  CLOSED: "Đóng",
};

function statusToBadge(status: string): BadgeStatus {
  const map: Record<string, BadgeStatus> = {
    ACTIVE: "success", RELEASED: "success", COMPLETED: "success",
    RECEIVED: "success", FULFILLED: "success",
    IN_PROGRESS: "info", PARTIAL: "info", SNAPSHOTTED: "info",
    DRAFT: "neutral", QUEUED: "neutral", PAUSED: "neutral",
    CANCELLED: "danger", OBSOLETE: "danger",
    CONFIRMED: "warning", SENT: "warning",
  };
  return map[status] ?? "neutral";
}

/**
 * V1.5 Trụ cột 3 — Product Line Workspace.
 *
 * Hub kết nối mọi thứ xung quanh 1 dòng sản phẩm:
 * Mã Z (BOM) → Đơn hàng → Mua sắm → Sản xuất.
 */
export default function ProductLineDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const detailQuery = useProductLineDetail(id);
  const membersQuery = useProductLineMembers(id);
  const ordersQuery = useProductLineOrders(id);
  const woQuery = useProductLineWorkOrders(id);
  const poQuery = useProductLinePurchaseOrders(id);
  const removeMember = useRemoveProductLineMember(id);
  const updateMutation = useUpdateProductLine(id);

  const [addBomOpen, setAddBomOpen] = React.useState(false);
  const [bomSearch, setBomSearch] = React.useState("");
  const bomListQuery = useBomList({
    q: bomSearch || undefined,
    page: 1,
    pageSize: 20,
    status: ["ACTIVE"],
  });

  const pl = detailQuery.data?.data;
  const members = membersQuery.data?.data ?? [];
  const orders = (ordersQuery.data?.data ?? []) as Array<Record<string, unknown>>;
  const workOrders = (woQuery.data?.data ?? []) as Array<Record<string, unknown>>;
  const purchaseOrders = (poQuery.data?.data ?? []) as Array<Record<string, unknown>>;

  const handleArchive = async () => {
    if (!pl) return;
    try {
      await updateMutation.mutateAsync({ status: "ARCHIVED" });
      toast.success("Đã lưu trữ dòng sản phẩm.");
    } catch {
      toast.error("Lưu trữ thất bại.");
    }
  };

  const handleRestore = async () => {
    if (!pl) return;
    try {
      await updateMutation.mutateAsync({ status: "ACTIVE" });
      toast.success("Đã khôi phục dòng sản phẩm.");
    } catch {
      toast.error("Khôi phục thất bại.");
    }
  };

  const handleRemoveBom = async (bomId: string, bomCode: string) => {
    try {
      await removeMember.mutateAsync(bomId);
      toast.success(`Đã xoá ${bomCode} khỏi dòng sản phẩm.`);
    } catch {
      toast.error("Xoá thất bại.");
    }
  };

  if (detailQuery.isLoading) {
    return (
      <div className="mx-auto max-w-5xl px-6 py-8">
        <Skeleton className="mb-2 h-4 w-48" />
        <Skeleton className="mb-4 h-7 w-64" />
        <Skeleton className="h-80 w-full rounded-lg" />
      </div>
    );
  }

  if (!pl) {
    return (
      <div className="flex h-full items-center justify-center">
        <EmptyState
          preset="no-filter-match"
          title="Không tìm thấy dòng sản phẩm"
          actions={
            <Button asChild variant="ghost" size="sm">
              <Link href="/product-lines">Quay lại danh sách</Link>
            </Button>
          }
        />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Header */}
      <header className="border-b border-zinc-200 bg-white px-6 py-4">
        <Breadcrumb
          items={[
            { label: "Dòng sản phẩm", href: "/product-lines" },
            { label: pl.code },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <FolderKanban className="h-5 w-5" aria-hidden />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
                  {pl.name}
                </h1>
                <StatusBadge
                  status={pl.status === "ACTIVE" ? "success" : "neutral"}
                  label={pl.status === "ACTIVE" ? "Hoạt động" : "Lưu trữ"}
                  size="sm"
                />
              </div>
              <p className="mt-0.5 text-xs text-zinc-500">
                <span className="font-mono font-medium text-zinc-700">
                  {pl.code}
                </span>
                {pl.description ? ` · ${pl.description}` : ""}
                {" · "}
                <span className="tabular-nums">{members.length}</span> mã Z ·{" "}
                cập nhật {formatDate(pl.updatedAt, "dd/MM/yyyy HH:mm")}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {pl.status === "ACTIVE" ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleArchive()}
                disabled={updateMutation.isPending}
              >
                <Archive className="h-3.5 w-3.5" />
                Lưu trữ
              </Button>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void handleRestore()}
                disabled={updateMutation.isPending}
              >
                Khôi phục
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* KPI summary bar */}
      <div className="flex items-center gap-6 border-b border-zinc-100 bg-zinc-50/60 px-6 py-2">
        <KpiChip icon={<LayoutGrid className="h-3.5 w-3.5" />} label="Mã Z" value={members.length} />
        <KpiChip icon={<ClipboardList className="h-3.5 w-3.5" />} label="Đơn hàng" value={orders.length} />
        <KpiChip icon={<ShoppingCart className="h-3.5 w-3.5" />} label="PO" value={purchaseOrders.length} />
        <KpiChip icon={<Wrench className="h-3.5 w-3.5" />} label="Lệnh SX" value={workOrders.length} />
      </div>

      {/* Tabs */}
      <div className="flex-1 overflow-auto">
        <Tabs defaultValue="bom" className="flex h-full flex-col">
          <TabsList className="h-9 w-full justify-start rounded-none border-b border-zinc-200 bg-white px-6">
            <TabsTrigger value="bom" className="gap-1.5 text-xs">
              <LayoutGrid className="h-3.5 w-3.5" />
              Mã Z ({members.length})
            </TabsTrigger>
            <TabsTrigger value="orders" className="gap-1.5 text-xs">
              <ClipboardList className="h-3.5 w-3.5" />
              Đơn hàng ({orders.length})
            </TabsTrigger>
            <TabsTrigger value="procurement" className="gap-1.5 text-xs">
              <ShoppingCart className="h-3.5 w-3.5" />
              Mua sắm ({purchaseOrders.length})
            </TabsTrigger>
            <TabsTrigger value="production" className="gap-1.5 text-xs">
              <Wrench className="h-3.5 w-3.5" />
              Sản xuất ({workOrders.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Tab: Mã Z ───────────────────────────────────────── */}
          <TabsContent value="bom" className="flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">
                BOM Templates trong dòng sản phẩm này
              </p>
              <Button
                size="sm"
                variant="outline"
                onClick={() => setAddBomOpen(!addBomOpen)}
              >
                <Plus className="h-3.5 w-3.5" />
                Thêm mã Z
              </Button>
            </div>

            {/* Inline BOM picker */}
            {addBomOpen && (
              <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
                <p className="mb-2 text-xs font-medium text-blue-700">
                  Tìm BOM để thêm vào dòng sản phẩm
                </p>
                <input
                  autoFocus
                  type="search"
                  value={bomSearch}
                  onChange={(e) => setBomSearch(e.target.value)}
                  placeholder="Tìm theo mã Z hoặc tên BOM…"
                  className="h-8 w-full rounded-md border border-blue-200 bg-white px-3 text-sm placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none"
                />
                <div className="mt-2 max-h-48 overflow-y-auto">
                  {bomListQuery.data?.data.map((bom) => {
                    const alreadyAdded = members.some((m) => m.bomId === bom.id);
                    return (
                      <div
                        key={bom.id}
                        className="flex items-center justify-between rounded-md px-2 py-1.5 hover:bg-blue-100"
                      >
                        <div>
                          <span className="font-mono text-xs font-semibold text-zinc-900">
                            {bom.code}
                          </span>
                          <span className="ml-2 text-xs text-zinc-600">
                            {bom.name}
                          </span>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-xs text-zinc-400">Đã có</span>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 text-xs"
                            onClick={() => {
                              void (async () => {
                                const res = await fetch(
                                  `/api/product-lines/${id}/members`,
                                  {
                                    method: "POST",
                                    headers: { "Content-Type": "application/json" },
                                    body: JSON.stringify({ bomTemplateId: bom.id }),
                                  },
                                );
                                if (res.ok) {
                                  toast.success(`Đã thêm ${bom.code}.`);
                                  void membersQuery.refetch();
                                  setBomSearch("");
                                  setAddBomOpen(false);
                                } else {
                                  toast.error("Thêm thất bại.");
                                }
                              })();
                            }}
                          >
                            Thêm
                          </Button>
                        )}
                      </div>
                    );
                  })}
                  {bomListQuery.data?.data.length === 0 && (
                    <p className="py-4 text-center text-xs text-zinc-400">
                      {bomSearch ? `Không tìm thấy "${bomSearch}"` : "Gõ để tìm…"}
                    </p>
                  )}
                </div>
              </div>
            )}

            {membersQuery.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : members.length === 0 ? (
              <EmptyState
                preset="no-bom"
                title="Chưa có mã Z nào"
                description='Click "Thêm mã Z" để thêm BOM Template vào dòng sản phẩm.'
              />
            ) : (
              <div className="divide-y divide-zinc-100 rounded-lg border border-zinc-200 bg-white">
                {members.map((m) => (
                  <div
                    key={m.memberId}
                    className="flex items-center gap-3 px-4 py-3"
                  >
                    <div className="flex h-7 w-7 items-center justify-center rounded bg-zinc-100 text-zinc-500">
                      <Package className="h-3.5 w-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-semibold text-zinc-900">
                          {m.bomCode}
                        </span>
                        <StatusBadge
                          status={statusToBadge(m.bomStatus)}
                          label={BOM_STATUS_LABEL[m.bomStatus] ?? m.bomStatus}
                          size="sm"
                        />
                      </div>
                      <p className="truncate text-xs text-zinc-600">{m.bomName}</p>
                    </div>
                    <div className="hidden text-right sm:block">
                      <p className="text-xs text-zinc-500">
                        {m.componentCount} linh kiện
                      </p>
                      {m.parentItemSku && (
                        <p className="font-mono text-xs text-zinc-400">
                          {m.parentItemSku}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0 text-emerald-600">
                        <Link href={`/bom/${m.bomId}/grid`} title="Mở Grid Editor">
                          <LayoutGrid className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button asChild size="sm" variant="ghost" className="h-7 w-7 p-0">
                        <Link href={`/bom/${m.bomId}`} title="Xem BOM">
                          <Edit2 className="h-3.5 w-3.5" />
                        </Link>
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 w-7 p-0 text-red-500 hover:text-red-600"
                        title="Xoá khỏi dòng sản phẩm"
                        onClick={() => void handleRemoveBom(m.bomId, m.bomCode)}
                        disabled={removeMember.isPending}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>

          {/* ── Tab: Đơn hàng ──────────────────────────────────── */}
          <TabsContent value="orders" className="flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">
                Đơn hàng liên quan đến các BOM trong dòng sản phẩm
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/orders/new">
                  <Plus className="h-3.5 w-3.5" />
                  Tạo đơn
                </Link>
              </Button>
            </div>
            {ordersQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : orders.length === 0 ? (
              <EmptyState
                preset="no-filter-match"
                title="Chưa có đơn hàng nào"
                description="Đơn hàng sẽ hiển thị ở đây khi được liên kết với BOM trong dòng sản phẩm."
              />
            ) : (
              <RelatedTable
                columns={["Mã đơn", "Khách hàng", "Trạng thái", "Hạn giao", "Ngày tạo"]}
                rows={orders.map((o) => ({
                  id: String(o.id),
                  href: `/orders/${String(o.code)}`,
                  cells: [
                    <span key="code" className="font-mono text-xs font-semibold">{String(o.code)}</span>,
                    <span key="cust" className="text-xs">{String(o.customer ?? "—")}</span>,
                    <StatusBadge key="st" status={statusToBadge(String(o.status))} label={ORDER_STATUS_LABEL[String(o.status)] ?? String(o.status)} size="sm" />,
                    <span key="due" className="text-xs tabular-nums">{o.dueDate ? formatDate(String(o.dueDate), "dd/MM/yyyy") : "—"}</span>,
                    <span key="ca" className="text-xs text-zinc-400">{formatDate(String(o.createdAt), "dd/MM/yyyy")}</span>,
                  ],
                }))}
              />
            )}
          </TabsContent>

          {/* ── Tab: Mua sắm ──────────────────────────────────── */}
          <TabsContent value="procurement" className="flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">
                Đặt hàng NCC liên quan đến linh kiện trong dòng sản phẩm
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/procurement/purchase-orders">
                  Xem tất cả PO
                </Link>
              </Button>
            </div>
            {poQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : purchaseOrders.length === 0 ? (
              <EmptyState
                preset="no-filter-match"
                title="Chưa có PO liên quan"
                description="PO sẽ tự động hiển thị khi linh kiện BOM trong dòng sản phẩm được đặt hàng."
              />
            ) : (
              <RelatedTable
                columns={["Mã PO", "Trạng thái", "Tổng tiền", "Hạn giao", "Ngày tạo"]}
                rows={purchaseOrders.map((po) => ({
                  id: String(po.id),
                  href: `/procurement/purchase-orders/${String(po.id)}`,
                  cells: [
                    <span key="code" className="font-mono text-xs font-semibold">{String(po.code)}</span>,
                    <StatusBadge key="st" status={statusToBadge(String(po.status))} label={PO_STATUS_LABEL[String(po.status)] ?? String(po.status)} size="sm" />,
                    <span key="amt" className="text-xs tabular-nums">{po.totalAmount ? formatNumber(Number(po.totalAmount)) + " ₫" : "—"}</span>,
                    <span key="exp" className="text-xs">{po.expectedDelivery ? formatDate(String(po.expectedDelivery), "dd/MM/yyyy") : "—"}</span>,
                    <span key="ca" className="text-xs text-zinc-400">{formatDate(String(po.createdAt), "dd/MM/yyyy")}</span>,
                  ],
                }))}
              />
            )}
          </TabsContent>

          {/* ── Tab: Sản xuất ─────────────────────────────────── */}
          <TabsContent value="production" className="flex-1 overflow-auto p-4">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-medium text-zinc-700">
                Lệnh sản xuất liên quan đến dòng sản phẩm
              </p>
              <Button asChild size="sm" variant="outline">
                <Link href="/work-orders">
                  Xem tất cả WO
                </Link>
              </Button>
            </div>
            {woQuery.isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : workOrders.length === 0 ? (
              <EmptyState
                preset="no-filter-match"
                title="Chưa có lệnh sản xuất"
                description="WO sẽ hiển thị khi được liên kết với đơn hàng của dòng sản phẩm."
              />
            ) : (
              <RelatedTable
                columns={["Mã WO", "Trạng thái", "Ưu tiên", "Bắt đầu kế hoạch", "Kết thúc kế hoạch"]}
                rows={workOrders.map((wo) => ({
                  id: String(wo.id),
                  href: `/work-orders/${String(wo.id)}`,
                  cells: [
                    <span key="code" className="font-mono text-xs font-semibold">{String(wo.code)}</span>,
                    <StatusBadge key="st" status={statusToBadge(String(wo.status))} label={WO_STATUS_LABEL[String(wo.status)] ?? String(wo.status)} size="sm" />,
                    <span key="pri" className="text-xs capitalize">{String(wo.priority ?? "—")}</span>,
                    <span key="ps" className="text-xs">{wo.plannedStart ? formatDate(String(wo.plannedStart), "dd/MM/yyyy") : "—"}</span>,
                    <span key="pe" className="text-xs">{wo.plannedEnd ? formatDate(String(wo.plannedEnd), "dd/MM/yyyy") : "—"}</span>,
                  ],
                }))}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ── Shared sub-components ──────────────────────────────────────────────────────

function KpiChip({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-xs text-zinc-600">
      <span className="text-zinc-400">{icon}</span>
      <span className="tabular-nums font-semibold text-zinc-900">{value}</span>
      <span>{label}</span>
    </div>
  );
}

function RelatedTable({
  columns,
  rows,
}: {
  columns: string[];
  rows: Array<{
    id: string;
    href: string;
    cells: React.ReactNode[];
  }>;
}) {
  return (
    <div className="overflow-hidden rounded-lg border border-zinc-200">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-zinc-200 bg-zinc-50">
            {columns.map((c) => (
              <th
                key={c}
                className="px-4 py-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500"
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {rows.map((row) => (
            <Link key={row.id} href={row.href} className="contents">
              <tr className="cursor-pointer hover:bg-zinc-50">
                {row.cells.map((cell, i) => (
                  <td key={i} className="px-4 py-2.5">
                    {cell}
                  </td>
                ))}
              </tr>
            </Link>
          ))}
        </tbody>
      </table>
    </div>
  );
}
