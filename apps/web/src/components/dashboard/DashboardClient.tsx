"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { HeroOverviewCard } from "./HeroOverviewCard";
import { ProgressBarStack } from "./ProgressBarStack";
import { EntityCountChart } from "./EntityCountChart";
import { RecentActivityCard } from "./RecentActivityCard";
import { ActionItemsCard } from "./ActionItemsCard";
import { LowStockCard } from "./LowStockCard";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";
import type { DashboardCountsPayload } from "@/app/api/dashboard/counts/route";

/**
 * V3.5 DashboardClient — layout đơn giản hoá.
 *
 * Sections:
 *   1. Hero overview với 3 quick stats
 *   2. EntityCountChart — bar chart 7 cột (BOM/Đơn hàng/PR/PO/Lệnh SX/Linh kiện/NCC)
 *   3. ProgressBarStack — 6 BigStatCards với gradient backgrounds
 *   4. RecentActivity + ActionItems (2 col)
 *   5. LowStock (full width)
 *
 * Polling 60s cho cả overview-v2 + counts.
 */

const POLL_INTERVAL_MS = 60_000;

export interface DashboardClientProps {
  initialData: DashboardOverviewV2Payload | null;
  initialError?: string | null;
  className?: string;
}

export function DashboardClient({
  initialData,
  initialError,
  className,
}: DashboardClientProps) {
  const [data, setData] =
    React.useState<DashboardOverviewV2Payload | null>(initialData);
  const [counts, setCounts] = React.useState<DashboardCountsPayload | null>(null);
  const [error, setError] = React.useState<string | null>(initialError ?? null);
  const [refreshing, setRefreshing] = React.useState(false);

  const fetchData = React.useCallback(
    async (fresh: boolean, signal?: AbortSignal) => {
      if (fresh) setRefreshing(true);
      try {
        const url = fresh
          ? "/api/dashboard/overview-v2?fresh=1"
          : "/api/dashboard/overview-v2";
        const res = await fetch(url, {
          signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) {
          const msg =
            res.status === 401
              ? "Phiên đăng nhập đã hết hạn."
              : `Lỗi tải dữ liệu (HTTP ${res.status}).`;
          throw new Error(msg);
        }
        const payload = (await res.json()) as DashboardOverviewV2Payload;
        setData(payload);
        setError(null);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        setError((e as Error).message ?? "Lỗi không xác định.");
      } finally {
        if (fresh) setRefreshing(false);
      }
    },
    [],
  );

  const fetchCounts = React.useCallback(async (signal?: AbortSignal) => {
    try {
      const res = await fetch("/api/dashboard/counts", {
        signal,
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });
      if (!res.ok) return;
      const payload = (await res.json()) as DashboardCountsPayload;
      setCounts(payload);
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
  }, []);

  // Initial fetch counts
  React.useEffect(() => {
    const ctrl = new AbortController();
    void fetchCounts(ctrl.signal);
    return () => ctrl.abort();
  }, [fetchCounts]);

  // Polling 60s
  React.useEffect(() => {
    const ctrl = new AbortController();
    const id = setInterval(() => {
      void fetchData(false, ctrl.signal);
      void fetchCounts(ctrl.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [fetchData, fetchCounts]);

  const handleRefresh = React.useCallback(() => {
    void fetchData(true);
    void fetchCounts();
  }, [fetchData, fetchCounts]);

  const loading = !data && !error;
  const countsLoading = !counts;

  return (
    <div className={cn("flex flex-col gap-5 lg:gap-6", className)}>
      {/* === HERO === */}
      <HeroOverviewCard
        data={data}
        loading={loading}
        refreshing={refreshing}
        onRefresh={handleRefresh}
      />

      {error ? (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 backdrop-blur-sm"
        >
          {error}
        </div>
      ) : null}

      {/* === ENTITY CHART === */}
      <EntityCountChart data={counts} loading={countsLoading} />

      {/* === BIG STAT CARDS === */}
      <ProgressBarStack data={data} loading={loading} />

      {/* === ROW: ACTIVITY + ACTION ITEMS === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <RecentActivityCard className="lg:col-span-8" />
        <ActionItemsCard className="lg:col-span-4" />
      </div>

      {/* === ROW: LOW STOCK === */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        <LowStockCard className="lg:col-span-12" />
      </div>
    </div>
  );
}
