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
  useSessionExpiryRedirect();
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

/**
 * Hết phiên (JWT 4 giờ, không refresh) → mọi /api/* trả 401. Thay vì để từng
 * widget hiện lỗi/rỗng lung tung, bắt 401 tập trung ở fetch và đưa user về
 * trang đăng nhập (kèm `next` để quay lại đúng trang đang làm).
 */
function useSessionExpiryRedirect() {
  React.useEffect(() => {
    const w = window as typeof window & { __iotFetchPatched?: boolean };
    if (w.__iotFetchPatched) return;
    w.__iotFetchPatched = true;
    const original = window.fetch.bind(window);
    let redirecting = false;
    window.fetch = async (input, init) => {
      const res = await original(input, init);
      if (res.status === 401 && !redirecting) {
        const url =
          typeof input === "string"
            ? input
            : input instanceof URL
              ? input.href
              : input.url;
        const path = new URL(url, window.location.origin);
        const isOwnApi =
          path.origin === window.location.origin &&
          path.pathname.startsWith("/api/") &&
          !path.pathname.startsWith("/api/auth/");
        if (isOwnApi && !window.location.pathname.startsWith("/login")) {
          redirecting = true;
          const next = window.location.pathname + window.location.search;
          window.location.assign(
            `/login?reason=expired&next=${encodeURIComponent(next)}`,
          );
        }
      }
      return res;
    };
  }, []);
}
