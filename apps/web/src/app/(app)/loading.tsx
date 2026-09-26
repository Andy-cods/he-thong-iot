import { Skeleton } from "@/components/ui/skeleton";

/**
 * V4.1 UI-04 — Khung chờ khi chuyển trang trong (app).
 * Trước đây không có → vùng nội dung trắng trơn trong lúc server render.
 */
export default function AppLoading() {
  return (
    <div
      className="flex flex-col gap-4 px-4 py-6 md:px-6"
      role="status"
      aria-live="polite"
    >
      <span className="sr-only">Đang tải…</span>
      <Skeleton className="h-7 w-56" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <div className="mt-2 flex flex-col gap-2">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="h-9 w-full" />
        ))}
      </div>
    </div>
  );
}
