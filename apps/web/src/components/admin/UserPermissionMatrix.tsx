"use client";

import * as React from "react";
import { Loader2, RotateCcw, Save } from "lucide-react";
import { toast } from "sonner";
import type { Role } from "@iot/shared";
import { Button } from "@/components/ui/button";
import {
  useBulkUpdateUserPermissions,
  useUserPermissions,
  type EffectiveSource,
  type OverrideKind,
  type PermissionMatrixRow,
  type RbacActionKey,
  type RbacEntityKey,
  type UpdatePermissionInput,
} from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

/**
 * V1.9 P10 — UI ma trận quyền 14 entity × 6 action cho user detail.
 *
 * Phase 2 redesign: rounded-xl card, sticky header, indigo/emerald palette,
 * tooltip-friendly cells, compact spacing.
 */

const ENTITY_LABELS: Record<RbacEntityKey, string> = {
  item: "Vật tư",
  supplier: "Nhà cung cấp",
  bomTemplate: "BOM List",
  bomRevision: "BOM Revision",
  salesOrder: "Đơn hàng",
  bomSnapshot: "BOM Snapshot",
  pr: "Yêu cầu mua",
  po: "Đơn mua",
  wo: "Lệnh sản xuất",
  reservation: "Giữ kho",
  eco: "ECO",
  audit: "Nhật ký",
  user: "Người dùng",
  session: "Phiên đăng nhập",
};

const ACTION_LABELS: Record<RbacActionKey, string> = {
  create: "Tạo",
  read: "Xem",
  update: "Sửa",
  delete: "Xoá",
  approve: "Duyệt",
  transition: "Chuyển",
};

const ACTIONS: RbacActionKey[] = [
  "create",
  "read",
  "update",
  "delete",
  "approve",
  "transition",
];

interface CellState {
  roleAllowed: boolean;
  override: OverrideKind;
  effectiveAllowed: boolean;
  source: EffectiveSource;
}

type StateMap = Record<string, CellState>;

function keyOf(entity: RbacEntityKey, action: RbacActionKey): string {
  return `${entity}::${action}`;
}

function deriveEffective(
  roleAllowed: boolean,
  override: OverrideKind,
): { effectiveAllowed: boolean; source: EffectiveSource } {
  if (override === "DENY")
    return { effectiveAllowed: false, source: "override-deny" };
  if (roleAllowed) return { effectiveAllowed: true, source: "role" };
  if (override === "GRANT")
    return { effectiveAllowed: true, source: "override-grant" };
  return { effectiveAllowed: false, source: "role" };
}

function nextOverride(current: OverrideKind): OverrideKind {
  if (current === null) return "GRANT";
  if (current === "GRANT") return "DENY";
  return null;
}

interface Props {
  userId: string;
  isSelf?: boolean;
  currentUserRoles?: Role[];
}

