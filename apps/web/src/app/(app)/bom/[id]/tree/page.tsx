"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ChevronDown,
  FolderTree,
  GitBranch,
  History,
  Info,
  LayoutGrid,
  MoreHorizontal,
  PackageCheck,
  Plus,
  Rocket,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { BOM_STATUS_LABELS, type BomStatus } from "@iot/shared";
import { Breadcrumb } from "@/components/ui/breadcrumb";
import { Button } from "@/components/ui/button";
import { DialogConfirm } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import {
  StatusBadge,
  type BadgeStatus,
} from "@/components/domain/StatusBadge";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { BomTreeView } from "@/components/bom/BomTreeView";
import { BomLineInspector } from "@/components/bom/BomLineInspector";
import { AddBomLineDialog } from "@/components/bom/AddBomLineDialog";
import { DeleteBomLineDialog } from "@/components/bom/DeleteBomLineDialog";
import {
  useBomDetail,
  useBomDerivedStatus,
  useActivityLog,
  useCloneBomTemplate,
  useDeleteBomTemplate,
  useMoveBomLine,
  type BomTreeNodeRaw,
} from "@/hooks/useBom";
import { useBomRevisions } from "@/hooks/useBomRevisions";
import { ReleaseRevisionDialog } from "@/components/bom-revision/ReleaseRevisionDialog";
import { cn } from "@/lib/utils";
import { formatDate, formatNumber } from "@/lib/format";

function bomStatusToBadge(status: BomStatus): {
  badgeStatus: BadgeStatus;
  label: string;
} {
  switch (status) {
    case "ACTIVE":
      return { badgeStatus: "success", label: BOM_STATUS_LABELS.ACTIVE };
    case "DRAFT":
      return { badgeStatus: "draft", label: BOM_STATUS_LABELS.DRAFT };
    case "OBSOLETE":
      return { badgeStatus: "inactive", label: BOM_STATUS_LABELS.OBSOLETE };
  }
}

