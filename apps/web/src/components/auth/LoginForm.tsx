"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, Loader2, LockKeyhole, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";

/**
 * V1.8 LoginForm — form đăng nhập chính.
 *
 * Giữ 100% logic V1:
 *  - POST `/api/auth/login` với `{ username, password, rememberMe }`
 *  - Redirect query `?next=...` (fallback `/bom` — user confirm landing mới)
 *  - 401 sai credentials → message tiếng Việt
 *  - 423 locked → message
 *  - 429 rate-limit → đọc `Retry-After` header → countdown "Thử lại sau X giây"
 *  - Escape clear mật khẩu
 *  - autofocus username, autoComplete đúng chuẩn
 *
 * Server sẽ tự redirect `/admin/settings/force-change-password` ở RSC
 * layout `(app)` nếu `mustChangePassword=true`, nên client chỉ cần
 * `router.push(next)` sau khi login OK.
 */
export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const nextPath = params.get("next") || "/bom";

  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [rememberMe, setRememberMe] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [retryAfter, setRetryAfter] = React.useState<number>(0);
  const usernameRef = React.useRef<HTMLInputElement>(null);
  const passwordRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    usernameRef.current?.focus();
  }, []);

  // Countdown cho rate-limit 429 — decrement mỗi giây.
  React.useEffect(() => {
    if (retryAfter <= 0) return;
    const t = setInterval(() => {
      setRetryAfter((v) => (v > 1 ? v - 1 : 0));
    }, 1000);
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
        // Retry-After header chuẩn RFC 7231: giây (số) hoặc HTTP-date.
        const header = res.headers.get("Retry-After") ?? "";
        const secs = Number.parseInt(header, 10);
        const wait = Number.isFinite(secs) && secs > 0 ? secs : 60;
        setRetryAfter(wait);
        setError(
          `Quá nhiều lần đăng nhập. Thử lại sau ${wait} giây.`,
        );
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
      setError(
        err instanceof Error
          ? err.message
          : "Lỗi kết nối — vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      onKeyDown={(e) => {
        if (e.key === "Escape") setPassword("");
      }}
      className="flex flex-col gap-4"
      noValidate
      aria-describedby={error ? "login-error" : undefined}
    >
      <div>
        <Label
          htmlFor="username"
          className="mb-1.5 block text-xs font-medium text-zinc-700"
        >
          Tài khoản
        </Label>
        <div className="relative">
          <User
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
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
            disabled={disabled}
            size="lg"
            className="pl-9 transition-transform duration-150 focus:scale-[1.005]"
            placeholder="admin"
          />
        </div>
      </div>

      <div>
        <div className="mb-1.5 flex items-center justify-between">
          <Label
            htmlFor="password"
            className="block text-xs font-medium text-zinc-700"
          >
            Mật khẩu
          </Label>
          <span className="text-xs text-zinc-400">Quên? Liên hệ IT nội bộ</span>
        </div>
        <div className="relative">
          <LockKeyhole
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400"
            aria-hidden="true"
          />
          <PasswordInput
            ref={passwordRef}
            id="password"
            name="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={disabled}
            size="lg"
            className="pl-9 transition-transform duration-150 focus:scale-[1.005]"
            placeholder="••••••••"
          />
        </div>
      </div>

      <label className="flex cursor-pointer items-center gap-2 select-none text-sm text-zinc-600">
        <Checkbox
          checked={rememberMe}
          onCheckedChange={(v) => setRememberMe(v === true)}
          disabled={disabled}
          className="h-4 w-4"
        />
        <span>Ghi nhớ đăng nhập (7 ngày)</span>
      </label>

      {error ? (
        <div
          id="login-error"
          role="alert"
          aria-live="polite"
          className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700"
        >
          <AlertCircle
            className="mt-0.5 h-4 w-4 shrink-0"
            aria-hidden="true"
          />
          <div className="flex-1">
            <p>{error}</p>
            {retryAfter > 0 ? (
              <p className="mt-0.5 text-xs text-rose-600">
                Thử lại sau {retryAfter} giây.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <Button
        type="submit"
        disabled={disabled}
        className="mt-1 h-11 w-full bg-indigo-600 text-sm font-medium text-white shadow-sm hover:bg-indigo-700"
      >
        {loading ? (
          <>
            <Loader2
              className="h-4 w-4 animate-spin"
              aria-hidden="true"
            />
            Đang xác thực…
          </>
        ) : retryAfter > 0 ? (
          <>Thử lại sau {retryAfter}s</>
        ) : (
          "Đăng nhập"
        )}
      </Button>
    </form>
  );
}
