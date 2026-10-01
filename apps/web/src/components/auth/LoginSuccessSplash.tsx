"use client";

import * as React from "react";
import { Check } from "lucide-react";

/**
 * V3.2 — Cinematic splash khi login thành công.
 *
 * V4.5 QA-E P3: rút tổng thời lượng xuống ≤1,2s (trước 3,4s — JSDoc cũ còn ghi
 * nhầm ~7400ms, lệch xa cả số thực 3400ms lẫn số hiện tại) + cho bấm/nhấn phím
 * bất kỳ để bỏ qua ngay, vì tài khoản dùng lại nhiều lần/ngày (kiosk,
 * operator) thấy cảnh này lặp lại là chậm. Mốc thời gian các giai đoạn tính
 * theo TỶ LỆ của hằng số bên dưới (`durationMs`/`PROGRESS_START_DELAY`/
 * `EXIT_DURATION`) — xem các hằng số đó thay vì số ms cứng để tránh lệch lại:
 *   0                        — overlay fade-in + logo/text slide-up (so le)
 *   PROGRESS_START_DELAY     — progress bar bắt đầu fill 0% → 100%
 *   durationMs - EXIT_DURATION — bắt đầu exit animation (scale + fade)
 *   durationMs               — onComplete() callback
 *
 * Tôn trọng `prefers-reduced-motion: reduce` — bỏ HẲN hiệu ứng (không render
 * overlay, không chạy timer) và gọi `onComplete()` ngay.
 *
 * Side effects (khi không ở chế độ reduced-motion):
 *   - 12 particles burst from logo center
 *   - Background animated radial gradient indigo + cyan
 *   - Scanline cyan sweep ×3 lần
 */
export interface LoginSuccessSplashProps {
  fullName?: string | null;
  username: string;
  onComplete: () => void;
  durationMs?: number;
}

/** V4.5 QA-E P3: ≤1200ms theo yêu cầu nghiệm thu (trước 3400ms). */
const DEFAULT_DURATION = 1100;
// Khớp với lúc ".splash-progress-section" (CSS bên dưới) hiện xong — nếu đổi
// 1 trong 2 bên thì đổi bên kia theo, không để progress bar chạy TRƯỚC khi
// khung chứa nó kịp fade-in.
const PROGRESS_START_DELAY = 350;
const EXIT_DURATION = 120;

const MILESTONES = [
  { pct: 18,  label: "Xác thực phiên đăng nhập",   key: "auth"     },
  { pct: 42,  label: "Tải hồ sơ người dùng & quyền", key: "profile" },
  { pct: 68,  label: "Đồng bộ dữ liệu BOM & kho",   key: "sync"    },
  { pct: 92,  label: "Khởi tạo workspace",          key: "init"    },
  { pct: 100, label: "Sẵn sàng",                    key: "ready"   },
];

