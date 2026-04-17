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
            retry: 1,
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
