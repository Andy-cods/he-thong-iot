"use client";

import * as React from "react";
import { Activity, RefreshCw, Boxes, Factory, ClipboardList } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DashboardOverviewV2Payload } from "@/app/api/dashboard/overview-v2/route";

/**
 * V3.2 HeroOverviewCard — Hero 2×1 cho Dashboard "Tổng quan"
 * (TASK-20260427-027).
 *
 * Khác DashboardHeader cũ (T-010):
 *  - Glass + radial gradient ambient indigo (background ấn tượng).
 *  - 3 quick stats sống: WO running, tổng SKU active (= componentsAvailable
 *    denominator → tổng line snapshot active), tổng PR pending
 *    (denominator-numerator).
 *  - Live status pulse + nút Tải lại có spinner.
 *  - Layout 2 row: title block + stats block, responsive stack <md.
 */

function formatRelative(iso: string): string {
  try {
    const t = new Date(iso).getTime();
    if (!Number.isFinite(t)) return "—";
    const diffSec = Math.floor((Date.now() - t) / 1000);
    if (diffSec < 0) return "vừa xong";
    if (diffSec < 60) return "vừa xong";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)} phút trước`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)} giờ trước`;
    return new Date(iso).toLocaleString("vi-VN", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "—";
  }
}

function formatNum(n: number): string {
  return Number(n || 0).toLocaleString("vi-VN");
}

export interface HeroOverviewCardProps {
  data: DashboardOverviewV2Payload | null;
  loading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  className?: string;
}

export function HeroOverviewCard({
  data,
  loading,
  refreshing,
  onRefresh,
  className,
}: HeroOverviewCardProps) {
  // Tự re-render mỗi 30s để format relative chính xác.
  const [, setTick] = React.useState(0);
  React.useEffect(() => {
    if (!data?.cachedAt) return;
    const id = setInterval(() => setTick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, [data?.cachedAt]);

  const p = data?.progress;

  // Quick stats:
  //   - WO running = production.numerator
  //   - Total active snapshot lines = componentsAvailable.denominator
  //   - PR pending = purchaseRequests.denominator - purchaseRequests.numerator
  const woRunning = p?.production.numerator ?? 0;
  const skuActive = p?.componentsAvailable.denominator ?? 0;
  const prPending = p
    ? Math.max(0, p.purchaseRequests.denominator - p.purchaseRequests.numerator)
    : 0;

  return (
    <section
      className={cn(
        "dashboard-stagger-fade relative isolate overflow-hidden rounded-3xl border border-white/60",
        "bg-gradient-to-br from-white via-white/95 to-indigo-50/80",
        "shadow-[0_1px_2px_rgba(0,0,0,0.04),0_8px_32px_rgba(79,70,229,0.07)]",
        "backdrop-blur-sm",
        className,
      )}
      style={{ ["--stagger-delay" as never]: "0ms" }}
    >
      {/* Ambient gradient blobs */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-gradient-to-br from-indigo-300/40 via-violet-200/30 to-transparent blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-32 -left-16 h-72 w-72 rounded-full bg-gradient-to-tr from-emerald-200/35 via-sky-100/25 to-transparent blur-3xl"
      />
      {/* Subtle grid pattern */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #18181B 1px, transparent 1px), linear-gradient(to bottom, #18181B 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        {/* ---- Left: title + status ---- */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-md ring-1 ring-white/40"
            >
              <Activity className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-indigo-700/80">
              Trung tâm vận hành
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-balance text-3xl font-bold leading-tight tracking-tight text-zinc-900 sm:text-4xl">
              Tổng quan vận hành
            </h1>
            <p className="max-w-xl text-[13.5px] leading-relaxed text-zinc-600 sm:text-sm">
              Theo dõi tiến độ tổng hợp các bộ phận theo thời gian thực — BOM,
              kho, lắp ráp, sản xuất, mua hàng. Tự động làm mới mỗi 60 giây.
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[12.5px] font-medium text-zinc-700 ring-1 ring-zinc-200/80 backdrop-blur-sm"
              aria-live="polite"
            >
              <span className="relative inline-flex h-2 w-2">
                <span
                  aria-hidden="true"
                  className={cn(
                    "absolute inline-flex h-full w-full rounded-full opacity-75",
                    data?.cachedAt
                      ? "animate-ping bg-emerald-400"
                      : "bg-zinc-300",
                  )}
                />
                <span
                  aria-hidden="true"
                  className={cn(
                    "relative inline-flex h-2 w-2 rounded-full",
                    data?.cachedAt ? "bg-emerald-500" : "bg-zinc-300",
                  )}
                />
              </span>
              {loading
                ? "Đang tải dữ liệu…"
                : data?.cachedAt
                  ? `Cập nhật ${formatRelative(data.cachedAt)}`
                  : "Chưa có dữ liệu"}
            </span>

            {onRefresh ? (
              <button
                type="button"
                onClick={onRefresh}
                disabled={refreshing}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full bg-white/80 px-3 py-1 text-[12.5px] font-medium text-zinc-700 ring-1 ring-zinc-200/80 backdrop-blur-sm transition-all",
                  "hover:bg-white hover:text-indigo-700 hover:ring-indigo-300 hover:shadow-sm",
                  "focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                )}
                aria-label="Tải lại dữ liệu tổng quan"
              >
                <RefreshCw
                  className={cn("h-3.5 w-3.5", refreshing && "animate-spin")}
                  aria-hidden="true"
                />
                Tải lại
              </button>
            ) : null}
          </div>
        </div>

        {/* ---- Right: 3 quick stats ---- */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <HeroStat
            icon={Factory}
            value={woRunning}
            label="Lệnh đang chạy"
            tone="rose"
            loading={loading}
          />
          <HeroStat
            icon={Boxes}
            value={skuActive}
            label="Linh kiện theo dõi"
            tone="indigo"
            loading={loading}
          />
          <HeroStat
            icon={ClipboardList}
            value={prPending}
            label="PR chờ xử lý"
            tone="amber"
            loading={loading}
          />
        </div>
      </div>
    </section>
  );
}

interface HeroStatProps {
  icon: typeof Factory;
  value: number;
  label: string;
  tone: "rose" | "indigo" | "amber";
  loading?: boolean;
}

function HeroStat({ icon: Icon, value, label, tone, loading }: HeroStatProps) {
  const toneCls =
    tone === "rose"
      ? "from-rose-500 to-rose-600 ring-rose-200/70"
      : tone === "indigo"
        ? "from-indigo-500 to-violet-600 ring-indigo-200/70"
        : "from-amber-500 to-orange-500 ring-amber-200/70";

  return (
    <div className="flex flex-col gap-1.5 rounded-2xl border border-white/70 bg-white/70 p-3 shadow-sm ring-1 ring-zinc-100/60 backdrop-blur-sm sm:p-3.5">
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex h-7 w-7 items-center justify-center rounded-lg bg-gradient-to-br text-white shadow-sm ring-1",
          toneCls,
        )}
      >
        <Icon className="h-3.5 w-3.5" strokeWidth={2.25} />
      </span>
      <div className="flex flex-col">
        <span
          className={cn(
            "text-2xl font-bold leading-none tabular-nums tracking-tight text-zinc-900 sm:text-3xl",
            loading && "opacity-40",
          )}
        >
          {loading ? "—" : formatNum(value)}
        </span>
        <span className="mt-1 text-[10.5px] font-medium uppercase tracking-wide text-zinc-500">
          {label}
        </span>
      </div>
    </div>
  );
}
