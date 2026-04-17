import { ImageResponse } from "next/og";

/**
 * Direction B — Dynamic OG image (1200x630) via Next.js `ImageResponse`.
 *
 * Edge runtime, no external fonts/assets. Pure JSX + inline SVG.
 * Served at `/opengraph-image` (and referenced from root metadata).
 *
 * Design-spec §7.3:
 *  - Background slate-900 (`#0F172A`) with subtle grid.
 *  - Left 40%: gear mark (safety-orange accent) + headings.
 *  - Right 60%: CNC line-art (slate-500).
 *  - Footer: `mes.songchau.vn` mono slate-400.
 */

export const runtime = "edge";
export const alt = "IoT Xưởng cơ khí — Hệ thống BOM-centric";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "row",
          background:
            "linear-gradient(135deg, #0F172A 0%, #1E293B 60%, #0F172A 100%)",
          color: "#F8FAFC",
          fontFamily:
            "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
          position: "relative",
        }}
      >
        {/* Subtle grid overlay */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 1200 630"
          style={{ position: "absolute", inset: 0, opacity: 0.08 }}
        >
          <defs>
            <pattern
              id="og-grid"
              width="48"
              height="48"
              patternUnits="userSpaceOnUse"
            >
              <path
                d="M48 0 L0 0 0 48"
                stroke="#F8FAFC"
                strokeWidth="1"
                fill="none"
              />
            </pattern>
          </defs>
          <rect width="1200" height="630" fill="url(#og-grid)" />
        </svg>

        {/* LEFT pane — brand + headings */}
        <div
          style={{
            flex: "0 0 480px",
            display: "flex",
            flexDirection: "column",
            justifyContent: "center",
            padding: "64px 56px",
            gap: 20,
            zIndex: 1,
          }}
        >
          {/* Gear logo mark */}
          <svg width="96" height="96" viewBox="0 0 512 512">
            <rect width="512" height="512" rx="80" fill="#0F172A" />
            <circle
              cx="256"
              cy="256"
              r="156"
              fill="none"
              stroke="#F97316"
              strokeWidth="6"
              strokeDasharray="4 10"
              opacity="0.45"
            />
            <g fill="#F8FAFC">
              <rect x="244" y="60" width="24" height="44" rx="3" />
              <rect x="244" y="408" width="24" height="44" rx="3" />
              <rect x="60" y="244" width="44" height="24" rx="3" />
              <rect x="408" y="244" width="44" height="24" rx="3" />
              <g transform="rotate(30 256 256)">
                <rect x="244" y="60" width="24" height="44" rx="3" />
                <rect x="244" y="408" width="24" height="44" rx="3" />
                <rect x="60" y="244" width="44" height="24" rx="3" />
                <rect x="408" y="244" width="44" height="24" rx="3" />
              </g>
              <g transform="rotate(60 256 256)">
                <rect x="244" y="60" width="24" height="44" rx="3" />
                <rect x="244" y="408" width="24" height="44" rx="3" />
                <rect x="60" y="244" width="44" height="24" rx="3" />
                <rect x="408" y="244" width="44" height="24" rx="3" />
              </g>
              <circle cx="256" cy="256" r="128" />
            </g>
            <circle cx="256" cy="256" r="88" fill="#0F172A" />
            <polygon
              points="256,196 308,226 308,286 256,316 204,286 204,226"
              fill="#F97316"
            />
            <circle cx="256" cy="256" r="14" fill="#0F172A" />
          </svg>

          {/* Accent line */}
          <div
            style={{
              width: 64,
              height: 4,
              background: "#F97316",
              borderRadius: 2,
            }}
          />

          {/* Heading */}
          <div
            style={{
              fontSize: 56,
              fontWeight: 700,
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}
          >
            IoT Xưởng cơ khí
          </div>

          {/* Subtitle */}
          <div
            style={{
              fontSize: 24,
              color: "#94A3B8",
              lineHeight: 1.3,
              marginTop: 4,
            }}
          >
            Hệ thống BOM-centric cho xưởng Việt Nam
          </div>

          {/* Domain */}
          <div
            style={{
              marginTop: "auto",
              fontSize: 18,
              color: "#64748B",
              fontFamily: "ui-monospace, Menlo, Consolas, monospace",
            }}
          >
            mes.songchau.vn
          </div>
        </div>

        {/* RIGHT pane — CNC line-art */}
        <div
          style={{
            flex: 1,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "48px 56px 48px 0",
            zIndex: 1,
          }}
        >
          <svg
            viewBox="0 0 480 360"
            width="640"
            height="480"
            fill="none"
            stroke="#64748B"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            {/* Machine bed */}
            <rect x="60" y="260" width="360" height="18" rx="2" />
            <line x1="80" y1="278" x2="80" y2="320" />
            <line x1="400" y1="278" x2="400" y2="320" />
            <line x1="60" y1="320" x2="420" y2="320" />
            {/* Work-piece */}
            <rect x="200" y="232" width="80" height="28" rx="1" />
            <line
              x1="212"
              y1="240"
              x2="268"
              y2="240"
              strokeDasharray="3 3"
            />
            {/* Column */}
            <rect x="360" y="60" width="36" height="200" rx="2" />
            {/* Arm */}
            <rect x="140" y="80" width="230" height="24" rx="2" />
            {/* Spindle */}
            <rect x="190" y="104" width="60" height="60" rx="3" />
            <line
              x1="220"
              y1="164"
              x2="220"
              y2="220"
              strokeWidth="3"
              stroke="#F97316"
            />
            <polygon
              points="213,220 227,220 220,234"
              fill="#F97316"
              stroke="#F97316"
            />
            {/* Gear 1 */}
            <circle cx="110" cy="170" r="36" />
            <circle cx="110" cy="170" r="10" />
            {Array.from({ length: 12 }).map((_, i) => {
              const angle = (i / 12) * Math.PI * 2;
              const x1 = 110 + Math.cos(angle) * 36;
              const y1 = 170 + Math.sin(angle) * 36;
              const x2 = 110 + Math.cos(angle) * 46;
              const y2 = 170 + Math.sin(angle) * 46;
              return (
                <line key={`g1-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              );
            })}
            {/* Gear 2 */}
            <circle cx="60" cy="138" r="18" />
            <circle cx="60" cy="138" r="6" />
            {Array.from({ length: 8 }).map((_, i) => {
              const angle = (i / 8) * Math.PI * 2;
              const x1 = 60 + Math.cos(angle) * 18;
              const y1 = 138 + Math.sin(angle) * 18;
              const x2 = 60 + Math.cos(angle) * 26;
              const y2 = 138 + Math.sin(angle) * 26;
              return (
                <line key={`g2-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} />
              );
            })}
          </svg>
        </div>
      </div>
    ),
    { ...size },
  );
}
