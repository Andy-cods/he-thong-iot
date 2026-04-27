"use client";

import * as React from "react";
import Link from "next/link";
import {
  CheckCircle2,
  Factory,
  Loader2,
  Pause,
  Search,
  Wrench,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useWorkOrdersList, type WorkOrderRow } from "@/hooks/useWorkOrders";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * V2.1 — Assembly landing redesign.
 *
 * 3 sections: "Đang SX" / "Tạm dừng" / "Hoàn thành gần đây"
 * Card layout: grid 3 cols trên desktop, 1 col mobile.
 * Mỗi card: SVG progress ring + woNo + orderNo + status badge + "Vào xưởng" button.
 */

const STATUS_FILTERS = [
  { value: "ALL", label: "Tất cả" },
  { value: "IN_PROGRESS", label: "Đang lắp" },
  { value: "QUEUED", label: "Đang chờ" },
  { value: "RELEASED", label: "Sẵn sàng" },
  { value: "PAUSED", label: "Tạm dừng" },
] as const;

type StatusFilter = (typeof STATUS_FILTERS)[number]["value"];

function num(v: string | number | null | undefined): number {
  if (v == null) return 0;
  const n = typeof v === "string" ? parseFloat(v) : v;
  return Number.isFinite(n) ? n : 0;
}

function statusLabel(s: string): string {
  switch (s) {
    case "IN_PROGRESS": return "Đang lắp";
    case "QUEUED":      return "Chờ lắp";
    case "RELEASED":    return "Sẵn sàng";
    case "PAUSED":      return "Tạm dừng";
    default:            return s;
  }
}

function statusVariant(
  s: string,
): "success" | "info" | "warning" | "outline" | "danger" {
  switch (s) {
    case "IN_PROGRESS": return "info";
    case "QUEUED":      return "warning";
    case "RELEASED":    return "success";
    case "PAUSED":      return "warning";
    default:            return "outline";
  }
}

