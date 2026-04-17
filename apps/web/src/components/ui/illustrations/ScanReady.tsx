import * as React from "react";

/**
 * Direction B — ScanReady illustration.
 * PWA camera ready state: phone outline + barcode scan line, slate-400.
 */
export function ScanReady({
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
      {/* Phone body */}
      <rect x="44" y="16" width="56" height="112" rx="8" strokeWidth="2" />
      {/* Screen */}
      <rect x="50" y="28" width="44" height="88" rx="2" />
      {/* Speaker */}
      <line x1="64" y1="22" x2="80" y2="22" strokeWidth="2" />
      {/* Home indicator */}
      <line x1="64" y1="122" x2="80" y2="122" strokeWidth="2" />

      {/* Barcode inside screen */}
      <line x1="56" y1="54" x2="56" y2="90" />
      <line x1="60" y1="54" x2="60" y2="90" strokeWidth="2" />
      <line x1="64" y1="54" x2="64" y2="90" />
      <line x1="68" y1="54" x2="68" y2="90" strokeWidth="2.5" />
      <line x1="74" y1="54" x2="74" y2="90" />
      <line x1="78" y1="54" x2="78" y2="90" strokeWidth="2" />
      <line x1="82" y1="54" x2="82" y2="90" />
      <line x1="86" y1="54" x2="86" y2="90" strokeWidth="2.5" />

      {/* Scan line across barcode (accent) */}
      <line
        x1="52"
        y1="72"
        x2="92"
        y2="72"
        strokeWidth="2"
        stroke="#F97316"
      />

      {/* Corner brackets (scan viewfinder) */}
      <path d="M 52 58 L 52 54 L 56 54" strokeWidth="2" />
      <path d="M 88 54 L 92 54 L 92 58" strokeWidth="2" />
      <path d="M 52 86 L 52 90 L 56 90" strokeWidth="2" />
      <path d="M 88 90 L 92 90 L 92 86" strokeWidth="2" />
    </svg>
  );
}
