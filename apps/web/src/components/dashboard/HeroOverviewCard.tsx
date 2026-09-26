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
 *  - (V4.1 UI-24: đã bỏ nền gradient — thẻ trắng trung tính.)
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
    // V4.1 UI-24 (X8, Đợt 6C): bỏ gradient + quầng màu + lưới nền — thẻ trắng viền zinc.
    <section
      className={cn(
        "dashboard-stagger-fade relative overflow-hidden rounded-lg border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900",
        className,
      )}
      style={{ ["--stagger-delay" as never]: "0ms" }}
    >
      <div className="relative grid gap-5 p-4 sm:p-6 lg:grid-cols-[1.4fr_1fr] lg:items-center">
        {/* ---- Left: title + status ---- */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600 text-white"
            >
              <Activity className="h-5 w-5" strokeWidth={2.25} />
            </span>
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
              Trung tâm gia công
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <h1 className="text-balance text-2xl font-semibold leading-tight tracking-tight text-zinc-900 sm:text-3xl dark:text-zinc-50">
              Tổng quan gia công
            </h1>
            <p className="max-w-xl text-sm leading-relaxed text-zinc-600 sm:text-sm dark:text-zinc-400">
              Theo dõi tiến độ tổng hợp các bộ phận theo thời gian thực — BOM,
              kho, lắp ráp, sản xuất, mua hàng. Tự động làm mới mỗi 60 giây.
            </p>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80 dark:bg-zinc-800/80 dark:text-zinc-200 dark:ring-zinc-700"
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
                  "inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1 text-xs font-medium text-zinc-700 ring-1 ring-zinc-200/80 transition-all dark:bg-zinc-800/80 dark:text-zinc-200 dark:ring-zinc-700",
                  "hover:bg-white hover:text-indigo-700 hover:ring-indigo-300 hover:shadow-sm dark:hover:bg-zinc-800 dark:hover:text-indigo-300 dark:hover:ring-indigo-700",
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
        {/* V4.1 UI-24: điện thoại 1 cột dạng hàng ngang (icon · số · nhãn) — trước 3 ô hẹp gãy nhãn 4 dòng. */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 sm:gap-3">
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

function HeroStat({ icon: Icon, value, label, loading }: HeroStatProps) {
  // V4.1 UI-24: ô trung tính (bỏ nền gradient hồng/tím/cam cho icon).
  return (
    <div className="flex items-center gap-3 rounded-lg border border-zinc-200 bg-zinc-50/60 px-3 py-2.5 dark:border-zinc-800 dark:bg-zinc-800/40 sm:flex-col sm:items-start sm:gap-1.5 sm:p-3">
      <Icon className="h-4 w-4 shrink-0 text-zinc-400 dark:text-zinc-500" strokeWidth={2.25} aria-hidden="true" />
      <span
        className={cn(
          "text-2xl font-semibold leading-none tabular-nums tracking-tight text-zinc-900 dark:text-zinc-50",
          loading && "opacity-40",
        )}
      >
        {loading ? "—" : formatNum(value)}
      </span>
      <span className="min-w-0 text-xs font-medium text-zinc-500 dark:text-zinc-400 sm:mt-0.5">{label}</span>
    </div>
  );
}
