import * as React from "react";

/**
 * Direction B — OfflineCloud illustration.
 * Offline state: cloud outline with slash overlay, slate-400.
 */
export function OfflineCloud({
  className,
  size = 144,
}: {
  className?: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 144 144"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className ?? "text-slate-400"}
      aria-hidden="true"
    >
      {/* Cloud body */}
      <path
        d="M 44 84
           C 28 84 22 68 34 58
           C 34 42 52 38 60 48
           C 64 36 88 36 94 50
           C 112 48 118 68 108 80
           C 116 90 108 102 94 100
           L 52 100
           C 40 100 36 92 44 84 Z"
      />

      {/* Wifi arcs inside cloud (faded) */}
      <path d="M 58 72 Q 72 60 86 72" opacity="0.5" />
      <path d="M 64 80 Q 72 74 80 80" opacity="0.5" />
      <circle cx="72" cy="86" r="1.5" fill="currentColor" stroke="none" opacity="0.5" />

      {/* Slash across (danger accent for offline) */}
      <line
        x1="30"
        y1="34"
        x2="120"
        y2="120"
        strokeWidth="3"
        stroke="#EF4444"
      />

      {/* Ground line */}
      <line x1="20" y1="124" x2="124" y2="124" strokeDasharray="2 4" />
    </svg>
  );
}
