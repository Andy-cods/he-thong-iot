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
import { ProgressBarCard } from "./ProgressBarCard";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";

/**
 * V3.1 ProgressBarStack — container 6 thanh tiến độ trên trang Tổng quan.
 *
 * Layout responsive (TASK-20260427-010):
 *   - Mobile <375: 1 cột
 *   - Tablet ≥375 (sm): 2 cột
 *   - Desktop ≥768 (md+): 3 cột
 *
 * Color semantics gắn cứng theo metric (KHÔNG đổi theo % giá trị):
 *   - Linh kiện sẵn sàng → emerald
 *   - Lắp ráp → blue
 *   - Đặt mua → amber
 *   - Nhận hàng → indigo
 *   - Sản xuất nội bộ → rose
 *   - Yêu cầu mua (PR) → violet
 *
 * Drilldown URLs (theo addendum-user-answers + brainstorm Q7 — route filter,
 * KHÔNG modal). Click toàn bộ card → navigate.
 */
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

export interface ProgressBarStackProps {
  data: DashboardOverviewV2Payload | null;
  loading?: boolean;
  className?: string;
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
        "grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3",
        className,
      )}
      aria-label="Thanh tiến độ tổng quan"
    >
      <ProgressBarCard
        label="Linh kiện sẵn sàng"
        icon={Boxes}
        tone="emerald"
        moduleLabel="BOM"
        loading={loading || !p}
        percent={p?.componentsAvailable.percent ?? 0}
        numerator={p?.componentsAvailable.numerator ?? 0}
        denominator={p?.componentsAvailable.denominator ?? 0}
        unitLabel="linh kiện"
        tooltip={TOOLTIPS.componentsAvailable}
        drilldownHref={DRILLDOWN_URLS.componentsAvailable}
      />
      <ProgressBarCard
        label="Lắp ráp"
        icon={Wrench}
        tone="blue"
        moduleLabel="Lắp ráp"
        loading={loading || !p}
        percent={p?.assembly.percent ?? 0}
        numerator={p?.assembly.numerator ?? 0}
        denominator={p?.assembly.denominator ?? 0}
        unitLabel="đơn vị"
        tooltip={TOOLTIPS.assembly}
        drilldownHref={DRILLDOWN_URLS.assembly}
      />
      <ProgressBarCard
        label="Đặt mua"
        icon={ShoppingCart}
        tone="amber"
        moduleLabel="Đặt mua"
        loading={loading || !p}
        percent={p?.purchasing.percent ?? 0}
        numerator={p?.purchasing.numerator ?? 0}
        denominator={p?.purchasing.denominator ?? 0}
        unitLabel="đơn vị"
        tooltip={TOOLTIPS.purchasing}
        drilldownHref={DRILLDOWN_URLS.purchasing}
      />
      <ProgressBarCard
        label="Nhận hàng"
        icon={Truck}
        tone="indigo"
        moduleLabel="Nhận hàng"
        loading={loading || !p}
        percent={p?.receiving.percent ?? 0}
        numerator={p?.receiving.numerator ?? 0}
        denominator={p?.receiving.denominator ?? 0}
        unitLabel="đơn vị"
        tooltip={TOOLTIPS.receiving}
        drilldownHref={DRILLDOWN_URLS.receiving}
      />
      <ProgressBarCard
        label="Sản xuất nội bộ"
        icon={Factory}
        tone="rose"
        moduleLabel="Sản xuất"
        loading={loading || !p}
        percent={p?.production.percent ?? 0}
        numerator={p?.production.numerator ?? 0}
        denominator={p?.production.denominator ?? 0}
        unitLabel="lệnh"
        tooltip={TOOLTIPS.production}
        drilldownHref={DRILLDOWN_URLS.production}
      />
      <ProgressBarCard
        label="Yêu cầu mua (PR)"
        icon={ClipboardList}
        tone="violet"
        moduleLabel="Yêu cầu mua"
        loading={loading || !p}
        percent={p?.purchaseRequests.percent ?? 0}
        numerator={p?.purchaseRequests.numerator ?? 0}
        denominator={p?.purchaseRequests.denominator ?? 0}
        unitLabel="yêu cầu"
        tooltip={TOOLTIPS.purchaseRequests}
        drilldownHref={DRILLDOWN_URLS.purchaseRequests}
      />
    </div>
  );
}
