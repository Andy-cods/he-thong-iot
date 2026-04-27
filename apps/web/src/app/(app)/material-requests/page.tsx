"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Package,
  Plus,
  Truck,
  XCircle,
} from "lucide-react";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * V3.3 — Material Requests list page.
 *
 * 2 view modes:
 *   - "mine"     — yêu cầu do tôi tạo (mặc định cho engineer)
 *   - "all"      — tất cả (warehouse / admin)
 * Filter status (PENDING / PICKING / READY / DELIVERED / CANCELLED).
 *
 * Action transitions tuỳ role:
 *   - warehouse: PENDING → PICKING / READY, PICKING → READY
 *   - requester: READY → DELIVERED, PENDING → CANCELLED
 */

type Status = "PENDING" | "PICKING" | "READY" | "DELIVERED" | "CANCELLED";

interface MaterialRequestRow {
  id: string;
  requestNo: string;
  bomTemplateId: string | null;
  woId: string | null;
  status: Status;
  requestedBy: string;
  requestedByName: string | null;
  requestedByUsername: string | null;
  pickedAt: string | null;
  readyAt: string | null;
  deliveredAt: string | null;
  notes: string | null;
  warehouseNotes: string | null;
  createdAt: string;
  lineCount: number;
}

interface ListResponse {
  data: MaterialRequestRow[];
  meta: { page: number; pageSize: number; total: number };
}

const STATUS_PILL: Record<Status, { label: string; cls: string; dot: string; icon: React.ElementType }> = {
  PENDING:   { label: "Chờ chuẩn bị", cls: "bg-amber-50 text-amber-700 ring-amber-200",    dot: "bg-amber-500 animate-pulse", icon: Clock        },
  PICKING:   { label: "Đang chuẩn bị", cls: "bg-blue-50 text-blue-700 ring-blue-200",       dot: "bg-blue-500 animate-pulse",  icon: Package      },
  READY:     { label: "Đã sẵn sàng",   cls: "bg-violet-50 text-violet-700 ring-violet-200", dot: "bg-violet-500",              icon: CheckCircle2 },
  DELIVERED: { label: "Đã giao",       cls: "bg-emerald-50 text-emerald-700 ring-emerald-200", dot: "bg-emerald-500",          icon: Truck        },
  CANCELLED: { label: "Đã huỷ",        cls: "bg-zinc-100 text-zinc-500 ring-zinc-200",      dot: "bg-zinc-400",                icon: XCircle      },
};

