"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { qk } from "@/lib/query-keys";

/**
 * V3 (TASK-20260427-014) — Receiving approve / reject mutations.
 *
 * - `useApproveReceiving()` POST `/api/receiving/[poId]/approve`. Chỉ pass
 *   nếu tổng received >= 95% ordered; backend trả 409 NOT_ENOUGH_RECEIVED
 *   với chi tiết ratio nếu fail.
 * - `useRejectReceiving()` POST `/api/receiving/[poId]/reject`. Reason
 *   bắt buộc (3..500 ký tự).
 *
 * Cả 2 invalidate `procurement.orders.all` + `receiving.all` + PO detail.
 */

export interface ReceivingApproveInput {
  poId: string;
  note?: string | null;
}

export interface ReceivingRejectInput {
  poId: string;
  reason: string;
}

export interface ReceivingApproveResponse {
  ok: true;
  data: {
    id: string;
    poNo: string;
    status: string;
    metadata: Record<string, unknown>;
  };
  totals: { ordered: number; received: number; ratio: number };
}

export interface ReceivingRejectResponse {
  ok: true;
  data: {
    id: string;
    poNo: string;
    status: string;
    metadata: Record<string, unknown>;
  };
}

interface RequestError extends Error {
  status?: number;
  code?: string;
  details?: unknown;
}

async function request<T>(input: string, body?: unknown): Promise<T> {
  const res = await fetch(input, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: {
        message?: string;
        code?: string;
        details?: unknown;
      };
    };
    const err = new Error(
      json.error?.message ?? `HTTP ${res.status}`,
    ) as RequestError;
    err.status = res.status;
    err.code = json.error?.code;
    err.details = json.error?.details;
    throw err;
  }
  return (await res.json()) as T;
}

function invalidatePO(qc: ReturnType<typeof useQueryClient>, poId: string) {
  void qc.invalidateQueries({ queryKey: qk.procurement.orders.all });
  void qc.invalidateQueries({ queryKey: qk.receiving.all });
  void qc.invalidateQueries({ queryKey: qk.po.detail(poId) });
  void qc.invalidateQueries({ queryKey: ["po", "detail"] });
}

export function useApproveReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, note }: ReceivingApproveInput) =>
      request<ReceivingApproveResponse>(
        `/api/receiving/${encodeURIComponent(poId)}/approve`,
        note ? { note } : {},
      ),
    onSuccess: (_res, vars) => {
      invalidatePO(qc, vars.poId);
      toast.success("Đã duyệt PO — RECEIVED.");
    },
    onError: (err: RequestError) => {
      toast.error(err.message);
    },
  });
}

export function useRejectReceiving() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ poId, reason }: ReceivingRejectInput) =>
      request<ReceivingRejectResponse>(
        `/api/receiving/${encodeURIComponent(poId)}/reject`,
        { reason },
      ),
    onSuccess: (_res, vars) => {
      invalidatePO(qc, vars.poId);
      toast.success("Đã từ chối PO — CANCELLED.");
    },
    onError: (err: RequestError) => {
      toast.error(err.message);
    },
  });
}
