"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BomLineCreate,
  BomLineUpdate,
  BomTemplateClone,
  BomTemplateCreate,
  BomTemplateUpdate,
} from "@iot/shared";
import { qk, type BomFilter } from "@/lib/query-keys";

/**
 * BOM TanStack Query hooks — theo pattern useItems.ts (brainstorm-deep §1).
 * Toàn bộ mutation invalidate prefix `qk.bom.all` để sync list + detail + tree.
 */

export interface BomListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface BomTemplateListRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentItemId: string | null;
  parentItemSku: string | null;
  parentItemName: string | null;
  targetQty: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  componentCount: number;
  updatedAt: string | Date;
  createdAt: string | Date;
}

export interface BomTreeNodeRaw {
  id: string;
  parentLineId: string | null;
  templateId: string;
  componentItemId: string;
  componentSku: string | null;
  componentName: string | null;
  componentUom: string | null;
  componentCategory: string | null;
  componentItemType: string | null;
  level: number;
  position: number;
  /** V2.0 Sprint 6 — chuỗi vị trí (R01, S40) từ Excel "ID Number". */
  positionCode: string | null;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string | null;
  description: string | null;
  supplierItemCode: string | null;
  /** V3.7.18 — PIC user matched từ Excel "PIC" column. NULL nếu không match. */
  assignedToUserId: string | null;
  assignedToFullName: string | null;
  /** V3.7.18 — Raw PIC text từ Excel khi không match user. */
  assignedToName: string | null;
  /** V3.7.19 — Tracking PIC update */
  receivedQty: string | null;
  expectedEta: string | null;
  statusNote: string | null;
  metadata: Record<string, unknown>;
  /**
   * V2.0 — `item.dimensions` jsonb `{length, width, height, unit}` (mm mặc
   * định). NULL nếu item chưa map. TASK-20260427-024.
   */
  itemDimensions: Record<string, unknown> | null;
  /**
   * V2.0 — `item.spec_json` text (JSON string `{ dimensionText, ... }`),
   * parse client-side để fallback render Kích thước. TASK-20260427-024.
   */
  itemSpecJson: string | null;
  childCount: number;
}

export interface BomTemplateDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  parentItemId: string | null;
  parentItemSku: string | null;
  parentItemName: string | null;
  targetQty: string;
  status: "DRAFT" | "ACTIVE" | "OBSOLETE";
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
  createdBy: string | null;
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

function buildBomListUrl(f: BomFilter): string {
  const p = new URLSearchParams();
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  if (f.page) p.set("page", String(f.page));
  if (f.pageSize) p.set("pageSize", String(f.pageSize));
  if (f.sort) p.set("sort", f.sort);
  if (f.sortDir) p.set("sortDir", f.sortDir);
  if (f.hasComponents !== undefined) p.set("hasComponents", String(f.hasComponents));
  if (f.updatedFrom) p.set("updatedFrom", f.updatedFrom);
  if (f.updatedTo) p.set("updatedTo", f.updatedTo);
  if (f.minComponents && f.minComponents > 0)
    p.set("minComponents", String(f.minComponents));
  for (const s of f.status ?? []) p.append("status", s);
  return `/api/bom/templates?${p.toString()}`;
}

