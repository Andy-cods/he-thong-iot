"use client";

import * as React from "react";
import { NuqsAdapter } from "nuqs/adapters/next/app";
import { QueryProvider } from "./providers/QueryProvider";
import { SonnerProvider } from "./providers/SonnerProvider";
import { ThemeProvider } from "./providers/ThemeProvider";
import { ConfirmProvider } from "./ui/confirm-dialog";
import { installZodVi } from "@/lib/zod-vi";

// V4.1 UI-28: lỗi zod mặc định tiếng Việt cho mọi form phía client.
installZodVi();

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
    <ThemeProvider>
      <NuqsAdapter>
        <QueryProvider>
          {/* V4.1 UX-01: hộp xác nhận/nhập lý do dạng Promise (useConfirm/usePrompt). */}
          <ConfirmProvider>
            {children}
            <SonnerProvider />
          </ConfirmProvider>
        </QueryProvider>
      </NuqsAdapter>
    </ThemeProvider>
  );
}
