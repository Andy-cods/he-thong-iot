import * as React from "react";

/**
 * Direction B — EmptyAlert illustration.
 * Error state: triangle warning + baseline, slate-400 + danger accent.
 */
export function EmptyAlert({
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
      {/* Ground line */}
      <line x1="16" y1="120" x2="128" y2="120" strokeDasharray="2 4" />

      {/* Warning triangle */}
      <path d="M 72 28 L 122 110 L 22 110 Z" strokeWidth="2" />
      {/* Exclamation mark */}
      <line x1="72" y1="56" x2="72" y2="82" strokeWidth="3" />
      <circle cx="72" cy="96" r="2.5" fill="currentColor" stroke="none" />

      {/* Side rays / alert spokes */}
      <line x1="14" y1="52" x2="26" y2="52" />
      <line x1="18" y1="36" x2="28" y2="44" />
      <line x1="130" y1="52" x2="118" y2="52" />
      <line x1="126" y1="36" x2="116" y2="44" />
    </svg>
  );
}
