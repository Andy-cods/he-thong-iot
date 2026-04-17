"use client";

import * as React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { QueryProvider } from "./providers/QueryProvider";
import { SonnerProvider } from "./providers/SonnerProvider";

/**
 * Direction B — root provider tree.
 * Giữ tên `Providers` cũ để tương thích với `app/layout.tsx` hiện tại;
 * nội dung refactor sang QueryProvider + SonnerProvider tách riêng.
 *
 * Thêm NuqsAdapter (T5) để URL-state filter `/items` đồng bộ query params
 * theo brainstorm-deep §1.5.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NuqsAdapter>
      <QueryProvider>
        {children}
        <SonnerProvider />
      </QueryProvider>
    </NuqsAdapter>
  );
}
