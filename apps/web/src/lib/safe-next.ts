/**
 * V4.1 AD-20 — lọc tham số `?next=` của trang đăng nhập (chống open-redirect).
 *
 * Chỉ chấp nhận đường dẫn tương đối CÙNG origin: bắt đầu bằng "/" nhưng không
 * phải "//" hay "/\" (trình duyệt hiểu là URL khác origin), không chứa ký tự
 * điều khiển / khoảng trắng đầu, không trỏ lại /login. Sai → `fallback`.
 */
export function sanitizeNextPath(
  raw: string | null | undefined,
  fallback = "/",
): string {
  if (!raw) return fallback;
  const v = raw.trim();
  if (!v.startsWith("/")) return fallback;
  if (v.startsWith("//") || v.startsWith("/\\")) return fallback;
  // Ký tự điều khiển (tab/xuống dòng bị trình duyệt bỏ qua → "/\t/evil.com").
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(v)) return fallback;
  try {
    const u = new URL(v, "http://same-origin.local");
    if (u.origin !== "http://same-origin.local") return fallback;
    if (u.pathname === "/login" || u.pathname.startsWith("/login/")) return fallback;
    return u.pathname + u.search + u.hash;
  } catch {
    return fallback;
  }
}
