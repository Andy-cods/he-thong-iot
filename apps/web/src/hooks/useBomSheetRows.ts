"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MaterialRowCreate,
  MaterialRowStatus,
  MaterialRowUpdate,
  ProcessRowCreate,
  ProcessRowUpdate,
} from "@iot/shared";

/**
 * V2.0 Sprint 6 FIX — hooks material/process rows per sheet.
 */

export interface MaterialRowRecord {
  id: string;
  sheetId: string;
  materialCode: string | null;
  nameOverride: string | null;
  componentLineId: string | null;
  pricePerKg: string | null;
  qtyKg: string | null;
  blankSize: Record<string, unknown>;
  supplierCode: string | null;
  status: MaterialRowStatus;
  purchaseOrderCode: string | null;
  notes: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessRowRecord {
  id: string;
  sheetId: string;
  processCode: string | null;
  nameOverride: string | null;
  componentLineId: string | null;
  hoursEstimated: string | null;
  pricePerUnit: string | null;
  pricingUnit: string;
  stationCode: string | null;
  notes: string | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

const materialKey = (sheetId: string) =>
  ["bom", "sheets", sheetId, "material-rows"] as const;
const processKey = (sheetId: string) =>
  ["bom", "sheets", sheetId, "process-rows"] as const;

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    const err = new Error(body.error?.message ?? `HTTP ${res.status}`);
    (err as { code?: string }).code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

// Material
export function useMaterialRowsList(sheetId: string | null) {
  return useQuery({
    queryKey: sheetId
      ? materialKey(sheetId)
      : (["bom", "sheets", "__none__", "material-rows"] as const),
    queryFn: () =>
      apiFetch<{ data: MaterialRowRecord[] }>(
        `/api/bom/sheets/${sheetId}/material-rows`,
      ),
    enabled: !!sheetId,
    placeholderData: keepPreviousData,
  });
}

export function useCreateMaterialRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MaterialRowCreate) =>
      apiFetch<{ data: MaterialRowRecord }>(
        `/api/bom/sheets/${sheetId}/material-rows`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKey(sheetId) }),
  });
}

export function useUpdateMaterialRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rowId: string; patch: MaterialRowUpdate }) =>
      apiFetch<{ data: MaterialRowRecord }>(
        `/api/bom/sheets/${sheetId}/material-rows/${input.rowId}`,
        { method: "PATCH", body: JSON.stringify(input.patch) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKey(sheetId) }),
  });
}

export function useDeleteMaterialRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) =>
      apiFetch<{ data: MaterialRowRecord }>(
        `/api/bom/sheets/${sheetId}/material-rows/${rowId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: materialKey(sheetId) }),
  });
}

// Process
export function useProcessRowsList(sheetId: string | null) {
  return useQuery({
    queryKey: sheetId
      ? processKey(sheetId)
      : (["bom", "sheets", "__none__", "process-rows"] as const),
    queryFn: () =>
      apiFetch<{ data: ProcessRowRecord[] }>(
        `/api/bom/sheets/${sheetId}/process-rows`,
      ),
    enabled: !!sheetId,
    placeholderData: keepPreviousData,
  });
}

export function useCreateProcessRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProcessRowCreate) =>
      apiFetch<{ data: ProcessRowRecord }>(
        `/api/bom/sheets/${sheetId}/process-rows`,
        { method: "POST", body: JSON.stringify(input) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: processKey(sheetId) }),
  });
}

export function useUpdateProcessRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { rowId: string; patch: ProcessRowUpdate }) =>
      apiFetch<{ data: ProcessRowRecord }>(
        `/api/bom/sheets/${sheetId}/process-rows/${input.rowId}`,
        { method: "PATCH", body: JSON.stringify(input.patch) },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: processKey(sheetId) }),
  });
}

export function useDeleteProcessRow(sheetId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (rowId: string) =>
      apiFetch<{ data: ProcessRowRecord }>(
        `/api/bom/sheets/${sheetId}/process-rows/${rowId}`,
        { method: "DELETE" },
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: processKey(sheetId) }),
  });
}
