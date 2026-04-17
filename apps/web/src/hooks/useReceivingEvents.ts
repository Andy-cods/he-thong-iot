"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

/**
 * Receiving events hooks — Phase B2.7.
 * - useReplayQueue: POST /api/receiving/events batch replay from Dexie queue
 * - useReceivingHistory: GET events cho PO (V1.1-alpha trả [] stub)
 */

export interface ReceivingEventInput {
  id: string;
  scanId: string;
  poCode: string;
  sku: string;
  qty: number;
  lotNo?: string | null;
  qcStatus: "pass" | "fail";
  scannedAt: string;
  rawCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReplayResponse {
  data: {
    acked: string[];
    rejected: Array<{ id: string; reason: string }>;
    count: number;
  };
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

/**
 * Batch replay — POST events lên server. Server idempotent theo scanId.
 * Trả { acked, rejected, count }. acked = server đã persist OR đã tồn tại trước đó.
 */
export function useReplayQueue() {
  return useMutation({
    mutationFn: (events: ReceivingEventInput[]) =>
      request<ReplayResponse>("/api/receiving/events", {
        method: "POST",
        body: JSON.stringify({ events }),
      }),
  });
}

/**
 * History for PO — V1.1-alpha stub trả []. V1.2+: GET /api/receiving/events?poCode=
 */
export interface ReceivingHistoryResponse {
  data: Array<{
    id: string;
    scanId: string;
    sku: string;
    qty: number;
    qcStatus: "pass" | "fail";
    scannedAt: string;
  }>;
}

export function useReceivingHistory(poCode: string | null) {
  return useQuery({
    queryKey: poCode
      ? ["receiving", "history", poCode]
      : ["receiving", "history", "__none__"],
    queryFn: async (): Promise<ReceivingHistoryResponse> => {
      // V1.1-alpha stub — chưa có endpoint
      return { data: [] };
    },
    enabled: !!poCode,
    staleTime: 30_000,
  });
}

export const _receivingQueryKeys = qk; // referenced to avoid unused import
