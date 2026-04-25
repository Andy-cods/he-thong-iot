"use client";

import * as React from "react";
import { Boxes, ClipboardList, Package, ScanLine } from "lucide-react";

/**
 * V1.8 LoginHero — panel trái trang đăng nhập.
 *
 * Gradient indigo-600 → indigo-900 + lớp SVG dot-grid nhẹ. Brand "Song Châu
 * MES" + subtitle + 4 feature bullets minh hoạ scope V1 (BOM, WO, Inventory,
 * Audit). Dùng server-friendly className, không animation nặng.
 */
export function LoginHero({ className }: { className?: string }) {
  return (
    <aside
      className={
        className ??
        "relative flex h-full w-full flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 p-10 text-white lg:p-14"
      }
    >
      {/* Subtle dot pattern */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="login-hero-dots"
            x="0"
            y="0"
            width="24"
            height="24"
            patternUnits="userSpaceOnUse"
          >
            <circle cx="1" cy="1" r="1" fill="currentColor" />
          </pattern>
        </defs>
        <rect width="400" height="400" fill="url(#login-hero-dots)" />
      </svg>

      {/* Soft geometric glow */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-indigo-400/20 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-40 -left-20 h-96 w-96 rounded-full bg-indigo-950/40 blur-3xl"
      />

      {/* Brand — top */}
      <div className="relative z-10">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25 backdrop-blur-sm animate-in fade-in zoom-in-95 duration-500"
            aria-hidden="true"
          >
            <span className="font-heading text-sm font-semibold tracking-tight text-white">
              SC
            </span>
          </div>
          <div>
            <p className="text-sm font-medium text-indigo-100">Song Châu MES</p>
            <p className="text-xs text-indigo-200/80">
              v1.8 · BOM-centric manufacturing
            </p>
          </div>
        </div>
      </div>

      {/* Headline + bullets — middle */}
      <div className="relative z-10 mt-10 max-w-md">
        <h1 className="text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
          Song Châu MES
        </h1>
        <p className="mt-4 text-base leading-relaxed text-indigo-100/90">
          Hệ thống điều hành sản xuất BOM-centric cho xưởng cơ khí — thay thế
          Excel, minh bạch từ công thức đến kho.
        </p>

        <ul className="mt-8 space-y-3 text-sm text-indigo-50">
          <FeatureBullet
            icon={<Boxes className="h-4 w-4" aria-hidden="true" />}
            title="BOM tree 5 cấp"
            description="Quản lý công thức sản phẩm, revision, ECO."
          />
          <FeatureBullet
            icon={<ClipboardList className="h-4 w-4" aria-hidden="true" />}
            title="Work Order + Assembly"
            description="Theo dõi lệnh sản xuất, tiến độ, QC."
          />
          <FeatureBullet
            icon={<Package className="h-4 w-4" aria-hidden="true" />}
            title="Inventory + Barcode"
            description="Nhận hàng, tồn kho realtime, quét mã."
          />
          <FeatureBullet
            icon={<ScanLine className="h-4 w-4" aria-hidden="true" />}
            title="Audit log đầy đủ"
            description="Mọi thay đổi đều được ghi lại, có thể truy vết."
          />
        </ul>
      </div>

      {/* Footer — bottom */}
      <div className="relative z-10 mt-10 text-xs text-indigo-200/70">
        © {new Date().getFullYear()} Song Châu. Nội bộ xưởng cơ khí.
      </div>
    </aside>
  );
}

function FeatureBullet({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <li className="flex items-start gap-3">
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-white/10 text-indigo-100 ring-1 ring-white/15">
        {icon}
      </span>
      <div>
        <p className="font-medium text-white">{title}</p>
        <p className="text-sm text-indigo-100/80">{description}</p>
      </div>
    </li>
  );
}
