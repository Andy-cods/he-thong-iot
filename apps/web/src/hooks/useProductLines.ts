"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk, type ProductLineFilter } from "@/lib/query-keys";

export interface ProductLineRow {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  memberCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductLineMemberRow {
  memberId: string;
  position: number;
  role: string | null;
  bomId: string;
  bomCode: string;
  bomName: string;
  bomStatus: string;
  targetQty: string;
  parentItemSku: string | null;
  parentItemName: string | null;
  componentCount: number;
}

export interface ProductLineDetail {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: string;
  ownerUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

async function apiFetch<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const res = await fetch(input, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ── List ──────────────────────────────────────────────────────────────────────

export function useProductLineList(filter: ProductLineFilter) {
  return useQuery({
    queryKey: qk.productLines.list(filter),
    queryFn: () => {
      const p = new URLSearchParams();
      if (filter.q) p.set("q", filter.q);
      if (filter.status?.length) p.set("status", filter.status.join(","));
      p.set("page", String(filter.page ?? 1));
      p.set("pageSize", String(filter.pageSize ?? 20));
      return apiFetch<{ data: ProductLineRow[]; meta: { total: number } }>(
        `/api/product-lines?${p.toString()}`,
      );
    },
    staleTime: 15_000,
  });
}

// ── Detail ────────────────────────────────────────────────────────────────────

export function useProductLineDetail(id: string | null) {
  return useQuery({
    queryKey: id ? qk.productLines.detail(id) : ["productLines", "detail", "__none__"],
    queryFn: () =>
      apiFetch<{ data: ProductLineDetail }>(`/api/product-lines/${id}`),
    enabled: !!id,
    staleTime: 15_000,
  });
}

// ── Members ───────────────────────────────────────────────────────────────────

export function useProductLineMembers(id: string | null) {
  return useQuery({
    queryKey: id ? qk.productLines.members(id) : ["productLines", "members", "__none__"],
    queryFn: () =>
      apiFetch<{ data: ProductLineMemberRow[] }>(
        `/api/product-lines/${id}/members`,
      ),
    enabled: !!id,
    staleTime: 15_000,
  });
}

export function useAddProductLineMember(productLineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bomTemplateId: string) =>
      apiFetch(`/api/product-lines/${productLineId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bomTemplateId }),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.productLines.members(productLineId) });
      void qc.invalidateQueries({ queryKey: qk.productLines.detail(productLineId) });
    },
  });
}

export function useRemoveProductLineMember(productLineId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (bomTemplateId: string) =>
      apiFetch(`/api/product-lines/${productLineId}/members/${bomTemplateId}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.productLines.members(productLineId) });
      void qc.invalidateQueries({ queryKey: qk.productLines.detail(productLineId) });
    },
  });
}

// ── Related data ──────────────────────────────────────────────────────────────

export function useProductLineOrders(id: string | null) {
  return useQuery({
    queryKey: id ? qk.productLines.orders(id) : ["productLines", "orders", "__none__"],
    queryFn: () =>
      apiFetch<{ data: unknown[] }>(`/api/product-lines/${id}/orders`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useProductLineWorkOrders(id: string | null) {
  return useQuery({
    queryKey: id ? qk.productLines.workOrders(id) : ["productLines", "workOrders", "__none__"],
    queryFn: () =>
      apiFetch<{ data: unknown[] }>(`/api/product-lines/${id}/work-orders`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useProductLinePurchaseOrders(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.productLines.purchaseOrders(id)
      : ["productLines", "purchaseOrders", "__none__"],
    queryFn: () =>
      apiFetch<{ data: unknown[] }>(`/api/product-lines/${id}/purchase-orders`),
    enabled: !!id,
    staleTime: 30_000,
  });
}

// ── Create / Update ───────────────────────────────────────────────────────────

export interface ProductLineCreateInput {
  code: string;
  name: string;
  description?: string;
}

export function useCreateProductLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProductLineCreateInput) =>
      apiFetch<{ data: ProductLineDetail }>("/api/product-lines", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.productLines.all });
    },
  });
}

export interface ProductLineUpdateInput {
  name?: string;
  description?: string | null;
  status?: "ACTIVE" | "ARCHIVED";
}

export function useUpdateProductLine(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: ProductLineUpdateInput) =>
      apiFetch<{ data: ProductLineDetail }>(`/api/product-lines/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.productLines.detail(id) });
      void qc.invalidateQueries({ queryKey: qk.productLines.all });
    },
  });
}
