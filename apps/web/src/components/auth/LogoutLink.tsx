"use client";

/**
 * Nút đăng xuất tối giản (khung đổi mật khẩu bắt buộc — không có AppShell).
 * Không có route /logout: đăng xuất = POST /api/auth/logout rồi tải hẳn /login.
 */
export function LogoutLink() {
  return (
    <button
      type="button"
      onClick={async () => {
        await fetch("/api/auth/logout", { method: "POST" }).catch(() => {});
        window.location.assign("/login");
      }}
      className="inline-flex min-h-11 items-center rounded-lg px-3 text-sm font-medium text-blue-600 hover:bg-blue-600/10 dark:text-blue-400"
    >
      Đăng xuất
    </button>
  );
}
