import Link from "next/link";
import { FileQuestion, Home } from "lucide-react";

export default function RootNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-6 bg-zinc-50 px-4">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-zinc-100">
          <FileQuestion
            className="h-8 w-8 text-zinc-400"
            aria-hidden="true"
          />
        </div>
        <span className="font-mono text-6xl font-bold text-zinc-200 select-none">
          404
        </span>
        <h1 className="text-xl font-semibold text-zinc-900">
          Trang không tìm thấy
        </h1>
        <p className="max-w-sm text-sm text-zinc-500">
          Trang bạn đang tìm không tồn tại hoặc đã bị di chuyển.
        </p>
      </div>

      <Link
        href="/"
        className="inline-flex h-9 items-center gap-2 rounded-md bg-indigo-600 px-4 text-sm font-medium text-white transition-colors hover:bg-indigo-700"
      >
        <Home className="h-4 w-4" aria-hidden="true" />
        Về trang chủ
      </Link>
    </div>
  );
}
