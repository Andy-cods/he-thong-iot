"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { BarcodeCreate, BarcodeUpdate } from "@iot/shared";

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    // V4.1 UI-05: gắn status để QueryError phân biệt 429/403/500.
    const err = new Error(body?.error?.message ?? `HTTP ${res.status}`) as Error & {
      status?: number;
      details?: unknown;
    };
    err.status = res.status;
    err.details = body?.error?.details;
    throw err;
  }
  return (await res.json()) as T;
}

export function useBarcodes(itemId: string | null) {
  return useQuery({
    queryKey: ["barcodes", itemId],
    queryFn: () =>
      request<{ data: unknown[] }>(`/api/items/${itemId}/barcodes`),
    enabled: !!itemId,
  });
}

export function useCreateBarcode(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BarcodeCreate) =>
      request(`/api/items/${itemId}/barcodes`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["barcodes", itemId] }),
  });
}

export function useUpdateBarcode(itemId: string, barcodeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: BarcodeUpdate) =>
      request(`/api/items/${itemId}/barcodes/${barcodeId}`, {
        method: "PATCH",
        body: JSON.stringify(input),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["barcodes", itemId] }),
  });
}

export function useDeleteBarcode(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (barcodeId: string) =>
      request(`/api/items/${itemId}/barcodes/${barcodeId}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["barcodes", itemId] }),
  });
}

export function useSetPrimaryBarcode(itemId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (barcodeId: string) =>
      request(`/api/items/${itemId}/barcodes/${barcodeId}/primary`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["barcodes", itemId] }),
  });
}
