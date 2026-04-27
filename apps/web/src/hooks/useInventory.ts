"use client";

/**
 * useInventoryBalance — TASK-20260427-017.
 *
 * Hook gọi `/api/inventory/balance` trả số dư on_hand / reserved / available
 * / hold theo từng SKU. Dùng cho tab Tổng quan + cell badge ItemsTab.
 *
 * Invalidation: list "inventory" được invalidate khi:
 *   - Reservation tạo/release (mutation snapshots / WO).
 *   - Receiving event approve (lot AVAILABLE mới).
 *   - Lot hold/release (status flip → ảnh hưởng holdQty).
 * Caller code các mutation đó (xem `useSnapshots`, `useReceivingApprove`,
 * `useLotSerial`) cần `qc.invalidateQueries({ queryKey: ["inventory"] })`.
 */
import { useQuery } from "@tanstack/react-query";

export interface InventoryBalanceRow {
  itemId: string;
  sku: string;
  name: string;
  uom: string;
  category: string | null;
  minStockQty: number;
  onHand: number;
  reserved: number;
  holdQty: number;
  available: number;
}

export interface InventoryBalanceResponse {
  data: InventoryBalanceRow[];
  meta: { page: number; pageSize: number; total: number };
}

export interface InventoryBalanceFilter {
  itemId?: string | null;
  hasLotOnly?: boolean;
  page?: number;
  pageSize?: number;
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

function buildUrl(f: InventoryBalanceFilter): string {
  const p = new URLSearchParams();
  if (f.itemId) p.set("itemId", f.itemId);
  if (f.hasLotOnly !== undefined) p.set("hasLotOnly", String(f.hasLotOnly));
  p.set("page", String(f.page ?? 1));
  p.set("pageSize", String(f.pageSize ?? 100));
  return `/api/inventory/balance?${p.toString()}`;
}

export function useInventoryBalance(filter: InventoryBalanceFilter = {}) {
  return useQuery<InventoryBalanceResponse>({
    queryKey: [
      "inventory",
      "balance",
      filter.itemId ?? null,
      filter.hasLotOnly ?? null,
      filter.page ?? 1,
      filter.pageSize ?? 100,
    ] as const,
    queryFn: () => request<InventoryBalanceResponse>(buildUrl(filter)),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}