export function useBomList(filter: BomFilter) {
  return useQuery({
    queryKey: qk.bom.list(filter),
    queryFn: () =>
      request<BomListResponse<BomTemplateListRow>>(buildBomListUrl(filter)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export interface BomDetailResponse {
  data: {
    template: BomTemplateDetail;
    tree: BomTreeNodeRaw[];
  };
}

export function useBomDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.bom.detail(id) : ["bom", "detail", "__none__"],
    queryFn: () => request<BomDetailResponse>(`/api/bom/templates/${id}`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

export interface BomTreeResponse {
  data: { tree: BomTreeNodeRaw[] };
}

/**
 * Dedicated tree fetch — dùng khi cần re-fetch độc lập metadata.
 *
 * V2.0 Sprint 6 — `sheetId` optional. Khi BOM multi-sheet, frontend pass
 * activeSheetId để chỉ fetch lines của 1 sheet PROJECT (khắc phục issue
 * grid render duplicate khi BOM có 2+ sheets).
 *
 * Cache key bao gồm sheetId — switch tab = cache miss lần đầu, sau đó hit.
 * Mutation invalidate prefix `["bom", "tree", id]` cover all sheets.
 */
export function useBomTree(
  id: string | null,
  sheetId?: string | null,
) {
  return useQuery({
    queryKey: id
      ? sheetId
        ? [...qk.bom.tree(id), sheetId]
        : qk.bom.tree(id)
      : ["bom", "tree", "__none__"],
    queryFn: () => {
      const qs = sheetId ? `?sheetId=${encodeURIComponent(sheetId)}` : "";
      return request<BomTreeResponse>(`/api/bom/templates/${id}/tree${qs}`);
    },
    // Chờ activeSheetId set xong khi BOM multi-sheet — tránh fetch all rồi
    // fetch lại theo sheet (gây "flash" duplicate rows trên UI).
    enabled: !!id,
    staleTime: 5_000,
  });
}

/** Debounced code availability — dùng trong form create. */
function useDebounced<T>(value: T, delay = 300): T {
  const [v, setV] = React.useState(value);
  React.useEffect(() => {
    const id = setTimeout(() => setV(value), delay);
    return () => clearTimeout(id);
  }, [value, delay]);
  return v;
}

export function useBomCheckCode(code: string, excludeId?: string) {
  const debounced = useDebounced(code.toUpperCase(), 300);
  return useQuery({
    queryKey: qk.bom.codeCheck(debounced, excludeId),
    queryFn: () => {
      const p = new URLSearchParams({ code: debounced });
      if (excludeId) p.set("excludeId", excludeId);
      return request<{ data: { available: boolean; code: string } }>(
        `/api/bom/templates/check-code?${p.toString()}`,
      );
    },
    enabled: debounced.length >= 2,
    staleTime: 5_000,
  });
}

export function useCreateBomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BomTemplateCreate) =>
      request<{ data: { id: string } }>(`/api/bom/templates`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function useUpdateBomTemplate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BomTemplateUpdate) =>
      request<{ data: BomTemplateDetail }>(`/api/bom/templates/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function useDeleteBomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: unknown }>(`/api/bom/templates/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function useCloneBomTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: BomTemplateClone;
    }) =>
      request<{
        data: { template: BomTemplateDetail; lineCount: number };
      }>(`/api/bom/templates/${id}/clone`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

/* ---------------- BOM Lines ---------------- */

export function useAddBomLine(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BomLineCreate) =>
      request<{ data: { id: string } }>(
        `/api/bom/templates/${templateId}/lines`,
        {
          method: "POST",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.detail(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.tree(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export function useUpdateBomLine(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ lineId, data }: { lineId: string; data: BomLineUpdate }) =>
      request<{ data: { id: string } }>(
        `/api/bom/templates/${templateId}/lines/${lineId}`,
        {
          method: "PATCH",
          body: JSON.stringify(data),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.detail(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.tree(templateId) });
    },
  });
}

export function useDeleteBomLine(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      lineId,
      cascade,
    }: {
      lineId: string;
      cascade?: boolean;
    }) => {
      const url = `/api/bom/templates/${templateId}/lines/${lineId}${
        cascade ? "?cascade=true" : ""
      }`;
      return request<{
        data: { deletedIds: string[]; descendantCount: number };
      }>(url, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.bom.detail(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.tree(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.all });
    },
  });
}

export interface BomLineWoImpact {
  count: number;
  wos: Array<{ id: string; woNo: string; status: string }>;
}

/**
 * TASK-6VIEC Việc 5 — số lệnh SX CHƯA HOÀN THÀNH đang dùng BOM/dòng này,
 * dùng để cảnh báo trước khi lưu sửa/xoá (xem BomLineSheet/BomGridPro).
 * `enabled=false` khi chưa có lineId (dòng mới chưa lưu) — không có gì để
 * tra, cũng tránh gọi API với id rỗng.
 */
export function useBomLineWoImpact(
  templateId: string,
  lineId: string | null | undefined,
) {
  return useQuery({
    queryKey: ["bom", "line-wo-impact", templateId, lineId],
    queryFn: () =>
      request<{ data: BomLineWoImpact }>(
        `/api/bom/templates/${templateId}/lines/${lineId}/wo-impact`,
      ),
    enabled: !!templateId && !!lineId,
    staleTime: 10_000,
  });
}

export interface MoveBomLineVars {
  lineId: string;
  newParentLineId: string | null;
  newPosition: number;
}

// ─────────────────────────────────────────────────────────
// V1.7-beta.2.3 — Grid snapshot hooks (useBomGrid / useSaveBomGrid) đã bị
// loại bỏ cùng Univer. BomGridPro dùng trực tiếp useBomTree +
// useUpdateBomLine — không còn snapshot JSON layer.
// ─────────────────────────────────────────────────────────
// Activity log hook
// ─────────────────────────────────────────────────────────

export interface BomWorkspaceSummary {
  bomTemplateId: string;
  ordersTotal: number;
  ordersActive: number;
  /** V4.5 QA-C P2-4 — MỌI trạng thái, khớp số dòng tab "Lệnh SX" (WorkOrdersPanel mặc định không lọc). */
  workOrdersTotal: number;
  workOrdersActive: number;
  /** V1.8 batch 4 — WO IN_PROGRESS|PAUSED (cho tab Lắp ráp badge). */
  assemblyInProgress: number;
  shortageComponents: number;
  ecoTotal: number;
  ecoActive: number;
  /** V1.8 batch 4 — PR chưa CONVERTED/REJECTED + PO chưa RECEIVED/CANCELLED/CLOSED. */
  procurementActive: number;
  prActive: number;
  poActive: number;
  lineCount: number;
}

/**
 * V1.6 — aggregate KPI cho BOM workspace (feed ContextualSidebar badges
 * + KPI header). 1 round-trip thay vì 5 API call.
 */
export function useBomWorkspaceSummary(
  bomId: string | null,
  enabled = true,
) {
  return useQuery<{ data: BomWorkspaceSummary }>({
    queryKey: ["bom", "workspace-summary", bomId],
    queryFn: async () => {
      const res = await fetch(`/api/bom/templates/${bomId}/summary`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return (await res.json()) as { data: BomWorkspaceSummary };
    },
    enabled: enabled && !!bomId,
    staleTime: 30_000,
    refetchInterval: 60_000,
  });
}

export interface ActivityLogEntry {
  id: number;
  userId: string | null;
  action: string;
  diffJson: unknown;
  at: string;
}

export function useActivityLog(entityType: string, entityId: string, enabled = true) {
  return useQuery<{ data: ActivityLogEntry[] }>({
    queryKey: qk.bom.activityLog(entityId),
    queryFn: async () => {
      const res = await fetch(
        `/api/activity-log?entityType=${encodeURIComponent(entityType)}&entityId=${encodeURIComponent(entityId)}&limit=20`,
      );
      if (!res.ok) throw new Error("Không tải được lịch sử");
      return (await res.json()) as { data: ActivityLogEntry[] };
    },
    staleTime: 10_000,
    enabled: enabled && !!entityId,
  });
}

// ─────────────────────────────────────────────────────────
// Derived status hook
// ─────────────────────────────────────────────────────────

export interface ComponentMaterialStatus {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  totalRequired: string;
  totalReceived: string;
  totalShort: string;
  status: string;
  orderCount: number;
  /** V1.9 Phase 2 — tiến độ % thật (0-100). */
  pct?: number;
  /** V1.9 Phase 2 — 5 mốc tiến độ kind=com. */
  milestones?: {
    planned: boolean;
    purchasing: boolean;
    purchased: boolean;
    available: boolean;
    issued: boolean;
  };
  totalPurchased?: string;
  totalAvailable?: string;
  totalIssued?: string;
}

export interface DerivedStatusSummary {
  templateId: string;
  componentStatuses: ComponentMaterialStatus[];
  overallStatus: string;
  totalComponents: number;
  availableComponents: number;
}

export function useBomDerivedStatus(templateId: string, enabled = true) {
  return useQuery<{ data: DerivedStatusSummary }>({
    queryKey: qk.bom.derivedStatus(templateId),
    queryFn: async () => {
      const res = await fetch(`/api/bom/templates/${templateId}/derived-status`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error("Không tải được material status");
      return (await res.json()) as { data: DerivedStatusSummary };
    },
    // V3.7.50 — auto refresh giống fab-progress để bắt PO/Stock mới mà không cần reload.
    staleTime: 15_000,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: enabled && !!templateId,
  });
}

// ─────────────────────────────────────────────────────────
// V1.7-beta.2.6 — Fab progress (WO linked to BOM fab lines)
// ─────────────────────────────────────────────────────────

export interface FabProgressEntry {
  woId: string;
  woNo: string;
  status: string;
  plannedQty: string;
  goodQty: string;
  scrapQty: string;
  /** V1.9 Phase 2 — tiến độ % thật (0-100). */
  pct?: number;
  /** V1.9 Phase 2 — 5 mốc tiến độ kind=fab. */
  milestones?: {
    waiting: boolean;
    inProgress: boolean;
    paused: boolean;
    qc: boolean;
    completed: boolean;
  };
}

export interface FabProgressResponse {
  data: {
    bomTemplateId: string;
    /** Map bomLineId → WO progress entry. */
    progress: Record<string, FabProgressEntry>;
  };
}

export function useBomFabProgress(templateId: string, enabled = true) {
  return useQuery<FabProgressResponse>({
    queryKey: ["bom", "fab-progress", templateId],
    queryFn: async () => {
      const res = await fetch(
        `/api/bom/templates/${templateId}/fab-progress`,
        { credentials: "include" },
      );
      if (!res.ok) throw new Error("Không tải được tiến độ gia công");
      return (await res.json()) as FabProgressResponse;
    },
    staleTime: 15_000,
    refetchInterval: 60_000,
    enabled: enabled && !!templateId,
  });
}

// ─────────────────────────────────────────────────────────
// V2.0 P2 W6 — TASK-20260427-013
// Gộp tabs Order detail (Snapshot Board / Sản xuất / Lịch sử) vào BOM workspace.
// ─────────────────────────────────────────────────────────

export interface BomWorkOrderSummaryItem {
  id: string;
  woNo: string;
  status: string;
  priority: string;
  orderNo: string | null;
  plannedQty: number;
  goodQty: number;
  scrapQty: number;
  progressPct: number;
  plannedStart: string | null;
  plannedEnd: string | null;
}

export interface BomProductionSummary {
  bomTemplateId: string;
  totalWorkOrders: number;
  doneWorkOrders: number;
  inProgressWorkOrders: number;
  donePct: number;
  totalPlannedQty: number;
  totalGoodQty: number;
  totalScrapQty: number;
  qtyDonePct: number;
  recentWorkOrders: BomWorkOrderSummaryItem[];
  snapshotSummary: {
    totalLines: number;
    shortageLines: number;
    materialReadyPct: number;
  } | null;
}

export function useBomProductionSummary(
  bomId: string | null,
  enabled = true,
) {
  return useQuery<{ data: BomProductionSummary }>({
    queryKey: ["bom", "production-summary", bomId],
    queryFn: () =>
      request<{ data: BomProductionSummary }>(
        `/api/bom/templates/${bomId}/production-summary`,
      ),
    enabled: enabled && !!bomId,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}

export interface BomAuditLogRow {
  id: string;
  action: string;
  objectType: string;
  objectId: string | null;
  actorUsername: string | null;
  notes: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  occurredAt: string;
}

export function useBomAuditLog(bomId: string | null, enabled = true) {
  return useQuery<{ data: BomAuditLogRow[] }>({
    queryKey: ["bom", "audit-log", bomId],
    queryFn: () =>
      request<{ data: BomAuditLogRow[] }>(
        `/api/bom/templates/${bomId}/audit`,
      ),
    enabled: enabled && !!bomId,
    staleTime: 30_000,
  });
}
