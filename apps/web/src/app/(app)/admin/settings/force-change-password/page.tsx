import { redirect } from "next/navigation";

/**
 * V4.1 AD-01 — Trang đổi mật khẩu bắt buộc đã chuyển sang `/me/change-password`.
 *
 * Trước đây nằm dưới `/admin` nên user KHÔNG phải admin bị reset mật khẩu kẹt
 * vòng: (app) layout đẩy vào đây → admin layout đẩy về `/` → (app) layout lại
 * đẩy vào đây… Giữ file này để link/bookmark cũ vẫn chạy (chỉ admin tới được).
 */
export default function LegacyForceChangePasswordRedirect() {
  redirect("/me/change-password");
}
