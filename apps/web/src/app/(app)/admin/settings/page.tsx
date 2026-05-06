"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  Info,
  KeyRound,
  Laptop,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";
import { AdminPageShell } from "@/components/admin/AdminPageShell";

export default function AdminSettingsPage() {
  const router = useRouter();

  const sha = (process.env.NEXT_PUBLIC_BUILD_SHA || "dev").slice(0, 7);
  const date = process.env.NEXT_PUBLIC_BUILD_DATE || "unknown";
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v1.1.0-alpha";

  const handlePasswordChanged = async () => {
    setTimeout(() => {
      void fetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          router.push("/login?reason=password-changed");
        });
    }, 1500);
  };

  return (
    <AdminPageShell
      breadcrumb={[
        { label: "Trang chủ", href: "/" },
        { label: "Quản trị", href: "/admin" },
        { label: "Cài đặt" },
      ]}
      title="Cài đặt cá nhân"
      description="Quản lý mật khẩu, theo dõi phiên đăng nhập và thông tin build hệ thống."
      meta={
        <span>
          {version} <span className="text-zinc-300">·</span> {sha}
          {date && date !== "unknown" ? (
            <>
              {" "}
              <span className="text-zinc-300">·</span> {date}
            </>
          ) : null}
        </span>
      }
    >
      <div className="grid max-w-4xl gap-4 lg:grid-cols-3">
        {/* Change password — 2 cols */}
        <SectionCard
          icon={<KeyRound className="h-4 w-4" aria-hidden="true" />}
          accent="indigo"
          title="Đổi mật khẩu"
          description="Sau khi đổi thành công, bạn sẽ được đăng xuất và yêu cầu đăng nhập lại."
          className="lg:col-span-2"
        >
          <ChangePasswordForm onSuccess={handlePasswordChanged} />
        </SectionCard>

        {/* Sessions */}
        <SectionCard
          icon={<Laptop className="h-4 w-4" aria-hidden="true" />}
          accent="emerald"
          title="Phiên đăng nhập"
          description="Theo dõi các thiết bị đang đăng nhập và thu hồi phiên khi cần."
          action={
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/settings/sessions">
                Quản lý phiên
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </Button>
          }
        >
          <div className="rounded-lg border border-zinc-200 bg-zinc-50/60 p-3 text-xs">
            <p className="font-medium tracking-tight text-zinc-700">
              Phiên hiện tại
            </p>
            <p className="mt-1 break-all font-mono text-[11px] tracking-normal text-zinc-500">
              JWT HttpOnly cookie ·{" "}
              {typeof navigator !== "undefined"
                ? navigator.userAgent.slice(0, 80)
                : "—"}
              …
            </p>
          </div>
        </SectionCard>

        {/* Security tips */}
        <SectionCard
          icon={<ShieldCheck className="h-4 w-4" aria-hidden="true" />}
          accent="amber"
          title="Bảo mật"
          description="Khuyến nghị duy trì hệ thống an toàn."
          className="lg:col-span-2"
        >
          <ul className="space-y-2 text-xs text-zinc-600">
            <Tip>Đổi mật khẩu định kỳ 90 ngày, không tái sử dụng password cũ.</Tip>
            <Tip>
              Đăng xuất các thiết bị lạ trong mục &quot;Phiên đăng nhập&quot;.
            </Tip>
            <Tip>
              Báo admin ngay nếu phát hiện hoạt động bất thường trong{" "}
              <Link
                href="/admin/audit"
                className="font-medium text-indigo-600 hover:text-indigo-700 hover:underline"
              >
                Audit log
              </Link>
              .
            </Tip>
          </ul>
        </SectionCard>

        {/* Build info */}
        <SectionCard
          icon={<Info className="h-4 w-4" aria-hidden="true" />}
          accent="zinc"
          title="Thông tin build"
          description="Phiên bản đang chạy."
        >
          <dl className="space-y-2 text-xs">
            <Row label="Phiên bản" value={version} mono />
            <Row label="Commit" value={sha} mono />
            <Row label="Build date" value={date} mono />
          </dl>
        </SectionCard>
      </div>
    </AdminPageShell>
  );
}

/* ----------------------------- Subcomponents ---------------------------- */

const ACCENT: Record<
  "indigo" | "emerald" | "amber" | "zinc",
  { iconBg: string; iconText: string; ring: string }
> = {
  indigo: {
    iconBg: "bg-indigo-50",
    iconText: "text-indigo-600",
    ring: "ring-indigo-100",
  },
  emerald: {
    iconBg: "bg-emerald-50",
    iconText: "text-emerald-600",
    ring: "ring-emerald-100",
  },
  amber: {
    iconBg: "bg-amber-50",
    iconText: "text-amber-600",
    ring: "ring-amber-100",
  },
  zinc: {
    iconBg: "bg-zinc-100",
    iconText: "text-zinc-600",
    ring: "ring-zinc-200",
  },
};

function SectionCard({
  icon,
  accent,
  title,
  description,
  action,
  className,
  children,
}: {
  icon: React.ReactNode;
  accent: keyof typeof ACCENT;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  const cls = ACCENT[accent];
  return (
    <section
      className={`overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm transition-shadow hover:shadow-md ${className ?? ""}`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-zinc-100 px-5 py-4">
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ring-1 ring-inset ${cls.iconBg} ${cls.iconText} ${cls.ring}`}
          >
            {icon}
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold tracking-tight text-zinc-900">
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-xs text-zinc-500">{description}</p>
            ) : null}
          </div>
        </div>
        {action ? <div className="shrink-0">{action}</div> : null}
      </header>
      <div className="p-5">{children}</div>
    </section>
  );
}

function Row({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt className="text-[11px] font-medium uppercase tracking-normal text-zinc-500">
        {label}
      </dt>
      <dd
        className={`truncate font-semibold text-zinc-900 ${mono ? "font-mono text-[11px]" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-amber-500"
        aria-hidden="true"
      />
      <span>{children}</span>
    </li>
  );
}
