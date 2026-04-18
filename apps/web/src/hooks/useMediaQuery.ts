"use client";

import * as React from "react";

/**
 * useMediaQuery — SSR-safe wrapper quanh window.matchMedia dùng
 * useSyncExternalStore (React 18+).
 *
 * Server render mặc định `false` (KHÔNG hydration mismatch) — client remount
 * tick đầu tiên sẽ evaluate đúng. Nếu cần default khác server-side, dùng CSS
 * utility (`hidden md:block`) thay vì JS.
 *
 * Ví dụ:
 *   const isMobile = useIsMobile(); // true khi < 768px
 *   {isMobile ? <Drawer /> : <Sidebar />}
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (cb: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** < 768px (mobile portrait). Tailwind breakpoint md. */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}

/** 768px–1023px (tablet). Tailwind breakpoint md → lg. */
export function useIsTablet(): boolean {
  return useMediaQuery("(min-width: 768px) and (max-width: 1023px)");
}

/** < 1024px (mobile + tablet). Tailwind breakpoint lg. */
export function useIsBelowDesktop(): boolean {
  return useMediaQuery("(max-width: 1023px)");
}
