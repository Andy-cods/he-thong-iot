"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

export type LotEventKind = "TXN" | "RESERVE" | "RELEASE" | "SCAN";

export interface LotTimelineEvent {
  eventAt: string;
  kind: LotEventKind;
  txType: string | null;
  qty: number;
  note: string | null;
  actorUsername: string | null;
  refTable: string | null;
  refId: string | null;
}

export interface LotDetail {
  lot: {
    id: string;
    itemId: string;
    lotCode: string | null;
    serialCode: string | null;
    mfgDate: string | null;
    expDate: string | null;
    status: string;
    holdReason: string | null;
    createdAt: string;
    itemSku: string | null;
    itemName: string | null;
  };
  onHandQty: number;
  reservedQty: number;
  timeline: LotTimelineEvent[];
}

async function request<T>(input: string): Promise<T> {
  const res = await fetch(input, { credentials: "include" });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as {
      error?: { message?: string };
    };
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

export function useLotHistory(id: string | null) {
  return useQuery({
    queryKey: id
      ? (["lot-serial", "history", id] as const)
      : (["lot-serial", "history", "__none__"] as const),
    queryFn: () =>
      request<{ data: LotDetail }>(`/api/lot-serial/${id}/history`),
    enabled: !!id,
    staleTime: 10_000,
  });
}

/* ---------------- V1.7-beta.2.1 — List lot/serial ---------------- */

export type LotStatus = "AVAILABLE" | "HOLD" | "CONSUMED" | "EXPIRED";

export interface LotSerialListRow {
  id: string;
  lotCode: string | null;
  serialCode: string | null;
  status: LotStatus | string;
  holdReason: string | null;
  mfgDate: string | null;
  expDate: string | null;
  createdAt: string;
  onHandQty: number;
  /** TASK-20260427-017: tổng reservation ACTIVE cho lot. */
  reservedQty: number;
  /** Danh sách order_no (CSV) đang giữ chỗ lot. */
  reservedForOrders: string | null;
  itemId: string;
  itemSku: string | null;
  itemName: string | null;
  itemUom: string | null;
}

export interface LotSerialListResponse {
  data: LotSerialListRow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface LotSerialListFilter {
  itemId?: string | null;
  status?: LotStatus | "all" | null;
  q?: string | null;
  page?: number;
  pageSize?: number;
}

function buildListUrl(f: LotSerialListFilter): string {
  const p = new URLSearchParams();
  if (f.itemId) p.set("itemId", f.itemId);
  if (f.status && f.status !== "all") p.set("status", f.status);
  if (f.q && f.q.trim()) p.set("q", f.q.trim());
  p.set("page", String(f.page ?? 1));
  p.set("pageSize", String(f.pageSize ?? 50));
  return `/api/lot-serial?${p.toString()}`;
}

export function useLotSerialList(filter: LotSerialListFilter) {
  return useQuery<LotSerialListResponse>({
    queryKey: [
      "lot-serial",
      "list",
      filter.itemId ?? null,
      filter.status ?? null,
      filter.q ?? null,
      filter.page ?? 1,
      filter.pageSize ?? 50,
    ] as const,
    queryFn: () =>
      request<LotSerialListResponse>(buildListUrl(filter)),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

/* ---------------- V3 (TASK-20260427-014) — Hold / Release ---------------- */

export interface LotMutationResponse {
  ok: true;
  lotSerial: {
    id: string;
    status: LotStatus | string;
    holdReason: string | null;
    lotCode: string | null;
    serialCode: string | null;
    itemId: string;
  };
}

async function mutateRequest<T>(
  input: string,
  body?: unknown,
): Promise<T> {
  const res = await fetch(input, {
    method: "POST",
    credentials: "include",
    headers: { "content-type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const json = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; code?: string };
    };
    throw new Error(
      json.error?.message ?? `HTTP ${res.status}`,
    );
  }
  return (await res.json()) as T;
}

/**
 * `useHoldLot` — đặt lot vào trạng thái HOLD (lý do bắt buộc).
 *
 * Invalidate cả list + detail history. Toast success / error.
 */
export function useHoldLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      mutateRequest<LotMutationResponse>(
        `/api/lot-serial/${encodeURIComponent(id)}/hold`,
        { reason },
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["lot-serial"] });
      void qc.invalidateQueries({
        queryKey: ["lot-serial", "history", vars.id],
      });
      // TASK-20260427-017 — onHand/holdQty đổi.
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Đã đặt lot vào HOLD.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

/** `useReleaseLot` — release HOLD → AVAILABLE. */
export function useReleaseLot() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note?: string | null }) =>
      mutateRequest<LotMutationResponse>(
        `/api/lot-serial/${encodeURIComponent(id)}/release`,
        note ? { note } : {},
      ),
    onSuccess: (_data, vars) => {
      void qc.invalidateQueries({ queryKey: ["lot-serial"] });
      void qc.invalidateQueries({
        queryKey: ["lot-serial", "history", vars.id],
      });
      // TASK-20260427-017 — onHand/holdQty đổi.
      void qc.invalidateQueries({ queryKey: ["inventory"] });
      toast.success("Đã release lot — chuyển AVAILABLE.");
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}
