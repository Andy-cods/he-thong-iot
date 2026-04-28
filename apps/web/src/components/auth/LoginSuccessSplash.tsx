"use client";

import * as React from "react";
import { Check } from "lucide-react";

/**
 * V3.2 — Cinematic splash khi login thành công.
 *
 * Animation timeline (~7400ms total):
 *   0ms     — overlay fade-in
 *   100ms   — logo scale-in spring + glow pulse breathing
 *   400ms   — checkmark badge bounce-in
 *   500ms   — brand text slide-up
 *   700ms   — welcome message slide-up
 *   900ms   — progress bar slide-up + bắt đầu fill
 *   900-7100ms — progress 0% → 100% with realtime counter, 4 milestones loaded
 *   7300ms  — exit animation (scale + fade)
 *   7400ms  — onComplete() callback
 *
 * Side effects:
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

const DEFAULT_DURATION = 3400;
const PROGRESS_START_DELAY = 900;
const EXIT_DURATION = 100;

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

  // Stage transitions
  React.useEffect(() => {
    const exitT = setTimeout(() => setStage("out"), durationMs - EXIT_DURATION);
    const completeT = setTimeout(() => onComplete(), durationMs);
    return () => {
      clearTimeout(exitT);
      clearTimeout(completeT);
    };
  }, [durationMs, onComplete]);

  // Progress counter — realtime tween từ 0 → 100% trong (durationMs - PROGRESS_START_DELAY - EXIT_DURATION)
  React.useEffect(() => {
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
  }, [durationMs]);

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
              ['--delay' as string]: `${0.4 + i * 0.02}s`,
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
            Smart Manufacturing Execution System
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
          animation: scanline-sweep 1.5s cubic-bezier(0.22, 1, 0.36, 1) 0.1s forwards;
        }
        .splash-scanline-2 {
          animation: scanline-sweep 1.5s cubic-bezier(0.22, 1, 0.36, 1) 1.7s forwards;
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
          animation: logo-pop 0.7s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
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
          animation: check-bounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) 0.4s both;
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
          animation: text-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
          opacity: 0;
        }
        .splash-welcome {
          animation: text-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.7s both;
          opacity: 0;
        }
        .splash-progress-section {
          animation: text-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.85s both;
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
          animation: particle-burst 1.2s cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both;
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
