"use client";

import * as React from "react";
import { Check, Sparkles } from "lucide-react";

/**
 * V3.2 — Cinematic splash khi login thành công.
 *
 * Animation timeline (~1400ms total):
 *   0ms     — overlay fade-in từ transparent → black với backdrop-blur
 *   100ms   — logo scale-in 0.5 → 1 + glow pulse
 *   400ms   — checkmark bounce + ripple
 *   600ms   — welcome text slide-up + tên user fade-in
 *   900ms   — progress bar fill 0 → 100% trong 400ms
 *   1300ms  — toàn bộ fade-out + scale 1 → 1.05 cho cảm giác "zoom into dashboard"
 *   1400ms  — onComplete() callback → router.push
 *
 * Hiệu ứng phụ:
 *   - Particle burst 12 hạt từ logo center
 *   - Animated gradient background indigo → cyan
 *   - Subtle scanline scan từ trên xuống
 */
export interface LoginSuccessSplashProps {
  fullName?: string | null;
  username: string;
  onComplete: () => void;
  /** Override tổng duration (ms). Default 1400. */
  durationMs?: number;
}

export function LoginSuccessSplash({
  fullName,
  username,
  onComplete,
  durationMs = 1400,
}: LoginSuccessSplashProps) {
  const [stage, setStage] = React.useState<"in" | "out">("in");

  React.useEffect(() => {
    // Fade-out 100ms trước khi callback
    const exitT = setTimeout(() => setStage("out"), durationMs - 100);
    const completeT = setTimeout(() => onComplete(), durationMs);
    return () => {
      clearTimeout(exitT);
      clearTimeout(completeT);
    };
  }, [durationMs, onComplete]);

  const displayName = fullName || username;
  const greeting = getGreeting();

  return (
    <div
      className={`splash-overlay fixed inset-0 z-[9999] flex flex-col items-center justify-center overflow-hidden ${stage === "out" ? "splash-exit" : "splash-enter"}`}
      role="status"
      aria-live="polite"
    >
      {/* Animated background gradient */}
      <div className="splash-bg absolute inset-0" />

      {/* Scanline */}
      <div className="splash-scanline pointer-events-none absolute inset-x-0 top-0 h-[2px]" />

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
      <div className="relative z-10 flex flex-col items-center gap-6 text-center">
        {/* Logo + checkmark */}
        <div className="splash-logo-wrap relative">
          {/* Glow ring */}
          <div className="splash-glow-ring absolute inset-0 -m-4 rounded-full bg-gradient-to-r from-indigo-500/40 via-cyan-400/40 to-indigo-500/40 blur-2xl" />
          {/* Logo card */}
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
          {/* Success checkmark badge */}
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
          <p className="flex items-center justify-center gap-2 text-base text-zinc-300">
            <Sparkles className="h-4 w-4 text-amber-300" aria-hidden />
            {greeting},{" "}
            <span className="font-semibold text-white">{displayName}</span>
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            Đang khởi tạo workspace của bạn…
          </p>
        </div>

        {/* Progress bar */}
        <div className="splash-progress mt-2 h-1 w-64 overflow-hidden rounded-full bg-white/10">
          <div className="splash-progress-fill h-full rounded-full bg-gradient-to-r from-indigo-400 via-cyan-400 to-emerald-400" />
        </div>
      </div>

      <style jsx>{`
        /* Overlay enter / exit */
        .splash-overlay {
          background: rgba(2, 6, 23, 0);
          backdrop-filter: blur(0px);
          -webkit-backdrop-filter: blur(0px);
        }
        .splash-enter {
          animation: overlay-in 0.25s cubic-bezier(0.22, 1, 0.36, 1) forwards;
        }
        .splash-exit {
          animation: overlay-out 0.25s cubic-bezier(0.4, 0, 1, 1) forwards;
        }
        @keyframes overlay-in {
          from {
            background: rgba(2, 6, 23, 0);
            backdrop-filter: blur(0px);
            -webkit-backdrop-filter: blur(0px);
          }
          to {
            background: rgba(2, 6, 23, 0.96);
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

        /* Animated background gradient */
        .splash-bg {
          background:
            radial-gradient(ellipse at 30% 30%, rgba(99, 102, 241, 0.25) 0%, transparent 60%),
            radial-gradient(ellipse at 70% 70%, rgba(34, 211, 238, 0.2) 0%, transparent 60%),
            radial-gradient(ellipse at 50% 50%, rgba(2, 6, 23, 1) 0%, rgba(2, 6, 23, 1) 100%);
          animation: bg-shift 4s ease-in-out infinite alternate;
        }
        @keyframes bg-shift {
          0% {
            background-position: 0% 0%, 100% 100%, 50% 50%;
          }
          100% {
            background-position: 20% 20%, 80% 80%, 50% 50%;
          }
        }

        /* Scanline */
        .splash-scanline {
          background: linear-gradient(90deg, transparent, rgba(34, 211, 238, 0.8), transparent);
          box-shadow: 0 0 12px rgba(34, 211, 238, 0.6);
          animation: scanline-sweep 1.4s cubic-bezier(0.22, 1, 0.36, 1) forwards;
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

        /* Logo wrap — scale in + breath */
        .splash-logo-wrap {
          animation: logo-pop 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) 0.1s both;
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
          animation: logo-breathe 2s ease-in-out infinite alternate;
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
          animation: glow-pulse 2s ease-in-out infinite;
        }
        @keyframes glow-pulse {
          0%, 100% {
            opacity: 0.5;
            transform: scale(1);
          }
          50% {
            opacity: 0.8;
            transform: scale(1.1);
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

        /* Brand text */
        .splash-brand {
          animation: text-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.5s both;
          opacity: 0;
        }
        .splash-welcome {
          animation: text-up 0.6s cubic-bezier(0.22, 1, 0.36, 1) 0.7s both;
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

        /* Progress bar */
        .splash-progress {
          animation: text-up 0.4s cubic-bezier(0.22, 1, 0.36, 1) 0.85s both;
          opacity: 0;
        }
        .splash-progress-fill {
          width: 0%;
          animation: progress-fill 0.55s cubic-bezier(0.4, 0, 0.2, 1) 0.9s both;
          box-shadow: 0 0 12px rgba(99, 102, 241, 0.6);
        }
        @keyframes progress-fill {
          from {
            width: 0%;
          }
          to {
            width: 100%;
          }
        }

        /* Particle burst */
        .splash-particle {
          position: absolute;
          width: 4px;
          height: 4px;
          border-radius: 9999px;
          background: rgba(99, 241, 255, 0.95);
          box-shadow: 0 0 8px rgba(99, 241, 255, 0.8);
          opacity: 0;
          animation: particle-burst 0.8s cubic-bezier(0.22, 1, 0.36, 1) var(--delay) both;
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
            transform: rotate(var(--angle)) translateX(180px) scale(0.5);
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
          .splash-progress,
          .splash-progress-fill,
          .splash-particle,
          .splash-bg,
          .splash-scanline {
            animation: none !important;
          }
          .splash-overlay {
            background: rgba(2, 6, 23, 0.96);
            backdrop-filter: blur(20px);
          }
          .splash-progress-fill {
            width: 100%;
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
