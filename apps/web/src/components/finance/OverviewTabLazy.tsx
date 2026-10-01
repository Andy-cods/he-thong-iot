"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V4.2 perf (PERF_REDUNDANCY.md #6) — `OverviewTab` (tab "Tổng quan" Tài
 * chính) kéo theo `recharts` (CashflowChart + LineChart nội bộ). Import tĩnh
 * `OverviewTab` ở top-level trang hub sẽ khiến MỌI lượt vào hub (kể cả đang
 * xem tab Sổ quỹ/Công nợ) đều tải chunk recharts.
 *
 * TASK-20261001 — dùng ở `finance/page.tsx` (trước đây ở `sales/page.tsx`
 * khi Tài chính còn là tab con của Thu mua, nay đã tách hub riêng).
 * `finance/page.tsx` là Server Component nên không thể gọi
 * `next/dynamic(..., { ssr: false })` trực tiếp trong đó (Next chỉ cho phép
 * `ssr: false` trong Client Component) — bọc qua client wrapper này, theo
 * đúng pattern `AuditRow.tsx` đã dùng cho `AuditDiffViewer`.
 *
 * KHÔNG sửa `components/finance/**` — chỉ lazy-load từ bên ngoài.
 */
const OverviewTab = dynamic(
  () => import("@/components/finance/OverviewTab").then((m) => m.OverviewTab),
  {
    ssr: false,
    // V4.4 — khớp CHÍNH XÁC hình dạng skeleton nội bộ của `OverviewTab`
    // (hero + 5 thẻ KPI + biểu đồ) để không có cú "nhảy" bố cục khi chunk
    // tải xong và component tự render skeleton riêng trong lúc chờ data.
    loading: () => (
      <div className="space-y-6 p-4 md:p-6">
        <Skeleton className="h-28 rounded-xl" />
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-80 rounded-xl" />
      </div>
    ),
  },
);

export function OverviewTabLazy() {
  return <OverviewTab />;
}
