"use client";

/**
 * Force change password — page bắt buộc khi user.must_change_password = true.
 *
 * Layout `(app)` đã redirect vào đây nếu flag set. Sau khi user đổi password
 * thành công, flag sẽ được clear trong changePassword repo → RSC layout
 * render bình thường ở lần load tiếp theo.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle } from "lucide-react";
import { ChangePasswordForm } from "@/components/admin/ChangePasswordForm";

export default function ForceChangePasswordPage() {
  const router = useRouter();

  const handleSuccess = () => {
    // Logout để user login lại với password mới (rõ ràng UX)
    setTimeout(() => {
      void fetch("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => {
          router.push("/login?reason=password-changed");
        });
    }, 1500);
  };

  return (
    <div className="mx-auto flex max-w-xl flex-col gap-5 py-4">
      <header>
        <h1 className="text-xl font-semibold tracking-tight text-zinc-900">
          Bắt buộc đổi mật khẩu
        </h1>
        <p className="mt-0.5 text-xs text-zinc-500">
          Quản trị viên vừa reset mật khẩu tài khoản của bạn. Vui lòng đổi sang
          mật khẩu mới trước khi tiếp tục sử dụng hệ thống.
        </p>
      </header>

      <div className="flex items-start gap-3 rounded-md border border-amber-200 bg-amber-50 p-3">
        <AlertTriangle
          className="mt-0.5 h-4 w-4 shrink-0 text-amber-600"
          aria-hidden="true"
        />
        <div className="text-xs text-amber-900">
          <p className="font-semibold">Lưu ý bảo mật</p>
          <p className="mt-1">
            Nhập mật khẩu tạm thời (do quản trị viên cung cấp) vào ô &quot;Mật
            khẩu hiện tại&quot;, sau đó chọn mật khẩu mới. Tất cả các phiên
            đăng nhập trước đó đã bị thu hồi.
          </p>
        </div>
      </div>

      <div className="rounded-md border border-zinc-200 bg-white p-6">
        <ChangePasswordForm onSuccess={handleSuccess} />
      </div>
    </div>
  );
}
