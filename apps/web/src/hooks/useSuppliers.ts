"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  BankInfo,
  ContactPerson,
  ItemSupplierCreate,
  ItemSupplierUpdate,
  SupplierCreate,
  SupplierUpdate,
} from "@iot/shared";
import { qk } from "@/lib/query-keys";

export interface SupplierRow {
  id: string;
  code: string;
  name: string;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  taxCode: string | null;
  isActive: boolean;
  // V1.9 P7 extend
  region?: string | null;
  city?: string | null;
  ward?: string | null;
  streetAddress?: string | null;
  factoryAddress?: string | null;
  latitude?: string | null;
  longitude?: string | null;
  website?: string | null;
  bankInfo?: BankInfo | null;
  paymentTerms?: string | null;
  contactPersons?: ContactPerson[] | null;
  internalNotes?: string | null;
  itemCount?: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface SupplierItemSuppliedRow {
  id: string;
  itemId: string;
  sku: string;
  name: string;
  category: string | null;
  uom: string;
  isActive: boolean;
  supplierSku: string | null;
  vendorItemCode: string | null;
  priceRef: string | null;
  currency: string;
  leadTimeDays: number;
  moq: string;
  packSize: string;
  isPreferred: boolean;
  createdAt: string;
}

export interface SupplierTopItemRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  poCount: number;
  totalQty: string;
  totalSpend: string;
  avgUnitPrice: string;
  lastOrderDate: string | null;
}

export interface SupplierPoStats {
  totalPoCount: number;
  totalSpend: number;
  ytdSpend: number;
  ytdPoCount: number;
  avgLeadTimeDays: number;
  onTimeRate: number;
  recentPurchaseOrders: Array<{
    id: string;
    poNo: string;
    status: string;
    orderDate: string;
    expectedEta: string | null;
    totalAmount: string;
    currency: string;
  }>;
}

export interface SupplierRegion {
  region: string;
  count: number;
}

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

export function useSuppliersList(q: {
  q?: string;
  region?: string;
  page?: number;
  pageSize?: number;
  isActive?: boolean;
  sort?: "code" | "name" | "region" | "createdAt";
}) {
  const p = new URLSearchParams();
  if (q.q) p.set("q", q.q);
  if (q.region) p.set("region", q.region);
  if (q.page) p.set("page", String(q.page));
  if (q.pageSize) p.set("pageSize", String(q.pageSize));
  if (q.isActive !== undefined) p.set("isActive", String(q.isActive));
  if (q.sort) p.set("sort", q.sort);
  return useQuery({
    queryKey: ["suppliers", q],
    queryFn: () =>
      request<{
        data: SupplierRow[];
        meta: { page: number; pageSize: number; total: number };
      }>(`/api/suppliers?${p.toString()}`),
  });
}

export function useSupplierRegions() {
  return useQuery({
    queryKey: ["supplier-regions"],
    queryFn: () =>
      request<{ data: SupplierRegion[] }>(`/api/suppliers/regions`),
  });
}

export function useSupplier(id: string | null) {
  return useQuery({
    queryKey: ["supplier", id],
    queryFn: () => request<{ data: SupplierRow }>(`/api/suppliers/${id}`),
    enabled: !!id,
  });
}

export function useSupplierItemsSupplied(
  id: string | null,
  opts: { q?: string; category?: string } = {},
) {
  const p = new URLSearchParams();
  if (opts.q) p.set("q", opts.q);
  if (opts.category) p.set("category", opts.category);
  return useQuery({
    queryKey: ["supplier-items-supplied", id, opts],
    queryFn: () =>
      request<{
        data: SupplierItemSuppliedRow[];
        meta: { total: number; limit: number; offset: number };
      }>(`/api/suppliers/${id}/items-supplied?${p.toString()}`),
    enabled: !!id,
  });
}

export function useSupplierTopItems(id: string | null, limit = 20) {
  return useQuery({
    queryKey: ["supplier-top-items", id, limit],
    queryFn: () =>
      request<{ data: SupplierTopItemRow[] }>(
        `/api/suppliers/${id}/top-items?limit=${limit}`,
      ),
    enabled: !!id,
  });
}

export function useSupplierPoStats(id: string | null) {
  return useQuery({
    queryKey: ["supplier-po-stats", id],
    queryFn: () =>
      request<{ data: SupplierPoStats }>(`/api/suppliers/${id}/po-stats`),
    enabled: !!id,
  });
}

export function useCreateSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierCreate) =>
      request<{ data: SupplierRow }>(`/api/suppliers`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
  });
}

export function useUpdateSupplier(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SupplierUpdate) =>
      request<{ data: SupplierRow }>(`/api/suppliers/${id}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: ["supplier", id] });
    },
  });
}

export function useDeleteSupplier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request(`/api/suppliers/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["suppliers"] });
      qc.invalidateQueries({ queryKey: qk.dashboard.overview });
    },
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
