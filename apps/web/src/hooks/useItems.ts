"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemCreate, ItemListQuery, ItemUpdate } from "@iot/shared";
import { qk, type ItemFilter } from "@/lib/query-keys";

export interface ItemListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export interface RequestError extends Error {
  status?: number;
  code?: string;
  fields?: Record<string, string>;
  payload?: unknown;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as RequestError;
    err.status = res.status;
    err.code = body?.error?.code;
    err.fields = body?.error?.fields;
    err.payload = body;
    throw err;
  }
  return (await res.json()) as T;
}

function buildItemListUrl(q: Partial<ItemListQuery>): string {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  if (q.sort) p.set("sort", q.sort);
  if (q.isActive !== undefined) p.set("isActive", String(q.isActive));
  for (const t of q.type ?? []) p.append("type", t);
  for (const u of q.uom ?? []) p.append("uom", u);
  for (const s of q.status ?? []) p.append("status", s);
  // V1.9 P6 — category filter (single)
  if (q.category) p.set("category", q.category);
  for (const c of q.categories ?? []) p.append("categories", c);
  return `/api/items?${p.toString()}`;
}

/**
 * Chuyển ItemFilter (UI) sang ItemListQuery (API) — normalize + strip empty.
 */
export function filterToListQuery(
  filter: ItemFilter,
): Partial<ItemListQuery> {
  const query: Partial<ItemListQuery> = {
    page: filter.page ?? 1,
    pageSize: filter.pageSize ?? 50,
    sort: (filter.sort as ItemListQuery["sort"]) ?? "-updatedAt",
  };
  if (filter.q && filter.q.trim()) {
    // brainstorm-deep §5.1 — client-side normalize NFD strip diacritics
    // nếu feature flag FEATURE_UNACCENT disabled → vẫn gửi raw để server match ILIKE
    query.q = filter.q.trim();
  }
  if (filter.type && filter.type.length > 0) {
    query.type = filter.type as ItemListQuery["type"];
  }
  if (filter.uom && filter.uom.length > 0) {
    query.uom = filter.uom as ItemListQuery["uom"];
  }
  if (filter.status && filter.status.length > 0) {
    query.status = filter.status as ItemListQuery["status"];
  }
  if (filter.active !== undefined) {
    query.isActive = filter.active;
  } else {
    query.isActive = true;
  }
  if (filter.category && filter.category.trim()) {
    query.category = filter.category.trim();
  }
  return query;
}

/**
 * V1.9 P6 — list distinct categories với count.
 * Dùng cho Filter dropdown "Danh mục" trong /items page.
 * Stale 5 phút vì category hiếm thay đổi.
 */
export interface ItemCategory {
  category: string;
  count: number;
}

export function useItemCategories() {
  return useQuery({
    queryKey: qk.items.categories,
    queryFn: () => request<{ data: ItemCategory[] }>(`/api/items/categories`),
    staleTime: 5 * 60_000,
  });
}

