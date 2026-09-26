"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type { AuditRow } from "@/hooks/useAdmin";
import { AUDIT_ACTION_OPTIONS } from "@/lib/audit-scope";

const ACTION_LABEL = new Map(AUDIT_ACTION_OPTIONS.map((a) => [a.code, a.label]));

function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * V4.1 AD-10 — lịch sử thay đổi của ĐÚNG 1 chứng từ, xem ngay trong trang
 * (không cần vào trang Quản trị — người không phải admin không vào được).
 * API /api/admin/audit cho phép truy vấn thu hẹp 1 loại + objectId nếu người
 * xem đọc được chứng từ đó (lib/audit-scope.ts).
 */
export function ObjectAuditList({
  objectType,
  objectId,
}: {
  objectType: string;
  objectId: string;
}) {
  const q = useQuery<{ data: AuditRow[] }>({
    queryKey: ["object-audit", objectType, objectId],
    queryFn: async () => {
      const p = new URLSearchParams({ entity: objectType, objectId, pageSize: "100" });
      const res = await fetch(`/api/admin/audit?${p.toString()}`, {
        credentials: "include",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res.json();
    },
    staleTime: 30_000,
  });

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 p-6 text-sm text-zinc-500 dark:text-zinc-400">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
        Đang tải…
      </div>
    );
  }
  if (q.isError) {
    return (
      <p className="p-6 text-center text-sm text-rose-600 dark:text-rose-400">
        Không tải được lịch sử.{" "}
        <button type="button" className="underline" onClick={() => void q.refetch()}>
          Thử lại
        </button>
      </p>
    );
  }
  const rows = q.data?.data ?? [];
  if (rows.length === 0) {
    return (
      <p className="p-6 text-center text-sm text-zinc-500 dark:text-zinc-400">
        Chưa có lịch sử thay đổi.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-zinc-100 dark:divide-zinc-800">
      {rows.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start gap-x-3 gap-y-0.5 px-5 py-3 text-sm">
          <span className="whitespace-nowrap font-mono text-xs text-zinc-500 dark:text-zinc-400">
            {fmt(a.occurredAt)}
          </span>
          <span className="font-medium text-zinc-900 dark:text-zinc-50">
            {a.actorUsername ?? "hệ thống"}
          </span>
          <span className="text-zinc-700 dark:text-zinc-300">
            {ACTION_LABEL.get(a.action) ?? a.action}
          </span>
          {a.notes ? (
            <span className="w-full text-xs text-zinc-500 dark:text-zinc-400">{a.notes}</span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
