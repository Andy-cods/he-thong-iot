"use client";

import * as React from "react";
import Link from "next/link";
import { AlertTriangle, Home, RotateCcw } from "lucide-react";

/**
 * V4.1 UI-04 — Bắt lỗi runtime trong khu vực (app).
 *
 * Trước đây không có error boundary nào: một lỗi JS (ví dụ SX-01) làm cả trang
 * trắng với dòng tiếng Anh "Application error…". Giờ giữ nguyên thanh điều hướng
 * (layout vẫn render), chỉ vùng nội dung hiện thông báo + nút Thử lại.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  React.useEffect(() => {
    // eslint-disable-next-line no-console
    console.error("[app-error]", error);
  }, [error]);

  return (
    <div
      role="alert"
      className="flex min-h-[400px] flex-col items-center justify-center gap-6 px-4 py-16"
    >
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-50 dark:bg-amber-950/40">
          <AlertTriangle
            className="h-7 w-7 text-amber-600 dark:text-amber-400"
            aria-hidden="true"
          />
        </div>
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Trang này đang gặp lỗi
        </h1>
        <p className="max-w-md text-sm text-zinc-600 dark:text-zinc-400">
          Hệ thống không hiển thị được nội dung này. Bạn có thể thử tải lại; nếu
          lỗi vẫn còn, hãy chụp màn hình và báo cho quản trị viên.
        </p>
        {error.digest ? (
          <p className="font-mono text-xs text-zinc-500 dark:text-zinc-500">
            Mã lỗi: {error.digest}
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="inline-flex h-10 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
        >
          <RotateCcw className="h-4 w-4" aria-hidden="true" />
          Thử lại
        </button>
        <Link
          href="/"
          className="inline-flex h-10 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Về trang chủ
        </Link>
      </div>
    </div>
  );
}
