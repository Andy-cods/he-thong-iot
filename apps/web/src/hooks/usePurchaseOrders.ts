"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  POCreateInput,
  POUpdateInput,
  POStatus,
  POApproveInput,
  PORejectInput,
  POApprovalMetadata,
} from "@iot/shared";
import { qk, type POFilter } from "@/lib/query-keys";

/**
 * Purchase Orders hooks — V1.2 Phase B4.3.
 * Invalidate: qk.procurement.orders + requests (khi convert from PR) +
 * dashboard + shortage (khi PO received → shortage giảm).
 */

export interface PORow {
  id: string;
  poNo: string;
  supplierId: string;
  supplierName?: string | null;
  supplierCode?: string | null;
  status: POStatus;
  linkedOrderId: string | null;
  prId: string | null;
  orderDate: string;
  expectedEta: string | null;
  currency: string;
  totalAmount: string;
  paymentTerms?: string | null;
  deliveryAddress?: string | null;
  actualDeliveryDate?: string | null;
  notes: string | null;
  sentAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: string | null;
  metadata?: POApprovalMetadata | null;
}

export interface POLineRow {
  id: string;
  poId: string;
  lineNo: number;
  itemId: string;
  itemSku?: string | null;
  itemName?: string | null;
  itemUom?: string | null;
  orderedQty: string;
  receivedQty: string;
  unitPrice: string;
  taxRate?: string;
  lineTotal?: string;
  expectedEta: string | null;
  snapshotLineId: string | null;
  notes: string | null;
}

export interface POListResponse {
  data: PORow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface PODetailResponse {
  data: PORow & { lines: POLineRow[] };
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

function buildListUrl(f: POFilter): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.supplierId) p.set("supplierId", f.supplierId);
  if (f.prId) p.set("prId", f.prId);
  if (f.bomTemplateId) p.set("bomTemplateId", f.bomTemplateId);
  if (f.from) p.set("from", f.from);
  if (f.to) p.set("to", f.to);
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/purchase-orders?${p.toString()}`;
}

export function usePurchaseOrdersList(filter: POFilter) {
  return useQuery({
    queryKey: qk.procurement.orders.list(filter),
    queryFn: () => request<POListResponse>(buildListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export interface POStatsResponse {
  data: {
    total: number;
    openCount: number;
    sentCount: number;
    partialCount: number;
    receivedCount: number;
    cancelledCount: number;
    totalSpend: string;
    receivedSpend: string;
    pendingSpend: string;
    supplierCount: number;
    overdueCount: number;
  };
}

/** V3.2 — KPI stats aggregate cho toàn bộ PO khớp filter (không phân trang). */
export function usePurchaseOrdersStats(filter: Omit<POFilter, "page" | "pageSize">) {
  return useQuery({
    queryKey: [...qk.procurement.orders.all, "stats", filter] as const,
    queryFn: () => {
      const p = new URLSearchParams();
      if (filter.q) p.set("q", filter.q);
      if (filter.supplierId) p.set("supplierId", filter.supplierId);
      if (filter.prId) p.set("prId", filter.prId);
      if (filter.bomTemplateId) p.set("bomTemplateId", filter.bomTemplateId);
      if (filter.from) p.set("from", filter.from);
      if (filter.to) p.set("to", filter.to);
      for (const s of filter.status ?? []) p.append("status", s);
      return request<POStatsResponse>(`/api/purchase-orders/stats?${p.toString()}`);
    },
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function usePurchaseOrderDetail(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.procurement.orders.detail(id)
      : ["procurement", "orders", "detail", "__none__"],
    queryFn: () => request<PODetailResponse>(`/api/purchase-orders/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useCreatePurchaseOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: POCreateInput) =>
      request<{ data: PORow }>("/api/purchase-orders", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export interface ConvertPRResult {
  createdPOs: PORow[];
  linesBySupplier: Record<string, number>;
}

/**
 * V3.4 — Accept optional supplierOverrides để gán supplier cho line thiếu
 * preferred_supplier ngay tại lúc convert.
 */
export interface ConvertPRInput {
  prId: string;
  supplierOverrides?: Record<string, string>;
}

export function useConvertPRToPOs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: string | ConvertPRInput) => {
      const prId = typeof input === "string" ? input : input.prId;
      const overrides =
        typeof input === "string" ? undefined : input.supplierOverrides;
      return request<{ data: ConvertPRResult }>(
        `/api/purchase-orders/from-pr/${prId}`,
        {
          method: "POST",
          body: overrides ? JSON.stringify({ supplierOverrides: overrides }) : undefined,
        },
      );
    },
    onSuccess: (_data, input) => {
      const prId = typeof input === "string" ? input : input.prId;
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(prId) });
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.shortage.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useUpdatePurchaseOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: POUpdateInput) =>
      request<{ data: PORow }>(`/api/purchase-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.orders.detail(id) });
    },
  });
}

export function useSendPurchaseOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PORow }>(`/api/purchase-orders/${id}/send`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.orders.detail(id) });
    },
  });
}

/** V1.9-P9: DRAFT → pending approval. */
export function useSubmitPOApproval(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PORow }>(
        `/api/purchase-orders/${id}/submit-approval`,
        { method: "POST" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.orders.detail(id) });
    },
  });
}

export function useApprovePO(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: POApproveInput) =>
      request<{ data: PORow }>(`/api/purchase-orders/${id}/approve`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.orders.detail(id) });
    },
  });
}

export function useRejectPO(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: PORejectInput) =>
      request<{ data: PORow }>(`/api/purchase-orders/${id}/reject`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.procurement.orders.detail(id) });
    },
  });
}

/* ── V3.2 — Audit trail hook ─────────────────────────────────────────────── */

export interface POAuditEvent {
  id: string;
  actorUserId: string | null;
  actorUsername: string | null;
  action: string;
  objectType: string;
  objectId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  notes: string | null;
  occurredAt: string;
  requestId: string | null;
  ipAddress: string | null;
}

export interface POAuditTrailResponse {
  data: {
    po: { id: string; poNo: string; status: string };
    events: POAuditEvent[];
  };
}

export function usePOAuditTrail(poId: string | null) {
  return useQuery({
    queryKey: poId ? ["po", "audit-trail", poId] : ["po", "audit-trail", "__none__"],
    queryFn: () =>
      request<POAuditTrailResponse>(
        `/api/purchase-orders/${encodeURIComponent(poId!)}/audit-trail`,
      ),
    enabled: !!poId,
    staleTime: 30_000,
  });
}

/**
 * V1.9-P9: fetch Excel blob và trigger download.
 * Không dùng react-query vì action, không cần cache.
 */
export function useExportPOExcel() {
  return useMutation({
    mutationFn: async (filter: {
      status?: POStatus[];
      supplierId?: string;
      from?: string;
      to?: string;
    }) => {
      const p = new URLSearchParams();
      for (const s of filter.status ?? []) p.append("status", s);
      if (filter.supplierId) p.set("supplierId", filter.supplierId);
      if (filter.from) p.set("from", filter.from);
      if (filter.to) p.set("to", filter.to);

      const res = await fetch(
        `/api/purchase-orders/export?${p.toString()}`,
        { credentials: "include" },
      );
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        throw new Error(body.error?.message ?? `HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const count = res.headers.get("X-Export-Count") ?? "0";
      const ts = new Date().toISOString().slice(0, 10);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `purchase-orders-${ts}.xlsx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      return { count: Number(count) };
    },
  });
}
