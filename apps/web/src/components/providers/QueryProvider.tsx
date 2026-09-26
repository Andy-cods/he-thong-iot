"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Direction B — React Query provider.
 * Config chuẩn sprint (brainstorm-deep §1.3):
 * - staleTime: 30s cho list mặc định
 * - gcTime: 5 phút
 * - retry: 1
 * - refetchOnWindowFocus: false (dev/UX — tránh flicker khi chuyển tab).
 */
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            gcTime: 5 * 60_000,
            // V4.1 UI-05: không thử lại lỗi quyền/không tồn tại (vô ích);
            // 429 thử lại 1 lần sau ~3s để qua cửa sổ giới hạn tốc độ.
            retry: (failureCount, error) => {
              const status = (error as { status?: number } | null)?.status;
              if (status === 401 || status === 403 || status === 404) return false;
              return failureCount < 1;
            },
            retryDelay: (attempt, error) =>
              (error as { status?: number } | null)?.status === 429
                ? 3_000
                : Math.min(1_000 * 2 ** attempt, 10_000),
            refetchOnWindowFocus: false,
          },
          mutations: {
            retry: 0,
          },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
