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
  // V3.7.55 MRF
  targetDepartment?: string | null;
  proposingDepartment?: string | null;
  requestReason?: string | null;
  // V3.7.69 YCVT
  paperFormNo?: string | null;
  approvalStep?:
    | "DRAFT"
    | "SUBMITTED"
    | "DEPT_APPROVED"
    | "DIRECTOR_APPROVED"
    | "CONVERTED"
    | "DONE"
    | "REJECTED";
  deptApprovedBy?: string | null;
  deptApprovedAt?: string | null;
  deptApprovalNote?: string | null;
  directorApprovedBy?: string | null;
  directorApprovedAt?: string | null;
  directorApprovalNote?: string | null;
  poCreatedAt?: string | null;
  goodsReceivedAt?: string | null;
  goodsIssuedAt?: string | null;
  completedAt?: string | null;
  rejectedBy?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
  totalEstimatedAmount?: string | null;
  // V3.7.73 — Resolved user fullName để hiển thị mục III/IV
  requestedByName?: string | null;
  deptApprovedByName?: string | null;
  directorApprovedByName?: string | null;
  rejectedByName?: string | null;
}

export interface PRLineEnriched {
  id: string;
  lineNo: number;
  /** V3.7.72 — Nullable: dòng nhập tay không có itemId. */
  itemId: string | null;
  sku: string | null;
  name: string | null;
  qty: string;
  preferredSupplierId: string | null;
  snapshotLineId: string | null;
  neededBy: string | null;
  notes: string | null;
  grossRequiredQty: string | null;
  remainingShortQty: string | null;
  // V3.7.55 MRF
  specification?: string | null;
  uom?: string | null;
  priority?: "URGENT" | "NORMAL" | "RESERVE" | null;
  category?: "TOOL" | "CONSUMABLE" | "MATERIAL" | "OTHER" | null;
  estimatedUnitPrice?: string | null;
  referenceCode?: string | null;
  approvedQty?: string | null;
  itemUom?: string | null;
  // V3.7.69 YCVT
  onHandSnapshot?: string | null;
  lineTotal?: string | null;
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
  if (f.bomTemplateId) p.set("bomTemplateId", f.bomTemplateId);
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

/**
 * V3.7.69 YCVT — preview số phiếu kế tiếp (`{seq}/PRD-MRF/{MMYY}`).
 * Re-fetch mỗi phút để khi qua tháng tự update MMYY.
 */
export function usePreviewPaperFormNo() {
  return useQuery({
    queryKey: ["procurement", "requests", "paper-form-no-preview"],
    queryFn: () =>
      request<{ data: { paperFormNo: string } }>(
        "/api/purchase-requests/preview-form-no",
      ),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

/**
 * V3.7.69 YCVT — bulk inventory balance lookup theo nhiều itemIds.
 * Dùng cho form MRF: auto-fill cột "Tồn kho" khi user pick item.
 */
export interface InventoryBalanceRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  onHand: number;
  reserved: number;
  available: number;
  holdQty: number;
  minStockQty: number;
}

export function useBulkInventoryBalance(itemIds: string[]) {
  const key = itemIds.length > 0 ? itemIds.slice().sort().join(",") : "";
  return useQuery({
    queryKey: ["inventory", "balance-bulk", key],
    queryFn: async () => {
      if (itemIds.length === 0) return { data: [] };
      const url = `/api/inventory/balance?itemIds=${encodeURIComponent(key)}&hasLotOnly=false&pageSize=500`;
      return request<{ data: InventoryBalanceRow[] }>(url);
    },
    enabled: itemIds.length > 0,
    staleTime: 30_000,
  });
}

/** V3.7.69 YCVT — Step 2: Trưởng bộ phận duyệt. */
export function useDeptApprovePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note?: string | null }) =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/dept-approve`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

/** V3.7.69 YCVT — Step 3: Giám đốc / Mua hàng duyệt. */
export function useDirectorApprovePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { note?: string | null }) =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/director-approve`,
        { method: "POST", body: JSON.stringify(data) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

/** V3.7.70 YCVT — Timeline IV.4: Đánh dấu "Đã xuất kho". */
export function useMarkPRIssued(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/mark-issued`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/** V3.7.70 YCVT — Timeline IV.5: Đánh dấu "Hoàn tất". */
export function useMarkPRCompleted(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: PRRow }>(
        `/api/purchase-requests/${id}/mark-completed`,
        { method: "POST", body: "{}" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
    },
  });
}

/**
 * V3.7.71 YCVT — Hard-delete phiếu YCVT. Admin only.
 * Option `force=true` để override khi có PO link.
 */
export function useDeletePR(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (opts: { force?: boolean } = {}) => {
      const qs = opts.force ? "?force=1" : "";
      return request<{ ok: true }>(`/api/purchase-requests/${id}${qs}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.requests.all });
      qc.invalidateQueries({ queryKey: qk.procurement.requests.detail(id) });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}
