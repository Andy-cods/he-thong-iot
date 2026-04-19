"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";

export type QcCheckpoint = "PRE_ASSEMBLY" | "MID_PRODUCTION" | "PRE_FG";
export type QcResult = "PASS" | "FAIL" | "NA";

export interface QcCheckRow {
  id: string;
  woId: string;
  checkpointName: string;
  checkpoint: QcCheckpoint | null;
  result: QcResult | null;
  note: string | null;
  checkedBy: string | null;
  checkedAt: string | null;
  createdAt: string;
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

export function useQcChecks(woId: string | null, seedDefaults = false) {
  return useQuery({
    queryKey: woId
      ? qk.workOrders.qcChecks(woId)
      : (["workOrders", "qc-checks", "__none__"] as const),
    queryFn: () =>
      request<{ data: QcCheckRow[] }>(
        `/api/qc-checks?woId=${woId}${seedDefaults ? "&seedDefaults=1" : ""}`,
      ),
    enabled: !!woId,
    staleTime: 5_000,
  });
}

export function useCreateQcCheck(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: {
      woId: string;
      checkpointName: string;
      checkpoint?: QcCheckpoint;
      result?: QcResult;
      note?: string;
    }) =>
      request<{ data: QcCheckRow }>(`/api/qc-checks`, {
        method: "POST",
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcChecks(woId) });
    },
  });
}

export function useUpdateQcCheck(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { id: string; result: QcResult; note?: string | null }) =>
      request<{ data: QcCheckRow }>(`/api/qc-checks/${data.id}`, {
        method: "PATCH",
        body: JSON.stringify({ result: data.result, note: data.note }),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcChecks(woId) });
    },
  });
}

export function useDeleteQcCheck(woId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ data: { id: string; deleted: boolean } }>(
        `/api/qc-checks/${id}`,
        { method: "DELETE" },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.workOrders.qcChecks(woId) });
    },
  });
}

export const CHECKPOINT_LABEL: Record<QcCheckpoint, string> = {
  PRE_ASSEMBLY: "Trước lắp ráp",
  MID_PRODUCTION: "Giữa sản xuất",
  PRE_FG: "Trước thành phẩm",
};

export const RESULT_LABEL: Record<QcResult, string> = {
  PASS: "Đạt",
  FAIL: "Lỗi",
  NA: "N/A",
};

export const RESULT_VARIANTS: Record<
  QcResult,
  "success" | "danger" | "neutral"
> = {
  PASS: "success",
  FAIL: "danger",
  NA: "neutral",
};
