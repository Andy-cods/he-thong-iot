"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  OrderCreate,
  OrderUpdate,
  OrderClose,
  SalesOrderStatus,
} from "@iot/shared";
import { qk, type OrderFilter } from "@/lib/query-keys";

/**
 * Order TanStack Query hooks — V1.2 Phase B1.
 *
 * Pattern theo useBom.ts: mutation invalidate qk.orders.all +
 * qk.dashboard.overview (readiness % tuỳ thuộc count open orders).
 */

export interface OrderListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface SalesOrderRow {
  id: string;
  orderNo: string;
  customerName: string;
  customerRef: string | null;
  status: SalesOrderStatus;
  productItemId: string;
  bomTemplateId: string | null;
  orderQty: string;
  dueDate: string | null;
  notes: string | null;
  snapshotAt: string | null;
  snapshotBy: string | null;
  closedAt: string | null;
  versionLock: number;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
}

interface RequestError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
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
      error?: { message?: string; code?: string; details?: unknown };
    };
    const err = new Error(
      body.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    err.details = body.error?.details;
    throw err;
  }
  return (await res.json()) as T;
}

function buildOrderListUrl(f: OrderFilter): string {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.customer && f.customer.trim()) p.set("customer", f.customer.trim());
  if (f.dateFrom) p.set("dateFrom", f.dateFrom);
  if (f.dateTo) p.set("dateTo", f.dateTo);
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  if (f.sort) p.set("sort", f.sort);
  if (f.sortDir) p.set("sortDir", f.sortDir);
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/orders?${p.toString()}`;
}

export function useOrdersList(filter: OrderFilter) {
  return useQuery({
    queryKey: qk.orders.list(filter),
    queryFn: () =>
      request<OrderListResponse<SalesOrderRow>>(buildOrderListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export interface OrderDetailResponse {
  data: SalesOrderRow;
}

export function useOrderDetail(code: string | null) {
  return useQuery({
    queryKey: code ? qk.orders.detail(code) : ["orders", "detail", "__none__"],
    queryFn: () => request<OrderDetailResponse>(`/api/orders/${code}`),
    enabled: !!code,
    staleTime: 10_000,
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderCreate) =>
      request<{ data: SalesOrderRow }>(`/api/orders`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useUpdateOrder(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderUpdate) =>
      request<{ data: SalesOrderRow }>(`/api/orders/${code}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: qk.orders.detail(code) });
      const prev = qc.getQueryData<OrderDetailResponse>(qk.orders.detail(code));
      if (prev?.data) {
        const nextData = { ...prev.data } as SalesOrderRow;
        if (patch.customerName !== undefined)
          nextData.customerName = patch.customerName;
        if (patch.customerRef !== undefined)
          nextData.customerRef = patch.customerRef ?? null;
        if (patch.orderQty !== undefined)
          nextData.orderQty = String(patch.orderQty);
        if (patch.notes !== undefined) nextData.notes = patch.notes ?? null;
        qc.setQueryData<OrderDetailResponse>(qk.orders.detail(code), {
          data: nextData,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.orders.detail(code), ctx.prev);
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.orders.detail(code) });
      qc.invalidateQueries({ queryKey: qk.orders.all });
    },
  });
}

export function useCloseOrder(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: OrderClose) =>
      request<{ data: SalesOrderRow }>(`/api/orders/${code}/close`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.orders.detail(code) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useReopenOrder(code: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: SalesOrderRow }>(`/api/orders/${code}/reopen`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.orders.all });
      qc.invalidateQueries({ queryKey: qk.orders.detail(code) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}
