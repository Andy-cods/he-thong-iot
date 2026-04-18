"use client";

import { useQuery } from "@tanstack/react-query";
import { qk } from "@/lib/query-keys";
import type { DashboardOverviewPayload } from "@/app/api/dashboard/overview/route";

/**
 * Hook fetch `/api/dashboard/overview` — KPI tổng quan cho trang chủ.
 *
 * - staleTime 60s: khớp Redis TTL server-side.
 * - gcTime 5m: giữ cache trong memory React Query lâu hơn để chuyển
 *   trang qua lại mượt.
 * - Không refetch interval → tiết kiệm pin + battery. Mutations liên
 *   quan (items/bom/suppliers) đã invalidate `qk.dashboard.overview`.
 */
export function useDashboardOverview() {
  return useQuery({
    queryKey: qk.dashboard.overview,
    queryFn: async () => {
      const res = await fetch("/api/dashboard/overview", {
        headers: { "content-type": "application/json" },
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `HTTP ${res.status}`);
      }
      const json = (await res.json()) as {
        data: DashboardOverviewPayload;
        cached: boolean;
      };
      return json.data;
    },
    staleTime: 60_000,
    gcTime: 300_000,
  });
}
