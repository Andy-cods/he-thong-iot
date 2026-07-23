"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronRight, Folder } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * V3.13 — UI dùng chung cho kho lưu trữ phiếu theo thư mục ngày.
 * Presentational thuần (không gọi API) — dùng cho cả material-requests và
 * purchase-requests. Mobile-safe: grid co giãn, chữ truncate/wrap.
 */

export interface FolderChip {
  label: string;
  count: number;
  /** class màu chấm, vd "bg-amber-500". */
  dot: string;
}

export interface FolderCardProps {
  href: string;
  /** Dòng chính, vd "Tháng 7 / 2026" hoặc "17/07". */
  title: string;
  /** Dòng phụ nhỏ, vd "Thứ Sáu" hoặc "12 ngày có phiếu". */
  subtitle?: string;
  count: number;
  countLabel?: string;
  chips?: FolderChip[];
  className?: string;
}

/** Lưới thẻ folder — co giãn theo màn hình. */
export function FolderGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {children}
    </div>
  );
}

/** Một thẻ thư mục (tháng hoặc ngày). */
export function FolderCard({
  href,
  title,
  subtitle,
  count,
  countLabel = "phiếu",
  chips,
  className,
}: FolderCardProps) {
  return (
    <Link
      href={href}
      className={cn(
        "group flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:border-indigo-300 hover:shadow-md dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-indigo-700",
        className,
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 transition-colors group-hover:bg-indigo-100 dark:bg-indigo-950/50 dark:text-indigo-400 dark:group-hover:bg-indigo-900/50">
          <Folder className="h-5 w-5" aria-hidden />
        </div>
        <span className="inline-flex items-baseline gap-1 rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-semibold tabular-nums text-zinc-700 dark:bg-zinc-800 dark:text-zinc-200">
          {count.toLocaleString("vi-VN")}
          <span className="text-xs font-normal text-zinc-500 dark:text-zinc-400">
            {countLabel}
          </span>
        </span>
      </div>

      <div className="min-w-0">
        <div className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-50">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-xs text-zinc-500 dark:text-zinc-400">
            {subtitle}
          </div>
        )}
      </div>

      {chips && chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips
            .filter((c) => c.count > 0)
            .map((c) => (
              <span
                key={c.label}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-50 px-2 py-0.5 text-xs text-zinc-600 ring-1 ring-inset ring-zinc-200 dark:bg-zinc-800/60 dark:text-zinc-400 dark:ring-zinc-700"
              >
                <span className={cn("h-1.5 w-1.5 rounded-full", c.dot)} />
                {c.label}
                <span className="font-semibold tabular-nums">{c.count}</span>
              </span>
            ))}
        </div>
      )}
    </Link>
  );
}

export interface CrumbItem {
  label: string;
  href?: string;
}

/** Breadcrumb điều hướng giữa các cấp thư mục. */
export function FolderBreadcrumb({ items }: { items: CrumbItem[] }) {
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex flex-wrap items-center gap-1 text-sm text-zinc-500 dark:text-zinc-400"
    >
      {items.map((it, i) => {
        const last = i === items.length - 1;
        return (
          <React.Fragment key={`${it.label}-${i}`}>
            {it.href && !last ? (
              <Link
                href={it.href}
                className="rounded px-1 py-0.5 font-medium hover:text-zinc-900 hover:underline dark:hover:text-zinc-50"
              >
                {it.label}
              </Link>
            ) : (
              <span
                className={cn(
                  "px-1 py-0.5",
                  last && "font-semibold text-zinc-900 dark:text-zinc-50",
                )}
              >
                {it.label}
              </span>
            )}
            {!last && (
              <ChevronRight
                className="h-3.5 w-3.5 shrink-0 text-zinc-300 dark:text-zinc-600"
                aria-hidden
              />
            )}
          </React.Fragment>
        );
      })}
    </nav>
  );
}
