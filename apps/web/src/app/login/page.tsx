"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { LoginHero } from "@/components/login/LoginHero";
import { BuildInfo } from "@/components/login/BuildInfo";
import { cn } from "@/lib/utils";

/**
 * Direction B — `/login` page (design-spec §2.1).
 *
 * - Split 50/50 desktop (lg+): hero trái slate-900 + form phải center.
 * - Mobile: hero ẩn, form full-width.
 * - Focus ring dùng `shadow-focus` (Input primitive đã apply).
 * - Keyboard: Tab order natural (username → password → toggle → remember →
 *   submit → forgot), Enter submit, Escape clear password.
 * - POST `/api/auth/login` → redirect `?next=` hoặc `/`.
 */
export default function LoginPage() {
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
      <div className="relative flex min-h-screen flex-col bg-bg-base">
        <div className="flex flex-1 items-center justify-center px-4 py-10 sm:px-6">
          <div className="w-full max-w-[420px]">
            {/* Brand mobile (ẩn khi lg+ vì hero đã có) */}
            <div className="mb-6 flex items-center gap-3 lg:hidden">
              <div className="flex h-10 w-10 items-center justify-center rounded bg-slate-900">
                <span className="font-heading text-base font-bold text-white">
                  CN
                </span>
              </div>
              <div>
                <p className="font-heading text-sm font-bold text-slate-900">
                  Xưởng cơ khí
                </p>
                <p className="text-xs text-slate-500">BOM-centric MES/ERP</p>
              </div>
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
              <h2 className="font-heading text-2xl font-bold text-slate-900">
                Đăng nhập
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Dùng tài khoản nội bộ để vào hệ thống.
              </p>

              <form
                onSubmit={onSubmit}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setPassword("");
                  }
                }}
                className="mt-6 space-y-4"
                noValidate
              >
                <div>
                  <Label
                    htmlFor="username"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
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
                  />
                </div>

                <div>
                  <Label
                    htmlFor="password"
                    className="mb-1.5 block text-sm font-medium text-slate-700"
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
                      className="pr-11"
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
                        "absolute inset-y-0 right-0 inline-flex w-11 items-center justify-center text-slate-500",
                        "focus:outline-none focus-visible:shadow-focus",
                        "hover:text-slate-700",
                      )}
                      tabIndex={0}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <Eye className="h-4 w-4" aria-hidden="true" />
                      )}
                    </button>
                  </div>
                </div>

                <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
                  <Checkbox
                    checked={rememberMe}
                    onCheckedChange={(v) => setRememberMe(v === true)}
                    disabled={loading}
                  />
                  <span>Ghi nhớ đăng nhập (7 ngày)</span>
                </label>

                {error ? (
                  <div
                    role="alert"
                    className="rounded-sm border border-danger bg-danger-soft px-3 py-2 text-sm text-danger-strong"
                  >
                    {error}
                  </div>
                ) : null}

                <Button
                  type="submit"
                  disabled={loading}
                  className="h-12 w-full text-base sm:h-11"
                >
                  {loading ? (
                    <>
                      <Loader2
                        className="h-4 w-4 animate-spin"
                        aria-hidden="true"
                      />
                      Đang xác thực...
                    </>
                  ) : (
                    "Đăng nhập"
                  )}
                </Button>

                <p className="pt-2 text-center text-xs text-slate-500">
                  Quên mật khẩu? Liên hệ IT nội bộ.
                </p>
              </form>
            </div>
          </div>
        </div>

        {/* Build info footer */}
        <div className="shrink-0 px-4 pb-6">
          <BuildInfo />
        </div>
      </div>
    </div>
  );
}
