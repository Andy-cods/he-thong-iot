"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginHero } from "@/components/auth/LoginHero";

/**
 * V3.2 — `/login` redesign full-bleed.
 *
 * Layout:
 *  - Desktop (lg ≥): hero ảnh full-screen 60% trái + form glassmorphism 40% phải
 *  - Mobile (< lg): hero ảnh background full screen, form overlay glassmorphism
 *    ở giữa với backdrop-blur cao để readable trên ảnh
 *
 * Animation:
 *  - Hero ảnh: fade-in zoom 1.12 → 1 trong 1.2s
 *  - Brand text: slide-in từ trên với stagger
 *  - Form card: slide-in từ phải (lg) hoặc fade-in (mobile)
 *  - Feature badges: slide-in từ trái với delay tăng dần
 */
export default function LoginPage() {
  return (
    <Suspense fallback={<LoginFallback />}>
      <LoginContent />
    </Suspense>
  );
}

function LoginFallback() {
  return (
    <div className="grid min-h-screen place-items-center bg-[#020617]">
      <Loader2 className="h-6 w-6 animate-spin text-cyan-400" aria-hidden />
    </div>
  );
}

function LoginContent() {
  return (
    <div className="relative grid min-h-screen grid-cols-1 bg-[#020617] lg:grid-cols-[1fr_420px] xl:grid-cols-[1fr_460px]">
      {/* Hero (left 60%) — full background */}
      <div className="relative h-full min-h-[40vh] lg:min-h-screen">
        <LoginHero />
      </div>

      {/* Form column (right 40%) */}
      <div className="relative flex min-h-screen flex-col bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#020617] lg:bg-none">
        {/* Background ambient glow chỉ cho lg */}
        <div className="pointer-events-none absolute inset-0 hidden bg-gradient-to-br from-[#0F172A] via-[#1E1B4B] to-[#020617] lg:block" />
        <div className="pointer-events-none absolute -right-32 top-1/4 hidden h-96 w-96 rounded-full bg-indigo-500/15 blur-3xl lg:block" />
        <div className="pointer-events-none absolute -left-20 bottom-10 hidden h-80 w-80 rounded-full bg-cyan-500/10 blur-3xl lg:block" />

        <div className="relative z-10 flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="login-card w-full max-w-[440px]">
            {/* Brand mark for mobile only */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 shadow-lg shadow-indigo-500/30">
                <svg viewBox="0 0 24 24" className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2L3 7v10l9 5 9-5V7l-9-5z" strokeLinejoin="round" />
                  <path d="M8 11l4 2 4-2M12 13v6" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <p className="text-lg font-bold tracking-tight text-white">MES SONG CHAU</p>
                <p className="text-xs text-cyan-200/80">Hệ thống điều hành sản xuất</p>
              </div>
            </div>

            {/* Heading */}
            <div className="mb-8">
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-400">
                Welcome back
              </p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-white sm:text-4xl">
                Đăng nhập
              </h1>
              <p className="mt-2 text-sm text-zinc-400">
                Truy cập hệ thống bằng tài khoản nội bộ của bạn.
              </p>
            </div>

            <LoginForm />

            <p className="mt-8 text-center text-xs text-zinc-500">
              Hệ thống dành cho nhân viên nội bộ. Mọi truy cập đều được ghi
              nhận trong audit log.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="relative z-10 shrink-0 border-t border-white/5 px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[440px] flex-col items-center justify-between gap-2 text-xs text-zinc-500 sm:flex-row">
            <BuildLine />
            <div className="flex items-center gap-4">
              <Link href="#" className="transition-colors hover:text-cyan-400">
                Chính sách bảo mật
              </Link>
              <Link href="#" className="transition-colors hover:text-cyan-400">
                Điều khoản
              </Link>
            </div>
          </div>
        </footer>
      </div>

      <style jsx>{`
        .login-card {
          animation: card-enter 0.8s cubic-bezier(0.22, 1, 0.36, 1) 0.3s both;
        }
        @keyframes card-enter {
          from {
            opacity: 0;
            transform: translateY(24px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </div>
  );
}

function BuildLine() {
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v0.1.0";
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
  const shortSha = sha.length > 7 ? sha.slice(0, 7) : sha;
  return (
    <span className="font-mono">
      MES SONG CHAU · {version} · build {shortSha}
    </span>
  );
}
