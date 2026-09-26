"use client";

import * as React from "react";
import {
  Boxes,
  Wrench,
  ShoppingCart,
  Truck,
  Factory,
  ClipboardList,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BigStatCard } from "./BigStatCard";
import { HIDDEN_FEATURES } from "@/lib/hidden-features";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";

/**
 * V3.5 ProgressBarStack — 6 BigStatCards với gradient backgrounds.
 *
 * Color semantics gắn cứng theo metric (KHÔNG đổi theo % giá trị):
 *   - Linh kiện sẵn sàng → emerald
 *   - Lắp ráp → blue
 *   - Đặt mua → amber (V4.1: PO đã gửi NCC / PO không huỷ)
 *   - Nhận hàng → indigo (V4.1: dòng PO nhận đạt đủ / dòng PO đã gửi)
 *   - Sản xuất nội bộ → rose
 *   - Yêu cầu mua (PR) → violet
 */
const DRILLDOWN_URLS = {
  componentsAvailable: "/engineering?tab=bom",
  assembly: "/operations",
  purchasing: "/sales?tab=po",
  receiving: "/warehouse?tab=movement&mode=in",
  production: "/engineering?tab=work-orders",
  purchaseRequests: "/engineering?tab=pr",
} as const;

export interface ProgressBarStackProps {
  data: DashboardOverviewV2Payload | null;
  loading?: boolean;
  className?: string;
}

function formatNum(n: number): string {
  return Number(n || 0).toLocaleString("vi-VN");
}

export function ProgressBarStack({
  data,
  loading,
  className,
}: ProgressBarStackProps) {
  const p = data?.progress;

  return (
    <div
      className={cn(
        "grid grid-cols-1 gap-4 sm:grid-cols-2",
        HIDDEN_FEATURES.salesOrder ? "lg:grid-cols-4" : "lg:grid-cols-3",
        className,
      )}
      aria-label="Tổng quan các bộ phận"
    >
      {/* V4.1 Q4/D10 — 2 thẻ "Linh kiện sẵn sàng" + "Lắp ráp" tính từ snapshot
          ĐƠN HÀNG BÁN (đang ẩn) → đứng yên / gây hiểu nhầm → ẩn cùng. */}
      {!HIDDEN_FEATURES.salesOrder && (
        <>
      {/* V4.1 Đợt 2 — thẻ này đếm DÒNG VẬT TƯ snapshot sẵn sàng, không phải
          "đơn hàng đang sản xuất" (nhãn cũ sai nghĩa). */}
      <BigStatCard
        label="Linh kiện sẵn sàng"
        icon={Boxes}
        tone="emerald"
        moduleLabel="Linh kiện"
        href={DRILLDOWN_URLS.componentsAvailable}
        value={p?.componentsAvailable.percent ?? 0}
        valueSuffix="%"
        percent={p?.componentsAvailable.percent ?? 0}
        numerator={p?.componentsAvailable.numerator ?? 0}
        denominator={p?.componentsAvailable.denominator ?? 0}
        subText={
          p && p.componentsAvailable.denominator > 0
            ? `${formatNum(p.componentsAvailable.numerator)} / ${formatNum(p.componentsAvailable.denominator)} dòng vật tư`
            : undefined
        }
        loading={loading}
      />
      <BigStatCard
        label="Lắp ráp"
        icon={Wrench}
        tone="blue"
        moduleLabel="Lắp ráp"
        href={DRILLDOWN_URLS.assembly}
        value={p?.assembly.percent ?? 0}
        valueSuffix="%"
        percent={p?.assembly.percent ?? 0}
        numerator={p?.assembly.numerator ?? 0}
        denominator={p?.assembly.denominator ?? 0}
        subText={
          p && p.assembly.denominator > 0
            ? `${formatNum(p.assembly.numerator)} / ${formatNum(p.assembly.denominator)} đơn vị`
            : undefined
        }
        loading={loading}
      />
        </>
      )}
      <BigStatCard
        label="Đặt mua"
        icon={ShoppingCart}
        tone="amber"
        moduleLabel="Đặt mua"
        href={DRILLDOWN_URLS.purchasing}
        value={p?.purchasing.percent ?? 0}
        valueSuffix="%"
        percent={p?.purchasing.percent ?? 0}
        numerator={p?.purchasing.numerator ?? 0}
        denominator={p?.purchasing.denominator ?? 0}
        subText={
          p && p.purchasing.denominator > 0
            ? `${formatNum(p.purchasing.numerator)} / ${formatNum(p.purchasing.denominator)} PO đã gửi NCC`
            : undefined
        }
        loading={loading}
      />
      <BigStatCard
        label="Nhận hàng"
        icon={Truck}
        tone="indigo"
        moduleLabel="Nhận hàng"
        href={DRILLDOWN_URLS.receiving}
        value={p?.receiving.percent ?? 0}
        valueSuffix="%"
        percent={p?.receiving.percent ?? 0}
        numerator={p?.receiving.numerator ?? 0}
        denominator={p?.receiving.denominator ?? 0}
        subText={
          p && p.receiving.denominator > 0
            ? `${formatNum(p.receiving.numerator)} / ${formatNum(p.receiving.denominator)} dòng PO đã nhận đủ`
            : undefined
        }
        loading={loading}
      />
      <BigStatCard
        label="Sản xuất nội bộ"
        icon={Factory}
        tone="rose"
        moduleLabel="Sản xuất"
        href={DRILLDOWN_URLS.production}
        value={p?.production.percent ?? 0}
        valueSuffix="%"
        percent={p?.production.percent ?? 0}
        numerator={p?.production.numerator ?? 0}
        denominator={p?.production.denominator ?? 0}
        subText={
          p && p.production.denominator > 0
            ? `${formatNum(p.production.numerator)} / ${formatNum(p.production.denominator)} lệnh`
            : undefined
        }
        loading={loading}
      />
      <BigStatCard
        label="Yêu cầu mua (PR)"
        icon={ClipboardList}
        tone="violet"
        moduleLabel="Yêu cầu mua"
        href={DRILLDOWN_URLS.purchaseRequests}
        value={p?.purchaseRequests.percent ?? 0}
        valueSuffix="%"
        percent={p?.purchaseRequests.percent ?? 0}
        numerator={p?.purchaseRequests.numerator ?? 0}
        denominator={p?.purchaseRequests.denominator ?? 0}
        subText={
          p && p.purchaseRequests.denominator > 0
            ? `${formatNum(p.purchaseRequests.numerator)} / ${formatNum(p.purchaseRequests.denominator)} yêu cầu`
            : undefined
        }
        loading={loading}
      />
    </div>
  );
}
