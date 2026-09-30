"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * V4.2 perf (PERF_REDUNDANCY.md #6) — `OverviewTab` (tab "Tổng quan" Tài
 * chính) kéo theo `recharts` (CashflowChart + LineChart nội bộ). Trước đây
 * `sales/page.tsx` import tĩnh `OverviewTab` ở top-level nên MỌI lượt vào
 * `/sales` (kể cả đang xem tab PO/Nhà cung cấp) đều tải chunk recharts.
 *
 * `sales/page.tsx` là Server Component (dùng `cookies()`) nên không thể gọi
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
