"use client";

import * as React from "react";
import { QueryProvider } from "./providers/QueryProvider";
import { SonnerProvider } from "./providers/SonnerProvider";

/**
 * Direction B — root provider tree.
 * Giữ tên `Providers` cũ để tương thích với `app/layout.tsx` hiện tại;
 * nội dung refactor sang QueryProvider + SonnerProvider tách riêng.
 *
 * Nuqs + CSRF provider sẽ được bổ sung ở phase Items list (T5).
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryProvider>
      {children}
      <SonnerProvider />
    </QueryProvider>
  );
}
