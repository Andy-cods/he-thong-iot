/**
 * Ghép password vào DSN Postgres một cách an toàn bằng URL constructor.
 *
 * - Nếu DSN gốc đã có `user:pwd@host` (dev local) -> giữ nguyên, không ghi đè.
 * - Nếu DSN gốc chỉ có `user@host` và có password -> set qua `URL.password`
 *   setter, tự động percent-encode mọi ký tự đặc biệt (`@`, `:`, `/`, `!`,
 *   `$`, space, `#`...).
 * - Nếu không có password, trả về raw DSN.
 * - Throw error tiếng Việt nếu DSN không hợp lệ.
 *
 * Lý do viết tay thay vì regex: guard cũ `!raw.includes(":")` luôn false vì
 * DSN Postgres mặc định đã chứa `:` ở scheme và port, khiến nhánh inject
 * password không bao giờ chạy.
 */
export function buildDsn(raw: string, password: string | undefined): string {
  if (!password) return raw;
  let u: URL;
  try {
    u = new URL(raw);
  } catch (err) {
    throw new Error(
      `DATABASE_URL không phải URL hợp lệ: ${(err as Error).message}`,
    );
  }
  // Nếu DSN gốc đã có password (dev local hoặc .env manual), tôn trọng giá trị cũ.
  if (u.password) return raw;
  u.password = password; // URL setter tự percent-encode
  return u.toString();
}