export function UserPermissionMatrix({ userId, isSelf = false }: Props) {
  const query = useUserPermissions(userId);
  const bulkMutation = useBulkUpdateUserPermissions(userId);

  const [pending, setPending] = React.useState<Record<string, OverrideKind>>(
    {},
  );

  const initialState = React.useMemo<StateMap>(() => {
    if (!query.data?.data) return {};
    const map: StateMap = {};
    for (const row of query.data.data.matrix as PermissionMatrixRow[]) {
      for (const cell of row.actions) {
        map[keyOf(row.entity, cell.action)] = {
          roleAllowed: cell.roleAllowed,
          override: cell.override,
          effectiveAllowed: cell.effectiveAllowed,
          source: cell.source,
        };
      }
    }
    return map;
  }, [query.data]);

  const dirtyCount = Object.keys(pending).length;

  const getCell = React.useCallback(
    (entity: RbacEntityKey, action: RbacActionKey): CellState => {
      const k = keyOf(entity, action);
      const base = initialState[k] ?? {
        roleAllowed: false,
        override: null,
        effectiveAllowed: false,
        source: "role" as const,
      };
      if (k in pending) {
        const newOverride = pending[k] ?? null;
        const eff = deriveEffective(base.roleAllowed, newOverride);
        return {
          roleAllowed: base.roleAllowed,
          override: newOverride,
          ...eff,
        };
      }
      return base;
    },
    [initialState, pending],
  );

  const toggle = (entity: RbacEntityKey, action: RbacActionKey) => {
    const cell = getCell(entity, action);
    const next = nextOverride(cell.override);

    if (
      isSelf &&
      next === "DENY" &&
      (entity === "user" || entity === "session")
    ) {
      toast.error(
        `Không thể tự thu hồi ${ENTITY_LABELS[entity]}.${ACTION_LABELS[action]} của chính mình (tránh lockout).`,
      );
      return;
    }

    const k = keyOf(entity, action);
    const original = initialState[k]?.override ?? null;
    setPending((prev) => {
      const copy = { ...prev };
      if (next === original) {
        delete copy[k];
      } else {
        copy[k] = next;
      }
      return copy;
    });
  };

  const reset = () => {
    setPending({});
  };

  const save = async () => {
    const patches: UpdatePermissionInput[] = Object.entries(pending).map(
      ([k, override]) => {
        const [entity, action] = k.split("::") as [
          RbacEntityKey,
          RbacActionKey,
        ];
        return {
          entity,
          action,
          granted:
            override === "GRANT"
              ? true
              : override === "DENY"
                ? false
                : null,
        };
      },
    );
    if (patches.length === 0) return;
    try {
      const result = await bulkMutation.mutateAsync(patches);
      toast.success(
        `Đã lưu ${result.data.applied} thay đổi (${result.data.granted} cấp, ${result.data.denied} thu hồi, ${result.data.removed} reset).`,
      );
      setPending({});
    } catch (err) {
      const e = err as { message?: string };
      toast.error(e.message ?? "Lưu thất bại");
    }
  };

  if (query.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white p-12 text-sm text-zinc-500 shadow-sm">
        <Loader2 className="h-4 w-4 animate-spin" />
        Đang tải ma trận quyền…
      </div>
    );
  }

  if (query.isError || !query.data) {
    return (
      <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-center text-sm text-rose-700 shadow-sm">
        Không tải được ma trận quyền.
      </div>
    );
  }

  const data = query.data.data;
  const entities = data.matrix.map((r) => r.entity as RbacEntityKey);

  let totalGrants = 0;
  let totalDenies = 0;
  for (const row of data.matrix) {
    for (const cell of row.actions) {
      const k = keyOf(row.entity as RbacEntityKey, cell.action);
      const eff = pending[k] !== undefined ? pending[k] : cell.override;
      if (eff === "GRANT") totalGrants++;
      else if (eff === "DENY") totalDenies++;
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl border border-zinc-200 bg-white p-4 text-xs text-zinc-700 shadow-sm">
        <p className="font-semibold tracking-tight text-zinc-900">
          Hướng dẫn sử dụng
        </p>
        <ul className="mt-2 grid gap-1.5 sm:grid-cols-2">
          <li className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-500"
              aria-hidden="true"
            />
            <span>Nền xanh = role mặc định cho phép.</span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-indigo-500"
              aria-hidden="true"
            />
            <span>Chấm chàm = override CẤP THÊM (escalate).</span>
          </li>
          <li className="flex items-start gap-2">
            <span
              className="mt-0.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-rose-500"
              aria-hidden="true"
            />
            <span>Chấm hồng = override THU HỒI (deny wins).</span>
          </li>
          <li className="text-zinc-500">
            Click ô để xoay vòng:{" "}
            <span className="font-mono">role → cấp → thu hồi → role</span>.
          </li>
        </ul>
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-sm">
        <table className="min-w-full text-xs">
          <thead className="border-b border-zinc-200 bg-zinc-50/70">
            <tr>
              <th className="sticky left-0 z-10 bg-zinc-50/70 px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-normal text-zinc-500">
                Đối tượng
              </th>
              {ACTIONS.map((a) => (
                <th
                  key={a}
                  className="px-2 py-2.5 text-center text-[11px] font-semibold uppercase tracking-normal text-zinc-500"
                >
                  {ACTION_LABELS[a]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entities.map((entity) => (
              <tr
                key={entity}
                className="border-t border-zinc-100 transition-colors hover:bg-indigo-50/30"
              >
                <td className="sticky left-0 z-10 bg-white px-3 py-2 font-medium tracking-tight text-zinc-800">
                  <div className="flex flex-col">
                    <span>{ENTITY_LABELS[entity]}</span>
                    <code className="font-mono text-[10px] text-zinc-400">
                      {entity}
                    </code>
                  </div>
                </td>
                {ACTIONS.map((action) => {
                  const cell = getCell(entity, action);
                  const k = keyOf(entity, action);
                  const isDirty = k in pending;
                  return (
                    <td key={action} className="px-1 py-1 text-center">
                      <button
                        type="button"
                        onClick={() => toggle(entity, action)}
                        disabled={bulkMutation.isPending}
                        title={
                          `${ENTITY_LABELS[entity]} • ${ACTION_LABELS[action]}\n` +
                          `Role mặc định: ${cell.roleAllowed ? "Cho phép" : "Không"}\n` +
                          `Override: ${cell.override ?? "—"}\n` +
                          `Hiệu lực: ${cell.effectiveAllowed ? "ALLOW" : "DENY"} (${cell.source})`
                        }
                        className={cn(
                          "relative inline-flex h-9 w-full min-w-[56px] items-center justify-center rounded-md border text-[11px] font-semibold transition",
                          cell.roleAllowed
                            ? "border-emerald-200 bg-emerald-50 text-emerald-800"
                            : "border-zinc-200 bg-zinc-50 text-zinc-400",
                          cell.override === "GRANT" &&
                            "border-indigo-300 bg-indigo-50 text-indigo-800",
                          cell.override === "DENY" &&
                            "border-rose-300 bg-rose-50 text-rose-800",
                          !cell.effectiveAllowed && "line-through",
                          isDirty && "ring-2 ring-amber-300 ring-offset-1",
                          "hover:opacity-80",
                          "disabled:cursor-not-allowed disabled:opacity-50",
                        )}
                      >
                        {cell.effectiveAllowed ? "✓" : "✕"}
                        {cell.override === "GRANT" ? (
                          <span
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-indigo-500"
                            aria-hidden="true"
                          />
                        ) : null}
                        {cell.override === "DENY" ? (
                          <span
                            className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-rose-500"
                            aria-hidden="true"
                          />
                        ) : null}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-xs shadow-sm">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-zinc-600">
          <span>
            Tổng <span className="font-semibold text-indigo-700">CẤP THÊM</span>:{" "}
            <span className="font-mono font-semibold tabular-nums">
              {totalGrants}
            </span>
          </span>
          <span>
            Tổng <span className="font-semibold text-rose-700">THU HỒI</span>:{" "}
            <span className="font-mono font-semibold tabular-nums">
              {totalDenies}
            </span>
          </span>
          {dirtyCount > 0 ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700 ring-1 ring-inset ring-amber-200">
              {dirtyCount} thay đổi chưa lưu
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={reset}
            disabled={dirtyCount === 0 || bulkMutation.isPending}
          >
            <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            Huỷ
          </Button>
          <Button
            size="sm"
            onClick={() => void save()}
            disabled={dirtyCount === 0 || bulkMutation.isPending}
          >
            {bulkMutation.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Save className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Lưu thay đổi
          </Button>
        </div>
      </footer>
    </div>
  );
}
