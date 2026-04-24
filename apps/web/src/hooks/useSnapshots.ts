"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BomSnapshotState,
  SnapshotExplodeInput,
  SnapshotLineUpdateInput,
  SnapshotTransitionInput,
} from "@iot/shared";
import { qk, type SnapshotFilter } from "@/lib/query-keys";

/**
 * Snapshot TanStack Query hooks — V1.2 Phase B2.
 *
 * - useSnapshotLines(orderCode, filter): list với filter + pagination.
 * - useSnapshotSummary(orderCode): aggregate count per state.
 * - useExplodeSnapshot(orderCode): admin/planner → invalidate lines + summary
 *   + orders list + dashboard.
 * - useTransitionState(lineId, orderCode): optimistic update state, rollback
 *   on 409 version conflict + toast (caller handle).
 */

export interface SnapshotLineRow {
  id: string;
  orderId: string;
  revisionId: string;
  parentSnapshotLineId: string | null;
  level: number;
  path: string;
  componentItemId: string;
  componentSku: string;
  componentName: string;
  requiredQty: string;
  grossRequiredQty: string;
  openPurchaseQty: string;
  receivedQty: string;
  qcPassQty: string;
  reservedQty: string;
  issuedQty: string;
  assembledQty: string;
  remainingShortQty: string | null;
  state: BomSnapshotState;
  transitionedAt: string | null;
  transitionedBy: string | null;
  versionLock: number;
  /** V1.9 Phase 3: ghi chú tự do cho line. */
  notes: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SnapshotLineListResponse {
  data: SnapshotLineRow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface SnapshotSummaryResponse {
  data: {
    orderId: string;
    orderCode: string;
    total: number;
    byState: { state: BomSnapshotState; count: number }[];
  };
}

export interface ExplodeSnapshotResult {
  orderId: string;
  revisionId: string;
  linesCreated: number;
  maxDepth: number;
  durationMs: number;
}

interface RequestError extends Error {
  status?: number;
  code?: string;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(
      body.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

function buildSnapshotLinesUrl(
  orderCode: string,
  f: SnapshotFilter = {},
): string {
  const p = new URLSearchParams();
  for (const s of f.state ?? []) p.append("state", s);
  if (f.level !== undefined) p.set("level", String(f.level));
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.shortOnly !== undefined) p.set("shortOnly", String(f.shortOnly));
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  const qs = p.toString();
  return `/api/orders/${orderCode}/snapshot-lines${qs ? `?${qs}` : ""}`;
}

export function useSnapshotLines(
  orderCode: string | null,
  filter: SnapshotFilter = {},
) {
  return useQuery({
    queryKey: orderCode
      ? qk.snapshots.lines(orderCode, filter)
      : ["snapshots", "lines", "__none__"],
    queryFn: () =>
      request<SnapshotLineListResponse>(
        buildSnapshotLinesUrl(orderCode as string, filter),
      ),
    enabled: !!orderCode,
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useSnapshotSummary(orderCode: string | null) {
  return useQuery({
    queryKey: orderCode
      ? qk.snapshots.summary(orderCode)
      : ["snapshots", "summary", "__none__"],
    queryFn: () =>
      request<SnapshotSummaryResponse>(
        `/api/snapshots/summary/${orderCode}`,
      ),
    enabled: !!orderCode,
    staleTime: 10_000,
  });
}

export function useExplodeSnapshot(orderCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SnapshotExplodeInput) =>
      request<{ data: ExplodeSnapshotResult }>(
        `/api/orders/${orderCode}/snapshot`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.orders.detail(orderCode) });
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

/**
 * V1.9 Phase 3 — PATCH 1 snapshot line từ tab Sản xuất của Order detail.
 * Không optimistic (form-based, user chờ phản hồi); invalidate list + summary + activity log.
 */
export function useUpdateSnapshotLine(orderCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      lineId: string;
      data: SnapshotLineUpdateInput;
    }) =>
      request<{ data: SnapshotLineRow }>(
        `/api/orders/${orderCode}/snapshot-lines/${input.lineId}`,
        {
          method: "PATCH",
          body: JSON.stringify(input.data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.snapshots.summary(orderCode) });
      qc.invalidateQueries({ queryKey: qk.orders.detail(orderCode) });
      qc.invalidateQueries({
        queryKey: qk.orders.productionSummary(orderCode),
      });
      qc.invalidateQueries({
        queryKey: ["orders", orderCode, "activity-log"] as const,
      });
    },
  });
}

export function useTransitionState(lineId: string, orderCode: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: SnapshotTransitionInput) =>
      request<{ data: SnapshotLineRow }>(
        `/api/snapshot-lines/${lineId}/transition`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ),
    onMutate: async (patch) => {
      // Optimistic update row trong list cache (sync qua tất cả filter keys).
      await qc.cancelQueries({ queryKey: qk.snapshots.all });
      const caches = qc.getQueriesData<SnapshotLineListResponse>({
        queryKey: ["snapshots", "lines", orderCode] as const,
      });
      const prev = caches.map(([key, data]) => [key, data] as const);
      for (const [key, data] of caches) {
        if (!data?.data) continue;
        const next: SnapshotLineListResponse = {
          ...data,
          data: data.data.map((r) =>
            r.id === lineId
              ? {
                  ...r,
                  state: patch.toState,
                  versionLock: r.versionLock + 1,
                  transitionedAt: new Date().toISOString(),
                }
              : r,
          ),
        };
        qc.setQueryData(key, next);
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback on 409 version conflict / invalid transition
      if (ctx?.prev) {
        for (const [key, data] of ctx.prev) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.snapshots.summary(orderCode) });
      qc.invalidateQueries({ queryKey: qk.orders.detail(orderCode) });
    },
  });
}
