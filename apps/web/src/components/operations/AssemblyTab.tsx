"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ClipboardList,
  Factory,
  Loader2,
  Search,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useWorkOrdersList, type WorkOrderRow } from "@/hooks/useWorkOrders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * V2.0-P2-W6 — Assembly landing.
 *
 * Hiển thị danh sách các Work Order đang sẵn sàng lắp ráp:
 *   - status IN_PROGRESS hoặc QUEUED hoặc RELEASED
 *   - chưa hoàn thành (goodQty < plannedQty)
 *
 * Mỗi WO là 1 card có progress bar, click để vào workspace
 * `/assembly/[woId]`.
 */

const STATUS_FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "IN_PROGRESS", label: "Đang lắp" },
  { value: "QUEUED", label: "Đang chờ" },
  { value: "RELEASED", label: "Sẵn sàng" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function statusVariant(s: string): "success" | "info" | "warning" | "outline" {
  switch (s) {
    case "IN_PROGRESS":
      return "info";
    case "QUEUED":
      return "warning";
    case "RELEASED":
      return "success";
    default:
      return "outline";
  }
}

function statusLabel(s: string): string {
  switch (s) {
    case "IN_PROGRESS":
      return "Đang lắp";
    case "QUEUED":
      return "Chờ lắp";
    case "RELEASED":
      return "Sẵn sàng";
    case "PAUSED":
      return "Tạm dừng";
    default:
      return s;
  }
}

function WoCard({ wo }: { wo: WorkOrderRow }) {
  const planned = num(wo.plannedQty);
  const good = num(wo.goodQty);
  const remaining = Math.max(0, planned - good);
  const pct = planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
  const done = pct >= 100;

  return (
    <Link
      href={`/assembly/${wo.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-md border border-zinc-200 bg-white p-4 transition-all hover:border-indigo-400 hover:shadow-sm",
        done && "border-emerald-200 bg-emerald-50/30",
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-semibold text-zinc-900">
              {wo.woNo}
            </code>
            <Badge variant={statusVariant(wo.status)} className="text-[10px]">
              {statusLabel(wo.status)}
            </Badge>
          </div>
          {wo.orderNo ? (
            <p className="mt-1 truncate text-xs text-zinc-500">
              Đơn hàng: <span className="font-medium">{wo.orderNo}</span>
            </p>
          ) : null}
        </div>
        <ArrowRight
          className="h-4 w-4 shrink-0 text-zinc-300 transition-colors group-hover:text-indigo-500"
          aria-hidden
        />
      </div>

      {/* Quantity + progress */}
      <div>
        <div className="mb-1 flex items-baseline justify-between text-xs">
          <span className="text-zinc-500">
            <span className="font-semibold tabular-nums text-zinc-900">
              {good}
            </span>
            <span className="text-zinc-400"> / {planned}</span>
            {" cái"}
          </span>
          <span
            className={cn(
              "tabular-nums font-medium",
              done ? "text-emerald-700" : "text-indigo-700",
            )}
          >
            {pct}%
          </span>
        </div>
        <div className="relative h-1.5 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={cn(
              "absolute inset-y-0 left-0 rounded-full transition-all duration-300",
              done ? "bg-emerald-500" : "bg-indigo-500",
            )}
            style={{ width: `${pct}%` }}
          />
        </div>
        {remaining > 0 ? (
          <p className="mt-1.5 text-[11px] text-zinc-500">
            Còn{" "}
            <span className="font-semibold text-zinc-700">{remaining}</span>{" "}
            cái cần lắp
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-emerald-600">
            Đã đủ số lượng
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px] text-zinc-500">
        <span className="inline-flex items-center gap-1">
          <ClipboardList className="h-3 w-3" aria-hidden />
          Ưu tiên {wo.priority}
        </span>
        <span className="font-medium text-indigo-600 group-hover:underline">
          Bắt đầu lắp ráp →
        </span>
      </div>
    </Link>
  );
}

export function AssemblyTab() {
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<StatusFilter>("ALL");

  // Tải nhiều status (server filter chỉ chấp nhận status chọn)
  const statusFilter: WorkOrderRow["status"][] =
    status === "ALL"
      ? (["IN_PROGRESS", "QUEUED", "RELEASED"] as const).slice()
      : [status as WorkOrderRow["status"]];

  const query = useWorkOrdersList({
    status: statusFilter,
    q: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  });

  const rows = query.data?.data ?? [];

  // Lọc thêm: chỉ hiển thị WO chưa hoàn tất (good < planned)
  const visible = React.useMemo(() => {
    return rows.filter((r) => num(r.goodQty) < num(r.plannedQty));
  }, [rows]);

  const grouped = React.useMemo(() => {
    const inProg = visible.filter((r) => r.status === "IN_PROGRESS");
    const others = visible.filter((r) => r.status !== "IN_PROGRESS");
    return { inProg, others };
  }, [visible]);

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <section>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Wrench className="h-5 w-5 text-zinc-500" aria-hidden />
          Lắp ráp
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Chọn một lệnh sản xuất (WO) để vào màn quét barcode lắp ráp. Card hiển
          thị tiến độ + số cần lắp tiếp.
        </p>
      </section>

      {/* Filter bar */}
      <section className="flex flex-wrap items-center gap-3 rounded-md border border-zinc-200 bg-white p-3">
        <div className="relative min-w-[260px] flex-1">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm theo WO, mã đơn..."
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatus(opt.value)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                status === opt.value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-xs text-zinc-500">
          {query.isLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Đang tải…
            </span>
          ) : (
            <span>
              {visible.length} WO •{" "}
              {grouped.inProg.length} đang lắp,{" "}
              {grouped.others.length} chờ
            </span>
          )}
        </div>
      </section>

      {/* List */}
      {query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Đang tải danh sách WO…
        </div>
      ) : query.isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Lỗi tải danh sách:{" "}
          {(query.error as Error | null)?.message ?? "Không rõ"}
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-md border border-dashed border-zinc-200 bg-zinc-50/50 py-16 text-center">
          <Factory className="h-8 w-8 text-zinc-300" aria-hidden />
          <p className="text-sm font-medium text-zinc-700">
            Không có WO nào sẵn sàng lắp ráp
          </p>
          <p className="max-w-md text-xs text-zinc-500">
            Tạo WO mới ở trang{" "}
            <Link
              href="/work-orders"
              className="text-indigo-600 hover:underline"
            >
              Lệnh sản xuất
            </Link>{" "}
            hoặc đổi trạng thái sang Released/Queued để bắt đầu lắp ráp.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {grouped.inProg.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Đang lắp ráp ({grouped.inProg.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grouped.inProg.map((wo) => (
                  <WoCard key={wo.id} wo={wo} />
                ))}
              </div>
            </section>
          ) : null}

          {grouped.others.length > 0 ? (
            <section>
              <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-zinc-500">
                Chờ lắp ráp ({grouped.others.length})
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {grouped.others.map((wo) => (
                  <WoCard key={wo.id} wo={wo} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
