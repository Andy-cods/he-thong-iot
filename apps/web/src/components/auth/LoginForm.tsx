"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Loader2, LockKeyhole, User } from "lucide-react";

/**
 * V3.2 LoginForm — dark theme matching login hero (cyan accent + glassmorphism).
 *
 * Logic auth giữ 100% V1:
 *  - POST `/api/auth/login`
 *  - Redirect query `?next=...` (fallback `/bom`)
 *  - 401/423/429 handled với countdown Retry-After
 *  - Escape clear mật khẩu
 *  - mustChangePassword check ở RSC layout (app)
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/bom";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [showPassword, setShowPassword] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number>(0);
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (retryAfter <= 0) return;
    const t = setInterval(() => setRetryAfter((v) => (v > 1 ? v - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [retryAfter]);

  const disabled = loading || retryAfter > 0;

  async function onSubmit(e: React.FormEvent) {
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

      if (res.status === 429) {
        const header = res.headers.get("Retry-After") ?? "";
        const secs = Number.parseInt(header, 10);
        const wait = Number.isFinite(secs) && secs > 0 ? secs : 60;
        setRetryAfter(wait);
        setError(`Quá nhiều lần đăng nhập. Thử lại sau ${wait} giây.`);
        setPassword("");
        return;
      }

      const json = (await res.json().catch(() => ({}))) as
        | { user: { username: string } }
        | { error: { message: string } }
        | Record<string, never>;

      if (!res.ok || (typeof json === "object" && "error" in json)) {
        const msg =
          typeof json === "object" && "error" in json
            ? json.error.message
            : res.status === 423
              ? "Tài khoản đang bị khoá tạm thời."
              : "Sai tài khoản hoặc mật khẩu.";
        setError(msg);
        setPassword("");
        passwordRef.current?.focus();
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Lỗi kết nối — vui lòng thử lại.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => { if (e.key === "Escape") setPassword(""); }}
      className="flex flex-col gap-5"
      noValidate
      aria-describedby={error ? "login-error" : undefined}
    >
      {/* Username */}
      <div className="flex flex-col gap-2">
        <label htmlFor="username" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
          Tài khoản
        </label>
        <div className="group relative">
          <User className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-cyan-400" aria-hidden />
          <input
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
            disabled={disabled}
            placeholder="admin"
            className="h-13 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-4 text-base font-medium text-white placeholder:text-zinc-500 backdrop-blur-md transition-all focus:border-cyan-400/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
            style={{ height: "52px" }}
          />
        </div>
      </div>

      {/* Password */}
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <label htmlFor="password" className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
            Mật khẩu
          </label>
          <span className="text-xs text-zinc-500">Quên? Liên hệ IT</span>
        </div>
        <div className="group relative">
          <LockKeyhole className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-zinc-500 transition-colors group-focus-within:text-cyan-400" aria-hidden />
          <input
            ref={passwordRef}
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
            placeholder="••••••••"
            className="h-13 w-full rounded-xl border border-white/10 bg-white/5 pl-11 pr-12 text-base font-medium text-white placeholder:text-zinc-500 backdrop-blur-md transition-all focus:border-cyan-400/50 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/20 disabled:opacity-50"
            style={{ height: "52px" }}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            tabIndex={-1}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-500 transition-colors hover:bg-white/5 hover:text-cyan-400"
            aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
          >
            {showPassword ? <EyeOffIcon /> : <EyeIcon />}
          </button>
        </div>
      </div>

      {/* Remember me */}
      <label className="flex cursor-pointer items-center gap-2.5 select-none text-sm text-zinc-300">
        <span className="relative flex h-4 w-4 items-center justify-center">
          <input
            type="checkbox"
            checked={rememberMe}
            onChange={(e) => setRememberMe(e.target.checked)}
            disabled={disabled}
            className="peer h-4 w-4 cursor-pointer appearance-none rounded border border-white/20 bg-white/5 transition-colors checked:border-cyan-400 checked:bg-cyan-500 disabled:opacity-50"
          />
          <svg
            className="pointer-events-none absolute h-3 w-3 text-white opacity-0 peer-checked:opacity-100"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden
          >
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414L8.414 15a1 1 0 01-1.414 0L3.293 11.293a1 1 0 011.414-1.414L7.707 13l7.586-7.707a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
        </span>
        Ghi nhớ đăng nhập (7 ngày)
      </label>

      {/* Error */}
      {error && (
        <div
          id="login-error"
          role="alert"
          aria-live="polite"
          className="error-box flex items-start gap-2.5 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300 backdrop-blur-md"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" aria-hidden />
          <div className="flex-1">
            <p>{error}</p>
            {retryAfter > 0 && (
              <p className="mt-0.5 text-xs text-red-400/80">
                Thử lại sau {retryAfter} giây.
              </p>
            )}
          </div>
        </div>
      )}

      {/* Submit */}
      <button
        type="submit"
        disabled={disabled}
        style={{ height: "52px" }}
        className="group relative mt-2 flex items-center justify-center gap-2 overflow-hidden rounded-xl bg-gradient-to-r from-indigo-600 via-blue-600 to-cyan-500 text-base font-semibold text-white shadow-lg shadow-indigo-500/40 transition-all hover:shadow-cyan-500/40 hover:scale-[1.01] active:scale-[0.99] disabled:opacity-60 disabled:cursor-not-allowed disabled:hover:scale-100"
      >
        <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden />
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
            Đang xác thực…
          </>
        ) : retryAfter > 0 ? (
          <>Thử lại sau {retryAfter}s</>
        ) : (
          <>
            Đăng nhập
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
          </>
        )}
      </button>

      <style jsx>{`
        .error-box {
          animation: error-shake 0.4s cubic-bezier(0.36, 0.07, 0.19, 0.97);
        }
        @keyframes error-shake {
          0%, 100% { transform: translateX(0); }
          20%, 60% { transform: translateX(-4px); }
          40%, 80% { transform: translateX(4px); }
        }
      `}</style>
    </form>
  );
}

function EyeIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
      <path d="M2 10s2.5-5 8-5 8 5 8 5-2.5 5-8 5-8-5-8-5z" />
      <circle cx="10" cy="10" r="2.5" />
    </svg>
  );
}

function EyeOffIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 3l14 14M8.5 6.5C9 6.4 9.5 6.3 10 6.3c5.5 0 8 4.7 8 4.7s-.7 1.3-2 2.6M6 8c-1.7 1.3-3 3-3 3s2.5 5 8 5c1.5 0 2.8-.4 4-1" />
      <path d="M11.5 11.5a2 2 0 11-3-3" />
    </svg>
  );
}
