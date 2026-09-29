import type { Config } from "tailwindcss";

// Design tokens V4.3 — "Apple-inspired" (Hướng B, chốt 2026-09-30).
// Nguồn: plans/v4.3-design/APPLE_DESIGN_SYSTEM.md (§3 chức năng phụ, §4 wireframe —
// DÙNG; §2 token GIỮ INDIGO/13px — BỎ QUA, thay bằng hệ dưới đây theo mẫu đã duyệt
// `huong-giao-dien.html` mock `.B`).
// Chiến lược remap: SỬA GIÁ TRỊ HEX của các key màu đã dùng khắp app (indigo, blue,
// emerald, amber, red, zinc) thay vì đổi tên class hàng trăm file — mọi
// `text-indigo-600`, `bg-emerald-50`, `text-zinc-500`... tự động hiển thị đúng tông
// Apple mà KHÔNG cần sửa từng component gọi màu.
// - accent: xanh hệ thống Apple `#0071E3` (thay indigo-600/blue-600 cũ — CẢ 2 palette
//   `indigo` và `blue` đều trỏ về cùng 1 thang xanh này để toàn app chỉ còn 1 màu nhấn).
// - semantic: xanh lá `#34C759` (emerald), cam `#FF9F0A` (amber), đỏ `#FF3B30` (red).
// - zinc: nền trang `#F5F5F7`, chữ chính `#1D1D1F`, chữ phụ `#86868B`, bề mặt tối
//   `#2C2C2E`, nền tối `#000000` — xem `docs/design-guidelines.md` khi tạo.
// Typography: Inter (fallback có dấu tiếng Việt) sau -apple-system/SF Pro/Segoe UI Variable.
// Breakpoints: sm 375 · md 768 · lg 1024 · xl 1280 · tv 1920.
// `orange` (safety-orange `#F97316`) KHÔNG đổi — semantic "thiếu hàng" riêng biệt với
// amber/warning, giữ nguyên để không lẫn 2 ý nghĩa.

