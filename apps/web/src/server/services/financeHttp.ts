import { FinSourceError } from "@/lib/finance";
import { jsonError } from "@/server/http";
import type { Session } from "@/server/session";

/**
 * V4.1 Đợt 3 — Tiện ích HTTP dùng chung cho API Tài chính.
 */

/**
 * Q7 — `allowOverdraft` (cho phép chi vượt số dư nguồn) CHỈ có hiệu lực với
 * Giám đốc (admin). Người khác gửi cờ này bị lờ đi (vẫn bị chặn 409).
 */
export function resolveOverdraft(session: Session, requested: boolean | undefined): boolean {
  return requested === true && session.roles.includes("admin");
}

/** Map lỗi nghiệp vụ nguồn tiền → response tiếng Việt; `null` nếu không phải lỗi nguồn. */
export function finSourceErrorResponse(err: unknown) {
  if (err instanceof FinSourceError) {
    return jsonError(err.code, err.message, err.status);
  }
  return null;
}