export default function MaterialRequestsListPage() {
  const [scope, setScope] = React.useState<"mine" | "all">("mine");
  const [statusFilter, setStatusFilter] = React.useState<Status | "all">("all");
  const qc = useQueryClient();

  const query = useQuery<ListResponse>({
    queryKey: ["material-requests", scope, statusFilter],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (scope === "mine") p.set("mine", "1");
      if (statusFilter !== "all") p.append("status", statusFilter);
      p.set("pageSize", "50");
      const res = await fetch(`/api/material-requests?${p}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load");
      return res.json();
    },
    staleTime: 15_000,
  });

  const transition = useMutation({
    mutationFn: async ({ id, to }: { id: string; to: Status }) => {
      const res = await fetch(`/api/material-requests/${id}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ to }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? "Transition failed");
      return body;
    },
    onSuccess: (_, { to }) => {
      toast.success(`Đã chuyển sang ${STATUS_PILL[to].label}`);
      qc.invalidateQueries({ queryKey: ["material-requests"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
    },
    onError: (err) => {
      toast.error((err as Error).message ?? "Lỗi chuyển trạng thái");
    },
  });

  const rows = query.data?.data ?? [];

  return (
    <div className="flex h-full flex-col bg-zinc-50/30">
      <header className="border-b border-zinc-200 bg-white px-6 py-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <nav aria-label="Breadcrumb" className="text-xs text-zinc-500">
              <Link href="/" className="hover:text-zinc-900 hover:underline">Tổng quan</Link>
              <span className="mx-1.5 text-zinc-300">›</span>
              <span className="font-medium text-zinc-900">Yêu cầu vật tư</span>
            </nav>
            <h1 className="mt-2 flex items-center gap-2 text-2xl font-semibold tracking-tight text-zinc-900">
              <FileText className="h-6 w-6 text-indigo-600" aria-hidden />
              Yêu cầu vật tư từ kho
            </h1>
            <p className="mt-1 text-sm text-zinc-500">
              Engineer tạo yêu cầu, kho chuẩn bị và bàn giao linh kiện.
            </p>
          </div>
          <Button asChild size="sm">
            <Link href="/material-requests/new">
              <Plus className="h-4 w-4" aria-hidden />
              Tạo yêu cầu mới
            </Link>
          </Button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-3 border-b border-zinc-200 bg-white px-6 py-3">
        <div className="flex items-center gap-1 rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
          {(["mine", "all"] as const).map((v) => (
            <button
              key={v}
              type="button"
              onClick={() => setScope(v)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                scope === v ? "bg-white text-zinc-900 shadow-sm" : "text-zinc-500 hover:text-zinc-800",
              )}
            >
              {v === "mine" ? "Của tôi" : "Tất cả"}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {(["all", "PENDING", "PICKING", "READY", "DELIVERED", "CANCELLED"] as const).map((s) => {
            const active = statusFilter === s;
            const cfg = s !== "all" ? STATUS_PILL[s] : null;
            return (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={cn(
                  "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                  active
                    ? cfg
                      ? cn("ring-1 ring-inset", cfg.cls)
                      : "border-zinc-800 bg-zinc-900 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                {cfg && (
                  <span className={cn("h-1.5 w-1.5 rounded-full", active ? cfg.dot : "bg-zinc-300")} />
                )}
                {s === "all" ? "Tất cả" : cfg!.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-20 text-sm text-zinc-500">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang tải…
          </div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-zinc-100">
              <FileText className="h-7 w-7 text-zinc-400" aria-hidden />
            </div>
            <h3 className="mt-4 text-base font-semibold text-zinc-900">
              Chưa có yêu cầu nào
            </h3>
            <p className="mt-1.5 text-sm text-zinc-500">
              {scope === "mine" ? "Bạn chưa tạo yêu cầu vật tư nào." : "Hệ thống chưa có yêu cầu nào."}
            </p>
            <Button asChild size="sm" className="mt-4">
              <Link href="/material-requests/new">
                <Plus className="h-4 w-4" />
                Tạo yêu cầu mới
              </Link>
            </Button>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
            <table className="w-full border-collapse">
              <thead>
                <tr className="border-b border-zinc-100 bg-zinc-50/60">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Mã yêu cầu</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Người yêu cầu</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Số dòng</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Trạng thái</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-zinc-400">Ngày tạo</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-zinc-400">Hành động</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const cfg = STATUS_PILL[r.status];
                  return (
                    <tr key={r.id} className="group border-b border-zinc-50 transition-colors hover:bg-zinc-50/70">
                      <td className="px-5 py-3.5">
                        <Link
                          href={`/material-requests/${r.id}`}
                          className="font-mono text-sm font-bold text-indigo-600 hover:underline"
                        >
                          {r.requestNo}
                        </Link>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-zinc-700">
                          {r.requestedByName || r.requestedByUsername || "—"}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <span className="font-mono text-sm font-semibold text-zinc-700">
                          {r.lineCount}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className={cn(
                          "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
                          cfg.cls,
                        )}>
                          <span className={cn("h-1.5 w-1.5 rounded-full", cfg.dot)} />
                          {cfg.label}
                        </span>
                      </td>
                      <td className="px-5 py-3.5">
                        <span className="text-sm text-zinc-600">
                          {new Date(r.createdAt).toLocaleString("vi-VN", {
                            day: "2-digit", month: "2-digit", year: "numeric",
                            hour: "2-digit", minute: "2-digit",
                          })}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {r.status === "PENDING" && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-blue-200 text-blue-700 hover:bg-blue-50"
                              onClick={() => transition.mutate({ id: r.id, to: "PICKING" })}
                              disabled={transition.isPending}
                            >
                              <Package className="h-3.5 w-3.5" /> Bắt đầu chuẩn bị
                            </Button>
                          )}
                          {(r.status === "PENDING" || r.status === "PICKING") && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="h-8 border-violet-200 text-violet-700 hover:bg-violet-50"
                              onClick={() => transition.mutate({ id: r.id, to: "READY" })}
                              disabled={transition.isPending}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" /> Sẵn sàng
                            </Button>
                          )}
                          {r.status === "READY" && (
                            <Button
                              size="sm"
                              className="h-8 bg-emerald-600 text-white hover:bg-emerald-700"
                              onClick={() => transition.mutate({ id: r.id, to: "DELIVERED" })}
                              disabled={transition.isPending}
                            >
                              <Check className="h-3.5 w-3.5" /> Xác nhận đã nhận
                            </Button>
                          )}
                          <Link
                            href={`/material-requests/${r.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-indigo-600 transition-colors"
                          >
                            <ArrowUpRight className="h-4 w-4" aria-hidden />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
