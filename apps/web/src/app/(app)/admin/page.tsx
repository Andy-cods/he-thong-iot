"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  Beaker,
  ChevronRight,
  Database,
  FileText,
  Globe,
  Laptop,
  Layers,
  Monitor,
  Server,
  Settings as SettingsIcon,
  Smartphone,
  Users,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdminStats, type AdminStatsPayload } from "@/hooks/useAdmin";
import { cn } from "@/lib/utils";

/**
 * /admin — Dashboard quản trị V1.8-batch5.
 *
 * Sections:
 *  1. KPI (4 card): users / sessions 24h / audit events 24h / rate-limit hits 24h
 *  2. Recent activity: latest 10 audit events + top 5 active sessions
 *  3. Quick actions
 *  4. System health
 *
 * Data từ `/api/admin/stats` (cache Redis 30s, hook auto-refresh 60s).
 */
export default function AdminIndexPage() {
  const statsQuery = useAdminStats();
  const stats = statsQuery.data?.data ?? null;

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.8";

  return (
    <div className="flex flex-col gap-5">
      <nav
        aria-label="Breadcrumb"
        className="flex items-center gap-1 text-xs text-zinc-500"
      >
        <Link href="/" className="hover:text-zinc-900">
          Tổng quan
        </Link>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <span className="text-zinc-900">Quản trị</span>
      </nav>

      <header className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
            Trang quản trị
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Theo dõi hoạt động, phiên đăng nhập, audit và sức khỏe hệ thống.
          </p>
        </div>
        <p className="font-mono text-[11px] text-zinc-500">
          {version} · {sha}
          {date ? ` · ${date}` : ""}
        </p>
      </header>

      {/* 1) KPI */}
      <section
        aria-label="KPI"
        className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
      >
        <KpiCard
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          label="Người dùng"
          loading={statsQuery.isLoading}
          value={
            stats
              ? `${stats.users.active.toLocaleString("vi-VN")}`
              : undefined
          }
          sub={
            stats
              ? `trong tổng ${stats.users.total.toLocaleString("vi-VN")} tài khoản`
              : undefined
          }
          accent="indigo"
        />
        <KpiCard
          icon={<Activity className="h-4 w-4" aria-hidden="true" />}
          label="Phiên đăng nhập 24h"
          loading={statsQuery.isLoading}
          value={
            stats
              ? `${stats.sessions.last24h.toLocaleString("vi-VN")}`
              : undefined
          }
          sub={
            stats
              ? `${stats.sessions.activeNow.toLocaleString("vi-VN")} phiên đang hoạt động`
              : undefined
          }
          accent="emerald"
        />
        <KpiCard
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          label="Audit events 24h"
          loading={statsQuery.isLoading}
          value={
            stats
              ? `${stats.audit.total24h.toLocaleString("vi-VN")}`
              : undefined
          }
          sub={
            stats && stats.audit.byAction.length > 0
              ? `${stats.audit.byAction.length} loại action`
              : stats
                ? "Không có hoạt động"
                : undefined
          }
          accent="sky"
        >
          {stats ? (
            <ActionBar rows={stats.audit.byAction.slice(0, 5)} />
          ) : null}
        </KpiCard>
        <KpiCard
          icon={<AlertTriangle className="h-4 w-4" aria-hidden="true" />}
          label="Rate-limit hits 24h"
          loading={statsQuery.isLoading}
          value={
            stats
              ? `${stats.rateLimits.hits24h.toLocaleString("vi-VN")}`
              : undefined
          }
          sub="Ước lượng từ SortedSet Redis"
          accent={
            stats && stats.rateLimits.hits24h > 50 ? "amber" : "zinc"
          }
        />
      </section>

      {/* 2) Recent activity */}
      <section
        aria-label="Recent activity"
        className="grid grid-cols-1 gap-3 lg:grid-cols-2"
      >
        <Card
          title="Hoạt động gần đây"
          headerLink={{ href: "/admin/audit", label: "Xem tất cả" }}
        >
          {statsQuery.isLoading ? (
            <SkeletonList rows={6} />
          ) : !stats || stats.recentAuditEvents.length === 0 ? (
            <EmptyRow text="Chưa có hoạt động." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              {stats.recentAuditEvents.map((ev) => (
                <li
                  key={ev.id}
                  className="grid grid-cols-[92px,1fr,auto] items-center gap-2 px-3 py-2 text-xs"
                >
                  <span className="truncate font-mono tabular-nums text-[11px] text-zinc-500">
                    {formatShortTime(ev.at)}
                  </span>
                  <span className="truncate text-zinc-900">
                    <span className="font-medium">
                      {ev.actorUsername ?? "system"}
                    </span>{" "}
                    <span className="text-zinc-500">trên</span>{" "}
                    <span className="font-mono text-[11px] text-zinc-700">
                      {ev.entity}
                    </span>
                  </span>
                  <ActionBadge action={ev.action} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title="Phiên đang hoạt động"
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
                  className="grid grid-cols-[28px,1fr,auto] items-center gap-2 px-3 py-2 text-xs"
                >
                  <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-100 text-zinc-500">
                    <DeviceIcon userAgent={s.userAgent} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-zinc-900">
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
                  <span className="font-mono tabular-nums text-[11px] text-zinc-500">
                    {formatShortTime(s.lastSeenAt ?? s.issuedAt)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </section>

      {/* 3) Quick actions */}
      <section
        aria-label="Quick actions"
        className="grid grid-cols-2 gap-3 lg:grid-cols-3"
      >
        <QuickLink
          href="/admin/users"
          icon={<Users className="h-4 w-4" aria-hidden="true" />}
          title="Quản lý users"
          description="Tạo / sửa / khóa tài khoản"
        />
        <QuickLink
          href="/admin/audit"
          icon={<FileText className="h-4 w-4" aria-hidden="true" />}
          title="Audit log"
          description="Nhật ký thao tác hệ thống"
        />
        <QuickLink
          href="/admin/settings/sessions"
          icon={<Monitor className="h-4 w-4" aria-hidden="true" />}
          title="Phiên làm việc"
          description="Phiên hoạt động của bạn"
        />
        <QuickLink
          href="/admin/materials"
          icon={<Beaker className="h-4 w-4" aria-hidden="true" />}
          title="Master vật liệu"
          description="POM / AL6061 / SUS304 + giá/kg"
        />
        <QuickLink
          href="/admin/processes"
          icon={<Layers className="h-4 w-4" aria-hidden="true" />}
          title="Master quy trình"
          description="MCT / Milling / Anodizing + giá/giờ"
        />
        <QuickLink
          href="/admin/settings"
          icon={<SettingsIcon className="h-4 w-4" aria-hidden="true" />}
          title="Cài đặt"
          description="Đổi mật khẩu, bảo mật"
        />
      </section>

      {/* 4) System health */}
      <section aria-label="System health">
        <Card title="Sức khỏe hệ thống">
          {statsQuery.isLoading ? (
            <div className="p-3">
              <SkeletonList rows={4} />
            </div>
          ) : !stats ? (
            <EmptyRow text="Không tải được trạng thái." />
          ) : (
            <ul className="divide-y divide-zinc-100">
              <HealthRow
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
              <HealthRow
                icon={<Server className="h-4 w-4" aria-hidden="true" />}
                label="Redis"
                status={stats.systemHealth.redis}
                detail={
                  stats.systemHealth.redis === "down"
                    ? "PING thất bại"
                    : "Cache + rate-limit OK"
                }
              />
              <HealthRow
                icon={<Activity className="h-4 w-4" aria-hidden="true" />}
                label="BullMQ queue"
                status={
                  stats.systemHealth.queueDepth > 20
                    ? "slow"
                    : "ok"
                }
                detail={`${stats.systemHealth.queueDepth.toLocaleString("vi-VN")} job trong hàng đợi`}
              />
              <HealthRow
                icon={<Globe className="h-4 w-4" aria-hidden="true" />}
                label="Backup gần nhất"
                status={stats.systemHealth.lastBackup ? "ok" : "slow"}
                detail={
                  stats.systemHealth.lastBackup
                    ? formatShortTime(stats.systemHealth.lastBackup)
                    : "Chưa có thông tin"
                }
              />
            </ul>
          )}
        </Card>
      </section>
    </div>
  );
}

/* ------------------------------ Subcomponents ---------------------------- */

const ACCENT_CLASSES: Record<
  "indigo" | "emerald" | "sky" | "amber" | "zinc",
  { icon: string; value: string }
> = {
  indigo: {
    icon: "bg-indigo-50 text-indigo-600",
    value: "text-zinc-900",
  },
  emerald: {
    icon: "bg-emerald-50 text-emerald-600",
    value: "text-zinc-900",
  },
  sky: {
    icon: "bg-sky-50 text-sky-600",
    value: "text-zinc-900",
  },
  amber: {
    icon: "bg-amber-50 text-amber-600",
    value: "text-zinc-900",
  },
  zinc: {
    icon: "bg-zinc-100 text-zinc-600",
    value: "text-zinc-900",
  },
};

function KpiCard({
  icon,
  label,
  value,
  sub,
  loading,
  accent,
  children,
}: {
  icon: React.ReactNode;
  label: string;
  value?: string;
  sub?: string;
  loading?: boolean;
  accent: keyof typeof ACCENT_CLASSES;
  children?: React.ReactNode;
}) {
  const cls = ACCENT_CLASSES[accent];
  return (
    <div className="rounded-md border border-zinc-200 bg-white p-4">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-sm",
            cls.icon,
          )}
        >
          {icon}
        </span>
        <p className="text-xs font-medium text-zinc-500">{label}</p>
      </div>
      <div className="mt-3">
        {loading ? (
          <Skeleton className="h-7 w-16" />
        ) : (
          <p
            className={cn(
              "text-2xl font-semibold tabular-nums tracking-tight",
              cls.value,
            )}
          >
            {value ?? "—"}
          </p>
        )}
        {sub ? (
          <p className="mt-0.5 truncate text-[11px] text-zinc-500">{sub}</p>
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
    <div className="mt-3 flex flex-col gap-1">
      {rows.map((r) => {
        const pct = Math.max(2, Math.round((r.count / total) * 100));
        return (
          <div
            key={r.action}
            className="flex items-center gap-2 text-[11px] text-zinc-600"
          >
            <span className="w-20 truncate font-mono uppercase">
              {r.action}
            </span>
            <div className="relative h-1.5 flex-1 overflow-hidden rounded-sm bg-zinc-100">
              <div
                className="absolute left-0 top-0 h-full rounded-sm bg-indigo-500"
                style={{ width: `${pct}%` }}
              />
            </div>
            <span className="w-8 text-right font-mono tabular-nums">
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
  headerLink,
  children,
}: {
  title: string;
  headerLink?: { href: string; label: string };
  children: React.ReactNode;
}) {
  return (
    <section className="overflow-hidden rounded-md border border-zinc-200 bg-white">
      <header className="flex items-center justify-between border-b border-zinc-100 px-3 py-2">
        <h2 className="text-sm font-medium text-zinc-900">{title}</h2>
        {headerLink ? (
          <Link
            href={headerLink.href}
            className="inline-flex items-center gap-0.5 text-xs text-indigo-600 hover:text-indigo-700"
          >
            {headerLink.label}
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
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
        <li key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-full" />
        </li>
      ))}
    </ul>
  );
}

function EmptyRow({ text }: { text: string }) {
  return <p className="px-3 py-6 text-center text-xs text-zinc-500">{text}</p>;
}

const ACTION_COLORS: Record<string, string> = {
  CREATE: "border-emerald-200 bg-emerald-50 text-emerald-700",
  UPDATE: "border-sky-200 bg-sky-50 text-sky-700",
  DELETE: "border-red-200 bg-red-50 text-red-700",
  LOGIN: "border-indigo-200 bg-indigo-50 text-indigo-700",
  LOGOUT: "border-zinc-200 bg-zinc-100 text-zinc-600",
};

function ActionBadge({ action }: { action: string }) {
  const cls =
    ACTION_COLORS[action] ?? "border-zinc-200 bg-zinc-50 text-zinc-600";
  return (
    <span
      className={cn(
        "inline-flex h-5 items-center rounded-sm border px-1.5 font-mono text-[10px] font-semibold uppercase",
        cls,
      )}
    >
      {action}
    </span>
  );
}

function DeviceIcon({ userAgent }: { userAgent: string | null }) {
  const ua = (userAgent ?? "").toLowerCase();
  if (/mobile|iphone|android/.test(ua)) {
    return <Smartphone className="h-3.5 w-3.5" aria-hidden="true" />;
  }
  return <Laptop className="h-3.5 w-3.5" aria-hidden="true" />;
}

function HealthRow({
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
  const dotCls =
    status === "ok"
      ? "bg-emerald-500"
      : status === "slow"
        ? "bg-amber-500"
        : "bg-red-500";
  const labelCls =
    status === "ok"
      ? "text-emerald-700"
      : status === "slow"
        ? "text-amber-700"
        : "text-red-700";
  const statusLabel =
    status === "ok" ? "Hoạt động" : status === "slow" ? "Chậm" : "Gián đoạn";
  return (
    <li className="grid grid-cols-[28px,1fr,auto] items-center gap-2 px-3 py-2 text-xs">
      <span className="flex h-7 w-7 items-center justify-center rounded-sm bg-zinc-100 text-zinc-500">
        {icon}
      </span>
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-zinc-900">{label}</p>
        <p className="truncate text-[11px] text-zinc-500">{detail}</p>
      </div>
      <span className="inline-flex items-center gap-1.5 font-mono text-[11px] uppercase">
        <span
          className={cn("h-2 w-2 rounded-full", dotCls)}
          aria-hidden="true"
        />
        <span className={labelCls}>{statusLabel}</span>
      </span>
    </li>
  );
}

function QuickLink({
  href,
  icon,
  title,
  description,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <Link
      href={href}
      className="group flex h-12 items-center gap-3 rounded-md border border-zinc-200 bg-white px-3 transition-colors duration-150 hover:border-indigo-200 hover:bg-indigo-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-1"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-sm bg-zinc-100 text-zinc-600 transition-colors group-hover:bg-indigo-50 group-hover:text-indigo-600">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-zinc-900">{title}</p>
        <p className="truncate text-[11px] text-zinc-500">{description}</p>
      </div>
    </Link>
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
