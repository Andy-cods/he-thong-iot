"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import type {
  UniverSpreadsheetHandle,
  UniverSpreadsheetProps,
} from "./UniverSpreadsheet";

/**
 * V1.5 BOM Core — dynamic import wrapper cho UniverSpreadsheet.
 *
 * Univer touch `window` + `document` + `ResizeObserver` ở import time.
 * Không thể render qua SSR → BẮT BUỘC dùng `ssr: false`.
 *
 * forwardRef wrapper để pass ref xuyên qua dynamic (Next.js dynamic type
 * không preserve ref — wrap thủ công).
 */

type LazyProps = UniverSpreadsheetProps & {
  forwardedRef?: React.Ref<UniverSpreadsheetHandle>;
};

const UniverSpreadsheetInner = dynamic<LazyProps>(
  () =>
    import("./UniverSpreadsheet").then((m) => {
      const Component = m.UniverSpreadsheet;
      const Wrapped: React.FC<LazyProps> = ({ forwardedRef, ...props }) => (
        <Component ref={forwardedRef} {...props} />
      );
      Wrapped.displayName = "UniverSpreadsheetInner";
      return Wrapped;
    }),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[400px] w-full items-center justify-center rounded-md border border-zinc-200 bg-zinc-50 text-sm text-zinc-500">
        Đang tải bảng tính BOM…
      </div>
    ),
  },
);

export const UniverSpreadsheetLazy = React.forwardRef<
  UniverSpreadsheetHandle,
  UniverSpreadsheetProps
>(function UniverSpreadsheetLazy(props, ref) {
  return <UniverSpreadsheetInner {...props} forwardedRef={ref} />;
});
