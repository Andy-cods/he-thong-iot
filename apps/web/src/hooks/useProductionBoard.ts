"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/**
 * V3.8 — Hooks cho Bảng điều hành sản xuất (Production Board).
 *
 * - useProductionBoard(opts): list + counts, auto-refresh cho màn hình TV.
 * - useCreate/Update/DeleteBoardItem: CRUD cho QC lead.
 * - useBoardHistory: lịch sử 1 mã.
 */

export const BOARD_STATUSES = [
  "QUEUED",
  "IN_PROGRESS",
  "QC",
  "COMPLETED",
  "DELIVERED",
] as const;
export type BoardStatus = (typeof BOARD_STATUSES)[number];

export interface BoardItem {
  id: string;
  seq: number;
  productCode: string;
  rfqNo: string | null;
  productName: string;
  customer: string | null;
  qtyPlanned: string;
  qtyDone: string;
  uom: string | null;
  status: BoardStatus;
  deadline: string | null;
  currentStage: string | null;
  notes: string | null;
  isPinned: boolean;
  completedAt: string | null;
  createdAt: string;
  createdBy: string | null;
  updatedAt: string;
  updatedBy: string | null;
  updatedByName: string | null;
}

export interface BoardCounts {
  QUEUED: number;
  IN_PROGRESS: number;
  QC: number;
  COMPLETED: number;
  DELIVERED: number;
}

interface BoardResponse {
  data: BoardItem[];
  counts: BoardCounts;
}

interface RequestError extends Error {
  status?: number;
  code?: string;
}

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const res = await fetch(input, {
    credentials: "include",
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
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

const BOARD_KEY = ["production-board"] as const;

export function useProductionBoard(opts?: {
  completedLimit?: number;
  all?: boolean;
  /** ms; mặc định 15s cho TV. 0 = tắt auto-refresh. */
  refetchInterval?: number;
  enabled?: boolean;
}) {
  const completedLimit = opts?.completedLimit ?? 5;
  const all = opts?.all ?? false;
  const refetchInterval = opts?.refetchInterval ?? 15_000;

  const p = new URLSearchParams();
  p.set("completedLimit", String(completedLimit));
  if (all) p.set("all", "1");

  return useQuery<BoardResponse>({
    queryKey: [...BOARD_KEY, { completedLimit, all }],
    queryFn: () => request<BoardResponse>(`/api/production-board?${p.toString()}`),
    refetchInterval: refetchInterval > 0 ? refetchInterval : false,
    refetchOnWindowFocus: true,
    staleTime: 5_000,
    enabled: opts?.enabled ?? true,
  });
}

export interface BoardItemPayload {
  productCode: string;
  rfqNo?: string | null;
  productName: string;
  customer?: string | null;
  qtyPlanned?: number;
  qtyDone?: number;
  uom?: string | null;
  status?: BoardStatus;
  deadline?: string | null;
  currentStage?: string | null;
  notes?: string | null;
  isPinned?: boolean;
  seq?: number;
}

export function useCreateBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (payload: BoardItemPayload) =>
      request<{ data: BoardItem }>("/api/production-board", {
        method: "POST",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARD_KEY }),
  });
}

export function useUpdateBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      payload,
    }: {
      id: string;
      payload: Partial<BoardItemPayload>;
    }) =>
      request<{ data: BoardItem }>(`/api/production-board/${id}`, {
        method: "PATCH",
        body: JSON.stringify(payload),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARD_KEY }),
  });
}

export function useDeleteBoardItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      request<{ ok: true }>(`/api/production-board/${id}`, {
        method: "DELETE",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: BOARD_KEY }),
  });
}

export interface BoardHistoryRow {
  id: string;
  field: string;
  oldValue: string | null;
  newValue: string | null;
  changedAt: string;
  changedByName: string | null;
}

export function useBoardHistory(id: string | null) {
  return useQuery<{ data: BoardHistoryRow[] }>({
    queryKey: [...BOARD_KEY, "history", id],
    queryFn: () =>
      request<{ data: BoardHistoryRow[] }>(
        `/api/production-board/${id}/history`,
      ),
    enabled: !!id,
    staleTime: 10_000,
  });
}
