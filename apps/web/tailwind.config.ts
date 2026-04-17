import type { Config } from "tailwindcss";

// Design tokens V2 — Linear-inspired (zinc + electric blue).
// Nguồn: plans/redesign-v2/260417-v2-design-spec.md §1.
// Typography: Inter (duy nhất) + JetBrains Mono cho SKU/batch/timestamp.
// Breakpoints: sm 375 · md 768 · lg 1024 · xl 1280 · tv 1920.
// Safety-orange `orange-500` `#F97316` CHỈ dùng cho shortage/critical semantic.

export default {
  darkMode: ["class", '[data-theme="dark"]'], // Reserve V2.1 — không toggle V2.0
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zinc (neutral — replace slate V1)
        zinc: {
          50: "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
          950: "#09090B",
        },

        // Blue (primary accent — electric Linear-style)
        blue: {
          50: "#EFF6FF",
          100: "#DBEAFE",
          200: "#BFDBFE",
          300: "#93C5FD",
          400: "#60A5FA",
          500: "#3B82F6",
          600: "#2563EB",
          700: "#1D4ED8",
          800: "#1E40AF",
          900: "#1E3A8A",
          950: "#172554",
        },

        // Semantic
        emerald: {
          50: "#ECFDF5",
          100: "#D1FAE5",
          200: "#A7F3D0",
          300: "#6EE7B7",
          400: "#34D399",
          500: "#10B981",
          600: "#059669",
          700: "#047857",
        },
        amber: {
          50: "#FFFBEB",
          100: "#FEF3C7",
          200: "#FDE68A",
          300: "#FCD34D",
          400: "#FBBF24",
          500: "#F59E0B",
          600: "#D97706",
          700: "#B45309",
        },
        red: {
          50: "#FEF2F2",
          100: "#FEE2E2",
          200: "#FECACA",
          300: "#FCA5A5",
          400: "#F87171",
          500: "#EF4444",
          600: "#DC2626",
          700: "#B91C1C",
        },
        sky: {
          50: "#F0F9FF",
          100: "#E0F2FE",
          200: "#BAE6FD",
          400: "#38BDF8",
          500: "#0EA5E9",
          600: "#0284C7",
          700: "#0369A1",
        },

        // Safety-orange — SHORTAGE SEMANTIC ONLY
        orange: {
          50: "#FFF7ED",
          200: "#FED7AA",
          500: "#F97316",
          600: "#EA580C",
          700: "#C2410C",
        },

        // Aliases V2
        accent: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          press: "#1D4ED8",
          soft: "#EFF6FF",
          ring: "rgba(59, 130, 246, 0.35)",
        },
        shortage: {
          DEFAULT: "#F97316",
          soft: "#FFF7ED",
          strong: "#C2410C",
        },

        // Scrim/overlay
        "overlay-scrim": "rgba(0, 0, 0, 0.5)",
        "overlay-sheet": "rgba(0, 0, 0, 0.4)",
        overlay: "rgba(0, 0, 0, 0.5)", // back-compat V1

        // === Legacy back-compat (V1 Direction B → V2 drop-in) ===
        // slate → map vào zinc scale để V1 code cũ không crash tại phase tokens.
        slate: {
          50: "#FAFAFA",
          100: "#F4F4F5",
          200: "#E4E4E7",
          300: "#D4D4D8",
          400: "#A1A1AA",
          500: "#71717A",
          600: "#52525B",
          700: "#3F3F46",
          800: "#27272A",
          900: "#18181B",
        },
        brand: {
          DEFAULT: "#18181B",
          ink: "#18181B",
          steel: "#3F3F46",
          mist: "#E4E4E7",
        },
        cta: {
          DEFAULT: "#3B82F6",
          hover: "#2563EB",
          press: "#1D4ED8",
          soft: "#EFF6FF",
        },
        success: { DEFAULT: "#10B981", strong: "#047857", soft: "#ECFDF5" },
        warning: { DEFAULT: "#F59E0B", strong: "#B45309", soft: "#FFFBEB" },
        danger: { DEFAULT: "#EF4444", strong: "#B91C1C", soft: "#FEF2F2" },
        info: { DEFAULT: "#0EA5E9", strong: "#0369A1", soft: "#F0F9FF" },
        scan: {
          "flash-success": "#ECFDF5",
          "flash-danger": "#FEF2F2",
        },
        zebra: "#F4F4F5",
        "border-focus": "#3B82F6",
      },

      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        heading: ["Inter", "ui-sans-serif", "system-ui"], // alias — V2 bỏ Be Vietnam Pro
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },

      fontSize: {
        xs: ["0.6875rem", { lineHeight: "0.875rem" }], // 11/14
        sm: ["0.75rem", { lineHeight: "1rem" }], // 12/16
        base: ["0.8125rem", { lineHeight: "1.125rem" }], // 13/18
        md: ["0.875rem", { lineHeight: "1.25rem" }], // 14/20
        lg: ["0.9375rem", { lineHeight: "1.25rem" }], // 15/20
        xl: ["1.0625rem", { lineHeight: "1.5rem" }], // 17/24
        "2xl": ["1.25rem", { lineHeight: "1.75rem" }], // 20/28 — H1 page
        "3xl": ["1.5rem", { lineHeight: "2rem" }], // 24/32 — KPI value
        "4xl": ["1.75rem", { lineHeight: "2rem" }], // 28/32
        "5xl": ["2.5rem", { lineHeight: "2.75rem" }], // 40/44 TV mode
        "7xl": ["2.5rem", { lineHeight: "2.75rem" }], // back-compat V1 (remap xuống)
      },

      spacing: {
        0: "0",
        0.5: "0.25rem", // 4 — back-compat V1
        1: "0.25rem", // 4
        1.5: "0.375rem", // 6 — back-compat
        2: "0.5rem", // 8
        2.5: "0.625rem", // 10
        3: "0.75rem", // 12
        3.5: "0.875rem", // 14 — back-compat V1 `h-3.5`
        4: "1rem", // 16
        5: "1.25rem", // 20
        6: "1.5rem", // 24
        7: "1.75rem", // 28 — sidebar nav row
        8: "2rem", // 32
        9: "2.25rem", // 36 — form input / list row
        10: "2.5rem", // 40
        11: "2.75rem", // 44 — PWA touch
        12: "3rem", // 48
        14: "3.5rem", // 56 — mobile topbar
        16: "4rem", // 64
        18: "4.5rem", // 72 — back-compat V1
        20: "5rem", // 80
        22: "5.5rem", // 88 — back-compat V1
        24: "6rem", // 96
        60: "15rem", // 240 — sidebar mobile drawer
      },

      borderRadius: {
        none: "0",
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        full: "9999px",
      },

      boxShadow: {
        xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
        sm: "0 2px 4px rgba(0, 0, 0, 0.05), 0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 4px 12px rgba(0, 0, 0, 0.06)",
        lg: "0 16px 48px rgba(0, 0, 0, 0.12)",
        toast: "0 8px 24px rgba(0, 0, 0, 0.10)",
        // Back-compat aliases
        pop: "0 4px 12px rgba(0, 0, 0, 0.06)",
        dialog: "0 16px 48px rgba(0, 0, 0, 0.12)",
        focus: "0 0 0 2px rgba(59, 130, 246, 0.5)",
        "focus-strong": "0 0 0 3px rgba(37, 99, 235, 0.5)",
        "scan-success": "0 0 0 3px rgba(16, 185, 129, 0.5)",
        "scan-error": "0 0 0 3px rgba(239, 68, 68, 0.5)",
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
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        out: "cubic-bezier(0.16, 1, 0.3, 1)",
        "in-soft": "cubic-bezier(0.4, 0, 1, 1)",
        // Back-compat V1
        industrial: "cubic-bezier(0.4, 0.0, 0.2, 1)",
        snap: "cubic-bezier(0.25, 1, 0.5, 1)",
      },

      transitionDuration: {
        100: "100ms",
        150: "150ms",
        200: "200ms",
        300: "300ms",
        1200: "1200ms",
        // Back-compat V1
        instant: "100ms",
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
        shimmer: "1200ms",
      },

      keyframes: {
        "fade-in": { from: { opacity: "0" }, to: { opacity: "1" } },
        "fade-out": { from: { opacity: "1" }, to: { opacity: "0" } },
        "slide-in-right": {
          from: { transform: "translateX(100%)", opacity: "0" },
          to: { transform: "translateX(0)", opacity: "1" },
        },
        "slide-out-right": {
          from: { transform: "translateX(0)", opacity: "1" },
          to: { transform: "translateX(100%)", opacity: "0" },
        },
        "dialog-in": {
          from: { transform: "scale(0.96)", opacity: "0" },
          to: { transform: "scale(1)", opacity: "1" },
        },
        "dialog-out": {
          from: { transform: "scale(1)", opacity: "1" },
          to: { transform: "scale(0.98)", opacity: "0" },
        },
        "shimmer-sm": {
          from: { backgroundPosition: "-200% 0" },
          to: { backgroundPosition: "200% 0" },
        },
        "scan-flash-success": {
          "0%": { outline: "0 solid rgba(16, 185, 129, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(16, 185, 129, 0.5)", backgroundColor: "#ECFDF5" },
          "100%": { outline: "0 solid rgba(16, 185, 129, 0)", backgroundColor: "transparent" },
        },
        "scan-flash-danger": {
          "0%": { outline: "0 solid rgba(239, 68, 68, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(239, 68, 68, 0.5)", backgroundColor: "#FEF2F2" },
          "100%": { outline: "0 solid rgba(239, 68, 68, 0)", backgroundColor: "transparent" },
        },
        "scan-shake-sm": {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "50%": { transform: "translateX(4px)" },
          "75%": { transform: "translateX(-2px)" },
        },
        "toast-slide-up": {
          from: { transform: "translateY(100%)", opacity: "0" },
          to: { transform: "translateY(0)", opacity: "1" },
        },
        // Back-compat keyframes V1 (alias sang V2 shapes)
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        shake: {
          "0%,100%": { transform: "translateX(0)" },
          "25%": { transform: "translateX(-4px)" },
          "75%": { transform: "translateX(4px)" },
        },
        "flash-success": {
          "0%": { outline: "0 solid rgba(16, 185, 129, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(16, 185, 129, 0.5)", backgroundColor: "#ECFDF5" },
          "100%": { outline: "0 solid rgba(16, 185, 129, 0)", backgroundColor: "transparent" },
        },
        "flash-danger": {
          "0%": { outline: "0 solid rgba(239, 68, 68, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(239, 68, 68, 0.5)", backgroundColor: "#FEF2F2" },
          "100%": { outline: "0 solid rgba(239, 68, 68, 0)", backgroundColor: "transparent" },
        },
      },

      animation: {
        "fade-in": "fade-in 150ms cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-out": "fade-out 150ms cubic-bezier(0.4, 0, 1, 1)",
        "slide-in-right": "slide-in-right 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        "slide-out-right": "slide-out-right 200ms cubic-bezier(0.4, 0, 1, 1)",
        "dialog-in": "dialog-in 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        "dialog-out": "dialog-out 150ms cubic-bezier(0.4, 0, 1, 1)",
        shimmer: "shimmer-sm 1200ms linear infinite",
        "scan-flash-success": "scan-flash-success 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
        "scan-flash-danger": "scan-flash-danger 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
        "scan-shake": "scan-shake-sm 300ms cubic-bezier(0.4, 0, 0.2, 1) 1",
        "toast-slide-up": "toast-slide-up 200ms cubic-bezier(0.25, 1, 0.5, 1)",
        // Back-compat V1 alias
        shake: "scan-shake-sm 300ms cubic-bezier(0.4, 0, 0.2, 1) 1",
        "flash-success": "scan-flash-success 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
        "flash-danger": "scan-flash-danger 400ms cubic-bezier(0.25, 1, 0.5, 1) 1",
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
        shell: "220px 1fr", // AppShell V2
        "shell-collapsed": "0 1fr",
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