export default {
  darkMode: ["class", '[data-theme="dark"]'], // Reserve V2.1 — không toggle V2.0
  content: [
    "./src/**/*.{ts,tsx,mdx}",
    "./src/components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // Zinc (neutral) — Apple systemGray scale. Anchors bắt buộc theo mẫu đã
        // duyệt: 50=#F5F5F7 (nền trang), 500=#86868B (chữ phụ), 900=#1D1D1F (chữ
        // chính, cũng dùng làm bề mặt tối), 800=#2C2C2E (bề mặt tối), 950=#000 (nền
        // tối). Các bậc còn lại nội suy đơn điệu để không phá tương phản viền/hover.
        zinc: {
          50: "#F5F5F7",
          100: "#EDEDEF",
          200: "#E2E2E4",
          300: "#D1D1D6",
          400: "#AEAEB2",
          500: "#86868B",
          600: "#6E6E73",
          700: "#48484A",
          800: "#2C2C2E",
          900: "#1D1D1F",
          950: "#000000",
        },

        // Blue — CÙNG thang Apple system blue với `indigo` (xem dưới). Trước đây
        // là 1 xanh khác (link/info) tách biệt khỏi accent indigo; nay hợp nhất
        // còn 1 màu nhấn duy nhất kiểu Apple (link, selected-state, accent đều
        // cùng 1 xanh #0071E3).
        blue: {
          50: "#E6F1FC",
          100: "#CCE3F9",
          200: "#A6CDF5",
          300: "#80B8F1",
          400: "#59A3ED",
          500: "#2686E7",
          600: "#0071E3",
          700: "#0060C2",
          800: "#004994",
          900: "#003366",
          950: "#001F40",
        },

        // Indigo — accent chính, remap sang Apple system blue #0071E3 (light) /
        // #0A84FF (dark, xem `--accent` trong globals.css). Cùng ramp với `blue`
        // ở trên — mọi `bg-indigo-*`/`text-indigo-*`/`ring-indigo-*` có sẵn khắp
        // app (button primary, StatusPill progress, focus ring, badge...) tự
        // động hiển thị đúng xanh Apple mà không cần sửa từng file.
        indigo: {
          50:  "#E6F1FC",
          100: "#CCE3F9",
          200: "#A6CDF5",
          300: "#80B8F1",
          400: "#59A3ED",
          500: "#2686E7",
          600: "#0071E3",
          700: "#0060C2",
          800: "#004994",
          900: "#003366",
          950: "#001F40",
        },

        // Semantic — Apple systemGreen/systemOrange/systemRed.
        emerald: {
          50: "#E9F9ED",
          100: "#D1F2D9",
          200: "#A3E6B4",
          300: "#75D890",
          400: "#52CD70",
          500: "#34C759",
          600: "#2CA84B",
          700: "#23863C",
          800: "#1B652E",
          900: "#134620",
          950: "#0A2A13",
        },
        amber: {
          50: "#FFF4E0",
          100: "#FFE7C2",
          200: "#FFD08A",
          300: "#FFB852",
          400: "#FFAA2E",
          500: "#FF9F0A",
          600: "#D9860A",
          700: "#B36C08",
          800: "#8A5306",
          900: "#603A04",
          950: "#3D2502",
        },
        red: {
          50: "#FFECEB",
          100: "#FFD5D2",
          200: "#FFAEA8",
          300: "#FF8880",
          400: "#FF6259",
          500: "#FF3B30",
          600: "#E62E24",
          700: "#B8241C",
          800: "#8A1B15",
          900: "#5C120E",
          950: "#3D0C09",
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

        // Aliases — Apple system blue accent
        accent: {
          DEFAULT: "#0071E3",   // Apple system blue (indigo-600)
          hover:   "#0060C2",   // indigo-700
          press:   "#004994",   // indigo-800
          soft:    "#E6F1FC",   // indigo-50
          ring:    "rgba(0, 113, 227, 0.35)",
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
          DEFAULT: "#1D1D1F",
          ink: "#1D1D1F",
          steel: "#48484A",
          mist: "#E2E2E4",
        },
        cta: {
          DEFAULT: "#0071E3",
          hover:   "#0060C2",
          press:   "#004994",
          soft:    "#E6F1FC",
        },
        success: { DEFAULT: "#34C759", strong: "#23863C", soft: "#E9F9ED" },
        warning: { DEFAULT: "#FF9F0A", strong: "#B36C08", soft: "#FFF4E0" },
        danger: { DEFAULT: "#FF3B30", strong: "#B8241C", soft: "#FFECEB" },
        info: { DEFAULT: "#0EA5E9", strong: "#0369A1", soft: "#F0F9FF" },
        scan: {
          "flash-success": "#E9F9ED",
          "flash-danger": "#FFECEB",
        },
        zebra: "#EDEDEF",
        "border-focus": "#0071E3",
      },

      fontFamily: {
        // Apple system stack trước — Inter làm fallback (đủ dấu tiếng Việt) khi
        // không chạy trên macOS/iOS/Windows mới (Segoe UI Variable).
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Text"',
          '"Segoe UI Variable"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "sans-serif",
        ],
        heading: [
          "-apple-system",
          "BlinkMacSystemFont",
          '"SF Pro Display"',
          '"Segoe UI Variable"',
          "Inter",
          "ui-sans-serif",
          "system-ui",
        ],
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
        sm: "4px",       // badge/chip nhỏ — không đổi
        DEFAULT: "6px",
        md: "6px",       // không đổi
        lg: "10px",      // MỚI 8→10px — control (button/input/select), theo mẫu Apple "bo 10-12px"
        xl: "14px",      // MỚI — bề mặt/thẻ trắng, Sheet/Dialog/Popover/Dropdown ("bo 12-14px")
        full: "9999px",
      },

      boxShadow: {
        // Shadow rất nhẹ kiểu Apple — viền/nền tách khối thay vì đổ bóng đậm.
        xs: "0 1px 2px rgba(0, 0, 0, 0.04)",
        sm: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 4px 12px rgba(0, 0, 0, 0.06)",
        lg: "0 16px 48px rgba(0, 0, 0, 0.12)",
        toast: "0 8px 24px rgba(0, 0, 0, 0.10)",
        // Back-compat aliases
        pop: "0 4px 12px rgba(0, 0, 0, 0.06)",
        dialog: "0 16px 48px rgba(0, 0, 0, 0.12)",
        focus: "0 0 0 2px rgba(0, 113, 227, 0.5)",
        "focus-strong": "0 0 0 3px rgba(0, 96, 194, 0.5)",
        card:       "0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)",
        "card-hover": "0 4px 12px rgba(0,113,227,0.10), 0 1px 3px rgba(0,0,0,0.06)",
        "scan-success": "0 0 0 3px rgba(52, 199, 89, 0.5)",
        "scan-error": "0 0 0 3px rgba(255, 59, 48, 0.5)",
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
          "0%": { outline: "0 solid rgba(52, 199, 89, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(52, 199, 89, 0.5)", backgroundColor: "#E9F9ED" },
          "100%": { outline: "0 solid rgba(52, 199, 89, 0)", backgroundColor: "transparent" },
        },
        "scan-flash-danger": {
          "0%": { outline: "0 solid rgba(255, 59, 48, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(255, 59, 48, 0.5)", backgroundColor: "#FFECEB" },
          "100%": { outline: "0 solid rgba(255, 59, 48, 0)", backgroundColor: "transparent" },
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
          "0%": { outline: "0 solid rgba(52, 199, 89, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(52, 199, 89, 0.5)", backgroundColor: "#E9F9ED" },
          "100%": { outline: "0 solid rgba(52, 199, 89, 0)", backgroundColor: "transparent" },
        },
        "flash-danger": {
          "0%": { outline: "0 solid rgba(255, 59, 48, 0)", backgroundColor: "transparent" },
          "30%": { outline: "3px solid rgba(255, 59, 48, 0.5)", backgroundColor: "#FFECEB" },
          "100%": { outline: "0 solid rgba(255, 59, 48, 0)", backgroundColor: "transparent" },
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
        // V4.1 UI-X1: trả `sm` về mặc định Tailwind 640px. Trước đây 375px làm mọi
        // `sm:*` (viết theo nghĩa 640) kích hoạt ngay trên điện thoại 390px →
        // nhãn nút `hidden sm:inline` vẫn hiện, lưới 2 cột bị bóp.
        // (Không thêm `xs` — 0 chỗ dùng; thêm vào `extend` sẽ bị xếp SAU 2xl.)
        sm: "640px",
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
