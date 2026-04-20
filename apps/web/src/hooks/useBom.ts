"use client";

import * as React from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  BomLineCreate,
  BomLineMove,
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
  level: number;
  position: number;
  qtyPerParent: string;
  scrapPercent: string;
  uom: string | null;
  description: string | null;
  supplierItemCode: string | null;
  metadata: Record<string, unknown>;
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

/** Dedicated tree fetch — dùng khi cần re-fetch độc lập metadata. */
export function useBomTree(id: string | null) {
  return useQuery({
    queryKey: id ? qk.bom.tree(id) : ["bom", "tree", "__none__"],
    queryFn: () =>
      request<BomTreeResponse>(`/api/bom/templates/${id}/tree`),
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
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
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
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
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

export interface MoveBomLineVars {
  lineId: string;
  newParentLineId: string | null;
  newPosition: number;
}

/**
 * Move line với optimistic update trên tree cache — cross-parent support.
 *
 * Flow:
 *   1. onMutate: cập nhật parentLineId + position ngay lập tức trên cache
 *      (`qk.bom.detail` + `qk.bom.tree`). KHÔNG update `level` optimistic vì
 *      subtree shift phức tạp — server trả `newLevel` + `shift` qua response,
 *      onSettled refetch sẽ lấy level đúng.
 *   2. onError (409/422 MAX_DEPTH_EXCEEDED, CANNOT_MOVE_INTO_DESCENDANT):
 *      rollback cache về snapshot trước mutation.
 *   3. onSettled: invalidate detail + tree → refetch level đúng từ server.
 */
export function useMoveBomLine(templateId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: MoveBomLineVars) => {
      const body: BomLineMove = {
        newParentLineId: vars.newParentLineId,
        newPosition: vars.newPosition,
      };
      return request<{
        data: { id: string; newLevel: number; shift: number };
      }>(
        `/api/bom/templates/${templateId}/lines/${vars.lineId}/move`,
        {
          method: "POST",
          body: JSON.stringify(body),
        },
      );
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: qk.bom.detail(templateId) });
      await qc.cancelQueries({ queryKey: qk.bom.tree(templateId) });

      const prevDetail = qc.getQueryData<BomDetailResponse>(
        qk.bom.detail(templateId),
      );
      const prevTree = qc.getQueryData<BomTreeResponse>(
        qk.bom.tree(templateId),
      );

      const updateTree = (nodes: BomTreeNodeRaw[]): BomTreeNodeRaw[] =>
        nodes.map((n) =>
          n.id === vars.lineId
            ? {
                ...n,
                parentLineId: vars.newParentLineId,
                position: vars.newPosition,
              }
            : n,
        );

      if (prevDetail?.data) {
        qc.setQueryData<BomDetailResponse>(qk.bom.detail(templateId), {
          ...prevDetail,
          data: { ...prevDetail.data, tree: updateTree(prevDetail.data.tree) },
        });
      }
      if (prevTree?.data) {
        qc.setQueryData<BomTreeResponse>(qk.bom.tree(templateId), {
          data: { tree: updateTree(prevTree.data.tree) },
        });
      }

      return { prevDetail, prevTree };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevDetail) {
        qc.setQueryData(qk.bom.detail(templateId), ctx.prevDetail);
      }
      if (ctx.prevTree) {
        qc.setQueryData(qk.bom.tree(templateId), ctx.prevTree);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.bom.detail(templateId) });
      qc.invalidateQueries({ queryKey: qk.bom.tree(templateId) });
    },
  });
}
