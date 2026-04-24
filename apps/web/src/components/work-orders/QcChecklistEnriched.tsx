"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  Plus,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  CHECKPOINT_LABEL,
  useCreateQcCheck,
  useDeleteQcCheck,
  useQcChecks,
  type QcCheckRow,
  type QcCheckpoint,
} from "@/hooks/useQcChecks";
import {
  useBulkCreateQcItems,
  useDeleteQcItem,
  useQcCheckItems,
  useUpdateQcItem,
  type QcCheckItemResult,
  type QcCheckItemRow,
  type QcCheckItemType,
} from "@/hooks/useWorkOrders";
import { cn } from "@/lib/utils";

/**
 * V1.9-P4 — QC Checklist enriched.
 *
 * 3 stage tab (PRE_ASSEMBLY / MID_PRODUCTION / PRE_FG) — mỗi stage có
 * N check items (description, expected, actual, result, defect, photo).
 * Bulk actions: mark all pass / all NA. Hoàn tất stage = set parent qc_check.
 */

const CHECKPOINT_ORDER: QcCheckpoint[] = [
  "PRE_ASSEMBLY",
  "MID_PRODUCTION",
  "PRE_FG",
];

const RESULT_TONE: Record<QcCheckItemResult, string> = {
  PENDING: "bg-amber-50 text-amber-700 border-amber-200",
  PASS: "bg-emerald-50 text-emerald-700 border-emerald-200",
  FAIL: "bg-red-50 text-red-700 border-red-200",
  NA: "bg-zinc-50 text-zinc-600 border-zinc-200",
};

const RESULT_LABEL: Record<QcCheckItemResult, string> = {
  PENDING: "Chờ",
  PASS: "Đạt",
  FAIL: "Lỗi",
  NA: "N/A",
};

