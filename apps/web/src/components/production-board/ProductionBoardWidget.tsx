"use client";

import Link from "next/link";
import { MonitorPlay, Tv } from "lucide-react";
import { useProductionBoard, type BoardStatus } from "@/hooks/useProductionBoard";
import { cn } from "@/lib/utils";
import { TONE_CLASSES, getStatus } from "@/lib/status";

/**
 * V3.8 — Widget tóm tắt Bảng sản xuất trên homepage.
 *
 * Hiển thị: đếm theo trạng thái + vài mã đang gia công + link mở màn TV.
 * Mọi role đã đăng nhập đều xem (read). Auto-refresh 30s.
 */

// V4.1 UI-07: bỏ STATUS_META cục bộ — nhãn ngắn + màu lấy từ lib/status.ts
// domain "board" (Đang GC = indigo "đang xử lý", không còn cam riêng).
function boardMeta(s: BoardStatus) {
  const d = getStatus("board", s);
  const tone = TONE_CLASSES[d.tone];
  return { label: d.short ?? d.label, dot: tone.dot, text: tone.text };
}

export function ProductionBoardWidget() {
  const { data, isLoading } = useProductionBoard({
    completedLimit: 0,
    refetchInterval: 30_000,
  });

  const counts = data?.counts;
  const active = (data?.data ?? []).filter(
    (i) => i.status === "IN_PROGRESS" || i.status === "QC",
  );
  const totalActive =
    (counts?.IN_PROGRESS ?? 0) + (counts?.QC ?? 0) + (counts?.QUEUED ?? 0);

  // Ẩn widget nếu bảng trống (chưa dùng tính năng) để không chiếm chỗ homepage.
  if (!isLoading && totalActive === 0 && (counts?.COMPLETED ?? 0) === 0) {
    return null;
  }

  return (
    // V4.1 UI-24 (X8, Đợt 6C): dải tiêu đề indigo đặc/gradient → header trắng.
    <section className="overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
      <div className="flex items-center justify-between gap-2 border-b border-zinc-100 px-4 py-3 dark:border-zinc-800 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <MonitorPlay className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" />
          <h2 className="truncate text-sm font-semibold text-zinc-900 dark:text-zinc-50">
            Bảng điều hành sản xuất
          </h2>
        </div>
        <a
          href="/board"
          target="_blank"
          rel="noreferrer"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
          title="Mở màn hình TV full-screen"
        >
          <Tv className="h-3.5 w-3.5" />
          Màn hình TV
        </a>
      </div>

      <div className="p-4 md:p-5">
        {/* Counts */}
        <div className="grid grid-cols-3 gap-3">
          {(["IN_PROGRESS", "QC", "QUEUED"] as BoardStatus[]).map((s) => (
            <div
              key={s}
              className="rounded-xl border border-zinc-100 bg-zinc-50 p-3 text-center dark:border-zinc-800 dark:bg-zinc-800/40"
            >
              <p
                className={cn(
                  "text-2xl font-semibold tabular-nums",
                  boardMeta(s).text,
                )}
              >
                {counts?.[s] ?? 0}
              </p>
              <p className="mt-0.5 flex items-center justify-center gap-1 text-xs text-zinc-500 dark:text-zinc-400">
                <span className={cn("h-1.5 w-1.5 rounded-full", boardMeta(s).dot)} />
                {boardMeta(s).label}
              </p>
            </div>
          ))}
        </div>

        {/* Active list */}
        {active.length > 0 && (
          <ul className="mt-4 space-y-1.5">
            {active.slice(0, 4).map((it) => {
              const done = Number(it.qtyDone) || 0;
              const planned = Number(it.qtyPlanned) || 0;
              const pct =
                planned > 0 ? Math.min(100, Math.round((done / planned) * 100)) : 0;
              return (
                <li
                  key={it.id}
                  className="flex items-center gap-3 text-sm"
                >
                  <span
                    className={cn(
                      "h-2 w-2 shrink-0 rounded-full",
                      boardMeta(it.status).dot,
                    )}
                  />
                  <span className="font-mono text-xs font-semibold text-zinc-700 dark:text-zinc-200">
                    {shortCode(it.productCode)}
                  </span>
                  <span className="flex-1 truncate text-zinc-500 dark:text-zinc-400">
                    {firstLine(it.productName)}
                  </span>
                  <span className="font-mono text-xs tabular-nums text-zinc-400">
                    {pct}%
                  </span>
                </li>
              );
            })}
          </ul>
        )}

        <Link
          href="/production-board"
          className="mt-4 inline-block text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
        >
          Xem & quản lý bảng →
        </Link>
      </div>
    </section>
  );
}

function shortCode(code: string): string {
  const m = code.match(/-(\d+)$/);
  return m?.[1] ?? code;
}
function firstLine(s: string): string {
  return s.split(/[\n,]/)[0]?.trim() || s;
}
