"use client";

import { Network } from "lucide-react";
import { KpiCard } from "./KpiCard";
import { useBomList } from "@/hooks/useBom";

/**
 * BomKpiCard — client wrapper hiển thị KPI "BOM Templates" với count thật
 * từ API. Dùng trong dashboard RSC (truyền qua Client boundary OK).
 */
export function BomKpiCard() {
  const query = useBomList({ status: ["ACTIVE"], pageSize: 1, page: 1 });
  const total = query.data?.meta.total ?? 0;

  return (
    <KpiCard
      label="BOM Templates"
      value={total}
      status="info"
      icon={<Network className="h-3.5 w-3.5" aria-hidden="true" />}
      href="/bom"
      delta={{ value: 0, direction: "flat", label: "đang hoạt động" }}
      loading={query.isLoading}
    />
  );
}
