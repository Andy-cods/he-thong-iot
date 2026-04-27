"use client";

import * as React from "react";
import Image from "next/image";

/**
 * V3.2 — LoginHero full-screen image background.
 *
 * Ảnh smart factory MES SONG CHAU (1.5MB, 1500×1000+ ratio) đặt tại
 * /public/login-hero.png. Component này render ảnh full-cover với:
 *   - Fade-in zoom 1.12 → 1 trong 1.2s khi mount
 *   - Parallax tilt nhẹ theo mouse position (desktop)
 *   - Animated data dots (cyan + amber) blink ngẫu nhiên overlay
 *   - Feature badges glassmorphism slide-in từ trái với delay stagger
 *   - Vignette gradient phải để fade sang form column
 */
export function LoginHero() {
  const heroRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    let raf = 0;
    const handleMove = (e: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const rect = el.getBoundingClientRect();
        const x = (e.clientX - rect.left) / rect.width - 0.5;
        const y = (e.clientY - rect.top) / rect.height - 0.5;
        el.style.setProperty("--shift-x", `${x * 12}px`);
        el.style.setProperty("--shift-y", `${y * 8}px`);
      });
    };
    const handleLeave = () => {
      el.style.setProperty("--shift-x", "0px");
      el.style.setProperty("--shift-y", "0px");
    };
    el.addEventListener("mousemove", handleMove);
    el.addEventListener("mouseleave", handleLeave);
    return () => {
      el.removeEventListener("mousemove", handleMove);
      el.removeEventListener("mouseleave", handleLeave);
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <div
      ref={heroRef}
      className="login-hero relative h-full w-full overflow-hidden bg-[#020617]"
      aria-label="MES Song Châu — Hệ thống điều hành sản xuất thông minh"
    >
      {/* Background image — fade-in zoom + parallax shift */}
      <div
        className="absolute inset-0 will-change-transform"
        style={{
          transform: "translate3d(var(--shift-x, 0), var(--shift-y, 0), 0)",
          transition: "transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      >
        <Image
          src="/login-hero.png"
          alt=""
          fill
          priority
          quality={92}
          sizes="(max-width: 1024px) 100vw, 70vw"
          className="login-hero-img object-cover object-center"
          style={{ filter: "brightness(1.12) saturate(1.05)" }}
        />
      </div>

      {/* Vignette overlays — V3.2.1 giảm độ đậm để ảnh sáng hơn */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-transparent to-[#020617]/25" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-[#020617]/40" />

      {/* Brightness boost overlay */}
      <div className="pointer-events-none absolute inset-0 bg-white/[0.04] mix-blend-overlay" />

      {/* Animated data dots */}
      <div className="pointer-events-none absolute inset-0 z-10">
        <span className="data-dot" style={{ top: "18%", left: "22%", animationDelay: "0.3s" }} />
        <span className="data-dot" style={{ top: "32%", left: "48%", animationDelay: "0.9s" }} />
        <span className="data-dot" style={{ top: "55%", left: "15%", animationDelay: "1.6s" }} />
        <span className="data-dot" style={{ top: "70%", left: "58%", animationDelay: "0.5s" }} />
        <span className="data-dot data-dot-amber" style={{ top: "42%", left: "68%", animationDelay: "1.2s" }} />
        <span className="data-dot" style={{ top: "82%", left: "30%", animationDelay: "2.0s" }} />
        <span className="data-dot data-dot-amber" style={{ top: "12%", left: "62%", animationDelay: "0.7s" }} />
      </div>

      {/* Feature badges bottom-left */}
      <div className="absolute bottom-12 left-12 z-20 hidden flex-col gap-3 lg:flex">
        <FeatureBadge index={0} label="Real-time OEE & Production Tracking" />
        <FeatureBadge index={1} label="BOM-centric · Atomic Receiving · QC Flow" />
        <FeatureBadge index={2} label="PWA · Offline-capable barcode scan" />
      </div>

      {/* Build line bottom-right */}
      <div className="absolute bottom-4 right-6 z-20 font-mono text-[10px] tracking-wider text-white/40">
        v1.0 · MES SONG CHAU
      </div>

      <style jsx>{`
        :global(.login-hero-img) {
          animation: hero-zoom-in 1.2s cubic-bezier(0.22, 1, 0.36, 1) both;
        }
        @keyframes hero-zoom-in {
          from {
            opacity: 0;
            transform: scale(1.12);
          }
          to {
            opacity: 1;
            transform: scale(1);
          }
        }
        .data-dot {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 9999px;
          background: rgba(99, 241, 255, 0.95);
          box-shadow:
            0 0 8px rgba(99, 241, 255, 0.8),
            0 0 16px rgba(99, 241, 255, 0.5);
          animation: dot-blink 2.4s ease-in-out infinite;
        }
        .data-dot-amber {
          background: rgba(252, 211, 77, 0.95);
          box-shadow:
            0 0 8px rgba(252, 211, 77, 0.8),
            0 0 16px rgba(252, 211, 77, 0.5);
        }
        @keyframes dot-blink {
          0%, 100% {
            opacity: 0.2;
            transform: scale(0.8);
          }
          50% {
            opacity: 1;
            transform: scale(1.2);
          }
        }
      `}</style>
    </div>
  );
}

function FeatureBadge({ label, index }: { label: string; index: number }) {
  return (
    <div
      className="feature-badge inline-flex items-center gap-2.5 rounded-full border border-white/15 bg-white/10 px-4 py-2 text-xs font-medium text-white backdrop-blur-md"
      style={{ animationDelay: `${0.6 + index * 0.15}s` }}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
      {label}
      <style jsx>{`
        .feature-badge {
          animation: badge-slide-in 0.8s cubic-bezier(0.22, 1, 0.36, 1) both;
          opacity: 0;
        }
        @keyframes badge-slide-in {
          from {
            opacity: 0;
            transform: translateX(-24px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>
    </div>
  );
}
