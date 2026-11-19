import type { NextRequest, NextResponse } from "next/server";
import type { RbacAction, RbacEntity } from "@iot/shared";
import { jsonError } from "./http";
import { requireCan, type Session } from "./session";
import { getDefaultSite, getSiteById, getUserSiteId, type SiteSettings } from "./repos/shiftOutputSetup";

/**
 * V4.10 (TASK-20261118-001) — phạm vi site của Sản lượng ca (PLAN §3).
 *
 *  - admin                      → mọi site
 *  - có dòng user_site          → đúng site đó (workshop + quản lý được gán site)
 *  - workshop KHÔNG có site     → 403 NO_SITE (fail-closed)
 *  - vai khác được grant quyền  → mọi site (quản lý Song Châu xem qua override)
 *
 * Dòng / danh mục của site ngoài phạm vi → 404 (không lộ là có tồn tại).
 * site_id KHÔNG BAO GIỜ lấy thẳng từ body/query: chỉ dùng như "chọn trong phạm vi".
 */
export type ShiftScope = { all: true } | { all: false; siteIds: string[] };

export function scopeAllows(scope: ShiftScope, siteId: string): boolean {
  return scope.all || scope.siteIds.includes(siteId);
}

export async function resolveShiftScope(session: Session): Promise<{ scope: ShiftScope } | { response: NextResponse }> {
  if (session.roles.includes("admin")) return { scope: { all: true } };
  const siteId = await getUserSiteId(session.userId);
  if (siteId) return { scope: { all: false, siteIds: [siteId] } };
  if (session.roles.includes("workshop")) {
    return {
      response: jsonError("NO_SITE", "Tài khoản xưởng chưa được gán xưởng (site). Liên hệ quản trị.", 403),
    };
  }
  return { scope: { all: true } };
}

/** Guard chuẩn cho mọi route /api/shift-output/*: RBAC matrix + phạm vi site. */
export async function requireShiftOutput(
  req: NextRequest,
  action: RbacAction,
  entity: RbacEntity,
): Promise<{ session: Session; scope: ShiftScope } | { response: NextResponse }> {
  const guard = await requireCan(req, action, entity);
  if ("response" in guard) return guard;
  const s = await resolveShiftScope(guard.session);
  if ("response" in s) return s;
  return { session: guard.session, scope: s.scope };
}

export function siteNotFound() {
  return jsonError("SITE_NOT_FOUND", "Không tìm thấy xưởng.", 404);
}

/**
 * Chọn site làm việc: `requested` (nếu thuộc phạm vi) → site của user → site
 * mặc định (user xem mọi site). Ngoài phạm vi / không tồn tại → 404.
 */
export async function pickSite(
  scope: ShiftScope,
  requested?: string | null,
): Promise<{ site: SiteSettings } | { response: NextResponse }> {
  let id: string | null = null;
  if (requested) {
    if (!scopeAllows(scope, requested)) return { response: siteNotFound() };
    id = requested;
  } else if (!scope.all) {
    id = scope.siteIds[0] ?? null;
  }
  const site = id ? await getSiteById(id) : await getDefaultSite();
  if (!site) return { response: siteNotFound() };
  return { site };
}
