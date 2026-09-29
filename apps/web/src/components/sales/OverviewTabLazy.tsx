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
    loading: () => (
      <div className="space-y-3 p-4">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
          <Skeleton className="h-20 w-full" />
        </div>
        <Skeleton className="h-64 w-full" />
      </div>
    ),
  },
);

export function OverviewTabLazy() {
  return <OverviewTab />;
}
