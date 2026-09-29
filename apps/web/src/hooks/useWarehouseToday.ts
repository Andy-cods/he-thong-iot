"use client";

import { useQuery } from "@tanstack/react-query";

/**
 * V4.3 mục 3 — hook tab "Việc cần làm hôm nay".
 */

export interface TodayStagingLot {
  lotSerialId: string;
  lotCode: string | null;
  itemId: string;
  sku: string;
  itemName: string;
  uom: string | null;
  qty: number;
  status: string;
}

export interface TodayPendingIssue {
  kind: "ISR" | "PR";
  id: string;
  code: string;
  reasonLabel: string | null;
  totalQty: number | null;
  requestedAt: string;
  href: string;
}

export interface TodayIncomingPo {
  poId: string;
  poNo: string;
  supplierName: string | null;
  expectedEta: string;
  daysUntil: number;
  overdue: boolean;
}

export interface WarehouseTodaySummary {
  staging: {
    binId: string | null;
    binFullCode: string | null;
    count: number;
    totalQty: number;
    items: TodayStagingLot[];
  };
  pendingIssues: { count: number; items: TodayPendingIssue[] };
  incomingPos: { count: number; items: TodayIncomingPo[] };
  qcPending: { count: number };
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & {
    error?: { message?: string };
  };
  if (!res.ok) throw new Error(body.error?.message ?? `HTTP ${res.status}`);
  return body;
}

export function useWarehouseToday() {
  return useQuery({
    queryKey: ["warehouse", "today"],
    queryFn: async () =>
      (await getJson<{ data: WarehouseTodaySummary }>("/api/warehouse/today")).data,
    staleTime: 15_000,
    refetchInterval: 60_000,
  });
}
