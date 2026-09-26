"use client";

import * as React from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { describeQueryError, getErrorStatus } from "@/lib/query-error";

/**
 * V4.1 UI-05: khối báo lỗi tải dữ liệu dùng chung cho mọi danh sách/bảng.
 *
 * Quy tắc 3 trạng thái: đang tải → skeleton; LỖI → khối này + "Thử lại";
 * rỗng thật → EmptyState. TUYỆT ĐỐI không hiện EmptyState "Tạo … đầu tiên"
 * khi API lỗi (429/500/403) — trước đây /admin/users báo "Chưa có người dùng
 * nào" trong khi có 15 user.
 */

export { describeQueryError, getErrorStatus };

export interface QueryErrorProps {
  error: unknown;
  /** Thường là `() => query.refetch()`. */
  onRetry?: () => void;
  /** Đang tải lại (query.isFetching) → khoá nút. */
  retrying?: boolean;
  /** Ghi đè tiêu đề (vd "Không tải được danh sách người dùng"). */
  title?: string;
  /** Kiểu gọn 1 dòng cho panel/ô nhỏ. */
  compact?: boolean;
  className?: string;
}

export function QueryError({
  error,
  onRetry,
  retrying,
  title,
  compact,
  className,
}: QueryErrorProps) {
  const info = describeQueryError(error);
  const status = getErrorStatus(error);
  const heading = status === 429 || status === 403 || status === 401 ? info.title : (title ?? info.title);

  const retryBtn = onRetry ? (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={onRetry}
      disabled={retrying}
      className="min-h-9 shrink-0"
    >
      <RefreshCw
        className={cn("h-3.5 w-3.5", retrying && "animate-spin")}
        aria-hidden="true"
      />
      Thử lại
    </Button>
  ) : null;

  if (compact) {
    return (
      <div
        role="alert"
        className={cn(
          "flex flex-wrap items-center gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200",
          className,
        )}
      >
        <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="font-medium">{heading}.</span> {info.description}
        </span>
        {retryBtn}
      </div>
    );
  }

  return (
    <div
      role="alert"
      className={cn(
        "mx-auto flex max-w-md flex-col items-center px-6 py-12 text-center",
        className,
      )}
    >
      <AlertTriangle
        className="mb-3 text-red-500 dark:text-red-400"
        size={36}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <h3 className="text-md font-medium text-zinc-900 dark:text-zinc-50">
        {heading}
      </h3>
      <p className="mt-1 text-sm leading-normal text-zinc-500 dark:text-zinc-400">
        {info.description}
      </p>
      {status ? (
        <p className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">Mã lỗi: {status}</p>
      ) : null}
      {retryBtn ? <div className="mt-4">{retryBtn}</div> : null}
    </div>
  );
}
