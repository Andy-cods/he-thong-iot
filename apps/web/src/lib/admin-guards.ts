/**
 * V4.1 AD-12 — admin KHÔNG được tự gỡ vai trò admin của chính mình (tránh khoá
 * quyền quản trị; nếu là admin duy nhất thì hệ thống mất người quản trị).
 * Muốn bỏ quyền admin của 1 người → admin KHÁC thao tác.
 *
 * @returns true nếu thao tác là tự hạ quyền (cần chặn).
 */
export function isSelfAdminDemotion(input: {
  actorUserId: string;
  targetUserId: string;
  beforeRoles: readonly string[];
  nextRoles: readonly string[] | undefined;
}): boolean {
  if (input.actorUserId !== input.targetUserId) return false;
  if (input.nextRoles === undefined) return false; // không đổi vai trò
  return input.beforeRoles.includes("admin") && !input.nextRoles.includes("admin");
}
