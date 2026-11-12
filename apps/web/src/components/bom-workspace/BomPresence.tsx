"use client";

import * as React from "react";
import type { BomViewer } from "@/hooks/useBomLive";

const COLORS = [
  "bg-sky-500",
  "bg-emerald-500",
  "bg-amber-500",
  "bg-violet-500",
  "bg-rose-500",
  "bg-teal-500",
  "bg-indigo-500",
  "bg-orange-500",
];

function colorOf(id: string): string {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return COLORS[h % COLORS.length]!;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const last = parts[parts.length - 1]!;
  const first = parts.length > 1 ? parts[0]! : "";
  return ((first[0] ?? "") + (last[0] ?? "")).toUpperCase();
}

/** BOM V5 / WP9 — avatar nhỏ "đang xem BOM này" (tối đa 5 + số còn lại). */
export function BomPresence({
  viewers,
  connected,
}: {
  viewers: BomViewer[];
  connected: boolean;
}) {
  if (viewers.length === 0) return null;
  const shown = viewers.slice(0, 5);
  const rest = viewers.length - shown.length;
  return (
    <div
      className="flex items-center gap-1"
      aria-label="Đang xem BOM này"
      title="Đang xem BOM này"
    >
      <span
        className={`mr-1 inline-block h-2 w-2 rounded-full ${connected ? "bg-emerald-500" : "bg-zinc-400"}`}
        title={connected ? "Đang đồng bộ trực tiếp" : "Mất kết nối trực tiếp — đang tự thử lại"}
      />
      <div className="flex -space-x-1.5">
        {shown.map((v) => (
          <span
            key={v.id}
            title={v.name}
            className={`inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white text-[10px] font-semibold text-white dark:border-zinc-900 ${colorOf(v.id)}`}
          >
            {initials(v.name)}
          </span>
        ))}
        {rest > 0 ? (
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border-2 border-white bg-zinc-300 text-[10px] font-semibold text-zinc-700 dark:border-zinc-900">
            +{rest}
          </span>
        ) : null}
      </div>
    </div>
  );
}