export function QcChecklistEnriched({
  woId,
  canEdit,
  isAdmin,
  woStatus,
}: {
  woId: string;
  canEdit: boolean;
  isAdmin: boolean;
  woStatus: string;
}) {
  const shouldSeed = woStatus === "IN_PROGRESS" || woStatus === "PAUSED";
  const query = useQcChecks(woId, shouldSeed);
  const createCheckMut = useCreateQcCheck(woId);
  const deleteCheckMut = useDeleteQcCheck(woId);
  const [activeStage, setActiveStage] =
    React.useState<QcCheckpoint>("PRE_ASSEMBLY");

  const checks = query.data?.data ?? [];

  // Lấy qc_check của stage active (nếu có) — trường hợp nhiều row cùng stage
  // thì lấy mới nhất.
  const checkForStage = React.useMemo(() => {
    const list = checks.filter((c) => c.checkpoint === activeStage);
    if (list.length === 0) return null;
    return list[list.length - 1] as QcCheckRow;
  }, [checks, activeStage]);

  const ensureStageCheck = async () => {
    if (checkForStage) return checkForStage;
    const res = await createCheckMut.mutateAsync({
      woId,
      checkpointName: CHECKPOINT_LABEL[activeStage],
      checkpoint: activeStage,
    });
    return res.data;
  };

  if (query.isLoading) {
    return (
      <div className="space-y-3">
        {[...Array(3)].map((_, i) => (
          <Skeleton key={i} className="h-24 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Stage tabs */}
      <div className="flex gap-1 rounded-md border border-zinc-200 bg-zinc-50 p-1">
        {CHECKPOINT_ORDER.map((cp) => {
          const existingCheck = checks.find((c) => c.checkpoint === cp);
          const active = cp === activeStage;
          return (
            <button
              key={cp}
              type="button"
              onClick={() => setActiveStage(cp)}
              className={cn(
                "flex-1 rounded px-3 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              <div className="flex items-center justify-center gap-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                {CHECKPOINT_LABEL[cp]}
                {existingCheck?.result && (
                  <Badge
                    variant={
                      existingCheck.result === "PASS"
                        ? "success"
                        : existingCheck.result === "FAIL"
                          ? "danger"
                          : "neutral"
                    }
                    className="text-[10px]"
                  >
                    {existingCheck.result}
                  </Badge>
                )}
              </div>
            </button>
          );
        })}
      </div>

      <QcStagePanel
        woId={woId}
        stage={activeStage}
        parentCheck={checkForStage}
        canEdit={canEdit}
        isAdmin={isAdmin}
        ensureCheck={ensureStageCheck}
        onDeleteStage={async () => {
          if (!checkForStage) return;
          if (!confirm(`Xóa cả stage ${CHECKPOINT_LABEL[activeStage]}?`)) return;
          try {
            await deleteCheckMut.mutateAsync(checkForStage.id);
            toast.success("Đã xóa stage.");
          } catch (e) {
            toast.error((e as Error).message);
          }
        }}
      />
    </div>
  );
}

function QcStagePanel({
  woId: _woId,
  stage,
  parentCheck,
  canEdit,
  isAdmin,
  ensureCheck,
  onDeleteStage,
}: {
  woId: string;
  stage: QcCheckpoint;
  parentCheck: QcCheckRow | null;
  canEdit: boolean;
  isAdmin: boolean;
  ensureCheck: () => Promise<QcCheckRow>;
  onDeleteStage: () => Promise<void>;
}) {
  const checkId = parentCheck?.id ?? null;
  const itemsQuery = useQcCheckItems(checkId);
  const bulkCreateMut = useBulkCreateQcItems(checkId ?? "");
  const updateItemMut = useUpdateQcItem(checkId ?? "");
  const deleteItemMut = useDeleteQcItem(checkId ?? "");

  const [newItemText, setNewItemText] = React.useState("");
  const [newItemExpected, setNewItemExpected] = React.useState("");
  const [newItemType, setNewItemType] =
    React.useState<QcCheckItemType>("BOOLEAN");

  const items = itemsQuery.data?.data ?? [];
  const total = items.length;
  const pass = items.filter((i) => i.result === "PASS").length;
  const fail = items.filter((i) => i.result === "FAIL").length;
  const pending = items.filter((i) => i.result === "PENDING").length;
  const passRate = total > 0 ? Math.round((pass / total) * 100) : 0;
  const defectItems = items.filter((i) => i.result === "FAIL");

  const onAddItem = async () => {
    if (!newItemText.trim()) {
      toast.error("Nhập mô tả check.");
      return;
    }
    try {
      // ensure qc_check exists
      const parent = parentCheck ?? (await ensureCheck());
      const targetCheckId = parent.id;
      // create via API
      const res = await fetch(`/api/qc-checks/${targetCheckId}/items`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              description: newItemText.trim(),
              checkType: newItemType,
              expectedValue: newItemExpected.trim() || null,
            },
          ],
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? "Lỗi thêm item.");
      }
      setNewItemText("");
      setNewItemExpected("");
      toast.success("Đã thêm item.");
      // refetch
      await itemsQuery.refetch();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const bulkMark = async (result: QcCheckItemResult) => {
    if (!checkId) return;
    try {
      await Promise.all(
        items
          .filter((i) => i.result === "PENDING")
          .map((i) => updateItemMut.mutateAsync({ id: i.id, result })),
      );
      toast.success(`Đã đánh dấu ${RESULT_LABEL[result]}.`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <div className="space-y-3">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <KpiBox label="Tổng" value={total} tone="zinc" />
        <KpiBox label="Đạt" value={pass} tone="emerald" />
        <KpiBox label="Lỗi" value={fail} tone="red" />
        <KpiBox label="Chờ" value={pending} tone="amber" />
        <KpiBox
          label="Pass rate"
          value={`${passRate}%`}
          tone={passRate === 100 ? "emerald" : passRate >= 80 ? "zinc" : "amber"}
        />
      </div>

      {/* Defect summary */}
      {defectItems.length > 0 && (
        <div className="rounded-md border border-red-200 bg-red-50/50 p-3">
          <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-red-800">
            <AlertTriangle className="h-3.5 w-3.5" />
            {defectItems.length} lỗi phát hiện — cần xử lý
          </div>
          <ul className="space-y-1 text-xs text-red-900">
            {defectItems.slice(0, 5).map((d) => (
              <li key={d.id}>
                · {d.description}
                {d.defectReason ? ` — ${d.defectReason}` : ""}
              </li>
            ))}
          </ul>
          <div className="mt-2">
            <a
              href="/eco"
              className="text-xs font-semibold text-indigo-700 underline"
            >
              Tạo ECO / Rework request
            </a>
          </div>
        </div>
      )}

      {/* Add item form */}
      {canEdit && (
        <div className="rounded-md border border-indigo-200 bg-indigo-50/30 p-3">
          <div className="mb-2 text-xs font-semibold text-indigo-800">
            Thêm checklist item
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-6">
            <div className="sm:col-span-3">
              <Input
                value={newItemText}
                onChange={(e) => setNewItemText(e.target.value)}
                className="h-8 text-sm"
                placeholder="VD: Kiểm tra đường kính Ø120"
              />
            </div>
            <div>
              <select
                value={newItemType}
                onChange={(e) =>
                  setNewItemType(e.target.value as QcCheckItemType)
                }
                className="h-8 w-full rounded-md border border-zinc-300 bg-white px-2 text-xs"
              >
                <option value="BOOLEAN">Boolean</option>
                <option value="MEASUREMENT">Đo đạc</option>
                <option value="VISUAL">Thị giác</option>
              </select>
            </div>
            <div>
              <Input
                value={newItemExpected}
                onChange={(e) => setNewItemExpected(e.target.value)}
                className="h-8 font-mono text-xs"
                placeholder="Giá trị kỳ vọng"
              />
            </div>
            <Button
              size="sm"
              onClick={onAddItem}
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={bulkCreateMut.isPending}
            >
              <Plus className="h-3.5 w-3.5" />
              Thêm
            </Button>
          </div>
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="sm"
              variant="ghost"
              onClick={() => bulkMark("PASS")}
              disabled={pending === 0}
              className="h-7 text-[11px]"
            >
              Mark all pass
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => bulkMark("NA")}
              disabled={pending === 0}
              className="h-7 text-[11px]"
            >
              Mark all N/A
            </Button>
          </div>
        </div>
      )}

      {/* Items table */}
      <div className="overflow-hidden rounded-md border border-zinc-200 bg-white">
        {itemsQuery.isLoading ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            Đang tải...
          </div>
        ) : items.length === 0 ? (
          <div className="p-6 text-center text-xs text-zinc-500">
            Chưa có checklist item cho stage này.
            {canEdit && " Thêm mới bên trên."}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-xs uppercase text-zinc-500">
              <tr>
                <th className="px-2 py-2 text-left w-10">#</th>
                <th className="px-2 py-2 text-left">Check</th>
                <th className="px-2 py-2 text-left">Expected</th>
                <th className="px-2 py-2 text-left">Actual</th>
                <th className="px-2 py-2 text-left">Kết quả</th>
                <th className="px-2 py-2 text-left">Lỗi</th>
                {canEdit && <th className="px-2 py-2 w-10" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {items.map((it, idx) => (
                <ItemRow
                  key={it.id}
                  idx={idx + 1}
                  item={it}
                  canEdit={canEdit}
                  isAdmin={isAdmin}
                  onUpdate={(patch) =>
                    updateItemMut.mutateAsync({ id: it.id, ...patch })
                  }
                  onDelete={async () => {
                    if (!confirm("Xóa item này?")) return;
                    await deleteItemMut.mutateAsync(it.id);
                  }}
                />
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Stage footer actions */}
      {parentCheck && isAdmin && (
        <div className="flex items-center justify-end gap-2 border-t border-zinc-200 pt-3">
          <Button
            size="sm"
            variant="ghost"
            onClick={onDeleteStage}
            className="text-red-600 hover:text-red-700"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Xóa stage
          </Button>
        </div>
      )}
    </div>
  );
}

function KpiBox({
  label,
  value,
  tone,
}: {
  label: string;
  value: number | string;
  tone: "zinc" | "emerald" | "red" | "amber" | "indigo";
}) {
  const toneClass: Record<string, string> = {
    zinc: "border-zinc-200 bg-white text-zinc-900",
    emerald: "border-emerald-200 bg-emerald-50/60 text-emerald-900",
    red: "border-red-200 bg-red-50/60 text-red-900",
    amber: "border-amber-200 bg-amber-50/60 text-amber-900",
    indigo: "border-indigo-200 bg-indigo-50/60 text-indigo-900",
  };
  return (
    <div className={`rounded-md border p-2 ${toneClass[tone]}`}>
      <div className="text-[10px] font-semibold uppercase tracking-wide opacity-70">
        {label}
      </div>
      <div className="mt-0.5 text-base font-semibold tabular-nums">
        {value}
      </div>
    </div>
  );
}

function ItemRow({
  idx,
  item,
  canEdit,
  isAdmin,
  onUpdate,
  onDelete,
}: {
  idx: number;
  item: QcCheckItemRow;
  canEdit: boolean;
  isAdmin: boolean;
  onUpdate: (patch: {
    actualValue?: string | null;
    result?: QcCheckItemResult;
    defectReason?: string | null;
  }) => Promise<unknown>;
  onDelete: () => Promise<void>;
}) {
  const [actual, setActual] = React.useState(item.actualValue ?? "");
  const [defect, setDefect] = React.useState(item.defectReason ?? "");
  const [result, setResult] = React.useState<QcCheckItemResult>(item.result);

  React.useEffect(() => {
    setActual(item.actualValue ?? "");
    setDefect(item.defectReason ?? "");
    setResult(item.result);
  }, [item.actualValue, item.defectReason, item.result]);

  const commit = async (override?: { result?: QcCheckItemResult }) => {
    try {
      const nextResult = override?.result ?? result;
      await onUpdate({
        actualValue: actual.trim() || null,
        defectReason: defect.trim() || null,
        result: nextResult,
      });
      setResult(nextResult);
      toast.success(`Đã cập nhật: ${RESULT_LABEL[nextResult]}`);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <tr>
      <td className="px-2 py-2 text-xs font-mono text-zinc-500">{idx}</td>
      <td className="px-2 py-2">
        <div className="font-medium text-zinc-900">{item.description}</div>
        <div className="mt-0.5 flex items-center gap-2 text-[10px] text-zinc-500">
          <Badge variant="outline" className="text-[9px]">
            {item.checkType}
          </Badge>
          {item.checkedAt && (
            <span>{new Date(item.checkedAt).toLocaleString("vi-VN")}</span>
          )}
        </div>
      </td>
      <td className="px-2 py-2 font-mono text-xs text-zinc-600">
        {item.expectedValue ?? "—"}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <Input
            value={actual}
            onChange={(e) => setActual(e.target.value)}
            onBlur={() => commit()}
            className="h-7 font-mono text-xs"
            placeholder="—"
          />
        ) : (
          <span className="font-mono text-xs text-zinc-700">
            {item.actualValue ?? "—"}
          </span>
        )}
      </td>
      <td className="px-2 py-2">
        {canEdit ? (
          <div className="flex gap-1">
            {(["PASS", "FAIL", "NA", "PENDING"] as QcCheckItemResult[]).map(
              (r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => commit({ result: r })}
                  className={cn(
                    "h-7 rounded-md border px-2 text-[11px] font-semibold transition-colors",
                    result === r
                      ? RESULT_TONE[r]
                      : "border-zinc-200 bg-white text-zinc-500 hover:bg-zinc-50",
                  )}
                >
                  {RESULT_LABEL[r]}
                </button>
              ),
            )}
          </div>
        ) : (
          <Badge className={RESULT_TONE[result]}>{RESULT_LABEL[result]}</Badge>
        )}
      </td>
      <td className="px-2 py-2">
        {result === "FAIL" ? (
          canEdit ? (
            <Textarea
              value={defect}
              onChange={(e) => setDefect(e.target.value)}
              onBlur={() => commit()}
              className="min-h-[28px] text-xs"
              placeholder="Nguyên nhân lỗi"
              maxLength={1000}
            />
          ) : (
            <span className="text-xs text-red-700">
              {item.defectReason ?? "—"}
            </span>
          )
        ) : (
          <span className="text-xs text-zinc-400">—</span>
        )}
      </td>
      {canEdit && (
        <td className="px-2 py-2 text-right">
          {isAdmin && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onDelete}
              className="h-7 px-2"
            >
              <CheckCircle2 className="sr-only h-3 w-3" />
              <Trash2 className="h-3.5 w-3.5 text-red-500" />
            </Button>
          )}
        </td>
      )}
    </tr>
  );
}
