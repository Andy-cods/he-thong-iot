"use client";

import * as React from "react";
import { ProgressBarStack } from "./ProgressBarStack";
import { DashboardHeader } from "./DashboardHeader";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";
import { cn } from "@/lib/utils";

/**
 * V3 DashboardClient — client wrapper cho trang Tổng quan.
 *
 * Nhận `initialData` từ server component (`page.tsx`), polling auto-refresh
 * mỗi 60s + nút Refresh manual (gửi `?fresh=1` bypass cache Redis).
 *
 * Performance:
 *   - SWR pattern thủ công: hiện initialData ngay (no flicker), background
 *     refresh sau mỗi interval.
 *   - AbortController cho fetch — tránh race khi refresh nhiều lần.
 *   - KHÔNG aggregate client-side — luôn dùng API V2 server-side.
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

  // Polling 60s background (KHÔNG block UI).
  React.useEffect(() => {
    const ctrl = new AbortController();
    const id = setInterval(() => {
      fetchData(false, ctrl.signal);
    }, POLL_INTERVAL_MS);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, [fetchData]);

  const handleRefresh = React.useCallback(() => {
    void fetchData(true);
  }, [fetchData]);

  return (
    <div className={cn("flex flex-col gap-6", className)}>
      <DashboardHeader
        cachedAt={data?.cachedAt ?? null}
        onRefresh={handleRefresh}
        refreshing={refreshing}
      />
      {error ? (
        <div
          role="alert"
          className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
        >
          {error}
        </div>
      ) : null}
      <ProgressBarStack data={data} loading={!data && !error} />
    </div>
  );
}
