"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ItemCreate, ItemListQuery, ItemUpdate } from "@iot/shared";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = body?.error?.message ?? `HTTP ${res.status}`;
    const err = new Error(msg) as Error & { status?: number; code?: string; fields?: Record<string, string> };
    err.status = res.status;
    err.code = body?.error?.code;
    err.fields = body?.error?.fields;
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
  return `/api/items?${p.toString()}`;
}

export interface ItemListResponse<T> {
  data: T[];
  meta: { page: number; pageSize: number; total: number };
}

export function useItemsList<T = unknown>(q: Partial<ItemListQuery>) {
  return useQuery({
    queryKey: ["items", q],
    queryFn: () => request<ItemListResponse<T>>(buildItemListUrl(q)),
    staleTime: 60_000,
    placeholderData: (prev) => prev,
  });
}

export function useItem(id: string | null) {
  return useQuery({
    queryKey: ["items", "detail", id],
    queryFn: () => request<{ data: unknown }>(`/api/items/${id}`),
    enabled: !!id,
  });
}

export function useCheckSku(sku: string) {
  return useQuery({
    queryKey: ["items", "check-sku", sku],
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
      request<{ data: unknown }>(`/api/items`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });
}

export function useUpdateItem(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ItemUpdate) =>
      request<{ data: unknown }>(`/api/items/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["items"] });
      qc.invalidateQueries({ queryKey: ["items", "detail", id] });
    },
  });
}

export function useDeleteItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: unknown }>(`/api/items/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });
}

export function useRestoreItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: unknown }>(`/api/items/${id}/restore`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["items"] }),
  });
}
