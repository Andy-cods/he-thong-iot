"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

/**
 * V1.3 Reservation TanStack hooks.
 */

export interface ReserveResult {
  reservationId: string;
  lotId: string;
  lotCode: string | null;
  serialCode: string | null;
  reservedQty: number;
  reason: "AUTO_FIFO" | "AUTO_FEFO" | "MANUAL" | "OVERRIDE";
}

export interface BulkReserveResult {
  successCount: number;
  failures: Array<{ snapshotLineId: string; error: string; code: string }>;
  reservations: ReserveResult[];
}

interface RequestError extends Error {
  status?: number;
  code?: string;
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
      error?: { message?: string; code?: string };
    };
    const err = new Error(
      body.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = body.error?.code;
    throw err;
  }
  return (await res.json()) as T;
}

export interface ReserveInput {
  snapshotLineId: string;
  qty: number;
  woId?: string;
  manualLotId?: string;
}

export function useReserveLine() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ReserveInput) =>
      request<{ data: ReserveResult }>("/api/reservations/reserve", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({
        queryKey: qk.reservations.bySnapshot(vars.snapshotLineId),
      });
      qc.invalidateQueries({ queryKey: qk.reservations.all });
    },
  });
}

export function useBulkReserve() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { snapshotLineIds: string[]; woId?: string }) =>
      request<{ data: BulkReserveResult }>("/api/reservations/bulk-reserve", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.reservations.all });
    },
  });
}

export function useReleaseReservation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; reason?: string }) =>
      request<{ data: unknown }>(`/api/reservations/${data.id}`, {
        method: "DELETE",
        body: JSON.stringify({ reason: data.reason }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.snapshots.all });
      qc.invalidateQueries({ queryKey: qk.reservations.all });
    },
  });
}