export function LoginSuccessSplash({
  fullName,
  username,
  onComplete,
  durationMs = DEFAULT_DURATION,
}: LoginSuccessSplashProps) {
  const [stage, setStage] = React.useState<"in" | "out">("in");
  const [progress, setProgress] = React.useState(0);

  // V4.5 QA-E P3: đảm bảo onComplete chỉ gọi đúng 1 lần dù tới từ timer tự
  // nhiên HAY từ bấm/phím bỏ qua (2 đường có thể đua nhau).
  const completedRef = React.useRef(false);
  const complete = React.useCallback(() => {
    if (completedRef.current) return;
    completedRef.current = true;
    onComplete();
  }, [onComplete]);

  // V4.5 QA-E P3: tôn trọng prefers-reduced-motion — bỏ hẳn hiệu ứng, không
  // chạy timeline nào cả, chuyển trang ngay. Đọc 1 lần lúc mount (giá trị
  // không đổi trong vòng đời splash).
  const [reducedMotion] = React.useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );

  React.useEffect(() => {
    if (reducedMotion) complete();
  }, [reducedMotion, complete]);

  // Stage transitions
  React.useEffect(() => {
    if (reducedMotion) return;
    const exitT = setTimeout(() => setStage("out"), durationMs - EXIT_DURATION);
    const completeT = setTimeout(complete, durationMs);
    return () => {
      clearTimeout(exitT);
      clearTimeout(completeT);
    };
  }, [durationMs, reducedMotion, complete]);

  // Progress counter — realtime tween từ 0 → 100% trong (durationMs - PROGRESS_START_DELAY - EXIT_DURATION)
  React.useEffect(() => {
    if (reducedMotion) return;
    const startDelay = PROGRESS_START_DELAY;
    const fillDuration = durationMs - startDelay - EXIT_DURATION;
    let raf = 0;
    let startTs = 0;

    const tick = (ts: number) => {
      if (!startTs) startTs = ts;
      const elapsed = ts - startTs;
      // Easing: cubic out — nhanh đầu, chậm cuối
      const t = Math.min(1, elapsed / fillDuration);
      const eased = 1 - Math.pow(1 - t, 2.4);
      setProgress(Math.round(eased * 100));
      if (t < 1) raf = requestAnimationFrame(tick);
    };

    const startT = setTimeout(() => {
      raf = requestAnimationFrame(tick);
    }, startDelay);

    return () => {
      clearTimeout(startT);
      cancelAnimationFrame(raf);
    };
  }, [durationMs, reducedMotion]);

  // V4.5 QA-E P3: bấm/chạm/nhấn phím BẤT KỲ → bỏ qua splash ngay (vẫn giữ
  // animation thoát 120ms cho mượt, không cắt cụt hình).
  React.useEffect(() => {
    if (reducedMotion) return;
    const handleSkip = () => {
      if (completedRef.current) return;
      setStage("out");
      window.setTimeout(complete, EXIT_DURATION);
    };
    window.addEventListener("pointerdown", handleSkip);
    window.addEventListener("keydown", handleSkip);
    return () => {
      window.removeEventListener("pointerdown", handleSkip);
      window.removeEventListener("keydown", handleSkip);
    };
  }, [reducedMotion, complete]);

  if (reducedMotion) return null;

  const displayName = fullName || username;
  const greeting = getGreeting();
  const activeMilestone = MILESTONES.find((m) => progress < m.pct) ?? MILESTONES[MILESTONES.length - 1]!;

  return (
    <div
      className={`splash-overlay fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden ${stage === "out" ? "splash-exit" : "splash-enter"}`}
      role="status"
      aria-live="polite"
    >
      {/* Animated background gradient */}
      <div className="splash-bg absolute inset-0" />

      {/* Scanlines (3 sweeps) */}
      <div className="splash-scanline splash-scanline-1 pointer-events-none absolute inset-x-0 top-0 h-[2px]" />
      <div className="splash-scanline splash-scanline-2 pointer-events-none absolute inset-x-0 top-0 h-[2px]" />
      <div className="splash-scanline splash-scanline-3 pointer-events-none absolute inset-x-0 top-0 h-[2px]" />

      {/* Particle burst */}
      <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
        {Array.from({ length: 12 }).map((_, i) => (
          <span
            key={i}
            className="splash-particle"
            style={{
              ['--angle' as string]: `${i * 30}deg`,
              ['--delay' as string]: `${0.15 + i * 0.01}s`,
            }}
          />
        ))}
      </div>

      {/* Center content */}
      <div className="relative z-10 flex w-full max-w-[480px] flex-col items-center gap-7 px-8 text-center">
        {/* Logo + checkmark */}
        <div className="splash-logo-wrap relative">
          <div className="splash-glow-ring absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-indigo-500/40 via-cyan-400/40 to-indigo-500/40 blur-2xl" />
          <div className="splash-logo-card relative flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-indigo-500 via-blue-500 to-cyan-400 shadow-2xl shadow-indigo-500/50">
            <svg
              viewBox="0 0 32 32"
              className="h-12 w-12 text-white"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinejoin="round"
              strokeLinecap="round"
              aria-hidden
            >
              <path d="M16 3L4 9v14l12 6 12-6V9L16 3z" />
              <path d="M10 14l6 3 6-3M16 17v9" />
            </svg>
          </div>
          <div className="splash-check absolute -bottom-2 -right-2 flex h-9 w-9 items-center justify-center rounded-full bg-emerald-500 shadow-lg shadow-emerald-500/50 ring-4 ring-[#020617]">
            <Check className="h-5 w-5 text-white" strokeWidth={3} aria-hidden />
          </div>
        </div>

        {/* Brand */}
        <div className="splash-brand">
          <h1 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">
            MES SONG CHAU
          </h1>
          <p className="mt-1.5 text-xs font-semibold uppercase tracking-[0.25em] text-cyan-300/90">
            Hệ thống điều hành sản xuất thông minh
          </p>
        </div>

        {/* Welcome text */}
        <div className="splash-welcome">
          <p className="text-lg text-zinc-200">
            {greeting},{" "}
            <span className="font-semibold text-white">{displayName}</span>
          </p>
          <p className="mt-1.5 text-sm text-zinc-400">
            Đang khởi tạo workspace của bạn…
          </p>
        </div>

        {/* Progress section */}
        <div className="splash-progress-section mt-2 w-full">
          {/* Header: % + active task */}
          <div className="mb-2.5 flex items-baseline justify-between gap-3 px-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-zinc-500 truncate">
              {activeMilestone.label}
            </span>
            <span className="font-mono text-2xl font-bold tabular-nums text-white">
              {progress}
              <span className="text-base text-cyan-400">%</span>
            </span>
          </div>

          {/* Bar */}
          <div className="splash-progress-bar relative h-1.5 w-full overflow-hidden rounded-full bg-white/10 backdrop-blur-sm">
            {/* Fill */}
            <div
              className="splash-progress-fill absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400 transition-[width] duration-100 ease-linear"
              style={{ width: `${progress}%` }}
            />
            {/* Glow leading edge */}
            <div
              className="splash-progress-glow absolute inset-y-0 -translate-x-1/2 rounded-full bg-cyan-300 blur-md"
              style={{
                width: "20px",
                left: `${progress}%`,
                opacity: progress > 1 && progress < 100 ? 0.9 : 0,
                transition: "left 0.1s linear, opacity 0.3s",
              }}
            />
            {/* Shimmer */}
            <div className="splash-progress-shimmer absolute inset-y-0 w-full" />
          </div>

          {/* Milestone dots */}
          <div className="mt-3 flex justify-between px-0.5">
            {MILESTONES.slice(0, -1).map((m) => {
              const reached = progress >= m.pct;
              return (
                <div
                  key={m.key}
                  className={`milestone-dot flex h-2 w-2 items-center justify-center rounded-full transition-all duration-300 ${
                    reached
                      ? "bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] scale-110"
                      : "bg-white/15"
                  }`}
                  aria-label={m.label}
                />
              );
            })}
          </div>
        </div>

        {/* V4.5 QA-E P3: gợi ý có thể bỏ qua — tránh cảm giác "bị kẹt" chờ. */}
        <p className="splash-skip-hint text-[11px] text-zinc-500">
          Bấm hoặc nhấn phím bất kỳ để bỏ qua
        </p>
      </div>

      <style jsx>{`
        .splash-overlay {
          background: rgba(2, 6, 23, 0);
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
        }
        .splash-enter {
          animation: overlay-in 0.3s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .splash-exit {
          animation: overlay-out 0.3s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes overlay-in {
          from {
            background: rgba(2, 6, 23, 0);
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
          }
          to {
            background: rgba(2, 6, 23, 0.97);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
          }
        }
        @keyframes overlay-out {
          0% {
            opacity: 1;
            transform: scale(1);
          }
          100% {
            opacity: 0;
            transform: scale(1.05);
          }
        }

        .splash-bg {
          background:
            radial-gradient(ellipse at 30% 30%, rgba(99, 102, 241, 0.28) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 70%, rgba(34, 211, 238, 0.22) 0%, transparent 60%),
            radial-gradient(ellipse at 50% 50%, rgba(2, 6, 23, 1) 0%, rgba(2, 6, 23, 1) 100%);
          animation: bg-shift 8s ease-in-out infinite alternate;
        }
        @keyframes bg-shift {
          0% {
            background-position: 0% 0%, 100% 100%, 50% 50%;
          }
          100% {
            background-position: 25% 25%, 75% 75%, 50% 50%;
          }
        }

        .splash-scanline {
          background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.85), transparent);
          box-shadow: 0 0 14px rgba(34, 211, 238, 0.7);
          opacity: 0;
        }
        .splash-scanline-1 {
          animation: scanline-sweep 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.05s forwards;
        }
        /* V4.5 QA-E P3: splash rút còn ~1.1s — bỏ sweep thứ 2 (trước delay
           1.7s, dài hơn CẢ tổng thời lượng splash mới, sẽ không kịp chạy). */
        .splash-scanline-2 {
          animation: none;
        }
        .splash-scanline-3 {
          animation: none;
        }
        @keyframes scanline-sweep {
          0% {
            transform: translateY(0);
            opacity: 0;
          }
          15% {
            opacity: 1;
          }
          100% {
            transform: translateY(100vh);
            opacity: 0;
          }
        }

        .splash-logo-wrap {
          animation: logo-pop 0.35s cubic-bezier(0.34, 1.56, 0.64, 1) 0.05s both;
        }
        @keyframes logo-pop {
          from {
            opacity: 0;
            transform: scale(0.4) rotate(-12deg);
          }
          to {
            opacity: 1;
            transform: scale(1) rotate(0deg);
          }
        }

        .splash-logo-card {
          animation: logo-breathe 3s ease-in-out infinite alternate;
        }
        @keyframes logo-breathe {
          from {
            box-shadow:
              0 0 30px rgba(99, 102, 241, 0.5),
              0 10px 40px rgba(99, 102, 241, 0.4);
          }
          to {
            box-shadow:
              0 0 50px rgba(34, 211, 238, 0.6),
              0 10px 60px rgba(34, 211, 238, 0.5);
          }
        }

        .splash-glow-ring {
          animation: glow-pulse 3s ease-in-out infinite;
        }
        @keyframes glow-pulse {
          0%, 100% {
            opacity: 0.4;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.12);
          }
        }

        .splash-check {
          animation: check-bounce 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) 0.15s both;
        }
        @keyframes check-bounce {
          from {
            opacity: 0;
            transform: scale(0);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }

        .splash-brand {
          animation: text-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.2s both;
          opacity: 0;
        }
        .splash-welcome {
          animation: text-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.28s both;
          opacity: 0;
        }
        /* V4.5 QA-E P3: khớp PROGRESS_START_DELAY (JS) — xem comment cạnh
           hằng số đó. */
        .splash-progress-section {
          animation: text-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.35s both;
          opacity: 0;
        }
        .splash-skip-hint {
          animation: text-up 0.3s cubic-bezier(0.22, 1, 0.36, 1) 0.1s both;
          opacity: 0;
        }
        @keyframes text-up {
          from {
            opacity: 0;
            transform: translateY(16px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .splash-progress-fill {
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
        }
        .splash-progress-shimmer {
          background: linear-gradient(
            90deg,
            transparent,
            rgba(255, 255, 255, 0.18),
            transparent
          );
          animation: shimmer 2s linear infinite;
        }
        @keyframes shimmer {
          0% {
            transform: translateX(-100%);
          }
          100% {
            transform: translateX(100%);
          }
        }

        .splash-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: rgba(99, 241, 255, 0.95);
          box-shadow: 0 0 8px rgba(99, 241, 255, 0.8);
          opacity: 0;
          animation: particle-burst 0.5s cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both;
        }
        @keyframes particle-burst {
          0% {
            opacity: 0;
            transform: rotate(var(--angle)) translateX(0) scale(0);
          }
          15% {
            opacity: 1;
            transform: rotate(var(--angle)) translateX(20px) scale(1);
          }
          100% {
            opacity: 0;
            transform: rotate(var(--angle)) translateX(220px) scale(0.4);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .splash-enter,
          .splash-exit,
          .splash-logo-wrap,
          .splash-logo-card,
          .splash-glow-ring,
          .splash-check,
          .splash-brand,
          .splash-welcome,
          .splash-progress-section,
          .splash-progress-shimmer,
          .splash-particle,
          .splash-bg,
          .splash-scanline {
            animation: none !important;
          }
          .splash-overlay {
            background: rgba(2, 6, 23, 0.97);
            backdrop-filter: blur(20px);
          }
        }
      `}</style>
    </div>
  );
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 11) return "Chào buổi sáng";
  if (h < 14) return "Chúc buổi trưa";
  if (h < 18) return "Chào buổi chiều";
  return "Chào buổi tối";
}
