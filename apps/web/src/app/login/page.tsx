"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });
      const json = (await res.json()) as
        | { user: { username: string } }
        | { error: { message: string } };

      if (!res.ok || "error" in json) {
        const msg =
          "error" in json ? json.error.message : "Đăng nhập thất bại";
        setError(msg);
        return;
      }
      router.push("/app");
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-3">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm md:p-6">
        <h1 className="text-2xl font-semibold text-slate-900">Đăng nhập</h1>
        <p className="mt-1 text-sm text-slate-600">
          Dùng tài khoản nội bộ để truy cập hệ thống xưởng IoT.
        </p>

        <form onSubmit={onSubmit} className="mt-4 space-y-3" noValidate>
          <div>
            <label
              htmlFor="username"
              className="block text-sm font-medium text-slate-700"
            >
              Tên đăng nhập
            </label>
            <input
              id="username"
              name="username"
              type="text"
              autoComplete="username"
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="mt-1 block h-10 w-full rounded border border-slate-300 px-2 text-base text-slate-900 focus:border-info focus:outline-none focus:ring-0"
            />
          </div>

          <div>
            <label
              htmlFor="password"
              className="block text-sm font-medium text-slate-700"
            >
              Mật khẩu
            </label>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 block h-10 w-full rounded border border-slate-300 px-2 text-base text-slate-900 focus:border-info focus:outline-none focus:ring-0"
            />
          </div>

          {error && (
            <div
              role="alert"
              className="rounded border border-danger bg-danger-soft px-2 py-1.5 text-sm text-danger"
            >
              {error}
            </div>
          )}

          <Button
            type="submit"
            disabled={loading}
            className="w-full"
            data-size="lg"
          >
            {loading ? "Đang đăng nhập…" : "Đăng nhập"}
          </Button>
        </form>

        <p className="mt-3 text-xs text-slate-500">
          Quên mật khẩu? Liên hệ quản trị viên hệ thống.
        </p>
      </div>
    </div>
  );
}