export default function BomDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params?.id ?? null;

  const query = useBomDetail(id);
  const moveLine = useMoveBomLine(id ?? "");
  const deleteBom = useDeleteBomTemplate();
  const cloneBom = useCloneBomTemplate();
  const derivedStatusQuery = useBomDerivedStatus(id ?? "", !!id);
  const activityLogQuery = useActivityLog("bom_template", id ?? "", !!id);

  const [selectedLineId, setSelectedLineId] = React.useState<string | null>(
    null,
  );
  const [addOpen, setAddOpen] = React.useState(false);
  const [addParentId, setAddParentId] = React.useState<string | null>(null);
  const [addParentLabel, setAddParentLabel] = React.useState<string>("");

  const [deleteOpen, setDeleteOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<BomTreeNodeRaw | null>(
    null,
  );

  const [deleteBomOpen, setDeleteBomOpen] = React.useState(false);
  const [releaseOpen, setReleaseOpen] = React.useState(false);

  const template = query.data?.data?.template;
  const revisionsQuery = useBomRevisions(template?.id ?? null);
  const existingRevisions = revisionsQuery.data?.data ?? [];
  const nextRevisionNoHint = React.useMemo(() => {
    let max = 0;
    for (const r of existingRevisions) {
      const m = /^R(\d+)$/.exec(r.revisionNo);
      if (m?.[1]) {
        const n = Number.parseInt(m[1], 10);
        if (!Number.isNaN(n) && n > max) max = n;
      }
    }
    return `R${(max + 1).toString().padStart(2, "0")}`;
  }, [existingRevisions]);
  const tree = query.data?.data?.tree ?? [];
  const selectedNode = tree.find((n) => n.id === selectedLineId) ?? null;

  const handleMove = (
    lineId: string,
    newParentLineId: string | null,
    newPosition: number,
  ) => {
    moveLine.mutate(
      { lineId, newParentLineId, newPosition },
      {
        onError: (err) => {
          toast.error((err as Error).message ?? "Di chuyển thất bại");
        },
      },
    );
  };

  const handleAddRoot = () => {
    setAddParentId(null);
    setAddParentLabel("");
    setAddOpen(true);
  };

  const handleAddChild = (parentId: string | null) => {
    const parent = tree.find((n) => n.id === parentId);
    setAddParentId(parentId);
    setAddParentLabel(
      parent
        ? `${parent.componentSku ?? ""} — ${parent.componentName ?? ""}`
        : "",
    );
    setAddOpen(true);
  };

  const handleDelete = (lineId: string) => {
    const n = tree.find((x) => x.id === lineId) ?? null;
    if (!n) return;
    setDeleteTarget(n);
    setDeleteOpen(true);
  };

  const descendantCountOf = (lineId: string): number => {
    let count = 0;
    const byParent = new Map<string, BomTreeNodeRaw[]>();
    tree.forEach((n) => {
      const k = n.parentLineId ?? "__root__";
      if (!byParent.has(k)) byParent.set(k, []);
      byParent.get(k)!.push(n);
    });
    const stack = [lineId];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const children = byParent.get(cur) ?? [];
      count += children.length;
      for (const c of children) stack.push(c.id);
    }
    return count;
  };

  const handleCloneBom = async () => {
    if (!template) return;
    const suggested = prompt("Nhập mã BOM mới:", `${template.code}_COPY`);
    if (!suggested) return;
    try {
      const res = await cloneBom.mutateAsync({
        id: template.id,
        data: { newCode: suggested.toUpperCase() },
      });
      toast.success(
        `Đã clone "${res.data.template.code}" với ${res.data.lineCount} lines.`,
      );
      router.push(`/bom/${res.data.template.id}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleDeleteBom = async () => {
    if (!template) return;
    try {
      await deleteBom.mutateAsync(template.id);
      toast.success(`Đã ngừng dùng BOM "${template.code}".`);
      router.push("/bom");
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  if (query.isLoading || !template) {
    return (
      <div className="space-y-3 p-6">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-8 w-96" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <EmptyState
        preset="error"
        title="Không tải được BOM"
        description={(query.error as Error)?.message ?? "Lỗi không xác định"}
        actions={
          <Button asChild variant="ghost" size="sm">
            <Link href="/bom">← Quay lại danh sách</Link>
          </Button>
        }
      />
    );
  }

  const badge = bomStatusToBadge(template.status);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="border-b border-zinc-200 bg-white px-6 py-3">
        <Breadcrumb
          items={[
            { label: "Tổng quan", href: "/" },
            { label: "BOM", href: "/bom" },
            { label: template.code },
          ]}
        />
        <div className="mt-2 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-mono text-base font-medium text-zinc-700">
                {template.code}
              </span>
              <h1 className="truncate text-xl font-semibold tracking-tight text-zinc-900">
                {template.name}
              </h1>
              <StatusBadge
                status={badge.badgeStatus}
                size="sm"
                label={badge.label}
              />
            </div>
            <p className="mt-1 text-xs text-zinc-500">
              {template.parentItemSku ? (
                <>
                  Đầu ra:{" "}
                  <span className="font-mono text-zinc-700">
                    {template.parentItemSku}
                  </span>{" "}
                  · Target {formatNumber(Number(template.targetQty))} ·
                </>
              ) : (
                <>Chưa có parent item ·</>
              )}{" "}
              cập nhật {formatDate(template.updatedAt, "dd/MM/yyyy HH:mm")}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              asChild
              size="sm"
              variant="outline"
              className="border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            >
              <Link href={`/bom/${id}/grid`}>
                <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
                Mở Grid Editor
              </Link>
            </Button>
            {template.status !== "OBSOLETE" && tree.length > 0 && (
              <Button
                size="sm"
                onClick={() => setReleaseOpen(true)}
                title={`Release ${nextRevisionNoHint}`}
              >
                <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                Release {nextRevisionNoHint}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm">
                  <MoreHorizontal
                    className="h-3.5 w-3.5"
                    aria-hidden="true"
                  />
                  Thao tác
                  <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                {template.status !== "OBSOLETE" && tree.length > 0 && (
                  <DropdownMenuItem onClick={() => setReleaseOpen(true)}>
                    <Rocket className="h-3.5 w-3.5" aria-hidden="true" />
                    Release revision {nextRevisionNoHint}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => void handleCloneBom()}>
                  <GitBranch className="h-3.5 w-3.5" aria-hidden="true" />
                  Clone BOM
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="danger"
                  onClick={() => setDeleteBomOpen(true)}
                >
                  <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                  Xoá (ngừng dùng)
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="components" className="flex h-full flex-col">
          <div className="border-b border-zinc-200 bg-white px-6">
            <TabsList className="border-b-0">
              <TabsTrigger value="components">
                <FolderTree className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Linh kiện
              </TabsTrigger>
              <TabsTrigger value="metadata">
                <Info className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Metadata
              </TabsTrigger>
              <TabsTrigger value="material-status">
                <PackageCheck className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Tình trạng vật tư
              </TabsTrigger>
              <TabsTrigger value="activity">
                <History className="mr-1 h-3.5 w-3.5" aria-hidden="true" />
                Lịch sử
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent
            value="components"
            className={cn("m-0 flex flex-1 flex-col overflow-hidden")}
          >
            <div className="flex items-center justify-between border-b border-zinc-100 bg-white px-6 py-2">
              <div className="flex items-center gap-2">
                <Button size="sm" onClick={handleAddRoot}>
                  <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                  Thêm linh kiện
                </Button>
                <span className="text-xs text-zinc-500">
                  {formatNumber(tree.length)} linh kiện · tối đa 5 cấp
                </span>
              </div>
            </div>

            <div className="flex-1 overflow-hidden p-4">
              {tree.length === 0 ? (
                <EmptyState
                  preset="no-data"
                  title="BOM chưa có linh kiện"
                  description="Thêm linh kiện đầu tiên để khởi đầu cây BOM."
                  actions={
                    <Button size="sm" onClick={handleAddRoot}>
                      <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                      Thêm linh kiện đầu tiên
                    </Button>
                  }
                />
              ) : (
                <BomTreeView
                  tree={tree}
                  selectedId={selectedLineId}
                  onSelect={setSelectedLineId}
                  onMove={handleMove}
                  onEdit={(nodeId) => setSelectedLineId(nodeId)}
                  onAdd={(parentId) => handleAddChild(parentId)}
                  onDelete={(nodeId) => handleDelete(nodeId)}
                />
              )}
            </div>
          </TabsContent>

          {/* Material Status tab */}
          <TabsContent value="material-status" className="m-0 overflow-auto p-6">
            <MaterialStatusPanel query={derivedStatusQuery} />
          </TabsContent>

          {/* Activity log tab */}
          <TabsContent value="activity" className="m-0 overflow-auto p-6">
            <ActivityLogPanel query={activityLogQuery} />
          </TabsContent>

          <TabsContent value="metadata" className="m-0 overflow-auto p-6">
            <dl className="max-w-2xl space-y-3 text-base">
              <ReadRow label="Mã BOM" value={template.code} mono />
              <ReadRow label="Tên" value={template.name} />
              <ReadRow
                label="Mô tả"
                value={template.description ?? "—"}
                multiline
              />
              <ReadRow
                label="Parent Item SKU"
                value={template.parentItemSku ?? "—"}
                mono
              />
              <ReadRow
                label="Parent Item Name"
                value={template.parentItemName ?? "—"}
              />
              <ReadRow
                label="Target Qty"
                value={formatNumber(Number(template.targetQty))}
              />
              <ReadRow label="Trạng thái" value={badge.label} />
              <ReadRow
                label="Ngày tạo"
                value={formatDate(template.createdAt, "dd/MM/yyyy HH:mm")}
              />
              <ReadRow
                label="Cập nhật"
                value={formatDate(template.updatedAt, "dd/MM/yyyy HH:mm")}
              />
              <ReadRow label="Người tạo" value={template.createdBy ?? "—"} />
            </dl>
          </TabsContent>
        </Tabs>
      </div>

      {/* Inspector Sheet */}
      <BomLineInspector
        templateId={template.id}
        node={selectedNode}
        onClose={() => setSelectedLineId(null)}
      />

      {/* Add line dialog */}
      <AddBomLineDialog
        templateId={template.id}
        parentLineId={addParentId}
        parentLabel={addParentLabel}
        open={addOpen}
        onOpenChange={setAddOpen}
      />

      {/* Delete line dialog */}
      <DeleteBomLineDialog
        templateId={template.id}
        lineId={deleteTarget?.id ?? null}
        descendantCount={deleteTarget ? descendantCountOf(deleteTarget.id) : 0}
        label={
          deleteTarget
            ? `${deleteTarget.componentSku ?? ""} — ${
                deleteTarget.componentName ?? ""
              }`
            : ""
        }
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
      />

      {/* Release revision dialog */}
      <ReleaseRevisionDialog
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        templateId={template.id}
        templateCode={template.code}
        nextRevisionNoHint={nextRevisionNoHint}
      />

      {/* Delete BOM dialog */}
      <DialogConfirm
        open={deleteBomOpen}
        onOpenChange={setDeleteBomOpen}
        title={`Ngừng dùng BOM "${template.code}"?`}
        description={`BOM sẽ chuyển sang OBSOLETE. Các Work Order đang dùng vẫn giữ snapshot. Gõ "XOA" để xác nhận.`}
        confirmText="XOA"
        actionLabel="Ngừng dùng"
        loading={deleteBom.isPending}
        onConfirm={() => void handleDeleteBom()}
      />
    </div>
  );
}

function ReadRow({
  label,
  value,
  mono,
  multiline,
}: {
  label: string;
  value: string;
  mono?: boolean;
  multiline?: boolean;
}) {
  return (
    <div className="grid grid-cols-[160px_minmax(0,1fr)] items-start gap-3">
      <dt className="text-xs uppercase tracking-wider text-zinc-500">
        {label}
      </dt>
      <dd
        className={cn(
          "text-base text-zinc-900",
          mono && "font-mono text-sm",
          multiline && "whitespace-pre-wrap",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Trụ cột 5 — Material Status Panel
// ─────────────────────────────────────────────────────────

const MATERIAL_STATUS_COLORS: Record<string, string> = {
  NO_ORDERS: "bg-zinc-100 text-zinc-500",
  PLANNED: "bg-yellow-100 text-yellow-700",
  PURCHASING: "bg-blue-100 text-blue-700",
  PARTIAL: "bg-orange-100 text-orange-700",
  AVAILABLE: "bg-emerald-100 text-emerald-700",
  ISSUED: "bg-violet-100 text-violet-700",
};

const MATERIAL_STATUS_LABELS: Record<string, string> = {
  NO_ORDERS: "Chưa có đơn hàng",
  PLANNED: "Chưa mua",
  PURCHASING: "Đang mua",
  PARTIAL: "Nhận một phần",
  AVAILABLE: "Đủ hàng",
  ISSUED: "Đã xuất SX",
};

import type { UseQueryResult } from "@tanstack/react-query";
import type { DerivedStatusSummary, ActivityLogEntry } from "@/hooks/useBom";

function MaterialStatusPanel({
  query,
}: {
  query: UseQueryResult<{ data: DerivedStatusSummary }>;
}) {
  if (query.isLoading) {
    return <p className="text-sm text-zinc-500">Đang tải tình trạng vật tư…</p>;
  }
  if (query.isError) {
    return <p className="text-sm text-red-500">Không tải được tình trạng vật tư.</p>;
  }
  const status = query.data?.data;
  if (!status || status.overallStatus === "NO_ORDERS") {
    return (
      <p className="text-sm text-zinc-500">
        Chưa có đơn hàng nào dùng BOM này. Tình trạng sẽ hiển thị sau khi tạo đơn.
      </p>
    );
  }

  const pct = status.totalComponents > 0
    ? Math.round((status.availableComponents / status.totalComponents) * 100)
    : 0;

  return (
    <div className="max-w-3xl space-y-4">
      <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-white p-4">
        <div className="flex-1">
          <p className="text-xs text-zinc-500">Tổng thể</p>
          <p className="mt-0.5 text-sm font-semibold text-zinc-900">
            {status.availableComponents}/{status.totalComponents} loại đủ hàng
          </p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-zinc-100">
            <div
              className="h-full rounded-full bg-emerald-500 transition-all"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
        <span
          className={cn(
            "rounded-full px-3 py-1 text-xs font-semibold",
            MATERIAL_STATUS_COLORS[status.overallStatus] ?? "bg-zinc-100 text-zinc-600",
          )}
        >
          {MATERIAL_STATUS_LABELS[status.overallStatus] ?? status.overallStatus}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-xs text-zinc-500">
            <th className="pb-2 text-left font-medium">Linh kiện</th>
            <th className="pb-2 text-right font-medium">Cần</th>
            <th className="pb-2 text-right font-medium">Đã nhận</th>
            <th className="pb-2 text-right font-medium">Thiếu</th>
            <th className="pb-2 text-center font-medium">Tình trạng</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-zinc-100">
          {status.componentStatuses.map((c) => (
            <tr key={c.componentItemId}>
              <td className="py-2">
                <p className="font-mono text-xs font-semibold text-zinc-700">{c.componentSku}</p>
                <p className="text-xs text-zinc-500">{c.componentName}</p>
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-700">
                {parseFloat(c.totalRequired).toLocaleString("vi-VN")}
              </td>
              <td className="py-2 text-right tabular-nums text-zinc-700">
                {parseFloat(c.totalReceived).toLocaleString("vi-VN")}
              </td>
              <td className="py-2 text-right tabular-nums text-red-600">
                {parseFloat(c.totalShort) > 0
                  ? parseFloat(c.totalShort).toLocaleString("vi-VN")
                  : "—"}
              </td>
              <td className="py-2 text-center">
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-xs font-medium",
                    MATERIAL_STATUS_COLORS[c.status] ?? "bg-zinc-100 text-zinc-600",
                  )}
                >
                  {MATERIAL_STATUS_LABELS[c.status] ?? c.status}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// Trụ cột 4 — Activity Log Panel
// ─────────────────────────────────────────────────────────

const ACTION_LABELS: Record<string, string> = {
  GRID_SAVE: "Lưu BOM Grid",
  WO_COMPLETED: "Lệnh SX hoàn thành",
  MATERIAL_RECEIVED: "Nhận vật tư",
  CREATE: "Tạo mới",
  UPDATE: "Cập nhật",
};

function ActivityLogPanel({
  query,
}: {
  query: UseQueryResult<{ data: ActivityLogEntry[] }>;
}) {
  if (query.isLoading) {
    return <p className="text-sm text-zinc-500">Đang tải lịch sử…</p>;
  }
  const entries = query.data?.data ?? [];
  if (entries.length === 0) {
    return <p className="text-sm text-zinc-500">Chưa có lịch sử thay đổi.</p>;
  }
  return (
    <ol className="max-w-2xl space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3">
          <div className="mt-1 h-2 w-2 shrink-0 rounded-full bg-zinc-300" />
          <div>
            <p className="text-sm font-medium text-zinc-800">
              {ACTION_LABELS[entry.action] ?? entry.action}
            </p>
            <p className="text-xs text-zinc-400">
              {new Date(entry.at).toLocaleString("vi-VN")}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
