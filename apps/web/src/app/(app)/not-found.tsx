"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileQuestion, Home, ArrowLeft } from "lucide-react";

export default function NotFound() {
  const router = useRouter();

  return (
    <div className="flex min-h-[400px] flex-col items-center justify-center gap-6 py-24">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800">
          <FileQuestion
            className="h-8 w-8 text-zinc-400 dark:text-zinc-500"
            aria-hidden="true"
          />
        </div>
        <span className="font-mono text-6xl font-bold text-zinc-200 select-none dark:text-zinc-800">
          404
        </span>
        {/* V4.4 A17 — global CSS ép dark:text-zinc-50 cho mọi h1 (globals.css);
            khai báo tường minh ở đây để không phụ thuộc ngầm vào rule đó. */}
        <h1 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
          Trang không tìm thấy
        </h1>
        <p className="max-w-sm text-sm text-zinc-500 dark:text-zinc-400">
          Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển. Kiểm tra lại
          đường dẫn hoặc quay về trang chủ.
        </p>
      </div>

      <div className="flex gap-3">
        <Link
          href="/"
          className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
        >
          <Home className="h-4 w-4" aria-hidden="true" />
          Về trang chủ
        </Link>
        <button
          type="button"
          onClick={() => router.back()}
          className="inline-flex h-9 items-center gap-2 rounded-md border border-zinc-300 bg-white px-4 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Quay lại
        </button>
      </div>
    </div>
  );
}
