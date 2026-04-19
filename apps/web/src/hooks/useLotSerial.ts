"use client";

import { useQuery } from "@tanstack/react-query";

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