export function useItemsList<T = unknown>(filter: ItemFilter) {
  const query = filterToListQuery(filter);
  return useQuery({
    queryKey: qk.items.list(filter),
    queryFn: () => request<ItemListResponse<T>>(buildItemListUrl(query)),
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useItem(id: string | null) {
  return useQuery({
    queryKey: id ? qk.items.detail(id) : ["items", "detail", "__none__"],
    queryFn: () => request<{ data: unknown }>(`/api/items/${id}`),
    enabled: !!id,
  });
}

/** V1.8 Batch 3 — shape response của GET /api/items/[id]/bom-usages. */
export interface ItemBomUsageLine {
  lineId: string;
  quantityPer: number;
  scrapPct: number;
  metadata: unknown;
  childCount: number;
  parentItemId: string | null;
}

export interface ItemBomUsageTemplate {
  templateId: string;
  templateCode: string;
  templateName: string;
  templateStatus: "DRAFT" | "ACTIVE" | "OBSOLETE";
  usages: ItemBomUsageLine[];
}

export interface ItemBomUsagesResponse {
  itemId: string;
  totalUsages: number;
  byTemplate: ItemBomUsageTemplate[];
}

/**
 * V1.8 Batch 3 — hook danh sách BOM đang dùng 1 linh kiện.
 * Dùng trong tab "Dùng trong BOM" của `/items/[id]`.
 */
export function useItemBomUsages(id: string | null) {
  return useQuery({
    queryKey: id ? qk.items.bomUsages(id) : ["items", "bom-usages", "__none__"],
    queryFn: () =>
      request<{ data: ItemBomUsagesResponse }>(
        `/api/items/${id}/bom-usages`,
      ),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCheckSku(sku: string) {
  return useQuery({
    queryKey: qk.items.skuCheck(sku),
    queryFn: () =>
      request<{ data: { exists: boolean } }>(
        `/api/items/check-sku?sku=${encodeURIComponent(sku)}`,
      ),
    enabled: !!sku && sku.length >= 2,
    staleTime: 10_000,
  });
}

export function useCreateItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemCreate) =>
      request<{ data: { id?: string } }>(`/api/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.items.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

type ItemDetailShape = Record<string, unknown> & {
  id: string;
  updatedAt?: string;
};

interface UpdateVariables {
  data: ItemUpdate;
  /** baseUpdatedAt gửi qua header If-Unmodified-Since để detect 409 (brainstorm-deep §2.3). */
  baseUpdatedAt?: string | null;
}

/**
 * Optimistic update với snapshot list + detail (brainstorm-deep §1.4 Flow A).
 * Rollback khi server 409/422 hoặc lỗi mạng.
 */
export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ data, baseUpdatedAt }: UpdateVariables) =>
      request<{ data: ItemDetailShape }>(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
        headers: {
          "content-type": "application/json",
          ...(baseUpdatedAt
            ? { "If-Unmodified-Since": baseUpdatedAt }
            : {}),
        },
      }),
    onMutate: async ({ data }) => {
      await qc.cancelQueries({ queryKey: qk.items.detail(id) });
      await qc.cancelQueries({ queryKey: qk.items.all });

      const prevDetail = qc.getQueryData<{ data: ItemDetailShape }>(
        qk.items.detail(id),
      );
      const prevLists = qc.getQueriesData<ItemListResponse<ItemDetailShape>>({
        queryKey: ["items", "list"],
      });

      // Optimistic patch detail
      if (prevDetail?.data) {
        qc.setQueryData(qk.items.detail(id), {
          ...prevDetail,
          data: { ...prevDetail.data, ...data },
        });
      }
      // Optimistic patch rows in all list caches
      for (const [key, list] of prevLists) {
        if (!list?.data) continue;
        qc.setQueryData(key, {
          ...list,
          data: list.data.map((row) =>
            row.id === id ? { ...row, ...data } : row,
          ),
        });
      }
      return { prevDetail, prevLists };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      if (ctx.prevDetail) {
        qc.setQueryData(qk.items.detail(id), ctx.prevDetail);
      }
      for (const [key, list] of ctx.prevLists) {
        qc.setQueryData(key, list);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.items.all });
    },
  });
}

/**
 * Optimistic delete — remove khỏi list ngay, rollback nếu server lỗi.
 * Undo 5s được handle ở UI layer (Sonner toast action) — brainstorm-deep §1.4 Flow C.
 */
export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: unknown }>(`/api/items/${id}`, {
        method: "DELETE",
      }),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: qk.items.all });
      const prevLists = qc.getQueriesData<ItemListResponse<ItemDetailShape>>({
        queryKey: ["items", "list"],
      });
      for (const [key, list] of prevLists) {
        if (!list?.data) continue;
        qc.setQueryData(key, {
          ...list,
          data: list.data.filter((row) => row.id !== id),
          meta: list.meta
            ? { ...list.meta, total: Math.max(0, (list.meta.total ?? 0) - 1) }
            : list.meta,
        });
      }
      return { prevLists };
    },
    onError: (_err, _vars, ctx) => {
      if (!ctx) return;
      for (const [key, list] of ctx.prevLists) {
        qc.setQueryData(key, list);
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: qk.items.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useRestoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: unknown }>(`/api/items/${id}/restore`, {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.items.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

/**
 * Bulk delete — gọi DELETE từng id song song (Promise.allSettled để không fail-fast).
 * Server chưa có endpoint /api/items/bulk → stub FE với TODO, loop DELETE tuần tự.
 * TODO(V1.1): thay bằng POST /api/items/bulk khi backend ready.
 */
export function useBulkDeleteItems() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      ids: string[],
    ): Promise<{ success: number; failed: { id: string; reason: string }[] }> => {
      const results = await Promise.allSettled(
        ids.map((id) =>
          request<{ data: unknown }>(`/api/items/${id}`, { method: "DELETE" }),
        ),
      );
      let success = 0;
      const failed: { id: string; reason: string }[] = [];
      results.forEach((r, i) => {
        if (r.status === "fulfilled") success++;
        else failed.push({ id: ids[i]!, reason: (r.reason as Error)?.message ?? "Lỗi không xác định" });
      });
      return { success, failed };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.items.all });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}
