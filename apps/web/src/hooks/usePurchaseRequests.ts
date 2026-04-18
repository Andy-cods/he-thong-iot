"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  PRCreateInput,
  PRCreateFromShortageInput,
  PRUpdateInput,
  PRApproveInput,
  PRRejectInput,
  PRStatus,
} from "@iot/shared";
import { qk, type PRFilter } from "@/lib/query-keys";

/**
 * Purchase Requests hooks — V1.2 Phase B4.3.
 * Invalidate: qk.procurement.requests + shortage.all (khi create from-shortage)
 * + orders.all (khi PR gắn linked order). Dashboard cache cũng invalidate khi
 * approve/convert vì readiness % phụ thuộc PR state.
 */

export interface PRRow {
  id: string;
  code: string;
  title: string | null;
  status: PRStatus;
  source: string;
  linkedOrderId: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PRLineEnriched {
  id: string;
  lineNo: number;
  itemId: string;
  sku: string;
  name: string;
  qty: string;
  preferredSupplierId: string | null;
  snapshotLineId: string | null;
  neededBy: string | null;
  notes: string | null;
  grossRequiredQty: string | null;
  remainingShortQty: string | null;
}

export interface PRListResponse {
  data: PRRow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface PRDetailResponse {
  data: PRRow & { lines: PRLineEnriched[] };
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

function buildListUrl(f: PRFilter): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.linkedOrderId) p.set("linkedOrderId", f.linkedOrderId);
  if (f.requestedBy) p.set("requestedBy", f.requestedBy);
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/purchase-requests?${p.toString()}`;
}

export function usePurchaseRequestsList(filter: PRFilter) {
  return useQuery({
    queryKey: qk.procurement.requests.list(filter),
    queryFn: () => request<PRListResponse>(buildListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function usePurchaseRequestDetail(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.procurement.requests.detail(id)
      : ["procurement", "requests", "detail", "__none__"],
    queryFn: () => request<PRDetailResponse>(`/api/purchase-requests/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreatePurchaseRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRCreateInput) =>
      request<{ data: PRRow }>("/api/purchase-requests", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useCreatePRFromShortage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRCreateFromShortageInput) =>
      request<{ data: PRRow }>("/api/purchase-requests/from-shortage", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.shortage.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useUpdatePurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRUpdateInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

export function useApprovePurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRApproveInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useRejectPurchaseRequest(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PRRejectInput) =>
      request<{ data: PRRow }>(`/api/purchase-requests/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}
