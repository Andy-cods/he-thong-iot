import type { Config } from "tailwindcss";

// Design tokens — Direction B (UI/UX Redesign)
// Base: Industrial Slate + Stock Green + Safety Orange (giữ palette gốc).
// Thêm: `*-strong` AAA cho status, spacing 7/9/14/18/22/60, shadow pop/dialog/toast/scan-*,
// motion shimmer/shake/flash, zIndex scale, scan flash tokens.
// Chi tiết: plans/redesign/260417-design-spec.md §1.
//
// Typography: Be Vietnam Pro + Inter + JetBrains Mono (Vietnamese subset)
// Breakpoints: sm 375 (mobile) · md 768 (tablet) · lg 1024 · xl 1280 · tv 1920

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
          400: "#94A3B8", // Direction B — icon muted, placeholder
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
          soft: "#FFEDD5", // Direction B — highlight current row PWA picklist
        },
        success: { DEFAULT: "#059669", strong: "#047857", soft: "#D1FAE5" },
        warning: { DEFAULT: "#D97706", strong: "#B45309", soft: "#FEF3C7" },
        danger: { DEFAULT: "#DC2626", strong: "#B91C1C", soft: "#FEE2E2" },
        info: { DEFAULT: "#0369A1", strong: "#0C4A6E", soft: "#DBEAFE" },
        scan: {
          "flash-success": "#D1FAE5",
          "flash-danger": "#FEE2E2",
        },
        zebra: "#F1F5F9",
        overlay: "rgba(15, 23, 42, 0.48)",
        "border-focus": "#0369A1",
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
        7: "56px", // Direction B — topbar, sticky filter
        8: "64px",
        9: "72px", // Direction B — PWA action bar
        10: "80px",
        12: "96px",
        14: "112px", // Direction B — KPI card min-height
        18: "144px", // Direction B — empty state illustration
        22: "176px",
        60: "240px", // Direction B — sidebar expanded
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
        pop: "0 10px 15px -3px rgba(15,23,42,0.10), 0 4px 6px -4px rgba(15,23,42,0.08)",
        dialog:
          "0 20px 25px -5px rgba(15,23,42,0.12), 0 8px 10px -6px rgba(15,23,42,0.08)",
        toast: "0 8px 24px rgba(15,23,42,0.14)",
        focus: "0 0 0 3px rgba(3,105,161,0.35)",
        "focus-strong": "0 0 0 3px rgba(3,105,161,0.55)",
        "scan-success": "0 0 0 4px rgba(5,150,105,0.35)",
        "scan-error": "0 0 0 4px rgba(220,38,38,0.35)",
      },
      zIndex: {
        base: "0",
        sticky: "10",
        sidebar: "20",
        topbar: "30",
        dropdown: "40",
        "command-palette": "50",
        cmdk: "50",
        dialog: "60",
        popover: "65",
        toast: "70",
        "skip-link": "80",
      },
      transitionTimingFunction: {
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        snap: "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "in-soft": "cubic-bezier(0.4, 0, 1, 1)",
      },
      transitionDuration: {
        instant: "80ms",
        fast: "150ms",
        base: "200ms",
        slow: "320ms",
        shimmer: "1200ms",
      },
      keyframes: {
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-6px)" },
          "75%": { transform: "translateX(6px)" },
        },
        "flash-success": {
          "0%": {
            boxShadow: "0 0 0 0 rgba(5,150,105,0)",
            backgroundColor: "transparent",
          },
          "30%": {
            boxShadow: "0 0 0 4px rgba(5,150,105,0.35)",
            backgroundColor: "#D1FAE5",
          },
          "100%": {
            boxShadow: "0 0 0 0 rgba(5,150,105,0)",
            backgroundColor: "transparent",
          },
        },
        "flash-danger": {
          "0%": {
            boxShadow: "0 0 0 0 rgba(220,38,38,0)",
            backgroundColor: "transparent",
          },
          "30%": {
            boxShadow: "0 0 0 4px rgba(220,38,38,0.35)",
            backgroundColor: "#FEE2E2",
          },
          "100%": {
            boxShadow: "0 0 0 0 rgba(220,38,38,0)",
            backgroundColor: "transparent",
          },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(100%)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-right": {
          "0%": { transform: "translateX(0)", opacity: "1" },
          "100%": { transform: "translateX(100%)", opacity: "0" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "fade-out": {
          "0%": { opacity: "1" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1200ms linear infinite",
        shake: "shake 240ms cubic-bezier(0.4, 0, 0.2, 1) 1",
        "flash-success":
          "flash-success 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 1",
        "flash-danger":
          "flash-danger 600ms cubic-bezier(0.2, 0.8, 0.2, 1) 1",
        "slide-in-right":
          "slide-in-right 200ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        "slide-out-right":
          "slide-out-right 200ms cubic-bezier(0.4, 0, 1, 1)",
        "fade-in": "fade-in 150ms cubic-bezier(0.4, 0.0, 0.2, 1)",
        "fade-out": "fade-out 150ms cubic-bezier(0.4, 0.0, 0.2, 1)",
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
