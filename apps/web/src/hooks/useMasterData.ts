"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type {
  MaterialMasterCreate,
  MaterialMasterUpdate,
  ProcessMasterCreate,
  ProcessMasterUpdate,
} from "@iot/shared";
import { qk } from "@/lib/query-keys";

/**
 * V2.0 — hooks cho admin master data: vật liệu + quy trình.
 * Mọi mutation tự invalidate list sau success.
 */

export interface MaterialRow {
  id: string;
  code: string;
  nameEn: string;
  nameVn: string;
  category: string | null;
  pricePerKg: string | null;
  densityKgM3: string | null;
  isActive: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProcessRow {
  id: string;
  code: string;
  nameEn: string;
  nameVn: string;
  pricePerUnit: string | null;
  pricingUnit: "HOUR" | "CM2" | "OTHER";
  pricingNote: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ListResponse<T> {
  data: T[];
  pagination: { page: number; pageSize: number; total: number };
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------

export interface MaterialFilter {
  q?: string;
  category?: string;
  isActive?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function useMaterialsList(filter: MaterialFilter) {
  return useQuery({
    queryKey: qk.admin.materials.list(filter as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, String(v));
        }
      });
      const qs = params.toString();
      return apiFetch<ListResponse<MaterialRow>>(
        `/api/master-data/materials${qs ? `?${qs}` : ""}`,
      );
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: MaterialMasterCreate) =>
      apiFetch<{ data: MaterialRow }>("/api/master-data/materials", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.materials.all });
    },
  });
}

export function useUpdateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: MaterialMasterUpdate }) =>
      apiFetch<{ data: MaterialRow }>(`/api/master-data/materials/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.admin.materials.all });
      qc.invalidateQueries({ queryKey: qk.admin.materials.detail(vars.id) });
    },
  });
}

export function useDeactivateMaterial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: MaterialRow; warning?: string | null }>(
        `/api/master-data/materials/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.materials.all });
    },
  });
}

// ---------------------------------------------------------------------------
// Processes
// ---------------------------------------------------------------------------

export interface ProcessFilter {
  q?: string;
  pricingUnit?: "HOUR" | "CM2" | "OTHER";
  isActive?: boolean;
  sort?: string;
  order?: "asc" | "desc";
  page?: number;
  pageSize?: number;
}

export function useProcessesList(filter: ProcessFilter) {
  return useQuery({
    queryKey: qk.admin.processes.list(filter as Record<string, unknown>),
    queryFn: () => {
      const params = new URLSearchParams();
      Object.entries(filter).forEach(([k, v]) => {
        if (v !== undefined && v !== null && v !== "") {
          params.set(k, String(v));
        }
      });
      const qs = params.toString();
      return apiFetch<ListResponse<ProcessRow>>(
        `/api/master-data/processes${qs ? `?${qs}` : ""}`,
      );
    },
    placeholderData: keepPreviousData,
  });
}

export function useCreateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ProcessMasterCreate) =>
      apiFetch<{ data: ProcessRow }>("/api/master-data/processes", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.processes.all });
    },
  });
}

export function useUpdateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { id: string; patch: ProcessMasterUpdate }) =>
      apiFetch<{ data: ProcessRow }>(`/api/master-data/processes/${input.id}`, {
        method: "PATCH",
        body: JSON.stringify(input.patch),
      }),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: qk.admin.processes.all });
      qc.invalidateQueries({ queryKey: qk.admin.processes.detail(vars.id) });
    },
  });
}

export function useDeactivateProcess() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ data: ProcessRow }>(`/api/master-data/processes/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.admin.processes.all });
    },
  });
}
