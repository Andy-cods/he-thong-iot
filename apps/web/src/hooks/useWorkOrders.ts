"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { qk, type WorkOrderFilter } from "@/lib/query-keys";

/**
 * V1.3 Work Order TanStack hooks.
 */

export type WorkOrderStatus =
  | "DRAFT"
  | "QUEUED"
  | "RELEASED"
  | "IN_PROGRESS"
  | "PAUSED"
  | "COMPLETED"
  | "CANCELLED";

export interface WorkOrderRow {
  id: string;
  woNo: string;
  productItemId: string;
  linkedOrderId: string | null;
  plannedQty: string;
  goodQty: string;
  scrapQty: string;
  status: WorkOrderStatus;
  priority: string;
  plannedStart: string | null;
  plannedEnd: string | null;
  startedAt: string | null;
  pausedAt: string | null;
  pausedReason: string | null;
  releasedAt: string | null;
  completedAt: string | null;
  notes: string | null;
  versionLock: number;
  createdAt: string;
  createdBy: string | null;
  orderNo: string | null;
}

export interface WorkOrderLineRow {
  id: string;
  woId: string;
  snapshotLineId: string;
  requiredQty: string;
  completedQty: string;
  position: number;
  componentSku: string;
  componentName: string;
  snapshotState: string;
}

export interface WorkOrderDetail extends WorkOrderRow {
  lines: WorkOrderLineRow[];
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

function buildUrl(f: WorkOrderFilter): string {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.orderId) p.set("orderId", f.orderId);
  if (f.bomTemplateId) p.set("bomTemplateId", f.bomTemplateId);
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/work-orders?${p.toString()}`;
}

export function useWorkOrdersList(filter: WorkOrderFilter) {
  return useQuery({
    queryKey: qk.workOrders.list(filter),
    queryFn: () =>
      request<{
        data: WorkOrderRow[];
        meta: { page: number; pageSize: number; total: number };
      }>(buildUrl(filter)),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useWorkOrderDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.workOrders.detail(id) : ["workOrders", "detail", "__none__"],
    queryFn: () => request<{ data: WorkOrderDetail }>(`/api/work-orders/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export interface CreateWoInput {
  orderId: string;
  snapshotLineIds: string[];
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  plannedStart?: string;
  plannedEnd?: string;
  notes?: string | null;
}

export function useCreateWorkOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: CreateWoInput) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useStartWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionLock?: number) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders/${id}/start`, {
        method: "POST",
        body: JSON.stringify({ versionLock }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
    },
  });
}

export function usePauseWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { mode: "pause" | "resume"; reason?: string; versionLock?: number }) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders/${id}/pause`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
    },
  });
}

export function useCompleteWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (versionLock?: number) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders/${id}/complete`, {
        method: "POST",
        body: JSON.stringify({ versionLock }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
    },
  });
}

export function useCancelWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { reason?: string; versionLock?: number }) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders/${id}/cancel`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(id) });
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
    },
  });
}
