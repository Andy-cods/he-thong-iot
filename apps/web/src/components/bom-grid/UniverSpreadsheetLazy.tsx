"use client";

import dynamic from "next/dynamic";

/**
 * V1.5 BOM Core — dynamic import wrapper cho UniverSpreadsheet.
 *
 * Univer touch `window` + `document` + `ResizeObserver` ở import time.
 * Không thể render qua SSR → BẮT BUỘC dùng `ssr: false`.
 *
 * Thêm loading fallback tiếng Việt.
 */
export const UniverSpreadsheetLazy = dynamic(
  () =>
    import("./UniverSpreadsheet").then((m) => ({
      default: m.UniverSpreadsheet,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        Đang tải bảng tính BOM…
      </div>
    ),
  },
);
