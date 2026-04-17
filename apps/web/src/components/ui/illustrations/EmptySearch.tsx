import * as React from "react";

/**
 * Direction B — EmptySearch illustration.
 * No-filter-match state: magnifier + blank document, slate-400.
 */
export function EmptySearch({
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
      {/* Document (back) */}
      <path d="M 40 28 L 92 28 L 108 44 L 108 108 L 40 108 Z" />
      <path d="M 92 28 L 92 44 L 108 44" />
      {/* Empty lines inside doc */}
      <line x1="52" y1="58" x2="92" y2="58" strokeDasharray="3 3" />
      <line x1="52" y1="72" x2="84" y2="72" strokeDasharray="3 3" />
      <line x1="52" y1="86" x2="76" y2="86" strokeDasharray="3 3" />

      {/* Magnifier lens (front, overlapping bottom-right) */}
      <circle cx="98" cy="96" r="18" />
      <circle cx="98" cy="96" r="11" opacity="0.5" />
      {/* Handle */}
      <line x1="112" y1="110" x2="124" y2="122" strokeWidth="2.5" />

      {/* Question mark dots inside lens */}
      <line x1="98" y1="98" x2="98" y2="98" strokeWidth="3" />
      <path d="M 94 91 Q 94 87 98 87 Q 102 87 102 91 Q 102 93 98 94" strokeWidth="1.5" />
    </svg>
  );
}
