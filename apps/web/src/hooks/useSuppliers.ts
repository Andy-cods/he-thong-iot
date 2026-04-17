"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ItemSupplierCreate,
  ItemSupplierUpdate,
  SupplierCreate,
} from "@iot/shared";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useSuppliersList(q: { q?: string; page?: number; pageSize?: number; isActive?: boolean }) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  if (q.isActive !== undefined) p.set("isActive", String(q.isActive));
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: () =>
      request<{
        data: Array<{ id: string; code: string; name: string; isActive: boolean }>;
        meta: { page: number; pageSize: number; total: number };
      }>(`/api/suppliers?${p.toString()}`),
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierCreate) =>
      request(`/api/suppliers`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["suppliers"] }),
  });
}

export function useItemSuppliers(itemId: string | null) {
  return useQuery({
    queryKey: ["item-suppliers", itemId],
    queryFn: () =>
      request<{ data: unknown[] }>(`/api/items/${itemId}/suppliers`),
    enabled: !!itemId,
  });
}

export function useAddItemSupplier(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemSupplierCreate) =>
      request(`/api/items/${itemId}/suppliers`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-suppliers", itemId] }),
  });
}

export function useUpdateItemSupplier(itemId: string, sid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ItemSupplierUpdate) =>
      request(`/api/items/${itemId}/suppliers/${sid}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-suppliers", itemId] }),
  });
}

export function useRemoveItemSupplier(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) =>
      request(`/api/items/${itemId}/suppliers/${sid}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-suppliers", itemId] }),
  });
}

export function useSetPreferredItemSupplier(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sid: string) =>
      request(`/api/items/${itemId}/suppliers/${sid}/preferred`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["item-suppliers", itemId] }),
  });
}
