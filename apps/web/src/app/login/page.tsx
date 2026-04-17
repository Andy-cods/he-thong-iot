"use client";

import * as React from "react";
import { Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoginHero } from "@/components/login/LoginHero";
import { BuildInfo } from "@/components/login/BuildInfo";
import { cn } from "@/lib/utils";

/**
 * V2 `/login` page (design-spec §2.1) — Linear split 50/50 refined.
 *
 * Delta V1: hero bg slate-900 → zinc-900; form max-w 420→400; title 24 bold
 * → 20 semibold; input h-10→h-9; button safety-orange → blue-500 h-9; error
 * alert red-50 soft border với icon.
 *
 * Logic: giữ 100% V1 — Suspense wrap useSearchParams, POST /api/auth/login,
 * router.push(next) + refresh, rememberMe checkbox, keyboard Escape clear pw.
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
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [showPassword, setShowPassword] = React.useState(false);
  const [rememberMe, setRememberMe] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!username.trim()) {
      setError("Vui lòng nhập tài khoản.");
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      setError("Vui lòng nhập mật khẩu.");
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password, rememberMe }),
      });
      const json = (await res.json().catch(() => ({}))) as
        | { user: { username: string } }
        | { error: { message: string } }
        | Record<string, never>;

      if (!res.ok || (typeof json === "object" && "error" in json)) {
        const msg =
          typeof json === "object" && "error" in json
            ? json.error.message
            : res.status === 429
              ? "Đã khoá tạm thời — thử lại sau vài phút."
              : "Sai tài khoản hoặc mật khẩu.";
        setError(msg);
        setPassword("");
        passwordRef.current?.focus();
        return;
      }
      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Lỗi kết nối — vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="grid min-h-screen grid-cols-1 lg:grid-cols-2">
      {/* Hero (desktop only) */}
      <div className="hidden lg:block">
        <LoginHero />
      </div>

      {/* Form */}
      <div className="relative flex min-h-screen flex-col bg-white">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-[400px]">
            {/* Brand mobile (ẩn khi lg+ vì hero đã có) */}
            <div className="mb-6 flex items-center gap-2 lg:hidden">
              <div className="flex h-8 w-8 items-center justify-center rounded-sm bg-zinc-900">
                <span className="font-heading text-sm font-semibold text-white">
                  CN
                </span>
              </div>
              <div>
                <p className="text-base font-semibold text-zinc-900">
                  MES Xưởng Cơ Khí
                </p>
                <p className="text-sm text-zinc-500">BOM-centric</p>
              </div>
            </div>

            <div className="rounded-lg border border-zinc-200 bg-white p-6">
              <h2 className="text-xl font-semibold tracking-tight text-zinc-900">
                Đăng nhập
              </h2>
              <p className="mt-1 text-sm text-zinc-500">
                Dùng tài khoản nội bộ để vào hệ thống.
              </p>

              <form
                onSubmit={onSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setPassword("");
                  }
                }}
                className="mt-5 flex flex-col gap-4"
                noValidate
              >
                <div>
                  <Label
                    htmlFor="username"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-700"
                  >
                    Tài khoản
                  </Label>
                  <Input
                    ref={usernameRef}
                    id="username"
                    name="username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="off"
                    spellCheck={false}
                    required
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    disabled={loading}
                    className="h-9"
                  />
                </div>

                <div>
                  <Label
                    htmlFor="password"
                    className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-zinc-700"
                  >
                    Mật khẩu
                  </Label>
                  <div className="relative">
                    <Input
                      ref={passwordRef}
                      id="password"
                      name="password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-9 pr-9"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      aria-label={
                        showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                      }
                      aria-pressed={showPassword}
                      className={cn(
                        "absolute inset-y-0 right-0 inline-flex w-9 items-center justify-center text-zinc-500",
                        "focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500",
                        "hover:text-zinc-700",
                      )}
                      tabIndex={0}
                    >
                      {showPassword ? (
                        <EyeOff className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-zinc-700">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                    disabled={loading}
                    className="h-3.5 w-3.5"
                  />
                  <span>Ghi nhớ đăng nhập (7 ngày)</span>
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="flex items-start gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-700"
                  >
                    <AlertCircle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    <span>{error}</span>
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-9 w-full"
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="h-3.5 w-3.5 animate-spin"
                        aria-hidden="true"
                      />
                      Đang xác thực…
                    </>
                  ) : (
                    "Đăng nhập"
                  )}
                </Button>

                <p className="pt-1 text-center text-xs text-zinc-500">
                  Quên mật khẩu? Liên hệ IT nội bộ.
                </p>
              </form>
            </div>
          </div>
        </div>

        {/* Build info footer */}
        <div className="shrink-0 px-4 py-4">
          <BuildInfo />
        </div>
      </div>
    </div>
  );
}
