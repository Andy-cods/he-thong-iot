"use client";

import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { qk, type ShortageBoardFilter } from "@/lib/query-keys";

/**
 * Shortage Board hooks — V1.2 Phase B5.1.
 * - useShortageList: polling 60s, tự refetch khi receiving/QC done (qk invalidate).
 * - useRefreshShortageView: trigger manual REFRESH MATERIALIZED VIEW.
 */

export interface ShortageRow {
  componentItemId: string;
  componentSku: string;
  componentName: string;
  totalRequired: number;
  totalAvailable: number;
  totalOnOrder: number;
  totalShort: number;
  orderCount: number;
  lastUpdate: string;
}

export interface ShortageListResponse {
  data: ShortageRow[];
  meta: { total: number; source: string };
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
    throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as T;
}

function buildUrl(f: ShortageBoardFilter): string {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  if (f.orderId) p.set("orderId", f.orderId);
  if (f.minShortQty !== undefined)
    p.set("minShortQty", String(f.minShortQty));
  if (f.limit) p.set("limit", String(f.limit));
  for (const id of f.itemId ?? []) p.append("itemId", id);
  for (const sid of f.supplierId ?? []) p.append("supplierId", sid);
  return `/api/shortage?${p.toString()}`;
}

export function useShortageList(filter: ShortageBoardFilter) {
  return useQuery({
    queryKey: qk.shortage.list(filter),
    queryFn: () => request<ShortageListResponse>(buildUrl(filter)),
    refetchInterval: 60_000,
    staleTime: 30_000,
    placeholderData: (prev) => prev,
  });
}

export function useRefreshShortageView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      request<{ data: { refreshed: boolean; at: string } }>("/api/shortage", {
        method: "POST",
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.shortage.all });
    },
  });
}
