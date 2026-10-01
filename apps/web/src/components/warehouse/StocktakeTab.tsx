"use client";

import { StocktakeSection } from "./StocktakeSection";

/**
 * TASK-6VIEC Việc 4 — tab "Kiểm kê" riêng (ngang "Báo cáo kho"). Trước đây
 * `<StocktakeSection />` nằm lồng bên trong `ReportTab` (V4.3 Việc 2) — nay
 * tách ra tab cấp 1 của hub Kho cho dễ tìm, không lẫn với báo cáo bin/tồn.
 * Link cũ `/warehouse?tab=report&stocktake=<id>` (thông báo đã gửi trước khi
 * tách) vẫn mở đúng phiên — xem backward-compat ở `warehouse/page.tsx` +
 * `StocktakeSection` (đọc cả `?id=` mới lẫn `?stocktake=` cũ).
 */
export function StocktakeTab() {
  // Không thêm tiêu đề trang riêng — `<StocktakeSection>` đã tự có header
  // "Kiểm kê kho" + mô tả trong card của nó (trước nằm lồng trong ReportTab
  // cũng theo đúng cách này, không có tiêu đề trang bọc ngoài).
  return (
    <div className="flex h-full flex-col gap-4 overflow-auto p-6">
      <StocktakeSection />
    </div>
  );
}
