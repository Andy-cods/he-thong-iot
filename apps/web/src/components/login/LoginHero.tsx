"use client";

import * as React from "react";

/**
 * Direction B — LoginHero (design-spec §2.1).
 *
 * Line-art SVG CNC scene: gear cluster (3 gears) + spindle + machine bed +
 * background grid. Stroke `slate-400` 1.5px, inline (no external request).
 *
 * Inline for LCP: keeps hero paint on initial HTML, no image fetch.
 * Target size < 10 KB gzipped.
 */
export function LoginHero({ className }: { className?: string }) {
  return (
    <div
      className={
        className ??
        "relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-slate-900 p-12 text-slate-100"
      }
    >
      {/* Background grid subtle */}
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.08]"
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

      {/* Brand + tagline */}
      <div className="relative z-10 mb-10 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-lg bg-cta/10 ring-1 ring-cta/30">
          <span className="font-heading text-2xl font-bold text-cta">CN</span>
        </div>
        <h1 className="font-heading text-2xl font-bold tracking-tight text-white">
          Hệ thống xưởng cơ khí
        </h1>
        <p className="mt-2 max-w-md text-sm text-slate-400">
          BOM-centric MES/ERP nhẹ · quản lý vật tư · đơn hàng · lắp ráp
        </p>
      </div>

      {/* CNC line-art inline SVG */}
      <svg
        viewBox="0 0 480 360"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="relative z-10 h-auto w-full max-w-md text-slate-400"
        aria-hidden="true"
      >
        {/* Base / machine bed */}
        <rect x="60" y="260" width="360" height="18" rx="2" />
        <line x1="80" y1="278" x2="80" y2="310" />
        <line x1="400" y1="278" x2="400" y2="310" />
        <line x1="60" y1="310" x2="420" y2="310" />

        {/* Work-piece block */}
        <rect x="200" y="232" width="80" height="28" rx="1" />
        <line x1="212" y1="240" x2="268" y2="240" strokeDasharray="3 3" />
        <line x1="212" y1="252" x2="268" y2="252" strokeDasharray="3 3" />

        {/* Column (vertical) */}
        <rect x="360" y="60" width="36" height="200" rx="2" />
        <line x1="378" y1="70" x2="378" y2="250" strokeDasharray="4 4" />

        {/* Horizontal arm */}
        <rect x="140" y="80" width="230" height="24" rx="2" />

        {/* Spindle head + tool */}
        <rect x="190" y="104" width="60" height="60" rx="3" />
        <circle cx="220" cy="134" r="16" />
        <line x1="220" y1="164" x2="220" y2="220" strokeWidth="2.5" />
        <polygon
          points="215,220 225,220 220,232"
          fill="currentColor"
          stroke="none"
        />

        {/* Gear cluster — 3 gears with visible teeth */}
        {/* Gear 1 (main, bottom-left) */}
        <g>
          <circle cx="110" cy="180" r="36" />
          <circle cx="110" cy="180" r="12" />
          <circle cx="110" cy="180" r="3" fill="currentColor" stroke="none" />
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            const inner = 36;
            const outer = 46;
            const x1 = 110 + Math.cos(angle) * inner;
            const y1 = 180 + Math.sin(angle) * inner;
            const x2 = 110 + Math.cos(angle) * outer;
            const y2 = 180 + Math.sin(angle) * outer;
            return (
              <line key={`g1-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            );
          })}
        </g>

        {/* Gear 2 (small, upper-left, interlocking) */}
        <g>
          <circle cx="58" cy="134" r="20" />
          <circle cx="58" cy="134" r="7" />
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2;
            const inner = 20;
            const outer = 27;
            const x1 = 58 + Math.cos(angle) * inner;
            const y1 = 134 + Math.sin(angle) * inner;
            const x2 = 58 + Math.cos(angle) * outer;
            const y2 = 134 + Math.sin(angle) * outer;
            return (
              <line key={`g2-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            );
          })}
        </g>

        {/* Gear 3 (medium, right of main, interlocking with spindle hint) */}
        <g>
          <circle cx="170" cy="210" r="24" />
          <circle cx="170" cy="210" r="8" />
          {Array.from({ length: 10 }).map((_, i) => {
            const angle = (i / 10) * Math.PI * 2 + Math.PI / 10;
            const inner = 24;
            const outer = 32;
            const x1 = 170 + Math.cos(angle) * inner;
            const y1 = 210 + Math.sin(angle) * inner;
            const x2 = 170 + Math.cos(angle) * outer;
            const y2 = 210 + Math.sin(angle) * outer;
            return (
              <line key={`g3-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
            );
          })}
        </g>

        {/* Dimension markers on work-piece */}
        <line x1="200" y1="318" x2="280" y2="318" strokeWidth="1" />
        <line x1="200" y1="314" x2="200" y2="322" strokeWidth="1" />
        <line x1="280" y1="314" x2="280" y2="322" strokeWidth="1" />
        <text
          x="240"
          y="336"
          textAnchor="middle"
          fontSize="11"
          fontFamily="ui-monospace, monospace"
          fill="currentColor"
          stroke="none"
        >
          80mm
        </text>

        {/* Crosshair right (laser/probe) */}
        <circle cx="330" cy="200" r="6" strokeDasharray="2 2" />
        <line x1="320" y1="200" x2="340" y2="200" />
        <line x1="330" y1="190" x2="330" y2="210" />

        {/* Tool-path dashed arc (stylized tool motion) */}
        <path
          d="M 240 260 Q 280 240 320 260"
          strokeDasharray="3 3"
          opacity="0.6"
        />
      </svg>
    </div>
  );
}
