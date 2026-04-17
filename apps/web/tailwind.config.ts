import type { Config } from "tailwindcss";

// Design tokens từ docs/design-guidelines.md Section 3
// Palette: Industrial Slate + Stock Green + Safety Orange
// Typography: Be Vietnam Pro + Inter + JetBrains Mono (vietnamese subset)
// Grid: 8pt baseline
// Breakpoints: sm 375 (mobile login) · md 768 (tablet PWA) · lg 1024 · xl 1280 · tv 1920

export default {
  darkMode: "class", // Disabled V1 — sẽ toggle V1.1
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        slate: {
          900: "#0F172A",
          700: "#1E293B",
          600: "#334155",
          500: "#64748B",
          300: "#CBD5E1",
          200: "#E2E8F0",
          100: "#F1F5F9",
          50: "#F8FAFC",
        },
        brand: {
          DEFAULT: "#0F172A",
          ink: "#0F172A",
          steel: "#334155",
          mist: "#E2E8F0",
        },
        cta: {
          DEFAULT: "#EA580C",
          hover: "#C2410C",
          press: "#9A3412",
        },
        success: { DEFAULT: "#059669", soft: "#D1FAE5" },
        warning: { DEFAULT: "#D97706", soft: "#FEF3C7" },
        danger: { DEFAULT: "#DC2626", soft: "#FEE2E2" },
        info: { DEFAULT: "#0369A1", soft: "#DBEAFE" },
        zebra: "#F1F5F9",
      },
      fontFamily: {
        heading: ['"Be Vietnam Pro"', "ui-sans-serif", "system-ui"],
        sans: ["Inter", '"Be Vietnam Pro"', "ui-sans-serif", "system-ui"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular"],
      },
      fontSize: {
        xs: ["12px", { lineHeight: "16px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "22px" }],
        lg: ["16px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
        "2xl": ["24px", { lineHeight: "32px" }],
        "4xl": ["36px", { lineHeight: "44px" }],
        "7xl": ["72px", { lineHeight: "80px" }],
      },
      spacing: {
        0.5: "4px",
        1: "8px",
        1.5: "12px",
        2: "16px",
        3: "24px",
        4: "32px",
        5: "40px",
        6: "48px", // tap target gloves
        8: "64px",
        10: "80px",
        12: "96px",
      },
      borderRadius: {
        none: "0px",
        sm: "4px",
        DEFAULT: "6px",
        md: "8px",
        lg: "12px",
        full: "9999px",
      },
      boxShadow: {
        xs: "0 1px 2px rgba(15,23,42,0.04)",
        sm: "0 1px 3px rgba(15,23,42,0.06), 0 1px 2px rgba(15,23,42,0.04)",
        md: "0 4px 6px -1px rgba(15,23,42,0.08), 0 2px 4px -2px rgba(15,23,42,0.06)",
        focus: "0 0 0 3px rgba(3,105,161,0.35)",
      },
      transitionTimingFunction: {
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        snap: "cubic-bezier(0.2, 0.8, 0.2, 1)",
      },
      transitionDuration: {
        instant: "80ms",
        fast: "150ms",
        base: "200ms",
        slow: "320ms",
      },
      screens: {
        sm: "375px",
        md: "768px",
        lg: "1024px",
        xl: "1280px",
        "2xl": "1536px",
        tv: "1920px",
      },
      gridTemplateColumns: {
        "dense-12": "repeat(12, minmax(0, 1fr))",
        "tv-6": "repeat(6, minmax(0, 1fr))",
        bom: "minmax(320px, 1fr) minmax(0, 2fr) minmax(280px, 1fr)",
      },
    },
  },
  plugins: [
    require("@tailwindcss/forms"),
    require("@tailwindcss/typography"),
    require("tailwindcss-animate"),
  ],
} satisfies Config;
