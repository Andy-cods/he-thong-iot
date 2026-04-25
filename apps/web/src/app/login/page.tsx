"use client";

import * as React from "react";
import { Suspense } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { LoginForm } from "@/components/auth/LoginForm";
import { LoginHero } from "@/components/auth/LoginHero";

/**
 * V1.8 `/login` — redesign 2-column hero + form.
 *
 * Layout:
 *  - Desktop (lg ≥): left hero (gradient indigo + features) 50% + right form
 *    card 50%.
 *  - Mobile (< lg): hero thu thành banner top 120px, form full-width bên dưới.
 *
 * Logic auth KHÔNG thay đổi — xem `LoginForm.tsx`:
 *  - POST `/api/auth/login`
 *  - Redirect `next` param hoặc `/bom` (landing mới)
 *  - 401/423/429 handled với countdown Retry-After
 *  - mustChangePassword check đã nằm ở RSC layout `(app)` nên client chỉ
 *    push tới nextPath, server sẽ tự redirect nếu cần đổi mật khẩu.
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
    <div className="grid min-h-screen place-items-center bg-white">
      <Loader2
        className="h-5 w-5 animate-spin text-zinc-400"
        aria-hidden="true"
      />
    </div>
  );
}

function LoginContent() {
  return (
    <div className="grid min-h-screen grid-cols-1 bg-white lg:grid-cols-2">
      {/* Mobile hero banner — compact */}
      <div className="relative h-[140px] overflow-hidden bg-gradient-to-br from-indigo-600 via-indigo-700 to-indigo-900 px-6 py-5 text-white lg:hidden">
        <svg
          className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.1]"
          viewBox="0 0 400 120"
          fill="none"
          aria-hidden="true"
        >
          <defs>
            <pattern
              id="login-hero-dots-mobile"
              x="0"
              y="0"
              width="20"
              height="20"
              patternUnits="userSpaceOnUse"
            >
              <circle cx="1" cy="1" r="1" fill="currentColor" />
            </pattern>
          </defs>
          <rect width="400" height="120" fill="url(#login-hero-dots-mobile)" />
        </svg>
        <div className="relative z-10 flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-md bg-white/15 ring-1 ring-white/25"
            aria-hidden="true"
          >
            <span className="text-sm font-semibold text-white">SC</span>
          </div>
          <div>
            <p className="text-lg font-semibold text-white">Song Châu MES</p>
            <p className="text-xs text-indigo-100/80">
              Hệ thống điều hành sản xuất BOM-centric
            </p>
          </div>
        </div>
      </div>

      {/* Desktop hero (left 50%) */}
      <div className="hidden lg:block">
        <LoginHero />
      </div>

      {/* Form column (right 50%) */}
      <div className="flex min-h-screen flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-[420px] animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight text-zinc-900">
                Đăng nhập
              </h2>
              <p className="mt-1.5 text-sm text-zinc-500">
                Dùng tài khoản nội bộ để truy cập hệ thống MES.
              </p>
            </div>

            <LoginForm />

            <p className="mt-8 text-center text-xs text-zinc-400">
              Hệ thống dành cho nhân viên nội bộ. Mọi truy cập đều được ghi
              nhận trong audit log.
            </p>
          </div>
        </div>

        {/* Footer */}
        <footer className="shrink-0 border-t border-zinc-100 px-5 py-4 sm:px-8">
          <div className="mx-auto flex max-w-[420px] flex-col items-center justify-between gap-2 text-xs text-zinc-400 sm:flex-row">
            <BuildLine />
            <div className="flex items-center gap-4">
              <Link
                href="#"
                className="transition-colors hover:text-zinc-700"
              >
                Chính sách bảo mật
              </Link>
              <Link
                href="#"
                className="transition-colors hover:text-zinc-700"
              >
                Điều khoản
              </Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}

/**
 * BuildLine — hiển thị "Song Châu MES · v{VERSION} · build {SHA7}".
 * Đọc env vars `NEXT_PUBLIC_BUILD_VERSION` + `NEXT_PUBLIC_BUILD_SHA` (set ở
 * CI/Docker build). Fallback `dev` nếu chạy local.
 */
function BuildLine() {
  const version = process.env.NEXT_PUBLIC_BUILD_VERSION || "v0.1.0";
  const sha = process.env.NEXT_PUBLIC_BUILD_SHA || "dev";
  const shortSha = sha.length > 7 ? sha.slice(0, 7) : sha;
  return (
    <span className="font-mono">
      Song Châu MES · {version} · build {shortSha}
    </span>
  );
}
