"use client";

import * as React from "react";
import {
  Boxes,
  ClipboardList,
  Factory,
  ShoppingCart,
  Truck,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { HeroOverviewCard } from "./HeroOverviewCard";
import { MetricCard } from "./MetricCard";
import { RecentActivityCard } from "./RecentActivityCard";
import { ActionItemsCard } from "./ActionItemsCard";
import { LowStockCard } from "./LowStockCard";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";
import type { SparklineDatum } from "./Sparkline";

/**
 * V3.2 DashboardClient — bento 12-col layout cho trang Tổng quan
 * (TASK-20260427-027 redesign vòng 2).
 *
 * Layout (≥lg):
 *   row 1: Hero (col-span-12)
 *   row 2: 5 metric default (col-span-3 each, 4 dòng × 1 dòng wrap)
 *          + 1 metric large "Sản xuất nội bộ" (col-span-6, row-span-2)
 *          → grid 12 col, mặt trái 6 col chia 2x2 metric, mặt phải 6 col cho large
 *   row 3: RecentActivity (col-span-8) + ActionItems (col-span-4)
 *   row 4: LowStock (col-span-12)
 *
 * Mobile (<md): single column. Tablet (md): 2 col, hero & large span 2.
 *
 * Polling 60s cho overview-v2 (giữ nguyên như V3.1). 3 sub-component card
 * (Activity / ActionItems / LowStock) có polling riêng (60s & 120s).
 */

const POLL_INTERVAL_MS = 60_000;

export interface DashboardClientProps {
  initialData: DashboardOverviewV2Payload | null;
  initialError?: string | null;
  className?: string;
}

const DRILLDOWN_URLS = {
  componentsAvailable: "/bom?state=AVAILABLE",
  assembly: "/assembly?status=in-progress",
  purchasing: "/procurement/purchase-orders?status=SENT",
  receiving: "/receiving?pending=true",
  production: "/work-orders?status=IN_PROGRESS",
  purchaseRequests: "/procurement/purchase-requests?status=PENDING",
} as const;

const TOOLTIPS = {
  componentsAvailable:
    "Tỷ lệ linh kiện đã sẵn sàng (đã về kho QC pass / dự trữ / xuất / lắp ráp / đóng).",
  assembly: "Tổng số lượng đã lắp ráp / tổng số lượng yêu cầu của tất cả BOM.",
  purchasing:
    "Tổng số lượng đã đặt mua (PO open) / tổng yêu cầu — phản ánh độ phủ đặt hàng.",
  receiving: "Tổng số lượng đã nhận về kho / tổng yêu cầu của tất cả BOM.",
  production:
    "Số lệnh sản xuất đang chạy / tổng lệnh đã release + đang chạy + hoàn tất.",
  purchaseRequests:
    "Yêu cầu mua đã duyệt hoặc chuyển PO / tổng yêu cầu mua — đánh giá tốc độ duyệt.",
} as const;

export function DashboardClient({
  initialData,
  initialError,
  className,
}: DashboardClientProps) {
  const [data, setData] =
    React.useState<DashboardOverviewV2Payload | null>(initialData);
  const [error, setError] = React.useState<string | null>(initialError ?? null);
  const [refreshing, setRefreshing] = React.useState(false);
  const [trend, setTrend] = React.useState<SparklineDatum[] | null>(null);

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

  // Polling 60s background.
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

  // Fetch WO trend 7 days (5 phút cache server-side).
  React.useEffect(() => {
    const ctrl = new AbortController();
    const fetchTrend = async () => {
      try {
        const res = await fetch("/api/dashboard/wo-trend?days=7", {
          signal: ctrl.signal,
          credentials: "same-origin",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) return;
        const payload = (await res.json()) as {
          points: SparklineDatum[];
        };
        setTrend(Array.isArray(payload?.points) ? payload.points : []);
      } catch (e) {
        if ((e as Error).name === "AbortError") return;
        // Fallback: empty (sparkline sẽ render placeholder).
      }
    };
    void fetchTrend();
    const id = setInterval(fetchTrend, 5 * 60_000);
    return () => {
      clearInterval(id);
      ctrl.abort();
    };
  }, []);

  const handleRefresh = React.useCallback(() => {
    void fetchData(true);
  }, [fetchData]);

  const p = data?.progress;
  const loading = !data && !error;

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
          className="dashboard-stagger-fade rounded-xl border border-rose-200 bg-rose-50/80 px-4 py-3 text-sm text-rose-800 backdrop-blur-sm"
          style={{ ["--stagger-delay" as never]: "60ms" }}
        >
          {error}
        </div>
      ) : null}

      {/* === ROW METRICS BENTO ===
          Layout:
            <md: stack 1 col
            md: 2 col grid (large = full width 2 col)
            lg: 12-col grid → trái 8 col chia 4 metric (2x2),
                phải 4 col 1 large card row-span-2.
       */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12 lg:auto-rows-[160px]">
        {/* Linh kiện sẵn sàng */}
        <MetricCard
          className="lg:col-span-4"
          index={1}
          label="Linh kiện sẵn sàng"
          icon={Boxes}
          tone="emerald"
          moduleLabel="BOM"
          loading={loading}
          percent={p?.componentsAvailable.percent ?? 0}
          numerator={p?.componentsAvailable.numerator ?? 0}
          denominator={p?.componentsAvailable.denominator ?? 0}
          unitLabel="linh kiện"
          tooltip={TOOLTIPS.componentsAvailable}
          drilldownHref={DRILLDOWN_URLS.componentsAvailable}
        />

        {/* Lắp ráp */}
        <MetricCard
          className="lg:col-span-4"
          index={2}
          label="Lắp ráp"
          icon={Wrench}
          tone="blue"
          moduleLabel="Lắp ráp"
          loading={loading}
          percent={p?.assembly.percent ?? 0}
          numerator={p?.assembly.numerator ?? 0}
          denominator={p?.assembly.denominator ?? 0}
          unitLabel="đơn vị"
          tooltip={TOOLTIPS.assembly}
          drilldownHref={DRILLDOWN_URLS.assembly}
        />

        {/* Sản xuất nội bộ — LARGE row-span-2, đứng cột phải */}
        <MetricCard
          className="sm:col-span-2 lg:col-span-4 lg:row-span-2 lg:h-auto"
          index={3}
          variant="large"
          label="Sản xuất nội bộ"
          icon={Factory}
          tone="rose"
          moduleLabel="Sản xuất"
          loading={loading}
          percent={p?.production.percent ?? 0}
          numerator={p?.production.numerator ?? 0}
          denominator={p?.production.denominator ?? 0}
          unitLabel="lệnh"
          tooltip={TOOLTIPS.production}
          drilldownHref={DRILLDOWN_URLS.production}
          sparkline={trend ?? undefined}
          subStat={
            data
              ? {
                  label: "Đang chạy / Tổng",
                  value: `${(p?.production.numerator ?? 0).toLocaleString("vi-VN")} / ${(p?.production.denominator ?? 0).toLocaleString("vi-VN")}`,
                }
              : undefined
          }
        />

        {/* Đặt mua */}
        <MetricCard
          className="lg:col-span-3"
          index={4}
          label="Đặt mua"
          icon={ShoppingCart}
          tone="amber"
          moduleLabel="Đặt mua"
          loading={loading}
          percent={p?.purchasing.percent ?? 0}
          numerator={p?.purchasing.numerator ?? 0}
          denominator={p?.purchasing.denominator ?? 0}
          unitLabel="đơn vị"
          tooltip={TOOLTIPS.purchasing}
          drilldownHref={DRILLDOWN_URLS.purchasing}
        />

        {/* Nhận hàng */}
        <MetricCard
          className="lg:col-span-3"
          index={5}
          label="Nhận hàng"
          icon={Truck}
          tone="indigo"
          moduleLabel="Nhận hàng"
          loading={loading}
          percent={p?.receiving.percent ?? 0}
          numerator={p?.receiving.numerator ?? 0}
          denominator={p?.receiving.denominator ?? 0}
          unitLabel="đơn vị"
          tooltip={TOOLTIPS.receiving}
          drilldownHref={DRILLDOWN_URLS.receiving}
        />

        {/* Yêu cầu mua */}
        <MetricCard
          className="sm:col-span-2 lg:col-span-2"
          index={6}
          label="Yêu cầu mua (PR)"
          icon={ClipboardList}
          tone="violet"
          moduleLabel="Yêu cầu mua"
          loading={loading}
          percent={p?.purchaseRequests.percent ?? 0}
          numerator={p?.purchaseRequests.numerator ?? 0}
          denominator={p?.purchaseRequests.denominator ?? 0}
          unitLabel="yêu cầu"
          tooltip={TOOLTIPS.purchaseRequests}
          drilldownHref={DRILLDOWN_URLS.purchaseRequests}
        />
      </div>

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
