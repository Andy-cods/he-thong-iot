import * as React from "react";

/**
 * Direction B — EmptyInbox illustration.
 * No-alerts / empty mailbox, slate-400 line-art.
 */
export function EmptyInbox({
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
      {/* Tray body */}
      <path d="M 22 74 L 46 44 L 98 44 L 122 74 L 122 110 L 22 110 Z" />
      {/* Inner opening */}
      <path d="M 22 74 L 52 74 L 58 86 L 86 86 L 92 74 L 122 74" />
      {/* Fold lines */}
      <line x1="46" y1="44" x2="52" y2="74" strokeDasharray="2 3" />
      <line x1="98" y1="44" x2="92" y2="74" strokeDasharray="2 3" />

      {/* Empty envelope hint (dashed, absent) */}
      <rect
        x="54"
        y="52"
        width="36"
        height="22"
        rx="2"
        strokeDasharray="3 3"
        opacity="0.7"
      />
      <path d="M 54 52 L 72 66 L 90 52" strokeDasharray="3 3" opacity="0.7" />

      {/* Base line */}
      <line x1="16" y1="120" x2="128" y2="120" strokeDasharray="2 4" />
    </svg>
  );
}