/** Inline SVG progress ring — no extra package needed. */
function ProgressRing({
  pct,
  size = 56,
  strokeWidth = 5,
}: {
  pct: number;
  size?: number;
  strokeWidth?: number;
}) {
  const R = (size - strokeWidth) / 2;
  const C = 2 * Math.PI * R;
  const offset = C - (Math.min(100, pct) / 100) * C;
  const done = pct >= 100;
  const stroke = done ? "#10b981" : pct > 0 ? "#6366f1" : "#d4d4d8";

  return (
    <div
      className="relative shrink-0"
      style={{ width: size, height: size }}
      aria-label={`${pct}% hoàn thành`}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        aria-hidden
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke="#f4f4f5"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={R}
          fill="none"
          stroke={stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={C}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.5s ease" }}
        />
      </svg>
      <span
        className={cn(
          "absolute inset-0 flex items-center justify-center font-mono text-[11px] font-bold tabular-nums",
          done ? "text-emerald-700" : "text-zinc-700",
        )}
      >
        {pct}%
      </span>
    </div>
  );
}

function WoCard({ wo }: { wo: WorkOrderRow }) {
  const planned = num(wo.plannedQty);
  const good = num(wo.goodQty);
  const remaining = Math.max(0, planned - good);
  const pct =
    planned > 0 ? Math.min(100, Math.round((good / planned) * 100)) : 0;
  const done = pct >= 100;
  const isPaused = wo.status === "PAUSED";

  return (
    <Link
      href={`/assembly/${wo.id}`}
      className={cn(
        "group flex flex-col gap-3 rounded-lg border bg-white p-4 transition-all hover:shadow-md",
        done
          ? "border-emerald-200 bg-emerald-50/30 hover:border-emerald-400"
          : isPaused
            ? "border-amber-200 hover:border-amber-400"
            : "border-zinc-200 hover:border-indigo-400",
      )}
    >
      {/* Card header: ring + info */}
      <div className="flex items-center gap-3">
        <ProgressRing pct={pct} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <code className="font-mono text-sm font-bold text-zinc-900">
              {wo.woNo}
            </code>
            <Badge
              variant={statusVariant(wo.status)}
              className="text-[10px]"
            >
              {statusLabel(wo.status)}
            </Badge>
          </div>
          {wo.orderNo ? (
            <p className="mt-0.5 truncate text-xs text-zinc-500">
              Đơn:{" "}
              <span className="font-medium text-zinc-700">{wo.orderNo}</span>
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-zinc-400">
              Không liên kết đơn hàng
            </p>
          )}
        </div>
      </div>

      {/* Qty row */}
      <div className="flex items-baseline justify-between text-xs">
        <span className="text-zinc-500">
          <span className="font-semibold tabular-nums text-zinc-900">
            {good}
          </span>
          <span className="text-zinc-400"> / {planned} cái</span>
        </span>
        {remaining > 0 ? (
          <span className="text-amber-700">
            Còn{" "}
            <strong className="tabular-nums">{remaining}</strong> cái
          </span>
        ) : (
          <span className="text-emerald-600">Đủ số lượng</span>
        )}
      </div>

      {/* Footer: priority + CTA */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-2 text-[11px]">
        <span className="text-zinc-500">
          Ưu tiên:{" "}
          <span
            className={cn(
              "font-medium",
              wo.priority === "URGENT"
                ? "text-red-600"
                : wo.priority === "HIGH"
                  ? "text-orange-600"
                  : "text-zinc-700",
            )}
          >
            {wo.priority}
          </span>
        </span>
        <span
          className={cn(
            "inline-flex items-center gap-1 font-medium transition-colors",
            isPaused
              ? "text-amber-600 group-hover:text-amber-700"
              : "text-indigo-600 group-hover:text-indigo-700",
          )}
        >
          {isPaused ? (
            <>
              <Pause className="h-3 w-3" aria-hidden />
              Tiếp tục lắp
            </>
          ) : (
            <>
              <Wrench className="h-3 w-3" aria-hidden />
              Vào xưởng →
            </>
          )}
        </span>
      </div>
    </Link>
  );
}

export function AssemblyTab() {
  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<StatusFilter>("ALL");

  const apiStatuses: WorkOrderRow["status"][] =
    statusFilter === "ALL"
      ? (["IN_PROGRESS", "QUEUED", "RELEASED", "PAUSED"] as const).slice()
      : [statusFilter as WorkOrderRow["status"]];

  const query = useWorkOrdersList({
    status: apiStatuses,
    q: search.trim() || undefined,
    page: 1,
    pageSize: 100,
  });

  // "Hoàn thành gần đây" — tải thêm COMPLETED
  const completedQuery = useWorkOrdersList({
    status: ["COMPLETED"],
    page: 1,
    pageSize: 12,
  });

  const rows = query.data?.data ?? [];
  const completedRows = completedQuery.data?.data ?? [];

  // Apply client-side search filter to completed rows
  const completedFiltered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return completedRows;
    return completedRows.filter(
      (r) =>
        r.woNo.toLowerCase().includes(q) ||
        (r.orderNo ?? "").toLowerCase().includes(q),
    );
  }, [completedRows, search]);

  // Group active rows into sections
  const grouped = React.useMemo(() => {
    const inProg = rows.filter((r) => r.status === "IN_PROGRESS");
    const paused = rows.filter((r) => r.status === "PAUSED");
    const waiting = rows.filter(
      (r) => r.status === "QUEUED" || r.status === "RELEASED",
    );
    return { inProg, paused, waiting };
  }, [rows]);

  const showCompleted =
    statusFilter === "ALL" || statusFilter === "IN_PROGRESS";

  return (
    <div className="flex flex-col gap-6">
      {/* Title */}
      <section>
        <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-zinc-900">
          <Wrench className="h-5 w-5 text-zinc-500" aria-hidden />
          Lắp ráp
        </h1>
        <p className="mt-1 text-xs text-zinc-500">
          Chọn một lệnh sản xuất để vào workspace lắp ráp. Progress ring hiển
          thị tiến độ hoàn thành tính theo qty.
        </p>
      </section>

      {/* Filter bar */}
      <section className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-200 bg-white p-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-400"
            aria-hidden
          />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tìm WO, mã đơn…"
            className="pl-8"
          />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setStatusFilter(opt.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                statusFilter === opt.value
                  ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                  : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:bg-zinc-50",
              )}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <div className="ml-auto text-[11px] text-zinc-500">
          {query.isLoading ? (
            <span className="inline-flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
              Đang tải…
            </span>
          ) : (
            <span className="tabular-nums">
              {grouped.inProg.length} đang SX ·{" "}
              {grouped.paused.length} tạm dừng ·{" "}
              {grouped.waiting.length} chờ
            </span>
          )}
        </div>
      </section>

      {query.isError ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Lỗi tải danh sách:{" "}
          {(query.error as Error | null)?.message ?? "Không rõ"}
        </div>
      ) : query.isLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          Đang tải danh sách WO…
        </div>
      ) : (
        <div className="flex flex-col gap-8">
          {/* Section 1: Đang SX */}
          {(statusFilter === "ALL" || statusFilter === "IN_PROGRESS") && (
            <section>
              <SectionHeader
                icon={
                  <span className="h-2 w-2 animate-pulse rounded-full bg-orange-500" />
                }
                title="Đang sản xuất"
                count={grouped.inProg.length}
                color="text-orange-700"
              />
              {grouped.inProg.length === 0 ? (
                <EmptySection message="Không có WO nào đang sản xuất." />
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.inProg.map((wo) => (
                    <WoCard key={wo.id} wo={wo} />
                  ))}
                </div>
              )}
            </section>
          )}

          {/* Section 2: Tạm dừng */}
          {(statusFilter === "ALL" || statusFilter === "PAUSED") &&
            grouped.paused.length > 0 && (
              <section>
                <SectionHeader
                  icon={<Pause className="h-3.5 w-3.5 text-amber-500" aria-hidden />}
                  title="Tạm dừng"
                  count={grouped.paused.length}
                  color="text-amber-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.paused.map((wo) => (
                    <WoCard key={wo.id} wo={wo} />
                  ))}
                </div>
              </section>
            )}

          {/* Section 2b: Chờ lắp (QUEUED / RELEASED) */}
          {(statusFilter === "ALL" ||
            statusFilter === "QUEUED" ||
            statusFilter === "RELEASED") &&
            grouped.waiting.length > 0 && (
              <section>
                <SectionHeader
                  icon={
                    <span className="h-2 w-2 rounded-full bg-indigo-400" />
                  }
                  title="Chờ / Sẵn sàng lắp"
                  count={grouped.waiting.length}
                  color="text-indigo-700"
                />
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {grouped.waiting.map((wo) => (
                    <WoCard key={wo.id} wo={wo} />
                  ))}
                </div>
              </section>
            )}

          {/* Empty state khi không có gì */}
          {rows.length === 0 && (
            <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-200 bg-zinc-50/50 py-16 text-center">
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
                và chuyển trạng thái sang Released/Queued.
              </p>
            </div>
          )}

          {/* Section 3: Hoàn thành gần đây */}
          {showCompleted && completedFiltered.length > 0 && (
            <section>
              <SectionHeader
                icon={
                  <CheckCircle2
                    className="h-3.5 w-3.5 text-emerald-500"
                    aria-hidden
                  />
                }
                title="Hoàn thành gần đây"
                count={completedFiltered.length}
                color="text-emerald-700"
              />
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {completedFiltered.map((wo) => (
                  <WoCard key={wo.id} wo={wo} />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  count,
  color,
}: {
  icon: React.ReactNode;
  title: string;
  count: number;
  color: string;
}) {
  return (
    <div className="mb-3 flex items-center gap-2">
      {icon}
      <h2
        className={cn(
          "text-xs font-semibold uppercase tracking-wider",
          color,
        )}
      >
        {title}
      </h2>
      <span className="rounded-full bg-zinc-100 px-1.5 py-0.5 text-[10px] font-medium tabular-nums text-zinc-600">
        {count}
      </span>
    </div>
  );
}

function EmptySection({ message }: { message: string }) {
  return (
    <p className="rounded-md border border-dashed border-zinc-200 py-6 text-center text-xs text-zinc-400">
      {message}
    </p>
  );
}
