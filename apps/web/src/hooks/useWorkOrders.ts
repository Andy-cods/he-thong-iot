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

/** V1.9-P4 — routing step JSONB. */
export interface RoutingStep {
  step_no: number;
  name: string;
  machine?: string | null;
  setup_min?: number | null;
  cycle_min?: number | null;
  operator_id?: string | null;
  status?: "PENDING" | "IN_PROGRESS" | "DONE" | "SKIPPED";
  notes?: string | null;
}

/** V1.9-P4 — material requirement JSONB. */
export interface MaterialRequirement {
  item_id?: string | null;
  sku?: string | null;
  name: string;
  qty: number;
  uom?: string | null;
  allocated_qty?: number;
  lot_codes?: string[];
}

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
  /** V1.9-P4. */
  routingPlan: RoutingStep[] | null;
  materialRequirements: MaterialRequirement[] | null;
  technicalDrawingUrl: string | null;
  toleranceSpecs: Record<string, unknown> | null;
  estimatedHours: string | null;
  actualHours: string | null;
  versionLock: number;
  createdAt: string;
  createdBy: string | null;
  orderNo: string | null;
}

export type WoProgressStepType =
  | "PROGRESS_REPORT"
  | "PAUSE"
  | "RESUME"
  | "QC_PASS"
  | "QC_FAIL"
  | "ISSUE"
  | "NOTE"
  | "PHOTO";

export interface WoProgressLogRow {
  id: string;
  workOrderId: string;
  workOrderLineId: string | null;
  stepType: WoProgressStepType;
  qtyCompleted: string;
  qtyScrap: string;
  notes: string | null;
  photoUrl: string | null;
  operatorId: string | null;
  operatorUsername: string | null;
  operatorDisplayName: string | null;
  station: string | null;
  durationMinutes: number | null;
  createdAt: string;
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

// ============================================================================
// V1.9 Phase 4 — progress log hooks
// ============================================================================

export function useWoProgressLog(woId: string | null) {
  return useQuery({
    queryKey: woId
      ? qk.workOrders.progressLog(woId)
      : (["workOrders", "__none__", "progress-log"] as const),
    queryFn: () =>
      request<{ data: WoProgressLogRow[]; meta: { total: number } }>(
        `/api/work-orders/${woId}/progress-log`,
      ),
    enabled: !!woId,
    staleTime: 10_000,
  });
}

export interface ProgressLogInput {
  workOrderLineId?: string | null;
  stepType: WoProgressStepType;
  qtyCompleted?: number;
  qtyScrap?: number;
  notes?: string | null;
  photoUrl?: string | null;
  station?: string | null;
  durationMinutes?: number | null;
}

export function useCreateProgressLog(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ProgressLogInput) =>
      request<{ data: WoProgressLogRow }>(
        `/api/work-orders/${woId}/progress-log`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.progressLog(woId) });
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
      qc.invalidateQueries({ queryKey: qk.workOrders.audit(woId) });
    },
  });
}

export function useDeleteProgressLog(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (entryId: string) =>
      request<{ data: { id: string; deleted: boolean } }>(
        `/api/work-orders/${woId}/progress-log/${entryId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.progressLog(woId) });
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
    },
  });
}

// ============================================================================
// V1.9 Phase 4 — PATCH WO (routing/material/tolerance)
// ============================================================================

export interface UpdateWoInput {
  priority?: "LOW" | "NORMAL" | "HIGH" | "URGENT";
  plannedStart?: string | null;
  plannedEnd?: string | null;
  notes?: string | null;
  routingPlan?: RoutingStep[];
  materialRequirements?: MaterialRequirement[];
  technicalDrawingUrl?: string | null;
  toleranceSpecs?: Record<string, unknown>;
  estimatedHours?: number | null;
  versionLock: number;
}

export function useUpdateWorkOrder(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: UpdateWoInput) =>
      request<{ data: WorkOrderRow }>(`/api/work-orders/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(id) });
    },
  });
}

// ============================================================================
// V1.9 Phase 4 — QC check items hooks
// ============================================================================

export type QcCheckItemResult = "PENDING" | "PASS" | "FAIL" | "NA";
export type QcCheckItemType = "BOOLEAN" | "MEASUREMENT" | "VISUAL";

export interface QcCheckItemRow {
  id: string;
  qcCheckId: string;
  description: string;
  checkType: QcCheckItemType;
  expectedValue: string | null;
  actualValue: string | null;
  result: QcCheckItemResult;
  defectReason: string | null;
  photoUrl: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  sortOrder: number;
  createdAt: string;
}

export function useQcCheckItems(checkId: string | null) {
  return useQuery({
    queryKey: checkId
      ? qk.workOrders.qcItems(checkId)
      : (["workOrders", "qc-items", "__none__"] as const),
    queryFn: () =>
      request<{ data: QcCheckItemRow[] }>(`/api/qc-checks/${checkId}/items`),
    enabled: !!checkId,
    staleTime: 5_000,
  });
}

export function useBulkCreateQcItems(checkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (
      items: Array<{
        description: string;
        checkType?: QcCheckItemType;
        expectedValue?: string | null;
        sortOrder?: number;
      }>,
    ) =>
      request<{ data: QcCheckItemRow[] }>(
        `/api/qc-checks/${checkId}/items`,
        { method: "POST", body: JSON.stringify({ items }) },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcItems(checkId) });
    },
  });
}

export function useUpdateQcItem(checkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      id: string;
      description?: string;
      checkType?: QcCheckItemType;
      expectedValue?: string | null;
      actualValue?: string | null;
      result?: QcCheckItemResult;
      defectReason?: string | null;
      photoUrl?: string | null;
      sortOrder?: number;
    }) =>
      request<{ data: QcCheckItemRow }>(
        `/api/qc-checks/${checkId}/items/${data.id}`,
        {
          method: "PATCH",
          body: JSON.stringify({
            description: data.description,
            checkType: data.checkType,
            expectedValue: data.expectedValue,
            actualValue: data.actualValue,
            result: data.result,
            defectReason: data.defectReason,
            photoUrl: data.photoUrl,
            sortOrder: data.sortOrder,
          }),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcItems(checkId) });
    },
  });
}

export function useDeleteQcItem(checkId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: { id: string; deleted: boolean } }>(
        `/api/qc-checks/${checkId}/items/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcItems(checkId) });
    },
  });
}
