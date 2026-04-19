"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

/**
 * V1.3 Phase B3 — Assembly scan hooks.
 */

export interface WoProgressReservation {
  reservationId: string;
  lotId: string;
  lotCode: string | null;
  reservedQty: number;
  status: string;
}

export interface WoProgressLine {
  snapshotLineId: string;
  componentSku: string;
  componentName: string;
  requiredQty: number;
  completedQty: number;
  issuedQty: number;
  assembledQty: number;
  reservedQty: number;
  remainingQty: number;
  state: string;
  reservations: WoProgressReservation[];
}

export interface WoProgress {
  woId: string;
  woNo: string;
  status: string;
  totalRequired: number;
  totalCompleted: number;
  progressPercent: number;
  lines: WoProgressLine[];
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
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useWoProgress(woId: string | null) {
  return useQuery({
    queryKey: woId
      ? ([...qk.workOrders.detail(woId), "progress"] as const)
      : (["workOrders", "progress", "__none__"] as const),
    queryFn: () =>
      request<{ data: WoProgress }>(`/api/assembly/wo/${woId}/progress`),
    enabled: !!woId,
    staleTime: 5_000,
  });
}

export interface AssemblyScanInput {
  scanId: string;
  woId: string;
  snapshotLineId: string;
  lotSerialId: string;
  qty: number;
  barcode: string;
  scannedAt: string;
  deviceId?: string | null;
}

export function useAssemblyScan(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AssemblyScanInput) =>
      request<{
        data: {
          scanId: string;
          idempotent: boolean;
          snapshotLineState: string;
          lotStatus: string;
          consumedQty: number;
          reservationStatus: string;
          completedQty: number;
          requiredQty: number;
        };
      }>(`/api/assembly/scan`, {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
      qc.invalidateQueries({
        queryKey: [...qk.workOrders.detail(woId), "progress"],
      });
    },
  });
}

export function useCompleteWoViaAssembly(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: { id: string; status: string } }>(
        `/api/assembly/wo/${woId}/complete`,
        {
          method: "POST",
          body: JSON.stringify({}),
        },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.detail(woId) });
      qc.invalidateQueries({ queryKey: qk.workOrders.all });
    },
  });
}
