"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Database,
  FileText,
  Globe,
  Laptop,
  Server,
  Settings as SettingsIcon,
  ShieldCheck,
  Smartphone,
  TrendingUp,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStats, type AdminStatsPayload } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";
import { AdminPageShell } from "@/components/admin/AdminPageShell";

/**
 * /admin — Dashboard quản trị.
 *
 * Redesign Phase 1 (V1.8 → V1.9):
 *   - Dùng AdminPageShell wrapper (breadcrumb + nav tabs đồng bộ).
 *   - Hero stats: 4 KPI card lớn hơn, accent ring, value text-3xl.
 *   - Health monitor: card riêng với grid 2x2, status pill rõ ràng.
 *   - Quick actions: 5 card với gradient icon background, hover lift.
 *   - Recent feed: timeline thay table — dot connector + relative time.
 *   - Vietnamese-aware: tracking-tight cho heading, tracking-normal cho body.
 */
export default function AdminIndexPage() {
  const statsQuery = useAdminStats();
  const stats = statsQuery.data?.data ?? null;

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.9";

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị" },
      ]}
      title="Trang quản trị"
      description="Theo dõi hoạt động, phiên đăng nhập, audit log và sức khỏe hệ thống."
      meta={
        <span>
          {version} <span className="text-zinc-300">·</span> {sha}
          {date ? (
            <>
              {" "}
              <span className="text-zinc-300">·</span> {date}
            </>
          ) : null}
        </span>
      }
    >
      <div className="flex flex-col gap-6">
        {/* 1) KPI hero */}
        <section
          aria-label="KPI"
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4"
        >
          <KpiCard
            icon={<Users className="h-4 w-4" aria-hidden="true" />}
            label="Người dùng"
            loading={statsQuery.isLoading}
            value={
              stats
                ? stats.users.active.toLocaleString("vi-VN")
                : undefined
            }
            sub={
              stats
                ? `trong tổng ${stats.users.total.toLocaleString("vi-VN")} tài khoản`
                : undefined
            }
            trendLabel="đang hoạt động"
            accent="indigo"
          />
          <KpiCard
            icon={<Activity className="h-4 w-4" aria-hidden="true" />}
            label="Phiên 24 giờ"
            loading={statsQuery.isLoading}
            value={
              stats
                ? stats.sessions.last24h.toLocaleString("vi-VN")
                : undefined
            }
            sub={
              stats
                ? `${stats.sessions.activeNow.toLocaleString("vi-VN")} phiên đang hoạt động`
                : undefined
            }
            trendLabel="đăng nhập"
            accent="emerald"
          />
          <KpiCard
            icon={<FileText className="h-4 w-4" aria-hidden="true" />}
            label="Audit events 24h"
            loading={statsQuery.isLoading}
            value={
              stats
                ? stats.audit.total24h.toLocaleString("vi-VN")
                : undefined
            }
            sub={
              stats && stats.audit.byAction.length > 0
                ? `${stats.audit.byAction.length} loại action`
                : stats
                  ? "Không có hoạt động"
                  : undefined
            }
            trendLabel="thao tác"
            accent="sky"
          >
            {stats ? (
              <ActionBar rows={stats.audit.byAction.slice(0, 4)} />
            ) : null}
          </KpiCard>
          <KpiCard
            icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            label="Rate-limit hits 24h"
            loading={statsQuery.isLoading}
            value={
              stats
                ? stats.rateLimits.hits24h.toLocaleString("vi-VN")
                : undefined
            }
            sub="Ước lượng từ Redis SortedSet"
            trendLabel={
              stats && stats.rateLimits.hits24h > 50
                ? "cần chú ý"
                : "bình thường"
            }
            accent={
              stats && stats.rateLimits.hits24h > 50 ? "amber" : "zinc"
            }
          />
        </section>

        {/* 2) Health + Quick actions */}
        <section
          aria-label="Health & Actions"
          className="grid grid-cols-1 gap-4 lg:grid-cols-3"
        >
          {/* Health monitor — 2/3 width */}
          <Card
            className="lg:col-span-2"
            title="Sức khỏe hệ thống"
            subtitle="Trạng thái cập nhật mỗi 60 giây"
            icon={
              <ShieldCheck
                className="h-4 w-4 text-emerald-500"
                aria-hidden="true"
              />
            }
          >
            {statsQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-px bg-zinc-100 sm:grid-cols-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="bg-white p-4">
                    <Skeleton className="h-5 w-32" />
                    <Skeleton className="mt-2 h-3 w-44" />
                  </div>
                ))}
              </div>
            ) : !stats ? (
              <EmptyRow text="Không tải được trạng thái." />
            ) : (
              <div className="grid grid-cols-1 gap-px bg-zinc-100 sm:grid-cols-2">
                <HealthCard
                  icon={<Database className="h-4 w-4" aria-hidden="true" />}
                  label="Cơ sở dữ liệu"
                  status={stats.systemHealth.db}
                  detail={
                    stats.systemHealth.db === "slow"
                      ? "Phản hồi > 500ms"
                      : stats.systemHealth.db === "down"
                        ? "Không phản hồi"
                        : "Postgres sẵn sàng"
                  }
                />
                <HealthCard
                  icon={<Server className="h-4 w-4" aria-hidden="true" />}
                  label="Redis"
                  status={stats.systemHealth.redis}
                  detail={
                    stats.systemHealth.redis === "down"
                      ? "PING thất bại"
                      : "Cache + rate-limit OK"
                  }
                />
                <HealthCard
                  icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                  label="BullMQ queue"
                  status={
                    stats.systemHealth.queueDepth > 20 ? "slow" : "ok"
                  }
                  detail={`${stats.systemHealth.queueDepth.toLocaleString("vi-VN")} job trong hàng đợi`}
                />
                <HealthCard
                  icon={<Globe className="h-4 w-4" aria-hidden="true" />}
                  label="Backup gần nhất"
                  status={stats.systemHealth.lastBackup ? "ok" : "slow"}
                  detail={
                    stats.systemHealth.lastBackup
                      ? formatShortTime(stats.systemHealth.lastBackup)
                      : "Chưa có thông tin"
                  }
                />
              </div>
            )}
          </Card>

          {/* Quick actions — 1/3 width */}
          <Card
            title="Tác vụ nhanh"
            subtitle="Lối tắt đến các trang chính"
            icon={
              <TrendingUp
                className="h-4 w-4 text-indigo-500"
                aria-hidden="true"
              />
            }
          >
            <ul className="divide-y divide-zinc-100">
              <QuickLink
                href="/admin/users"
                icon={<Users className="h-4 w-4" aria-hidden="true" />}
                title="Quản lý người dùng"
                description="Tạo, sửa, khóa tài khoản"
                accent="indigo"
              />
              <QuickLink
                href="/admin/reports/employee-productivity"
                icon={<BarChart3 className="h-4 w-4" aria-hidden="true" />}
                title="Báo cáo năng suất"
                description="Theo dõi nhân viên"
                accent="emerald"
              />
              <QuickLink
                href="/admin/reports/targets"
                icon={<TrendingUp className="h-4 w-4" aria-hidden="true" />}
                title="Mục tiêu KPI"
                description="Đặt KPI cho bộ phận"
                accent="sky"
              />
              <QuickLink
                href="/admin/audit"
                icon={<FileText className="h-4 w-4" aria-hidden="true" />}
                title="Audit log"
                description="Nhật ký hệ thống"
                accent="amber"
              />
              <QuickLink
                href="/admin/settings"
                icon={
                  <SettingsIcon className="h-4 w-4" aria-hidden="true" />
                }
                title="Cài đặt"
                description="Đổi mật khẩu, bảo mật"
                accent="zinc"
              />
            </ul>
          </Card>
        </section>

        {/* 3) Activity & Sessions */}
        <section
          aria-label="Activity"
          className="grid grid-cols-1 gap-4 lg:grid-cols-2"
        >
          <Card
            title="Hoạt động gần đây"
            subtitle="10 audit event mới nhất"
            icon={
              <FileText
                className="h-4 w-4 text-zinc-500"
                aria-hidden="true"
              />
            }
            headerLink={{ href: "/admin/audit", label: "Xem tất cả" }}
          >
            {statsQuery.isLoading ? (
              <SkeletonList rows={6} />
            ) : !stats || stats.recentAuditEvents.length === 0 ? (
              <EmptyRow text="Chưa có hoạt động." />
            ) : (
              <ol className="relative">
                {stats.recentAuditEvents.map((ev, idx) => (
                  <li
                    key={ev.id}
                    className="group relative grid grid-cols-[auto,1fr,auto] items-start gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50/70"
                  >
                    {/* timeline dot + connector */}
                    <div className="relative flex w-5 justify-center pt-1.5">
                      {idx < stats.recentAuditEvents.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className="absolute left-1/2 top-3 -translate-x-1/2 h-full w-px bg-zinc-200"
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative h-2 w-2 rounded-full ring-2 ring-white",
                          dotColorForAction(ev.action),
                        )}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-sm leading-snug text-zinc-900">
                        <span className="font-medium">
                          {ev.actorUsername ?? "system"}
                        </span>{" "}
                        <span className="text-zinc-500">trên</span>{" "}
                        <span className="font-mono text-xs text-zinc-700">
                          {ev.entity}
                        </span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500">
                        <ActionBadge action={ev.action} />
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {formatShortTime(ev.at)}
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>

          <Card
            title="Phiên đang hoạt động"
            subtitle="Người dùng online trong 30 phút qua"
            icon={
              <Activity
                className="h-4 w-4 text-emerald-500"
                aria-hidden="true"
              />
            }
            headerLink={{
              href: "/admin/settings/sessions",
              label: "Quản lý phiên",
            }}
          >
            {statsQuery.isLoading ? (
              <SkeletonList rows={5} />
            ) : !stats || stats.recentActiveSessions.length === 0 ? (
              <EmptyRow text="Không có phiên nào đang hoạt động." />
            ) : (
              <ul className="divide-y divide-zinc-100">
                {stats.recentActiveSessions.map((s) => (
                  <li
                    key={s.id}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-zinc-50/70"
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-50 to-emerald-50 text-zinc-600 ring-1 ring-zinc-200">
                      <DeviceIcon userAgent={s.userAgent} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm leading-snug text-zinc-900">
                        <span className="font-medium">
                          {s.username ?? "—"}
                        </span>
                        {s.fullName ? (
                          <span className="text-zinc-500">
                            {" "}
                            · {s.fullName}
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate font-mono text-[11px] text-zinc-500">
                        {s.ip ?? "—"}
                      </p>
                    </div>
                    <span className="shrink-0 font-mono text-[11px] tabular-nums text-zinc-500">
                      {formatShortTime(s.lastSeenAt ?? s.issuedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </section>
      </div>
    </AdminPageShell>
  );
}

/* ------------------------------ Subcomponents ---------------------------- */

const ACCENT_CLASSES: Record<
  "indigo" | "emerald" | "sky" | "amber" | "zinc",
  { iconBg: string; iconText: string; ring: string; trend: string }
> = {
  indigo: {
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    ring: "ring-indigo-100",
    trend: "text-indigo-600",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    ring: "ring-emerald-100",
    trend: "text-emerald-600",
  },
  sky: {
    iconBg: "bg-sky-50",
    iconText: "text-sky-600",
    ring: "ring-sky-100",
    trend: "text-sky-600",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    ring: "ring-amber-100",
    trend: "text-amber-600",
  },
  zinc: {
    iconBg: "bg-zinc-100",
    iconText: "text-zinc-600",
    ring: "ring-zinc-200",
    trend: "text-zinc-500",
  },
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  trendLabel,
  loading,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  sub?: string;
  trendLabel?: string;
  loading?: boolean;
  accent: keyof typeof ACCENT_CLASSES;
  children?: React.ReactNode;
}) {
  const cls = ACCENT_CLASSES[accent];
  return (
    <div className="group relative overflow-hidden rounded-xl border border-zinc-200 bg-white p-5 shadow-sm transition-all duration-200 hover:border-zinc-300 hover:shadow-md">
      {/* Top: label + icon */}
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-normal text-zinc-500">
          {label}
        </p>
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset",
            cls.iconBg,
            cls.iconText,
            cls.ring,
          )}
        >
          {icon}
        </span>
      </div>

      {/* Value */}
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : (
          <p className="text-3xl font-semibold leading-none tracking-tight tabular-nums text-zinc-900">
            {value ?? "—"}
          </p>
        )}
      </div>

      {/* Sub + trend */}
      <div className="mt-2 flex items-center gap-1.5">
        {trendLabel ? (
          <span className={cn("text-[11px] font-medium", cls.trend)}>
            {trendLabel}
          </span>
        ) : null}
        {sub ? (
          <p className="truncate text-[11px] text-zinc-500">
            {trendLabel ? <span className="text-zinc-300">·</span> : null}{" "}
            {sub}
          </p>
        ) : null}
      </div>

      {children}
    </div>
  );
}

function ActionBar({
  rows,
}: {
  rows: Array<{ action: string; count: number }>;
}) {
  if (rows.length === 0) return null;
  const total = rows.reduce((s, r) => s + r.count, 0);
  if (total === 0) return null;
  return (
    <div className="mt-4 flex flex-col gap-1.5 border-t border-zinc-100 pt-3">
      {rows.map((r) => {
        const pct = Math.max(2, Math.round((r.count / total) * 100));
        return (
          <div
            key={r.action}
            className="flex items-center gap-2 text-[11px] text-zinc-600"
          >
            <span className="w-16 shrink-0 truncate font-mono uppercase tracking-normal">
              {r.action}
            </span>
            <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-zinc-100">
              <div
                className="absolute left-0 top-0 h-full rounded-full bg-gradient-to-r from-indigo-400 to-indigo-600"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-7 shrink-0 text-right font-mono tabular-nums">
              {r.count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function Card({
  title,
  subtitle,
  icon,
  headerLink,
  children,
  className,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  headerLink?: { href: string; label: string };
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm",
        className,
      )}
    >
      <header className="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          {icon ? (
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-zinc-50 ring-1 ring-inset ring-zinc-200">
              {icon}
            </span>
          ) : null}
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold tracking-tight text-zinc-900">
              {title}
            </h2>
            {subtitle ? (
              <p className="mt-0.5 truncate text-[11px] text-zinc-500">
                {subtitle}
              </p>
            ) : null}
          </div>
        </div>
        {headerLink ? (
          <Link
            href={headerLink.href}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-medium text-indigo-600 transition-colors hover:text-indigo-700"
          >
            {headerLink.label}
            <ArrowUpRight className="h-3 w-3" aria-hidden="true" />
          </Link>
        ) : null}
      </header>
      {children}
    </section>
  );
}

function SkeletonList({ rows }: { rows: number }) {
  return (
    <ul className="divide-y divide-zinc-100">
      {Array.from({ length: rows }).map((_, i) => (
        <li key={i} className="px-4 py-2.5">
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

function EmptyRow({ text }: { text: string }) {
  return (
    <p className="px-4 py-8 text-center text-xs text-zinc-500">{text}</p>
  );
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UPDATE: "border-sky-200 bg-sky-50 text-sky-700",
  DELETE: "border-rose-200 bg-rose-50 text-rose-700",
  LOGIN: "border-indigo-200 bg-indigo-50 text-indigo-700",
  LOGOUT: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

function ActionBadge({ action }: { action: string }) {
  const cls =
    ACTION_COLORS[action] ?? "border-zinc-200 bg-zinc-50 text-zinc-600";
  return (
    <span
      className={cn(
        "inline-flex h-4 items-center rounded px-1.5 font-mono text-[10px] font-semibold uppercase tracking-normal ring-1 ring-inset",
        cls,
      )}
    >
      {action}
    </span>
  );
}

function dotColorForAction(action: string): string {
  switch (action) {
    case "CREATE":
      return "bg-emerald-500";
    case "UPDATE":
      return "bg-sky-500";
    case "DELETE":
      return "bg-rose-500";
    case "LOGIN":
      return "bg-indigo-500";
    case "LOGOUT":
      return "bg-zinc-400";
    default:
      return "bg-zinc-300";
  }
}

function DeviceIcon({ userAgent }: { userAgent: string | null }) {
  const ua = (userAgent ?? "").toLowerCase();
  if (/mobile|iphone|android/.test(ua)) {
    return <Smartphone className="h-4 w-4" aria-hidden="true" />;
  }
  return <Laptop className="h-4 w-4" aria-hidden="true" />;
}

function HealthCard({
  icon,
  label,
  status,
  detail,
}: {
  icon: React.ReactNode;
  label: string;
  status: "ok" | "slow" | "down";
  detail: string;
}) {
  const config =
    status === "ok"
      ? {
          dot: "bg-emerald-500",
          ring: "ring-emerald-200",
          chip: "bg-emerald-50 text-emerald-700",
          label: "Hoạt động",
        }
      : status === "slow"
        ? {
            dot: "bg-amber-500",
            ring: "ring-amber-200",
            chip: "bg-amber-50 text-amber-700",
            label: "Chậm",
          }
        : {
            dot: "bg-rose-500",
            ring: "ring-rose-200",
            chip: "bg-rose-50 text-rose-700",
            label: "Gián đoạn",
          };
  return (
    <div className="flex items-center gap-3 bg-white p-4">
      <span
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-50 text-zinc-600 ring-1 ring-inset",
          config.ring,
        )}
      >
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium tracking-tight text-zinc-900">
            {label}
          </p>
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset",
              config.chip,
              config.ring,
            )}
          >
            <span
              className={cn("h-1.5 w-1.5 rounded-full", config.dot)}
              aria-hidden="true"
            />
            {config.label}
          </span>
        </div>
        <p className="mt-0.5 truncate text-[11px] text-zinc-500">{detail}</p>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
  accent,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
  accent: keyof typeof ACCENT_CLASSES;
}) {
  const cls = ACCENT_CLASSES[accent];
  return (
    <li>
      <Link
        href={href}
        className="group flex items-center gap-3 px-4 py-3 transition-colors duration-150 hover:bg-zinc-50/80 focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-indigo-500"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset transition-transform group-hover:scale-105",
            cls.iconBg,
            cls.iconText,
            cls.ring,
          )}
        >
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium tracking-tight text-zinc-900">
            {title}
          </p>
          <p className="truncate text-[11px] text-zinc-500">{description}</p>
        </div>
        <ArrowUpRight
          className="h-3.5 w-3.5 shrink-0 text-zinc-300 transition-colors group-hover:text-zinc-500"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}

/* --------------------------------- Utils --------------------------------- */

function formatShortTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffMin = Math.round(diffMs / 60_000);
  if (diffMin < 1) return "vừa xong";
  if (diffMin < 60) return `${diffMin} phút trước`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr} giờ trước`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay} ngày trước`;
  return d.toLocaleDateString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
  });
}

// Type re-exports để tránh "unused import" lint warning
export type { AdminStatsPayload };
