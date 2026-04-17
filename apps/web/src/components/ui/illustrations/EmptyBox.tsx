import * as React from "react";

/**
 * Direction B — EmptyBox illustration.
 * Generic "no data" state: open cardboard box, line-art, slate-400 stroke.
 * 144x144, inline SVG, no external assets.
 */
export function EmptyBox({
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
      {/* Base ground line */}
      <line x1="20" y1="124" x2="124" y2="124" strokeDasharray="2 4" />

      {/* Box body */}
      <path d="M 30 60 L 30 118 L 114 118 L 114 60 Z" />
      {/* Box bottom seam */}
      <line x1="30" y1="86" x2="114" y2="86" />

      {/* Left flap (open) */}
      <path d="M 30 60 L 22 44 L 66 44 L 72 60" />
      {/* Right flap (open) */}
      <path d="M 114 60 L 122 44 L 78 44 L 72 60" />
      {/* Back flap hint */}
      <path d="M 72 60 L 72 44" strokeDasharray="2 3" />

      {/* Tape strip */}
      <line x1="50" y1="118" x2="50" y2="86" strokeDasharray="3 2" />
      <line x1="94" y1="118" x2="94" y2="86" strokeDasharray="3 2" />

      {/* Dotted emptiness inside */}
      <circle cx="72" cy="76" r="2" />
      <circle cx="60" cy="80" r="1.5" />
      <circle cx="84" cy="80" r="1.5" />
    </svg>
  );
}
