"use client";

import * as React from "react";

/**
 * V2 LoginHero — Linear-minimal line-art (design-spec §2.1 + §7.3).
 *
 * Delta V1: bg slate-900 → zinc-900. SVG refine: 1 spindle + 2 gears outline,
 * stroke 1px zinc-400, không tô màu, viewBox 400×400, size 40% panel để
 * không dominate.
 *
 * Inline SVG cho LCP — no external request.
 */
export function LoginHero({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "relative flex h-full w-full flex-col items-center justify-between overflow-hidden bg-zinc-900 p-12 text-zinc-100"
      }
    >
      {/* Background grid subtle */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.06]"
        viewBox="0 0 400 400"
        fill="none"
        aria-hidden="true"
      >
        <defs>
          <pattern
            id="login-hero-grid"
            x="0"
            y="0"
            width="40"
            height="40"
            patternUnits="userSpaceOnUse"
          >
            <path d="M40 0 L0 0 0 40" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="400" height="400" fill="url(#login-hero-grid)" />
      </svg>

      {/* Brand + tagline — top */}
      <div className="relative z-10 flex flex-col items-start self-start">
        <div className="mb-4 flex h-8 w-8 items-center justify-center rounded-sm bg-blue-500/15 ring-1 ring-blue-400/30">
          <span className="font-heading text-sm font-semibold text-blue-300">
            CN
          </span>
        </div>
        <h1 className="text-xl font-semibold tracking-tight text-white">
          MES Xưởng Cơ Khí
        </h1>
        <p className="mt-2 max-w-sm text-base text-zinc-300">
          Hệ thống xưởng cơ khí BOM-centric
        </p>
      </div>

      {/* CNC line-art — centered, minimal 2-gear + spindle */}
      <svg
        viewBox="0 0 400 400"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10 h-auto w-[40%] max-w-[260px] text-zinc-400"
        aria-hidden="true"
      >
        {/* Horizontal rail */}
        <line x1="80" y1="120" x2="320" y2="120" strokeWidth="1" />

        {/* Spindle body */}
        <rect x="180" y="120" width="40" height="80" rx="2" />
        <line x1="200" y1="200" x2="200" y2="260" strokeWidth="1.5" />
        <polygon
          points="195,260 205,260 200,272"
          fill="currentColor"
          stroke="none"
        />

        {/* Work piece */}
        <rect x="140" y="280" width="120" height="20" rx="1" />
        <line
          x1="150"
          y1="290"
          x2="250"
          y2="290"
          strokeDasharray="2 3"
        />

        {/* Base */}
        <line x1="100" y1="310" x2="300" y2="310" />

        {/* Gear left (small) */}
        <g>
          <circle cx="110" cy="200" r="22" />
          <circle cx="110" cy="200" r="7" />
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const inner = 22;
            const outer = 28;
            const x1 = 110 + Math.cos(angle) * inner;
            const y1 = 200 + Math.sin(angle) * inner;
            const x2 = 110 + Math.cos(angle) * outer;
            const y2 = 200 + Math.sin(angle) * outer;
            return (
              <line key={`g1-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            );
          })}
        </g>

        {/* Gear right (medium) */}
        <g>
          <circle cx="300" cy="220" r="32" />
          <circle cx="300" cy="220" r="10" />
          <circle cx="300" cy="220" r="2" fill="currentColor" stroke="none" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2 + Math.PI / 12;
            const inner = 32;
            const outer = 40;
            const x1 = 300 + Math.cos(angle) * inner;
            const y1 = 220 + Math.sin(angle) * inner;
            const x2 = 300 + Math.cos(angle) * outer;
            const y2 = 220 + Math.sin(angle) * outer;
            return (
              <line key={`g2-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            );
          })}
        </g>

        {/* Dimension mark */}
        <line x1="140" y1="320" x2="260" y2="320" strokeWidth="1" />
        <line x1="140" y1="316" x2="140" y2="324" strokeWidth="1" />
        <line x1="260" y1="316" x2="260" y2="324" strokeWidth="1" />
      </svg>

      {/* Spacer bottom (flex justify-between holds layout) */}
      <div />
    </div>
  );
}
