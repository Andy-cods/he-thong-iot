"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

/**
 * Receiving events hooks — Phase B2.7 + V1.8 Batch 6.
 * - useReplayQueue: POST /api/receiving/events batch replay from Dexie queue
 * - useReceivingHistory: GET events cho PO (V1.1-alpha trả [] stub)
 * - usePOForReceiving: GET /api/po/[id] detail với receiving fields (V1.8 B6)
 * - useSubmitReceivingEvent: wrap POST /api/receiving/events cho form
 *   `/receiving/[poId]` (không qua Dexie queue — direct submit)
 */

export interface POReceivingLine {
  id: string;
  lineNo: number;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string;
  orderedQty: number;
  receivedQty: number;
  remainingQty: number;
  unitPrice: number;
  expectedLotSerial: "LOT" | "SERIAL" | "NONE";
}

export interface POForReceiving {
  poId: string;
  poCode: string;
  supplierId?: string;
  supplierName: string;
  supplierCode?: string | null;
  status?: "DRAFT" | "SENT" | "PARTIAL" | "RECEIVED" | "CANCELLED" | "CLOSED";
  expectedDate: string;
  notes?: string | null;
  lines: POReceivingLine[];
  totals?: {
    linesTotal: number;
    orderedTotal: number;
    receivedTotal: number;
    receivedPct: number;
  };
}

export interface ReceivingEventInput {
  id: string;
  scanId: string;
  poCode: string;
  sku: string;
  qty: number;
  lotNo?: string | null;
  qcStatus: "OK" | "NG" | "PENDING";
  scannedAt: string;
  rawCode?: string | null;
  metadata?: Record<string, unknown>;
}

export interface ReceivingEventDetail {
  id: string;
  poStatus?: string | null;
  newSnapshotState?: string | null;
  lotStatus?: string;
  overDelivery?: boolean;
  warning?: string | null;
}

export interface ReplayResponse {
  data: {
    acked: string[];
    rejected: Array<{ id: string; reason: string }>;
    count: number;
    details?: ReceivingEventDetail[];
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

/**
 * V1.8 Batch 6 — GET /api/po/[id] với receiving enrichment (orderedQty,
 * receivedQty, remainingQty, expectedLotSerial per line).
 */
export function usePOForReceiving(id: string | null) {
  return useQuery({
    queryKey: id
      ? qk.po.detail(id)
      : ["po", "detail", "__none__"],
    queryFn: async (): Promise<POForReceiving> => {
      const json = await request<{ data: POForReceiving }>(
        `/api/po/${encodeURIComponent(id!)}`,
      );
      return json.data;
    },
    enabled: !!id,
    staleTime: 10_000,
  });
}

/**
 * V1.8 Batch 6 — direct submit receiving event (non-PWA /receiving/[poId] form).
 *
 * Backend `/api/receiving/events` nhận batch scan events → 7-table atomic.
 * Shape events như PWA replay, nhưng đây là realtime submit + invalidate list.
 */
export function useSubmitReceivingEvent() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (events: ReceivingEventInput[]) =>
      request<ReplayResponse>("/api/receiving/events", {
        method: "POST",
        body: JSON.stringify({ events }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
      qc.invalidateQueries({ queryKey: qk.receiving.all });
      qc.invalidateQueries({ queryKey: ["po", "detail"] });
    },
  });
}

export const _receivingQueryKeys = qk; // referenced to avoid unused import
